"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { AudioEngine, INSTRUMENTS } from "@/lib/audio";
import { drawHands, makeProjector, type Ripple, type TrackedHand } from "@/lib/draw";
import { createHandTracker, describeCameraError, type CameraError } from "@/lib/handTracker";
import {
  FINGERS,
  FINGER_TIP,
  INDEX_MCP,
  KEY_COUNT,
  NOTE_COLORS,
  THUMB_TIP,
  TONICS,
  WRIST,
  getScale,
  getSlots,
  labelFor,
  labelText,
  scaleFrequencies,
  slotIndex,
  type HandSide,
} from "@/lib/music";
import { emptyPinches, pinchRatio, proximity, resolvePinches, type FingerMap } from "@/lib/pinch";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "@/lib/settings";
import Keyboard from "./Keyboard";
import NoteName from "./NoteName";
import Onboarding, { type CameraStatus } from "./Onboarding";
import SettingsPanel from "./SettingsPanel";
import { ExpandIcon, HandsOnlyIcon, HelpIcon, MirrorIcon, ShrinkIcon, SlidersIcon } from "./icons";
import styles from "./Gesturio.module.css";

// A hand can drop out for a frame or two; hold its notes this long before letting go.
const GRACE_MS = 160;
const TAPE_LENGTH = 10;
const SIDES: HandSide[] = ["Left", "Right"];
const KEY_CODES = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL", "Semicolon"];
const NO_KEYS: boolean[] = Array(KEY_COUNT).fill(false);

function codeToIndex(code: string): number {
  const index = KEY_CODES.indexOf(code);
  if (index >= 0) return index;
  const digit = /^Digit([1-8])$/.exec(code);
  return digit ? Number(digit[1]) - 1 : -1;
}

interface TapeEntry {
  id: number;
  index: number;
}

export default function Gesturio() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [screen, setScreen] = useState<"intro" | "play">("intro");
  const [input, setInput] = useState<"camera" | "manual" | null>(null);
  const [camera, setCamera] = useState<CameraStatus>("idle");
  const [error, setError] = useState<CameraError | null>(null);
  const [audioReady, setAudioReady] = useState(false);
  const [active, setActive] = useState<boolean[]>(NO_KEYS);
  const [readout, setReadout] = useState<number[]>([]);
  const [tape, setTape] = useState<TapeEntry[]>([]);
  const [handsSeen, setHandsSeen] = useState({ Left: false, Right: false });
  const [panelOpen, setPanelOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fpsRef = useRef<HTMLSpanElement>(null);
  const keyEls = useRef<Array<HTMLButtonElement | null>>([]);
  const engineRef = useRef<AudioEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<Promise<HandLandmarker> | null>(null);
  const holdsRef = useRef<Array<Set<string>>>(
    Array.from({ length: KEY_COUNT }, () => new Set<string>()),
  );
  const tapeId = useRef(0);
  const mounted = useRef(true);

  const scale = getScale(settings.scaleId);
  const slots = useMemo(() => getSlots(settings.layout), [settings.layout]);
  const labels = useMemo(
    () => scale.steps.map((step) => labelFor(step, settings.notation, settings.tonic)),
    [scale, settings.notation, settings.tonic],
  );
  const freqs = useMemo(() => scaleFrequencies(scale, settings.tonic), [scale, settings.tonic]);

  // The tracking loop runs outside React's render cycle and reads these.
  const live = useRef({ settings, slots, labels, freqs });
  useEffect(() => {
    live.current = { settings, slots, labels, freqs };
  }, [settings, slots, labels, freqs]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  /* ---------- notes ---------- */

  const press = useCallback((index: number, source: string) => {
    const holds = holdsRef.current[index];
    if (holds.has(source)) return;
    holds.add(source);
    if (holds.size > 1) return;
    engineRef.current?.noteOn(index, live.current.freqs[index]);
    setActive((previous) => previous.map((on, i) => (i === index ? true : on)));
    setTape((previous) => [
      ...previous.slice(1 - TAPE_LENGTH),
      { id: tapeId.current++, index },
    ]);
  }, []);

  const release = useCallback((index: number, source: string) => {
    const holds = holdsRef.current[index];
    if (!holds.delete(source) || holds.size > 0) return;
    engineRef.current?.noteOff(index);
    setActive((previous) => previous.map((on, i) => (i === index ? false : on)));
  }, []);

  const releaseSource = useCallback(
    (source: string) => {
      for (let index = 0; index < KEY_COUNT; index++) release(index, source);
    },
    [release],
  );

  const releaseAll = useCallback(() => {
    for (const holds of holdsRef.current) holds.clear();
    engineRef.current?.allOff();
    setActive(NO_KEYS);
  }, []);

  useEffect(() => {
    if (active.some(Boolean)) setReadout(active.flatMap((on, index) => (on ? [index] : [])));
  }, [active]);

  /* ---------- audio ---------- */

  const ensureAudio = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new AudioEngine();
      setAudioReady(true);
    }
    void engineRef.current.resume();
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setVolume(settings.volume);
    engine.setReverb(settings.reverb);
    engine.setDrone(settings.drone, freqs[0]);
  }, [audioReady, settings.volume, settings.reverb, settings.drone, freqs]);

  // A held note would keep its old pitch or timbre, so start clean.
  useEffect(() => {
    releaseAll();
    if (engineRef.current) engineRef.current.instrument = settings.instrument;
  }, [audioReady, settings.instrument, freqs, releaseAll]);

  /* ---------- camera ---------- */

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    ensureAudio();

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError({
        title: "The camera needs a secure page",
        body: "Open Gesturio over https or on localhost, or play with your keyboard instead.",
      });
      return;
    }

    setCamera("requesting");
    // Fetch the model while the permission prompt is still on screen.
    trackerRef.current ??= createHandTracker();
    trackerRef.current.catch(() => {
      trackerRef.current = null;
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (!mounted.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      setCamera("loading");
      await trackerRef.current;
      if (!mounted.current) return;

      setCamera("live");
      setInput("camera");
      setScreen("play");
    } catch (cause) {
      stopStream();
      setCamera("idle");
      setError(describeCameraError(cause));
      setScreen("intro");
    }
  }, [ensureAudio, stopStream]);

  const stopCamera = useCallback(() => {
    stopStream();
    setCamera("idle");
    setInput("manual");
  }, [stopStream]);

  const startManual = useCallback(() => {
    setError(null);
    ensureAudio();
    setInput("manual");
    setScreen("play");
  }, [ensureAudio]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopStream();
      void trackerRef.current?.then((tracker) => tracker.close()).catch(() => {});
      trackerRef.current = null;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [stopStream]);

  /* ---------- hand tracking loop ---------- */

  useEffect(() => {
    if (camera !== "live") return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const trackerPromise = trackerRef.current;
    if (!video || !canvas || !context || !trackerPromise) return;

    const font = getComputedStyle(canvas).fontFamily;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pinches: Record<HandSide, FingerMap<boolean>> = {
      Left: emptyPinches(),
      Right: emptyPinches(),
    };
    const lastSeen: Record<HandSide, number> = { Left: -Infinity, Right: -Infinity };
    const seen = { Left: false, Right: false };
    const shownProximity: number[] = Array(KEY_COUNT).fill(0);
    const ripples: Ripple[] = [];
    let held = new Set<number>();
    let hands: TrackedHand[] = [];
    // The model labels hands as if the image were already mirrored, so start by
    // assuming its labels are swapped, then confirm whenever both hands are
    // visible and their positions settle the question.
    let swapVotes = 6;
    let lastVideoTime = -1;
    let frames = 0;
    let fpsSince = performance.now();
    let tracker: HandLandmarker | null = null;
    let raf = 0;
    let cancelled = false;

    const detect = (now: number) => {
      if (!tracker) return;
      const { settings: current, slots: currentSlots, labels: currentLabels } = live.current;
      const result = tracker.detectForVideo(video, now);
      const aspect = video.videoWidth / video.videoHeight;
      const project = makeProjector({
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });

      const reported = result.landmarks.map(
        (_, i) => result.handedness[i]?.[0]?.categoryName as HandSide | undefined,
      );
      let sides: HandSide[];
      if (result.landmarks.length >= 2) {
        // The raw frame isn't mirrored, so the user's right hand is on its left.
        const firstIsRight = result.landmarks[0][WRIST].x < result.landmarks[1][WRIST].x;
        sides = firstIsRight ? ["Right", "Left"] : ["Left", "Right"];
        sides.forEach((side, i) => {
          if (!reported[i]) return;
          swapVotes = Math.max(-40, Math.min(40, swapVotes + (reported[i] === side ? -1 : 1)));
        });
      } else {
        sides = reported.map((label) => {
          const side = label ?? "Right";
          if (swapVotes <= 0) return side;
          return side === "Left" ? "Right" : "Left";
        });
      }

      const nextProximity: number[] = Array(KEY_COUNT).fill(0);
      const pinchPoints = new Map<number, { x: number; y: number }>();
      const visible = new Set<HandSide>();

      hands = result.landmarks.slice(0, 2).map((landmarks, i) => {
        const side = sides[i];
        visible.add(side);
        lastSeen[side] = now;

        const ratios = {} as FingerMap<number>;
        for (const finger of FINGERS) {
          ratios[finger] = pinchRatio(
            landmarks[THUMB_TIP],
            landmarks[FINGER_TIP[finger]],
            landmarks[WRIST],
            landmarks[INDEX_MCP],
            aspect,
          );
        }
        pinches[side] = resolvePinches(ratios, pinches[side], current.sensitivity);

        return {
          side,
          landmarks,
          fingers: FINGERS.map((finger) => {
            const key = slotIndex(currentSlots, side, finger);
            const near = proximity(ratios[finger], current.sensitivity);
            nextProximity[key] = near;
            if (pinches[side][finger]) {
              const thumb = project(landmarks[THUMB_TIP]);
              const tip = project(landmarks[FINGER_TIP[finger]]);
              pinchPoints.set(key, { x: (thumb.x + tip.x) / 2, y: (thumb.y + tip.y) / 2 });
            }
            return {
              finger,
              color: NOTE_COLORS[key],
              label: labelText(currentLabels[key]),
              proximity: near,
              pinched: pinches[side][finger],
            };
          }),
        };
      });

      const nextHeld = new Set<number>();
      for (const side of SIDES) {
        const present = visible.has(side) || now - lastSeen[side] < GRACE_MS;
        if (!present) pinches[side] = emptyPinches();
        for (const finger of FINGERS) {
          if (pinches[side][finger]) nextHeld.add(slotIndex(currentSlots, side, finger));
        }
        if (seen[side] !== present) {
          seen[side] = present;
          setHandsSeen({ ...seen });
        }
      }

      for (const key of nextHeld) {
        if (held.has(key)) continue;
        press(key, "hand");
        const point = pinchPoints.get(key);
        if (point) ripples.push({ ...point, color: NOTE_COLORS[key], born: now });
      }
      for (const key of held) {
        if (!nextHeld.has(key)) release(key, "hand");
      }
      held = nextHeld;

      nextProximity.forEach((value, key) => {
        if (Math.abs(value - shownProximity[key]) < 0.01) return;
        shownProximity[key] = value;
        keyEls.current[key]?.style.setProperty("--prox", value.toFixed(2));
      });

      frames++;
      if (now - fpsSince >= 1000) {
        if (fpsRef.current) {
          const fps = Math.round((frames * 1000) / (now - fpsSince));
          fpsRef.current.textContent = `${fps} fps`;
        }
        frames = 0;
        fpsSince = now;
      }
    };

    const loop = () => {
      if (cancelled) return;
      raf = requestAnimationFrame(loop);
      const now = performance.now();

      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(canvas.clientWidth * ratio);
      const height = Math.round(canvas.clientHeight * ratio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      if (video.readyState >= 2 && video.videoWidth > 0 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        detect(now);
      }

      drawHands(
        context,
        {
          width: canvas.clientWidth,
          height: canvas.clientHeight,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
        },
        hands,
        ripples,
        now,
        { labels: live.current.settings.labels, font, reducedMotion },
      );
    };

    void trackerPromise.then((ready) => {
      if (cancelled) return;
      tracker = ready;
      loop();
    });

    const keys = keyEls.current;
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      for (const key of held) release(key, "hand");
      for (const element of keys) element?.style.removeProperty("--prox");
      setHandsSeen({ Left: false, Right: false });
    };
  }, [camera, press, release]);

  /* ---------- keyboard, focus, fullscreen ---------- */

  useEffect(() => {
    if (screen !== "play") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanelOpen(false);
        return;
      }
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof Element && event.target.closest("input, select, textarea")) return;
      const index = codeToIndex(event.code);
      if (index < 0) return;
      event.preventDefault();
      press(index, "key");
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const index = codeToIndex(event.code);
      if (index >= 0) release(index, "key");
    };
    const onBlur = () => releaseSource("key");

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      releaseSource("key");
    };
  }, [screen, press, release, releaseSource]);

  useEffect(() => {
    // Animation frames stop in a hidden tab, which would leave notes hanging.
    const onVisibility = () => {
      if (document.hidden) releaseAll();
    };
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [releaseAll]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const registerKey = useCallback((index: number, element: HTMLButtonElement | null) => {
    keyEls.current[index] = element;
  }, []);

  /* ---------- render ---------- */

  const playing = active.flatMap((on, index) => (on ? [index] : []));
  const cameraLive = camera === "live";
  const cameraBusy = camera === "requesting" || camera === "loading";
  const instrument = INSTRUMENTS.find((item) => item.id === settings.instrument) ?? INSTRUMENTS[0];

  let status: { tone: "live" | "wait" | "idle"; text: string };
  if (camera === "requesting") status = { tone: "wait", text: "Waiting for camera…" };
  else if (camera === "loading") status = { tone: "wait", text: "Loading hand model…" };
  else if (playing.length > 0)
    status = {
      tone: "live",
      text: `Playing ${playing.map((index) => labelText(labels[index])).join(" · ")}`,
    };
  else if (input !== "camera") status = { tone: "idle", text: "Keyboard mode · press A to ;" };
  else if (handsSeen.Left || handsSeen.Right)
    status = { tone: "live", text: "Pinch thumb to a finger" };
  else status = { tone: "wait", text: "Show your hands to the camera" };

  return (
    <main className={styles.stage}>
      <video
        ref={videoRef}
        className={styles.video}
        data-show={(cameraLive && settings.view === "mirror") || undefined}
        playsInline
        muted
        aria-hidden="true"
      />
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />

      <div className={styles.ui} inert={screen === "intro"}>
        <header className={styles.bar}>
          <div className={styles.brand}>
            <span className={styles.brandName}>Gesturio</span>
            <span className={styles.brandTag}>air instrument</span>
          </div>

          <div className={styles.status} data-tone={status.tone} aria-hidden="true">
            <span className={styles.dot} />
            {status.text}
            {cameraLive && <span ref={fpsRef} className={styles.fps} />}
          </div>
          <p className={styles.srOnly} role="status">
            {playing.length > 0 ? "" : status.text}
          </p>

          <div className={styles.actions}>
            <button
              className={styles.preset}
              onClick={() => setPanelOpen(true)}
              aria-label={`Settings. ${scale.name} in ${TONICS[settings.tonic]}, ${instrument.name}`}
            >
              <SlidersIcon />
              <span>
                {scale.name} · {TONICS[settings.tonic]} · {instrument.name}
              </span>
            </button>
            {cameraLive && (
              <button
                className={styles.iconButton}
                onClick={() => update({ view: settings.view === "mirror" ? "hands" : "mirror" })}
                aria-label={settings.view === "mirror" ? "Hide camera image" : "Show camera image"}
                title={settings.view === "mirror" ? "Hide camera image" : "Show camera image"}
              >
                {settings.view === "mirror" ? <MirrorIcon /> : <HandsOnlyIcon />}
              </button>
            )}
            <button
              className={styles.iconButton}
              onClick={() => setScreen("intro")}
              aria-label="How to play"
              title="How to play"
            >
              <HelpIcon />
            </button>
            <button
              className={`${styles.iconButton} ${styles.fullscreen}`}
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {fullscreen ? <ShrinkIcon /> : <ExpandIcon />}
            </button>
          </div>
        </header>

        <div
          className={styles.readout}
          data-on={playing.length > 0 || undefined}
          style={{ "--count": Math.max(1, readout.length) } as CSSProperties}
          aria-hidden="true"
        >
          {readout.map((index) => (
            <span key={index} style={{ color: NOTE_COLORS[index] }}>
              <NoteName label={labels[index]} />
            </span>
          ))}
        </div>

        <div className={styles.tape} aria-hidden="true">
          {tape.map((entry, position) => (
            <span
              key={entry.id}
              style={{
                color: NOTE_COLORS[entry.index],
                opacity: 0.2 + (0.8 * (position + 1)) / tape.length,
              }}
            >
              <NoteName label={labels[entry.index]} />
            </span>
          ))}
        </div>

        <Keyboard
          slots={slots}
          labels={labels}
          active={active}
          handsSeen={handsSeen}
          tracking={cameraLive}
          registerKey={registerKey}
          onPress={press}
          onRelease={release}
        />
      </div>

      <SettingsPanel
        open={panelOpen && screen === "play"}
        settings={settings}
        cameraOn={cameraLive}
        cameraBusy={cameraBusy}
        onChange={update}
        onToggleCamera={cameraLive ? stopCamera : startCamera}
        onReset={() => update(DEFAULT_SETTINGS)}
        onClose={() => setPanelOpen(false)}
      />

      {screen === "intro" && (
        <Onboarding
          camera={camera}
          error={error}
          resumable={input !== null}
          slots={slots}
          labels={labels}
          onStartCamera={startCamera}
          onStartManual={startManual}
          onResume={() => setScreen("play")}
        />
      )}
    </main>
  );
}

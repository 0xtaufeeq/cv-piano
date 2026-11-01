import type { CameraError } from "@/lib/handTracker";
import type { HandSide, KeySlot, NoteLabel } from "@/lib/music";
import HandDiagram from "./HandDiagram";
import { ArrowIcon } from "./icons";
import styles from "./Onboarding.module.css";

export type CameraStatus = "idle" | "requesting" | "loading" | "live";

interface Props {
  camera: CameraStatus;
  error: CameraError | null;
  /** True when reopened from the help button mid-session. */
  resumable: boolean;
  slots: KeySlot[];
  labels: NoteLabel[];
  onStartCamera: () => void;
  onStartManual: () => void;
  onResume: () => void;
}

const BUSY_TEXT: Partial<Record<CameraStatus, string>> = {
  requesting: "Waiting for camera…",
  loading: "Loading hand model…",
};

const SIDES: HandSide[] = ["Left", "Right"];

export default function Onboarding({
  camera,
  error,
  resumable,
  slots,
  labels,
  onStartCamera,
  onStartManual,
  onResume,
}: Props) {
  const busy = camera === "requesting" || camera === "loading";

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <div className={styles.sheet}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Gesturio · air instrument</p>
          <h1 id="intro-title" className={styles.title}>
            Play the <em>air.</em>
          </h1>
          <p className={styles.lede}>
            Your webcam follows your hands. Touch your thumb to a fingertip and that finger sings
            its note. Eight fingers, one full octave.
          </p>

          <ol className={styles.steps}>
            <li>
              <span>1</span>
              Sit back until both hands fit in the frame, palms facing the screen.
            </li>
            <li>
              <span>2</span>
              Pinch thumb to finger to play. Hold the pinch to sustain the note.
            </li>
            <li>
              <span>3</span>
              Watch the ring on each fingertip. It closes as you get near.
            </li>
          </ol>

          {error && (
            <div className={styles.error} role="alert">
              <strong>{error.title}</strong>
              <p>{error.body}</p>
            </div>
          )}

          <div className={styles.actions}>
            {resumable && camera === "live" ? (
              <button className={styles.primary} onClick={onResume} autoFocus>
                Back to playing
                <ArrowIcon />
              </button>
            ) : (
              <>
                <button
                  className={styles.primary}
                  onClick={onStartCamera}
                  disabled={busy}
                  autoFocus
                >
                  {busy && <span className={styles.spinner} aria-hidden="true" />}
                  {BUSY_TEXT[camera] ?? (error ? "Try the camera again" : "Start with camera")}
                  {!busy && <ArrowIcon />}
                </button>
                <button
                  className={styles.secondary}
                  onClick={resumable ? onResume : onStartManual}
                  disabled={busy}
                >
                  {resumable ? "Keep using keyboard" : "Use keyboard instead"}
                </button>
              </>
            )}
          </div>

          <p className={styles.privacy}>Video is processed on this device and never uploaded.</p>
        </div>

        <div className={styles.map} aria-label="Which finger plays which note">
          {SIDES.map((side) => (
            <HandDiagram key={side} side={side} slots={slots} labels={labels} />
          ))}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { INSTRUMENTS } from "@/lib/audio";
import { SCALES, TONICS, labelFor, labelText, type Layout, type Notation } from "@/lib/music";
import type { Settings, View } from "@/lib/settings";
import { CloseIcon } from "./icons";
import styles from "./SettingsPanel.module.css";

interface Props {
  open: boolean;
  settings: Settings;
  cameraOn: boolean;
  cameraBusy: boolean;
  onChange: (patch: Partial<Settings>) => void;
  onToggleCamera: () => void;
  onReset: () => void;
  onClose: () => void;
}

interface Option<T> {
  value: T;
  label: string;
  hint?: string;
}

const NOTATIONS: Option<Notation>[] = [
  { value: "sargam", label: "Sargam", hint: "Sa Re Ga" },
  { value: "solfege", label: "Solfège", hint: "Do Re Mi" },
  { value: "letters", label: "Letters", hint: "C D E" },
];

const LAYOUTS: Option<Layout>[] = [
  { value: "piano", label: "Piano", hint: "Low notes on the left hand" },
  { value: "classic", label: "Classic", hint: "Index first, right hand low" },
];

const VIEWS: Option<View>[] = [
  { value: "mirror", label: "Mirror", hint: "See yourself" },
  { value: "hands", label: "Hands only", hint: "Skeleton on black" },
];

function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={name}>
      {options.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={option.value === value}
          className={styles.segment}
          onClick={() => onChange(option.value)}
        >
          <span>{option.label}</span>
          {option.hint && <small>{option.hint}</small>}
        </button>
      ))}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className={styles.slider}>
      <span className={styles.sliderHead}>
        {label}
        <output>{display}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      className={styles.toggle}
      onClick={() => onChange(!checked)}
    >
      <span>
        {label}
        <small>{hint}</small>
      </span>
      <span className={styles.track} aria-hidden="true" />
    </button>
  );
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export default function SettingsPanel({
  open,
  settings,
  cameraOn,
  cameraBusy,
  onChange,
  onToggleCamera,
  onReset,
  onClose,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // The panel is still off-screen when it opens; don't let focus scroll the stage to it.
    if (open) closeRef.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <>
      <div className={styles.scrim} data-open={open || undefined} onClick={onClose} />
      <aside
        className={styles.panel}
        data-open={open || undefined}
        role="dialog"
        aria-label="Settings"
        inert={!open}
      >
        <header className={styles.head}>
          <h2>Tune it</h2>
          <button ref={closeRef} className={styles.close} onClick={onClose} aria-label="Close settings">
            <CloseIcon />
          </button>
        </header>

        <div className={styles.body}>
          <section>
            <h3>Voice</h3>
            <div className={styles.instruments} role="radiogroup" aria-label="Instrument">
              {INSTRUMENTS.map((instrument) => (
                <button
                  key={instrument.id}
                  role="radio"
                  aria-checked={settings.instrument === instrument.id}
                  className={styles.instrument}
                  onClick={() => onChange({ instrument: instrument.id })}
                >
                  <span>{instrument.name}</span>
                  <small>{instrument.hint}</small>
                </button>
              ))}
            </div>
            <Slider
              label="Volume"
              value={settings.volume}
              min={0}
              max={1}
              step={0.01}
              display={percent(settings.volume)}
              onChange={(volume) => onChange({ volume })}
            />
            <Slider
              label="Room"
              value={settings.reverb}
              min={0}
              max={1}
              step={0.01}
              display={percent(settings.reverb)}
              onChange={(reverb) => onChange({ reverb })}
            />
            <Toggle
              label="Tanpura drone"
              hint="A steady Sa and Pa underneath"
              checked={settings.drone}
              onChange={(drone) => onChange({ drone })}
            />
          </section>

          <section>
            <h3>Notes</h3>
            <Segmented
              name="Note names"
              value={settings.notation}
              options={NOTATIONS}
              onChange={(notation) => onChange({ notation })}
            />

            <h4>Tonic</h4>
            <div className={styles.tonics} role="radiogroup" aria-label="Tonic">
              {TONICS.map((name, index) => (
                <button
                  key={name}
                  role="radio"
                  aria-checked={settings.tonic === index}
                  className={styles.tonic}
                  onClick={() => onChange({ tonic: index })}
                >
                  {name}
                </button>
              ))}
            </div>

            <h4>Scale</h4>
            <div className={styles.scales} role="radiogroup" aria-label="Scale">
              {SCALES.map((scale) => (
                <button
                  key={scale.id}
                  role="radio"
                  aria-checked={settings.scaleId === scale.id}
                  className={styles.scale}
                  onClick={() => onChange({ scaleId: scale.id })}
                >
                  <span className={styles.scaleName}>
                    {scale.name}
                    <small>{scale.western}</small>
                  </span>
                  <span className={styles.scaleNotes}>
                    {scale.steps
                      .map((step) => labelText(labelFor(step, settings.notation, settings.tonic)))
                      .join(" ")}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>Hands</h3>
            <Segmented
              name="Finger layout"
              value={settings.layout}
              options={LAYOUTS}
              onChange={(layout) => onChange({ layout })}
            />
            <Slider
              label="Pinch sensitivity"
              value={settings.sensitivity}
              min={0.7}
              max={1.4}
              step={0.05}
              display={
                settings.sensitivity < 0.95 ? "Firm" : settings.sensitivity > 1.1 ? "Light" : "Normal"
              }
              onChange={(sensitivity) => onChange({ sensitivity })}
            />
            <h4>Stage</h4>
            <Segmented
              name="Camera view"
              value={settings.view}
              options={VIEWS}
              onChange={(view) => onChange({ view })}
            />
            <Toggle
              label="Fingertip labels"
              hint="Show note names on your fingers"
              checked={settings.labels}
              onChange={(labels) => onChange({ labels })}
            />
            <button className={styles.action} onClick={onToggleCamera} disabled={cameraBusy}>
              {cameraBusy ? "Starting camera…" : cameraOn ? "Turn camera off" : "Turn camera on"}
            </button>
          </section>

          <button className={styles.reset} onClick={onReset}>
            Reset to defaults
          </button>
        </div>
      </aside>
    </>
  );
}

import type { CSSProperties } from "react";
import {
  FINGER_NAMES,
  NOTE_COLORS,
  labelText,
  type HandSide,
  type KeySlot,
  type NoteLabel,
} from "@/lib/music";
import NoteName from "./NoteName";
import styles from "./Keyboard.module.css";

interface Props {
  slots: KeySlot[];
  labels: NoteLabel[];
  active: boolean[];
  handsSeen: Record<HandSide, boolean>;
  /** Hand presence dots only mean something while the camera is tracking. */
  tracking: boolean;
  registerKey: (index: number, element: HTMLButtonElement | null) => void;
  onPress: (index: number, source: string) => void;
  onRelease: (index: number, source: string) => void;
}

export default function Keyboard({
  slots,
  labels,
  active,
  handsSeen,
  tracking,
  registerKey,
  onPress,
  onRelease,
}: Props) {
  const groups = [slots.slice(0, 4), slots.slice(4)];

  return (
    <div className={styles.keyboard}>
      {groups.map((group) => {
        const hand = group[0].hand;
        return (
          <section key={hand} className={styles.group} aria-label={`${hand} hand notes`}>
            <header className={styles.groupHead}>
              {tracking && (
                <span
                  className={styles.presence}
                  data-on={handsSeen[hand] || undefined}
                  title={handsSeen[hand] ? `${hand} hand tracked` : `${hand} hand not in view`}
                />
              )}
              {hand} hand
            </header>
            <div className={styles.row}>
              {group.map((slot) => {
                const label = labels[slot.index];
                return (
                  <button
                    key={slot.index}
                    ref={(element) => registerKey(slot.index, element)}
                    className={styles.key}
                    style={{ "--hue": NOTE_COLORS[slot.index] } as CSSProperties}
                    data-active={active[slot.index] || undefined}
                    aria-pressed={active[slot.index]}
                    aria-label={`${labelText(label)}, ${hand} ${slot.finger} finger, key ${slot.shortcut}`}
                    onPointerDown={(event) => {
                      onPress(slot.index, "pointer");
                      // Keeps the note held if the finger slides off the key.
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerUp={() => onRelease(slot.index, "pointer")}
                    onPointerCancel={() => onRelease(slot.index, "pointer")}
                    onLostPointerCapture={() => onRelease(slot.index, "pointer")}
                    onKeyDown={(event) => {
                      if ((event.key === " " || event.key === "Enter") && !event.repeat) {
                        event.preventDefault();
                        onPress(slot.index, "focus");
                      }
                    }}
                    onKeyUp={(event) => {
                      if (event.key === " " || event.key === "Enter") onRelease(slot.index, "focus");
                    }}
                    onBlur={() => onRelease(slot.index, "focus")}
                    onContextMenu={(event) => event.preventDefault()}
                  >
                    <span className={styles.beam} aria-hidden="true" />
                    <span className={styles.face}>
                      <span className={styles.meter} aria-hidden="true" />
                      <span className={styles.name}>
                        <NoteName label={label} />
                      </span>
                      <span className={styles.finger}>
                        <span className={styles.fingerFull}>{FINGER_NAMES[slot.finger]}</span>
                        <span className={styles.fingerShort}>{FINGER_NAMES[slot.finger][0]}</span>
                      </span>
                      <kbd className={styles.kbd}>{slot.shortcut}</kbd>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

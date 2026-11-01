import { NOTE_COLORS, labelText, type Finger, type HandSide, type KeySlot, type NoteLabel } from "@/lib/music";
import styles from "./HandDiagram.module.css";

// A left hand as the mirror shows it: palm out, thumb towards the centre.
const FINGER_SHAPES: Record<Finger, { x: number; top: number }> = {
  pinky: { x: 26, top: 66 },
  ring: { x: 52, top: 44 },
  middle: { x: 78, top: 34 },
  index: { x: 104, top: 46 },
};
const WIDTH = 176;
const KNUCKLE_Y = 118;

interface Props {
  side: HandSide;
  slots: KeySlot[];
  labels: NoteLabel[];
}

export default function HandDiagram({ side, slots, labels }: Props) {
  const flip = (x: number) => (side === "Left" ? x : WIDTH - x);
  const fingers = slots.filter((slot) => slot.hand === side);

  return (
    <figure className={styles.hand}>
      <svg viewBox={`0 0 ${WIDTH} 200`} role="img" aria-label={`${side} hand finger map`}>
        <g className={styles.shape}>
          <rect x={flip(65) - 53} y={112} width={106} height={70} rx={26} />
          <path d={`M${flip(116)} 152 L${flip(154)} 108`} className={styles.digit} />
          {fingers.map((slot) => {
            const shape = FINGER_SHAPES[slot.finger];
            return (
              <path
                key={slot.finger}
                d={`M${flip(shape.x)} ${KNUCKLE_Y} L${flip(shape.x)} ${shape.top}`}
                className={styles.digit}
              />
            );
          })}
        </g>
        <circle cx={flip(154)} cy={108} r={5} className={styles.thumb} />
        {fingers.map((slot) => {
          const shape = FINGER_SHAPES[slot.finger];
          return (
            <g key={slot.finger}>
              <circle cx={flip(shape.x)} cy={shape.top} r={6} fill={NOTE_COLORS[slot.index]} />
              <text
                x={flip(shape.x)}
                y={shape.top - 16}
                textAnchor="middle"
                className={styles.label}
                fill={NOTE_COLORS[slot.index]}
              >
                {labelText(labels[slot.index])}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>{side} hand</figcaption>
    </figure>
  );
}

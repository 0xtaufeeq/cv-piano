import { labelText, type NoteLabel } from "@/lib/music";
import styles from "./NoteName.module.css";

/** Renders a note with sargam marks: komal underlined, tivra stroked, upper Sa dotted. */
export default function NoteName({ label }: { label: NoteLabel }) {
  return (
    <span
      className={styles.note}
      data-mark={label.mark}
      data-upper={label.upper || undefined}
      aria-label={labelText(label)}
    >
      {label.text}
    </span>
  );
}

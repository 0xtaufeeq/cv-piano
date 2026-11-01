export type Notation = "sargam" | "solfege" | "letters";
export type Layout = "piano" | "classic";
export type HandSide = "Left" | "Right";
export type Finger = "index" | "middle" | "ring" | "pinky";

export const FINGERS: Finger[] = ["index", "middle", "ring", "pinky"];

// MediaPipe hand landmark indices
export const THUMB_TIP = 4;
export const WRIST = 0;
export const INDEX_MCP = 5;
export const FINGER_TIP: Record<Finger, number> = {
  index: 8,
  middle: 12,
  ring: 16,
  pinky: 20,
};

export const KEY_COUNT = 8;

// One hue per scale degree, warm to cool like the original's neon spectrum.
export const NOTE_COLORS = [
  "#ff5a3c",
  "#ff9a2e",
  "#f7c93e",
  "#9bd64a",
  "#2fcfa6",
  "#4aa8ff",
  "#8a7dff",
  "#ff5fa8",
] as const;

export const SHORTCUTS = ["A", "S", "D", "F", "J", "K", "L", ";"] as const;

export interface KeySlot {
  index: number;
  hand: HandSide;
  finger: Finger;
  shortcut: string;
}

const LAYOUTS: Record<Layout, Array<[HandSide, Finger]>> = {
  // Low notes on the left, like a piano: keys line up with fingers on screen.
  piano: [
    ["Left", "pinky"],
    ["Left", "ring"],
    ["Left", "middle"],
    ["Left", "index"],
    ["Right", "index"],
    ["Right", "middle"],
    ["Right", "ring"],
    ["Right", "pinky"],
  ],
  // The original mapping: each hand climbs from index to pinky, right hand first.
  classic: [
    ["Right", "index"],
    ["Right", "middle"],
    ["Right", "ring"],
    ["Right", "pinky"],
    ["Left", "index"],
    ["Left", "middle"],
    ["Left", "ring"],
    ["Left", "pinky"],
  ],
};

export function getSlots(layout: Layout): KeySlot[] {
  return LAYOUTS[layout].map(([hand, finger], index) => ({
    index,
    hand,
    finger,
    shortcut: SHORTCUTS[index],
  }));
}

export function slotIndex(slots: KeySlot[], hand: HandSide, finger: Finger): number {
  return slots.findIndex((s) => s.hand === hand && s.finger === finger);
}

export interface Scale {
  id: string;
  name: string;
  western: string;
  /** Semitones above the tonic for each of the eight keys. */
  steps: number[];
}

export const SCALES: Scale[] = [
  { id: "bilawal", name: "Bilawal", western: "Major", steps: [0, 2, 4, 5, 7, 9, 11, 12] },
  { id: "kalyan", name: "Kalyan", western: "Lydian", steps: [0, 2, 4, 6, 7, 9, 11, 12] },
  { id: "khamaj", name: "Khamaj", western: "Mixolydian", steps: [0, 2, 4, 5, 7, 9, 10, 12] },
  { id: "kafi", name: "Kafi", western: "Dorian", steps: [0, 2, 3, 5, 7, 9, 10, 12] },
  { id: "asavari", name: "Asavari", western: "Natural minor", steps: [0, 2, 3, 5, 7, 8, 10, 12] },
  { id: "bhairavi", name: "Bhairavi", western: "Phrygian", steps: [0, 1, 3, 5, 7, 8, 10, 12] },
  { id: "bhairav", name: "Bhairav", western: "Double harmonic", steps: [0, 1, 4, 5, 7, 8, 11, 12] },
  { id: "todi", name: "Todi", western: "—", steps: [0, 1, 3, 6, 7, 8, 11, 12] },
];

export const TONICS = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"] as const;

export function getScale(id: string): Scale {
  return SCALES.find((s) => s.id === id) ?? SCALES[0];
}

/** Tonics from G upward drop an octave so the top key never gets shrill. */
export function tonicMidi(tonic: number): number {
  return tonic <= 6 ? 60 + tonic : 48 + tonic;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function scaleFrequencies(scale: Scale, tonic: number): number[] {
  const base = tonicMidi(tonic);
  return scale.steps.map((step) => midiToFreq(base + step));
}

export interface NoteLabel {
  text: string;
  /** Sargam only: komal (flat) is underlined, tivra (sharp) gets a stroke above. */
  mark?: "komal" | "tivra";
  /** Upper-octave tonic, drawn with a dot above in sargam. */
  upper?: boolean;
}

const SARGAM: NoteLabel[] = [
  { text: "Sa" },
  { text: "Re", mark: "komal" },
  { text: "Re" },
  { text: "Ga", mark: "komal" },
  { text: "Ga" },
  { text: "Ma" },
  { text: "Ma", mark: "tivra" },
  { text: "Pa" },
  { text: "Dha", mark: "komal" },
  { text: "Dha" },
  { text: "Ni", mark: "komal" },
  { text: "Ni" },
];

const SOLFEGE = ["Do", "Ra", "Re", "Me", "Mi", "Fa", "Fi", "So", "Le", "La", "Te", "Ti"];

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PITCH = [0, 2, 4, 5, 7, 9, 11];
// Which of the seven scale degrees each semitone belongs to (komal Re is still a Re).
const SEMITONE_DEGREE = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];
// Letter index for each entry in TONICS.
const TONIC_LETTER = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];

/** Spells a note by its scale degree, so the seventh of D is C♯ rather than D♭. */
function letterName(semitone: number, tonic: number): string {
  const pitch = (tonic + semitone) % 12;
  const letter = (TONIC_LETTER[tonic] + SEMITONE_DEGREE[semitone]) % 7;
  const offset = ((pitch - LETTER_PITCH[letter] + 18) % 12) - 6;
  if (offset === 0) return LETTERS[letter];
  if (offset === 1) return `${LETTERS[letter]}♯`;
  if (offset === -1) return `${LETTERS[letter]}♭`;
  // Would need a double accidental; fall back to the common name.
  return TONICS[pitch];
}

export function labelFor(step: number, notation: Notation, tonic: number): NoteLabel {
  const degree = step % 12;
  const upper = step >= 12;
  switch (notation) {
    case "sargam":
      return { ...SARGAM[degree], upper };
    case "solfege":
      return { text: SOLFEGE[degree], upper };
    case "letters":
      return { text: letterName(degree, tonic), upper };
  }
}

/** Plain-text form for canvas labels, status text and screen readers. */
export function labelText(label: NoteLabel): string {
  let text = label.text;
  if (label.mark === "komal") text += "♭";
  if (label.mark === "tivra") text += "♯";
  if (label.upper) text += "′";
  return text;
}

export const FINGER_NAMES: Record<Finger, string> = {
  index: "Index",
  middle: "Middle",
  ring: "Ring",
  pinky: "Pinky",
};

import type { InstrumentId } from "./audio";
import type { Layout, Notation } from "./music";

export type View = "mirror" | "hands";

export interface Settings {
  notation: Notation;
  scaleId: string;
  tonic: number;
  instrument: InstrumentId;
  volume: number;
  reverb: number;
  drone: boolean;
  layout: Layout;
  sensitivity: number;
  view: View;
  labels: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  notation: "sargam",
  scaleId: "bilawal",
  tonic: 0,
  instrument: "harmonium",
  volume: 0.7,
  reverb: 0.35,
  drone: false,
  layout: "piano",
  sensitivity: 1,
  view: "mirror",
  labels: true,
};

const STORAGE_KEY = "gesturio:settings";

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable in private windows; settings just won't persist.
  }
}

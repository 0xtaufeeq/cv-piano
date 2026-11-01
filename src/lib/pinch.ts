import { FINGERS, type Finger } from "./music";

export interface Point {
  x: number;
  y: number;
}

// Thumb-to-fingertip distance as a fraction of palm size (wrist → index knuckle).
// A pinch starts below PRESS and only ends above RELEASE, so a finger hovering
// right at the threshold can't stutter the note on and off.
export const PRESS_RATIO = 0.3;
export const RELEASE_RATIO = 0.42;
// Where the proximity meter starts to fill.
const FAR_RATIO = 1.1;
// A second finger on the same hand has to be this much tighter than PRESS to
// fire, because pinching one finger drags its neighbours towards the thumb.
const NEIGHBOUR_FACTOR = 0.7;

/**
 * Landmarks are normalised to the frame, so x and y use different units until
 * x is scaled by the aspect ratio.
 */
export function distance(a: Point, b: Point, aspect: number): number {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

export function pinchRatio(
  thumb: Point,
  tip: Point,
  wrist: Point,
  indexKnuckle: Point,
  aspect: number,
): number {
  const palm = distance(wrist, indexKnuckle, aspect);
  if (palm < 1e-6) return Infinity;
  return distance(thumb, tip, aspect) / palm;
}

/** 0 when the finger is far from the thumb, 1 at the moment a pinch fires. */
export function proximity(ratio: number, sensitivity = 1): number {
  const press = PRESS_RATIO * sensitivity;
  const value = 1 - (ratio - press) / (FAR_RATIO - press);
  return Math.min(1, Math.max(0, value));
}

export type FingerMap<T> = Record<Finger, T>;

export function emptyPinches(): FingerMap<boolean> {
  return { index: false, middle: false, ring: false, pinky: false };
}

export function resolvePinches(
  ratios: FingerMap<number>,
  previous: FingerMap<boolean>,
  sensitivity = 1,
): FingerMap<boolean> {
  const press = PRESS_RATIO * sensitivity;
  const release = RELEASE_RATIO * sensitivity;
  const closest = Math.min(...FINGERS.map((f) => ratios[f]));
  const next = emptyPinches();
  for (const finger of FINGERS) {
    const ratio = ratios[finger];
    if (previous[finger]) {
      next[finger] = ratio < release;
    } else {
      const isClosest = ratio <= closest;
      next[finger] = ratio < press && (isClosest || ratio < press * NEIGHBOUR_FACTOR);
    }
  }
  return next;
}

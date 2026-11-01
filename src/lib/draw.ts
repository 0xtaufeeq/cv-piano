import { FINGER_TIP, THUMB_TIP, type Finger, type HandSide } from "./music";
import type { Point } from "./pinch";

export interface FingerState {
  finger: Finger;
  color: string;
  label: string;
  proximity: number;
  pinched: boolean;
}

export interface TrackedHand {
  side: HandSide;
  landmarks: Point[];
  fingers: FingerState[];
}

export interface Ripple {
  x: number;
  y: number;
  color: string;
  born: number;
}

export interface Frame {
  width: number;
  height: number;
  videoWidth: number;
  videoHeight: number;
}

const BONES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const IVORY = "243, 234, 217";
const RIPPLE_MS = 700;
const TAU = Math.PI * 2;

/**
 * Maps normalised camera coordinates onto the stage. The video is mirrored and
 * scaled to cover, so the overlay has to apply the same crop.
 */
export function makeProjector(frame: Frame): (p: Point) => Point {
  const scale = Math.max(frame.width / frame.videoWidth, frame.height / frame.videoHeight);
  const drawnWidth = frame.videoWidth * scale;
  const drawnHeight = frame.videoHeight * scale;
  const offsetX = (frame.width - drawnWidth) / 2;
  const offsetY = (frame.height - drawnHeight) / 2;
  return (p) => ({
    x: offsetX + (1 - p.x) * drawnWidth,
    y: offsetY + p.y * drawnHeight,
  });
}

export interface DrawOptions {
  labels: boolean;
  font: string;
  reducedMotion: boolean;
}

export function drawHands(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  hands: TrackedHand[],
  ripples: Ripple[],
  now: number,
  options: DrawOptions,
): void {
  ctx.clearRect(0, 0, frame.width, frame.height);
  if (frame.videoWidth === 0) return;
  const project = makeProjector(frame);

  for (const hand of hands) {
    const points = hand.landmarks.map(project);

    ctx.lineCap = "round";
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(${IVORY}, 0.5)`;
    ctx.shadowColor = `rgba(${IVORY}, 0.35)`;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (const [a, b] of BONES) {
      ctx.moveTo(points[a].x, points[a].y);
      ctx.lineTo(points[b].x, points[b].y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = `rgba(${IVORY}, 0.85)`;
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 2.2, 0, TAU);
      ctx.fill();
    }

    const thumb = points[THUMB_TIP];

    for (const state of hand.fingers) {
      const tip = points[FINGER_TIP[state.finger]];

      if (state.pinched || state.proximity > 0.45) {
        ctx.save();
        ctx.strokeStyle = state.color;
        ctx.globalAlpha = state.pinched ? 1 : (state.proximity - 0.45) * 1.2;
        ctx.lineWidth = state.pinched ? 3.5 : 1.5;
        if (!state.pinched) ctx.setLineDash([3, 6]);
        if (state.pinched) {
          ctx.shadowColor = state.color;
          ctx.shadowBlur = 18;
        }
        ctx.beginPath();
        ctx.moveTo(thumb.x, thumb.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 7, 0, TAU);
      if (state.pinched) {
        ctx.fillStyle = state.color;
        ctx.shadowColor = state.color;
        ctx.shadowBlur = 24;
        ctx.fill();
      } else {
        ctx.fillStyle = "rgba(11, 9, 8, 0.7)";
        ctx.fill();
        ctx.strokeStyle = state.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();

      // Ring that closes as the finger nears the thumb
      if (!state.pinched && state.proximity > 0.02) {
        ctx.save();
        ctx.strokeStyle = state.color;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 13, -Math.PI / 2, -Math.PI / 2 + TAU * state.proximity);
        ctx.stroke();
        ctx.restore();
      }

      if (options.labels) {
        ctx.save();
        ctx.font = `500 12px ${options.font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
        ctx.shadowBlur = 6;
        ctx.fillStyle = state.pinched ? "#fff" : state.color;
        ctx.fillText(state.label, tip.x, tip.y - 20);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(thumb.x, thumb.y, 7, 0, TAU);
    ctx.fillStyle = "rgba(11, 9, 8, 0.7)";
    ctx.fill();
    ctx.strokeStyle = `rgba(${IVORY}, 0.95)`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  for (let i = ripples.length - 1; i >= 0; i--) {
    const ripple = ripples[i];
    const age = (now - ripple.born) / RIPPLE_MS;
    if (age >= 1) {
      ripples.splice(i, 1);
      continue;
    }
    if (options.reducedMotion) continue;
    const eased = 1 - Math.pow(1 - age, 3);
    ctx.save();
    ctx.strokeStyle = ripple.color;
    ctx.globalAlpha = (1 - age) * 0.9;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ripple.x, ripple.y, 14 + eased * 70, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

import type { HandLandmarker } from "@mediapipe/tasks-vision";

const WASM_PATH = "/mediapipe/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export async function createHandTracker(): Promise<HandLandmarker> {
  const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);

  const create = (delegate: "GPU" | "CPU") =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

  try {
    return await create("GPU");
  } catch {
    return await create("CPU");
  }
}

export interface CameraError {
  title: string;
  body: string;
}

export function describeCameraError(error: unknown): CameraError {
  const name = error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        title: "Camera access is blocked",
        body: "Allow the camera from the icon in your browser's address bar, then try again.",
      };
    case "NotFoundError":
    case "OverconstrainedError":
      return {
        title: "No camera found",
        body: "Plug in a webcam and try again, or play with your keyboard instead.",
      };
    case "NotReadableError":
    case "AbortError":
      return {
        title: "The camera is busy",
        body: "Another app may be using it. Close that app and try again.",
      };
    default:
      return {
        title: "Hand tracking couldn't start",
        body: "The tracking model failed to load. Check your connection and try again.",
      };
  }
}

// Copies the MediaPipe WASM runtime out of node_modules so the app serves it
// itself and always matches the installed @mediapipe/tasks-vision version.
import { cp, mkdir, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const to = join(root, "public", "mediapipe", "wasm");

try {
  await access(from);
} catch {
  console.warn("[copy-mediapipe] @mediapipe/tasks-vision not installed yet, skipping.");
  process.exit(0);
}

await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
console.log("[copy-mediapipe] WASM runtime copied to public/mediapipe/wasm");

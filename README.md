# Gesturio — play music in the air

A hand-tracked instrument that runs in the browser. Your webcam follows your hands; touch your thumb to a fingertip and that finger plays its note. Eight fingers cover one octave: **Sa Re Ga Ma Pa Dha Ni Sa**.

Built with Next.js, MediaPipe hand tracking and the Web Audio API. Video is processed on your device and never uploaded.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 and allow camera access. The camera only works on `localhost` or over https.

```bash
npm run build   # production build
npm start       # serve the production build
```

## How to play

1. Sit back until both hands fit in the frame, palms facing the screen.
2. Pinch thumb to finger to play. Hold the pinch to sustain the note.
3. Watch the ring on each fingertip and the meter on each key. They fill as your finger nears your thumb.

No camera? Choose **Use keyboard instead** and play with `A S D F` `J K L ;` (or `1`–`8`), or tap the keys.

| Key      | 1     | 2    | 3      | 4     | 5     | 6      | 7    | 8     |
| -------- | ----- | ---- | ------ | ----- | ----- | ------ | ---- | ----- |
| Note     | Sa    | Re   | Ga     | Ma    | Pa    | Dha    | Ni   | Sa′   |
| Hand     | Left  | Left | Left   | Left  | Right | Right  | Right | Right |
| Finger   | Pinky | Ring | Middle | Index | Index | Middle | Ring | Pinky |
| Keyboard | A     | S    | D      | F     | J     | K      | L    | ;     |

This is the default **Piano** layout, where low notes sit on the left like a keyboard. The **Classic** layout restores the original mapping (right hand plays the low notes, index finger first).

## Settings

- **Voice** — Harmonium, Glass, Santoor or Bansuri, with volume, reverb and an optional tanpura drone
- **Notes** — Sargam, solfège or letter names; any tonic; eight scales (Bilawal, Kalyan, Khamaj, Kafi, Asavari, Bhairavi, Bhairav, Todi)
- **Hands** — finger layout, pinch sensitivity, mirror or hands-only view, fingertip labels

Settings are saved in your browser.

## Project structure

```
src/
  app/                  Next.js app router: layout, page, global styles
  components/
    Gesturio.tsx        Main screen: camera, tracking loop, note state
    Keyboard.tsx        The eight on-screen keys
    Onboarding.tsx      Start screen, help and camera errors
    SettingsPanel.tsx   Settings drawer
    HandDiagram.tsx     Finger-to-note map
  lib/
    audio.ts            Web Audio synth: instruments, reverb, drone
    pinch.ts            Pinch detection
    draw.ts             Hand overlay rendering
    handTracker.ts      MediaPipe setup and camera error messages
    music.ts            Scales, note names, finger layouts
    settings.ts         Defaults and persistence
scripts/
  copy-mediapipe.mjs    Copies the MediaPipe WASM runtime into public/
legacy/                 The original HTML/CSS/JS version
```

The MediaPipe WASM runtime is copied from `node_modules` into `public/mediapipe` on install, dev and build. The hand model itself (about 8 MB) is downloaded from Google's model storage the first time you start the camera.

## Credits

Based on the original [Hand Gesture Music](https://github.com/SuyashT0911/Hand-Gesture-Music) by **Suyash Tiwari**, preserved in `legacy/`.

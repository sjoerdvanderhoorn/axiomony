# Acme walkthrough: editable JavaScript animation

Axiomony's Acme walkthrough is a **deterministic Canvas 2D animation**, not a sequence of generated still images. The on-screen typing, cursor, UI construction, transitions, and connections all come from source code.

## Edit and preview

- **`docs/demo/acme.js`** contains all timeline scenes, prompts, app data, drawing helpers, and animation curves. The `STORY` object at the top centralizes the timing and text.
- **`docs/acme-demo.html`** is a browser-based player with play/pause, scrubbing, and chapter navigation. Open it using a local static HTTP server (or via GitHub Pages). No dependencies are required for browser preview.
- **`demo/acme/render.mjs`** renders the same timeline at a specified resolution and frame rate, then exports MP4 and an optimized README GIF.

To preview locally, from the repository root:

```sh
python3 -m http.server 8080 --directory docs
# Open http://127.0.0.1:8080/acme-demo.html
```

## Re-render the media

Prerequisites: Node.js 22+, FFmpeg on `PATH`, and npm.

```sh
npm --prefix demo/acme install
npm --prefix demo/acme run render
```

By default this exports **1920 × 1080, 30 fps, 60 seconds**. Output files:

| File | Usage |
| --- | --- |
| `docs/assets/acme-software-demo.mp4` | Full-resolution HTML5 video on the website |
| `docs/assets/acme-walkthrough.gif` | Smaller animated preview embedded in GitHub README |
| `docs/assets/acme-poster.webp` | Still poster for video while loading |

For a faster test or different export:

```sh
node demo/acme/render.mjs --fps 15 --width 1280 --height 720
```

The interactive player and exported video use exactly the **same source function**, `renderFrame(ctx, seconds)`. Editing a prompt or timing entry in `STORY`, or a scene in `docs/demo/acme.js`, updates both the interactive preview and the next video export.

## Storyboard

| Timeline | Interface | Example action |
| --- | --- | --- |
| 0–18 s | ChatGPT, desktop | Acme admin defines accounting tables, permissions, and an ERD |
| 18–31 s | Claude, phone | Purchasing builds and uses an invoice-capture app |
| 31–44 s | Gemini, laptop | Sales creates quotes and converts one to an order |
| 44–56 s | ChatGPT, desktop | Finance creates an approval/reconciliation dashboard |
| 56–60 s | Acme overview | Three different tools connect to one governed database |

This is an **illustrative concept video**, not a live product recording. No external AI APIs are called by the animation.

The animation uses drawn UI-style mockups labeled ChatGPT, Claude, and Gemini. Brand names are used descriptively; the walkthrough is not affiliated with those providers.
<img width="200" height="200" alt="Group 1" src="https://github.com/user-attachments/assets/03871726-403e-4502-ab44-84dca261ed03" />
<svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
<g filter="url(#filter0_n_1_30)">
<rect width="200" height="200" rx="20" fill="#D9D9D9"/>
</g>
<g filter="url(#filter1_g_1_30)">
<path d="M104.7 164V155C106.7 155 109.5 154.7 113.1 154.1C116.7 153.5 120.1 152.3 123.3 150.5L95.7 109.4L65.1 150.5C68.1 152.3 71.3 153.5 74.7 154.1C78.1 154.7 80.7 155 82.5 155V164H30V155C31.8 155 34.3 154.7 37.5 154.1C40.9 153.5 44.2 152.5 47.4 151.1L87.6 97.4L49.5 40.4C46.3 38.8 42.9 37.7 39.3 37.1C35.9 36.5 33.3 36.2 31.5 36.2V27.2H96.6V36.2C94.6 36.2 91.8 36.5 88.2 37.1C84.6 37.7 81.1 39 77.7 41L103.5 79.1L132 41C129.2 39 126 37.7 122.4 37.1C119 36.5 116.4 36.2 114.6 36.2V27.2H167.4V36.2C165.6 36.2 163 36.5 159.6 37.1C156.4 37.7 153.1 38.8 149.7 40.4L111.6 91.1L151.8 150.5C155 152.3 158.3 153.5 161.7 154.1C165.3 154.7 168.1 155 170.1 155V164H104.7Z" fill="white"/>
</g>
<defs>
<filter id="filter0_n_1_30" x="0" y="0" width="200" height="200" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feTurbulence type="fractalNoise" baseFrequency="0.020325202494859695 0.020325202494859695" stitchTiles="stitch" numOctaves="3" result="noise" seed="8954" />
<feColorMatrix in="noise" type="luminanceToAlpha" result="alphaNoise" />
<feComponentTransfer in="alphaNoise" result="coloredNoise1">
<feFuncA type="discrete" tableValues="1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 "/>
</feComponentTransfer>
<feComposite operator="in" in2="shape" in="coloredNoise1" result="noise1Clipped" />
<feComponentTransfer in="alphaNoise" result="coloredNoise2">
<feFuncA type="discrete" tableValues="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 "/>
</feComponentTransfer>
<feComposite operator="in" in2="shape" in="coloredNoise2" result="noise2Clipped" />
<feFlood flood-color="#000000" result="color1Flood" />
<feComposite operator="in" in2="noise1Clipped" in="color1Flood" result="color1" />
<feFlood flood-color="#252525" result="color2Flood" />
<feComposite operator="in" in2="noise2Clipped" in="color2Flood" result="color2" />
<feMerge result="effect1_noise_1_30">
<feMergeNode in="shape" />
<feMergeNode in="color1" />
<feMergeNode in="color2" />
</feMerge>
</filter>
<filter id="filter1_g_1_30" x="24.7" y="21.9" width="150.7" height="147.4" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feTurbulence type="fractalNoise" baseFrequency="0.10101010650396347 0.10101010650396347" numOctaves="3" seed="1346" />
<feDisplacementMap in="shape" scale="10.600000381469727" xChannelSelector="R" yChannelSelector="G" result="displacedImage" width="100%" height="100%" />
<feMerge result="effect1_texture_1_30">
<feMergeNode in="displacedImage"/>
</feMerge>
</filter>
</defs>
</svg>


# xnote

A minimal, grayscale notes app with on-device AI — no internet required.

Built with Electron + llama.cpp. All AI processing runs locally on your machine using a bundled 0.5B GGUF model.

## Features

### AI-Powered

- **Auto-title generation** — After you write a few sentences, xnote generates a concise title for the note (2s debounce).
- **Format suggestion** — When list-like content is detected (shopping lists, todos, errands), a suggestion bar appears mid-editor. Click **Suggest** to auto-format into clean bullet points, deduplicate repetitive items, and remove conversational filler.
- **Auto-proofread** — While you type, xnote silently corrects obvious spelling and punctuation mistakes after a short pause (1.4s debounce). Never overwrites edits you're actively making.
- **Smart list detection** — Detects lists by title keywords (shopping, todo, grocery, etc.), existing bullet markers, or short line patterns with no terminal punctuation.
- **Hallucination guards** — Multiple safety layers prevent the model from inventing quantities, adding commentary, collapsing structure, or rewriting your voice.
- **100% local** — llama.cpp server and model are bundled with the app. Zero internet calls after install. Your notes never leave your machine.

### Interface

- **Custom frameless titlebar** with macOS-style traffic light window controls (minimize, maximize, close)
- **Dark / Light themes** with a Lottie-powered moon-to-sun transition animation
- **Sidebar** with preview snippets and hover-to-delete hints
- **Keyboard shortcuts**: `Ctrl+N` new note, `Ctrl+D` delete note
- **Auto-save** — Notes persist to disk 400ms after the last keystroke

## Quick Start

```bash
npm install
npm run dev
```

The app will start and automatically launch the bundled llama.cpp server in the background. Once the model is loaded (typically 2–5s), the AI features become available.

## Keyboard Shortcuts

| Shortcut | Action       |
|----------|--------------|
| Ctrl+N   | New note     |
| Ctrl+D   | Delete note  |

## Build

```bash
npm run build
```

Produces a standalone installer in `dist/`. The AI server and model are bundled as `extraResources`.

## Tech Stack

- **Electron 28** — Desktop shell with `contextIsolation`, `sandbox: false`
- **llama.cpp b10099** — Local inference via bundled `llama-server.exe`
- **Qwen2.5-0.5B-Instruct (Q4_K_M)** — Lightweight 469MB GGUF model
- **Lottie-web** — Animated theme transitions
- **Vanilla JS** — No frameworks, no bloat

## Notes

Highly experimental. A minimal base that will grow — local RAG, voice input, smart search, and more are on the horizon.

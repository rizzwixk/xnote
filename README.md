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

# AGENTS.md

## Project

xnote — a local AI notes app built with Electron. Notes saved as JSON. AI runs via bundled llama.cpp server on localhost.

## Stack

- Electron 28 (frameless window, contextIsolation: true, sandbox: false)
- Vanilla JS (no framework, no build step)
- HTML + CSS (CSS custom properties for themes)
- llama.cpp b10099 (bundled in `ai/`)
- Granite 4.0 Hybrid Mamba 350M model (Q4_K_M, 212MB)
- Elms Sans font (bundled in `renderer/fonts/`)

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start Electron in dev mode
```

No build step. No test framework. No linter configured.

## File Structure

```
main.js              # Electron main process, IPC handlers, AI server lifecycle
preload.js           # Context bridge (window.api exposes IPC to renderer)
renderer/
  index.html         # App UI, context menu, confirm dialog
  app.js             # Renderer logic, themes, AI calls, note management
  styles.css         # Theme variable blocks, component styles
  fonts/             # Elms Sans TTF (400-700)
  assets/            # SVG icons
ai/
  llama-server.exe   # Bundled llama.cpp server binary
  model.gguf         # Granite 4.0 Hybrid Mamba 350M (gitignored)
```

## Architecture

1. **Renderer** (`renderer/app.js`) sends notes data and AI requests via `window.api`
2. **Preload** (`preload.js`) bridges IPC channels to `window.api`
3. **Main** (`main.js`) handles file I/O, spawns llama.cpp on port 8080, proxies AI requests
4. **llama.cpp** (`ai/llama-server.exe`) serves `/completion` endpoint at `127.0.0.1:8080`

## IPC Channels

- `notes:load` / `notes:save` — JSON file I/O
- `theme:load` / `theme:save` — theme name string persistence
- `ai:get-status` / `ai:on-status` — AI server lifecycle events
- `ai:fix-text` — spell check / format correction
- `ai:gen-title` — auto title generation
- `ai:proofread` — proofread text

## AI Server

- Binary: `ai/llama-server.exe` (b10099)
- Model: `ai/model.gguf` (Granite 4.0 Hybrid Mamba, Q4_K_M)
- Port: 8080
- Endpoint: POST `/completion` with `{prompt, n_predict, temperature, stream}`
- Response: `.content` field
- The server is spawned as a detached process and killed on app quit

## Themes

4 themes using CSS custom properties via `body[data-theme="..."]`:
- `dark` — grayscale (default)
- `forest` — green accent
- `ivory` — warm light
- `sky` — blue light

Theme preference stored as a plain string in `theme.json` in userData.

## Conventions

- No comments unless asked
- No frameworks — vanilla JS only
- No build step — files run directly in Electron
- CSS variables for all colors (no hardcoded hex in component styles)
- IPC handlers in main.js, bridge in preload.js, calls in app.js
- Notes auto-save on every keystroke (debounced)
- Model file (`model.gguf`) is gitignored — must be placed manually in `ai/`

## Important Notes

- The app uses a custom frameless titlebar with macOS-style traffic lights
- Context menu is custom HTML (not native) — right-click on note list
- Confirm dialogs are custom HTML (not native `confirm()`)
- Font is bundled locally — no internet required at runtime
- AI features can be toggled off in Settings modal

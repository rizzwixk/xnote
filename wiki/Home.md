# xnote Wiki

Welcome to the xnote wiki. Here you will find a comprehensive breakdown of every feature in the app.

## Table of Contents

- [AI Features](#ai-features)
- [Interface](#interface)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Tech Stack](#tech-stack)

---

## AI Features

All AI processing runs **100% on-device** using a bundled llama.cpp server and a lightweight Qwen2.5-0.5B-Instruct model. No internet connection is required after installation.

### Auto-Title Generation

When you create a new note and start writing, xnote waits 2 seconds after you stop typing and then asks the local model to generate a concise title (max 6 words). The title appears in the title input field and is automatically saved.

- Triggered on: new notes with content but no title
- Debounce: 2 seconds
- Model: llama.cpp via localhost

### Format Suggestion

When the app detects list-like content -- shopping lists, todos, errands, or any note whose title contains list keywords -- a **format suggestion bar** slides in from the right edge of the editor. Click **Suggest** to:

- Convert raw lines into clean bullet points
- Deduplicate repetitive items (triplet repeats, identical items)
- Strip conversational lead-ins ("I want to buy", "I need to get")
- Split comma-separated lines into individual items
- Reject model hallucinations (invented quantities, commentary)

The suggestion bar has its own spring animation and can be dismissed with the x button.

### Auto-Proofread

As you type, xnote silently corrects obvious spelling and punctuation mistakes after a 1.4-second pause. This runs as a background request and will never overwrite your text if you are actively editing.

- Debounce: 1.4 seconds
- Scope: spelling errors, punctuation mistakes only
- Safety: uses a request-token system to abandon stale responses
- Preserves structure: never collapses paragraphs or rewrites sentences

### Smart List Detection

The app uses three heuristics to decide whether content looks like a list:

1. **Title keywords**: list, shopping, grocery, todo, task, checklist, errand, ingredient, packing, wishlist
2. **Existing markers**: lines already using dashes, stars, plus, bullets, or numbers
3. **Short-line pattern**: every line is under 80 characters and none end with . ? or !

If any of these match, the format suggestion bar appears.

### Hallucination Guards

The 0.5B model is small and sometimes invents things. xnote has multiple safety layers:

- **preserveSourceStructure**: rejects model output that is too long (>45% over original), contains commentary, is markdown-formatted, or collapses multi-line text
- **hasInventedQuantities**: detects quantities the model invented that were not in the original text
- **isModelCommentary**: rejects any output containing phrases like "the author's" or "changes made"
- **bulletListFromSource**: builds bullet items from the user's own text boundaries
- **cleanModelOutput**: deduplicates items, strips code fences, normalizes formatting

### Local llama.cpp Server

- **Binary**: `llama-server.exe` (b10099) bundled in `ai/`
- **Model**: `qwen2.5-0.5b-instruct-q4_k_m.gguf` (469MB) in `ai/`
- **Endpoint**: `/completion` on `127.0.0.1:8080`
- **Startup**: auto-starts when the app launches; status shown in the editor footer
- **Health check**: polls `/health` every second; 30-second timeout
- **Parameters**: temperature 0.05, top_p 0.9, repeat_penalty 1.15

All files are bundled as `extraResources` in the Electron build. No downloads at runtime.

---

## Interface

### Custom Frameless Titlebar

A macOS-style titlebar with traffic light window controls (red close, yellow minimize, green maximize/restore). SVG icons appear on hover. The titlebar is draggable and the controls are clickable.

### Dark / Light Themes

Toggle between dark and light themes using the moon/sun button in the sidebar. The transition is animated with a Lottie-powered SVG morph animation. The preference is persisted to disk.

### Sidebar Note List

- Lists all notes with title and a 60-character content preview
- Active note is highlighted
- Hovering reveals a "Double-click to delete" tooltip
- Notes animate in with a staggered slide-in effect
- Scrollable with custom thin scrollbar

### Editor Panel

- Title input with border-bottom focus style
- Full-height content textarea with custom scrollbar
- Format suggestion overlay (mid-editor, right-aligned)
- Footer bar with status messages and save timestamps

### Auto-Save

Notes are automatically saved to `notes.json` in the user's appData directory 400ms after the last keystroke. A "Saved at" timestamp confirms each write. Pending saves flush on close.

---

## Keyboard Shortcuts

| Shortcut       | Action       |
|----------------|--------------|
| Ctrl+N / Cmd+N | New note     |
| Ctrl+D / Cmd+D | Delete note  |

---

## Tech Stack

| Component       | Technology                             |
|-----------------|----------------------------------------|
| Desktop shell   | Electron 28                            |
| Security        | contextIsolation, sandbox: false       |
| AI backend      | llama.cpp b10099 / completion endpoint |
| AI model        | Qwen2.5-0.5B-Instruct Q4_K_M (469MB)  |
| Animations      | Lottie-web                             |
| Build           | electron-builder with extraResources   |
| Language        | Vanilla JavaScript (no frameworks)     |
| Styling         | Pure CSS with CSS variables / themes   |

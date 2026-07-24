// Import Electron modules for desktop app functionality
const { app, BrowserWindow, ipcMain } = require('electron');
// Import path module for cross-platform file paths
const path = require('path');
// Import filesystem module for reading/writing files
const fs = require('fs');
// Import http module for making HTTP requests to local llama.cpp server
const http = require('http');
// Import child_process spawn for running llama.cpp server as a subprocess
const { spawn } = require('child_process');

// Path to the notes JSON file stored in user's appData directory
const notesPath = path.join(app.getPath('userData'), 'notes.json');
// Path to the theme preference JSON file
const themePath = path.join(app.getPath('userData'), 'theme.json');

// Resolves path to bundled ai/ files (dev: __dirname/ai, prod: resources/ai)
function getAiPath(file) {
  const dir = app.isPackaged
    ? path.join(process.resourcesPath, 'ai')
    : path.join(__dirname, 'ai');
  return path.join(dir, file);
}

// Path to the bundled llama.cpp server binary
const serverPath = getAiPath('llama-server.exe');
// Path to the bundled GGUF model file
const modelPath = getAiPath('model.gguf');
// Port for the local llama.cpp server
const LLAMA_PORT = 8080;
const LLAMA_HOST = '127.0.0.1';

// Reference to the main BrowserWindow instance
let mainWin = null;
// Tracks AI setup progress stage and detail message
let aiStatus = { stage: 'checking', detail: '' };

// Reads and parses a JSON file from disk, returns null on failure
function loadData(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (_) {}
  return null;
}

// Writes a JSON object to disk with pretty formatting
function saveData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (_) {}
}

// Sends current AI status to renderer via Electron IPC
function sendAIStatus() {
  mainWin?.webContents.send('ai:status', aiStatus);
}

// Checks if the llama.cpp server is running and responding
function isServerRunning() {
  return new Promise((resolve) => {
    const req = http.get(`http://${LLAMA_HOST}:${LLAMA_PORT}/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

// Starts the bundled llama.cpp server and waits for it to be ready
function startServer() {
  return new Promise((resolve) => {
    const proc = spawn(serverPath, [
      '-m', modelPath,
      '-c', '2048',
      '--port', String(LLAMA_PORT)
    ], { detached: true, stdio: 'ignore' });
    proc.unref();
    let waited = 0;
    const iv = setInterval(async () => {
      waited += 1000;
      if (await isServerRunning()) { clearInterval(iv); resolve(true); }
      else if (waited > 30000) { clearInterval(iv); resolve(false); }
    }, 1000);
  });
}

// Strips markdown code fences and deduplicates consecutive identical lines
function cleanModelOutput(text, asBulletList = false) {
  // Remove any markdown code fence markers (triple backticks)
  let output = String(text || '').trim().replace(/^```(?:text|markdown)?\s*|\s*```$/gi, '').trim();
  // If not a list request, return cleaned text as-is
  if (!asBulletList) return output;
  // Normalize list items separated by spaces onto their own lines
  if (asBulletList) output = output.replace(/\s+(?=[-*+\u2022]\s+)/g, '\n');
  const cleaned = [];
  for (const line of output.split(/\r?\n/)) {
    let normalized = line.trim();
    if (!normalized) continue;
    if (asBulletList) {
      // Strip leading bullet markers (dash, star, plus, unicode bullet, or numbered)
      normalized = normalized.replace(/^(?:[-*+\u2022]|\d+[.)])\s+/, '').trim();
      // Remove conversational lead-ins when the model leaves them in an item
      normalized = normalized.replace(/^(?:i\s+)?(?:want|need|would\s+like)\s+(?:to\s+)?(?:buy|get|make\s+(?:a\s+)?list)\s*/i, '').trim();
      normalized = normalized.replace(/^actual(?:ly)?\s*[,;:]?\s*/i, '').trim();
      // Re-add a clean bullet marker
      if (normalized) normalized = '\u2022 ' + normalized;
    }
    // Deduplicate: skip if this line matches the last two lines (triplet repeat)
    const previous = cleaned[cleaned.length - 1];
    if (previous === normalized && cleaned[cleaned.length - 2] === normalized) continue;
    cleaned.push(normalized);
  }
  if (asBulletList) {
    // Deduplicate by lowercase content (remove identical items regardless of formatting)
    const seen = new Set();
    return cleaned.filter(line => {
      const key = line.replace(/^\u2022\s*/, '').trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).join('\n').trim();
  }
  return cleaned.join('\n').trim();
}

// Converts raw text into a clean bullet list, optionally splitting comma-separated lines
function bulletListFromSource(text, splitCommaItems = false) {
  let lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  // If the user wrote items in a single comma-separated line, split into individual items
  if (splitCommaItems && lines.length === 1 && lines[0].includes(',')) {
    lines = lines[0].split(',').map(item => item.trim()).filter(Boolean);
  }
  return lines
    // Strip any existing bullet markers from the user's text
    .map(line => line.replace(/^(?:[-*+\u2022]|\d+[.)])\s+/, '').trim())
    // Remove lines that are just "I want to make a shopping list" (model-like text)
    .filter(line => !/^(?:i\s+)?(?:want|need)\s+to\s+(?:make|create)\s+(?:a\s+)?(?:shopping\s+)?list\b[.!]?$/i.test(line))
    .map(line => line
      // Strip conversational lead-ins for cleaner items
      .replace(/^(?:i\s+want|i\s+need|i\s+would\s+like)\s+/i, '')
      .replace(/^(?:and|also|then)\s+/i, '')
      .replace(/^actual(?:ly)?\s*[,;:]?\s*/i, '')
      .trim())
    .filter(Boolean)
    // Prepend unicode bullet to each item
    .map(line => '\u2022 ' + line).join('\n');
}

// Detects whether the model returned commentary instead of the requested result
function isModelCommentary(text) {
  return /(?:here is|proofread version|this version|the requested changes|the author's|author's original|this note has been|changes made|without adding)/i.test(String(text || ''));
}

// Returns the original text if the model's result is unsafe (too long, commentary, etc.)
function preserveSourceStructure(source, result) {
  const original = String(source || '');
  const corrected = String(result || '').trim();
  const sourceLines = original.split(/\r?\n/).length;
  const resultLines = corrected.split(/\r?\n/).length;
  // Reject if the model added more than 45% extra characters or 100 chars
  const tooLong = corrected.length > Math.max(original.length * 1.45, original.length + 100);
  // Reject if the model returned commentary, markdown headings, or separators
  const unsafe = !corrected || isModelCommentary(corrected) || /^\*\*[^*]+\*\*/.test(corrected) || /^---+$/.test(corrected);
  // Reject if the model collapsed multiple lines into one (lost structure)
  return unsafe || tooLong || (sourceLines > 1 && resultLines < sourceLines) ? original : corrected;
}

// Checks whether the model invented quantity descriptions that weren't in the source
function hasInventedQuantities(source, result) {
  const original = String(source || '').toLowerCase();
  const formatted = String(result || '').toLowerCase();
  // Match patterns like "2 bags", "500ml", "1kg", etc.
  const quantityPattern = /\b\d+(?:\.\d+)?\s*(?:bags?|bottles?|boxes?|packs?|pieces?|items?|cans?|jars?|cartons?|lit(?:re|er)s?|kg|g|grams?|ml|millilit(?:re|er)s?)\b/g;
  const sourceQuantities = new Set(original.match(quantityPattern) || []);
  return (formatted.match(quantityPattern) || []).some(quantity => !sourceQuantities.has(quantity));
}

// Heuristic: decides whether a note looks like a list that should be formatted as bullets
function shouldFormatAsList(title, text) {
  // Check if the note title contains list-related words
  const heading = String(title || '').toLowerCase();
  const listHeading = /\b(list|shopping|grocer|grocery|todo|to-do|task|checklist|errand|ingredient|packing|wishlist)\b/.test(heading);
  const lines = String(text || '').split(/\r?\n/).filter(line => line.trim());
  // Count lines that already have bullet or numbered markers
  const markedLines = lines.filter(line => /^\s*(?:[-*+\u2022]|\d+[.)])\s+/.test(line));
  // Count short lines (under 80 chars, no period at end) that look like list items
  const shortLines = lines.filter(line => line.trim().length <= 80 && !/[.!?]$/.test(line.trim()));
  return listHeading ||
    // If at least half the lines are already marked as bullets, treat as list
    (lines.length >= 3 && markedLines.length >= Math.ceil(lines.length / 2)) ||
    // If every line is short and none ends with punctuation, likely a list
    (lines.length >= 3 && shortLines.length === lines.length && !/[.!?]/.test(String(text)));
}

// Sends a prompt to llama.cpp's completion API and returns the response text
function callLlama(prompt, maxTokens = 256, asBulletList = false) {
  return new Promise((resolve) => {
    // Build the request using the /completion endpoint (stable, works with b10099)
    // We use the old-style prompt format since /v1/chat/completions causes issues
    const fullPrompt = 'You are a precise text editor. Return only the requested result.\n\n' + prompt;
    const data = JSON.stringify({
      prompt: fullPrompt,
      n_predict: maxTokens,
      temperature: 0.05,
      top_p: 0.9,
      repeat_penalty: 1.15,
      repeat_last_n: 128,
      stream: false
    });
    // Use the /completion endpoint (not /v1/chat/completions) for compatibility
    const req = http.request({
      hostname: LLAMA_HOST,
      port: LLAMA_PORT,
      path: '/completion',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          // /completion returns {content: "..."} directly
          const response = JSON.parse(body);
          const content = response.content || '';
          resolve(cleanModelOutput(content, asBulletList));
        } catch { resolve(''); }
      });
    });
    req.on('error', () => resolve(''));
    req.setTimeout(60000, () => { req.destroy(); resolve(''); });
    req.write(data);
    req.end();
  });
}

// Ensures bundled files exist, then starts the llama.cpp server
async function ensureAI() {
  try {
    if (await isServerRunning()) {
      aiStatus = { stage: 'ready', detail: '' };
      sendAIStatus();
      return;
    }

    if (!fs.existsSync(serverPath)) {
      throw new Error('llama-server.exe not found in ' + path.dirname(serverPath) + ' - reinstall the app');
    }
    if (!fs.existsSync(modelPath)) {
      throw new Error('model.gguf not found in ' + path.dirname(modelPath) + ' - reinstall the app');
    }

    aiStatus = { stage: 'starting', detail: 'Starting AI server...' };
    sendAIStatus();
    const started = await startServer();
    if (!started) throw new Error('AI server failed to start');

    aiStatus = { stage: 'ready', detail: '' };
    sendAIStatus();
  } catch (err) {
    aiStatus = { stage: 'error', detail: err.message };
    sendAIStatus();
  }
}

// IPC handler: loads notes from disk on renderer request
ipcMain.handle('notes:load', () => {
  return loadData(notesPath) || [];
});

// IPC handler: saves notes array to disk on renderer request
ipcMain.handle('notes:save', (_e, notes) => {
  saveData(notesPath, notes);
  return true;
});

// IPC handler: loads theme preference from disk
ipcMain.handle('theme:load', () => {
  return loadData(themePath) || { mode: 'dark' };
});

// IPC handler: saves theme preference to disk
ipcMain.handle('theme:save', (_e, mode) => {
  saveData(themePath, { mode });
  return true;
});

// IPC handler: returns current AI setup status
ipcMain.handle('ai:get-status', () => aiStatus);

// IPC handler: detects list-like notes and applies smart formatting with bullet cleanup
ipcMain.handle('ai:fix-text', async (_e, payload) => {
  const title = payload?.title || '';
  const text = payload?.text || '';
  const listMode = shouldFormatAsList(title, text);
  if (!listMode) {
    // For paragraph notes: only fix spelling and punctuation, preserve structure
    const corrected = await callLlama('Proofread the note below. Fix only clear spelling errors and punctuation mistakes. Never replace a correctly spelled word with a synonym or rewrite the author\'s wording. Keep the exact paragraph and line structure. Do not add a title, bullets, numbering, commentary, or new content. Return only the note text.\n\n<note>\n' + text + '\n</note>', 256);
    return preserveSourceStructure(text, corrected);
  }
  const titleSuggestsList = /\b(list|shopping|grocer|todo|task|checklist|errand|ingredient|packing|wishlist)\b/i.test(String(title));
  // Build the item boundaries from the user's text, not from the small model.
  // This prevents hallucinated, duplicated, or dropped list items.
  const safeFormatted = bulletListFromSource(text, titleSuggestsList);
  const proofread = await callLlama('Correct only clear spelling and punctuation mistakes in this bullet list. For example, change "choclate" to "chocolate". Keep every bullet, item, quantity, and line break exactly as provided. Never add quantities or other details. Return only the corrected bullet list with no explanation.\n\n' + safeFormatted, 256, true);
  const safeProofread = preserveSourceStructure(safeFormatted, proofread);
  return hasInventedQuantities(text, safeProofread) || isModelCommentary(safeProofread)
    ? safeFormatted
    : safeProofread;
});

// IPC handler: lightweight proofreading that only fixes obvious spelling/punctuation
ipcMain.handle('ai:proofread-text', async (_e, payload) => {
  const title = payload?.title || '';
  const text = payload?.text || '';
  const corrected = await callLlama('Proofread this note. Fix only clear spelling errors and punctuation mistakes. Never replace a correctly spelled word with a synonym or rewrite the author\'s wording. Do not change structure, formatting, paragraph breaks, or meaning. Do not add bullets, headings, or explanations. Return only the corrected note.\n\nTitle: ' + title + '\n\nContent:\n' + text, 256);
  return preserveSourceStructure(text, corrected);
});

// IPC handler: generates a concise title from note content using AI
ipcMain.handle('ai:generate-title', async (_e, content) => {
  const title = await callLlama('Generate a concise title (max 6 words) for the following note. Return ONLY the title text, nothing else.\n\n' + content);
  return title.replace(/^["']|["']$/g, '').trim();
});

// IPC listener: minimizes the main window
ipcMain.on('window:minimize', () => mainWin?.minimize());
// IPC listener: toggles maximize/restore state of the main window
ipcMain.on('window:maximize', () => {
  if (mainWin?.isMaximized()) {
    mainWin?.unmaximize();
  } else {
    mainWin?.maximize();
  }
});
// IPC listener: closes the main window
ipcMain.on('window:close', () => mainWin?.close());
// IPC handler: returns whether the window is currently maximized
ipcMain.handle('window:isMaximized', () => mainWin?.isMaximized() ?? false);

// Creates the main application window with custom titlebar
function createWindow() {
  mainWin = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 500,
    minHeight: 400,
    frame: false,
    backgroundColor: '#1a1a1a',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWin.setMenu(null);
  mainWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWin.on('maximize', () => mainWin.webContents.send('window:maximized-changed', true));
  mainWin.on('unmaximize', () => mainWin.webContents.send('window:maximized-changed', false));
}

// Bootstrap the app once Electron is ready
app.whenReady().then(() => {
  createWindow();
  ensureAI();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit the app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

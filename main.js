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

// Reference to the main BrowserWindow instance
let mainWin = null;
// Tracks AI setup progress stage and detail message
let aiStatus = { stage: 'checking', detail: '' };

// Reads and parses a JSON file from disk, returns null on failure
function loadData(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
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
    const req = http.get(`http://localhost:${LLAMA_PORT}/health`, (res) => {
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
      '--port', String(LLAMA_PORT),
      '--embedding', '0',
      '-ngl', '99'
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

// Sends a prompt to llama.cpp's completion API and returns the response text
function callLlama(prompt) {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      prompt: prompt,
      n_predict: -1,
      temperature: 0.1,
      stream: false
    });
    const req = http.request({
      hostname: 'localhost',
      port: LLAMA_PORT,
      path: '/completion',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body).content || '');
        }
        catch { resolve(''); }
      });
    });
    req.on('error', () => resolve(''));
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

// IPC handler: sends text to llama.cpp for spelling/formatting correction
ipcMain.handle('ai:fix-text', async (_e, text) => {
  return await callLlama('Fix only spelling errors and formatting issues in the following text. Do not rewrite content or change the author\'s voice. Only fix obvious typos, punctuation, and line breaks. Return only the corrected text without any explanation or preamble.\n\n' + text);
});

// IPC handler: generates a concise title from note content using AI
ipcMain.handle('ai:generate-title', async (_e, content) => {
  const title = await callLlama('Generate a concise title (max 6 words) for the following note. Return ONLY the title text, nothing else.\n\n' + content);
  return title.replace(/^["\']|["\']$/g, '').trim();
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

// Import Electron modules for desktop app functionality
const { app, BrowserWindow, ipcMain } = require('electron');
// Import path module for cross-platform file paths
const path = require('path');
// Import filesystem module for reading/writing files
const fs = require('fs');
// Import http module for making HTTP requests to local Ollama API
const http = require('http');
// Import https module for downloading files over HTTPS
const https = require('https');
// Import child_process spawn for running Ollama as a subprocess
const { spawn } = require('child_process');

// Path to the notes JSON file stored in user's appData directory
const notesPath = path.join(app.getPath('userData'), 'notes.json');
// Path to the theme preference JSON file
const themePath = path.join(app.getPath('userData'), 'theme.json');

// Reference to the main BrowserWindow instance
let mainWin = null;
// Tracks AI setup progress stage and detail message
let aiStatus = { stage: 'checking', detail: '' };

// Reads and parses a JSON file from disk, returns null on failure
function loadData(filePath) {
  try {
    // Check if the file exists before attempting to read
    if (fs.existsSync(filePath)) {
      // Read file contents as UTF-8 string
      const data = fs.readFileSync(filePath, 'utf-8');
      // Parse and return the JSON data
      return JSON.parse(data);
    }
  } catch (_) {} // Silently ignore corrupt or missing files
  return null;
}

// Writes a JSON object to disk with pretty formatting
function saveData(filePath, data) {
  try {
    // Serialize data to JSON with 2-space indentation and write to file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (_) {} // Silently ignore write errors (e.g., disk full)
}

// Sends current AI status to renderer via Electron IPC
function sendAIStatus() {
  // Send status object to renderer's 'ai:status' channel
  mainWin?.webContents.send('ai:status', aiStatus);
}

// Searches for ollama.exe on the system PATH and common install locations
function findOllama() {
  // List of common Ollama installation directories
  const common = [
    // User-level installation path (most common for per-user installs)
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
    // Alternative user-level installation path
    path.join(process.env.LOCALAPPDATA || '', 'Ollama', 'ollama.exe'),
    // System-wide installation path
    path.join(process.env.PROGRAMFILES || '', 'Ollama', 'ollama.exe')
  ];
  // Split PATH environment variable into individual directories
  const pathDirs = (process.env.PATH || '').split(';');
  // Check PATH directories first, then common install locations
  for (const dir of [...pathDirs, ...common]) {
    try {
      // Construct full path to ollama.exe
      const fp = path.join(dir.trim(), 'ollama.exe');
      // Return the first existing path found
      if (fs.existsSync(fp)) return fp;
    } catch (_) {} // Skip invalid path entries
  }
  // Return null if Ollama was not found anywhere
  return null;
}

// Checks if the Ollama API server is running and responding
function isOllamaRunning() {
  return new Promise((resolve) => {
    // Send GET request to Ollama's list models endpoint
    const req = http.get('http://localhost:11434/api/tags', (res) => {
      // Resolve true if server returns HTTP 200 OK
      resolve(res.statusCode === 200);
    });
    // Resolve false on connection error (server not running)
    req.on('error', () => resolve(false));
    // Timeout after 3 seconds to avoid hanging
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

// Downloads a file from a URL and saves it to disk
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    // Create a writable file stream to save the downloaded data
    const file = fs.createWriteStream(dest);
    // Make HTTPS GET request to the download URL
    https.get(url, (res) => {
      // Handle HTTP redirects (status 3xx)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect by making a new request to the target URL
        https.get(res.headers.location, (r2) => {
          // Reject if the redirected request also fails
          if (r2.statusCode !== 200) { reject(new Error('Download failed: ' + r2.statusCode)); return; }
          // Pipe the response data directly to the file
          r2.pipe(file); file.on('finish', () => { file.close(); resolve(); });
        }).on('error', reject);
        return;
      }
      // Reject if non-redirect response is not 200 OK
      if (res.statusCode !== 200) { reject(new Error('Download failed: ' + res.statusCode)); return; }
      // Pipe response data directly to the output file
      res.pipe(file); file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

// Starts Ollama as a background service and waits for it to be ready
function startOllama(ollamaPath) {
  return new Promise((resolve) => {
    // Spawn ollama serve as a detached child process (runs independently)
    const proc = spawn(ollamaPath, ['serve'], { detached: true, stdio: 'ignore' });
    // Allow the child process to outlive the parent
    proc.unref();
    // Track how long we've been waiting for Ollama to start
    let waited = 0;
    // Poll every second to check if Ollama is responding
    const iv = setInterval(async () => {
      waited += 1000;
      // If Ollama responds, we're done
      if (await isOllamaRunning()) { clearInterval(iv); resolve(true); }
      // Give up after 15 seconds
      else if (waited > 15000) { clearInterval(iv); resolve(false); }
    }, 1000);
  });
}

// Pulls the AI model using ollama pull command with progress reporting
function pullModel() {
  return new Promise((resolve, reject) => {
    // Find Ollama binary path
    const ollamaPath = findOllama();
    // Reject if Ollama is not installed
    if (!ollamaPath) { reject(new Error('Ollama not found')); return; }
    // Run 'ollama pull qwen2.5:0.5b' to download the AI model
    const proc = spawn(ollamaPath, ['pull', 'qwen2.5:0.5b']);
    // Buffer for tracking the last line of stdout output
    let lastLine = '';
    // Capture stdout lines for progress reporting to the renderer
    proc.stdout?.on('data', (d) => {
      // Convert buffer to string and trim whitespace
      const line = d.toString().trim();
      // Store the most recent progress line
      if (line) lastLine = line;
      // Update status with truncated progress detail
      aiStatus = { stage: 'pulling', detail: line.slice(0, 60) };
      // Notify renderer of progress update
      sendAIStatus();
    });
    // Resolve or reject based on process exit code
    proc.on('close', (code) => {
      code === 0 ? resolve() : reject(new Error('Pull failed'));
    });
    // Reject if unable to spawn the process
    proc.on('error', reject);
  });
}

// Sends a prompt to Ollama's generate API and returns the response text
function callOllama(prompt) {
  return new Promise((resolve) => {
    // Prepare the JSON request body for Ollama API
    const data = JSON.stringify({
      // Use the small 500M parameter model
      model: 'qwen2.5:0.5b',
      // The text prompt to send
      prompt: prompt,
      // Disable streaming - wait for full response
      stream: false,
      // Low temperature for predictable, consistent output
      options: { temperature: 0.1 }
    });
    // Make HTTP POST request to Ollama's generate endpoint
    const req = http.request({
      hostname: 'localhost', // Ollama runs on localhost
      port: 11434,           // Default Ollama API port
      path: '/api/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      // Accumulate response chunks into a single string
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          // Parse JSON response and extract the generated text
          resolve(JSON.parse(body).response || '');
        }
        catch { resolve(''); } // Return empty string on parse error
      });
    });
    // Return empty string on request failure
    req.on('error', () => resolve(''));
    // Send the JSON payload to Ollama
    req.write(data);
    // Finalize the request
    req.end();
  });
}

// Main orchestration: ensures Ollama is installed, running, and model is downloaded
async function ensureOllama() {
  try {
    // Check if Ollama is already running and ready
    if (await isOllamaRunning()) {
      // Set status to ready immediately if service is available
      aiStatus = { stage: 'ready', detail: '' };
      sendAIStatus();
      return;
    }

    // Try to find existing Ollama installation
    let ollamaPath = findOllama();
    // If Ollama is not installed, download and install it
    if (!ollamaPath) {
      // Notify renderer that download is starting
      aiStatus = { stage: 'installing', detail: 'Downloading Ollama...' };
      sendAIStatus();
      // Use system temp directory for the installer
      const tmpDir = app.getPath('temp');
      const installerPath = path.join(tmpDir, 'OllamaSetup.exe');
      // Remove any leftover installer from previous attempts
      try { fs.unlinkSync(installerPath); } catch (_) {}
      // Download the Ollama Windows installer from official source
      await downloadFile('https://ollama.com/download/OllamaSetup.exe', installerPath);
      // Update status to show installation is in progress
      aiStatus = { stage: 'installing', detail: 'Running installer...' };
      sendAIStatus();
      // Run the installer silently (/S flag for NSIS silent install)
      await new Promise((resolve, reject) => {
        const proc = spawn(installerPath, ['/S'], { stdio: 'ignore' });
        proc.on('close', (code) => code === 0 ? resolve() : reject(new Error('Install failed')));
        proc.on('error', reject);
      });
      // Wait for installation to complete (poll for up to 120 seconds)
      let attempts = 0;
      while (!ollamaPath && attempts < 60) {
        // Wait 2 seconds between each check
        await new Promise(r => setTimeout(r, 2000));
        ollamaPath = findOllama();
        attempts++;
      }
      // Throw if Ollama binary still not found after waiting
      if (!ollamaPath) throw new Error('Ollama not found after install');
    }

    // Start Ollama as a background service if it's installed but not running
    aiStatus = { stage: 'starting', detail: 'Starting Ollama...' };
    sendAIStatus();
    // Launch ollama serve and wait for it to respond
    const started = await startOllama(ollamaPath);
    // Throw if Ollama failed to start within the timeout window
    if (!started) throw new Error('Failed to start Ollama service');

    // Download the AI model if not already cached locally
    aiStatus = { stage: 'pulling', detail: 'Downloading AI model...' };
    sendAIStatus();
    // Pull the qwen2.5:0.5b model (about 400MB download)
    await pullModel();

    // Mark AI as fully ready for use
    aiStatus = { stage: 'ready', detail: '' };
    sendAIStatus();
  } catch (err) {
    // If anything fails, report the error to the renderer
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

// IPC handler: sends text to Ollama for spelling/formatting correction
ipcMain.handle('ai:fix-text', async (_e, text) => {
  // Prompt instructs model to only fix errors, not rewrite content
  return await callOllama('Fix only spelling errors and formatting issues in the following text. Do not rewrite content or change the author\'s voice. Only fix obvious typos, punctuation, and line breaks. Return only the corrected text without any explanation or preamble.\n\n' + text);
});

// IPC handler: generates a concise title from note content using AI
ipcMain.handle('ai:generate-title', async (_e, content) => {
  // Ask model for a short title, then strip any surrounding quotes
  const title = await callOllama('Generate a concise title (max 6 words) for the following note. Return ONLY the title text, nothing else.\n\n' + content);
  return title.replace(/^["\']|["\']$/g, '').trim();
});

// IPC listener: minimizes the main window
ipcMain.on('window:minimize', () => mainWin?.minimize());
// IPC listener: toggles maximize/restore state of the main window
ipcMain.on('window:maximize', () => {
  if (mainWin?.isMaximized()) {
    mainWin?.unmaximize(); // Restore if already maximized
  } else {
    mainWin?.maximize();   // Maximize if currently restored
  }
});
// IPC listener: closes the main window
ipcMain.on('window:close', () => mainWin?.close());
// IPC handler: returns whether the window is currently maximized
ipcMain.handle('window:isMaximized', () => mainWin?.isMaximized() ?? false);

// Creates the main application window with custom titlebar
function createWindow() {
  mainWin = new BrowserWindow({
    width: 900,         // Default window width in pixels
    height: 700,        // Default window height in pixels
    minWidth: 500,      // Minimum window width
    minHeight: 400,     // Minimum window height
    frame: false,       // Remove native window frame for custom titlebar
    backgroundColor: '#1a1a1a', // Dark background to prevent white flash
    icon: path.join(__dirname, 'build', 'icon.ico'), // App icon
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Preload script for secure IPC
      contextIsolation: true,  // Isolate renderer from Node.js for security
      nodeIntegration: false,  // Disable direct Node.js access in renderer
      sandbox: false           // Allow preload script full Node.js access
    }
  });

  // Remove the default Electron menu bar
  mainWin.setMenu(null);
  // Load the renderer HTML file
  mainWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Forward maximize/unmaximize events to the renderer
  mainWin.on('maximize', () => mainWin.webContents.send('window:maximized-changed', true));
  mainWin.on('unmaximize', () => mainWin.webContents.send('window:maximized-changed', false));
}

// Bootstrap the app once Electron is ready
app.whenReady().then(() => {
  // Create the main window first
  createWindow();

  // Start AI setup (Ollama check/install/start) in background
  ensureOllama();

  // Handle macOS dock icon click - recreate window if needed
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

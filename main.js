const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const notesPath = path.join(app.getPath('userData'), 'notes.json');
const themePath = path.join(app.getPath('userData'), 'theme.json');

let mainWin = null;

function loadData(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (_) { /* ignore corrupt files */ }
  return null;
}

function saveData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (_) { /* ignore write errors */ }
}

ipcMain.handle('notes:load', () => {
  return loadData(notesPath) || [];
});

ipcMain.handle('notes:save', (_e, notes) => {
  saveData(notesPath, notes);
  return true;
});

ipcMain.handle('theme:load', () => {
  return loadData(themePath) || { mode: 'dark' };
});

ipcMain.handle('theme:save', (_e, mode) => {
  saveData(themePath, { mode });
  return true;
});

ipcMain.on('window:minimize', () => mainWin?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWin?.isMaximized()) {
    mainWin?.unmaximize();
  } else {
    mainWin?.maximize();
  }
});
ipcMain.on('window:close', () => mainWin?.close());
ipcMain.handle('window:isMaximized', () => mainWin?.isMaximized() ?? false);

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

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

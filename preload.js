// Import Electron's contextBridge (secure IPC) and ipcRenderer (communicate with main)
const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe 'api' object to the renderer process (no direct Node.js access)
contextBridge.exposeInMainWorld('api', {
  // Note CRUD operations - persist notes to JSON file via main process
  notes: {
    load: () => ipcRenderer.invoke('notes:load'),       // Load all notes from disk
    save: (notes) => ipcRenderer.invoke('notes:save', notes) // Save all notes to disk
  },
  // Theme persistence - save/load dark/light mode preference
  theme: {
    load: () => ipcRenderer.invoke('theme:load'),         // Load saved theme preference
    save: (mode) => ipcRenderer.invoke('theme:save', mode) // Save theme preference
  },
  // Window controls - communicate titlebar button actions to main process
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),          // Minimize window
    maximize: () => ipcRenderer.send('window:maximize'),          // Toggle maximize/restore
    close: () => ipcRenderer.send('window:close'),                // Close the app
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),  // Check if maximized
    // Subscribe to maximize state changes from main process
    onMaximizedChanged: (callback) => {
      ipcRenderer.on('window:maximized-changed', (_e, val) => callback(val));
    }
  },
  // AI features - local llama.cpp integration for text processing
  ai: {
    // Format a note using its title and content as context
    fixText: (title, text) => ipcRenderer.invoke('ai:fix-text', { title, text }),
    // Automatically correct only obvious spelling and punctuation mistakes
    proofreadText: (title, text) => ipcRenderer.invoke('ai:proofread-text', { title, text }),
    // Generate a note title from content using local AI model
    generateTitle: (content) => ipcRenderer.invoke('ai:generate-title', content),
    // Poll current AI setup status (checking/installing/ready/error)
    getStatus: () => ipcRenderer.invoke('ai:get-status'),
    // Subscribe to live AI status updates from the setup process
    onStatusChanged: (callback) => {
      ipcRenderer.on('ai:status', (_e, status) => callback(status));
    }
  }
});

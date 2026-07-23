const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  notes: {
    load: () => ipcRenderer.invoke('notes:load'),
    save: (notes) => ipcRenderer.invoke('notes:save', notes)
  },
  theme: {
    load: () => ipcRenderer.invoke('theme:load'),
    save: (mode) => ipcRenderer.invoke('theme:save', mode)
  }
});

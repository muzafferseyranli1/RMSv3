const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('terminal:getConfig'),
  saveTerminalConfig: (payload) => ipcRenderer.invoke('terminal:save-config', payload),
  getQueueSize: () => ipcRenderer.invoke('queue:getSize')
});

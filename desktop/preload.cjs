const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('terminal:getConfig'),
  getConfigSync: () => ipcRenderer.sendSync('terminal:getConfigSync'),
  saveTerminalConfig: (payload) => ipcRenderer.invoke('terminal:save-config', payload),
  getQueueSize: () => ipcRenderer.invoke('queue:getSize'),
  exitApp: () => ipcRenderer.invoke('app:exit'),
  minimizeApp: () => ipcRenderer.invoke('app:minimize')
});

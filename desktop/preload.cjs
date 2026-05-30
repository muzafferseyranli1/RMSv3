const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('terminal:getConfig'),
  getConfigSync: () => ipcRenderer.sendSync('terminal:getConfigSync'),
  saveTerminalConfig: (payload) => ipcRenderer.invoke('terminal:save-config', payload),
  getQueueSize: () => ipcRenderer.invoke('queue:getSize'),
  exitApp: () => ipcRenderer.invoke('app:exit'),
  minimizeApp: () => ipcRenderer.invoke('app:minimize'),
  onUpdateReady: (callback) => {
    const subscription = (_event, info) => callback(info);
    ipcRenderer.on('update:ready', subscription);
    return () => ipcRenderer.removeListener('update:ready', subscription);
  },
  applyUpdate: () => ipcRenderer.invoke('update:apply')
});

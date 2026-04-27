const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  onUpdateMessage: (callback) => ipcRenderer.on('update-message', (event, msg) => callback(msg)),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (event, ver) => callback(ver)),
  onUpdateDownloading: (callback) => ipcRenderer.on('update-downloading', (event, percent) => callback(percent)),
  onUpdateReady: (callback) => ipcRenderer.on('update-ready', () => callback()),
  onUpdateError: (callback) => ipcRenderer.on('update-error', (event, err) => callback(err)),
  restartApp: () => ipcRenderer.send('restart-app')
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  closeApp: () => ipcRenderer.invoke('close-app'),
  hideApp: () => ipcRenderer.invoke('hide-app'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  setHotkey: (hotkey) => ipcRenderer.invoke('set-hotkey', hotkey),
  setCycleHotkey: (hotkey) => ipcRenderer.invoke('set-cycle-hotkey', hotkey),
  onNewTabRequest: (callback) => ipcRenderer.on('new-tab-request', (_event, value) => callback(value))
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  closeApp: () => ipcRenderer.invoke('close-app'),
  hideApp: () => ipcRenderer.invoke('hide-app'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  setHotkey: (hotkey) => ipcRenderer.invoke('set-hotkey', hotkey),
  setCycleHotkey: (hotkey) => ipcRenderer.invoke('set-cycle-hotkey', hotkey),
  onNewTabRequest: (callback) => ipcRenderer.on('new-tab-request', (_event, value) => callback(value)),
  
  // Voice Assistant API
  readCommands: () => ipcRenderer.invoke('read-commands'),
  writeCommands: (commands) => ipcRenderer.invoke('write-commands', commands),
  readSettings: () => ipcRenderer.invoke('read-settings'),
  writeSettings: (settings) => ipcRenderer.invoke('write-settings', settings),
  readLogs: () => ipcRenderer.invoke('read-logs'),
  readLog: (filename) => ipcRenderer.invoke('read-log', filename),
  readLogAudio: (filename) => ipcRenderer.invoke('read-log-audio', filename),
  writeLog: (filename, content) => ipcRenderer.invoke('write-log', filename, content),
  deleteLog: (filename) => ipcRenderer.invoke('delete-log', filename),
  toggleVoice: (enabled) => ipcRenderer.invoke('toggle-voice', enabled),
  getVoiceStatus: () => ipcRenderer.invoke('get-voice-status'),
  getVoices: () => ipcRenderer.invoke('get-voices'),
  getPersonalities: () => ipcRenderer.invoke('get-personalities'),
  readPersonality: (filename) => ipcRenderer.invoke('read-personality', filename),
  writePersonality: (filename, content) => ipcRenderer.invoke('write-personality', filename, content),
  deletePersonality: (filename) => ipcRenderer.invoke('delete-personality', filename),
  getPresets: () => ipcRenderer.invoke('get-presets'),
  readPreset: (filename) => ipcRenderer.invoke('read-preset', filename),
  writePreset: (filename, content) => ipcRenderer.invoke('write-preset', filename, content),
  deletePreset: (filename) => ipcRenderer.invoke('delete-preset', filename),
  onVoiceOutput: (callback) => ipcRenderer.on('voice-output', (_event, value) => callback(value)),
  onVoiceStatusChanged: (callback) => ipcRenderer.on('voice-status-changed', (_event, value) => callback(value)),
  testVoice: (text) => ipcRenderer.invoke('test-voice', text),
  
  // Backup API
  selectBackupDir: () => ipcRenderer.invoke('select-backup-dir'),
  backupLogs: () => ipcRenderer.invoke('backup-logs'),

  // Session API
  saveSession: (state) => ipcRenderer.invoke('save-session', state),
  loadSession: () => ipcRenderer.invoke('load-session')
});

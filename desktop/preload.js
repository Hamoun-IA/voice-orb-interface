const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voiceOrbDesktop', {
  isDesktop: true,
  minimizeWindow: () => ipcRenderer.invoke('voice-orb:minimize'),
  closeWindow: () => ipcRenderer.invoke('voice-orb:close'),
  toggleCompactMode: () => ipcRenderer.invoke('voice-orb:toggle-compact'),
  getOverlayState: () => ipcRenderer.invoke('voice-orb:get-overlay-state'),
  onCompactModeChanged: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, compact) => callback(Boolean(compact));
    ipcRenderer.on('voice-orb:compact-changed', listener);
    return () => ipcRenderer.removeListener('voice-orb:compact-changed', listener);
  },
});

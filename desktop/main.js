const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const WEB_ENTRY = path.resolve(__dirname, '../web/index.html');
const DEFAULT_BOUNDS = {
  width: 420,
  height: 760,
};
const COMPACT_BOUNDS = {
  width: 320,
  height: 420,
};

let mainWindow;
let isCompactMode = false;

function applyWindowProfile(window, compact = false) {
  isCompactMode = compact;
  const nextBounds = compact ? COMPACT_BOUNDS : DEFAULT_BOUNDS;
  window.setMinimumSize(COMPACT_BOUNDS.width, COMPACT_BOUNDS.height);
  window.setSize(nextBounds.width, nextBounds.height, true);
  window.webContents.send('voice-orb:compact-changed', compact);
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: DEFAULT_BOUNDS.width,
    height: DEFAULT_BOUNDS.height,
    minWidth: COMPACT_BOUNDS.width,
    minHeight: COMPACT_BOUNDS.height,
    maxWidth: 520,
    maxHeight: 920,
    show: false,
    center: true,
    frame: false,
    transparent: true,
    titleBarStyle: 'hidden',
    alwaysOnTop: true,
    resizable: true,
    movable: true,
    hasShadow: true,
    autoHideMenuBar: true,
    backgroundColor: '#00000000',
    title: 'Voice Orb Interface',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => {
    window.setAlwaysOnTop(true, 'screen-saver');
    window.show();
  });

  window.loadFile(WEB_ENTRY);
  window.webContents.on('did-finish-load', () => {
    window.webContents.send('voice-orb:compact-changed', isCompactMode);
  });
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  return window;
}

ipcMain.handle('voice-orb:minimize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  mainWindow.minimize();
  return true;
});

ipcMain.handle('voice-orb:close', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  mainWindow.close();
  return true;
});

ipcMain.handle('voice-orb:toggle-compact', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { compact: false };
  }

  const nextCompact = !isCompactMode;

  applyWindowProfile(mainWindow, nextCompact);
  return { compact: nextCompact };
});

ipcMain.handle('voice-orb:get-overlay-state', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { compact: false };
  }

  return {
    compact: isCompactMode,
  };
});

app.whenReady().then(() => {
  mainWindow = createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

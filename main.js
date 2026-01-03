const { app, BrowserWindow, ipcMain, globalShortcut, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');

let serverProcess;
let mainWindow;
let currentHotkey = null;
let currentCycleHotkey = null;
let isFakeFullScreen = false;
let savedWindowBounds = null;

const stateFile = path.join(app.getPath('userData'), 'window-state.json');

function parseArgs(argv) {
  const args = {};
  
  // Debug logging
  const logPath = path.join(app.getPath('userData'), 'args-debug.log');
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] Raw argv: ${JSON.stringify(argv)}\n`);

  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];

    // Handle --flag=value syntax (prevents Electron from reordering args)
    if (arg.startsWith('--') && arg.includes('=')) {
        const parts = arg.split('=');
        const key = parts[0];
        const value = parts.slice(1).join('=');
        
        if (key === '--execute') args.command = value;
        if (key === '--title') args.title = value;
        if (key === '--new-tab') {
            args.newTab = true;
            if (value) args.cwd = value;
        }
        if (key === '--close') args.closeTitle = value;
        continue;
    }

    if (arg === '-e' || arg === '--execute') {
      if (argv[i+1] && !argv[i+1].startsWith('-')) {
        args.command = argv[i+1];
        i++;
      }
    }
    else if (arg === '-r' || arg === '--title') {
      if (argv[i+1] && !argv[i+1].startsWith('-')) {
        args.title = argv[i+1];
        i++;
      }
    }
    else if (arg === '-n' || arg === '--new-tab') {
        args.newTab = true;
        if (argv[i+1] && !argv[i+1].startsWith('-')) {
            args.cwd = argv[i+1];
            i++;
        }
    }
    else if (arg === '-c' || arg === '--close') {
        if (argv[i+1] && !argv[i+1].startsWith('-')) {
            args.closeTitle = argv[i+1];
            i++;
        }
    }
  }
  
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] Parsed args: ${JSON.stringify(args)}\n`);
  return args;
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(stateFile, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save window state:', e);
  }
}

async function createWindow() {
  const state = loadState();
  
  let port = 3000;
  try {
    port = await startServer();
  } catch (e) {
    console.error('Failed to start server:', e);
  }

  mainWindow = new BrowserWindow({
    width: state.width || 1200,
    height: state.height || 800,
    x: state.x,
    y: state.y,
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'public/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true,
    frame: false // Frameless for that immersive LCARS feel
  });

  if (state.isFullScreen) {
    isFakeFullScreen = true;
    // Bounds are already set from state, which should be fullscreen size
  }

  mainWindow.loadURL(`http://localhost:${port}`);
    
  // Handle initial args
  const args = parseArgs(process.argv);
  if (args.newTab || args.command || args.title || args.closeTitle) {
      // Wait for page to be ready
      setTimeout(() => {
          mainWindow.webContents.send('new-tab-request', args);
      }, 1000);
  }

  mainWindow.on('close', function () {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      saveState({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isFullScreen: isFakeFullScreen
      });
    }
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
      
      const args = parseArgs(commandLine);
      if (args.newTab || args.command || args.title || args.closeTitle) {
          mainWindow.webContents.send('new-tab-request', args);
      }
    }
  });

  app.on('ready', () => {
    createWindow();
  });
}

// IPC Handlers
ipcMain.handle('toggle-fullscreen', () => {
  if (!mainWindow) return;
  
  if (isFakeFullScreen) {
      isFakeFullScreen = false;
      if (savedWindowBounds) {
          mainWindow.setBounds(savedWindowBounds);
      } else {
          mainWindow.setSize(1200, 800);
          mainWindow.center();
      }
  } else {
      isFakeFullScreen = true;
      savedWindowBounds = mainWindow.getBounds();
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      mainWindow.setBounds(display.bounds);
  }
});

ipcMain.handle('close-app', () => {
  app.quit();
});

ipcMain.handle('hide-app', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('set-hotkey', (event, hotkey) => {
  if (currentHotkey) {
    globalShortcut.unregister(currentHotkey);
  }
  
  currentHotkey = hotkey;
  
  try {
    globalShortcut.register(hotkey, () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          // Just show the window, don't move it
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  } catch (e) {
    console.error(`Failed to register hotkey ${hotkey}:`, e);
  }
});

ipcMain.handle('set-cycle-hotkey', (event, hotkey) => {
  if (currentCycleHotkey) {
    globalShortcut.unregister(currentCycleHotkey);
  }
  
  currentCycleHotkey = hotkey;
  
  try {
    globalShortcut.register(hotkey, () => {
      if (mainWindow) {
        const displays = screen.getAllDisplays();
        if (displays.length <= 1) return;

        const currentBounds = mainWindow.getBounds();
        const center = {
            x: currentBounds.x + currentBounds.width / 2,
            y: currentBounds.y + currentBounds.height / 2
        };
        
        const currentDisplayIndex = displays.findIndex(d => {
            return center.x >= d.bounds.x && 
                   center.x < (d.bounds.x + d.bounds.width) &&
                   center.y >= d.bounds.y && 
                   center.y < (d.bounds.y + d.bounds.height);
        });

        let nextIndex = (currentDisplayIndex + 1) % displays.length;
        if (currentDisplayIndex === -1) nextIndex = 0;

        const nextDisplay = displays[nextIndex];

        if (isFakeFullScreen) {
            mainWindow.setBounds(nextDisplay.bounds);
        } else {
            const displayBounds = nextDisplay.workArea;
            const x = displayBounds.x + (displayBounds.width - currentBounds.width) / 2;
            const y = displayBounds.y + (displayBounds.height - currentBounds.height) / 2;
            mainWindow.setPosition(Math.round(x), Math.round(y));
        }
        
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (e) {
    console.error(`Failed to register cycle hotkey ${hotkey}:`, e);
  }
});

function startServer() {
  return new Promise((resolve, reject) => {
    // Run the existing server.js as a child process
    serverProcess = fork(path.join(__dirname, 'server.js'), [], {
      env: { ...process.env, PORT: 0 }, // Request random port
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[Server]', output);
      const match = output.match(/running at http:\/\/localhost:(\d+)/);
      if (match) {
        resolve(parseInt(match[1]));
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('[Server Error]', data.toString());
    });
  });
}

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

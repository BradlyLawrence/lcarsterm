const { app, BrowserWindow, ipcMain, globalShortcut, screen, shell, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { fork, spawn } = require('child_process');

let serverProcess;
let voiceProcess;
let isVoiceReady = false;
let mainWindow;
let tray = null;
let currentHotkey = null;
let currentCycleHotkey = null;
let isFakeFullScreen = false;
let savedWindowBounds = null;
let isQuitting = false;

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

// Session State Path
const sessionFile = path.join(app.getPath('userData'), 'session.json');

ipcMain.handle('select-backup-dir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    return result;
});

ipcMain.handle('backup-logs', async () => {
    try {
        const logDir = getLogDir();
        if (!fs.existsSync(logDir)) {
            return { success: false, error: 'No logs directory found to backup.' };
        }
        
        // Get backup location from settings
        let backupDir = path.join(os.homedir(), 'Documents');
        if (fs.existsSync(USER_SETTINGS_PATH)) {
            const settings = JSON.parse(fs.readFileSync(USER_SETTINGS_PATH, 'utf8'));
            if (settings.backup_dir) {
                 if (settings.backup_dir.startsWith('~/')) {
                    backupDir = path.join(os.homedir(), settings.backup_dir.slice(2));
                } else {
                    backupDir = settings.backup_dir;
                }
            }
        }
        
        // Ensure backup dir exists
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `lcars_logs_backup_${timestamp}.tar.gz`;
        const destPath = path.join(backupDir, filename);
        
        // Use tar to archive
        const parentDir = path.dirname(logDir);
        const folderName = path.basename(logDir);
        
        await new Promise((resolve, reject) => {
            const child = spawn('tar', ['-czf', destPath, '-C', parentDir, folderName]);
            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error('tar process exited with code ' + code));
            });
            child.on('error', reject);
        });
        
        return { success: true, path: destPath };
        
    } catch (e) {
        console.error('Backup failed:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('save-session', async (event, session) => {
    try {
        fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
        return { success: true };
    } catch (e) {
        console.error('Failed to save session:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('load-session', async () => {
    try {
        if (fs.existsSync(sessionFile)) {
            return JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        }
        return null;
    } catch (e) {
        console.error('Failed to load session:', e);
        return null;
    }
});

function getScriptPath(relativePath) {
    let p = path.join(__dirname, relativePath);
    if (app.isPackaged) {
        const unpackedPath = p.replace('app.asar', 'app.asar.unpacked');
        if (fs.existsSync(unpackedPath)) {
            return unpackedPath;
        }
    }
    return p;
}

const LCARS_ROOT = app.getPath('userData');
const USER_SETTINGS_PATH = path.join(LCARS_ROOT, 'galactica_settings.json');
const USER_COMMANDS_PATH = path.join(LCARS_ROOT, 'commands.json');
const USER_VOICES_DIR = path.join(LCARS_ROOT, 'voices');
const USER_PERSONALITIES_DIR = path.join(LCARS_ROOT, 'personalities');
const USER_PRESETS_DIR = path.join(LCARS_ROOT, 'presets');

const BUNDLED_SETTINGS_PATH = getScriptPath('voiceassistant/dist/galactica_settings.json');
const BUNDLED_COMMANDS_PATH = getScriptPath('voiceassistant/dist/commands.json');
const BUNDLED_VOICES_DIR = getScriptPath('voiceassistant/dist/voices');
const BUNDLED_PERSONALITIES_DIR = getScriptPath('voiceassistant/dist/personalities');
const BUNDLED_PRESETS_DIR = getScriptPath('voiceassistant/dist/presets');

// Helper to copy directory recursively
function copyDirSync(src, dest) {
    if (!fs.existsSync(src)) return;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (let entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            if (!fs.existsSync(destPath)) { // Only copy if not exists (don't overwrite user changes)
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
}

// Initialize User Data
try {
    // 1. Settings
    if (!fs.existsSync(USER_SETTINGS_PATH)) {
        if (fs.existsSync(BUNDLED_SETTINGS_PATH)) {
            fs.copyFileSync(BUNDLED_SETTINGS_PATH, USER_SETTINGS_PATH);
        } else {
            fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify({
                "user_rank": "Ensign",
                "user_name": "Wesley",
                "user_surname": "Crusher",
                "assistant_name": "Computer",
                "calendar_url": "local",
                "weather_location": "Cape Town",
                "voice_path": "voices/fedcomp/en_US-fedcomp-medium.onnx",
                "personality_file": "personalities/lcars.json",
                "voice_enabled": true,
                "startup_briefing_enabled": true
            }, null, 4));
        }
    }

    // 2. Commands
    if (!fs.existsSync(USER_COMMANDS_PATH) && fs.existsSync(BUNDLED_COMMANDS_PATH)) {
        fs.copyFileSync(BUNDLED_COMMANDS_PATH, USER_COMMANDS_PATH);
    }

    // 3. Directories
    copyDirSync(BUNDLED_VOICES_DIR, USER_VOICES_DIR);
    copyDirSync(BUNDLED_PERSONALITIES_DIR, USER_PERSONALITIES_DIR);
    copyDirSync(BUNDLED_PRESETS_DIR, USER_PRESETS_DIR);

} catch (e) {
    console.error('Failed to initialize user data:', e);
}

function getLogDir() {
    try {
        if (fs.existsSync(USER_SETTINGS_PATH)) {
            const settings = JSON.parse(fs.readFileSync(USER_SETTINGS_PATH, 'utf8'));
            if (settings.logs_dir) {
                // Expand ~ if present
                if (settings.logs_dir.startsWith('~/')) {
                    return path.join(os.homedir(), settings.logs_dir.slice(2));
                }
                return settings.logs_dir;
            }
        }
    } catch (e) {
        console.error('Error reading settings for log dir:', e);
    }
    return path.join(os.homedir(), 'Documents/CaptainsLogs');
}

// const PYTHON_PATH = path.join(os.homedir(), '.leo/.venv/bin/python');
const VOICE_EXECUTABLE = getScriptPath('voiceassistant/dist/voice-assistant');
const BRIEFING_EXECUTABLE = getScriptPath('voiceassistant/dist/startup-briefing');
const BRIEFING_SCRIPT = getScriptPath('voiceassistant/dist/startup-briefing.sh');
const SPEAK_EXECUTABLE = (() => {
    const distSpeak = getScriptPath('voiceassistant/dist/ai-speak.sh');
    if (fs.existsSync(distSpeak)) return distSpeak;
    return getScriptPath('voiceassistant/ai-speak.sh');
})();

function runStartupBriefing() {
    const env = {
        ...process.env,
        LCARS_SETTINGS_PATH: USER_SETTINGS_PATH,
        LCARS_WORKSPACE: LCARS_ROOT
    };

    // Prefer the shell wrapper because it routes through ai-speak.sh (volume-consistent).
    if (fs.existsSync(BRIEFING_SCRIPT)) {
        return spawn('bash', [BRIEFING_SCRIPT], { stdio: 'ignore', env });
    }
    return spawn(BRIEFING_EXECUTABLE, [], { stdio: 'ignore', env });
}

function startVoiceAssistant(isAppStart = false) {
    if (voiceProcess) return;
    
    console.log('Starting Voice Assistant...');
    if (fs.existsSync(VOICE_EXECUTABLE)) {
        const spawnVoiceProcess = () => {
            if (voiceProcess) return;

            // Spawn detached to get a new process group, allowing us to kill the whole tree
            voiceProcess = spawn(VOICE_EXECUTABLE, [], {
                // Pipe both streams so we can forward logs/markers to the renderer.
                // (Python/pyinstaller stdout can be buffered when piped; force unbuffered via env below.)
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: true,
                env: {
                    ...process.env,
                    LCARS_SETTINGS_PATH: USER_SETTINGS_PATH,
                    LCARS_WORKSPACE: LCARS_ROOT,
                    // Ensure Python-based voice binary flushes prints promptly so the UI can react to markers.
                    PYTHONUNBUFFERED: '1',
                    PYTHONIOENCODING: 'utf-8'
                }
            });

            isVoiceReady = false;

            if (mainWindow) {
                mainWindow.webContents.send('voice-status-changed', true);
            }

            voiceProcess.stdout.on('data', (data) => {
                const str = data.toString();
                if (str.includes("<<VOICE_ACTIVE>>")) {
                    isVoiceReady = true;
                }
                // Forward to renderer
                if (mainWindow) {
                    mainWindow.webContents.send('voice-output', str);
                }
                process.stdout.write(`[Voice] ${str}`);
            });

            if (voiceProcess.stderr) {
                voiceProcess.stderr.on('data', (data) => {
                    const str = data.toString();
                    // Forward to renderer as well (some libs write logs to stderr)
                    if (mainWindow) {
                        mainWindow.webContents.send('voice-output', str);
                    }
                    process.stderr.write(`[Voice:err] ${str}`);
                });
            }

            voiceProcess.on('error', (err) => {
                console.error('Failed to start voice assistant:', err);
            });

            voiceProcess.on('exit', (code, signal) => {
                console.log(`Voice assistant exited with code ${code} and signal ${signal}`);
                voiceProcess = null;
                isVoiceReady = false;

                if (mainWindow) {
                    mainWindow.webContents.send('voice-status-changed', false);
                }
            });
        };

        // On app start, run the startup briefing first (if enabled) to avoid overlapping speech.
        let didDeferVoiceStart = false;
        try {
            if (isAppStart && fs.existsSync(USER_SETTINGS_PATH)) {
                const settings = JSON.parse(fs.readFileSync(USER_SETTINGS_PATH, 'utf8'));
                if (settings.startup_briefing_enabled && (fs.existsSync(BRIEFING_SCRIPT) || fs.existsSync(BRIEFING_EXECUTABLE))) {
                    didDeferVoiceStart = true;
                    console.log('Running startup briefing...');
                    const briefingProcess = runStartupBriefing();

                    let started = false;
                    const startOnce = () => {
                        if (started) return;
                        started = true;
                        spawnVoiceProcess();
                    };

                    briefingProcess.on('error', (err) => {
                        console.error('Briefing error:', err);
                        startOnce();
                    });
                    briefingProcess.on('exit', () => startOnce());
                    briefingProcess.unref();
                }
            }
        } catch (e) {
            console.error('Error checking startup briefing:', e);
        }

        if (!didDeferVoiceStart) {
            spawnVoiceProcess();
        }
    } else {
        console.error('Voice assistant executable not found at:', VOICE_EXECUTABLE);
    }
}

function stopVoiceAssistant() {
    if (voiceProcess) {
        console.log('Stopping Voice Assistant...');
        try {
            // Kill the process group (negative PID)
            process.kill(-voiceProcess.pid, 'SIGTERM');
            
            // Double tap with SIGKILL after a short delay if it's still running
            const pid = voiceProcess.pid;
            setTimeout(() => {
                try {
                    process.kill(-pid, 'SIGKILL');
                } catch (e) { /* ignore */ }
            }, 1000);
            
        } catch (e) {
            console.error('Error killing voice process group:', e);
            try {
                voiceProcess.kill();
            } catch (e2) {
                console.error('Error killing voice process:', e2);
            }
        }
        voiceProcess = null;

        if (mainWindow) {
            mainWindow.webContents.send('voice-status-changed', false);
        }
    }
}

function updateTrayMenu() {
    if (!tray) return;

    const isVisible = mainWindow && mainWindow.isVisible();
    
    const contextMenu = Menu.buildFromTemplate([
        { 
            label: isVisible ? 'Hide Terminal' : 'Show Terminal', 
            click: () => {
                if (mainWindow) {
                    if (isVisible) mainWindow.hide(); else mainWindow.show();
                    updateTrayMenu();
                }
            } 
        },
        { type: 'separator' },
        { 
            label: 'Quit', 
            click: () => {
                app.quit(); 
            } 
        }
    ]);
    
    tray.setContextMenu(contextMenu);
}

function createTray() {
  const iconPath = path.join(__dirname, 'public/icon.png');
  // Resize icon for tray if necessary, mostly for Linux/Windows consistency
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('LCARS Terminal');
  
  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow) {
        if (mainWindow.isVisible()) {
            // If focused, hide. If not focused, focus.
            if (mainWindow.isFocused()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        } else {
            mainWindow.show();
        }
    }
    updateTrayMenu();
  });
}

async function createWindow() {
  const state = loadState();
  
  // Check start hidden setting
  let startHidden = false;
  try {
      if (fs.existsSync(USER_SETTINGS_PATH)) {
          const settings = JSON.parse(fs.readFileSync(USER_SETTINGS_PATH, 'utf8'));
          if (settings.start_hidden) {
              startHidden = true;
          }
      }
  } catch (e) {
      console.error('Failed to load settings for start_hidden:', e);
  }

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
    show: !startHidden, // Respect start hidden setting
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
    
  // Check voice settings
  try {
      if (fs.existsSync(USER_SETTINGS_PATH)) {
          const settings = JSON.parse(fs.readFileSync(USER_SETTINGS_PATH, 'utf8'));
          if (settings.voice_enabled) {
              startVoiceAssistant(true);
          }
      }
  } catch (e) {
      console.error('Failed to load voice settings:', e);
  }

  // Handle initial args
  const args = parseArgs(process.argv);
  if (args.newTab || args.command || args.title || args.closeTitle) {
      // Wait for page to be ready
      setTimeout(() => {
          mainWindow.webContents.send('new-tab-request', args);
      }, 1000);
  }

  // Create Tray Icon
  createTray();

  mainWindow.on('show', updateTrayMenu);
  mainWindow.on('hide', updateTrayMenu);

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

// Voice Assistant IPC
ipcMain.handle('read-commands', async () => {
    try {
        if (fs.existsSync(USER_COMMANDS_PATH)) {
            return JSON.parse(fs.readFileSync(USER_COMMANDS_PATH, 'utf8'));
        }
        return {};
    } catch (e) {
        console.error('Error reading commands:', e);
        return {};
    }
});

ipcMain.handle('write-commands', async (event, commands) => {
    try {
        fs.writeFileSync(USER_COMMANDS_PATH, JSON.stringify(commands, null, 4));
        return true;
    } catch (e) {
        console.error('Error writing commands:', e);
        return false;
    }
});

ipcMain.handle('read-settings', async () => {
    try {
        if (fs.existsSync(USER_SETTINGS_PATH)) {
            const settings = JSON.parse(fs.readFileSync(USER_SETTINGS_PATH, 'utf8'));
            
            // Hydrate paths: If relative, make absolute to LCARS_ROOT
            const hydrate = (p) => {
                if (!p) return p;
                if (!path.isAbsolute(p)) {
                    return path.join(LCARS_ROOT, p);
                }
                return p;
            };
            
            settings.voice_path = hydrate(settings.voice_path);
            settings.personality_file = hydrate(settings.personality_file);

            return settings;
        }
        return {};
    } catch (e) {
        console.error('Error reading settings:', e);
        return {};
    }
});

ipcMain.handle('write-settings', async (event, settings) => {
    try {
        // Dehydrate paths: Make relative to LCARS_ROOT
        const dehydrate = (p) => {
            if (p && p.startsWith(LCARS_ROOT)) {
                return path.relative(LCARS_ROOT, p);
            }
            return p;
        };
        
        const settingsToSave = { ...settings };
        settingsToSave.voice_path = dehydrate(settings.voice_path);
        settingsToSave.personality_file = dehydrate(settings.personality_file);

        fs.writeFileSync(USER_SETTINGS_PATH, JSON.stringify(settingsToSave, null, 4));
        
        // Restart voice assistant if running to apply settings
        stopVoiceAssistant();
        
        if (settings.voice_enabled) {
            // Give it a moment to die completely
            setTimeout(() => {
                startVoiceAssistant(false);
            }, 1500);
        }
        return true;
    } catch (e) {
        console.error('Error writing settings:', e);
        return false;
    }
});

ipcMain.handle('read-logs', async () => {
    try {
        const logDir = getLogDir();
        if (!fs.existsSync(logDir)) return [];
        // Return list of log objects { id, display, hasAudio, hasText }
        const files = fs.readdirSync(logDir);
        const logs = {};
        
        files.forEach(f => {
            const base = path.parse(f).name;
            if (!logs[base]) logs[base] = { id: base, display: base, hasAudio: false, hasText: false };
            
            if (f.endsWith('.wav')) logs[base].hasAudio = true;
            if (f.endsWith('.txt') || f.endsWith('.md')) logs[base].hasText = true;
        });
        
        return Object.values(logs).filter(l => l.hasAudio || l.hasText).sort((a, b) => b.id.localeCompare(a.id));
    } catch (e) {
        console.error('Error reading logs:', e);
        return [];
    }
});

ipcMain.handle('read-log', async (event, filename) => {
    try {
        const logDir = getLogDir();
        // Try .txt first, then .md
        let filePath = path.join(logDir, filename + '.txt');
        if (!fs.existsSync(filePath)) {
            filePath = path.join(logDir, filename + '.md');
        }
        
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8');
        }
        return '';
    } catch (e) {
        console.error('Error reading log:', e);
        return '';
    }
});

ipcMain.handle('read-log-audio', async (event, filename) => {
    try {
        const logDir = getLogDir();
        const filePath = path.join(logDir, filename + '.wav');
        if (fs.existsSync(filePath)) {
            const buffer = fs.readFileSync(filePath);
            return `data:audio/wav;base64,${buffer.toString('base64')}`;
        }
        return null;
    } catch (e) {
        console.error('Error reading log audio:', e);
        return null;
    }
});

ipcMain.handle('write-log', async (event, filename, content) => {
    try {
        const logDir = getLogDir();
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        // Ensure extension
        if (!filename.endsWith('.txt')) filename += '.txt';
        const filePath = path.join(logDir, filename);
        fs.writeFileSync(filePath, content);
        return true;
    } catch (e) {
        console.error('Error writing log:', e);
        return false;
    }
});

ipcMain.handle('delete-log', async (event, filename) => {
    try {
        const logDir = getLogDir();
        // Delete both txt and wav
        const txtPath = path.join(logDir, filename + '.txt');
        const mdPath = path.join(logDir, filename + '.md');
        const wavPath = path.join(logDir, filename + '.wav');
        
        if (fs.existsSync(txtPath)) fs.unlinkSync(txtPath);
        if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);
        if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
        
        return true;
    } catch (e) {
        console.error('Error deleting log:', e);
        return false;
    }
});

ipcMain.handle('toggle-voice', async (event, enabled) => {
    if (enabled) {
        startVoiceAssistant(false);
    } else {
        stopVoiceAssistant();
    }
    return !!voiceProcess;
});

ipcMain.handle('get-voice-status', async () => {
    return isVoiceReady;
});

ipcMain.handle('get-voices', async () => {
    try {
        if (!fs.existsSync(USER_VOICES_DIR)) return [];
        const voices = [];
        
        // Recursive search for .onnx files
        function scanDir(dir) {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    scanDir(fullPath);
                } else if (file.endsWith('.onnx')) {
                    voices.push({
                        name: path.basename(dir) + ' - ' + path.basename(file, '.onnx'),
                        path: fullPath
                    });
                }
            }
        }
        
        scanDir(USER_VOICES_DIR);
        return voices;
    } catch (e) {
        console.error('Error scanning voices:', e);
        return [];
    }
});

ipcMain.handle('get-personalities', async () => {
    try {
        if (!fs.existsSync(USER_PERSONALITIES_DIR)) return [];
        return fs.readdirSync(USER_PERSONALITIES_DIR)
            .filter(f => f.endsWith('.json'))
            .map(f => ({
                name: path.basename(f, '.json'),
                path: path.join(USER_PERSONALITIES_DIR, f)
            }));
    } catch (e) {
        console.error('Error scanning personalities:', e);
        return [];
    }
});

ipcMain.handle('read-personality', async (event, filename) => {
    try {
        const filePath = path.join(USER_PERSONALITIES_DIR, filename + (filename.endsWith('.json') ? '' : '.json'));
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8');
        }
        return '{}';
    } catch (e) {
        console.error('Error reading personality:', e);
        return '{}';
    }
});

ipcMain.handle('write-personality', async (event, filename, content) => {
    try {
        if (!fs.existsSync(USER_PERSONALITIES_DIR)) fs.mkdirSync(USER_PERSONALITIES_DIR, { recursive: true });
        const filePath = path.join(USER_PERSONALITIES_DIR, filename + (filename.endsWith('.json') ? '' : '.json'));
        fs.writeFileSync(filePath, content);
        return true;
    } catch (e) {
        console.error('Error writing personality:', e);
        return false;
    }
});

ipcMain.handle('delete-personality', async (event, filename) => {
    try {
        const filePath = path.join(USER_PERSONALITIES_DIR, filename + (filename.endsWith('.json') ? '' : '.json'));
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    } catch (e) {
        console.error('Error deleting personality:', e);
        return false;
    }
});

ipcMain.handle('get-presets', async () => {
    try {
        const presets = [];
        if (fs.existsSync(USER_PRESETS_DIR)) {
            const files = fs.readdirSync(USER_PRESETS_DIR).filter(f => f.endsWith('.json'));
            files.forEach(f => {
                presets.push({
                    name: path.basename(f, '.json'),
                    path: path.join(USER_PRESETS_DIR, f),
                    type: 'user'
                });
            });
        }
        return presets;
    } catch (e) {
        console.error('Error scanning presets:', e);
        return [];
    }
});

ipcMain.handle('read-preset', async (event, filename) => {
    try {
        const name = filename.endsWith('.json') ? filename : filename + '.json';
        const userPath = path.join(USER_PRESETS_DIR, name);
        if (fs.existsSync(userPath)) {
            return JSON.parse(fs.readFileSync(userPath, 'utf8'));
        }
        return null;
    } catch (e) {
        console.error('Error reading preset:', e);
        return null;
    }
});

ipcMain.handle('write-preset', async (event, filename, content) => {
    try {
        if (!fs.existsSync(USER_PRESETS_DIR)) fs.mkdirSync(USER_PRESETS_DIR, { recursive: true });
        const name = filename.endsWith('.json') ? filename : filename + '.json';
        const filePath = path.join(USER_PRESETS_DIR, name);
        fs.writeFileSync(filePath, JSON.stringify(content, null, 4));
        return true;
    } catch (e) {
        console.error('Error writing preset:', e);
        return false;
    }
});

ipcMain.handle('delete-preset', async (event, filename) => {
    try {
        const name = filename.endsWith('.json') ? filename : filename + '.json';
        const filePath = path.join(USER_PRESETS_DIR, name);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    } catch (e) {
        console.error('Error deleting preset:', e);
        return false;
    }
});

ipcMain.handle('test-voice', async (event, text) => {
    if (fs.existsSync(SPEAK_EXECUTABLE)) {
        const p = spawn(SPEAK_EXECUTABLE, [text], {
            env: { 
                ...process.env, 
                LCARS_SETTINGS_PATH: USER_SETTINGS_PATH,
                LCARS_WORKSPACE: LCARS_ROOT
            }
        });
        return true;
    }
    return false;
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

app.on('before-quit', (event) => {
  if (voiceProcess && !isQuitting) {
    event.preventDefault();
    
    // Notify renderer to show shutdown screen and ensure it's visible
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.webContents.send('app-shutdown');
    }

    stopVoiceAssistant();
    // Give it a moment to die completely before quitting the app
    setTimeout(() => {
      isQuitting = true;
      app.quit();
    }, 1500);
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  stopVoiceAssistant();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

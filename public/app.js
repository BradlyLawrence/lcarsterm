const socket = io();

// State
const terminals = {}; // id -> { term, fitAddon, element, tabElement }
let activeTermId = null;
let termCounter = 0;

// DOM Elements
const tabsContainer = document.getElementById('tabs-container');
const terminalsWrapper = document.getElementById('terminals-wrapper');
const btnNewTerm = document.getElementById('btn-new-term');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnExit = document.getElementById('btn-exit');

// Theme Configuration
const termTheme = {
    background: '#000000',
    foreground: '#FF9900', // LCARS Orange
    cursor: '#CC6666',     // LCARS Red
    selectionBackground: '#CC99CC55', // LCARS Purple (transparent)
    
    black: '#000000',
    red: '#CC6666',
    green: '#FFCC99',
    yellow: '#FF9900',
    blue: '#9999CC',
    magenta: '#CC99CC',
    cyan: '#9999CC',
    white: '#FFFFFF',
    
    brightBlack: '#333333',
    brightRed: '#FF6666',
    brightGreen: '#FFFFCC',
    brightYellow: '#FFAA00',
    brightBlue: '#AAAAFF',
    brightMagenta: '#EEAAEE',
    brightCyan: '#AAAAFF',
    brightWhite: '#FFFFFF'
};

// New DOM Elements
const btnVoice = document.getElementById('btn-voice');
const voiceActiveIndicator = document.getElementById('voice-active-indicator');
const btnLogs = document.getElementById('btn-logs');
const voiceView = document.getElementById('voice-view');
const logsView = document.getElementById('logs-view');
const voiceEnabledToggle = document.getElementById('voice-enabled-toggle');
const userRankInput = document.getElementById('user-rank');
const userNameInput = document.getElementById('user-name');
const userSurnameInput = document.getElementById('user-surname');
const assistantNameInput = document.getElementById('assistant-name');
const calendarUrlInput = document.getElementById('calendar-url');
const weatherLocationInput = document.getElementById('weather-location');
const phoneticAlternativesInput = document.getElementById('phonetic-alternatives');
const voiceModelSelect = document.getElementById('voice-model');
const speakerIdInput = document.getElementById('speaker-id');
const personalitySelect = document.getElementById('personality');
const voiceAckToggle = document.getElementById('voice-ack-toggle');
const startupBriefingToggle = document.getElementById('startup-briefing-toggle');
const voiceVolumeInput = document.getElementById('voice-volume');
const voiceVolumeDisplay = document.getElementById('voice-volume-display');
const btnSaveVoiceSettings = document.getElementById('btn-save-voice-settings');
const testVoiceInput = document.getElementById('test-voice-text');
const btnTestVoice = document.getElementById('btn-test-voice');

// Presets Elements
const voicePresetSelect = document.getElementById('voice-preset');
const btnLoadPreset = document.getElementById('btn-load-preset');
const btnSavePreset = document.getElementById('btn-save-preset');
const btnDeletePreset = document.getElementById('btn-delete-preset');

// Personality Editor Elements
const btnEditPersonality = document.getElementById('btn-edit-personality');
const btnNewPersonality = document.getElementById('btn-new-personality');
const personalityModal = document.getElementById('personality-modal');
const personalityFilenameInput = document.getElementById('personality-filename');
const personalityContentInput = document.getElementById('personality-content');
const btnClosePersonality = document.getElementById('btn-close-personality');
const btnDeletePersonalityFile = document.getElementById('btn-delete-personality-file');
const btnSavePersonality = document.getElementById('btn-save-personality');

// Voice Config Elements
const commandsList = document.getElementById('commands-list');
const cmdTrigger = document.getElementById('cmd-trigger');
const cmdResponse = document.getElementById('cmd-response');
const cmdAction = document.getElementById('cmd-action');
const btnAddCommand = document.getElementById('btn-add-command');
const btnSaveCommand = document.getElementById('btn-save-command');
const btnDeleteCommand = document.getElementById('btn-delete-command');

// Logs Elements
const logsList = document.getElementById('logs-list');
const logTitle = document.getElementById('log-title');
const logContent = document.getElementById('log-content');
const btnNewLog = document.getElementById('btn-new-log');
const btnSaveLog = document.getElementById('btn-save-log');
const btnDeleteLog = document.getElementById('btn-delete-log');
const btnPlayLog = document.getElementById('btn-play-log');

let currentSettings = {};
let currentCommands = {};
let currentLogs = [];
let selectedCommandKey = null;
let selectedLogFile = null;
let audioPlayer = null;

function switchView(viewId) {
    // Hide all views
    document.getElementById('settings-view').style.display = 'none';
    voiceView.style.display = 'none';
    logsView.style.display = 'none';
    
    // Hide all terminals
    document.querySelectorAll('.terminal-container').forEach(el => el.style.display = 'none');
    
    // Reset button states
    btnSettings.classList.remove('active');
    btnVoice.classList.remove('active');
    btnLogs.classList.remove('active');
    
    // Show requested view
    if (viewId === 'terminals') {
        if (activeTermId && terminals[activeTermId]) {
            terminals[activeTermId].element.style.display = 'block';
            terminals[activeTermId].fitAddon.fit();
            terminals[activeTermId].term.focus();
        }
    } else if (viewId === 'settings') {
        document.getElementById('settings-view').style.display = 'block';
        btnSettings.classList.add('active');
    } else if (viewId === 'voice') {
        voiceView.style.display = 'flex';
        voiceView.style.flexDirection = 'column';
        btnVoice.classList.add('active');
        loadCommands();
    } else if (viewId === 'logs') {
        logsView.style.display = 'flex';
        logsView.style.flexDirection = 'column';
        btnLogs.classList.add('active');
        loadLogs();
    }
}

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

const checkCwd = debounce((id) => {
    socket.emit('get-cwd', { id });
}, 1000);

async function saveSession() {
    // Get terminals in DOM order
    const orderedTerminals = Array.from(document.getElementById('tabs-container').children).map(tab => {
        const id = tab.dataset.id;
        return terminals[id];
    }).filter(t => t);

    const state = {
        terminals: orderedTerminals.map(t => ({ 
            cwd: t.cwd,
            title: t.title
        })),
        settings: {
            theme: currentTheme,
            hotkey: currentHotkey,
            cycleHotkey: currentCycleHotkey
        }
    };
    
    if (window.electronAPI) {
        await window.electronAPI.saveSession(state);
    } else {
        localStorage.setItem('lcars-terminal-state', JSON.stringify(state));
    }
}

async function restoreSession() {
    let state = null;
    
    if (window.electronAPI) {
        state = await window.electronAPI.loadSession();
    }
    
    if (!state) {
        // Fallback to local storage for migration or dev
        const saved = localStorage.getItem('lcars-terminal-state');
        if (saved) {
             try { state = JSON.parse(saved); } catch(e) {}
        }
    }

    if (state) {
        try {
            // Restore settings
            if (state.settings) {
                if (state.settings.theme) applyTheme(state.settings.theme);
                if (state.settings.hotkey) setHotkey(state.settings.hotkey);
                if (state.settings.cycleHotkey) setCycleHotkey(state.settings.cycleHotkey);
                else setCycleHotkey(currentCycleHotkey);
            } else {
                setHotkey(currentHotkey);
                setCycleHotkey(currentCycleHotkey);
            }

            // Restore terminals (logic from original)
            if (state.terminals && Array.isArray(state.terminals)) {
                if (state.terminals.length === 0) createTerminal(undefined, undefined, undefined, true);
                state.terminals.forEach(termState => {
                    createTerminal(termState.cwd, termState.title, undefined, true);
                });
            } else {
                // Legacy format fallback
                const count = state.count || 1;
                for (let i = 0; i < count; i++) {
                    createTerminal(undefined, undefined, undefined, true);
                }
            }
        } catch (e) {
            console.error("Failed to restore session", e);
            createTerminal(undefined, undefined, undefined, true);
            setHotkey(currentHotkey);
            setCycleHotkey(currentCycleHotkey);
        }
    } else {
        createTerminal(undefined, undefined, undefined, true);
        setHotkey(currentHotkey);
        setCycleHotkey(currentCycleHotkey);
    }
    
    // Save once after restore to ensure file exists if it didn't
    setTimeout(() => saveSession(), 2000);
};

// Functions
let draggedTabId = null;
let placeholder = null;

// Drag and Drop Logic for Tabs Container
tabsContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    const draggable = document.querySelector('.dragging');
    if (!draggable) return;

    const afterElement = getDragAfterElement(tabsContainer, e.clientY);
    
    if (afterElement == null) {
        tabsContainer.appendChild(draggable);
    } else {
        tabsContainer.insertBefore(draggable, afterElement);
    }
});

tabsContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    saveSession();
});

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.lcars-tab:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function createTerminal(cwdOrEvent, savedTitle, commandToRun, skipSave) {
    const cwd = (typeof cwdOrEvent === 'string') ? cwdOrEvent : undefined;
    
    socket.emit('create-terminal', { cwd }, (response) => {
        const id = response.id;
        termCounter++;
        const title = savedTitle || `TERM ${termCounter}`;

        // Create DOM elements
        const termContainer = document.createElement('div');
        termContainer.className = 'terminal-container';
        termContainer.style.display = 'none'; // Hidden by default
        terminalsWrapper.appendChild(termContainer);

        const tabElement = document.createElement('div');
        tabElement.className = 'lcars-block lcars-u-3 lcars-tab';
        tabElement.dataset.id = id;
        tabElement.draggable = true;

        // Drag Events
        tabElement.addEventListener('dragstart', (e) => {
            draggedTabId = id;
            e.dataTransfer.effectAllowed = 'move';
            tabElement.classList.add('dragging');
        });
        
        tabElement.addEventListener('dragend', (e) => {
            tabElement.classList.remove('dragging');
            draggedTabId = null;
            saveSession();
        });

        tabElement.onclick = (e) => {
            if (!e.target.classList.contains('close-btn') && !e.target.classList.contains('tab-input')) {
                switchTab(id);
            }
        };
        
        // Tab Content
        const titleSpan = document.createElement('span');
        titleSpan.className = 'tab-title';
        titleSpan.innerText = title;
        
        const closeBtn = document.createElement('span');
        closeBtn.className = 'close-btn';
        closeBtn.innerText = 'X';
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            closeTerminal(id);
        };

        tabElement.appendChild(titleSpan);
        tabElement.appendChild(closeBtn);
        tabsContainer.appendChild(tabElement);

        // Rename functionality
        tabElement.ondblclick = () => {
            const currentTitle = titleSpan.innerText;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentTitle;
            input.className = 'tab-input';
            
            input.onblur = () => {
                const newTitle = input.value || currentTitle;
                titleSpan.innerText = newTitle;
                terminals[id].title = newTitle;
                input.replaceWith(titleSpan);
                saveSession();
            };
            
            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    input.blur();
                }
            };
            
            titleSpan.replaceWith(input);
            input.focus();
        };

        // Initialize xterm
        const term = new Terminal({
            cursorBlink: true,
            fontFamily: '"Share Tech Mono", monospace',
            fontSize: 18,
            theme: termTheme,
            allowProposedApi: true
        });

        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(new WebLinksAddon.WebLinksAddon());

        term.open(termContainer);
        fitAddon.fit();

        // Store instance
        terminals[id] = {
            term,
            fitAddon,
            element: termContainer,
            tabElement,
            cwd: cwd,
            title: title
        };

        // Events
        term.onData((data) => {
            socket.emit('input', { id, data });
            checkCwd(id);
        });

        term.onResize((size) => {
            socket.emit('resize', { id, cols: size.cols, rows: size.rows });
        });

        // Switch to this new terminal
        switchTab(id);
        
        // Initial resize
        setTimeout(() => {
            fitAddon.fit();
            socket.emit('resize', { id, cols: term.cols, rows: term.rows });
            if (!skipSave) saveSession();
            
            if (commandToRun) {
                socket.emit('input', { id, data: commandToRun + '\n' });
            }
        }, 100);
    });
}

function switchTab(id) {
    // Close settings if open
    if (settingsView.style.display !== 'none') {
        settingsView.style.display = 'none';
        btnSettings.classList.remove('active');
    }
    
    // Close Voice View if open
    if (voiceView && voiceView.style.display !== 'none') {
        voiceView.style.display = 'none';
        btnVoice.classList.remove('active');
    }

    // Close Logs View if open
    if (logsView && logsView.style.display !== 'none') {
        logsView.style.display = 'none';
        btnLogs.classList.remove('active');
    }

    // If we are clicking the already active tab, we just need to reshow it
    if (activeTermId === id) {
         if (terminals[id]) {
            terminals[id].element.style.display = 'block';
            terminals[id].fitAddon.fit();
            terminals[id].term.focus();
         }
         return;
    }

    if (activeTermId === id) return;

    // Deactivate current
    if (activeTermId && terminals[activeTermId]) {
        terminals[activeTermId].element.style.display = 'none';
        terminals[activeTermId].tabElement.classList.remove('active');
    }

    // Activate new
    activeTermId = id;
    const current = terminals[id];
    current.element.style.display = 'block';
    current.tabElement.classList.add('active');
    
    // Refit
    current.fitAddon.fit();
    current.term.focus();
}

function closeTerminal(id) {
    if (terminals[id]) {
        terminals[id].term.dispose();
        terminals[id].element.remove();
        terminals[id].tabElement.remove();
        delete terminals[id];
        
        if (activeTermId === id) {
            const remainingIds = Object.keys(terminals);
            if (remainingIds.length > 0) {
                switchTab(remainingIds[0]);
            } else {
                activeTermId = null;
            }
        }
        saveSession();
    }
}

// Socket Events
socket.on('output', ({ id, data }) => {
    if (terminals[id]) {
        terminals[id].term.write(data);
    }
});

if (window.electronAPI && window.electronAPI.onVoiceOutput) {
    window.electronAPI.onVoiceOutput((data) => {
        // Check for voice active signal
        if (data.includes("<<VOICE_ACTIVE>>")) {
            if (voiceActiveIndicator) {
                voiceActiveIndicator.style.display = "block";
            }
        }
    });
}

function setVoiceActiveIndicator(isActive) {
    if (!voiceActiveIndicator) return;
    voiceActiveIndicator.style.display = isActive ? 'block' : 'none';
}

// Show indicator when the voice process is running.
if (window.electronAPI && window.electronAPI.getVoiceStatus) {
    window.electronAPI.getVoiceStatus().then((isActive) => {
        setVoiceActiveIndicator(!!isActive);
    }).catch(() => {
        // ignore
    });
}

if (window.electronAPI && window.electronAPI.onVoiceStatusChanged) {
    window.electronAPI.onVoiceStatusChanged((isActive) => {
        setVoiceActiveIndicator(!!isActive);
    });
}

socket.on('term-exit', ({ id }) => {
    closeTerminal(id);
});

socket.on('cwd-updated', ({ id, cwd }) => {
    if (terminals[id]) {
        terminals[id].cwd = cwd;
        saveSession();
    }
});

// Settings Elements
const btnSettings = document.getElementById('btn-settings');
const settingsView = document.getElementById('settings-view');
const hotkeyInput = document.getElementById('hotkey-input');
const cycleHotkeyInput = document.getElementById('cycle-hotkey-input');
const themeOptions = document.querySelectorAll('.theme-option');

let currentTheme = 'default';
let currentHotkey = 'F8';
let currentCycleHotkey = 'F9';

function toggleSettings() {
    const isVisible = settingsView.style.display !== 'none';
    
    if (isVisible) {
        settingsView.style.display = 'none';
        // Restore active terminal
        if (activeTermId && terminals[activeTermId]) {
            terminals[activeTermId].element.style.display = 'block';
            terminals[activeTermId].fitAddon.fit();
            terminals[activeTermId].term.focus();
        }
        btnSettings.classList.remove('active');
    } else {
        // Hide all terminals
        Object.values(terminals).forEach(t => {
            t.element.style.display = 'none';
        });
        settingsView.style.display = 'block';
        btnSettings.classList.add('active');
    }
}

function applyTheme(theme) {
    document.body.className = ''; // Clear existing
    if (theme !== 'default') {
        document.body.classList.add(`theme-${theme}`);
    }
    
    // Update active state in UI
    themeOptions.forEach(opt => {
        if (opt.dataset.theme === theme) {
            opt.classList.add('active');
        } else {
            opt.classList.remove('active');
        }
    });
    
    currentTheme = theme;
    saveSession();
}

function setHotkey(hotkey) {
    currentHotkey = hotkey;
    hotkeyInput.value = hotkey;
    if (window.electronAPI) {
        window.electronAPI.setHotkey(hotkey);
    }
    saveSession();
}

function setCycleHotkey(hotkey) {
    currentCycleHotkey = hotkey;
    cycleHotkeyInput.value = hotkey;
    if (window.electronAPI) {
        window.electronAPI.setCycleHotkey(hotkey);
    }
    saveSession();
}

// Update saveSession to include settings
const originalSaveSession = saveSession;
// saveSession is already updated above to handle everything, so we can likely remove this override
// or keep it if we need to merge logic, but the rewrite above was comprehensive.
// However, the previous code block I replaced was the *initial* definition.
// Be careful: if I replaced the initial definition, I must check if there's a *redefinition* later on.

// Looking at file content read previously:
// Lines 575+ had:
// saveSession = function() { ... }
// restoreSession = function() { ... }

// So my rewrite of the *initial* definition might be overwritten by these later definitions.
// I must delete or update these later definitions as well.

// Update restoreSession - Merged into main definition
// const originalRestoreSession = restoreSession;
// restoreSession = function() { ... }

// UI Event Listeners
if (window.electronAPI) {
    window.electronAPI.onNewTabRequest((args) => {
        if (args.closeTitle) {
            const idsToClose = Object.keys(terminals).filter(id => terminals[id].title === args.closeTitle);
            idsToClose.forEach(id => closeTerminal(id));
        }
        if (args.newTab || args.command || args.title) {
            createTerminal(args.cwd, args.title, args.command);
        }
    });
}

btnSettings.addEventListener('click', () => {
    if (document.getElementById('settings-view').style.display !== 'none') {
        switchView('terminals');
    } else {
        switchView('settings');
    }
});

themeOptions.forEach(opt => {
    opt.addEventListener('click', () => {
        applyTheme(opt.dataset.theme);
    });
});

hotkeyInput.addEventListener('click', () => {
    hotkeyInput.value = 'Press any key...';
    const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        let key = e.key.toUpperCase();
        if (key.startsWith('ARROW')) key = key.replace('ARROW', '');
        if (key === ' ') key = 'SPACE';
        
        // Handle modifiers
        const parts = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.shiftKey) parts.push('Shift');
        if (e.altKey) parts.push('Alt');
        if (e.metaKey) parts.push('Super');
        
        if (!['CONTROL', 'SHIFT', 'ALT', 'META'].includes(key)) {
            parts.push(key);
        }
        
        const newHotkey = parts.join('+');
        setHotkey(newHotkey);
        
        document.removeEventListener('keydown', handler);
    };
    document.addEventListener('keydown', handler);
});

cycleHotkeyInput.addEventListener('click', () => {
    cycleHotkeyInput.value = 'Press any key...';
    const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        let key = e.key.toUpperCase();
        if (key.startsWith('ARROW')) key = key.replace('ARROW', '');
        if (key === ' ') key = 'SPACE';
        
        // Handle modifiers
        const parts = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.shiftKey) parts.push('Shift');
        if (e.altKey) parts.push('Alt');
        if (e.metaKey) parts.push('Super');
        
        if (!['CONTROL', 'SHIFT', 'ALT', 'META'].includes(key)) {
            parts.push(key);
        }
        
        const newHotkey = parts.join('+');
        setCycleHotkey(newHotkey);
        
        document.removeEventListener('keydown', handler);
    };
    document.addEventListener('keydown', handler);
});

btnNewTerm.addEventListener('click', () => {
    createTerminal();
    switchView('terminals');
});

if (voiceVolumeInput) {
    voiceVolumeInput.addEventListener('input', (e) => {
        if (voiceVolumeDisplay) voiceVolumeDisplay.textContent = e.target.value + '%';
    });
}

btnFullscreen.addEventListener('click', () => {
    if (window.electronAPI) {
        window.electronAPI.toggleFullscreen();
    } else {
        // Fallback for browser
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }
});

btnExit.addEventListener('click', () => {
    if (window.electronAPI) {
        window.electronAPI.closeApp();
    } else {
        alert("Cannot close window from browser. Please close the tab.");
    }
});

window.addEventListener('resize', () => {
    if (activeTermId && terminals[activeTermId]) {
        terminals[activeTermId].fitAddon.fit();
        const term = terminals[activeTermId].term;
        socket.emit('resize', { id: activeTermId, cols: term.cols, rows: term.rows });
    }
});

// Start with one terminal
restoreSession();

// Context Menu Logic
const contextMenu = document.getElementById('context-menu');
const ctxCopy = document.getElementById('ctx-copy');
const ctxPaste = document.getElementById('ctx-paste');
const ctxSearch = document.getElementById('ctx-search');
const ctxHide = document.getElementById('ctx-hide');
const ctxExit = document.getElementById('ctx-exit');

document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    
    // Show menu at mouse position
    contextMenu.style.display = 'block';
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;
    
    // Adjust if off screen
    const menuRect = contextMenu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) {
        contextMenu.style.left = `${window.innerWidth - menuRect.width - 10}px`;
    }
    if (menuRect.bottom > window.innerHeight) {
        contextMenu.style.top = `${window.innerHeight - menuRect.height - 10}px`;
    }
});

document.addEventListener('click', (e) => {
    if (e.target.closest('.lcars-context-menu')) return;
    contextMenu.style.display = 'none';
});

ctxCopy.addEventListener('click', () => {
    const selection = window.getSelection().toString();
    if (selection) {
        navigator.clipboard.writeText(selection);
    } else if (activeTermId && terminals[activeTermId]) {
        const term = terminals[activeTermId].term;
        if (term.hasSelection()) {
            navigator.clipboard.writeText(term.getSelection());
        }
    }
    contextMenu.style.display = 'none';
});

ctxPaste.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        if (activeTermId && terminals[activeTermId]) {
            socket.emit('data', { id: activeTermId, data: text });
            terminals[activeTermId].term.focus();
        }
    } catch (err) {
        console.error('Failed to read clipboard contents: ', err);
    }
    contextMenu.style.display = 'none';
});

ctxSearch.addEventListener('click', () => {
    let selection = window.getSelection().toString();
    if (!selection && activeTermId && terminals[activeTermId]) {
        const term = terminals[activeTermId].term;
        if (term.hasSelection()) {
            selection = term.getSelection();
        }
    }
    
    if (selection) {
        const url = `https://www.google.com/search?q=${encodeURIComponent(selection)}`;
        if (window.electronAPI) {
            window.electronAPI.openExternal(url);
        } else {
            window.open(url, '_blank');
        }
    }
    contextMenu.style.display = 'none';
});

ctxHide.addEventListener('click', () => {
    if (window.electronAPI) {
        window.electronAPI.hideApp();
    }
    contextMenu.style.display = 'none';
});

ctxExit.addEventListener('click', () => {
    if (window.electronAPI) {
        window.electronAPI.closeApp();
    }
    contextMenu.style.display = 'none';
});

// --- Voice & Logs Logic ---

async function loadSettings() {
    currentSettings = await window.electronAPI.readSettings();
    
    // Load lists
    const voices = await window.electronAPI.getVoices();
    const personalities = await window.electronAPI.getPersonalities();
    const presets = await window.electronAPI.getPresets();
    
    // Populate dropdowns
    voiceModelSelect.innerHTML = '';
    voices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.path;
        opt.textContent = v.name;
        voiceModelSelect.appendChild(opt);
    });
    
    personalitySelect.innerHTML = '';
    personalities.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.path;
        opt.textContent = p.name;
        personalitySelect.appendChild(opt);
    });

    voicePresetSelect.innerHTML = '<option value="">-- Select Preset --</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        voicePresetSelect.appendChild(opt);
    });
    
    // Update UI
    if (voiceEnabledToggle) {
        voiceEnabledToggle.checked = currentSettings.voice_enabled || false;
    }
    
    if (userRankInput) userRankInput.value = currentSettings.user_rank || 'Captain';
    if (userNameInput) userNameInput.value = currentSettings.user_name || 'Bradly';
    if (userSurnameInput) userSurnameInput.value = currentSettings.user_surname || 'User';
    if (assistantNameInput) assistantNameInput.value = currentSettings.assistant_name || 'Leo';
    if (calendarUrlInput) calendarUrlInput.value = currentSettings.calendar_url || 'local';
    if (weatherLocationInput) weatherLocationInput.value = currentSettings.weather_location || 'Cape Town';
    if (phoneticAlternativesInput) phoneticAlternativesInput.value = (currentSettings.phonetic_alternatives || []).join(', ');
    if (voiceAckToggle) voiceAckToggle.checked = currentSettings.voice_ack_enabled || false;
    if (startupBriefingToggle) startupBriefingToggle.checked = currentSettings.startup_briefing_enabled || false;
    
    if (voiceVolumeInput) {
        const vol = currentSettings.voice_volume !== undefined ? currentSettings.voice_volume : 100;
        voiceVolumeInput.value = vol;
        if (voiceVolumeDisplay) voiceVolumeDisplay.textContent = vol + '%';
    }

    if (voiceModelSelect) voiceModelSelect.value = currentSettings.voice_path || '';
    if (speakerIdInput) speakerIdInput.value = currentSettings.speaker_id || '0';
    if (personalitySelect) personalitySelect.value = currentSettings.personality_file || '';
    
    if (voiceVolumeInput) {
        voiceVolumeInput.addEventListener('input', () => {
            if (voiceVolumeDisplay) voiceVolumeDisplay.textContent = voiceVolumeInput.value + '%';
        });
        voiceVolumeInput.addEventListener('change', () => {
            saveSettings();
        });
    }

    if (btnTestVoice) {
        btnTestVoice.addEventListener('click', async () => {
            const text = testVoiceInput.value || "Voice interface functional.";
            if (window.electronAPI && window.electronAPI.testVoice) {
                await window.electronAPI.testVoice(text);
            }
        });
    }

    // Toggle buttons
    if (currentSettings.voice_enabled) {
        btnVoice.style.display = 'block';
        btnLogs.style.display = 'block';
    } else {
        btnVoice.style.display = 'none';
        btnLogs.style.display = 'none';
    }
}

async function saveSettings() {
    currentSettings.voice_enabled = voiceEnabledToggle.checked;
    currentSettings.user_rank = userRankInput.value;
    currentSettings.user_name = userNameInput.value;
    currentSettings.user_surname = userSurnameInput.value;
    currentSettings.assistant_name = assistantNameInput.value;
    currentSettings.calendar_url = calendarUrlInput.value;
    currentSettings.weather_location = weatherLocationInput.value;
    currentSettings.phonetic_alternatives = phoneticAlternativesInput.value.split(',').map(s => s.trim()).filter(s => s);
    currentSettings.voice_ack_enabled = voiceAckToggle.checked;
    currentSettings.startup_briefing_enabled = startupBriefingToggle.checked;
    currentSettings.voice_volume = voiceVolumeInput ? parseInt(voiceVolumeInput.value) : 100;
    
    currentSettings.voice_path = voiceModelSelect.value;
    currentSettings.speaker_id = speakerIdInput.value;
    currentSettings.personality_file = personalitySelect.value;
    
    await window.electronAPI.writeSettings(currentSettings);
    // await window.electronAPI.toggleVoice(currentSettings.voice_enabled); // Removed to prevent double restart
    
    // Update UI visibility immediately
    if (currentSettings.voice_enabled) {
        btnVoice.style.display = 'block';
        btnLogs.style.display = 'block';
    } else {
        btnVoice.style.display = 'none';
        btnLogs.style.display = 'none';
    }
}

let collapsedCategories = new Set();
let draggedItem = null;

async function loadCommands() {
    currentCommands = await window.electronAPI.readCommands();
    renderCommandsList();
}

function renderCommandsList() {
    commandsList.innerHTML = '';
    
    const entries = Object.entries(currentCommands);
    let currentCategoryDiv = null;
    let currentContentDiv = null;
    
    // Helper to create default category if needed
    const ensureCategory = () => {
        if (!currentContentDiv) {
            const { catDiv, contentDiv } = createCategory('General Commands', 'default');
            currentCategoryDiv = catDiv;
            currentContentDiv = contentDiv;
            commandsList.appendChild(catDiv);
        }
    };

    // If empty or first item is not a comment, start with default
    if (entries.length > 0 && !entries[0][0].startsWith('__COMMENT__')) {
        ensureCategory();
    }
    
    entries.forEach(([key, value]) => {
        if (key.startsWith('__COMMENT__')) {
            const { catDiv, contentDiv } = createCategory(value, key);
            currentCategoryDiv = catDiv;
            currentContentDiv = contentDiv;
            commandsList.appendChild(catDiv);
        } else {
            ensureCategory();
            const item = createCommandItem(key, value);
            currentContentDiv.appendChild(item);
        }
    });
}

function createCategory(title, id) {
    const container = document.createElement('div');
    container.className = 'command-category';
    container.dataset.id = id;
    container.dataset.title = title;
    container.draggable = true; // Allow reordering categories

    const header = document.createElement('div');
    header.className = 'category-header';
    header.innerHTML = `<span>${title}</span> <span class="toggle-icon">▼</span>`;
    
    header.onclick = (e) => {
        e.stopPropagation();
        const content = container.querySelector('.category-content');
        content.classList.toggle('collapsed');
        const icon = header.querySelector('.toggle-icon');
        if (content.classList.contains('collapsed')) {
            collapsedCategories.add(id);
            icon.textContent = '▶';
        } else {
            collapsedCategories.delete(id);
            icon.textContent = '▼';
        }
    };
    
    if (collapsedCategories.has(id)) {
        header.querySelector('.toggle-icon').textContent = '▶';
    }

    const content = document.createElement('div');
    content.className = 'category-content';
    if (collapsedCategories.has(id)) content.classList.add('collapsed');
    
    // Drag events for the category itself
    container.addEventListener('dragstart', (e) => {
        draggedItem = container;
        container.classList.add('dragging');
        e.stopPropagation();
    });
    
    container.addEventListener('dragend', () => {
        container.classList.remove('dragging');
        draggedItem = null;
        saveCommandOrder();
    });

    // Allow dropping items into this category's content
    content.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (draggedItem && draggedItem.classList.contains('command-item')) {
            const afterElement = getDragAfterElement(content, e.clientY);
            if (afterElement == null) {
                content.appendChild(draggedItem);
            } else {
                content.insertBefore(draggedItem, afterElement);
            }
        }
    });

    container.appendChild(header);
    container.appendChild(content);
    
    return { catDiv: container, contentDiv: content };
}

function createCommandItem(key, value) {
    const div = document.createElement('div');
    div.className = 'command-item';
    div.draggable = true;
    div.dataset.key = key;
    
    if (key === selectedCommandKey) div.classList.add('active');
    
    div.innerHTML = `<span class="drag-handle">::</span> <span>${key}</span>`;
    
    div.onclick = (e) => {
        e.stopPropagation();
        selectCommand(key);
    };
    
    div.addEventListener('dragstart', (e) => {
        draggedItem = div;
        div.classList.add('dragging');
        e.stopPropagation();
    });
    
    div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
        draggedItem = null;
        saveCommandOrder();
    });
    
    return div;
}

// Allow reordering categories within the main list
commandsList.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (draggedItem && draggedItem.classList.contains('command-category')) {
        const afterElement = getDragAfterElement(commandsList, e.clientY);
        if (afterElement == null) {
            commandsList.appendChild(draggedItem);
        } else {
            commandsList.insertBefore(draggedItem, afterElement);
        }
    }
});

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll(':scope > .draggable:not(.dragging)')];
    // Since we didn't add .draggable class, use specific classes
    const selector = container.classList.contains('category-content') ? '.command-item:not(.dragging)' : '.command-category:not(.dragging)';
    const elements = [...container.querySelectorAll(selector)];

    return elements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function saveCommandOrder() {
    const newCommands = {};
    
    const categories = commandsList.querySelectorAll('.command-category');
    categories.forEach(cat => {
        const catId = cat.dataset.id;
        const catTitle = cat.dataset.title;
        
        // Add category header if it's not the default/implicit one
        if (catId !== 'default') {
            newCommands[catId] = catTitle;
        }
        
        const items = cat.querySelectorAll('.command-item');
        items.forEach(item => {
            const key = item.dataset.key;
            // Preserve existing value
            if (currentCommands[key] !== undefined) {
                newCommands[key] = currentCommands[key];
            }
        });
    });
    
    currentCommands = newCommands;
    await window.electronAPI.writeCommands(currentCommands);
}

function selectCommand(key) {
    selectedCommandKey = key;
    
    // Update UI active state
    document.querySelectorAll('.command-item').forEach(el => {
        if (el.dataset.key === key) el.classList.add('active');
        else el.classList.remove('active');
    });
    
    const val = currentCommands[key];
    cmdTrigger.value = key;
    
    // Parse value
    let action = '';
    let response = '';
    
    if (typeof val === 'string') {
        action = val;
        // Try to extract response:  cmd && {base_dir}/ai-speak.sh "Response"
        const match = action.match(/^(.*)\s*&&\s*\{base_dir\}\/ai-speak\.sh\s*"(.*)"$/);
        if (match) {
            action = match[1].trim();
            response = match[2];
        }
    } else if (val && typeof val === 'object') {
        action = val.action || '';
        response = val.response || '';
    }
    
    cmdAction.value = action;
    cmdResponse.value = response;
}

async function saveCommand() {
    const trigger = cmdTrigger.value.trim();
    if (!trigger) return;
    
    // If renaming, delete old key
    if (selectedCommandKey && selectedCommandKey !== trigger) {
        delete currentCommands[selectedCommandKey];
    }
    
    let finalAction = cmdAction.value.trim();
    const response = cmdResponse.value.trim();
    
    if (response) {
        finalAction = `${finalAction} && {base_dir}/ai-speak.sh "${response}"`;
    }
    
    currentCommands[trigger] = finalAction;
    
    await window.electronAPI.writeCommands(currentCommands);
    selectedCommandKey = trigger;
    renderCommandsList();
}

async function deleteCommand() {
    if (!selectedCommandKey) return;
    
    if (confirm('Delete command "' + selectedCommandKey + '"?')) {
        delete currentCommands[selectedCommandKey];
        await window.electronAPI.writeCommands(currentCommands);
        selectedCommandKey = null;
        cmdTrigger.value = '';
        cmdResponse.value = '';
        cmdAction.value = '';
        renderCommandsList();
    }
}

async function loadLogs() {
    const files = await window.electronAPI.readLogs();
    currentLogs = files.sort().reverse(); // Newest first
    renderLogsList();
}

function renderLogsList() {
    logsList.innerHTML = '';
    currentLogs.forEach(log => {
        const div = document.createElement('div');
        div.className = 'list-item';
        if (selectedLogFile && log.id === selectedLogFile.id) div.classList.add('active');
        
        // Add icon if audio exists
        let text = log.display;
        if (log.hasAudio) text += ' 🔊';
        
        div.textContent = text;
        div.onclick = () => selectLog(log);
        logsList.appendChild(div);
    });
}

async function selectLog(log) {
    selectedLogFile = log;
    renderLogsList();
    
    const content = await window.electronAPI.readLog(log.id);
    logTitle.value = log.display;
    logContent.value = content;
    
    // Show/Hide Play Button
    if (log.hasAudio) {
        btnPlayLog.style.display = 'block';
    } else {
        btnPlayLog.style.display = 'none';
    }
    
    // Stop any current playback
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer = null;
        btnPlayLog.textContent = 'PLAY RECORDING';
    }
}

async function playLog() {
    if (!selectedLogFile || !selectedLogFile.hasAudio) return;
    
    if (audioPlayer && !audioPlayer.paused) {
        audioPlayer.pause();
        btnPlayLog.textContent = 'PLAY RECORDING';
        return;
    }
    
    const audioData = await window.electronAPI.readLogAudio(selectedLogFile.id);
    if (audioData) {
        audioPlayer = new Audio(audioData);
        audioPlayer.onended = () => {
            btnPlayLog.textContent = 'PLAY RECORDING';
        };
        audioPlayer.play();
        btnPlayLog.textContent = 'STOP PLAYBACK';
    }
}

async function saveLog() {
    const title = logTitle.value.trim();
    if (!title) return;
    
    // If renaming, delete old file
    if (selectedLogFile && selectedLogFile.id !== title) {
        await window.electronAPI.deleteLog(selectedLogFile.id);
    }
    
    await window.electronAPI.writeLog(title, logContent.value);
    
    // Refresh list
    loadLogs();
    
    // Select the new/updated log
    // We need to find it in the new list
    setTimeout(() => {
        const newLog = currentLogs.find(l => l.id === title);
        if (newLog) selectLog(newLog);
    }, 100);
}

async function deleteLog() {
    if (!selectedLogFile) return;
    
    if (confirm('Delete log "' + selectedLogFile.display + '"?')) {
        await window.electronAPI.deleteLog(selectedLogFile.id);
        selectedLogFile = null;
        logTitle.value = '';
        logContent.value = '';
        btnPlayLog.style.display = 'none';
        loadLogs();
    }
}

// Event Listeners
btnVoice.addEventListener('click', () => switchView('voice'));
btnLogs.addEventListener('click', () => switchView('logs'));

// Settings Listeners
btnSaveVoiceSettings.addEventListener('click', saveSettings);

btnAddCommand.addEventListener('click', () => {
    selectedCommandKey = null;
    cmdTrigger.value = '';
    cmdResponse.value = '';
    cmdAction.value = '';
    renderCommandsList();
    cmdTrigger.focus();
});

btnSaveCommand.addEventListener('click', saveCommand);
btnDeleteCommand.addEventListener('click', deleteCommand);

btnNewLog.addEventListener('click', () => {
    selectedLogFile = null;
    logTitle.value = '';
    logContent.value = '';
    btnPlayLog.style.display = 'none';
    renderLogsList();
    logTitle.focus();
});

btnSaveLog.addEventListener('click', saveLog);
btnDeleteLog.addEventListener('click', deleteLog);
btnPlayLog.addEventListener('click', playLog);

// Initialize
loadSettings();

// --- LCARS Modal Logic ---
function showLcarsModal(options) {
    return new Promise((resolve) => {
        const modal = document.getElementById('lcars-modal');
        const titleEl = document.getElementById('modal-title');
        const msgEl = document.getElementById('modal-message');
        const inputEl = document.getElementById('modal-input');
        const btnOk = document.getElementById('modal-btn-ok');
        const btnCancel = document.getElementById('modal-btn-cancel');

        titleEl.textContent = (options.title || 'SYSTEM ALERT').toUpperCase();
        msgEl.textContent = options.message || '';
        
        inputEl.style.display = options.type === 'prompt' ? 'block' : 'none';
        inputEl.value = options.defaultValue || '';
        
        btnCancel.style.display = options.type === 'alert' ? 'none' : 'block';
        
        modal.style.display = 'flex';
        
        if (options.type === 'prompt') {
            setTimeout(() => inputEl.focus(), 50);
        } else {
            setTimeout(() => btnOk.focus(), 50);
        }

        const close = (result) => {
            modal.style.display = 'none';
            // Remove listeners
            btnOk.onclick = null;
            btnCancel.onclick = null;
            inputEl.onkeydown = null;
            resolve(result);
        };

        btnOk.onclick = () => {
            if (options.type === 'prompt') close(inputEl.value);
            else close(true);
        };

        btnCancel.onclick = () => close(options.type === 'prompt' ? null : false);

        if (options.type === 'prompt') {
            inputEl.onkeydown = (e) => {
                if (e.key === 'Enter') btnOk.click();
                if (e.key === 'Escape') btnCancel.click();
            };
        }
    });
}

// Presets Logic
btnLoadPreset.addEventListener('click', async () => {
    const presetName = voicePresetSelect.value;
    if (!presetName) return;
    
    const preset = await window.electronAPI.readPreset(presetName);
    if (preset) {
        if (preset.user_rank) userRankInput.value = preset.user_rank;
        if (preset.user_name) userNameInput.value = preset.user_name;
        if (preset.user_surname) userSurnameInput.value = preset.user_surname;
        if (preset.assistant_name) assistantNameInput.value = preset.assistant_name;
        if (preset.phonetic_alternatives) phoneticAlternativesInput.value = (preset.phonetic_alternatives || []).join(', ');
        if (preset.voice_path) voiceModelSelect.value = preset.voice_path;
        if (preset.speaker_id) speakerIdInput.value = preset.speaker_id;
        
        // Try direct match first
        let matched = false;
        for (let i = 0; i < personalitySelect.options.length; i++) {
            if (personalitySelect.options[i].value === preset.personality_file) {
                personalitySelect.selectedIndex = i;
                matched = true;
                break;
            }
        }
        
        // If not matched, try to match by filename
        if (!matched && preset.personality_file) {
             const presetBase = preset.personality_file.split(/[/\\]/).pop();
             for (let i = 0; i < personalitySelect.options.length; i++) {
                const optBase = personalitySelect.options[i].value.split(/[/\\]/).pop();
                if (optBase === presetBase) {
                    personalitySelect.selectedIndex = i;
                    break;
                }
            }
        }

        if (preset.voice_ack_enabled !== undefined) voiceAckToggle.checked = preset.voice_ack_enabled;
        
        await showLcarsModal({ type: 'alert', title: 'PRESET LOADED', message: 'Preset loaded successfully. Click SAVE VOICE SETTINGS to apply changes.' });
    }
});

btnSavePreset.addEventListener('click', async () => {
    const name = await showLcarsModal({ type: 'prompt', title: 'SAVE PRESET', message: 'Enter a name for this preset:' });
    if (!name) return;
    
    const preset = {
        user_rank: userRankInput.value,
        user_name: userNameInput.value,
        user_surname: userSurnameInput.value,
        assistant_name: assistantNameInput.value,
        phonetic_alternatives: phoneticAlternativesInput.value.split(',').map(s => s.trim()).filter(s => s),
        voice_path: voiceModelSelect.value,
        speaker_id: speakerIdInput.value,
        personality_file: personalitySelect.value,
        voice_ack_enabled: voiceAckToggle.checked
    };
    
    await window.electronAPI.writePreset(name, preset);
    
    // Refresh preset list without reloading all settings
    const presets = await window.electronAPI.getPresets();
    voicePresetSelect.innerHTML = '<option value="">-- Select Preset --</option>';
    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        voicePresetSelect.appendChild(opt);
    });
    
    // Select the new preset
    voicePresetSelect.value = name;
    
    await showLcarsModal({ type: 'alert', title: 'PRESET SAVED', message: `Preset "${name}" saved successfully.` });
});

btnDeletePreset.addEventListener('click', async () => {
    const presetName = voicePresetSelect.value;
    if (!presetName) return;
    
    const confirmed = await showLcarsModal({ type: 'confirm', title: 'DELETE PRESET', message: `Are you sure you want to delete preset "${presetName}"?` });
    if (confirmed) {
        await window.electronAPI.deletePreset(presetName);
        loadSettings(); // Refresh list
    }
});

// Personality Editor Logic
btnEditPersonality.addEventListener('click', async () => {
    const path = personalitySelect.value;
    if (!path) return;
    
    const parts = path.split(/[/\\]/);
    const filename = parts[parts.length - 1].replace('.json', '');
    
    const content = await window.electronAPI.readPersonality(filename);
    personalityFilenameInput.value = filename;
    personalityContentInput.value = content;
    personalityModal.style.display = 'block';
});

btnNewPersonality.addEventListener('click', () => {
    personalityFilenameInput.value = '';
    personalityContentInput.value = '{\n    "startup_quotes": [\n        "System ready."\n    ],\n    "shutdown_quotes": [\n        "Shutting down."\n    ]\n}';
    personalityModal.style.display = 'block';
});

btnClosePersonality.addEventListener('click', () => {
    personalityModal.style.display = 'none';
});

btnSavePersonality.addEventListener('click', async () => {
    const filename = personalityFilenameInput.value.trim();
    const content = personalityContentInput.value;
    
    if (!filename) {
        await showLcarsModal({ type: 'alert', title: 'ERROR', message: 'Filename required' });
        return;
    }
    
    try {
        JSON.parse(content); // Validate JSON
    } catch (e) {
        await showLcarsModal({ type: 'alert', title: 'JSON ERROR', message: 'Invalid JSON: ' + e.message });
        return;
    }
    
    await window.electronAPI.writePersonality(filename, content);
    personalityModal.style.display = 'none';
    loadSettings(); // Refresh list
});

btnDeletePersonalityFile.addEventListener('click', async () => {
    const filename = personalityFilenameInput.value.trim();
    if (!filename) return;
    
    const confirmed = await showLcarsModal({ type: 'confirm', title: 'DELETE FILE', message: `Delete personality "${filename}"?` });
    if (confirmed) {
        await window.electronAPI.deletePersonality(filename);
        personalityModal.style.display = 'none';
        loadSettings(); // Refresh list
    }
});

async function deleteCommand() {
    if (!selectedCommandKey) return;
    
    const confirmed = await showLcarsModal({ type: 'confirm', title: 'DELETE COMMAND', message: 'Delete command "' + selectedCommandKey + '"?' });
    if (confirmed) {
        delete currentCommands[selectedCommandKey];
        await window.electronAPI.writeCommands(currentCommands);
        selectedCommandKey = null;
        cmdTrigger.value = '';
        cmdResponse.value = '';
        cmdAction.value = '';
        renderCommandsList();
    }
}

async function deleteLog() {
    if (!selectedLogFile) return;
    
    const confirmed = await showLcarsModal({ type: 'confirm', title: 'DELETE LOG', message: 'Delete log "' + selectedLogFile.display + '"?' });
    if (confirmed) {
        await window.electronAPI.deleteLog(selectedLogFile.id);
        selectedLogFile = null;
        logTitle.value = '';
        logContent.value = '';
        btnPlayLog.style.display = 'none';
        loadLogs();
    }
}

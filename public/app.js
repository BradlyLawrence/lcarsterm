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

function saveSession() {
    const state = {
        terminals: Object.values(terminals).map(t => ({ cwd: t.cwd }))
    };
    localStorage.setItem('lcars-terminal-state', JSON.stringify(state));
}

function restoreSession() {
    const saved = localStorage.getItem('lcars-terminal-state');
    if (saved) {
        try {
            const state = JSON.parse(saved);
            if (state.terminals && Array.isArray(state.terminals)) {
                if (state.terminals.length === 0) createTerminal();
                state.terminals.forEach(termState => {
                    createTerminal(termState.cwd);
                });
            } else {
                const count = state.count || 1;
                for (let i = 0; i < count; i++) {
                    createTerminal();
                }
            }
        } catch (e) {
            console.error("Failed to restore session", e);
            createTerminal();
        }
    } else {
        createTerminal();
    }
}

// Functions
function createTerminal(cwdOrEvent, savedTitle, commandToRun) {
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
            saveSession();
            
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
        
        // If we are clicking the already active tab, we just need to reshow it
        if (activeTermId === id) {
             if (terminals[id]) {
                terminals[id].element.style.display = 'block';
                terminals[id].fitAddon.fit();
                terminals[id].term.focus();
             }
             return;
        }
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
saveSession = function() {
    const state = {
        terminals: Object.values(terminals).map(t => ({ 
            cwd: t.cwd,
            title: t.title
        })),
        settings: {
            theme: currentTheme,
            hotkey: currentHotkey,
            cycleHotkey: currentCycleHotkey
        }
    };
    localStorage.setItem('lcars-terminal-state', JSON.stringify(state));
};

// Update restoreSession to include settings
const originalRestoreSession = restoreSession;
restoreSession = function() {
    const saved = localStorage.getItem('lcars-terminal-state');
    if (saved) {
        try {
            const state = JSON.parse(saved);
            
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
                if (state.terminals.length === 0) createTerminal();
                state.terminals.forEach(termState => {
                    createTerminal(termState.cwd, termState.title);
                });
            } else {
                // Legacy format fallback
                const count = state.count || 1;
                for (let i = 0; i < count; i++) {
                    createTerminal();
                }
            }
        } catch (e) {
            console.error("Failed to restore session", e);
            createTerminal();
            setHotkey(currentHotkey);
            setCycleHotkey(currentCycleHotkey);
        }
    } else {
        createTerminal();
        setHotkey(currentHotkey);
        setCycleHotkey(currentCycleHotkey);
    }
};

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

btnSettings.addEventListener('click', toggleSettings);

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

btnNewTerm.addEventListener('click', createTerminal);

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

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const pty = require('node-pty');
const os = require('os');
const path = require('path');

// Set up static file serving
app.use(express.static(path.join(__dirname, 'public')));
app.use('/xterm', express.static(path.join(__dirname, 'node_modules/@xterm/xterm')));
app.use('/xterm-addon-fit', express.static(path.join(__dirname, 'node_modules/@xterm/addon-fit')));
app.use('/xterm-addon-web-links', express.static(path.join(__dirname, 'node_modules/@xterm/addon-web-links')));

const fs = require('fs');

// Default shell based on OS
const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

io.on('connection', (socket) => {
    console.log('Client connected');
    
    // Map to store terminals for this socket
    const terminals = {};

    // Create a new terminal
    socket.on('create-terminal', (options, callback) => {
        // Handle both (callback) and (options, callback) signatures
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        options = options || {};

        const termId = Math.random().toString(36).substring(7);
        
        const term = pty.spawn(shell, [], {
            name: 'xterm-color',
            cols: 80,
            rows: 30,
            cwd: options.cwd || process.env.HOME,
            env: process.env
        });

        terminals[termId] = term;

        // Send data from pty to client
        term.onData((data) => {
            socket.emit('output', { id: termId, data });
        });

        term.onExit(() => {
            socket.emit('term-exit', { id: termId });
            delete terminals[termId];
        });

        // Return the ID to the client
        if (callback) callback({ id: termId });
    });

    // Get CWD for a terminal
    socket.on('get-cwd', ({ id }) => {
        const term = terminals[id];
        if (!term) return;

        try {
            let cwd;
            if (os.platform() === 'linux') {
                cwd = fs.readlinkSync(`/proc/${term.pid}/cwd`);
            }
            // Add other platforms if needed, but Linux is the target
            
            if (cwd) {
                socket.emit('cwd-updated', { id, cwd });
            }
        } catch (e) {
            // Ignore errors (e.g. process died)
        }
    });

    // Receive data from client and write to specific pty
    socket.on('input', ({ id, data }) => {
        if (terminals[id]) {
            terminals[id].write(data);
        }
    });

    // Handle resize for specific pty
    socket.on('resize', ({ id, cols, rows }) => {
        if (terminals[id]) {
            terminals[id].resize(cols, rows);
        }
    });

    // Kill specific terminal
    socket.on('kill', ({ id }) => {
        if (terminals[id]) {
            terminals[id].kill();
            delete terminals[id];
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
        // Clean up all terminals
        Object.values(terminals).forEach(term => term.kill());
    });
});

const PORT = process.env.PORT || 0; // 0 lets the OS assign a random free port
http.listen(PORT, () => {
    console.log(`LCARS Terminal running at http://localhost:${http.address().port}`);
});

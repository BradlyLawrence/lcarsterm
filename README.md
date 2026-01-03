# LCARS Terminal

A Star Trek LCARS style terminal emulator running in your browser, powered by Node.js.

## Prerequisites

- Node.js installed
- Build tools for `node-pty` (Python, make, g++)
  - On Ubuntu/Debian: `sudo apt install -y build-essential python3`

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

## Usage

1. Start the server:
   ```bash
   npm start
   ```

2. Open your browser and navigate to:
   `http://localhost:3000`

## Features

- Full bash terminal emulation
- LCARS interface styling
- Responsive layout
- Clickable LCARS buttons (SYS, NET, LOG) that execute commands

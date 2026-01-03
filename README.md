# LCARS Terminal

A fully functional, Star Trek-inspired terminal emulator for Linux, featuring the iconic LCARS (Library Computer Access and Retrieval System) interface. Built with Electron, xterm.js, and node-pty.

![LCARS Terminal Screenshot](public/icon.png)

## Features

- **Authentic LCARS Interface**: Immersive UI styled after the 24th-century operating system.
- **Multiple Tabs**: Manage multiple terminal sessions simultaneously with a sidebar tab manager.
- **Global Hotkeys**:
  - **Toggle Visibility**: Default `F8` (Configurable).
  - **Cycle Tabs**: Default `F9` (Configurable).
- **Session Restoration**: Automatically restores your open tabs and working directories from the previous session.
- **Command Line Control**: Control the terminal from external scripts (open tabs, run commands, close tabs).
- **Voice Integration Ready**: Designed to work alongside voice assistants (includes example integration scripts).
- **Customizable**: Settings panel to configure hotkeys and preferences.

## Installation

### AppImage (Recommended)

1. Download the latest `.AppImage` file from the [Releases](../../releases) page.
2. Make the file executable:
   ```bash
   chmod +x "LCARS Terminal-1.0.0.AppImage"
   ```
3. Run it:
   ```bash
   ./"LCARS Terminal-1.0.0.AppImage"
   ```

### From Source

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/lcarsterm.git
   cd lcarsterm
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the application:
   ```bash
   npm start
   ```

## Usage

### Interface
- **NEW**: Open a new terminal tab.
- **CONFIG**: Open the settings panel to change hotkeys.
- **FULL**: Toggle fullscreen mode.
- **EXIT**: Close the application.

### Command Line Arguments
You can control the running instance of LCARS Terminal using command line arguments. This is useful for integrating with other tools or scripts.

| Argument | Description |
|----------|-------------|
| `--new-tab [path]` | Open a new tab. Optionally specify the working directory. |
| `--title "Name"` | Set the title for the new tab. |
| `--execute "cmd"` | Execute a command in the new tab immediately. |
| `--close "Name"` | Close any existing tab with the specified title. |

#### Example: Voice Command Integration
The included `launch_voice.sh` script demonstrates how to use these arguments to create a dedicated "Voice" tab that runs a python script and cleans up after itself.

```bash
# Open a new tab named "Galactica Voice", run a script, and exit when done
./LCARS\ Terminal.AppImage --new-tab --title="Galactica Voice" --execute="python3 voice_assistant.py; exit"
```

## Development

To build the AppImage yourself:

```bash
npm run dist
```
The output will be in the `dist/` directory.

## License

[MIT](LICENSE)

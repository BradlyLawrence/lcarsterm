# LCARS Terminal v2.2.1

## ✨ New Features
- **Shutdown Notification**: Added a new LCARS-styled "System Shutdown" screen. When exiting the application, the interface now visibly confirms that the voice subsystem is being terminated, preventing the appearance of the app "freezing" during cleanup.

## 🐛 Bug Fixes
- **Graceful Exit**: Fixed an issue where using the "Quit" option from the System Tray icon would forcefully close the application without properly shutting down the voice assistant process. It now performs the same graceful cleanup as the main window's exit button.

# LCARS Terminal v2.2.0

## ✨ New Features
- **Captain's Log Backup**: Re-implemented the ability to backup all log entries and audio files to a user-specified location (defaulting to `~/Documents`).
- **Background Mode**: New "Start Minimized" option allows the terminal to launch silently to the system tray. Use the global hotkey (default F8) to summon it when needed.
- **System Tray Icon**: Added a tray icon for quick access to show/hide the terminal or quit the application.
- **Smart Tab Numbering**: Closing a terminal now recycles its number (e.g., closing "TERM 2" makes "TERM 2" available for the next new tab) rather than always incrementing.

## 🛠 Improvements
- **Refined Configuration UI**: The Settings menu has been completely reorganized for better workflow.
    - "General Settings" now groups hotkeys, themes, and behavior toggles.
    - Voice functionality is now managed in a dedicated "Voice System Configuration" section with tabs for "Settings" and "Command Editor".
    - The sidebar has been decluttered by removing the separate "VOICE" button.
- **Enhanced Calendar Support**: The calendar agent logic has been significantly improved.
    - Automatic detection now supports Thunderbird, KDE/Akonadi, and standard `~/.calendar` paths in addition to Gnome/Evolution.
    - Improved cache handling ensures the calendar works correctly in read-only AppImage environments.
- **AppImage Compatibility**: Improved resource resolution for voice models and configuration files when running as a portable AppImage.

## 🐛 Bug Fixes
- **Terminal Focus**: Fixed a regression where switching between Settings/Logs and Terminals could break input focus.
- **Config Paths**: Fixed issues where the calendar agent would fail to write logs or cache files on systems with restricted permissions.

# LCARS Terminal v2.1.0

## ✨ New Features
- **Voice Active Indicator**: A new "VOICE ACTIVE" indicator in the top bar shows when the voice interface is ready and listening.
- **Initialization Announcement**: The system now audibly confirms "Voice interface initialised" when ready.

## 🛠 Improvements
- **Test Voice**: Added a quick "TEST" action in settings to speak arbitrary text using your current voice configuration.
- **Volume-Consistent Speech**: Startup briefing and spoken responses now respect the configured voice volume consistently.

## 🐛 Bug Fixes
- **Voice Settings**: Fixed an issue where the startup briefing would not use the correct speaker ID for multi-speaker voice models.
- **Audio Overlap**: Fixed an issue where the initialization message would play over the startup briefing. The system now waits for the briefing to complete.
- **Navigation**: Fixed a bug preventing switching to terminal tabs directly from the Voice or Logs views.
- **Tab Management**: Improved drag-and-drop functionality for reordering terminal tabs.

# LCARS Terminal v2.0.0

## 🚀 Major Feature: Offline Voice Assistant
This release introduces a fully offline, privacy-first voice assistant inspired by Star Trek.
- **Local Processing**: No audio is sent to the cloud. Uses **Vosk** (STT) and **Piper** (TTS).
- **Natural Interaction**: No strict wake-words required. Just address the assistant by name (e.g., "Computer, status report").
- **Personalities**: Comes with pre-configured personalities including "Computer", "Leo", "Dalek", "GLaDOS", and more.
- **Customizable**: Create your own personalities and voice commands via JSON files.

## ✨ New Features
- **Persistent Configuration**: All user settings, voices, and personalities are now stored in `~/.config/lcarsterm` (on Linux). Your customizations now survive application updates.
- **Calendar Integration**: Add an ICS URL to get your daily schedule in briefings.
- **Weather Integration**: Configure your city for real-time weather updates.
- **Startup Briefing**: Optional daily briefing upon launching the terminal.
- **Phonetic Alternatives**: Configure alternative pronunciations for the assistant's name to improve recognition accuracy.

## 🛠 Improvements
- **Settings UI**: Reorganized configuration panel for better usability.
- **Preset Management**: Improved saving/loading of voice presets. Saving a preset no longer reverts unsaved changes.
- **Documentation**: Completely rewritten README with comprehensive guides for the voice assistant and customization.

## 🐛 Bug Fixes
- Fixed a crash in the voice assistant caused by incorrect path resolution (`BASE_DIR` issue).
- Fixed hardcoded weather location in utility scripts.
- Added missing LICENSE file.

## 📦 Installation
Download the `.AppImage` from the assets below, make it executable, and run!

```bash
chmod +x "LCARS Terminal-2.0.0.AppImage"
./"LCARS Terminal-2.0.0.AppImage"
```

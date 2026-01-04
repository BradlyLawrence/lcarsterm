# LCARS Terminal v2.1.0

## ✨ New Features
- **Voice Active Indicator**: A new "VOICE ACTIVE" indicator in the top bar shows when the voice interface is ready and listening.
- **Initialization Announcement**: The system now audibly confirms "Voice interface initialised" when ready.

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

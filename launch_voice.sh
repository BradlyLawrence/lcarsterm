#!/bin/bash

# Path to the LCARS Terminal AppImage
# Adjust this path if you move the AppImage file
APP_PATH="/home/bradly/Projects/lcarsterm/dist/LCARS Terminal-1.0.0.AppImage"

# The actual command to run your voice assistant.
# Replace the echo/sleep commands with your actual script, e.g.:
# VOICE_CMD="python3 /home/bradly/voice-assistant/main.py"
# VOICE_CMD="echo 'Initializing Galactica Voice Systems...'; echo 'Listening...'; sleep 5; echo 'Voice systems active.'; bash"

# Run LCARS Terminal with arguments:
# -c "Galactica Voice"      : Close any existing tabs with this name (prevents duplicates)
# -n                        : Open a new tab
# -r "Galactica Voice"      : Rename the new tab
# -e "..."                  : Execute the voice command
# We run this in the background (&) so it doesn't block if it starts the main app instance
"$APP_PATH" --close="Galactica Voice" &

# Run the startup sequence in the background
(
    sleep 10
    /home/bradly/.leo/ai-speak.sh 'Voice interface initialized.'
    # Use --flag=value syntax to prevent Electron from reordering arguments
    "$APP_PATH" --new-tab="$HOME" --title="Galactica Voice" --execute="/home/bradly/.leo/.venv/bin/python /home/bradly/.leo/voice-command.py; exit"
) &

#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Use environment variable if set, otherwise default to local file
if [ -n "$LCARS_SETTINGS_PATH" ]; then
    SETTINGS_FILE="$LCARS_SETTINGS_PATH"
else
    SETTINGS_FILE="$SCRIPT_DIR/galactica_settings.json"
fi

# Determine Workspace Root
if [ -n "$LCARS_WORKSPACE" ]; then
    WORKSPACE_DIR="$LCARS_WORKSPACE"
else
    WORKSPACE_DIR="$SCRIPT_DIR"
fi

# Load Settings
USER_NAME=$(python3 -c "import json; d=json.load(open('$SETTINGS_FILE')); print(d.get('user_name') or 'Bradly')")
USER_RANK=$(python3 -c "import json; d=json.load(open('$SETTINGS_FILE')); print(d.get('user_rank') or 'Captain')")
USER_SURNAME=$(python3 -c "import json; d=json.load(open('$SETTINGS_FILE')); print(d.get('user_surname') or 'User')")
ASSISTANT_NAME=$(python3 -c "import json; d=json.load(open('$SETTINGS_FILE')); print(d.get('assistant_name') or 'Leo')")

# Usage: ./shutdown-roulette.sh [shutdown|restart]
# Default is shutdown if no argument is given.
ACTION=${1:-shutdown}

# --- LOAD PHRASES FROM PERSONALITY ---
eval $(python3 -c "
import json, os, random, shlex
script_dir = '$SCRIPT_DIR'
workspace_dir = '$WORKSPACE_DIR'
try:
    settings = json.load(open('$SETTINGS_FILE'))
    p_file = settings.get('personality_file', '')
    
    # Handle relative paths
    if p_file and not os.path.isabs(p_file):
        p_file = os.path.join(workspace_dir, p_file)
        
    # Fallback to bundled default if not found
    if not p_file or not os.path.exists(p_file):
        p_file = os.path.join(workspace_dir, 'personalities/leo.json')
    
    with open(p_file) as f:
        p_data = json.load(f)
    
    shutdown_phrases = p_data.get('shutdown_phrases', [])
    restart_phrases = p_data.get('restart_phrases', [])
    
    # Fallback if empty
    if not shutdown_phrases: shutdown_phrases = ['Goodbye.']
    if not restart_phrases: restart_phrases = ['Restarting.']

    print('SHUTDOWN_PHRASES=(' + ' '.join([shlex.quote(s) for s in shutdown_phrases]) + ')')
    print('RESTART_PHRASES=(' + ' '.join([shlex.quote(r) for r in restart_phrases]) + ')')

except Exception as e:
    print('SHUTDOWN_PHRASES=(\"System shutdown initiated.\")')
    print('RESTART_PHRASES=(\"System restart initiated.\")')
")

# --- LOGIC SELECTION ---
if [[ "$ACTION" == "restart" || "$ACTION" == "reboot" ]]; then
    # Pick a random RESTART phrase
    RAND_INDEX=$((RANDOM % ${#RESTART_PHRASES[@]}))
    CHOSEN_PHRASE=${RESTART_PHRASES[$RAND_INDEX]}
    SYSTEM_CMD="systemctl reboot -i"
else
    # Pick a random SHUTDOWN phrase
    RAND_INDEX=$((RANDOM % ${#SHUTDOWN_PHRASES[@]}))
    CHOSEN_PHRASE=${SHUTDOWN_PHRASES[$RAND_INDEX]}
    SYSTEM_CMD="systemctl poweroff -i"
fi

# Replace placeholders
CHOSEN_PHRASE="${CHOSEN_PHRASE//\{USER_NAME\}/$USER_NAME}"
CHOSEN_PHRASE="${CHOSEN_PHRASE//\{USER_RANK\}/$USER_RANK}"
CHOSEN_PHRASE="${CHOSEN_PHRASE//\{USER_SURNAME\}/$USER_SURNAME}"
CHOSEN_PHRASE="${CHOSEN_PHRASE//\{ASSISTANT_NAME\}/$ASSISTANT_NAME}"

# --- EXECUTION ---
# Speak the phrase
"$SCRIPT_DIR/ai-speak.sh" "$CHOSEN_PHRASE"

# Wait for speech to finish (adjust sleep if phrases get longer)
sleep 4

# Pull the trigger
$SYSTEM_CMD

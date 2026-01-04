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

# --- LOAD INTRODUCTIONS FROM PERSONALITY ---
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
    
    intros = p_data.get('introductions', [])
    
    # Fallback if empty
    if not intros: intros = ['Hello. I am ready.']

    print('INTRODUCTIONS=(' + ' '.join([shlex.quote(i) for i in intros]) + ')')

except Exception as e:
    print('INTRODUCTIONS=(\"Hello.\")')
")

# Pick a random one
RAND_INDEX=$((RANDOM % ${#INTRODUCTIONS[@]}))
CHOSEN_INTRO=${INTRODUCTIONS[$RAND_INDEX]}

# Replace placeholders
CHOSEN_INTRO="${CHOSEN_INTRO//\{USER_NAME\}/$USER_NAME}"
CHOSEN_INTRO="${CHOSEN_INTRO//\{USER_RANK\}/$USER_RANK}"
CHOSEN_INTRO="${CHOSEN_INTRO//\{USER_SURNAME\}/$USER_SURNAME}"
CHOSEN_INTRO="${CHOSEN_INTRO//\{ASSISTANT_NAME\}/$ASSISTANT_NAME}"

# Speak it
"$SCRIPT_DIR/ai-speak.sh" "$CHOSEN_INTRO"

#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# --- DELEGATE TO COMPILED BINARY IF AVAILABLE ---
# This ensures we use the Python version which supports the custom configuration
if [ -f "$SCRIPT_DIR/startup-briefing" ]; then
    "$SCRIPT_DIR/startup-briefing"
    exit $?
fi

# --- PART 1: GATHER USEFUL DATA ---

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
WEATHER_LOCATION=$(python3 -c "import json; d=json.load(open('$SETTINGS_FILE')); print(d.get('weather_location') or 'Cape Town')")

# Get the time of day (Morning/Afternoon/Evening)
HOUR=$(date +%H)
if [ "$HOUR" -lt 12 ]; then
    GREETING="Good morning"
elif [ "$HOUR" -lt 18 ]; then
    GREETING="Good afternoon"
else
    GREETING="Good evening"
fi

# Get the Date
DATE_STR=$(date +"%A, %B %d")

# Get System Stats (Disk Space on Root)
# This grabs the percentage of disk used (e.g., "45%")
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}')

# Optional: Get Weather (Requires Internet)
# If offline, this variable stays empty so Alan doesn't error out.
WEATHER=$(curl -s --max-time 2 "wttr.in/$WEATHER_LOCATION?format=%C+and+%t" || echo "")

# --- PART 2: THE ATMOSPHERIC LIST ---

# --- LOAD QUOTES FROM PERSONALITY ---
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
    
    quotes = p_data.get('startup_quotes', [])
    
    # Fallback if empty
    if not quotes: quotes = ['System ready.']

    print('QUOTES=(' + ' '.join([shlex.quote(q) for q in quotes]) + ')')

except Exception as e:
    print('QUOTES=(\"System ready.\")')
")

# Pick a random quote
RAND_INDEX=$((RANDOM % ${#QUOTES[@]}))
CHOSEN_QUOTE=${QUOTES[$RAND_INDEX]}

# Replace placeholders
CHOSEN_QUOTE="${CHOSEN_QUOTE//\{USER_NAME\}/$USER_NAME}"
CHOSEN_QUOTE="${CHOSEN_QUOTE//\{USER_RANK\}/$USER_RANK}"
CHOSEN_QUOTE="${CHOSEN_QUOTE//\{USER_SURNAME\}/$USER_SURNAME}"
CHOSEN_QUOTE="${CHOSEN_QUOTE//\{ASSISTANT_NAME\}/$ASSISTANT_NAME}"

# --- PART 3: CONSTRUCT THE SPEECH ---

# Start with the Greeting and Date
FULL_TEXT="$GREETING, $USER_RANK. Today is $DATE_STR."

# Add Weather if we found it
if [ ! -z "$WEATHER" ]; then
    FULL_TEXT="$FULL_TEXT The current weather is $WEATHER."
fi

# Add System Stats
FULL_TEXT="$FULL_TEXT System disk usage is at $DISK_USAGE."

# End with the Random Quote
FULL_TEXT="$FULL_TEXT $CHOSEN_QUOTE"

# --- PART 4: SPEAK IT ---
# Call your existing ai-speak script
"$SCRIPT_DIR/ai-speak.sh" "$FULL_TEXT"

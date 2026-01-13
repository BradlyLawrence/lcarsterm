#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Use environment variable if set, otherwise default to local file
if [ -n "$LCARS_SETTINGS_PATH" ]; then
    SETTINGS_FILE="$LCARS_SETTINGS_PATH"
else
    SETTINGS_FILE="$SCRIPT_DIR/galactica_settings.json"
fi

# Load Settings
USER_NAME=$(python3 -c "import json; d=json.load(open('$SETTINGS_FILE')); print(d.get('user_name') or 'Bradly')")
USER_RANK=$(python3 -c "import json; d=json.load(open('$SETTINGS_FILE')); print(d.get('user_rank') or 'Captain')")
USER_SURNAME=$(python3 -c "import json; d=json.load(open('$SETTINGS_FILE')); print(d.get('user_surname') or 'User')")
ASSISTANT_NAME=$(python3 -c "import json; d=json.load(open('$SETTINGS_FILE')); print(d.get('assistant_name') or 'Leo')")
WEATHER_LOCATION=$(python3 -c "import json; d=json.load(open('$SETTINGS_FILE')); print(d.get('weather_location') or 'Cape Town')")

# Check what the user wants to do (passed as an argument)
ACTION=$1

if [ "$ACTION" == "time" ]; then
    # Get time and speak it
    CURRENT_TIME=$(date +%H:%M)
    "$SCRIPT_DIR/ai-speak.sh" "It is currently $CURRENT_TIME"

elif [ "$ACTION" == "weather" ]; then
    # Announce and open browser
    "$SCRIPT_DIR/ai-speak.sh" "Checking long range sensors."
    export DISPLAY=:0
    xdg-open "https://wttr.in/$WEATHER_LOCATION"

elif [ "$ACTION" == "music" ]; then
    # Check if Spotify is running
    if pgrep -x "spotify" > /dev/null
    then
        # It is running, just hit play
        playerctl -p spotify play
        "$SCRIPT_DIR/ai-speak.sh" "Resuming playback."
    else
        # It is NOT running. Launch it.
        "$SCRIPT_DIR/ai-speak.sh" "Launching Spotify. Stand by."
        export DISPLAY=:0
        nohup spotify >/dev/null 2>&1 & disown  # (Or 'flatpak run com.spotify.Client &' if you used Flatpak)

        # Wait 5 seconds for it to load, then hit play
        sleep 5
        playerctl play
    fi

elif [ "$ACTION" == "pause" ]; then
    playerctl -a pause

elif [ "$ACTION" == "next" ]; then
    playerctl -p spotify next
    "$SCRIPT_DIR/ai-speak.sh" "Skipping track."

elif [ "$ACTION" == "playlist_80s" ]; then
    "$SCRIPT_DIR/ai-speak.sh" "Loading Nostalgic playlist."

    # 1. Ensure Spotify is actually open first
    if ! pgrep -x "spotify" > /dev/null; then
         export DISPLAY=:0
         nohup spotify >/dev/null 2>&1 & disown
         sleep 4
    fi

    # 2. Inject the command directly via DBus (The Nuclear Option)
    # REPLACE THE URI BELOW WITH YOURS
    dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.OpenUri string:"spotify:playlist:4NL0jkmwHxwat1797qV0JQ"

    # 3. Force Play
    sleep 2
    playerctl -p spotify play

elif [ "$ACTION" == "play_playlist" ]; then
    URI="$2"
    "$SCRIPT_DIR/ai-speak.sh" "Loading playlist."

    # 0. Pause everything else first
    playerctl -a pause || true

    if ! pgrep -x "spotify" > /dev/null; then
         export DISPLAY=:0
         nohup spotify >/dev/null 2>&1 & disown
         sleep 4
    fi

    # Inject the command directly via DBus
    if [ -n "$URI" ]; then
        dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.OpenUri string:"$URI"
        sleep 2
        playerctl -p spotify play
    else
        "$SCRIPT_DIR/ai-speak.sh" "Error. No playlist identifier provided."
    fi
     
elif [ "$ACTION" == "status_report" ]; then

    # Get config
    CONFIG_ITEMS=$(python3 -c "import json; 
try:
    d=json.load(open('$SETTINGS_FILE'))
    print(' '.join(d.get('system_report_config', ['header', 'uptime', 'thermal', 'memory', 'disk', 'calendar', 'network'])))
except:
    print('header uptime thermal memory disk calendar network')
")

    REPORT=""

    # 1. Header
    if [[ " $CONFIG_ITEMS " =~ " header " ]]; then
        SYSTEM_NAME=$(hostname)
        REPORT="$SYSTEM_NAME Status Report. "
    fi

    # 2. Time
    if [[ " $CONFIG_ITEMS " =~ " time " ]]; then
        NOW=$(date +"%I:%M %p")
        REPORT="$REPORT The time is $NOW. "
    fi

    # 3. Date
    if [[ " $CONFIG_ITEMS " =~ " date " ]]; then
        TODAY=$(date +"%A, %B %d")
        REPORT="$REPORT Today is $TODAY. "
    fi

    # 4. Uptime
    if [[ " $CONFIG_ITEMS " =~ " uptime " ]]; then
        UPTIME=$(uptime -p | sed 's/up //')
        REPORT="$REPORT System uptime is $UPTIME. "
    fi
    
    # 5. Thermal
    if [[ " $CONFIG_ITEMS " =~ " thermal " ]]; then
        # Get CPU Temp (Targets 'Package id 0' or 'Core 0')
        TEMP=$(sensors 2>/dev/null | grep -E "Package id 0|Core 0" | head -n 1 | awk '{print $4}' | tr -d '+°C' | cut -d'.' -f1)
        # Fallback to sysfs if sensors is not installed
        [ -z "$TEMP" ] && TEMP=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null | sed 's/.\{3\}$//')
        [ -z "$TEMP" ] && TEMP="unknown"
        REPORT="$REPORT Thermal core is at $TEMP degrees. "
    fi

    # 6. Memory
    if [[ " $CONFIG_ITEMS " =~ " memory " ]]; then
        RAM=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')
        REPORT="$REPORT Memory usage $RAM percent. "
    fi

    # 7. Disk
    if [[ " $CONFIG_ITEMS " =~ " disk " ]]; then
        DISK=$(df -h / | grep / | awk 'NR==1 || /^\// {print $5}' | tail -n 1 | tr -d '%')
        REPORT="$REPORT Primary drive is $DISK percent full. "
    fi

    # 8. Calendar
    if [[ " $CONFIG_ITEMS " =~ " calendar " ]]; then
        # Check for binary first, then python script
        if [ -f "$SCRIPT_DIR/calendar-agent" ]; then
            CAL_TEXT=$("$SCRIPT_DIR/calendar-agent" report_today)
        elif [ -f "$SCRIPT_DIR/calendar-agent.py" ]; then
            CAL_TEXT=$(python3 "$SCRIPT_DIR/calendar-agent.py" report_today)
        else
            CAL_TEXT=""
        fi
        
        if [ -n "$CAL_TEXT" ]; then
            REPORT="$REPORT $CAL_TEXT"
        fi
    fi

    # 9. Network
    if [[ " $CONFIG_ITEMS " =~ " network " ]]; then
        # Internet Latency (Ping Google DNS)
        PING=$(ping -c 1 8.8.8.8 | grep 'time=' | awk -F'time=' '{print $2}' | cut -d' ' -f1 | cut -d'.' -f1)
        if [ -z "$PING" ]; then PING_STATUS="offline"; else PING_STATUS="$PING milliseconds"; fi
        REPORT="$REPORT Network latency is $PING_STATUS. "
    fi

    "$SCRIPT_DIR/ai-speak.sh" "$REPORT"
fi

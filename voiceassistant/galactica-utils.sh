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
    playerctl play

elif [ "$ACTION" == "playlist_focus" ]; then
    "$SCRIPT_DIR/ai-speak.sh" "Engaging focus mode."

    if ! pgrep -x "spotify" > /dev/null; then
         export DISPLAY=:0
         nohup spotify >/dev/null 2>&1 & disown
         sleep 4
    fi

    # REPLACE THE URI BELOW WITH YOURS
    dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.OpenUri string:"spotify:playlist:2xWjjtCVKKxVcxifBWK3dI"

    sleep 2
    playerctl play
elif [ "$ACTION" == "audio_video" ]; then
    "$SCRIPT_DIR/ai-speak.sh" "Disengaging sync. Optimizing for video."
    # Set default output to real speakers (Zero Latency)
    pactl set-default-sink alsa_output.pci-0000_09_00.6.analog-stereo
    
    # Optional: Force move any playing streams to the speakers immediately
    # (This grabs Spotify/Firefox if they are currently playing and moves them)
    pactl list sink-inputs short | cut -f1 | while read stream; do
        pactl move-sink-input $stream alsa_output.pci-0000_09_00.6.analog-stereo
    done

elif [ "$ACTION" == "audio_music" ]; then
    "$SCRIPT_DIR/ai-speak.sh" "Engaging multi-room sync."
    # Set default output to the Pipe (Synced Delay)
    pactl set-default-sink Snapcast
    
    # Move current streams to the pipe
    pactl list sink-inputs short | cut -f1 | while read stream; do
        pactl move-sink-input $stream Snapcast
    done
elif [ "$ACTION" == "status_report" ]; then
    # 1. System Stats (Uptime, Temp, RAM, Disk)
    UPTIME=$(uptime -p | sed 's/up //')
    
    # Get CPU Temp (Targets 'Package id 0' or 'Core 0')
    TEMP=$(sensors 2>/dev/null | grep -E "Package id 0|Core 0" | head -n 1 | awk '{print $4}' | tr -d '+°C' | cut -d'.' -f1)
    # Fallback to sysfs if sensors is not installed
    [ -z "$TEMP" ] && TEMP=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null | sed 's/.\{3\}$//')
    [ -z "$TEMP" ] && TEMP="unknown"

    RAM=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')
    DISK=$(df -h / | grep / | awk 'NR==1 || /^\// {print $5}' | tail -n 1 | tr -d '%')

    # 2. Node Count (Queries Snapcast Server)
    # Counts unique connected host IDs in the server's status JSON
    NODES=$(echo '{"id":1,"jsonrpc":"2.0","method":"Server.GetStatus"}' | nc -w 1 localhost 1705 | grep -o '"host":' | wc -l)
    # Subtract 1 to ignore the local client on Galactica itself
    CLIENTS=$((NODES - 1))
    [ $CLIENTS -lt 0 ] && CLIENTS=0

    # 3. Internet Latency (Ping Google DNS)
    PING=$(ping -c 1 8.8.8.8 | grep 'time=' | awk -F'time=' '{print $2}' | cut -d' ' -f1 | cut -d'.' -f1)
    if [ -z "$PING" ]; then PING_STATUS="offline"; else PING_STATUS="$PING milliseconds"; fi

    # 4. Final Construction
    REPORT="Galactica Status Report. System uptime is $UPTIME. Thermal core is at $TEMP degrees. Memory usage $RAM percent. Primary drive is $DISK percent full. There are $CLIENTS active nodes in the hive. Network latency is $PING_STATUS."

    "$SCRIPT_DIR/ai-speak.sh" "$REPORT"
fi

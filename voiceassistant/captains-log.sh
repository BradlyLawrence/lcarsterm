#!/bin/bash
LOG_DIR="${2:-$HOME/Documents/CaptainsLogs}"
SESSION_DIR="/tmp/galactica_log_session"
PID_FILE="/tmp/captains_log.pid"
COUNTER_FILE="$SESSION_DIR/counter"

case $1 in
    start)
        # Ensure log dir exists
        mkdir -p "$LOG_DIR"

        # 1. Prepare a fresh session folder
        rm -rf "$SESSION_DIR"
        mkdir -p "$SESSION_DIR"
        echo "1" > "$COUNTER_FILE"
        
        # 2. Start Recording Take 1
        TIMESTAMP=$(date +"%Y-%m-%d_%H-%M")
        SEGMENT="$SESSION_DIR/segment_001.wav"
        
        # Save the FINAL destination path for later
        echo "$LOG_DIR/log_$TIMESTAMP.wav" > /tmp/current_log_path
        
        # Start ffmpeg
        ffmpeg -f pulse -i default -y "$SEGMENT" > /dev/null 2>&1 &
        echo $! > "$PID_FILE"
        ;;
        
    pause)
        # Kill the current recording process entirely
        if [ -f "$PID_FILE" ]; then
            kill -INT $(cat "$PID_FILE") 2>/dev/null
            rm "$PID_FILE"
        fi
        ;;
        
    resume)
        # 1. Increment the take counter
        COUNT=$(cat "$COUNTER_FILE")
        COUNT=$((COUNT+1))
        echo "$COUNT" > "$COUNTER_FILE"
        
        # 2. Format filename with padding (segment_002.wav)
        PAD_COUNT=$(printf "%03d" $COUNT)
        SEGMENT="$SESSION_DIR/segment_${PAD_COUNT}.wav"
        
        # 3. Start NEW recording
        ffmpeg -f pulse -i default -y "$SEGMENT" > /dev/null 2>&1 &
        echo $! > "$PID_FILE"
        ;;
        
    stop)
        # 1. Stop the active recording
        if [ -f "$PID_FILE" ]; then
            kill -INT $(cat "$PID_FILE") 2>/dev/null
            rm "$PID_FILE"
        fi
        
        # Give ffmpeg a moment to close the file
        sleep 1
        
        # 2. Create a list of files for ffmpeg to merge
        FINAL_PATH=$(cat /tmp/current_log_path)
        LIST_FILE="$SESSION_DIR/list.txt"
        
        # Generate the concat list
        for f in "$SESSION_DIR"/segment_*.wav; do
            echo "file '$f'" >> "$LIST_FILE"
        done
        
        # 3. Merge all segments into one Master WAV
        ffmpeg -f concat -safe 0 -i "$LIST_FILE" -c copy "$FINAL_PATH" > /dev/null 2>&1
        
        # Clean up temp files
        rm -rf "$SESSION_DIR"
        ;;
esac
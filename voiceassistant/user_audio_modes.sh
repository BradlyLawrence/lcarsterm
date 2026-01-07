#!/bin/bash
# User-specific Audio Commands
# This file contains audio mode switching logic moved from the main utils
# Snapcast multi-room audio sync functions

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
ACTION=$1

if [ "$ACTION" == "audio_video" ]; then
    "$SCRIPT_DIR/ai-speak.sh" "Disengaging sync. Optimizing for video."
    # Set default output to real speakers (Zero Latency)
    # Note: Hardware ID is specific to the machine this was extracted from
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
fi

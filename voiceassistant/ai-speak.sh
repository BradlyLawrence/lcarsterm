#!/bin/bash
# Usage: ./ai-speak.sh "Text to speak" [Speaker_ID]

TEXT="$1"
ARG_SPEAKER_ID="$2"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PIPER_DIR="$SCRIPT_DIR/piper"

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

# Extract settings
eval $(python3 -c "
import json, os
script_dir = '$SCRIPT_DIR'
workspace_dir = '$WORKSPACE_DIR'
try:
    with open('$SETTINGS_FILE') as f:
        d = json.load(f)
    
    voice_path = d.get('voice_path', '')
    if not voice_path:
        voice_path = os.path.join(workspace_dir, 'voices/LibriVox/libri.onnx')
    
    # Handle relative paths
    if not os.path.isabs(voice_path):
        voice_path = os.path.join(workspace_dir, voice_path)

    print(f'ASSISTANT_NAME=\"{d.get(\"assistant_name\", \"Leo\")}\"')
    print(f'VOICE=\"{voice_path}\"')
    print(f'CONFIG_SPEAKER=\"{d.get(\"speaker_id\", \"0\")}\"')
    print(f'VOLUME=\"{d.get(\"voice_volume\", \"100\")}\"')
except Exception:
    print('ASSISTANT_NAME=\"Leo\"')
    print(f'VOICE=\"{os.path.join(script_dir, \"voices/LibriVox/libri.onnx\")}\"')
    print('CONFIG_SPEAKER=\"0\"')
    print('VOLUME=\"100\"')
")

# Use argument speaker ID if provided, otherwise use config
if [ -n "$ARG_SPEAKER_ID" ]; then
    SPEAKER_ID="$ARG_SPEAKER_ID"
else
    SPEAKER_ID="$CONFIG_SPEAKER"
fi

# Calculate volume factor
VOL_FACTOR=$(awk "BEGIN {print $VOLUME/100}")

# Check if model is multi-speaker
IS_MULTI_SPEAKER=false
if [ -f "${VOICE}.json" ]; then
    if grep -q "speaker_id_map" "${VOICE}.json"; then
        IS_MULTI_SPEAKER=true
    fi
fi

TEXT="${TEXT//\{ASSISTANT_NAME\}/$ASSISTANT_NAME}"

if [ "$IS_MULTI_SPEAKER" = true ]; then
    echo "$TEXT" | "$PIPER_DIR/piper" --model "$VOICE" --speaker "$SPEAKER_ID" --output_file - | \
    ffmpeg -f wav -i pipe:0 -filter:a "volume=$VOL_FACTOR" -f wav pipe:1 -loglevel quiet | \
    aplay -q
else
    echo "$TEXT" | "$PIPER_DIR/piper" --model "$VOICE" --output_file - | \
    ffmpeg -f wav -i pipe:0 -filter:a "volume=$VOL_FACTOR" -f wav pipe:1 -loglevel quiet | \
    aplay -q
fi

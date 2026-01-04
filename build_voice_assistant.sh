#!/bin/bash
set -e

echo "Building Voice Assistant Executables..."

PYTHON_BIN="voiceassistant/.venv/bin/python"

# Install PyInstaller if not present
$PYTHON_BIN -m pip install pyinstaller

# Clean up heavy GPU dependencies
echo "Cleaning up GPU dependencies..."
$PYTHON_BIN -m pip uninstall -y torch torchvision torchaudio openai-whisper
$PYTHON_BIN -m pip freeze | grep nvidia | xargs -r $PYTHON_BIN -m pip uninstall -y

# Install CPU-only Torch to reduce size
echo "Installing CPU-only Torch..."
$PYTHON_BIN -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# Install Whisper if not present
$PYTHON_BIN -m pip install openai-whisper

# Download Whisper Model
echo "Downloading Whisper Base Model..."
$PYTHON_BIN -c "import whisper; whisper.load_model('base')"

# Build voice-command
echo "Compiling voice-command.py..."
$PYTHON_BIN -m PyInstaller --clean --onefile --name voice-assistant \
    --collect-all vosk \
    --collect-all openai-whisper \
    --add-data "voiceassistant/.venv/lib/python3.12/site-packages/whisper/assets:whisper/assets" \
    --hidden-import=whisper \
    voiceassistant/voice-command.py

# Build calendar-agent
echo "Compiling calendar-agent.py..."
$PYTHON_BIN -m PyInstaller --clean --onefile --name calendar-agent \
    voiceassistant/calendar-agent.py

# Build startup-briefing
echo "Compiling startup-briefing.py..."
$PYTHON_BIN -m PyInstaller --clean --onefile --name startup-briefing \
    voiceassistant/startup-briefing.py

# Prepare dist folder
echo "Preparing distribution folder..."
rm -rf voiceassistant/dist
mkdir -p voiceassistant/dist

mv dist/voice-assistant voiceassistant/dist/
mv dist/calendar-agent voiceassistant/dist/
mv dist/startup-briefing voiceassistant/dist/

# Update commands.json to use executables
echo "Updating commands.json..."
sed -i 's|{base_dir}/.venv/bin/python {base_dir}/calendar-agent.py|{base_dir}/calendar-agent|g' voiceassistant/commands.json
sed -i 's|{base_dir}/startup-briefing.sh|{base_dir}/startup-briefing|g' voiceassistant/commands.json

# Copy resources
echo "Copying resources..."
cp -r voiceassistant/vosk-model voiceassistant/dist/
cp -r voiceassistant/sounds voiceassistant/dist/
cp -r voiceassistant/piper voiceassistant/dist/

# Copy Whisper Model
echo "Copying Whisper Model..."
mkdir -p voiceassistant/dist/whisper-models
# Find the base.pt file in the cache (it might have a hash in the name or be just base.pt depending on version)
# Usually it is in ~/.cache/whisper/
find ~/.cache/whisper -name "*.pt" -exec cp {} voiceassistant/dist/whisper-models/ \;

cp voiceassistant/galactica_settings.json voiceassistant/dist/
cp voiceassistant/commands.json voiceassistant/dist/
cp -r voiceassistant/voices voiceassistant/dist/
cp -r voiceassistant/personalities voiceassistant/dist/
cp -r voiceassistant/presets voiceassistant/dist/
cp voiceassistant/*.sh voiceassistant/dist/

# Cleanup
echo "Cleaning up..."
rm -rf build dist voice-assistant.spec calendar-agent.spec startup-briefing.spec

echo "Build Complete!"

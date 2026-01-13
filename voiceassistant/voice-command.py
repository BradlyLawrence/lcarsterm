#!/usr/bin/env python3
import os
import sys
import json
import pyaudio
import subprocess
import time
import random
import pygame
import shutil
from vosk import Model, KaldiRecognizer

def ensure_ffmpeg_in_path():
    if shutil.which("ffmpeg"):
        print(f"ffmpeg found at: {shutil.which('ffmpeg')}")
        return

    print("ffmpeg not found in PATH. Searching common locations...")
    common_paths = [
        "/usr/bin",
        "/usr/local/bin",
        "/bin",
        "/snap/bin",
        os.path.expanduser("~/.local/bin")
    ]
    
    for path in common_paths:
        ffmpeg_path = os.path.join(path, "ffmpeg")
        if os.path.exists(ffmpeg_path) and os.access(ffmpeg_path, os.X_OK):
            print(f"Found ffmpeg at {ffmpeg_path}. Adding to PATH.")
            os.environ["PATH"] += os.pathsep + path
            return
            
    print("CRITICAL: ffmpeg not found! Transcription will fail.")

ensure_ffmpeg_in_path()

# --- CONFIG ---
if getattr(sys, 'frozen', False):
    SCRIPT_DIR = os.path.dirname(sys.executable)
else:
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

BASE_DIR = SCRIPT_DIR  # Alias for backward compatibility
USER_DIR = os.environ.get("LCARS_WORKSPACE", SCRIPT_DIR)

COMMANDS_PATH = os.path.join(USER_DIR, "commands.json")

# Use environment variable for settings path if available (set by main.js)
SETTINGS_PATH = os.environ.get("LCARS_SETTINGS_PATH", os.path.join(USER_DIR, "galactica_settings.json"))

MODEL_PATH = os.path.join(SCRIPT_DIR, "vosk-model/model")
SOUNDS_DIR = os.path.join(SCRIPT_DIR, "sounds")
RESPONSES = ["On it!", "You got it.", "Executing command.", "Yes, Captain.", "Affirmative."]

def load_json(path):
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading JSON from {path}: {e}")
        return {}

def speak(text):
    # Reload settings to get volume
    current_settings = load_json(SETTINGS_PATH)
    volume = current_settings.get("voice_volume", 100)
    vol_factor = float(volume) / 100.0

    voice_path = SETTINGS.get("voice_path", "")
    if not voice_path:
        # Fallback
        voice_path = os.path.join(USER_DIR, "voices/LibriVox/libri.onnx")
    
    # Handle relative paths
    if not os.path.isabs(voice_path):
        voice_path = os.path.join(USER_DIR, voice_path)
        
    piper_bin = os.path.join(SCRIPT_DIR, "piper/piper")
    
    # Check if piper exists
    if not os.path.exists(piper_bin):
        print(f"Error: Piper binary not found at {piper_bin}")
        return

    # Check for speaker ID
    speaker_id = SETTINGS.get("speaker_id", "0")
    piper_cmd = [piper_bin, "--model", voice_path, "--output_file", "-"]
    
    # Check if model supports speakers
    voice_config = voice_path + ".json"
    if os.path.exists(voice_config):
        try:
            with open(voice_config, 'r') as f:
                v_conf = json.load(f)
                if "speaker_id_map" in v_conf:
                    piper_cmd.extend(["--speaker", str(speaker_id)])
        except:
            pass

    try:
        # Echo text
        p1 = subprocess.Popen(["echo", text], stdout=subprocess.PIPE)
        
        # Piper
        p2 = subprocess.Popen(
            piper_cmd,
            stdin=p1.stdout,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL
        )
        p1.stdout.close()
        
        # FFmpeg Volume Adjustment
        p3 = subprocess.Popen(
            ["ffmpeg", "-f", "wav", "-i", "pipe:0", "-filter:a", f"volume={vol_factor}", "-f", "wav", "pipe:1", "-loglevel", "quiet"],
            stdin=p2.stdout,
            stdout=subprocess.PIPE
        )
        p2.stdout.close()

        # Aplay
        subprocess.run(["aplay", "-q"], stdin=p3.stdout)
        p3.stdout.close()
        
    except Exception as e:
        print(f"Error speaking: {e}")

# --- INITIALIZATION ---
print(f"DEBUG: SETTINGS_PATH = {SETTINGS_PATH}")
COMMANDS = load_json(COMMANDS_PATH)

# --- MIGRATION: Fix old python paths in commands.json ---
needs_save = False
for key, cmd in COMMANDS.items():
    if "{base_dir}/.venv/bin/python {base_dir}/calendar-agent.py" in cmd:
        COMMANDS[key] = cmd.replace("{base_dir}/.venv/bin/python {base_dir}/calendar-agent.py", "{base_dir}/calendar-agent")
        needs_save = True
    elif "{base_dir}/startup-briefing.sh" in cmd:
        COMMANDS[key] = cmd.replace("{base_dir}/startup-briefing.sh", "{base_dir}/startup-briefing")
        needs_save = True

if needs_save:
    try:
        with open(COMMANDS_PATH, 'w') as f:
            json.dump(COMMANDS, f, indent=4)
        print(f"Migrated commands.json at {COMMANDS_PATH} to use new executables.")
    except Exception as e:
        print(f"Error saving migrated commands: {e}")

SETTINGS = load_json(SETTINGS_PATH)
print(f"DEBUG: Loaded Settings: {SETTINGS.keys()}")
sys.stderr = open(os.devnull, "w")

# --- SOUND EFFECT SETUP ---
pygame.mixer.init()

ACK_FILES = ["acknowledged1.mp3", "acknowledged2.mp3", "acknowledged3.mp3"]
PAUSE_FILE = "pause.mp3"
RESUME_FILE = "unpause.mp3"

ACK_PATHS = []
for f in ACK_FILES:
    full_path = os.path.join(SOUNDS_DIR, f)
    if os.path.exists(full_path):
        ACK_PATHS.append(full_path)

PAUSE_PATH = os.path.join(SOUNDS_DIR, PAUSE_FILE)
RESUME_PATH = os.path.join(SOUNDS_DIR, RESUME_FILE)

def play_sfx(path_or_list):
    target = None
    if isinstance(path_or_list, list) and path_or_list:
        target = random.choice(path_or_list)
    elif isinstance(path_or_list, str) and os.path.exists(path_or_list):
        target = path_or_list
    
    if target:
        try:
            sfx = pygame.mixer.Sound(target)
            sfx.set_volume(0.6)
            sfx.play()
        except Exception as e:
            print(f"SFX Error: {e}")

# --- VOSK SETUP ---
if not os.path.exists(MODEL_PATH):
    print("Model not found!")
    sys.exit(1)

model = Model(MODEL_PATH)
rec = KaldiRecognizer(model, 16000)
rec.SetMaxAlternatives(0)
rec.SetWords(True)

p = pyaudio.PyAudio()

# --- DEVICE SELECTION ---
input_device_index = SETTINGS.get("input_device_index", None)
device_name = "Default"

if input_device_index is not None:
    try:
        info = p.get_device_info_by_index(input_device_index)
        device_name = info['name']
    except:
        input_device_index = None

try:
    stream = p.open(format=pyaudio.paInt16, 
                    channels=1, 
                    rate=16000, 
                    input=True, 
                    input_device_index=input_device_index,
                    frames_per_buffer=8000)
except Exception as e:
    print(f"Fallback to default: {e}")
    stream = p.open(format=pyaudio.paInt16, channels=1, rate=16000, input=True, frames_per_buffer=8000)

print(f"Systems Online. Listening on: {device_name}")

# Wait for startup briefing to finish
lock_file = "/tmp/lcars_briefing.lock"
wait_count = 0
while os.path.exists(lock_file) and wait_count < 60: # Wait max 60 seconds
    time.sleep(1)
    wait_count += 1

print("<<VOICE_ACTIVE>>")
speak("Voice interface initialised")

def acknowledge():
    # RELOAD SETTINGS dynamically in case you changed them without restarting
    # (Optional safety measure)
    current_settings = load_json(SETTINGS_PATH)
    if current_settings.get("voice_ack_enabled", True):
        rank = current_settings.get("user_rank") or "Captain"
        name = current_settings.get("user_name") or "Bradly"
        surname = current_settings.get("user_surname") or "User"
        assistant_name = current_settings.get("assistant_name") or "Leo"
        
        # Load Personality
        p_file = current_settings.get("personality_file")
        print(f"DEBUG: USER_DIR: {USER_DIR}")
        print(f"DEBUG: Original p_file from settings: {p_file}")
        
        responses = ["On it!", "You got it.", "Executing command.", f"Yes, {rank}.", "Affirmative."]
        
        if p_file:
            # Handle relative paths (relative to USER_DIR)
            if not os.path.isabs(p_file):
                p_file = os.path.join(USER_DIR, p_file)
            
            print(f"DEBUG: Resolved p_file: {p_file}")

        print(f"DEBUG: Final p_file to load: {p_file}")
        if p_file and os.path.exists(p_file):
            p_data = load_json(p_file)
            print(f"DEBUG: Loaded personality data keys: {list(p_data.keys())}")
            if "acknowledgements" in p_data and p_data["acknowledgements"]:
                responses = p_data["acknowledgements"]
                print(f"DEBUG: Loaded {len(responses)} acknowledgements.")
        else:
            print("DEBUG: Failed to load personality file.")
            if "acknowledgements" in p_data and p_data["acknowledgements"]:
                responses = p_data["acknowledgements"]

        chosen = random.choice(responses)
        
        # Replace placeholders
        chosen = chosen.replace("{USER_RANK}", rank)\
                       .replace("{USER_NAME}", name)\
                       .replace("{USER_SURNAME}", surname)\
                       .replace("{ASSISTANT_NAME}", assistant_name)
                       
        speak(chosen)
    else:
        play_sfx(ACK_PATHS)

# --- MAIN LOOP ---
is_logging = False
is_paused = False
paused_players = []
log_text_file = None
last_trigger_time = 0

while True:
    try:
        data = stream.read(4000, exception_on_overflow=False)
    except:
        continue
        
    if len(data) == 0: break

    if rec.AcceptWaveform(data):
        result = json.loads(rec.Result())
        text = result.get("text", "").lower()

        if not text: continue
        
        # --- GLOBAL DEBOUNCE CHECK ---
        # If we just triggered a command less than 1.5 seconds ago, ignore everything.
        if time.time() - last_trigger_time < 1.5:
            continue

        print(f"I HEARD: '{text}'")

        # --- BRANCH 1: CAPTAIN'S LOG ---
        if is_logging:
            clean_text = text
            if "terminate" in clean_text and "log" in clean_text:
                last_trigger_time = time.time() # LOCK THE DOOR
                
                is_logging = False
                is_paused = False
                
                subprocess.run([os.path.join(BASE_DIR, "captains-log.sh"), "stop"])
                speak("Log terminated. Processing audio.")
                
                try:
                    with open("/tmp/current_log_path", "r") as f:
                        wav_path = f.read().strip()
                        final_txt_path = wav_path.replace(".wav", ".txt")
                    
                    if not shutil.which("ffmpeg"):
                        speak("Transcription failed. FFmpeg is not installed.")
                        print("ERROR: ffmpeg binary not found. Please install ffmpeg.")
                        continue

                    if not os.path.exists(wav_path):
                        speak("Log recording failed. Audio file not found.")
                        print(f"ERROR: Audio file not found at {wav_path}")
                        continue

                    import whisper
                    # Check for bundled model first
                    bundled_model_path = os.path.join(BASE_DIR, "whisper-models", "base.pt")
                    user_model_path = os.path.join(USER_DIR, "whisper-models", "base.pt")
                    
                    if os.path.exists(bundled_model_path):
                        print(f"Loading bundled Whisper model: {bundled_model_path}")
                        model_whisper = whisper.load_model(bundled_model_path)
                    elif os.path.exists(user_model_path):
                        print(f"Loading local Whisper model: {user_model_path}")
                        model_whisper = whisper.load_model(user_model_path)
                    else:
                        print("Local model not found, using default (may download)")
                        model_whisper = whisper.load_model("base")
                        
                    result = model_whisper.transcribe(wav_path)
                    with open(final_txt_path, "w") as f:
                        f.write(result["text"].strip())
                    speak("Transcription complete.")
                except Exception as e:
                    speak("Error during transcription.")
                    print(f"TRANSCRIPTION ERROR: {e}")
                    import traceback
                    traceback.print_exc()
                continue

            elif "resume" in clean_text and "log" in clean_text:
                last_trigger_time = time.time() # LOCK THE DOOR
                is_paused = False
                play_sfx(RESUME_PATH)
                subprocess.run([os.path.join(BASE_DIR, "captains-log.sh"), "resume"])
                speak("Resuming log.") 
                continue

            elif "pause" in clean_text and "log" in clean_text:
                last_trigger_time = time.time() # LOCK THE DOOR
                is_paused = True
                play_sfx(PAUSE_PATH)
                subprocess.run([os.path.join(BASE_DIR, "captains-log.sh"), "pause"])
                speak("Log paused.")
                continue
            else:
                continue 

        # --- BRANCH 1.5: MUSIC CONTROL ---
        # Load settings for dynamic name (needed for name detection)
        # We assume local load checks are fast enough
        m_settings = load_json(SETTINGS_PATH)
        m_name = (m_settings.get("assistant_name") or "Leo").lower()
        m_alts = [x.lower() for x in m_settings.get("phonetic_alternatives", [])]
        m_valid_names = [m_name] + m_alts
        
        # Check if ANY valid name is in the text
        if any(name in text for name in m_valid_names):
            clean_text = text
            
            # PAUSE
            if "pause" in clean_text and ("music" in clean_text or "audio" in clean_text or "media" in clean_text or "playback" in clean_text):
                last_trigger_time = time.time()
                acknowledge()
                
                try:
                    if shutil.which("playerctl"):
                        players_output = subprocess.check_output(["playerctl", "-l"], text=True).strip().split('\n')
                        currently_playing = []
                        for p in players_output:
                            if not p: continue
                            try:
                                status = subprocess.check_output(["playerctl", "-p", p, "status"], text=True).strip()
                                if status == "Playing":
                                    currently_playing.append(p)
                                    subprocess.run(["playerctl", "-p", p, "pause"])
                            except: pass
                        
                        if currently_playing:
                            paused_players = currently_playing
                            print(f"Paused specific players: {paused_players}")
                        else:
                            subprocess.run(["playerctl", "-a", "pause"])
                except Exception as e:
                    print(f"Playerctl error: {e}")
                
                continue

            # RESUME / PLAY
            if ("play" in clean_text or "resume" in clean_text) and ("music" in clean_text or "audio" in clean_text or "playback" in clean_text or "spotify" in clean_text):
                # EXCLUSIONS for specific playlist commands in commands.json
                is_specific = "focus" in clean_text or "concentration" in clean_text or "nostalgic" in clean_text or "retro" in clean_text
                
                if not is_specific:
                    last_trigger_time = time.time()
                    acknowledge()
                    
                    try:
                        if shutil.which("playerctl"):
                            # Strategy 1: Resume remembered
                            if paused_players:
                                print(f"Resuming remembered players: {paused_players}")
                                for p in paused_players:
                                    subprocess.run(["playerctl", "-p", p, "play"])
                                paused_players = []
                            else:
                                # Strategy 2: Preferred
                                pref = m_settings.get("preferred_music_player", "spotify").lower().replace(" ", "")
                                
                                # Check if preferred player is running
                                current_players = subprocess.check_output(["playerctl", "-l"], text=True).lower().split('\n')
                                
                                if any(pref in p for p in current_players if p):
                                    print(f"Playing preferred (already running): {pref}")
                                    subprocess.run(["playerctl", "-p", pref, "play"])
                                else:
                                    print(f"Preferred player {pref} not running. Attempting to launch...")
                                    speak(f"Launching {pref}. Stand by.")
                                    # Try to launch it
                                    try:
                                        subprocess.Popen([pref], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                                        time.sleep(5) # Wait for startup
                                        print(f"Sending play command to {pref}")
                                        subprocess.run(["playerctl", "-p", pref, "play"])
                                    except Exception as launch_err:
                                        print(f"Failed to launch {pref}: {launch_err}")
                                        speak(f"Unable to launch {pref}.")
                    except Exception as e:
                        print(f"Playerctl error: {e}")
                    
                    continue

            # SKIP
            if ("next" in clean_text or "skip" in clean_text) and ("track" in clean_text or "song" in clean_text or "music" in clean_text):
                last_trigger_time = time.time()
                acknowledge()
                
                try:
                    if shutil.which("playerctl"):
                        players_output = subprocess.check_output(["playerctl", "-l"], text=True).strip().split('\n')
                        playing_now = []
                        for p in players_output:
                            if not p: continue
                            try:
                                status = subprocess.check_output(["playerctl", "-p", p, "status"], text=True).strip()
                                if status == "Playing":
                                    playing_now.append(p)
                            except: pass
                            
                        if playing_now:
                            for p in playing_now:
                                subprocess.run(["playerctl", "-p", p, "next"])
                        else:
                             pref = m_settings.get("preferred_music_player", "spotify").lower().replace(" ", "")
                             subprocess.run(["playerctl", "-p", pref, "next"])
                except Exception as e:
                    print(f"Playerctl error: {e}")
                
                continue

        # --- BRANCH 2: COMMANDS ---
        # Load settings for dynamic name
        current_settings = load_json(SETTINGS_PATH)
        assistant_name = (current_settings.get("assistant_name") or "Leo").lower()
        phonetic_alternatives = [x.lower() for x in current_settings.get("phonetic_alternatives", [])]
        
        # Create a list of all valid names to check
        valid_names = [assistant_name] + phonetic_alternatives

        # Check if ANY valid name is in the text for special commands
        name_detected = any(name in text for name in valid_names)

        if name_detected and "captain's log" in text:
            last_trigger_time = time.time() # LOCK THE DOOR
            is_logging = True
            is_paused = False
            play_sfx(RESUME_PATH)
            speak("Captain's log initiated.")
            
            # Get log directory from settings
            logs_dir = current_settings.get("logs_dir", "~/Documents/CaptainsLogs")
            logs_dir = os.path.expanduser(logs_dir)
            
            # Ensure directory exists
            if not os.path.exists(logs_dir):
                try:
                    os.makedirs(logs_dir)
                except Exception as e:
                    print(f"Error creating log directory: {e}")
                    speak("Error creating log directory.")
                    is_logging = False
                    continue
            
            subprocess.run([os.path.join(BASE_DIR, "captains-log.sh"), "start", logs_dir])
            continue

        if name_detected and "stop listening" in text:
            last_trigger_time = time.time()
            play_sfx(PAUSE_PATH)
            speak("Shutting down. Goodbye.")
            time.sleep(3) 
            sys.exit(0)

        for phrase, command in COMMANDS.items():
            # Check against ALL valid names
            matched = False
            for name in valid_names:
                check_phrase = phrase.replace("{assistant_name}", name)
                if check_phrase in text:
                    matched = True
                    break
            
            if matched:
                # We already checked time at the top, but let's be safe
                print(f"Executing: {phrase}")
                
                # IMPORTANT: Update time BEFORE executing actions
                last_trigger_time = time.time() 
                
                acknowledge()

                rank = current_settings.get("user_rank") or "Captain"
                name = current_settings.get("user_name") or "Bradly"
                surname = current_settings.get("user_surname") or "User"

                final_command = command.replace("{rank}", rank)\
                                       .replace("{name}", name)\
                                       .replace("{surname}", surname)\
                                       .replace("{assistant_name}", assistant_name)\
                                       .replace("{base_dir}", f'"{BASE_DIR}"')

                os.system(final_command)
                break
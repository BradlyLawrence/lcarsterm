#!/usr/bin/env python3
import os
import sys
import json
import pyaudio
import subprocess
import time
import random
import pygame
from vosk import Model, KaldiRecognizer

# --- CONFIG ---
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
    subprocess.run([os.path.join(SCRIPT_DIR, "ai-speak.sh"), text])

# --- INITIALIZATION ---
print(f"DEBUG: SETTINGS_PATH = {SETTINGS_PATH}")
COMMANDS = load_json(COMMANDS_PATH)
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
                    import whisper
                    model_whisper = whisper.load_model("base") 
                    result = model_whisper.transcribe(wav_path)
                    with open(final_txt_path, "w") as f:
                        f.write(result["text"].strip())
                    speak("Transcription complete.")
                except Exception as e:
                    speak("Error during transcription.")
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
            subprocess.run([os.path.join(BASE_DIR, "captains-log.sh"), "start"])
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
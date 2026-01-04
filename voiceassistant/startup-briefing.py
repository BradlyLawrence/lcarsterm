import os
import sys
import json
import datetime
import random
import shutil
import subprocess
import requests

# --- CONFIG ---
if getattr(sys, 'frozen', False):
    SCRIPT_DIR = os.path.dirname(sys.executable)
else:
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

SETTINGS_PATH = os.environ.get("LCARS_SETTINGS_PATH", os.path.join(SCRIPT_DIR, "galactica_settings.json"))
USER_DIR = os.environ.get("LCARS_WORKSPACE", SCRIPT_DIR)

def load_json(path):
    try:
        with open(path, "r") as f:
            return json.load(f)
    except:
        return {}

SETTINGS = load_json(SETTINGS_PATH)

def speak(text):
    print(f"Speaking: {text}")
    
    voice_path = SETTINGS.get("voice_path", "")
    if not voice_path:
        voice_path = os.path.join(USER_DIR, "voices/LibriVox/libri.onnx")
    
    if not os.path.isabs(voice_path):
        voice_path = os.path.join(USER_DIR, voice_path)
        
    piper_bin = os.path.join(SCRIPT_DIR, "piper/piper")
    
    if not os.path.exists(piper_bin):
        print(f"Piper not found at {piper_bin}")
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
        p1 = subprocess.Popen(["echo", text], stdout=subprocess.PIPE)
        p2 = subprocess.Popen(
            piper_cmd,
            stdin=p1.stdout,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL
        )
        p1.stdout.close()
        subprocess.run(["aplay", "-q"], stdin=p2.stdout)
        p2.stdout.close()
    except Exception as e:
        print(f"Error speaking: {e}")

def main():
    user_rank = SETTINGS.get("user_rank", "Captain")
    user_name = SETTINGS.get("user_name", "Bradly")
    user_surname = SETTINGS.get("user_surname", "User")
    assistant_name = SETTINGS.get("assistant_name", "Leo")
    weather_location = SETTINGS.get("weather_location", "Cape Town")
    
    # Time of day
    hour = datetime.datetime.now().hour
    if hour < 12:
        greeting = "Good morning"
    elif hour < 18:
        greeting = "Good afternoon"
    else:
        greeting = "Good evening"
        
    date_str = datetime.datetime.now().strftime("%A, %B %d")
    
    # Disk usage
    total, used, free = shutil.disk_usage("/")
    disk_percent = (used / total) * 100
    disk_usage = f"{int(disk_percent)}%"
    
    # Weather
    weather = ""
    try:
        r = requests.get(f"https://wttr.in/{weather_location}?format=%C+and+%t", timeout=2)
        if r.status_code == 200:
            weather = r.text.strip()
    except:
        pass
        
    # Personality Quote
    p_file = SETTINGS.get("personality_file", "")
    if p_file and not os.path.isabs(p_file):
        p_file = os.path.join(USER_DIR, p_file)
    
    if not p_file or not os.path.exists(p_file):
        p_file = os.path.join(USER_DIR, "personalities/leo.json")
        
    p_data = load_json(p_file)
    quotes = p_data.get("startup_quotes", ["System ready."])
    if not quotes: quotes = ["System ready."]
    
    chosen_quote = random.choice(quotes)
    chosen_quote = chosen_quote.replace("{USER_NAME}", user_name)
    chosen_quote = chosen_quote.replace("{USER_RANK}", user_rank)
    chosen_quote = chosen_quote.replace("{USER_SURNAME}", user_surname)
    chosen_quote = chosen_quote.replace("{ASSISTANT_NAME}", assistant_name)
    
    # Create lock file
    lock_file = "/tmp/lcars_briefing.lock"
    try:
        with open(lock_file, "w") as f:
            f.write(str(os.getpid()))
    except:
        pass

    try:
        full_text = f"{greeting}, {user_rank}. Today is {date_str}."
        if weather:
            full_text += f" The current weather is {weather}."
        
        full_text += f" System disk usage is at {disk_usage}."
        full_text += f" {chosen_quote}"
        
        speak(full_text)
    finally:
        if os.path.exists(lock_file):
            try:
                os.remove(lock_file)
            except:
                pass

if __name__ == "__main__":
    main()

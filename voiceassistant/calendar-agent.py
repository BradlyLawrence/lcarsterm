#!/usr/bin/env python3
import sys
import os
import datetime
import json
import requests
import subprocess
import time
import sqlite3
from dateutil.relativedelta import relativedelta # Optional but recommended, using standard math if not present
from icalendar import Calendar
import recurring_ical_events

# --- CONFIG ---
if getattr(sys, 'frozen', False):
    SCRIPT_DIR = os.path.dirname(sys.executable)
else:
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

SETTINGS_PATH = os.environ.get("LCARS_SETTINGS_PATH", os.path.expanduser("~/.leo/galactica_settings.json"))
CALENDAR_FILE = os.path.expanduser("~/Documents/calendar.ics")
# SPEAK_SCRIPT = os.path.join(SCRIPT_DIR, "ai-speak.sh")

def load_settings():
    try:
        with open(SETTINGS_PATH, 'r') as f:
            return json.load(f)
    except:
        return {}

SETTINGS = load_settings()
USER_DIR = os.environ.get("LCARS_WORKSPACE", SCRIPT_DIR)

# --- LOGGING ---
LOG_FILE = os.path.join(USER_DIR, "calendar-debug.log")
def log(msg):
    try:
        with open(LOG_FILE, "a") as f:
            f.write(f"[{datetime.datetime.now()}] {msg}\n")
    except:
        pass

log(f"Starting calendar-agent. USER_DIR={USER_DIR}, SETTINGS_PATH={SETTINGS_PATH}")

def speak(text):
    """Output to stdout and trigger voice script."""
    print(f"Speaking: {text}")
    
    voice_path = SETTINGS.get("voice_path", "")
    if not voice_path:
        voice_path = os.path.join(USER_DIR, "voices/LibriVox/libri.onnx")
    
    if not os.path.isabs(voice_path):
        voice_path = os.path.join(USER_DIR, voice_path)
        
    piper_bin = os.path.join(SCRIPT_DIR, "piper/piper")
    
    if not os.path.exists(piper_bin):
        return

    try:
        p1 = subprocess.Popen(["echo", text], stdout=subprocess.PIPE)
        p2 = subprocess.Popen(
            [piper_bin, "--model", voice_path, "--output_file", "-"],
            stdin=p1.stdout,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL
        )
        p1.stdout.close()
        subprocess.run(["aplay", "-q"], stdin=p2.stdout)
        p2.stdout.close()
    except:
        pass

def load_settings():
    try:
        with open(SETTINGS_PATH, 'r') as f:
            return json.load(f)
    except:
        return {}

def fetch_calendar():
    """ Downloads the latest ICS file with cache-busting or copies local file """
    log("fetch_calendar: start")
    settings = load_settings()
    url = settings.get("calendar_url", "")
    log(f"fetch_calendar: url={url}")
    
    if not url:
        return False
    
    # --- Local System Calendar Auto-Detection (Evolution/Gnome) ---
    if url.lower() == "local":
        base_paths = [
            os.path.expanduser("~/.local/share/evolution/calendar"),
            os.path.expanduser("~/.cache/evolution/calendar"),
            os.path.expanduser("~/.var/app/org.gnome.Calendar/data/evolution/calendar"),
            os.path.expanduser("~/.var/app/org.gnome.Calendar/cache/evolution/calendar")
        ]
        
        found_calendars = []
        found_dbs = []
        
        for base in base_paths:
            log(f"Scanning base: {base}")
            if os.path.exists(base):
                for root, dirs, files in os.walk(base):
                    if "/trash" in root: continue
                    for file in files:
                        if file.endswith(".ics"):
                            found_calendars.append(os.path.join(root, file))
                        elif file == "cache.db":
                            found_dbs.append(os.path.join(root, file))
        
        log(f"Found calendars: {len(found_calendars)} ICS, {len(found_dbs)} DBs")
        if not found_calendars and not found_dbs:
            log("No local calendars found")
            return False

        try:
            master_cal = Calendar()
            master_cal.add('prodid', '-//Galactica Voice//mxm.dk//')
            master_cal.add('version', '2.0')
            events_found = 0
            
            # 1. Process ICS Files
            for path in found_calendars:
                try:
                    with open(path, 'rb') as f:
                        content = f.read()
                        if b"BEGIN:VCALENDAR" in content:
                            part_cal = Calendar.from_ical(content)
                            for component in part_cal.walk():
                                if component.name == "VEVENT":
                                    master_cal.add_component(component)
                                    events_found += 1
                except Exception as e:
                    log(f"Error reading ICS {path}: {e}")
                    continue

            # 2. Process Evolution SQLite DBs
            for db_path in found_dbs:
                try:
                    conn = sqlite3.connect(db_path)
                    cursor = conn.cursor()
                    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ECacheObjects';")
                    if not cursor.fetchone():
                        conn.close(); continue

                    cursor.execute("SELECT ECacheOBJ FROM ECacheObjects")
                    rows = cursor.fetchall()
                    for row in rows:
                        if row[0]:
                            try:
                                ical_str = f"BEGIN:VCALENDAR\n{row[0]}\nEND:VCALENDAR"
                                part_cal = Calendar.from_ical(ical_str)
                                for component in part_cal.walk():
                                    if component.name == "VEVENT":
                                        master_cal.add_component(component)
                                        events_found += 1
                            except: pass
                    conn.close()
                except Exception as e:
                    log(f"Error reading DB {db_path}: {e}")
                    continue

            if events_found > 0:
                with open(CALENDAR_FILE, 'wb') as f:
                    f.write(master_cal.to_ical())
                log(f"Successfully merged {events_found} events to {CALENDAR_FILE}")
                return True
            
            log("No events found in local sources")
            return False

        except Exception as e:
            log(f"Merge error: {e}")
            return False

    # --- Direct File Path ---
    if url.startswith("/") or url.startswith("file://"):
        path = url.replace("file://", "")
        if os.path.exists(path):
            with open(path, 'rb') as src, open(CALENDAR_FILE, 'wb') as dst:
                dst.write(src.read())
            return True
        log(f"File not found: {path}")
        return False

    # --- HTTP Download ---
    timestamp = int(time.time())
    final_url = f"{url}&t={timestamp}" if "?" in url else f"{url}?t={timestamp}"

    try:
        response = requests.get(final_url, timeout=15)
        response.raise_for_status()
        with open(CALENDAR_FILE, 'wb') as f:
            f.write(response.content)
        log("Downloaded remote calendar successfully")
        return True
    except Exception as e:
        log(f"Download error: {e}")
        return False

# --- CORE LOGIC ---

def get_calendar_object():
    """Loads and returns the parsed calendar object."""
    fetch_calendar() # Always try to sync first
    
    if not os.path.exists(CALENDAR_FILE):
        speak("I cannot find the calendar file.")
        sys.exit(1)

    try:
        with open(CALENDAR_FILE, 'rb') as f:
            return Calendar.from_ical(f.read())
    except:
        speak("The calendar file is corrupted.")
        sys.exit(1)

def format_event_time(dt_start):
    """Converts datetime to readable 12h string."""
    return dt_start.strftime("%I:%M %p").lstrip("0")

def get_events_range(calendar, start, end):
    """Wrapper for recurring_ical_events."""
    try:
        events = recurring_ical_events.of(calendar).between(start, end)
        events.sort(key=lambda x: x.get('DTSTART').dt)
        return events
    except:
        return []

# --- MODES ---

def mode_daily(target_date, label="Today"):
    cal = get_calendar_object()
    now = datetime.datetime.now().astimezone()
    
    # Define range for that specific day
    start_range = datetime.datetime.combine(target_date, datetime.time.min).replace(tzinfo=now.tzinfo)
    end_range = datetime.datetime.combine(target_date, datetime.time.max).replace(tzinfo=now.tzinfo)
    
    # Adjust for "Today" if we are already halfway through it
    if label == "Today":
        start_range = now

    events = get_events_range(cal, start_range, end_range)
    
    if not events:
        speak(f"You have no events scheduled for {label}.")
        return

    count = len(events)
    report = f"You have {count} event{'s' if count > 1 else ''} scheduled for {label}. "
    
    for i, event in enumerate(events):
        summary = event.get('SUMMARY')
        start = event.get('DTSTART').dt
        
        if count > 1 and i == count - 1:
            report += "and "

        if not isinstance(start, datetime.datetime):
            report += f"All day: {summary}. "
        else:
            start = start.astimezone()
            time_str = format_event_time(start)
            report += f"At {time_str}, {summary}. "

    speak(report)

def mode_week():
    cal = get_calendar_object()
    now = datetime.datetime.now().astimezone()
    end_range = now + datetime.timedelta(days=7)
    
    events = get_events_range(cal, now, end_range)
    
    if not events:
        speak("Your schedule looks completely free for the next 7 days.")
        return

    # Group by day
    days_summary = {}
    for event in events:
        start = event.get('DTSTART').dt
        if isinstance(start, datetime.datetime):
            start = start.astimezone()
            day_key = start.strftime("%A") # e.g., "Monday"
        else:
            # All day event, map to current day check? 
            # Simplified: Use the date object
            day_key = start.strftime("%A")
            
        days_summary[day_key] = days_summary.get(day_key, 0) + 1

    report = "Here is your week. "
    for day, count in days_summary.items():
        report += f"{day} has {count} event{'s' if count > 1 else ''}. "
    
    report += "Would you like details on a specific day?"
    speak(report)

def mode_next():
    cal = get_calendar_object()
    now = datetime.datetime.now().astimezone()
    end_range = now + datetime.timedelta(days=30) # Look ahead 1 month
    
    events = get_events_range(cal, now, end_range)
    
    # Filter out all-day events that started previously (they show up as start 00:00)
    # We want the next *timed* event usually, or the next starting all-day event
    valid_events = []
    for e in events:
        start = e.get('DTSTART').dt
        if isinstance(start, datetime.datetime):
            if start > now:
                valid_events.append(e)
        else:
            # All day events for tomorrow are valid
            # Convert date to datetime for comparison
            start_dt = datetime.datetime.combine(start, datetime.time.min).replace(tzinfo=now.tzinfo)
            if start_dt > now:
                valid_events.append(e)

    if not valid_events:
        speak("You have no upcoming events in the next 30 days.")
        return

    next_event = valid_events[0]
    summary = next_event.get('SUMMARY')
    start = next_event.get('DTSTART').dt
    
    if isinstance(start, datetime.datetime):
        start = start.astimezone()
        delta = start - now
        
        # Human readable delta
        hours = delta.seconds // 3600
        minutes = (delta.seconds // 60) % 60
        
        time_msg = ""
        if delta.days > 0:
            time_msg = f"in {delta.days} days"
        elif hours > 0:
            time_msg = f"in {hours} hours and {minutes} minutes"
        else:
            time_msg = f"in {minutes} minutes"
            
        speak(f"Next up is {summary}, {time_msg}.")
    else:
        speak(f"Next up is an all-day event: {summary}, tomorrow.")

def mode_search(query):
    cal = get_calendar_object()
    now = datetime.datetime.now().astimezone()
    end_range = now + datetime.timedelta(days=90) # Look ahead 3 months
    
    events = get_events_range(cal, now, end_range)
    matches = []
    
    query = query.lower()
    
    for e in events:
        summary = str(e.get('SUMMARY')).lower()
        if query in summary:
            matches.append(e)
            
    if not matches:
        speak(f"I couldn't find any events matching '{query}'.")
        return

    # Limit to first 3 matches to avoid spam
    report = f"I found {len(matches)} matches. "
    for e in matches[:3]:
        summary = e.get('SUMMARY')
        start = e.get('DTSTART').dt
        if isinstance(start, datetime.datetime):
             date_str = start.strftime("%A, %B %d")
             time_str = start.strftime("%I:%M %p").lstrip("0")
             report += f"{summary} on {date_str} at {time_str}. "
        else:
             date_str = start.strftime("%A, %B %d")
             report += f"{summary} on {date_str}. "
             
    speak(report)

def mode_weekday_name(day_name):
    """Calculates the date for a specific day of the week (e.g., 'Friday')."""
    days_map = {
        "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
        "friday": 4, "saturday": 5, "sunday": 6
    }
    
    target_idx = days_map.get(day_name.lower())
    if target_idx is None:
        speak("I don't recognize that day name.")
        return

    today = datetime.date.today()
    current_idx = today.weekday()
    
    # Calculate difference
    days_ahead = target_idx - current_idx
    
    # If the day has already passed this week (e.g. asking for Monday on a Tuesday),
    # assume the user means next week.
    if days_ahead < 0:
        days_ahead += 7
        
    target_date = today + datetime.timedelta(days=days_ahead)
    label = target_date.strftime("%A, %B %d")
    
    # Reuse the existing daily report function
    mode_daily(target_date, label)

# --- MAIN DISPATCH ---

if __name__ == "__main__":
    # valid days list
    weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

    if len(sys.argv) < 2:
        mode = "today"
    else:
        mode = sys.argv[1].lower()

    today = datetime.date.today()

    if mode == "today":
        mode_daily(today, "Today")
        
    elif mode == "tomorrow":
        mode_daily(today + datetime.timedelta(days=1), "Tomorrow")
        
    elif mode in weekdays:
        # --- NEW: Handle specific weekdays ---
        mode_weekday_name(mode)

    elif mode == "week":
        mode_week()
        
    elif mode == "next":
        mode_next()
        
    elif mode == "search":
        if len(sys.argv) < 3:
            speak("What should I search for?")
        else:
            query = " ".join(sys.argv[2:])
            mode_search(query)
            
    elif mode == "date":
        if len(sys.argv) < 3:
            speak("Please provide a date in YYYY-MM-DD format.")
        else:
            try:
                date_str = sys.argv[2]
                target = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
                label = target.strftime("%A, %B %d")
                mode_daily(target, label)
            except ValueError:
                speak("I didn't understand that date format.")
                
    else:
        # Fallback
        mode_daily(today, "Today")
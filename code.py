# code.py — MatrixPortal M4 scoreboard
# version: 2026.02.13.3
#
# change log (recent):
# - Added schedule-id auto-discovery + cache fallback.
# - Added watchdog + boot/reset diagnostics.
# - Added adaptive brightness + retry backoff logic.
# - Added home/away side mapping for Wellesley schedule entries.
#
# What this program does:
# 1) Draws a two-side game scoreboard on a HUB75 matrix.
# 2) Always displays Wellesley (logo side) vs opponent (3-letter code side).
# 3) Uses per-team primary/secondary colors from TEAM_STYLES.
# 4) Supports DEV cycling mode (all opponents + random scores).
# 5) Supports LIVE mode (schedule + score scrape + home/away side mapping).
#
# MatrixPortal M4 networking notes:
# - No native `wifi` / `ssl` modules (uses ESP32 coprocessor).
# - Uses ESP32SPI + WiFiManager + adafruit_connection_manager.
# - MatrixPortal helper must be created with `use_wifi=False`.

import os
import time
import json
import random
import rtc
import microcontroller

try:
    from watchdog import WatchDogMode
except ImportError:
    WatchDogMode = None

import board
import busio
import displayio
import terminalio

import adafruit_ntp
import adafruit_requests
import adafruit_connection_manager

from digitalio import DigitalInOut
from adafruit_esp32spi import adafruit_esp32spi
from adafruit_esp32spi.adafruit_esp32spi_wifimanager import WiFiManager

from adafruit_display_shapes.rect import Rect
from adafruit_display_text.label import Label

from adafruit_matrixportal.matrixportal import MatrixPortal


def _env_bool(name, default):
    v = os.getenv(name)
    if v is None:
        return default
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def _env_int(name, default):
    v = os.getenv(name)
    if v is None:
        return default
    try:
        return int(v)
    except ValueError:
        return default


def _env_float(name, default):
    v = os.getenv(name)
    if v is None:
        return default
    try:
        return float(v)
    except ValueError:
        return default


# -----------------------
# CONFIG
# -----------------------
# If set in settings.toml, this forces a specific schedule id.
# If unset, code auto-discovers the softball schedule id from the schedule webpage.
WELLESLEY_SCHEDULE_ID = os.getenv("WELLESLEY_SCHEDULE_ID")
DEFAULT_SCHEDULE_ID = "366"
WELLESLEY_SCHEDULE_PAGE_URL = "https://wellesleyblue.com/sports/softball/schedule"
WELLESLEY_SCHEDULE_TXT_BASE_URL = "https://wellesleyblue.com/services/schedule_txt.ashx?schedule="

# How often to poll Wellesley schedule feed
SCHEDULE_POLL_SECONDS = _env_int("SCHEDULE_POLL_SECONDS", 30)

# Re-sync NTP every 6 hours
NTP_RESYNC_SECONDS = _env_int("NTP_RESYNC_SECONDS", 6 * 3600)

# Re-discover schedule id periodically when running in auto-discovery mode
SCHEDULE_ID_REFRESH_SECONDS = _env_int("SCHEDULE_ID_REFRESH_SECONDS", 12 * 3600)

# Persist last known good schedule data for recovery across reboots/network issues
STATE_CACHE_FILE = "/scoreboard_state.json"
UNKNOWN_TEAMS_FILE = "/unknown_teams.txt"
EVENT_LOG_FILE = "/scoreboard_events.log"
EVENT_LOG_MAX_LINES = 120

# Wellesley colors
WELLESLEY_BLUE = 0x0033AA
WHITE = 0xFFFFFF
BLACK = 0x000000

# Power-safety tuning for matrix current draw (helps prevent USB disconnect/reconnect resets)
DISPLAY_BRIGHTNESS = 0.18
BG_COLOR_DIM_SCALE = 0.35
AUTO_BRIGHTNESS_ENABLED = _env_bool("AUTO_BRIGHTNESS_ENABLED", True)
DISPLAY_BRIGHTNESS_MIN = _env_float("DISPLAY_BRIGHTNESS_MIN", 0.10)
DISPLAY_BRIGHTNESS_MAX = _env_float("DISPLAY_BRIGHTNESS_MAX", 0.22)

# Unknown team fallback style
UNKNOWN_ABBR = "OTH"
UNKNOWN_PRIMARY = 0xFF0000
UNKNOWN_SECONDARY = 0xFFFFFF

# Runtime safety/recovery
MAX_CONSECUTIVE_ERRORS = 8
WATCHDOG_ENABLED = _env_bool("WATCHDOG_ENABLED", True)
WATCHDOG_TIMEOUT_SECONDS = _env_int("WATCHDOG_TIMEOUT_SECONDS", 20)

# NTP resilience (exponential retry backoff)
NTP_RETRY_MIN_SECONDS = 30
NTP_RETRY_MAX_SECONDS = 30 * 60

# Schedule polling resilience (exponential retry backoff)
SCHEDULE_RETRY_MAX_SECONDS = 10 * 60

# Boot/reset diagnostics
RESET_MARKER_FILE = "/last_reset_marker.txt"
BOOT_BANNER_SECONDS = 1.2

# Optional periodic diagnostics screen toggle
DIAGNOSTICS_MODE_ENABLED = _env_bool("DIAGNOSTICS_MODE_ENABLED", True)
DIAGNOSTICS_INTERVAL_SECONDS = _env_int("DIAGNOSTICS_INTERVAL_SECONDS", 300)
DIAGNOSTICS_DURATION_SECONDS = _env_int("DIAGNOSTICS_DURATION_SECONDS", 4)

# Cloud control (Worker)
REMOTE_CONTROL_ENABLED = _env_bool("REMOTE_CONTROL_ENABLED", True)
CONTROL_BASE_URL = (os.getenv("CONTROL_BASE_URL") or "").strip().rstrip("/")
CONTROL_DEVICE_ID = (os.getenv("CONTROL_DEVICE_ID") or "matrix-01").strip()
CONTROL_API_TOKEN = (os.getenv("CONTROL_API_TOKEN") or "").strip()
CONTROL_POLL_SECONDS = _env_int("CONTROL_POLL_SECONDS", 3)
REMOTE_SCORE_POLL_ACTIVE_SECONDS = _env_int("REMOTE_SCORE_POLL_ACTIVE_SECONDS", 3)
REMOTE_SCORE_POLL_IDLE_SECONDS = _env_int("REMOTE_SCORE_POLL_IDLE_SECONDS", 20)

# -----------------------
# DEV MODE (simulate a live game)
# -----------------------
# Set True while developing the display layout.
DEV_MODE = _env_bool("DEV_MODE", True)

# Pick opponent by number. Use -1 for random opponent each reboot.
DEV_TEAM_INDEX = 0

# Random score range used in DEV mode.
DEV_SCORE_MIN = 0
DEV_SCORE_MAX = 12

# DEV preview behavior
DEV_CYCLE_ALL_TEAMS = True
DEV_TEAM_CYCLE_SECONDS = _env_int("DEV_TEAM_CYCLE_SECONDS", 4)
DEV_SCORE_UPDATE_SECONDS = _env_int("DEV_SCORE_UPDATE_SECONDS", 1)

# One-switch production profile for unattended deployment.
# Set SAFE_DEPLOY_MODE=true in settings.toml for game-day runtime behavior.
SAFE_DEPLOY_MODE = _env_bool("SAFE_DEPLOY_MODE", False)

if SAFE_DEPLOY_MODE:
    # Disable development-only visuals/loops.
    DEV_MODE = False
    DIAGNOSTICS_MODE_ENABLED = False

    # Conservative power/network settings for long uptime.
    DISPLAY_BRIGHTNESS = 0.14
    AUTO_BRIGHTNESS_ENABLED = True
    DISPLAY_BRIGHTNESS_MIN = 0.08
    DISPLAY_BRIGHTNESS_MAX = 0.18
    BG_COLOR_DIM_SCALE = 0.30

    # Reduce network churn.
    SCHEDULE_POLL_SECONDS = max(SCHEDULE_POLL_SECONDS, 60)
    SCHEDULE_ID_REFRESH_SECONDS = max(SCHEDULE_ID_REFRESH_SECONDS, 24 * 3600)
    NTP_RESYNC_SECONDS = max(NTP_RESYNC_SECONDS, 12 * 3600)

    # Keep hard recovery paths enabled.
    WATCHDOG_ENABLED = True
    MAX_CONSECUTIVE_ERRORS = max(MAX_CONSECUTIVE_ERRORS, 8)

DEV_TEAMS = (
    "Salem State University",
    "Framingham State University",
    "University of Wisconsin-Whitewater",
    "Wesleyan University",
    "University of Wisconsin-River Falls",
    "SUNY Brockport",
    "Macalester College",
    "Eastern Connecticut State",
    "Nichols College",
    "Worcester Polytechnic Institute",
    "Brandeis University",
    "United States Coast Guard Academy",
    "Springfield College",
    "Endicott College",
    "Clark University",
    "Salve Regina",
    "Massachusetts Institute of Technology",
    "Wheaton College",
    "Emerson College",
    "Babson College",
    "Smith College",
)

# Wellesley custom pixel-art logo (20x20, 1-bit)
LOGO_W = 20
LOGO_H = 20
WEL_LOGO_BITS = (
    0b00000000000000000000,
    0b00000000000000000000,
    0b00000000000000000000,
    0b00000000000000000000,
    0b00000000000000000000,
    0b01111011111111011110,
    0b00011001100110011000,
    0b00011000100100011000,
    0b00001100111100110000,
    0b00001100011000110000,
    0b00000110011001100000,
    0b00000110111101100000,
    0b00000011111111000000,
    0b00000001100110000000,
    0b00000001100110000000,
    0b00000000000000000000,
    0b00000000000000000000,
    0b00000000000000000000,
    0b00000000000000000000,
    0b00000000000000000000,
)

TEAM_STYLES = {
    # Keep Wellesley display behavior stable: blue backdrop, white score/logo contrast
    "WEL": {"abbr": "WEL", "primary": WELLESLEY_BLUE, "secondary": WHITE, "aliases": ("WELLESLEY",)},
    "SSU": {"abbr": "SSU", "primary": 0xF57D2F, "secondary": 0x00245E, "aliases": ("SALEM STATE", "SALEM",)},
    "FSU": {"abbr": "FSU", "primary": 0x0A0604, "secondary": 0xFAB20B, "aliases": ("FRAMINGHAM STATE",)},
    "UWW": {"abbr": "UWW", "primary": 0x512884, "secondary": 0xFFFFFF, "aliases": ("WHITEWATER", "WISCONSIN-WHITEWATER",)},
    "WES": {"abbr": "WES", "primary": 0xD72331, "secondary": 0x1A1919, "aliases": ("WESLEYAN",)},
    "UWR": {"abbr": "UWR", "primary": 0xD31145, "secondary": 0x231F20, "aliases": ("RIVER FALLS", "WISCONSIN-RIVER FALLS",)},
    "BRO": {"abbr": "BRO", "primary": 0xF8CD21, "secondary": 0x1A2820, "aliases": ("BROCKPORT", "SUNY BROCKPORT",)},
    "MAC": {"abbr": "MAC", "primary": 0xFFFFFF, "secondary": 0x01426A, "aliases": ("MACALESTER",)},
    "ECS": {"abbr": "ECS", "primary": 0x8C0B05, "secondary": 0x002A5C, "aliases": ("EASTERN CONNECTICUT",)},
    "NIC": {"abbr": "NIC", "primary": 0x221F20, "secondary": 0x017B5E, "aliases": ("NICHOLS",)},
    "WPI": {"abbr": "WPI", "primary": 0xC4122E, "secondary": 0xFFFFFF, "aliases": ("WPI", "WORCESTER POLYTECHNIC",)},
    "BRA": {"abbr": "BRA", "primary": 0xFFFFFF, "secondary": 0x00234D, "aliases": ("BRANDEIS",)},
    "CGA": {"abbr": "CGA", "primary": 0xF2531B, "secondary": 0x223C70, "aliases": ("COAST GUARD", "UNITED STATES COAST GUARD",)},
    "SPR": {"abbr": "SPR", "primary": 0x4C5055, "secondary": 0x990000, "aliases": ("SPRINGFIELD",)},
    "END": {"abbr": "END", "primary": 0x00008B, "secondary": 0x007D61, "aliases": ("ENDICOTT",)},
    "CLK": {"abbr": "CLK", "primary": 0xEE2E24, "secondary": 0x231F20, "aliases": ("CLARK",)},
    "SAL": {"abbr": "SAL", "primary": 0x008000, "secondary": 0x0000FF, "aliases": ("SALVE REGINA",)},
    "MIT": {"abbr": "MIT", "primary": 0xB20D35, "secondary": 0x999698, "aliases": ("MIT", "MASSACHUSETTS INSTITUTE OF TECHNOLOGY",)},
    "WHE": {"abbr": "WHE", "primary": 0xA9B6DA, "secondary": 0x155196, "aliases": ("WHEATON",)},
    "EME": {"abbr": "EME", "primary": 0xFBCE33, "secondary": 0x222021, "aliases": ("EMERSON",)},
    "BAB": {"abbr": "BAB", "primary": 0x008000, "secondary": 0xFFFFFF, "aliases": ("BABSON",)},
    "SMI": {"abbr": "SMI", "primary": 0xEFA92E, "secondary": 0x203F69, "aliases": ("SMITH",)},
}


# -----------------------
# WiFi creds (settings.toml)
# -----------------------
TEXAS_WIFI_SSID = os.getenv("TEXAS_WIFI_SSID") or os.getenv("CIRCUITPY_WIFI_SSID")
TEXAS_WIFI_PASSWORD = os.getenv("TEXAS_WIFI_PASSWORD") or os.getenv("CIRCUITPY_WIFI_PASSWORD")
NORTHEAST_WIFI_SSID = os.getenv("NORTHEAST_WIFI_SSID")
NORTHEAST_WIFI_PASSWORD = os.getenv("NORTHEAST_WIFI_PASSWORD")

if (not TEXAS_WIFI_SSID or not TEXAS_WIFI_PASSWORD) and (not NORTHEAST_WIFI_SSID or not NORTHEAST_WIFI_PASSWORD) and not DEV_MODE:
    raise RuntimeError(
        "Missing WiFi profiles in settings.toml. Provide TEXAS_WIFI_* and/or NORTHEAST_WIFI_*"
    )

if (not TEXAS_WIFI_SSID or not TEXAS_WIFI_PASSWORD) and (not NORTHEAST_WIFI_SSID or not NORTHEAST_WIFI_PASSWORD):
    print("WiFi creds missing: running offline/dev mode")


# -----------------------
# ESP32SPI setup (MatrixPortal M4)
# -----------------------
esp32_cs = DigitalInOut(board.ESP_CS)
esp32_ready = DigitalInOut(board.ESP_BUSY)
esp32_reset = DigitalInOut(board.ESP_RESET)

# Some MatrixPortal M4 expose secondary SPI pins (SCK1/MOSI1/MISO1)
if "SCK1" in dir(board):
    spi = busio.SPI(board.SCK1, board.MOSI1, board.MISO1)
else:
    spi = busio.SPI(board.SCK, board.MOSI, board.MISO)

esp = adafruit_esp32spi.ESP_SPIcontrol(spi, esp32_cs, esp32_ready, esp32_reset)
wifi_texas = WiFiManager(esp, TEXAS_WIFI_SSID or "", TEXAS_WIFI_PASSWORD or "")
wifi_northeast = WiFiManager(esp, NORTHEAST_WIFI_SSID or "", NORTHEAST_WIFI_PASSWORD or "")
active_wifi_manager = wifi_texas
active_wifi_name = "TX"

# HTTPS + sockets for ESP32SPI
pool = adafruit_connection_manager.get_radio_socketpool(esp)
ssl_context = adafruit_connection_manager.get_radio_ssl_context(esp)
requests = adafruit_requests.Session(pool, ssl_context)

# NTP (keep RTC in UTC)
ntp = adafruit_ntp.NTP(pool, tz_offset=0, cache_seconds=3600)
the_rtc = rtc.RTC()


def _remote_headers():
    headers = {"Accept": "application/json"}
    if CONTROL_API_TOKEN:
        headers["Authorization"] = "Bearer " + CONTROL_API_TOKEN
    return headers


def _hex_color_to_int(v, fallback):
    if v is None:
        return fallback
    s = str(v).strip().upper()
    if s.startswith("#"):
        s = s[1:]
    if len(s) != 6:
        return fallback
    try:
        return int(s, 16)
    except ValueError:
        return fallback


def _remote_get_json(path):
    if (not CONTROL_BASE_URL) or (not CONTROL_DEVICE_ID):
        return None
    url = CONTROL_BASE_URL + path
    try:
        r = requests.get(url, headers=_remote_headers(), timeout=10)
        try:
            if r.status_code != 200:
                return None
            return r.json()
        finally:
            r.close()
    except Exception:
        return None


def get_remote_control():
    return _remote_get_json("/control?device_id=" + CONTROL_DEVICE_ID)


def fetch_remote_score_for_control(_control):
    return _remote_get_json("/score?device_id=" + CONTROL_DEVICE_ID)


def _is_control_changed(prev, cur):
    if prev is None:
        return True
    if cur is None:
        return False
    keys = ("source", "sport", "team", "mode", "updated_at")
    for k in keys:
        if str(prev.get(k)) != str(cur.get(k)):
            return True
    return False


def map_remote_payload_to_entry(payload):
    if not isinstance(payload, dict):
        return None

    if payload.get("view_unavailable"):
        return {"view_unavailable": True, "status": "NONE", "message": payload.get("display_text") or "VIEW UNAVAILIBLE"}

    entry = {
        "source": (payload.get("source") or "pro"),
        "sport": (payload.get("sport") or ""),
        "status": (payload.get("status") or "NONE"),
        "at": (payload.get("at") or "Home"),
        "opponent": payload.get("opponent_team") or payload.get("opponent_name") or payload.get("opponent") or "OPP",
        "team_name": payload.get("team_name") or payload.get("team") or "TEAM",
        "team_abbr": payload.get("team_abbr") or _abbrev3(payload.get("team_name") or payload.get("team")),
        "opponent_abbr": payload.get("opponent_abbr") or _abbrev3(payload.get("opponent_team") or payload.get("opponent")),
        "wel_score": payload.get("team_score"),
        "opp_score": payload.get("opp_score"),
        "team_primary": _hex_color_to_int(payload.get("team_primary"), WELLESLEY_BLUE),
        "team_secondary": _hex_color_to_int(payload.get("team_secondary"), WHITE),
        "opp_primary": _hex_color_to_int(payload.get("opp_primary"), UNKNOWN_PRIMARY),
        "opp_secondary": _hex_color_to_int(payload.get("opp_secondary"), UNKNOWN_SECONDARY),
        "countdown_active": bool(payload.get("countdown_active")),
        "countdown_text": payload.get("countdown_text"),
        "next_game_time_unix": payload.get("next_game_time_unix"),
        "display_text": payload.get("display_text") or payload.get("message"),
    }
    return entry


def connect_wifi_with_fallback():
    """Try Texas Wi-Fi first, then Northeast fallback."""
    global active_wifi_manager, active_wifi_name

    profiles = [
        ("TX", TEXAS_WIFI_SSID, TEXAS_WIFI_PASSWORD, wifi_texas),
        ("NE", NORTHEAST_WIFI_SSID, NORTHEAST_WIFI_PASSWORD, wifi_northeast),
    ]

    last_error = None
    for name, ssid, password, manager in profiles:
        if not ssid or not password:
            continue
        try:
            manager.connect()
            active_wifi_manager = manager
            active_wifi_name = name
            print("WiFi connected profile:", name, "IP:", esp.ipv4_address)
            log_event("wifi connected profile=" + name)
            return True
        except Exception as e:
            last_error = e
            print("WiFi connect failed profile", name, ":", repr(e))
            log_event("wifi failed profile=" + name)

    if last_error is not None:
        raise last_error
    raise RuntimeError("No configured WiFi profiles")


def setup_watchdog():
    """Configure hardware watchdog reset if supported by this build/board."""
    if not WATCHDOG_ENABLED or WatchDogMode is None:
        return None
    try:
        wdt = microcontroller.watchdog
        wdt.timeout = WATCHDOG_TIMEOUT_SECONDS
        wdt.mode = WatchDogMode.RESET
        print("Watchdog enabled:", WATCHDOG_TIMEOUT_SECONDS, "s")
        log_event("watchdog enabled timeout=" + str(WATCHDOG_TIMEOUT_SECONDS))
        return wdt
    except Exception as e:
        print("Watchdog setup skipped:", repr(e))
        log_event("watchdog setup skipped")
        return None


def write_reset_marker(reason):
    try:
        with open(RESET_MARKER_FILE, "w") as f:
            f.write(str(reason))
    except Exception as e:
        print("Reset marker write failed:", repr(e))


def log_event(message):
    """Append an event line and keep only the newest N lines."""
    try:
        ts = int(time.monotonic())
        line = str(ts) + " " + str(message)

        existing = []
        try:
            with open(EVENT_LOG_FILE, "r") as f:
                existing = [ln.rstrip("\n") for ln in f]
        except Exception:
            existing = []

        existing.append(line)
        if len(existing) > EVENT_LOG_MAX_LINES:
            existing = existing[-EVENT_LOG_MAX_LINES:]

        with open(EVENT_LOG_FILE, "w") as f:
            for ln in existing:
                f.write(ln + "\n")
    except Exception:
        pass


def read_and_clear_reset_marker():
    try:
        with open(RESET_MARKER_FILE, "r") as f:
            marker = f.read().strip()
    except Exception:
        return None

    try:
        os.remove(RESET_MARKER_FILE)
    except Exception:
        pass
    return marker


def _schedule_txt_url(schedule_id):
    return WELLESLEY_SCHEDULE_TXT_BASE_URL + str(schedule_id)


def _extract_schedule_id_from_html(html):
    for marker in ("schedule_txt.ashx?schedule=", "schedule.aspx?schedule="):
        idx = html.find(marker)
        if idx < 0:
            continue
        i = idx + len(marker)
        digits = []
        n = len(html)
        while i < n and html[i].isdigit():
            digits.append(html[i])
            i += 1
        if digits:
            return "".join(digits)
    return None


def discover_schedule_id():
    """Fetch softball schedule page and extract schedule id used by schedule_txt endpoint."""
    try:
        r = requests.get(WELLESLEY_SCHEDULE_PAGE_URL, timeout=12)
        html = r.text
        r.close()
        sid = _extract_schedule_id_from_html(html)
        if sid:
            print("Discovered schedule id:", sid)
            log_event("schedule id discovered " + sid)
        else:
            print("Could not discover schedule id from page")
            log_event("schedule id discovery returned none")
        return sid
    except Exception as e:
        print("Schedule id discovery failed:", repr(e))
        log_event("schedule id discovery failed")
        return None


def load_state_cache():
    """Load cached schedule id + entries from local storage."""
    try:
        with open(STATE_CACHE_FILE, "r") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {}


def save_state_cache(schedule_id, entries):
    """Persist last known good state for network/feed outages."""
    try:
        payload = {
            "schedule_id": str(schedule_id) if schedule_id is not None else None,
            "entries": entries,
            "saved_monotonic": int(time.monotonic()),
        }
        with open(STATE_CACHE_FILE, "w") as f:
            json.dump(payload, f)
    except Exception as e:
        print("State cache save failed:", repr(e))
        log_event("state cache save failed")


def load_unknown_team_set():
    s = set()
    try:
        with open(UNKNOWN_TEAMS_FILE, "r") as f:
            for line in f:
                t = line.strip()
                if t:
                    s.add(t)
    except Exception:
        pass
    return s


def log_unknown_team(name, known_set):
    t = (name or "").strip()
    if not t or t in known_set:
        return
    known_set.add(t)
    try:
        with open(UNKNOWN_TEAMS_FILE, "a") as f:
            f.write(t + "\n")
        log_event("unknown team " + t)
    except Exception as e:
        print("Unknown-team log failed:", repr(e))


# -----------------------
# US Central DST rules (Texas)
# DST starts: 2nd Sunday in March @ 02:00 CST (08:00 UTC)
# DST ends:   1st Sunday in Nov   @ 02:00 CDT (07:00 UTC)
# CircuitPython lacks time.gmtime(); RTC is UTC so time.localtime(epoch) == UTC breakdown
# -----------------------
def _nth_sunday(year, month, n):
    # tm_wday: Mon=0 ... Sun=6
    wday_m1 = time.localtime(time.mktime((year, month, 1, 0, 0, 0, 0, 0, -1))).tm_wday
    first_sunday = 1 if wday_m1 == 6 else 1 + ((6 - wday_m1) % 7)
    return first_sunday + 7 * (n - 1)

def _central_is_dst(utc_epoch):
    y = time.localtime(utc_epoch).tm_year
    start_day = _nth_sunday(y, 3, 2)   # 2nd Sunday March
    end_day = _nth_sunday(y, 11, 1)    # 1st Sunday Nov

    dst_start_utc = time.mktime((y, 3, start_day, 8, 0, 0, 0, 0, -1))  # 08:00 UTC
    dst_end_utc   = time.mktime((y, 11, end_day, 7, 0, 0, 0, 0, -1))   # 07:00 UTC
    return dst_start_utc <= utc_epoch < dst_end_utc

def central_offset_hours(utc_epoch):
    return -5 if _central_is_dst(utc_epoch) else -6

# -----------------------
# Schedule parsing (schedule_txt.ashx)
# Example tokens per game:
# Mar 17 (Mon) 9:00 AM Neutral Macalester College Clermont, FL - Legends Way 2 L 2-5
# Result is from Wellesley's perspective: W/L/T then score A-B (A=Wellesley)
# LIVE may appear as "LIVE" (we handle if it does)
# -----------------------
MONTHS = ("Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec")
MONTH_TO_NUM = {m: i+1 for i, m in enumerate(MONTHS)}

def parse_time_12h(hhmm, ampm):
    hh_s, mm_s = hhmm.split(":")
    hh = int(hh_s); mm = int(mm_s)
    if ampm == "PM" and hh != 12:
        hh += 12
    if ampm == "AM" and hh == 12:
        hh = 0
    return hh, mm

def _parse_score_token(tok):
    if "-" not in tok:
        return (None, None)
    a, b = tok.split("-", 1)
    if a.isdigit() and b.isdigit():
        return (int(a), int(b))
    return (None, None)

def _split_columns(line):
    # Split fixed-width schedule rows on runs of 2+ spaces.
    s = line.strip()
    cols = []
    cur = []
    i = 0
    n = len(s)
    while i < n:
        if s[i] == " " and i + 1 < n and s[i + 1] == " ":
            tok = "".join(cur).strip()
            if tok:
                cols.append(tok)
            cur = []
            while i < n and s[i] == " ":
                i += 1
            continue
        cur.append(s[i])
        i += 1

    tok = "".join(cur).strip()
    if tok:
        cols.append(tok)
    return cols

def _parse_date_col(date_col):
    parts = date_col.split()
    if len(parts) < 2 or parts[0] not in MONTH_TO_NUM:
        return (None, None, None)
    try:
        day = int(parts[1])
    except ValueError:
        return (None, None, None)
    return (parts[0], MONTH_TO_NUM[parts[0]], day)

def _parse_time_col(time_col):
    tparts = time_col.split()
    # Expected: "10:00 AM" (or TBD)
    if len(tparts) == 2 and ":" in tparts[0] and tparts[1] in ("AM", "PM"):
        return parse_time_12h(tparts[0], tparts[1])
    return (None, None)

def et_to_ct(hh, mm):
    # Wellesley site times are effectively Eastern; Texas is Central = -1 hour
    hh = (hh - 1) % 24
    return hh, mm

def _make_logo_from_bits(bit_rows, width, height):
    logo_bitmap = displayio.Bitmap(width, height, 2)
    logo_palette = displayio.Palette(2)
    logo_palette[0] = BLACK
    logo_palette[1] = WHITE
    logo_palette.make_transparent(0)

    for y in range(height):
        row = bit_rows[y]
        for x in range(width):
            bit = (row >> (width - 1 - x)) & 0x1
            logo_bitmap[x, y] = bit

    return logo_bitmap, logo_palette

def _trim_1bpp_logo(bit_rows, width, height):
    # Remove fully transparent outer rows/cols so visual pixels can sit at (0,0).
    top = 0
    while top < height and bit_rows[top] == 0:
        top += 1

    if top >= height:
        return bit_rows, width, height

    bottom = height - 1
    while bottom >= 0 and bit_rows[bottom] == 0:
        bottom -= 1

    left = width
    right = -1
    for y in range(top, bottom + 1):
        row = bit_rows[y]
        for x in range(width):
            bit = (row >> (width - 1 - x)) & 0x1
            if bit:
                if x < left:
                    left = x
                if x > right:
                    right = x

    if right < left:
        return bit_rows, width, height

    cropped_rows = []
    new_w = right - left + 1
    for y in range(top, bottom + 1):
        row = bit_rows[y]
        out = 0
        for x in range(left, right + 1):
            out = (out << 1) | ((row >> (width - 1 - x)) & 0x1)
        cropped_rows.append(out)

    return tuple(cropped_rows), new_w, (bottom - top + 1)

def _opp_style_for_name(name):
    """Resolve opponent display style from schedule name.

    Returns tuple: (abbr, primary_color, secondary_color)
    Falls back to OTH + red/white when no match is found.
    """
    up = (name or "").upper()
    for style in TEAM_STYLES.values():
        # Skip Wellesley here; opponent should resolve to non-WEL style.
        if style["abbr"] == "WEL":
            continue
        for alias in style["aliases"]:
            if alias in up:
                return (style["abbr"], style["primary"], style["secondary"])
    log_unknown_team(name, UNKNOWN_TEAM_SET)
    return (UNKNOWN_ABBR, UNKNOWN_PRIMARY, UNKNOWN_SECONDARY)


def _dim_color(color, scale):
    """Scale RGB brightness of a 0xRRGGBB color by `scale` (0.0..1.0)."""
    r = (color >> 16) & 0xFF
    g = (color >> 8) & 0xFF
    b = color & 0xFF
    r = int(r * scale)
    g = int(g * scale)
    b = int(b * scale)
    return (r << 16) | (g << 8) | b


def _luma(color):
    r = (color >> 16) & 0xFF
    g = (color >> 8) & 0xFF
    b = color & 0xFF
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0


def set_adaptive_brightness(left_color, right_color):
    if not AUTO_BRIGHTNESS_ENABLED:
        return
    avg = (_luma(left_color) + _luma(right_color)) * 0.5
    span = DISPLAY_BRIGHTNESS_MAX - DISPLAY_BRIGHTNESS_MIN
    target = DISPLAY_BRIGHTNESS_MAX - (avg * span)
    if target < DISPLAY_BRIGHTNESS_MIN:
        target = DISPLAY_BRIGHTNESS_MIN
    if target > DISPLAY_BRIGHTNESS_MAX:
        target = DISPLAY_BRIGHTNESS_MAX
    display.brightness = target

def parse_schedule_txt(text):
    entries = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue

        # Skip non-game rows quickly.
        if line[:3] not in MONTH_TO_NUM:
            continue

        cols = _split_columns(line)
        # Expected minimum:
        # ["Mar 16 (Mon)", "10:00 AM", "Neutral", "Opponent", ...]
        if len(cols) < 4:
            continue

        month_abbr, month_num, day = _parse_date_col(cols[0])
        if month_num is None:
            continue

        h_et, m_et = _parse_time_col(cols[1])
        if h_et is None:
            h_ct, m_ct = (None, None)
        else:
            h_ct, m_ct = et_to_ct(h_et, m_et)

        at = cols[2]
        opponent = cols[3] if cols[3] else "Unknown"

        status = "SCHEDULED"
        result = None
        wel_score = None
        opp_score = None

        tail_tokens = " ".join(cols[4:]).split()
        for idx, tok in enumerate(tail_tokens):
            up = tok.upper()
            if up == "LIVE":
                status = "LIVE"
                if idx + 1 < len(tail_tokens):
                    wel_score, opp_score = _parse_score_token(tail_tokens[idx + 1])
                break

            if tok in ("W", "L", "T"):
                result = tok
                status = "FINAL"
                if idx + 1 < len(tail_tokens):
                    wel_score, opp_score = _parse_score_token(tail_tokens[idx + 1])
                break

        entries.append({
            "month_abbr": month_abbr,
            "month": month_num,
            "day": day,
            "hour": h_ct,
            "min": m_ct,
            "at": at,
            "opponent": opponent,
            "status": status,
            "result": result,
            "wel_score": wel_score,
            "opp_score": opp_score,
        })

    return entries

def _entry_sort_key(e):
    h = 0 if e["hour"] is None else e["hour"]
    m = 0 if e["min"] is None else e["min"]
    return (e["month"], e["day"], h, m)

def pick_current_or_next(entries, now_local):
    # now_local is struct_time in CENTRAL
    today = [e for e in entries if e["month"] == now_local.tm_mon and e["day"] == now_local.tm_mday]
    today.sort(key=_entry_sort_key)

    # Prefer LIVE today
    for e in today:
        if e["status"] == "LIVE":
            return ("LIVE", e)

    # If a score exists today, show it (some sites only post finals; still useful)
    for e in today:
        if e["wel_score"] is not None and e["opp_score"] is not None:
            return ("SCORE", e)

    now_min = now_local.tm_hour * 60 + now_local.tm_min
    for e in today:
        # Show next scheduled game later today if it has a known time.
        if e["status"] == "SCHEDULED" and e["hour"] is not None:
            e_min = e["hour"] * 60 + e["min"]
            if e_min >= now_min:
                return ("NEXT", e)

    # Next upcoming (very simple: first entry after today by month/day)
    # (Good enough for seasonal use; no year rollover handling)
    for e in sorted(entries, key=_entry_sort_key):
        if (e["month"], e["day"]) > (now_local.tm_mon, now_local.tm_mday):
            return ("NEXT", e)

    return ("NONE", None)


# -----------------------
# Display setup
# -----------------------
matrixportal = MatrixPortal(status_neopixel=board.NEOPIXEL, use_wifi=False, debug=False)
display = matrixportal.display
display.brightness = DISPLAY_BRIGHTNESS

W = display.width
H = display.height
print("Display size:", W, "x", H)

root = displayio.Group()
display.root_group = root

# Background halves + divider
left_bg = Rect(0, 0, W // 2, H, fill=WELLESLEY_BLUE)
right_bg = Rect(W // 2, 0, W - (W // 2), H, fill=UNKNOWN_PRIMARY)

root.append(left_bg)
root.append(right_bg)

wel_rows, wel_w, wel_h = _trim_1bpp_logo(WEL_LOGO_BITS, LOGO_W, LOGO_H)
wel_logo_bitmap, wel_logo_palette = _make_logo_from_bits(wel_rows, wel_w, wel_h)

wel_logo = displayio.TileGrid(
    wel_logo_bitmap,
    pixel_shader=wel_logo_palette,
    x=3,
    y=2,
)
root.append(wel_logo)

WEL_LOGO_LEFT_X = 3
WEL_LOGO_RIGHT_X = W - wel_logo_bitmap.width - 3

# Text labels
opp_lbl = Label(terminalio.FONT, text="OPP", color=WHITE)
opp_lbl.y = 6

root.append(opp_lbl)

wifi_error_lbl = Label(terminalio.FONT, text="", color=WHITE)
wifi_error_lbl.x = 2
wifi_error_lbl.y = (H // 2) + 3
wifi_error_lbl.hidden = True
root.append(wifi_error_lbl)

team_lbl = Label(terminalio.FONT, text="", color=WHITE)
team_lbl.y = 6
team_lbl.hidden = True
root.append(team_lbl)

# Score layout tuning
SCORE_GAP_FROM_CENTER = 2
SEG_W = 7
SEG_H = 16
SEG_T = 2
SEG_DIGIT_GAP = 1
SEG_SCORE_Y = 16 if H <= 32 else 20
SCORE_BOX_PAD = 1

# a, b, c, d, e, f, g
SEG_MAP = {
    "0": (1, 1, 1, 1, 1, 1, 0),
    "1": (0, 1, 1, 0, 0, 0, 0),
    "2": (1, 1, 0, 1, 1, 0, 1),
    "3": (1, 1, 1, 1, 0, 0, 1),
    "4": (0, 1, 1, 0, 0, 1, 1),
    "5": (1, 0, 1, 1, 0, 1, 1),
    "6": (1, 0, 1, 1, 1, 1, 1),
    "7": (1, 1, 1, 0, 0, 0, 0),
    "8": (1, 1, 1, 1, 1, 1, 1),
    "9": (1, 1, 1, 1, 0, 1, 1),
    "-": (0, 0, 0, 0, 0, 0, 1),
    " ": (0, 0, 0, 0, 0, 0, 0),
}


def _make_digit_segments(x, y, color):
    h2 = SEG_H // 2
    segs = [
        Rect(x + SEG_T, y, SEG_W - 2 * SEG_T, SEG_T, fill=color),  # a
        Rect(x + SEG_W - SEG_T, y + SEG_T, SEG_T, h2 - SEG_T, fill=color),  # b
        Rect(x + SEG_W - SEG_T, y + h2, SEG_T, SEG_H - h2 - SEG_T, fill=color),  # c
        Rect(x + SEG_T, y + SEG_H - SEG_T, SEG_W - 2 * SEG_T, SEG_T, fill=color),  # d
        Rect(x, y + h2, SEG_T, SEG_H - h2 - SEG_T, fill=color),  # e
        Rect(x, y + SEG_T, SEG_T, h2 - SEG_T, fill=color),  # f
        Rect(x + SEG_T, y + h2 - (SEG_T // 2), SEG_W - 2 * SEG_T, SEG_T, fill=color),  # g
    ]
    for s in segs:
        root.append(s)
    return segs


def _set_digit_segments(segs, ch):
    pat = SEG_MAP[ch] if ch in SEG_MAP else SEG_MAP[" "]
    for i, s in enumerate(segs):
        s.hidden = not bool(pat[i])


def _set_digit_color(segs, color):
    for s in segs:
        s.fill = color


def _score_chars_3(v):
    # 3-digit layout with leading spaces.
    if v is None:
        return ("-", "-", "-")
    n = int(v) % 1000
    h = n // 100
    t = (n // 10) % 10
    o = n % 10
    ch_h = " " if h == 0 else str(h)
    ch_t = " " if (h == 0 and t == 0) else str(t)
    return (ch_h, ch_t, str(o))


def _place_score_segments():
    center_x = W // 2
    left_inner_edge = center_x - SCORE_GAP_FROM_CENTER
    right_inner_edge = center_x + SCORE_GAP_FROM_CENTER
    num_w = (3 * SEG_W) + (2 * SEG_DIGIT_GAP)

    left_start = left_inner_edge - num_w
    right_start = right_inner_edge

    # Safety clamp: keep both 2-digit blocks fully onscreen even if geometry changes.
    min_x = 0
    max_left_start = max(0, W - num_w)
    left_start = max(min_x, min(left_start, max_left_start))
    right_start = max(min_x, min(right_start, max_left_start))

    # Keep vertical start onscreen.
    safe_y = max(0, min(SEG_SCORE_Y, max(0, H - SEG_H)))

    # left team (home)
    _set_segments_xy(wel_huns, left_start, safe_y)
    _set_segments_xy(wel_tens, left_start + SEG_W + SEG_DIGIT_GAP, safe_y)
    _set_segments_xy(wel_ones, left_start + (2 * (SEG_W + SEG_DIGIT_GAP)), safe_y)
    # right team (away)
    _set_segments_xy(opp_huns, right_start, safe_y)
    _set_segments_xy(opp_tens, right_start + SEG_W + SEG_DIGIT_GAP, safe_y)
    _set_segments_xy(opp_ones, right_start + (2 * (SEG_W + SEG_DIGIT_GAP)), safe_y)

    # score boxes (white outline)
    left_score_box.x = left_start - SCORE_BOX_PAD
    left_score_box.y = safe_y - SCORE_BOX_PAD
    right_score_box.x = right_start - SCORE_BOX_PAD
    right_score_box.y = safe_y - SCORE_BOX_PAD


def _set_segments_xy(segs, x, y):
    h2 = SEG_H // 2
    # a
    segs[0].x = x + SEG_T; segs[0].y = y
    # b
    segs[1].x = x + SEG_W - SEG_T; segs[1].y = y + SEG_T
    # c
    segs[2].x = x + SEG_W - SEG_T; segs[2].y = y + h2
    # d
    segs[3].x = x + SEG_T; segs[3].y = y + SEG_H - SEG_T
    # e
    segs[4].x = x; segs[4].y = y + h2
    # f
    segs[5].x = x; segs[5].y = y + SEG_T
    # g
    segs[6].x = x + SEG_T; segs[6].y = y + h2 - (SEG_T // 2)


# Create segment score objects
wel_huns = _make_digit_segments(0, SEG_SCORE_Y, WHITE)
wel_tens = _make_digit_segments(0, SEG_SCORE_Y, WHITE)
wel_ones = _make_digit_segments(0, SEG_SCORE_Y, WHITE)
opp_huns = _make_digit_segments(0, SEG_SCORE_Y, WHITE)
opp_tens = _make_digit_segments(0, SEG_SCORE_Y, WHITE)
opp_ones = _make_digit_segments(0, SEG_SCORE_Y, WHITE)

_num_w = (3 * SEG_W) + (2 * SEG_DIGIT_GAP)
_box_w = _num_w + (2 * SCORE_BOX_PAD)
_box_h = SEG_H + (2 * SCORE_BOX_PAD)
left_score_box = Rect(0, 0, _box_w, _box_h, fill=None, outline=WHITE, stroke=1)
right_score_box = Rect(0, 0, _box_w, _box_h, fill=None, outline=WHITE, stroke=1)
left_score_box.outline = None
left_score_box.stroke = 0
right_score_box.outline = None
right_score_box.stroke = 0
root.append(left_score_box)
root.append(right_score_box)

_place_score_segments()


def _abbrev3(name):
    if not name:
        return "---"
    token = name.split(" ")[0].upper()
    token = "".join(c for c in token if "A" <= c <= "Z")
    if len(token) >= 3:
        return token[:3]
    if len(token) == 2:
        return token + "-"
    if len(token) == 1:
        return token + "--"
    return "---"


def _set_opp_label_side(opp_abbr, opp_color, on_right):
    opp_lbl.text = (opp_abbr or "---")[:3]
    opp_lbl.color = opp_color
    opp_w = opp_lbl.bounding_box[2]
    if on_right:
        opp_lbl.x = W - opp_w - 2
    else:
        opp_lbl.x = 2


def _set_team_label_side(team_abbr, team_color, on_right):
    team_lbl.text = (team_abbr or "---")[:3]
    team_lbl.color = team_color
    team_w = team_lbl.bounding_box[2]
    if on_right:
        team_lbl.x = W - team_w - 2
    else:
        team_lbl.x = 2


def _diag_2chars(value):
    s = str(int(value) % 100)
    if len(s) == 1:
        s = "0" + s
    return (s[0], s[1])


def set_safe_mode_screen(code="ERR"):
    team_lbl.hidden = True
    wel_logo.hidden = False
    wifi_error_lbl.hidden = True
    left_bg.fill = 0x220000
    right_bg.fill = 0x220000
    opp_lbl.text = (code or "ERR")[:3]
    opp_lbl.color = WHITE
    opp_lbl.x = 2
    _set_digit_color(wel_huns, WHITE)
    _set_digit_color(wel_tens, WHITE)
    _set_digit_color(wel_ones, WHITE)
    _set_digit_color(opp_huns, WHITE)
    _set_digit_color(opp_tens, WHITE)
    _set_digit_color(opp_ones, WHITE)
    _set_digit_segments(wel_huns, "-")
    _set_digit_segments(wel_tens, "-")
    _set_digit_segments(wel_ones, "-")
    _set_digit_segments(opp_huns, "-")
    _set_digit_segments(opp_tens, "-")
    _set_digit_segments(opp_ones, "-")


def set_wifi_error_screen():
    team_lbl.hidden = True
    wel_logo.hidden = False
    left_bg.fill = 0x220000
    right_bg.fill = 0x220000
    opp_lbl.text = "WIF"
    opp_lbl.color = WHITE
    opp_lbl.x = 2
    wifi_error_lbl.text = "WIFI ERROR"
    wifi_error_lbl.color = WHITE
    wifi_error_lbl.hidden = False
    _set_digit_color(wel_huns, WHITE)
    _set_digit_color(wel_tens, WHITE)
    _set_digit_color(wel_ones, WHITE)
    _set_digit_color(opp_huns, WHITE)
    _set_digit_color(opp_tens, WHITE)
    _set_digit_color(opp_ones, WHITE)
    _set_digit_segments(wel_huns, "-")
    _set_digit_segments(wel_tens, "-")
    _set_digit_segments(wel_ones, "-")
    _set_digit_segments(opp_huns, "-")
    _set_digit_segments(opp_tens, "-")
    _set_digit_segments(opp_ones, "-")


def set_go_blue_screen():
    team_lbl.hidden = True
    wel_logo.hidden = False
    left_bg.fill = WELLESLEY_BLUE
    right_bg.fill = WELLESLEY_BLUE
    opp_lbl.text = "WEL"
    opp_lbl.color = WHITE
    opp_lbl.x = 2
    wifi_error_lbl.text = "GO BLUE!!!"
    wifi_error_lbl.color = WHITE
    wifi_error_lbl.hidden = False
    _set_digit_color(wel_huns, WHITE)
    _set_digit_color(wel_tens, WHITE)
    _set_digit_color(wel_ones, WHITE)
    _set_digit_color(opp_huns, WHITE)
    _set_digit_color(opp_tens, WHITE)
    _set_digit_color(opp_ones, WHITE)
    _set_digit_segments(wel_huns, "-")
    _set_digit_segments(wel_tens, "-")
    _set_digit_segments(wel_ones, "-")
    _set_digit_segments(opp_huns, "-")
    _set_digit_segments(opp_tens, "-")
    _set_digit_segments(opp_ones, "-")


def show_diagnostics_screen(uptime_s, schedule_id, cache_count, boot_reason, wifi_connected):
    """Tiny rotating diagnostics view using existing score segments.

    Pages rotate each second:
    - UPT: uptime minutes | uptime seconds
    - SID: schedule id last2 | cache entry count last2
    - SYS: reset marker/reason flag | wifi flag
    """
    page = int(uptime_s) % 3
    wifi_error_lbl.hidden = True
    left_bg.fill = 0x101010
    right_bg.fill = 0x101010
    _set_digit_color(wel_huns, WHITE)
    _set_digit_color(wel_tens, WHITE)
    _set_digit_color(wel_ones, WHITE)
    _set_digit_color(opp_huns, WHITE)
    _set_digit_color(opp_tens, WHITE)
    _set_digit_color(opp_ones, WHITE)

    if page == 0:
        opp_lbl.text = "UPT"
        l_t, l_o = _diag_2chars(int(uptime_s) // 60)
        r_t, r_o = _diag_2chars(int(uptime_s) % 60)
    elif page == 1:
        opp_lbl.text = "SID"
        sid_val = int(schedule_id) if str(schedule_id).isdigit() else 0
        l_t, l_o = _diag_2chars(sid_val)
        r_t, r_o = _diag_2chars(cache_count)
    else:
        opp_lbl.text = "SYS"
        reset_flag = 1 if (("WATCHDOG" in str(boot_reason).upper()) or (boot_reason in ("ERROR_RESET", "WATCHDOG_RESET"))) else 0
        wifi_flag = 1 if wifi_connected else 0
        l_t, l_o = _diag_2chars(reset_flag)
        r_t, r_o = _diag_2chars(wifi_flag)

    opp_lbl.color = WHITE
    opp_w = opp_lbl.bounding_box[2]
    opp_lbl.x = W - opp_w - 2

    _set_digit_segments(wel_huns, " ")
    _set_digit_segments(wel_tens, l_t)
    _set_digit_segments(wel_ones, l_o)
    _set_digit_segments(opp_huns, " ")
    _set_digit_segments(opp_tens, r_t)
    _set_digit_segments(opp_ones, r_o)


def set_remote_timer_screen(entry):
    if not entry:
        set_go_blue_screen()
        return

    team_lbl.hidden = False
    wel_logo.hidden = True

    team_primary = entry.get("team_primary", WELLESLEY_BLUE)
    team_secondary = entry.get("team_secondary", WHITE)
    opp_primary = entry.get("opp_primary", UNKNOWN_PRIMARY)
    opp_secondary = entry.get("opp_secondary", UNKNOWN_SECONDARY)
    team_abbr = (entry.get("team_abbr") or _abbrev3(entry.get("team_name")))[:3]
    opp_abbr = (entry.get("opponent_abbr") or _abbrev3(entry.get("opponent")))[:3]

    is_away = str(entry.get("at") or "").upper().startswith("AWAY")
    if is_away:
        left_bg.fill = opp_primary
        right_bg.fill = team_primary
        _set_team_label_side(team_abbr, team_secondary, True)
        _set_opp_label_side(opp_abbr, opp_secondary, False)
    else:
        left_bg.fill = team_primary
        right_bg.fill = opp_primary
        _set_team_label_side(team_abbr, team_secondary, False)
        _set_opp_label_side(opp_abbr, opp_secondary, True)

    set_adaptive_brightness(left_bg.fill, right_bg.fill)

    timer_txt = entry.get("countdown_text") or "--:--:--"
    wifi_error_lbl.text = timer_txt[:15]
    wifi_error_lbl.color = WHITE
    wifi_error_lbl.hidden = False

    _set_digit_color(wel_huns, WHITE)
    _set_digit_color(wel_tens, WHITE)
    _set_digit_color(wel_ones, WHITE)
    _set_digit_color(opp_huns, WHITE)
    _set_digit_color(opp_tens, WHITE)
    _set_digit_color(opp_ones, WHITE)
    _set_digit_segments(wel_huns, " ")
    _set_digit_segments(wel_tens, "-")
    _set_digit_segments(wel_ones, "-")
    _set_digit_segments(opp_huns, " ")
    _set_digit_segments(opp_tens, "-")
    _set_digit_segments(opp_ones, "-")


def set_view_unavailable_screen(msg):
    team_lbl.hidden = True
    wel_logo.hidden = False
    left_bg.fill = 0x111111
    right_bg.fill = 0x111111
    opp_lbl.text = "N/A"
    opp_lbl.color = WHITE
    opp_lbl.x = 2
    wifi_error_lbl.text = (msg or "VIEW UNAVAILIBLE")[:15]
    wifi_error_lbl.color = WHITE
    wifi_error_lbl.hidden = False
    _set_digit_color(wel_huns, WHITE)
    _set_digit_color(wel_tens, WHITE)
    _set_digit_color(wel_ones, WHITE)
    _set_digit_color(opp_huns, WHITE)
    _set_digit_color(opp_tens, WHITE)
    _set_digit_color(opp_ones, WHITE)
    _set_digit_segments(wel_huns, "-")
    _set_digit_segments(wel_tens, "-")
    _set_digit_segments(wel_ones, "-")
    _set_digit_segments(opp_huns, "-")
    _set_digit_segments(opp_tens, "-")
    _set_digit_segments(opp_ones, "-")


def _is_wellesley_home(entry):
    if entry is None:
        return True
    at = (entry.get("at") or "").upper()
    if at.startswith("AWAY"):
        return False
    if at.startswith("HOME"):
        return True
    # Neutral/unknown: keep Wellesley on left for consistent display
    return True


def set_scoreboard(entry):
    wifi_error_lbl.hidden = True
    if entry and entry.get("team_primary") is not None:
        team_name = entry.get("team_name") or "TEAM"
        team_abbr = (entry.get("team_abbr") or _abbrev3(team_name))[:3]
        opp_abbr = (entry.get("opponent_abbr") or _abbrev3(entry.get("opponent")))[:3]
        team_primary = entry.get("team_primary", WELLESLEY_BLUE)
        team_secondary = entry.get("team_secondary", WHITE)
        opp_primary = entry.get("opp_primary", UNKNOWN_PRIMARY)
        opp_secondary = entry.get("opp_secondary", UNKNOWN_SECONDARY)
        team_home = not str(entry.get("at") or "Home").upper().startswith("AWAY")

        if team_home:
            left_fill = team_primary
            right_fill = opp_primary
            left_bg.fill = left_fill
            right_bg.fill = right_fill
            _set_digit_color(wel_huns, team_secondary)
            _set_digit_color(wel_tens, team_secondary)
            _set_digit_color(wel_ones, team_secondary)
            _set_digit_color(opp_huns, opp_secondary)
            _set_digit_color(opp_tens, opp_secondary)
            _set_digit_color(opp_ones, opp_secondary)
            _set_team_label_side(team_abbr, team_secondary, False)
            _set_opp_label_side(opp_abbr, opp_secondary, True)
        else:
            left_fill = opp_primary
            right_fill = team_primary
            left_bg.fill = left_fill
            right_bg.fill = right_fill
            _set_digit_color(wel_huns, opp_secondary)
            _set_digit_color(wel_tens, opp_secondary)
            _set_digit_color(wel_ones, opp_secondary)
            _set_digit_color(opp_huns, team_secondary)
            _set_digit_color(opp_tens, team_secondary)
            _set_digit_color(opp_ones, team_secondary)
            _set_team_label_side(team_abbr, team_secondary, True)
            _set_opp_label_side(opp_abbr, opp_secondary, False)

        show_wel_logo_only = (
            str(entry.get("source") or "").lower() == "wellesley"
            and team_abbr == "WEL"
            and str(entry.get("sport") or "").lower().find("softball") >= 0
        )
        wel_logo.hidden = not show_wel_logo_only
        team_lbl.hidden = show_wel_logo_only
        if show_wel_logo_only:
            wel_logo.x = WEL_LOGO_LEFT_X if team_home else WEL_LOGO_RIGHT_X
    else:
        team_lbl.hidden = True
        wel_logo.hidden = False
        opp_name = entry["opponent"] if entry else ""
        opp_abbr, opp_primary, opp_secondary = _opp_style_for_name(opp_name)
        wel_primary = TEAM_STYLES["WEL"]["primary"]
        wel_secondary = TEAM_STYLES["WEL"]["secondary"]

        wel_home = _is_wellesley_home(entry)

        if wel_home:
            left_fill = wel_primary
            right_fill = opp_primary
            left_bg.fill = left_fill
            right_bg.fill = right_fill
            _set_digit_color(wel_huns, wel_secondary)
            _set_digit_color(wel_tens, wel_secondary)
            _set_digit_color(wel_ones, wel_secondary)
            _set_digit_color(opp_huns, opp_secondary)
            _set_digit_color(opp_tens, opp_secondary)
            _set_digit_color(opp_ones, opp_secondary)
            _set_opp_label_side(opp_abbr, opp_secondary, True)
            wel_logo.x = WEL_LOGO_LEFT_X
        else:
            left_fill = opp_primary
            right_fill = wel_primary
            left_bg.fill = left_fill
            right_bg.fill = right_fill
            _set_digit_color(wel_huns, opp_secondary)
            _set_digit_color(wel_tens, opp_secondary)
            _set_digit_color(wel_ones, opp_secondary)
            _set_digit_color(opp_huns, wel_secondary)
            _set_digit_color(opp_tens, wel_secondary)
            _set_digit_color(opp_ones, wel_secondary)
            _set_opp_label_side(opp_abbr, opp_secondary, False)
            wel_logo.x = WEL_LOGO_RIGHT_X

    set_adaptive_brightness(left_fill, right_fill)

    if entry is None:
        l_h, l_t, l_o = _score_chars_3(None)
        r_h, r_t, r_o = _score_chars_3(None)
    else:
        if entry.get("team_primary") is not None:
            is_away = str(entry.get("at") or "").upper().startswith("AWAY")
            if is_away:
                left_score = entry.get("opp_score")
                right_score = entry.get("wel_score")
            else:
                left_score = entry.get("wel_score")
                right_score = entry.get("opp_score")
        else:
            if wel_home:
                left_score = entry["wel_score"]
                right_score = entry["opp_score"]
            else:
                left_score = entry["opp_score"]
                right_score = entry["wel_score"]
        l_h, l_t, l_o = _score_chars_3(left_score)
        r_h, r_t, r_o = _score_chars_3(right_score)

    _set_digit_segments(wel_huns, l_h)
    _set_digit_segments(wel_tens, l_t)
    _set_digit_segments(wel_ones, l_o)
    _set_digit_segments(opp_huns, r_h)
    _set_digit_segments(opp_tens, r_t)
    _set_digit_segments(opp_ones, r_o)


def build_dev_entry(now_local):
    if DEV_CYCLE_ALL_TEAMS:
        idx = 0
    elif DEV_TEAM_INDEX < 0:
        idx = random.randrange(len(DEV_TEAMS))
    else:
        idx = DEV_TEAM_INDEX % len(DEV_TEAMS)

    wel_score = random.randint(DEV_SCORE_MIN, DEV_SCORE_MAX)
    opp_score = random.randint(DEV_SCORE_MIN, DEV_SCORE_MAX)
    if wel_score == opp_score:
        if wel_score < DEV_SCORE_MAX:
            wel_score += 1
        elif opp_score > DEV_SCORE_MIN:
            opp_score -= 1

    return {
        "month_abbr": MONTHS[now_local.tm_mon - 1],
        "month": now_local.tm_mon,
        "day": now_local.tm_mday,
        "hour": now_local.tm_hour,
        "min": now_local.tm_min,
        "at": "Home",
        "opponent": DEV_TEAMS[idx],
        "status": "LIVE*",
        "result": None,
        "wel_score": wel_score,
        "opp_score": opp_score,
    }


def randomize_dev_scores(entry):
    wel_score = random.randint(DEV_SCORE_MIN, DEV_SCORE_MAX)
    opp_score = random.randint(DEV_SCORE_MIN, DEV_SCORE_MAX)
    if wel_score == opp_score:
        if wel_score < DEV_SCORE_MAX:
            wel_score += 1
        elif opp_score > DEV_SCORE_MIN:
            opp_score -= 1
    entry["wel_score"] = wel_score
    entry["opp_score"] = opp_score


# -----------------------
# Main loop
# -----------------------
wtd = setup_watchdog()
UNKNOWN_TEAM_SET = load_unknown_team_set()

state_cache = load_state_cache()
cached_entries = state_cache.get("entries", []) if isinstance(state_cache.get("entries", []), list) else []
active_schedule_id = WELLESLEY_SCHEDULE_ID or state_cache.get("schedule_id") or DEFAULT_SCHEDULE_ID
last_schedule_id_refresh = -999999
boot_marker = read_and_clear_reset_marker()

try:
    boot_reset_reason = str(microcontroller.cpu.reset_reason)
except Exception:
    boot_reset_reason = "UNKNOWN"

if cached_entries:
    print("Loaded cached entries:", len(cached_entries))
    log_event("loaded cached entries " + str(len(cached_entries)))
if active_schedule_id:
    print("Initial schedule id:", active_schedule_id)
    log_event("initial schedule id " + str(active_schedule_id))
print("SAFE_DEPLOY_MODE:", SAFE_DEPLOY_MODE)
print("DEV_MODE:", DEV_MODE, "DIAGNOSTICS:", DIAGNOSTICS_MODE_ENABLED)
print("Boot reset reason:", boot_reset_reason)
log_event("boot reason " + str(boot_reset_reason))
if boot_marker:
    print("Last reset marker:", boot_marker)
    log_event("boot marker " + str(boot_marker))

last_ntp_sync = -999999
next_ntp_attempt = -999999
ntp_retry_seconds = NTP_RETRY_MIN_SECONDS
last_valid_utc = None
last_valid_utc_mono = 0

next_schedule_poll = -999999
schedule_retry_seconds = SCHEDULE_POLL_SECONDS

last_control_poll = -999999
active_control = None
last_score_poll = -999999
score_poll_seconds = REMOTE_SCORE_POLL_ACTIVE_SECONDS
current_remote_entry = None

dev_entry = None
dev_team_idx = 0
last_dev_team_cycle = -999999
last_dev_score_update = -999999
consecutive_errors = 0
boot_monotonic = time.monotonic()
last_diag_start = -999999
diag_until = -1

if ("WATCHDOG" in boot_reset_reason.upper()) or (boot_marker in ("ERROR_RESET", "WATCHDOG_RESET")):
    left_bg.fill = 0x220000
    right_bg.fill = 0x220000
    team_lbl.hidden = True
    wel_logo.hidden = False
    opp_lbl.text = "WDT"
    _set_digit_segments(wel_huns, "-")
    _set_digit_segments(wel_tens, "-")
    _set_digit_segments(wel_ones, "-")
    _set_digit_segments(opp_huns, "-")
    _set_digit_segments(opp_tens, "-")
    _set_digit_segments(opp_ones, "-")
    time.sleep(BOOT_BANNER_SECONDS)

while True:
    try:
        if wtd:
            wtd.feed()

        mode = "ERR"
        entry = None

        loop_mono = time.monotonic()

        if DEV_MODE:
            # DEV mode runs fully offline to avoid reboot loops while iterating UI.
            sim_epoch = 1735689600 + int(time.monotonic())  # fixed base + uptime seconds
            now_local = time.localtime(sim_epoch)

            if dev_entry is None:
                dev_entry = build_dev_entry(now_local)
                print("DEV opponent:", dev_entry["opponent"])
                print("DEV score WEL-OPP:", dev_entry["wel_score"], "-", dev_entry["opp_score"])

            mono = loop_mono

            if DEV_CYCLE_ALL_TEAMS and (mono - last_dev_team_cycle) >= DEV_TEAM_CYCLE_SECONDS:
                dev_team_idx = (dev_team_idx + 1) % len(DEV_TEAMS)
                dev_entry["opponent"] = DEV_TEAMS[dev_team_idx]
                randomize_dev_scores(dev_entry)
                last_dev_team_cycle = mono
                last_dev_score_update = mono
                print("DEV opponent:", dev_entry["opponent"])
                print("DEV score WEL-OPP:", dev_entry["wel_score"], "-", dev_entry["opp_score"])
            elif (mono - last_dev_score_update) >= DEV_SCORE_UPDATE_SECONDS:
                randomize_dev_scores(dev_entry)
                last_dev_score_update = mono

            # keep date stamp current while preserving random team/score
            dev_entry["month_abbr"] = MONTHS[now_local.tm_mon - 1]
            dev_entry["month"] = now_local.tm_mon
            dev_entry["day"] = now_local.tm_mday
            dev_entry["hour"] = now_local.tm_hour
            dev_entry["min"] = now_local.tm_min

            mode = "DEV"
            entry = dev_entry
        else:
            mono = time.monotonic()

            # WiFi connect
            if not esp.is_connected:
                try:
                    connect_wifi_with_fallback()
                except Exception as wifi_e:
                    print("WiFi connect failed (all profiles):", repr(wifi_e))
                    log_event("wifi all profiles failed")
                    set_wifi_error_screen()
                    time.sleep(2)
                    continue

            # Auto-discover active schedule id (unless manually pinned via env var)
            if (not WELLESLEY_SCHEDULE_ID) and ((time.monotonic() - last_schedule_id_refresh) > SCHEDULE_ID_REFRESH_SECONDS):
                sid = discover_schedule_id()
                if sid:
                    if sid != active_schedule_id:
                        print("Schedule id updated:", active_schedule_id, "->", sid)
                        log_event("schedule id updated " + str(active_schedule_id) + "->" + str(sid))
                    active_schedule_id = sid
                last_schedule_id_refresh = time.monotonic()

            # NTP sync (with retry backoff)
            now_utc = int(time.time())
            if now_utc >= 1700000000:
                last_valid_utc = now_utc
                last_valid_utc_mono = mono

            need_ntp = (now_utc < 1700000000) or ((mono - last_ntp_sync) > NTP_RESYNC_SECONDS)
            if need_ntp and mono >= next_ntp_attempt:
                try:
                    dt = ntp.datetime  # UTC
                    the_rtc.datetime = dt
                    last_ntp_sync = mono
                    next_ntp_attempt = mono + NTP_RESYNC_SECONDS
                    ntp_retry_seconds = NTP_RETRY_MIN_SECONDS
                    print("NTP sync OK:", dt)
                    log_event("ntp sync ok")
                    now_utc = int(time.time())
                    if now_utc >= 1700000000:
                        last_valid_utc = now_utc
                        last_valid_utc_mono = mono
                except Exception as e:
                    print("NTP sync failed:", repr(e))
                    log_event("ntp sync failed")
                    next_ntp_attempt = mono + ntp_retry_seconds
                    ntp_retry_seconds = min(ntp_retry_seconds * 2, NTP_RETRY_MAX_SECONDS)

            utc_epoch = int(time.time())
            if utc_epoch < 1700000000 and last_valid_utc is not None:
                # Use monotonic-estimated UTC until next successful NTP sync.
                utc_epoch = last_valid_utc + int(mono - last_valid_utc_mono)
            offset = central_offset_hours(utc_epoch)
            now_local = time.localtime(utc_epoch + offset * 3600)

            if REMOTE_CONTROL_ENABLED and CONTROL_BASE_URL:
                if mono - last_control_poll >= CONTROL_POLL_SECONDS:
                    new_control = get_remote_control()
                    last_control_poll = mono
                    if new_control is not None:
                        if _is_control_changed(active_control, new_control):
                            active_control = new_control
                            last_score_poll = -999999
                            score_poll_seconds = REMOTE_SCORE_POLL_ACTIVE_SECONDS
                            log_event("remote control changed")
                        else:
                            active_control = new_control

                if active_control is not None and (mono - last_score_poll) >= score_poll_seconds:
                    raw_payload = fetch_remote_score_for_control(active_control)
                    last_score_poll = mono
                    mapped = map_remote_payload_to_entry(raw_payload)

                    if mapped is None:
                        mode = "ERR"
                        entry = None
                    elif mapped.get("view_unavailable"):
                        current_remote_entry = mapped
                        mode = "UNAVAILABLE"
                        entry = mapped
                        score_poll_seconds = REMOTE_SCORE_POLL_IDLE_SECONDS
                    elif mapped.get("countdown_active"):
                        current_remote_entry = mapped
                        mode = "TIMER"
                        entry = mapped
                        score_poll_seconds = REMOTE_SCORE_POLL_IDLE_SECONDS
                    else:
                        current_remote_entry = mapped
                        status = str(mapped.get("status") or "").upper()
                        if status in ("LIVE", "FINAL", "SCORE") and mapped.get("wel_score") is not None and mapped.get("opp_score") is not None:
                            mode = "SCORE"
                        elif status in ("SCHEDULED", "NONE"):
                            mode = "TIMER" if mapped.get("countdown_active") else "UNAVAILABLE"
                        else:
                            mode = "UNAVAILABLE"
                        entry = mapped
                        if mode == "SCORE" and status == "LIVE":
                            score_poll_seconds = REMOTE_SCORE_POLL_ACTIVE_SECONDS
                        elif mode == "SCORE" and status == "FINAL":
                            score_poll_seconds = REMOTE_SCORE_POLL_IDLE_SECONDS
                        else:
                            score_poll_seconds = REMOTE_SCORE_POLL_IDLE_SECONDS

                if current_remote_entry is not None and entry is None:
                    entry = current_remote_entry
                    mode = "TIMER" if entry.get("countdown_active") else "SCORE"
            else:
                # Legacy local pipeline fallback.
                if mono >= next_schedule_poll or not cached_entries:
                    try:
                        if wtd:
                            wtd.feed()
                        r = requests.get(_schedule_txt_url(active_schedule_id), timeout=10)
                        text = r.text
                        r.close()

                        parsed = parse_schedule_txt(text)
                        if parsed:
                            cached_entries = parsed
                            save_state_cache(active_schedule_id, cached_entries)
                            schedule_retry_seconds = SCHEDULE_POLL_SECONDS
                        else:
                            schedule_retry_seconds = min(schedule_retry_seconds * 2, SCHEDULE_RETRY_MAX_SECONDS)
                    except Exception:
                        schedule_retry_seconds = min(schedule_retry_seconds * 2, SCHEDULE_RETRY_MAX_SECONDS)
                    next_schedule_poll = mono + schedule_retry_seconds

                mode, entry = pick_current_or_next(cached_entries, now_local)

        if DIAGNOSTICS_MODE_ENABLED and (loop_mono - last_diag_start) >= DIAGNOSTICS_INTERVAL_SECONDS:
            last_diag_start = loop_mono
            diag_until = loop_mono + DIAGNOSTICS_DURATION_SECONDS

        if loop_mono < diag_until:
            show_diagnostics_screen(
                uptime_s=(loop_mono - boot_monotonic),
                schedule_id=active_schedule_id,
                cache_count=len(cached_entries),
                boot_reason=(boot_marker or boot_reset_reason),
                wifi_connected=bool(esp.is_connected),
            )
        else:
            if mode == "ERR":
                set_wifi_error_screen()
            elif mode == "UNAVAILABLE":
                set_view_unavailable_screen(entry.get("message") if entry else "VIEW UNAVAILIBLE")
            elif mode == "TIMER":
                set_remote_timer_screen(entry)
            elif (not DEV_MODE) and (mode not in ("LIVE", "SCORE", "FINAL", "DEV")):
                set_go_blue_screen()
            else:
                set_scoreboard(entry)

        consecutive_errors = 0

        if wtd:
            wtd.feed()

        time.sleep(1)

    except Exception as e:
        consecutive_errors += 1
        print("Main loop error:", repr(e))
        print("Consecutive errors:", consecutive_errors)
        log_event("main loop error count=" + str(consecutive_errors))
        set_safe_mode_screen("ERR")
        try:
            if not DEV_MODE:
                active_wifi_manager.reset()
        except Exception:
            pass

        if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
            print("Too many errors, resetting board...")
            log_event("error threshold reset")
            write_reset_marker("ERROR_RESET")
            time.sleep(1)
            microcontroller.reset()

        time.sleep(3)
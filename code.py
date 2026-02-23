"""MatrixPortal M4 clock/score (ultra-minimal, very low power)

Version: 2026.02.22.17

- Shows 12-hour time in clock mode.
- Shows score (as text) in scoreboard mode.
- Keeps brightness capped low to reduce brownouts.
"""

import os
import time
import gc

import board
import displayio
import terminalio
from adafruit_display_text.label import Label
import rtc


def env(name, default=""):
    try:
        v = os.getenv(name)
    except Exception:
        v = None
    return default if v is None else str(v)


def env_int(name, default):
    try:
        return int(env(name, str(default)).strip())
    except Exception:
        return int(default)


def env_float(name, default):
    try:
        return float(env(name, str(default)).strip())
    except Exception:
        return float(default)


CONTROL_BASE_URL = env("CONTROL_BASE_URL", "").strip().rstrip("/")
CONTROL_DEVICE_ID = env("CONTROL_DEVICE_ID", "matrix-01").strip()
CONTROL_API_TOKEN = env("CONTROL_API_TOKEN", "").strip()

WIFI_SSID = env("WIFI_SSID", "").strip()
WIFI_PASSWORD = env("WIFI_PASSWORD", "").strip()

DISPLAY_MODE = env("DISPLAY_MODE", "auto").strip().lower()  # auto|clock
CLOCK_TZ = env("CLOCK_TZ", "ct").strip().lower()  # utc|et|ct|mt|pt

CONTROL_POLL = env_int("CONTROL_POLL_SECONDS", 15)
SCORE_POLL = env_int("REMOTE_SCORE_POLL_ACTIVE_SECONDS", 10)

# Sync the board's RTC from the Worker via HTTP Date header.
# If your RTC isn't set, time.time() will be wrong and the clock will drift from a fake base.
TIME_SYNC_INTERVAL_SECONDS = env_int("TIME_SYNC_INTERVAL_SECONDS", 6 * 60 * 60)
TIME_SYNC_PATH = env("TIME_SYNC_PATH", "/__version").strip() or "/__version"

BOOT_BRIGHTNESS = env_float("BOOT_BRIGHTNESS", 0.01)
DISPLAY_BRIGHTNESS = env_float("DISPLAY_BRIGHTNESS", 0.02)
MAX_BRIGHTNESS = env_float("MAX_BRIGHTNESS", 0.03)


def headers():
    h = {"Accept": "application/json"}
    if CONTROL_API_TOKEN:
        h["Authorization"] = "Bearer " + CONTROL_API_TOKEN
    return h


def tz_offset_seconds(tz):
    t = (tz or "ct").strip().lower()
    if t == "utc":
        return 0
    if t == "et":
        return -5 * 3600
    if t == "ct":
        return -6 * 3600
    if t == "mt":
        return -7 * 3600
    if t == "pt":
        return -8 * 3600
    return -6 * 3600


def clamp_brightness(v):
    try:
        v = float(v)
    except Exception:
        v = DISPLAY_BRIGHTNESS
    if v < 0:
        v = 0
    if v > float(MAX_BRIGHTNESS):
        v = float(MAX_BRIGHTNESS)
    return v


mp = None

# Prefer the built-in display object when present (fewer moving parts).
try:
    display = board.DISPLAY
except Exception:
    display = None

if display is None:
    # Fall back to MatrixPortal helper.
    from adafruit_matrixportal.matrixportal import MatrixPortal
    mp = MatrixPortal(status_neopixel=getattr(board, "NEOPIXEL", None), use_wifi=False, debug=False)
    display = mp.display

    try:
        if getattr(mp, "status_neopixel", None):
            mp.status_neopixel.brightness = 0
            mp.status_neopixel.fill(0)
    except Exception:
        pass

display.brightness = clamp_brightness(BOOT_BRIGHTNESS)
W, H = display.width, display.height

try:
    display.auto_refresh = False
except Exception:
    pass

root = displayio.Group()
display.root_group = root

time_lbl = Label(terminalio.FONT, text="--:--", color=0xFFFFFF)
score_lbl = Label(terminalio.FONT, text="--", color=0xFFFFFF)
home_lbl = Label(terminalio.FONT, text="", color=0xFFFFFF)
away_lbl = Label(terminalio.FONT, text="", color=0xFFFFFF)
root.append(time_lbl)
root.append(score_lbl)
root.append(home_lbl)
root.append(away_lbl)


def _center(lbl, text, y):
    s = str(text or "")
    lbl.text = s
    # terminalio is ~6px wide; keep it simple.
    lbl.x = max(0, (W - (len(s) * 6)) // 2)
    lbl.y = y


def _refresh():
    try:
        display.refresh(minimum_frames_per_second=0)
    except Exception:
        pass


def _hex_to_rgb_int(v, default=0xFFFFFF):
    s = str(v or "").strip().upper()
    if s.startswith("#"):
        s = s[1:]
    if len(s) != 6:
        return int(default)
    try:
        return int(s, 16) & 0xFFFFFF
    except Exception:
        return int(default)


def _clamp_dark_to_white(rgb_int, min_luma=0.12):
    try:
        v = int(rgb_int) & 0xFFFFFF
    except Exception:
        return 0xFFFFFF

    r = (v >> 16) & 0xFF
    g = (v >> 8) & 0xFF
    b = v & 0xFF
    luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
    if luma < float(min_luma):
        return 0xFFFFFF
    return v


def _abbr3(v, default=""):
    s = str(v or "").strip().upper()
    if not s:
        return default
    # Keep alnum only so "New York" -> "NEWYORK".
    out = ""
    for c in s:
        if ("A" <= c <= "Z") or ("0" <= c <= "9"):
            out += c
            if len(out) >= 3:
                break
    if not out:
        return default
    if len(out) >= 3:
        return out
    return (out + "XXX")[:3]


def _set_top_labels(score_obj):
    # Show home team (top-left) and away team (top-right).
    # Uses 'at' to determine whether the selected team is home or away.
    team_abbr = _abbr3(
        (score_obj or {}).get("team_abbr")
        or (score_obj or {}).get("abbr")
        or (score_obj or {}).get("team")
        or "",
        default="",
    )
    opp_abbr = _abbr3(
        (score_obj or {}).get("opponent_abbr")
        or (score_obj or {}).get("opp_abbr")
        or (score_obj or {}).get("opponent")
        or "",
        default="",
    )
    at = str((score_obj or {}).get("at") or "").strip().lower()

    team_col = _clamp_dark_to_white(_hex_to_rgb_int((score_obj or {}).get("team_primary")))
    opp_col = _clamp_dark_to_white(_hex_to_rgb_int((score_obj or {}).get("opp_primary")))

    if at == "away":
        home_text, away_text = opp_abbr, team_abbr
        home_col, away_col = opp_col, team_col
    else:
        # "home" or "neutral" (default: team left, opponent right)
        home_text, away_text = team_abbr, opp_abbr
        home_col, away_col = team_col, opp_col

    home_lbl.text = home_text or ""
    away_lbl.text = away_text or ""
    home_lbl.color = home_col
    away_lbl.color = away_col

    # Position in corners. terminalio ~6px wide.
    home_lbl.x = 0
    # Label.y is the font baseline; keep >=7 so text doesn't render off-screen.
    home_lbl.y = 7
    away_lbl.x = max(0, W - (len(away_lbl.text) * 6))
    away_lbl.y = 7


# ---- WiFi + HTTP (minimal) ----
requests = None
esp = None
wifi = None
last_net_init_attempt = -999.0
NET_INIT_COOLDOWN_SECONDS = 10


def net_init():
    global requests, esp, wifi
    # requests=False means permanently disabled (missing/incompatible libs).
    if requests is False:
        return
    # If already initialized, don't re-init.
    if requests is not None:
        return

    try:
        import busio
        from digitalio import DigitalInOut
        from adafruit_esp32spi import adafruit_esp32spi as _esp32spi
        from adafruit_esp32spi.adafruit_esp32spi_wifimanager import WiFiManager as _WiFiManager
        import adafruit_connection_manager as _acm
        import adafruit_requests as _areq
    except Exception:
        # If libraries are missing or incompatible, avoid crashing; disable Wi-Fi permanently.
        esp = None
        wifi = None
        requests = False
        return

    try:
        esp32_cs = DigitalInOut(board.ESP_CS)
        esp32_ready = DigitalInOut(board.ESP_BUSY)
        esp32_reset = DigitalInOut(board.ESP_RESET)

        # Prefer ESP-specific SPI pins when present (MatrixPortal), otherwise fall back.
        sck = getattr(board, "ESP_SCK", getattr(board, "SCK1", board.SCK))
        mosi = getattr(board, "ESP_MOSI", getattr(board, "MOSI1", board.MOSI))
        miso = getattr(board, "ESP_MISO", getattr(board, "MISO1", board.MISO))
        spi = busio.SPI(sck, mosi, miso)

        esp = _esp32spi.ESP_SPIcontrol(spi, esp32_cs, esp32_ready, esp32_reset)
        wifi = _WiFiManager(esp, WIFI_SSID or "", WIFI_PASSWORD or "")
        pool = _acm.get_radio_socketpool(esp)
        ssl = _acm.get_radio_ssl_context(esp)
        requests = _areq.Session(pool, ssl)
    except Exception:
        # Transient init failure: keep requests=None so we can retry later.
        esp = None
        wifi = None
        requests = None
        return


def net_connect():
    if not (esp and wifi):
        return False
    if esp.is_connected:
        return True
    try:
        wifi.connect()
        return True
    except Exception:
        return False


def get_json(path, timeout=4):
    if not (CONTROL_BASE_URL and requests and esp and esp.is_connected):
        return None
    try:
        r = requests.get(CONTROL_BASE_URL + path, headers=headers(), timeout=timeout)
        try:
            if r.status_code != 200:
                return None
            return r.json()
        finally:
            r.close()
    except Exception:
        return None


_MONTHS = {
    "JAN": 1,
    "FEB": 2,
    "MAR": 3,
    "APR": 4,
    "MAY": 5,
    "JUN": 6,
    "JUL": 7,
    "AUG": 8,
    "SEP": 9,
    "OCT": 10,
    "NOV": 11,
    "DEC": 12,
}


def _header_get(headers_obj, key):
    if not headers_obj:
        return None
    try:
        v = headers_obj.get(key)
        if v:
            return v
    except Exception:
        pass
    k2 = str(key or "").lower()
    try:
        for k in headers_obj:
            if str(k).lower() == k2:
                return headers_obj[k]
    except Exception:
        pass
    return None


def parse_http_date(date_value):
    # Example: "Mon, 23 Feb 2026 02:41:32 GMT"
    s = str(date_value or "").strip()
    if not s:
        return None
    try:
        if "," in s:
            s = s.split(",", 1)[1].strip()
        parts = s.split()
        # day month year hh:mm:ss tz
        if len(parts) < 5:
            return None
        day = int(parts[0])
        mon = _MONTHS.get(parts[1].strip().upper())
        year = int(parts[2])
        hms = parts[3].split(":")
        hh = int(hms[0])
        mm = int(hms[1])
        ss = int(hms[2])
        if not mon:
            return None
        # struct_time: (year, month, mday, hour, minute, second, wday, yday, isdst)
        return time.struct_time((year, mon, day, hh, mm, ss, -1, -1, -1))
    except Exception:
        return None


def sync_rtc_from_worker(timeout=4):
    # Returns True if RTC was set.
    if not (CONTROL_BASE_URL and requests and esp and getattr(esp, "is_connected", False)):
        return False
    try:
        r = requests.get(CONTROL_BASE_URL + TIME_SYNC_PATH, headers={"Accept": "application/json"}, timeout=timeout)
        try:
            date_hdr = _header_get(getattr(r, "headers", None), "Date")
            st = parse_http_date(date_hdr)
            if not st:
                return False
            rtc.RTC().datetime = st
            return True
        finally:
            try:
                r.close()
            except Exception:
                pass
    except Exception:
        return False


# ---- Main loop ----
control = {"mode": "auto", "tz": CLOCK_TZ, "brightness": DISPLAY_BRIGHTNESS}
score = {}

last_control = -999
last_score = -999
last_wifi = -999
last_time_sync = -999

last_time_text = ""
last_score_text = ""
last_top_key = ""


def format_countdown_dhm(total_seconds):
    try:
        s = int(total_seconds)
    except Exception:
        return ""
    if s < 0:
        s = 0
    days = s // 86400
    hours = (s % 86400) // 3600
    mins = (s % 3600) // 60
    if days > 0:
        return f"{days}d {hours:02d}:{mins:02d}"
    return f"{hours}:{mins:02d}"

while True:
    mono = time.monotonic()

    # gentle GC
    if int(mono) % 30 == 0:
        try:
            gc.collect()
        except Exception:
            pass

    # init/connect wifi lazily (with cooldown so we don't thrash)
    if WIFI_SSID and CONTROL_BASE_URL:
        if requests is None and (mono - last_net_init_attempt) > NET_INIT_COOLDOWN_SECONDS:
            last_net_init_attempt = mono
            try:
                net_init()
            except Exception:
                pass
        if bool(esp) and (not getattr(esp, "is_connected", False)) and (mono - last_wifi) > 20:
            last_wifi = mono
            net_connect()

    connected = bool(esp) and bool(getattr(esp, "is_connected", False))

    # If RTC isn't set yet (or periodically), sync from Worker Date header.
    try:
        rtc_is_set = int(time.time()) > 1700000000
    except Exception:
        rtc_is_set = False
    if connected and ((not rtc_is_set) or (mono - last_time_sync) >= TIME_SYNC_INTERVAL_SECONDS):
        if sync_rtc_from_worker(timeout=4):
            last_time_sync = mono

    # brightness: very low cap + slow ramp
    want_b = clamp_brightness(control.get("brightness", DISPLAY_BRIGHTNESS))
    if not connected:
        want_b = min(want_b, 0.03)
    try:
        cur = float(display.brightness)
    except Exception:
        cur = BOOT_BRIGHTNESS
    if want_b > cur:
        want_b = min(want_b, cur + 0.005)
    if abs(cur - want_b) > 0.001:
        try:
            display.brightness = want_b
        except Exception:
            pass

    # poll control (slow)
    if connected and (mono - last_control) >= CONTROL_POLL:
        c = get_json("/control?device_id=" + CONTROL_DEVICE_ID, timeout=3)
        if isinstance(c, dict):
            control = c
        last_control = mono

    mode = str(control.get("mode") or "auto").strip().lower()
    if connected and DISPLAY_MODE != "clock" and mode != "idle" and (mono - last_score) >= SCORE_POLL:
        s = get_json("/score?device_id=" + CONTROL_DEVICE_ID, timeout=4)
        if isinstance(s, dict):
            score = s
        last_score = mono

    # local time
    utc_epoch = int(time.time())
    if utc_epoch < 1700000000:
        # RTC isn't set and network sync failed; fall back to a deterministic placeholder.
        utc_epoch = 1735689600 + int(mono)
    tz = str(control.get("tz") or CLOCK_TZ).strip().lower() or CLOCK_TZ
    now = time.localtime(utc_epoch + tz_offset_seconds(tz))

    # render (text only)
    if DISPLAY_MODE == "clock" or mode == "idle":
        hh = int(now.tm_hour)
        mm = int(now.tm_min)
        ap = "PM" if hh >= 12 else "AM"
        h12 = hh % 12
        h12 = 12 if h12 == 0 else h12
        t = f"{h12}:{mm:02d} {ap}"
        if t != last_time_text:
            _center(time_lbl, t, H // 2)
            last_time_text = t
        time_lbl.hidden = False
        score_lbl.hidden = True
        home_lbl.hidden = True
        away_lbl.hidden = True
    else:
        home_lbl.hidden = False
        away_lbl.hidden = False

        # Update top labels when team/opponent/at/colors change.
        # Keep this cheap; it runs every loop.
        top_key = (
            str(score.get("team_abbr") or score.get("team") or "")
            + "|" + str(score.get("opponent_abbr") or score.get("opponent") or "")
            + "|" + str(score.get("at") or "")
            + "|" + str(score.get("team_primary") or "")
            + "|" + str(score.get("opp_primary") or "")
        )
        if top_key != last_top_key:
            _set_top_labels(score)
            last_top_key = top_key

        # Timer view support: Worker sends countdown_* fields with null scores.
        if not connected:
            s = "NO WIFI"
        elif bool(score.get("countdown_active")) and score.get("countdown_seconds") is not None:
            s = format_countdown_dhm(score.get("countdown_seconds")) or "--:--"
        else:
            a = score.get("team_score")
            b = score.get("opp_score")
            if a is None or b is None:
                s = "..."
            elif bool(score.get("view_unavailable")):
                s = "NOT ON"
            else:
                s = f"{int(a)}-{int(b)}"
        if s != last_score_text:
            _center(score_lbl, s, H // 2)
            last_score_text = s
        score_lbl.hidden = False
        time_lbl.hidden = True

    _refresh()
    time.sleep(1)
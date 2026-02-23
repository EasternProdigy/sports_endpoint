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
import busio
import displayio
import terminalio

from digitalio import DigitalInOut
from adafruit_display_text.label import Label
from adafruit_matrixportal.matrixportal import MatrixPortal

from adafruit_esp32spi import adafruit_esp32spi
from adafruit_esp32spi.adafruit_esp32spi_wifimanager import WiFiManager
import adafruit_connection_manager
import adafruit_requests


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

BOOT_BRIGHTNESS = env_float("BOOT_BRIGHTNESS", 0.01)
DISPLAY_BRIGHTNESS = env_float("DISPLAY_BRIGHTNESS", 0.03)
MAX_BRIGHTNESS = env_float("MAX_BRIGHTNESS", 0.05)


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


mp = MatrixPortal(status_neopixel=board.NEOPIXEL, use_wifi=False, debug=False)
display = mp.display

try:
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
root.append(time_lbl)
root.append(score_lbl)


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


# ---- WiFi + HTTP (minimal) ----
requests = None
esp = None
wifi = None


def net_init():
    global requests, esp, wifi
    if requests is not None:
        return
    esp32_cs = DigitalInOut(board.ESP_CS)
    esp32_ready = DigitalInOut(board.ESP_BUSY)
    esp32_reset = DigitalInOut(board.ESP_RESET)
    spi = busio.SPI(getattr(board, "SCK1", board.SCK), getattr(board, "MOSI1", board.MOSI), getattr(board, "MISO1", board.MISO))
    esp = adafruit_esp32spi.ESP_SPIcontrol(spi, esp32_cs, esp32_ready, esp32_reset)
    wifi = WiFiManager(esp, WIFI_SSID or "", WIFI_PASSWORD or "")
    pool = adafruit_connection_manager.get_radio_socketpool(esp)
    ssl = adafruit_connection_manager.get_radio_ssl_context(esp)
    requests = adafruit_requests.Session(pool, ssl)


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


# ---- Main loop ----
control = {"mode": "auto", "tz": CLOCK_TZ, "brightness": DISPLAY_BRIGHTNESS}
score = {}

last_control = -999
last_score = -999
last_wifi = -999

last_time_text = ""
last_score_text = ""

while True:
    mono = time.monotonic()

    # gentle GC
    if int(mono) % 30 == 0:
        try:
            gc.collect()
        except Exception:
            pass

    # init/connect wifi lazily
    if WIFI_SSID and CONTROL_BASE_URL:
        try:
            net_init()
        except Exception:
            pass
        if (esp is not None) and (not esp.is_connected) and (mono - last_wifi) > 20:
            last_wifi = mono
            net_connect()

    connected = (esp is not None) and getattr(esp, "is_connected", False)

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
    else:
        a = score.get("team_score")
        b = score.get("opp_score")
        if a is None or b is None or bool(score.get("view_unavailable")):
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
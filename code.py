# code.py — MatrixPortal M4 remote scoreboard + clock (memory-friendly)
# version: 2026.02.22.1

import os
import time
import rtc
import board
import busio
import displayio
import terminalio

from adafruit_display_shapes.rect import Rect
from adafruit_display_text.label import Label
from adafruit_matrixportal.matrixportal import MatrixPortal


def _env_get(name):
    try:
        return os.getenv(name)
    except Exception:
        return None


def _env_str(name, default=""):
    v = _env_get(name)
    if v is None:
        return default
    return str(v)


def _env_bool(name, default):
    v = _env_get(name)
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    if isinstance(v, int):
        return v != 0
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def _env_int(name, default):
    v = _env_get(name)
    if v is None:
        return default
    if isinstance(v, bool):
        return 1 if v else 0
    if isinstance(v, int):
        return v
    try:
        return int(str(v).strip())
    except ValueError:
        return default


def _two_digits(value):
    if value is None:
        return ("-", "-")
    s = str(int(value) % 100)
    if len(s) == 1:
        s = "0" + s
    return (s[0], s[1])


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


def _nth_sunday(year, month, n):
    # tm_wday: Mon=0 ... Sun=6
    wday_m1 = time.localtime(time.mktime((year, month, 1, 0, 0, 0, 0, 0, -1))).tm_wday
    first_sunday = 1 if wday_m1 == 6 else 1 + ((6 - wday_m1) % 7)
    return first_sunday + 7 * (n - 1)


def _us_is_dst(utc_epoch, std_offset_hours):
    # US DST rules: 2nd Sunday in March, 1st Sunday in Nov
    y = time.localtime(utc_epoch).tm_year
    start_day = _nth_sunday(y, 3, 2)
    end_day = _nth_sunday(y, 11, 1)

    # DST starts 02:00 local STANDARD time
    dst_start_utc = time.mktime((y, 3, start_day, 2 - std_offset_hours, 0, 0, 0, 0, -1))
    # DST ends 02:00 local DAYLIGHT time
    dst_end_utc = time.mktime((y, 11, end_day, 2 - (std_offset_hours + 1), 0, 0, 0, 0, -1))
    return dst_start_utc <= utc_epoch < dst_end_utc


def tz_offset_seconds(utc_epoch, tz):
    t = (tz or "").strip().lower()
    if t == "utc":
        return 0

    std = None
    if t == "et":
        std = -5
    elif t == "ct":
        std = -6
    elif t == "mt":
        std = -7
    elif t == "pt":
        std = -8

    if std is None:
        std = -6

    is_dst = _us_is_dst(utc_epoch, std)
    return int((std + (1 if is_dst else 0)) * 3600)


# -----------------------
# CONFIG (settings.toml)
# -----------------------
DISPLAY_MODE = (_env_str("DISPLAY_MODE", "auto")).strip().lower()  # auto|clock|scores

REMOTE_CONTROL_ENABLED = _env_bool("REMOTE_CONTROL_ENABLED", True)
CONTROL_BASE_URL = (_env_str("CONTROL_BASE_URL", "")).strip().rstrip("/")
CONTROL_DEVICE_ID = (_env_str("CONTROL_DEVICE_ID", "matrix-01")).strip()
CONTROL_API_TOKEN = (_env_str("CONTROL_API_TOKEN", "")).strip()

CONTROL_POLL_SECONDS = _env_int("CONTROL_POLL_SECONDS", 3)
REMOTE_SCORE_POLL_ACTIVE_SECONDS = _env_int("REMOTE_SCORE_POLL_ACTIVE_SECONDS", 3)
REMOTE_SCORE_POLL_IDLE_SECONDS = _env_int("REMOTE_SCORE_POLL_IDLE_SECONDS", 20)

# Clock timezone (can be overridden by remote control field `tz`)
# Values: utc|et|ct|mt|pt
CLOCK_TZ = (_env_str("CLOCK_TZ", "ct")).strip().lower()

NTP_ENABLED = _env_bool("NTP_ENABLED", True)
NTP_RESYNC_SECONDS = _env_int("NTP_RESYNC_SECONDS", 6 * 3600)

# WiFi profiles (TX first, NE fallback)
TEXAS_WIFI_SSID = (_env_str("TEXAS_WIFI_SSID", "")).strip()
TEXAS_WIFI_PASSWORD = (_env_str("TEXAS_WIFI_PASSWORD", "")).strip()
NORTHEAST_WIFI_SSID = (_env_str("NORTHEAST_WIFI_SSID", "")).strip()
NORTHEAST_WIFI_PASSWORD = (_env_str("NORTHEAST_WIFI_PASSWORD", "")).strip()

HAS_WIFI_CREDS = bool(
    (TEXAS_WIFI_SSID and TEXAS_WIFI_PASSWORD) or (NORTHEAST_WIFI_SSID and NORTHEAST_WIFI_PASSWORD)
)


# -----------------------
# Optional network stack
# -----------------------
NETWORK_READY = False
NETWORK_ERROR = ""
requests = None
ntp = None
esp = None
active_wifi = None

if HAS_WIFI_CREDS and CONTROL_BASE_URL:
    try:
        import adafruit_ntp
        import adafruit_requests
        import adafruit_connection_manager

        from digitalio import DigitalInOut
        from adafruit_esp32spi import adafruit_esp32spi
        from adafruit_esp32spi.adafruit_esp32spi_wifimanager import WiFiManager

        esp32_cs = DigitalInOut(board.ESP_CS)
        esp32_ready = DigitalInOut(board.ESP_BUSY)
        esp32_reset = DigitalInOut(board.ESP_RESET)

        if "SCK1" in dir(board):
            spi = busio.SPI(board.SCK1, board.MOSI1, board.MISO1)
        else:
            spi = busio.SPI(board.SCK, board.MOSI, board.MISO)

        esp = adafruit_esp32spi.ESP_SPIcontrol(spi, esp32_cs, esp32_ready, esp32_reset)

        wifi_tx = WiFiManager(esp, TEXAS_WIFI_SSID or "", TEXAS_WIFI_PASSWORD or "")
        wifi_ne = WiFiManager(esp, NORTHEAST_WIFI_SSID or "", NORTHEAST_WIFI_PASSWORD or "")

        pool = adafruit_connection_manager.get_radio_socketpool(esp)
        ssl_context = adafruit_connection_manager.get_radio_ssl_context(esp)
        requests = adafruit_requests.Session(pool, ssl_context)

        if NTP_ENABLED:
            ntp = adafruit_ntp.NTP(pool, tz_offset=0, cache_seconds=3600)

        active_wifi = ("TX", wifi_tx)
        NETWORK_READY = True
    except Exception as e:
        NETWORK_READY = False
        NETWORK_ERROR = repr(e)


# -----------------------
# Display setup
# -----------------------
WHITE = 0xFFFFFF
BLACK = 0x000000
WELLESLEY_BLUE = 0x0033AA

matrixportal = MatrixPortal(status_neopixel=board.NEOPIXEL, use_wifi=False, debug=False)
display = matrixportal.display
display.brightness = 0.22
W = display.width
H = display.height

root = displayio.Group()
display.root_group = root

left_bg = Rect(0, 0, W // 2, H, fill=WELLESLEY_BLUE)
right_bg = Rect(W // 2, 0, W - (W // 2), H, fill=0x202020)
root.append(left_bg)
root.append(right_bg)

top_lbl = Label(terminalio.FONT, text="BOOT", color=WHITE)
top_lbl.x = 2
top_lbl.y = 6
root.append(top_lbl)

mid_lbl = Label(terminalio.FONT, text="", color=WHITE)
mid_lbl.x = 2
mid_lbl.y = (H // 2) + 3
root.append(mid_lbl)


# 7-seg digits (6 digits, 3 left + 3 right)
SEG_W = 7
SEG_H = 16
SEG_T = 2
SEG_DIGIT_GAP = 1
SEG_SCORE_Y = 16 if H <= 32 else 20

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


def _set_segments_xy(segs, x, y):
    h2 = SEG_H // 2
    segs[0].x = x + SEG_T
    segs[0].y = y
    segs[1].x = x + SEG_W - SEG_T
    segs[1].y = y + SEG_T
    segs[2].x = x + SEG_W - SEG_T
    segs[2].y = y + h2
    segs[3].x = x + SEG_T
    segs[3].y = y + SEG_H - SEG_T
    segs[4].x = x
    segs[4].y = y + h2
    segs[5].x = x
    segs[5].y = y + SEG_T
    segs[6].x = x + SEG_T
    segs[6].y = y + h2 - (SEG_T // 2)


digits = [
    _make_digit_segments(0, SEG_SCORE_Y, WHITE),
    _make_digit_segments(0, SEG_SCORE_Y, WHITE),
    _make_digit_segments(0, SEG_SCORE_Y, WHITE),
    _make_digit_segments(0, SEG_SCORE_Y, WHITE),
    _make_digit_segments(0, SEG_SCORE_Y, WHITE),
    _make_digit_segments(0, SEG_SCORE_Y, WHITE),
]


def _place_digits():
    center_x = W // 2
    gap = 2
    block_w = (3 * SEG_W) + (2 * SEG_DIGIT_GAP)
    left_start = (center_x - gap) - block_w
    right_start = (center_x + gap)

    safe_y = max(0, min(SEG_SCORE_Y, max(0, H - SEG_H)))

    for i in range(3):
        _set_segments_xy(digits[i], left_start + i * (SEG_W + SEG_DIGIT_GAP), safe_y)
    for i in range(3):
        _set_segments_xy(digits[3 + i], right_start + i * (SEG_W + SEG_DIGIT_GAP), safe_y)


_place_digits()


def show_boot():
    top_lbl.text = "BOT"
    if NETWORK_ERROR:
        mid_lbl.text = "NET ERR"
    elif not HAS_WIFI_CREDS:
        mid_lbl.text = "NO WIFI"
    elif not CONTROL_BASE_URL:
        mid_lbl.text = "NO URL"
    else:
        mid_lbl.text = "BOOTING"
    left_bg.fill = 0x0033AA
    right_bg.fill = 0xAA3300
    for seg in digits:
        _set_digit_color(seg, WHITE)
    # show 88 88
    _set_digit_segments(digits[0], " ")
    _set_digit_segments(digits[1], "8")
    _set_digit_segments(digits[2], "8")
    _set_digit_segments(digits[3], " ")
    _set_digit_segments(digits[4], "8")
    _set_digit_segments(digits[5], "8")


def show_clock(now_local):
    top_lbl.text = "CLK"
    left_bg.fill = 0x101010
    right_bg.fill = 0x101010

    hh = now_local.tm_hour if now_local else None
    mm = now_local.tm_min if now_local else None
    ss = now_local.tm_sec if now_local else None
    h_t, h_o = _two_digits(hh)
    m_t, m_o = _two_digits(mm)

    for seg in digits:
        _set_digit_color(seg, WHITE)

    _set_digit_segments(digits[0], " ")
    _set_digit_segments(digits[1], h_t)
    _set_digit_segments(digits[2], h_o)
    _set_digit_segments(digits[3], " ")
    _set_digit_segments(digits[4], m_t)
    _set_digit_segments(digits[5], m_o)

    if ss is None:
        mid_lbl.text = "--:--"
    else:
        colon = ":" if (int(ss) % 2 == 0) else " "
        mid_lbl.text = "{:02d}{}{:02d}  {:02d}".format(int(hh) % 24, colon, int(mm) % 60, int(ss) % 60)


def show_score(entry):
    # entry: mapped payload
    team_abbr = (entry.get("team_abbr") or "WEL")[:3]
    opp_abbr = (entry.get("opponent_abbr") or "OPP")[:3]
    top_lbl.text = team_abbr + "-" + opp_abbr

    left_fill = _hex_color_to_int(entry.get("team_primary"), WELLESLEY_BLUE)
    right_fill = _hex_color_to_int(entry.get("opp_primary"), 0x202020)
    left_bg.fill = left_fill
    right_bg.fill = right_fill

    team_color = _hex_color_to_int(entry.get("team_secondary"), WHITE)
    opp_color = _hex_color_to_int(entry.get("opp_secondary"), WHITE)

    # scores (0-999)
    l = entry.get("wel_score")
    r = entry.get("opp_score")
    if l is None or r is None:
        l_chars = ("-", "-", "-")
        r_chars = ("-", "-", "-")
    else:
        l = int(l) % 1000
        r = int(r) % 1000
        l_chars = (" " if l < 100 else str(l // 100), " " if l < 10 else str((l // 10) % 10), str(l % 10))
        r_chars = (" " if r < 100 else str(r // 100), " " if r < 10 else str((r // 10) % 10), str(r % 10))

    _set_digit_color(digits[0], team_color)
    _set_digit_color(digits[1], team_color)
    _set_digit_color(digits[2], team_color)
    _set_digit_color(digits[3], opp_color)
    _set_digit_color(digits[4], opp_color)
    _set_digit_color(digits[5], opp_color)

    _set_digit_segments(digits[0], l_chars[0])
    _set_digit_segments(digits[1], l_chars[1])
    _set_digit_segments(digits[2], l_chars[2])
    _set_digit_segments(digits[3], r_chars[0])
    _set_digit_segments(digits[4], r_chars[1])
    _set_digit_segments(digits[5], r_chars[2])

    msg = entry.get("display_text") or entry.get("status") or ""
    mid_lbl.text = str(msg)[:20]


def _remote_headers():
    h = {"Accept": "application/json"}
    if CONTROL_API_TOKEN:
        h["Authorization"] = "Bearer " + CONTROL_API_TOKEN
    return h


def _get_json(path, timeout=8):
    if (not NETWORK_READY) or (requests is None) or (esp is None) or (not esp.is_connected):
        return None
    try:
        r = requests.get(CONTROL_BASE_URL + path, headers=_remote_headers(), timeout=timeout)
        try:
            if r.status_code != 200:
                return None
            return r.json()
        finally:
            r.close()
    except Exception:
        return None


def _connect_wifi():
    global active_wifi
    if not NETWORK_READY or esp is None:
        return False

    profiles = [
        ("TX", TEXAS_WIFI_SSID, TEXAS_WIFI_PASSWORD),
        ("NE", NORTHEAST_WIFI_SSID, NORTHEAST_WIFI_PASSWORD),
    ]

    last_err = None
    for name, ssid, pwd in profiles:
        if not ssid or not pwd:
            continue
        try:
            if active_wifi and active_wifi[0] == name:
                mgr = active_wifi[1]
            else:
                mgr = active_wifi[1]  # placeholder; will be overwritten below
            # rebuild manager object reference based on name
            # (we stored TX manager in active_wifi initially; NE is reachable via attribute lookup)
            # simpler: just use connect on the stored manager in active_wifi for TX, else recreate.
            if name == "TX":
                mgr = active_wifi[1]
            else:
                # NE manager isn't stored; reconstruct cheaply
                from adafruit_esp32spi.adafruit_esp32spi_wifimanager import WiFiManager

                mgr = WiFiManager(esp, ssid, pwd)
            mgr.connect()
            active_wifi = (name, mgr)
            mid_lbl.text = "WIFI " + name
            return True
        except Exception as e:
            last_err = e

    mid_lbl.text = "WIFI FAIL"
    if last_err:
        print("WiFi connect failed:", repr(last_err))
    return False


def map_payload(payload):
    if not isinstance(payload, dict):
        return None
    if payload.get("view_unavailable"):
        return {"status": "NONE", "display_text": payload.get("display_text") or "UNAVAILABLE"}
    return {
        "status": payload.get("status") or "NONE",
        "display_text": payload.get("display_text") or payload.get("message"),
        "team_abbr": payload.get("team_abbr") or "WEL",
        "opponent_abbr": payload.get("opponent_abbr") or "OPP",
        "wel_score": payload.get("team_score"),
        "opp_score": payload.get("opp_score"),
        "team_primary": payload.get("team_primary"),
        "team_secondary": payload.get("team_secondary"),
        "opp_primary": payload.get("opp_primary"),
        "opp_secondary": payload.get("opp_secondary"),
    }


# -----------------------
# Main loop
# -----------------------
show_boot()
time.sleep(0.8)

the_rtc = rtc.RTC()
last_ntp = -999999
last_control = -999999
last_score = -999999
score_poll_s = REMOTE_SCORE_POLL_ACTIVE_SECONDS
control = None
entry = None

while True:
    mono = time.monotonic()

    # Ensure WiFi
    if NETWORK_READY and esp is not None and (not esp.is_connected):
        _connect_wifi()

    # NTP
    if NETWORK_READY and (esp is not None) and esp.is_connected and (ntp is not None) and (mono - last_ntp) > NTP_RESYNC_SECONDS:
        try:
            the_rtc.datetime = ntp.datetime
            last_ntp = mono
        except Exception as e:
            print("NTP failed:", repr(e))
            mid_lbl.text = "NTP FAIL"

    # local time: use RTC epoch if valid, else fake it from uptime
    utc_epoch = int(time.time())
    if utc_epoch < 1700000000:
        utc_epoch = 1735689600 + int(mono)  # 2025-01-01 + uptime seconds

    tz = CLOCK_TZ
    if isinstance(control, dict):
        tz = str(control.get("tz") or tz).strip().lower() or tz
    now_local = time.localtime(utc_epoch + tz_offset_seconds(utc_epoch, tz))

    if DISPLAY_MODE == "clock":
        show_clock(now_local)
        time.sleep(1)
        continue

    # Remote control polling
    if REMOTE_CONTROL_ENABLED and CONTROL_BASE_URL and NETWORK_READY and (esp is not None) and esp.is_connected and (mono - last_control) >= CONTROL_POLL_SECONDS:
        control = _get_json("/control?device_id=" + CONTROL_DEVICE_ID)
        last_control = mono
        if isinstance(control, dict) and str(control.get("mode") or "").lower() == "idle":
            score_poll_s = REMOTE_SCORE_POLL_IDLE_SECONDS
        else:
            score_poll_s = REMOTE_SCORE_POLL_ACTIVE_SECONDS

    # Score polling
    if REMOTE_CONTROL_ENABLED and CONTROL_BASE_URL and NETWORK_READY and (esp is not None) and esp.is_connected:
        if (mono - last_score) >= score_poll_s:
            payload = _get_json("/score?device_id=" + CONTROL_DEVICE_ID)
            last_score = mono
            entry = map_payload(payload)

    # Display selection
    if isinstance(control, dict) and str(control.get("mode") or "").lower() == "idle":
        show_clock(now_local)
    elif entry and entry.get("wel_score") is not None and entry.get("opp_score") is not None:
        show_score(entry)
    else:
        # No score data: clock fallback
        show_clock(now_local)

    time.sleep(1)

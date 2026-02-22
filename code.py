# code.py — MatrixPortal M4 remote scoreboard + clock (instant display + robust)
# version: 2026.02.22.13

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


# -----------------------
# Config (settings.toml)
# -----------------------


def _env(name, default=""):
    try:
        v = os.getenv(name)
    except Exception:
        v = None
    if v is None:
        return default
    return str(v)


def _env_bool(name, default):
    v = _env(name, None)
    if v is None:
        return default
    s = str(v).strip().lower()
    return s in ("1", "true", "yes", "on")


def _env_int(name, default):
    v = _env(name, None)
    if v is None:
        return default
    try:
        return int(str(v).strip())
    except Exception:
        return default


def _env_float(name, default):
    v = _env(name, None)
    if v is None:
        return default
    try:
        return float(str(v).strip())
    except Exception:
        return default


DISPLAY_MODE = _env("DISPLAY_MODE", "auto").strip().lower()  # auto|clock|scores

# Default brightness (can be overridden by /control brightness).
DISPLAY_BRIGHTNESS = _env_float("DISPLAY_BRIGHTNESS", 0.22)

REMOTE_CONTROL_ENABLED = _env_bool("REMOTE_CONTROL_ENABLED", True)
CONTROL_BASE_URL = _env("CONTROL_BASE_URL", "").strip().rstrip("/")
CONTROL_DEVICE_ID = _env("CONTROL_DEVICE_ID", "matrix-01").strip()
CONTROL_API_TOKEN = _env("CONTROL_API_TOKEN", "").strip()

CONTROL_POLL_SECONDS = _env_int("CONTROL_POLL_SECONDS", 3)
REMOTE_SCORE_POLL_ACTIVE_SECONDS = _env_int("REMOTE_SCORE_POLL_ACTIVE_SECONDS", 3)
REMOTE_SCORE_POLL_IDLE_SECONDS = _env_int("REMOTE_SCORE_POLL_IDLE_SECONDS", 20)

CLOCK_TZ = _env("CLOCK_TZ", "ct").strip().lower()  # utc|et|ct|mt|pt

NTP_ENABLED = _env_bool("NTP_ENABLED", True)
NTP_RESYNC_SECONDS = _env_int("NTP_RESYNC_SECONDS", 6 * 3600)

TEXAS_WIFI_SSID = _env("TEXAS_WIFI_SSID", "").strip()
TEXAS_WIFI_PASSWORD = _env("TEXAS_WIFI_PASSWORD", "").strip()
NORTHEAST_WIFI_SSID = _env("NORTHEAST_WIFI_SSID", "").strip()
NORTHEAST_WIFI_PASSWORD = _env("NORTHEAST_WIFI_PASSWORD", "").strip()

HAS_WIFI_CREDS = bool(
    (TEXAS_WIFI_SSID and TEXAS_WIFI_PASSWORD) or (NORTHEAST_WIFI_SSID and NORTHEAST_WIFI_PASSWORD)
)


# -----------------------
# Timezone / formatting
# -----------------------


def _nth_sunday(year, month, n):
    wday_m1 = time.localtime(time.mktime((year, month, 1, 0, 0, 0, 0, 0, -1))).tm_wday
    first_sunday = 1 if wday_m1 == 6 else 1 + ((6 - wday_m1) % 7)
    return first_sunday + 7 * (n - 1)


def _us_is_dst(utc_epoch, std_offset_hours):
    y = time.localtime(utc_epoch).tm_year
    start_day = _nth_sunday(y, 3, 2)
    end_day = _nth_sunday(y, 11, 1)
    dst_start_utc = time.mktime((y, 3, start_day, 2 - std_offset_hours, 0, 0, 0, 0, -1))
    dst_end_utc = time.mktime((y, 11, end_day, 2 - (std_offset_hours + 1), 0, 0, 0, 0, -1))
    return dst_start_utc <= utc_epoch < dst_end_utc


def tz_offset_seconds(utc_epoch, tz):
    t = (tz or "ct").strip().lower()
    if t == "utc":
        return 0
    std = -6
    if t == "et":
        std = -5
    elif t == "ct":
        std = -6
    elif t == "mt":
        std = -7
    elif t == "pt":
        std = -8
    return int((std + (1 if _us_is_dst(utc_epoch, std) else 0)) * 3600)


def _two(value):
    if value is None:
        return ("-", "-")
    s = str(int(value) % 100)
    if len(s) == 1:
        s = "0" + s
    return (s[0], s[1])


def _hex_to_int(v, fallback):
    if v is None:
        return fallback
    s = str(v).strip().upper()
    if s.startswith("#"):
        s = s[1:]
    if len(s) != 6:
        return fallback
    try:
        return int(s, 16)
    except Exception:
        return fallback


def _abbr_fallback(abbr, name, max_len=4):
    s = (abbr or "").strip().upper()
    if s:
        return s[:max_len]
    n = (name or "").strip().upper()
    if not n:
        return "TEAM"
    out = []
    for c in n:
        if ("A" <= c <= "Z") or ("0" <= c <= "9"):
            out.append(c)
            if len(out) >= max_len:
                return "".join(out)
    if out:
        return "".join(out)
    out = []
    for c in n:
        if c != " ":
            out.append(c)
            if len(out) >= max_len:
                break
    return ("".join(out)) or "TEAM"


# -----------------------
# Display
# -----------------------

WHITE = 0xFFFFFF
WELLESLEY_BLUE = 0x0033AA

matrixportal = MatrixPortal(status_neopixel=board.NEOPIXEL, use_wifi=False, debug=False)
display = matrixportal.display
try:
    b0 = float(DISPLAY_BRIGHTNESS)
    if b0 < 0.05:
        b0 = 0.05
    if b0 > 1:
        b0 = 1
    display.brightness = b0
except Exception:
    display.brightness = 0.22
W = display.width
H = display.height

root = displayio.Group()
display.root_group = root

# Manual refresh reduces visible flicker from intermediate draw states.
try:
    display.auto_refresh = False
except Exception:
    pass


def _refresh():
    try:
        display.refresh(minimum_frames_per_second=0)
    except Exception:
        pass

left_bg = Rect(0, 0, W // 2, H, fill=0x101010)
right_bg = Rect(W // 2, 0, W - (W // 2), H, fill=0x101010)
root.append(left_bg)
root.append(right_bg)

# White center divider (columns 32 and 33 on a 64px wide matrix).
divider1 = Rect(W // 2, 0, 1, H, fill=WHITE)
divider2 = Rect((W // 2) + 1, 0, 1, H, fill=WHITE)
root.append(divider1)
root.append(divider2)

top_left = Label(terminalio.FONT, text="", color=WHITE)
top_left.x = 2
top_left.y = 7
root.append(top_left)

top_right = Label(terminalio.FONT, text="", color=WHITE)
top_right.x = 2
top_right.y = 7
root.append(top_right)

msg_lbl = Label(terminalio.FONT, text="", color=WHITE)
msg_lbl.x = 2
msg_lbl.y = H // 2
msg_lbl.hidden = True
root.append(msg_lbl)

ampm_lbl = Label(terminalio.FONT, text="", color=WHITE)
ampm_lbl.x = 2
ampm_lbl.y = H // 2
ampm_lbl.hidden = True
root.append(ampm_lbl)

try:
    _BB = terminalio.FONT.get_bounding_box()
    CHAR_W = int(_BB[0]) + 1
    CHAR_H = int(_BB[1]) + 1
except Exception:
    CHAR_W = 6
    CHAR_H = 8


def _set_top_labels(left, right):
    left = (left or "").strip()
    right = (right or "").strip()
    top_left.text = left
    top_left.x = 2
    top_right.text = right
    top_right.x = max(2, W - 2 - (len(right) * CHAR_W))


def _center_message(text):
    s = (text or "").strip()
    if not s:
        msg_lbl.text = ""
        msg_lbl.hidden = True
        return
    msg_lbl.hidden = False
    msg_lbl.text = s
    lines = s.split("\n")
    max_len = 0
    for line in lines:
        if len(line) > max_len:
            max_len = len(line)
    msg_lbl.x = max(2, (W - (max_len * CHAR_W)) // 2)
    # Approximate vertical centering for multi-line text.
    line_gap = 1
    total_h = (len(lines) * CHAR_H) + (max(0, len(lines) - 1) * line_gap)
    msg_lbl.y = max(0, (H - total_h) // 2)


def _hide_message():
    msg_lbl.text = ""
    msg_lbl.hidden = True


def _hide_ampm():
    ampm_lbl.text = ""
    ampm_lbl.hidden = True


def _hide_digits():
    for segs in digits:
        for r in segs:
            r.hidden = True


def _show_all_digits():
    for segs in digits:
        for r in segs:
            r.hidden = False


def _control_team_abbr(ctrl):
    raw = ""
    if isinstance(ctrl, dict):
        raw = str(ctrl.get("team") or "")
    raw = raw.strip().upper()
    if not raw:
        return "TEAM"
    # Keep letters/digits only, up to 4.
    out = []
    for c in raw:
        if ("A" <= c <= "Z") or ("0" <= c <= "9"):
            out.append(c)
            if len(out) >= 4:
                break
    if out:
        return "".join(out)
    # Fallback: first 4 non-space chars
    out = []
    for c in raw:
        if c != " ":
            out.append(c)
            if len(out) >= 4:
                break
    return ("".join(out)) or "TEAM"


# 7-seg
SEG_W = 7
SEG_H = 16
SEG_T = 2
SEG_DIGIT_GAP = 1
SEG_Y = 16 if H <= 32 else 20

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


def _make_digit(x, y, color):
    h2 = SEG_H // 2
    segs = [
        Rect(x + SEG_T, y, SEG_W - 2 * SEG_T, SEG_T, fill=color),
        Rect(x + SEG_W - SEG_T, y + SEG_T, SEG_T, h2 - SEG_T, fill=color),
        Rect(x + SEG_W - SEG_T, y + h2, SEG_T, SEG_H - h2 - SEG_T, fill=color),
        Rect(x + SEG_T, y + SEG_H - SEG_T, SEG_W - 2 * SEG_T, SEG_T, fill=color),
        Rect(x, y + h2, SEG_T, SEG_H - h2 - SEG_T, fill=color),
        Rect(x, y + SEG_T, SEG_T, h2 - SEG_T, fill=color),
        Rect(x + SEG_T, y + h2 - (SEG_T // 2), SEG_W - 2 * SEG_T, SEG_T, fill=color),
    ]
    for r in segs:
        root.append(r)
    return segs


def _set_digit_xy(segs, x, y):
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


def _set_digit_char(segs, ch):
    pat = SEG_MAP.get(ch, SEG_MAP[" "])
    for i in range(7):
        segs[i].hidden = not bool(pat[i])


def _set_digit_color(segs, color):
    for r in segs:
        r.fill = color


digits = [
    _make_digit(0, SEG_Y, WHITE),
    _make_digit(0, SEG_Y, WHITE),
    _make_digit(0, SEG_Y, WHITE),
    _make_digit(0, SEG_Y, WHITE),
    _make_digit(0, SEG_Y, WHITE),
    _make_digit(0, SEG_Y, WHITE),
]


def _place_digits_score():
    center_x = W // 2
    gap = 2
    block_w = (3 * SEG_W) + (2 * SEG_DIGIT_GAP)
    left_start = (center_x - gap) - block_w
    right_start = (center_x + gap)
    safe_y = max(0, min(SEG_Y, max(0, H - SEG_H)))
    for i in range(3):
        _set_digit_xy(digits[i], left_start + i * (SEG_W + SEG_DIGIT_GAP), safe_y)
    for i in range(3):
        _set_digit_xy(digits[3 + i], right_start + i * (SEG_W + SEG_DIGIT_GAP), safe_y)


def _place_digits_clock():
    # Add a touch more space between the colon and the minute digits.
    gap_hm = 3  # hours -> minutes (was 2)
    gap_ms = 2  # minutes -> (ampm area)
    total_w = (6 * SEG_W) + (5 * SEG_DIGIT_GAP) + gap_hm + gap_ms
    start_x = (W - total_w) // 2
    # Vertically center the clock (previous fixed SEG_Y pushed it too low on 64x32).
    safe_y = max(0, (H - SEG_H) // 2)
    x = start_x
    for i in range(6):
        _set_digit_xy(digits[i], x, safe_y)
        x += SEG_W
        if i != 5:
            x += SEG_DIGIT_GAP
        if i == 1:
            x += gap_hm
        elif i == 3:
            x += gap_ms


COLON_W = 2
COLON_H = 2
colon1 = [Rect(0, 0, COLON_W, COLON_H, fill=WHITE), Rect(0, 0, COLON_W, COLON_H, fill=WHITE)]
colon2 = [Rect(0, 0, COLON_W, COLON_H, fill=WHITE), Rect(0, 0, COLON_W, COLON_H, fill=WHITE)]
for r in colon1 + colon2:
    r.hidden = True
    root.append(r)


def _hide_colons():
    for r in colon1 + colon2:
        r.hidden = True


def _show_colons_for_clock():
    seg1 = digits[1][0]
    seg2 = digits[2][0]
    seg3 = digits[3][0]
    seg4 = digits[4][0]
    x1 = seg1.x - SEG_T
    y = seg1.y
    x2 = seg2.x - SEG_T
    gap12_center = (x1 + SEG_W + x2) // 2
    top_y = y + 5
    bot_y = y + 11
    # Nudge colon slightly right to add a bit more space from the hour digits.
    colon_x = gap12_center - (COLON_W // 2) + 1
    if colon_x < 0:
        colon_x = 0
    if colon_x > (W - COLON_W):
        colon_x = W - COLON_W
    colon1[0].x = colon_x
    colon1[0].y = top_y
    colon1[1].x = colon_x
    colon1[1].y = bot_y
    for r in colon1:
        r.hidden = False
    for r in colon2:
        r.hidden = True


_place_digits_clock()


def show_clock(now_local):
    _hide_message()
    _hide_ampm()
    _hide_colons()
    _show_all_digits()
    left_bg.fill = 0x101010
    right_bg.fill = 0x101010
    _set_top_labels("", "")
    _place_digits_clock()
    _show_colons_for_clock()
    hh = now_local.tm_hour if now_local else None
    mm = now_local.tm_min if now_local else None
    if hh is None:
        hh12 = None
        ampm = ""
    else:
        ampm = "PM" if int(hh) >= 12 else "AM"
        hmod = int(hh) % 12
        hh12 = 12 if hmod == 0 else hmod

    if hh12 is None:
        h_t, h_o = _two(hh12)
    else:
        if int(hh12) < 10:
            h_t, h_o = (" ", str(int(hh12)))
        else:
            h_t, h_o = _two(hh12)
    m_t, m_o = _two(mm)
    for segs in digits:
        _set_digit_color(segs, WHITE)
    _set_digit_char(digits[0], h_t)
    _set_digit_char(digits[1], h_o)
    _set_digit_char(digits[2], m_t)
    _set_digit_char(digits[3], m_o)

    # Hide the seconds digits and show AM/PM text in that area.
    for i in (4, 5):
        for r in digits[i]:
            r.hidden = True

    if ampm:
        ampm_lbl.hidden = False
        ampm_lbl.text = ampm
        # Position near where seconds would have been.
        ampm_x = max(2, (digits[4][0].x - SEG_T) + 1)
        ampm_lbl.x = ampm_x
        ampm_lbl.y = digits[4][0].y + 6


def show_score(entry):
    _hide_message()
    _hide_ampm()
    if not isinstance(entry, dict):
        return False
    if entry.get("team_score") is None or entry.get("opp_score") is None:
        return False
    divider1.hidden = False
    divider2.hidden = False
    _hide_colons()
    _show_all_digits()
    _place_digits_score()

    # Always render HOME on the left and AWAY on the right.
    # `at` indicates whether the selected team is away.
    at = (entry.get("at") or "").strip().lower()

    team_abbr = _abbr_fallback(entry.get("team_abbr"), entry.get("team_name"), max_len=3)
    opp_abbr = _abbr_fallback(entry.get("opponent_abbr"), entry.get("opp_name"), max_len=3)

    if at == "away":
        home_abbr = opp_abbr
        away_abbr = team_abbr
        home_score = int(entry.get("opp_score")) % 1000
        away_score = int(entry.get("team_score")) % 1000
        home_primary = _hex_to_int(entry.get("opp_primary"), 0x202020)
        away_primary = _hex_to_int(entry.get("team_primary"), WELLESLEY_BLUE)
        home_secondary = _hex_to_int(entry.get("opp_secondary"), WHITE)
        away_secondary = _hex_to_int(entry.get("team_secondary"), WHITE)
    else:
        home_abbr = team_abbr
        away_abbr = opp_abbr
        home_score = int(entry.get("team_score")) % 1000
        away_score = int(entry.get("opp_score")) % 1000
        home_primary = _hex_to_int(entry.get("team_primary"), WELLESLEY_BLUE)
        away_primary = _hex_to_int(entry.get("opp_primary"), 0x202020)
        home_secondary = _hex_to_int(entry.get("team_secondary"), WHITE)
        away_secondary = _hex_to_int(entry.get("opp_secondary"), WHITE)

    _set_top_labels(home_abbr, away_abbr)

    left_bg.fill = home_primary
    right_bg.fill = away_primary

    home_color = home_secondary
    away_color = away_secondary

    l = home_score
    r = away_score
    l0 = " " if l < 100 else str(l // 100)
    l1 = " " if l < 10 else str((l // 10) % 10)
    l2 = str(l % 10)
    r0 = " " if r < 100 else str(r // 100)
    r1 = " " if r < 10 else str((r // 10) % 10)
    r2 = str(r % 10)
    _set_digit_color(digits[0], home_color)
    _set_digit_color(digits[1], home_color)
    _set_digit_color(digits[2], home_color)
    _set_digit_color(digits[3], away_color)
    _set_digit_color(digits[4], away_color)
    _set_digit_color(digits[5], away_color)
    _set_digit_char(digits[0], l0)
    _set_digit_char(digits[1], l1)
    _set_digit_char(digits[2], l2)
    _set_digit_char(digits[3], r0)
    _set_digit_char(digits[4], r1)
    _set_digit_char(digits[5], r2)
    return True


def show_not_playing(team_abbr):
    # Text-only fallback when scoreboard requested but there's no game.
    _hide_colons()
    _hide_digits()
    _hide_ampm()
    divider1.hidden = True
    divider2.hidden = True
    left_bg.fill = 0x101010
    right_bg.fill = 0x101010
    _set_top_labels("", "")
    abbr = str(team_abbr or "TEAM").strip().upper()[:4] or "TEAM"
    _center_message(abbr + "\nNOT ON")
    # Nudge down a bit so the top line isn't clipped.
    try:
        msg_lbl.y = min(max(0, msg_lbl.y + 4), max(0, H - CHAR_H))
    except Exception:
        pass
    return True




# -----------------------
# Cache last-known state
# -----------------------

CACHE_FILE = "/last_state.txt"


def load_cache():
    try:
        with open(CACHE_FILE, "r") as f:
            raw = (f.read() or "").strip()
    except Exception:
        return None
    if not raw:
        return None

    # Format: mode|tz|team_score|opp_score|team_abbr|opp_abbr|at|tp|ts|op|os|brightness
    parts = raw.split("|")
    if len(parts) < 11:
        return None

    def nint(x):
        try:
            return int(x)
        except Exception:
            return None

    def nfloat(x):
        try:
            return float(x)
        except Exception:
            return None

    out = {
        "mode": parts[0],
        "tz": parts[1],
        "team_score": nint(parts[2]),
        "opp_score": nint(parts[3]),
        "team_abbr": parts[4] or None,
        "opponent_abbr": parts[5] or None,
        "at": parts[6] or None,
        "team_primary": parts[7] or None,
        "team_secondary": parts[8] or None,
        "opp_primary": parts[9] or None,
        "opp_secondary": parts[10] or None,
        "view_unavailable": True,
    }
    if len(parts) >= 12:
        out["brightness"] = nfloat(parts[11])
    return out


def save_cache(mode, tz, score, brightness=None):
    try:
        team_score = "" if not score else ("" if score.get("team_score") is None else str(score.get("team_score")))
        opp_score = "" if not score else ("" if score.get("opp_score") is None else str(score.get("opp_score")))
        team_abbr = "" if not score else (score.get("team_abbr") or "")
        opp_abbr = "" if not score else (score.get("opponent_abbr") or "")
        at = "" if not score else (score.get("at") or "")
        tp = "" if not score else (score.get("team_primary") or "")
        ts = "" if not score else (score.get("team_secondary") or "")
        op = "" if not score else (score.get("opp_primary") or "")
        os2 = "" if not score else (score.get("opp_secondary") or "")
        b = "" if brightness is None else str(brightness)
        line = "|".join([
            str(mode or ""),
            str(tz or ""),
            team_score,
            opp_score,
            str(team_abbr),
            str(opp_abbr),
            str(at),
            str(tp),
            str(ts),
            str(op),
            str(os2),
            b,
        ])
        with open(CACHE_FILE, "w") as f:
            f.write(line)
    except Exception:
        pass


# -----------------------
# Network (lazy)
# -----------------------

requests = None
ntp = None
esp = None
wifi_tx_mgr = None
wifi_ne_mgr = None
_net_inited = False
_net_failed = False


def _remote_headers():
    h = {"Accept": "application/json"}
    if CONTROL_API_TOKEN:
        h["Authorization"] = "Bearer " + CONTROL_API_TOKEN
    return h


def init_network():
    global _net_inited, _net_failed, requests, ntp, esp, wifi_tx_mgr, wifi_ne_mgr
    if _net_inited or _net_failed:
        return
    if not (REMOTE_CONTROL_ENABLED and CONTROL_BASE_URL and HAS_WIFI_CREDS):
        _net_failed = True
        return
    try:
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
        wifi_tx_mgr = WiFiManager(esp, TEXAS_WIFI_SSID or "", TEXAS_WIFI_PASSWORD or "")
        wifi_ne_mgr = WiFiManager(esp, NORTHEAST_WIFI_SSID or "", NORTHEAST_WIFI_PASSWORD or "")
        pool = adafruit_connection_manager.get_radio_socketpool(esp)
        ssl_context = adafruit_connection_manager.get_radio_ssl_context(esp)
        requests = adafruit_requests.Session(pool, ssl_context)
        if NTP_ENABLED:
            import adafruit_ntp
            ntp = adafruit_ntp.NTP(pool, tz_offset=0, cache_seconds=3600)
        _net_inited = True
    except Exception:
        _net_failed = True


def connect_wifi():
    if not _net_inited or esp is None:
        return False
    if esp.is_connected:
        return True
    # Prefer NE first (faster connects while you're in NE), then TX fallback.
    for mgr in (wifi_ne_mgr, wifi_tx_mgr):
        if mgr is None:
            continue
        try:
            mgr.connect()
            return True
        except Exception:
            pass
    return False


def get_json(path, timeout=5):
    if requests is None or esp is None or (not esp.is_connected):
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


# -----------------------
# Main loop
# -----------------------

the_rtc = rtc.RTC()

last_control = -999999
last_score = -999999
last_ntp = -999999
wifi_attempt_last = -999999

control = None
score = None
last_score_ok = False

# Instant: draw something on first frame.
cached = load_cache()

try:
    cb = None
    if cached and cached.get("brightness") is not None:
        cb = float(cached.get("brightness"))
    if cb is not None:
        if cb < 0.05:
            cb = 0.05
        if cb > 1:
            cb = 1
        display.brightness = cb
except Exception:
    pass

while True:
    mono = time.monotonic()

    utc_epoch = int(time.time())
    if utc_epoch < 1700000000:
        utc_epoch = 1735689600 + int(mono)

    tz = CLOCK_TZ
    if isinstance(control, dict):
        tz = str(control.get("tz") or tz).strip().lower() or tz
    elif cached and cached.get("tz"):
        tz = str(cached.get("tz") or tz).strip().lower() or tz

    now_local = time.localtime(utc_epoch + tz_offset_seconds(utc_epoch, tz))

    # Brightness (from /control, else cached, else env default)
    try:
        desired_brightness = float(DISPLAY_BRIGHTNESS)
    except Exception:
        desired_brightness = 0.22
    try:
        if isinstance(control, dict) and (control.get("brightness") is not None):
            desired_brightness = float(control.get("brightness"))
        elif cached and cached.get("brightness") is not None:
            desired_brightness = float(cached.get("brightness"))
    except Exception:
        pass
    if desired_brightness < 0.05:
        desired_brightness = 0.05
    if desired_brightness > 1:
        desired_brightness = 1
    try:
        if abs(float(display.brightness) - desired_brightness) > 0.005:
            display.brightness = desired_brightness
    except Exception:
        pass

    # Decide what to display (always something):
    try:
        if DISPLAY_MODE == "clock":
            show_clock(now_local)
        else:
            mode = None
            if isinstance(control, dict):
                mode = str(control.get("mode") or "").strip().lower()
            elif cached and cached.get("mode"):
                mode = str(cached.get("mode") or "").strip().lower()

            if mode == "idle":
                show_clock(now_local)
            else:
                # Scoreboard mode: show ONLY scores when available, otherwise show NOT ON.
                if score and show_score(score):
                    pass
                elif last_score_ok and (not score or score.get("team_score") is None or score.get("opp_score") is None or score.get("view_unavailable")):
                    show_not_playing(_control_team_abbr(control))
                elif cached and show_score(cached):
                    pass
                else:
                    show_not_playing(_control_team_abbr(control))
    except Exception:
        show_clock(now_local)

    _refresh()

    # Network
    init_network()
    connected = (esp is not None) and getattr(esp, "is_connected", False)
    if _net_inited and (not connected) and (mono - wifi_attempt_last) >= 3:
        wifi_attempt_last = mono
        connect_wifi()
        connected = (esp is not None) and getattr(esp, "is_connected", False)

    if connected and (ntp is not None) and (mono - last_ntp) > NTP_RESYNC_SECONDS:
        try:
            the_rtc.datetime = ntp.datetime
        except Exception:
            pass
        last_ntp = mono

    if connected and REMOTE_CONTROL_ENABLED and CONTROL_BASE_URL:
        if (mono - last_control) >= CONTROL_POLL_SECONDS:
            c = get_json("/control?device_id=" + CONTROL_DEVICE_ID)
            if isinstance(c, dict):
                control = c
                # Keep cache updated with latest control mode/tz.
                save_cache(
                    str(control.get("mode") or ""),
                    str(control.get("tz") or ""),
                    score,
                    control.get("brightness"),
                )
            last_control = mono

        desired_mode = "auto"
        if isinstance(control, dict):
            desired_mode = str(control.get("mode") or "auto").strip().lower()

        poll_s = REMOTE_SCORE_POLL_IDLE_SECONDS if desired_mode == "idle" else REMOTE_SCORE_POLL_ACTIVE_SECONDS
        if (mono - last_score) >= poll_s:
            s = get_json("/score?device_id=" + CONTROL_DEVICE_ID)
            if isinstance(s, dict):
                score = {
                    "team_score": s.get("team_score"),
                    "opp_score": s.get("opp_score"),
                    "team_abbr": s.get("team_abbr"),
                    "opponent_abbr": s.get("opponent_abbr"),
                    "team_name": s.get("team") or s.get("team_name"),
                    "opp_name": s.get("opponent") or s.get("opponent_name"),
                    "at": s.get("at"),
                    "team_primary": s.get("team_primary"),
                    "team_secondary": s.get("team_secondary"),
                    "opp_primary": s.get("opp_primary"),
                    "opp_secondary": s.get("opp_secondary"),
                    "view_unavailable": bool(s.get("view_unavailable")),
                }
                save_cache(
                    str((control or {}).get("mode") or ""),
                    str((control or {}).get("tz") or ""),
                    score,
                    (control or {}).get("brightness"),
                )
                last_score_ok = True
            else:
                last_score_ok = False
            last_score = mono

    time.sleep(1)

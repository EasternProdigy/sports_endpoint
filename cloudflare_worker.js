const DEFAULT_CONTROL = {
  source: "wellesley",
  sport: "nfl",
  team: "DAL",
  view: "score", // score|timer
  mode: "auto",
  tz: "ct", // utc|et|ct|mt|pt
  brightness: 0.22,
};

const NCAA_SOURCE_KEYS = ["ncaa-softball", "ncaa_softball", "ncaa"];
const NCAA_BASKETBALL_SOURCE_KEYS = ["ncaa-basketball", "ncaa_basketball", "cbb"];
const SUPER_BOWL_TEAM_KEYS = ["SUPERBOWL", "SUPER_BOWL", "SUPER-BOWL", "SB", "BIGGAME"];
const OLYMPICS_SOURCE_KEYS = ["olympics", "olympic", "oly"];
const WORLD_CUP_SOURCE_KEYS = ["world-cup", "world_cup", "fifa-world-cup", "fifa"];
const OLYMPIC_TEAM_SPORTS = [
  "olympic-basketball",
  "olympic-soccer",
  "olympic-volleyball",
  "olympic-handball",
  "olympic-water-polo",
  "olympic-field-hockey",
  "olympic-rugby-sevens",
  "basketball",
  "soccer",
  "volleyball",
  "handball",
  "water-polo",
  "field-hockey",
  "rugby-sevens",
];
const OLYMPIC_INDIVIDUAL_SPORTS = [
  "olympic-golf",
  "olympic-tennis-singles",
  "olympic-tennis",
];
const INDIVIDUAL_SPORTS = ["golf", "tennis-singles", "tennis_singles", "tennis"];
const SOCCER_SPORT_KEYS = ["soccer", "football"]; // football = association football here

const TEAM_COLOR_OVERRIDES = {
  "softball:WEL": { primary: "#0033AA", secondary: "#FFFFFF" },
  "nfl:DAL": { primary: "#003594", secondary: "#869397" },
  "nba:BOS": { primary: "#007A33", secondary: "#BA9653" },
  "mlb:NYY": { primary: "#132448", secondary: "#C4CED4" },
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const WORKER_VERSION = "2026.02.22-ui11";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...CORS_HEADERS,
        },
      });
    }

    try {
      if (pathname === "/" && request.method === "GET") {
        return Response.redirect(url.origin + "/ui", 302);
      }

      if ((pathname === "/ui" || pathname === "/ui/") && request.method === "GET") {
        return htmlResponse(renderControlUiHtml(url));
      }

      if (pathname === "/__version" && request.method === "GET") {
        return jsonResponse({ worker_version: WORKER_VERSION });
      }

      if (pathname === "/control" && request.method === "POST") {
        return await handlePostControl(request, env);
      }

      if (pathname === "/control" && request.method === "GET") {
        return await handleGetControl(searchParams, env);
      }

      if (pathname === "/teams" && request.method === "GET") {
        return await handleGetTeams(searchParams, env);
      }

      if (pathname === "/score" && request.method === "GET") {
        return await handleGetScore(searchParams, env);
      }

      if (pathname === "/health" && request.method === "GET") {
        return await handleHealth(env);
      }

      return jsonResponse({ error: "Not found" }, 404);
    } catch (err) {
      return jsonResponse(
        {
          error: "Unhandled worker error",
          detail: String(err?.message || err),
        },
        500
      );
    }
  },
};

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function renderControlUiHtml(url) {
  const deviceId = (url.searchParams.get("device_id") || "matrix-01").replace(/[^a-zA-Z0-9_-]/g, "");
  const baseUrl = url.origin;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Matrix Scoreboard Control</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2048%2048'%3E%3Crect%20x='4'%20y='4'%20width='10'%20height='10'/%3E%3Crect%20x='19'%20y='4'%20width='10'%20height='10'/%3E%3Crect%20x='34'%20y='4'%20width='10'%20height='10'/%3E%3Crect%20x='4'%20y='19'%20width='10'%20height='10'/%3E%3Crect%20x='19'%20y='19'%20width='10'%20height='10'/%3E%3Crect%20x='34'%20y='19'%20width='10'%20height='10'/%3E%3Crect%20x='4'%20y='34'%20width='10'%20height='10'/%3E%3Crect%20x='19'%20y='34'%20width='10'%20height='10'/%3E%3Crect%20x='34'%20y='34'%20width='10'%20height='10'/%3E%3C/svg%3E" />
    <style>
      * { box-sizing: border-box; }
      :root {
        --bg: #ffffff;
        --card: #ffffff;
        --text: #111111;
        --muted: #60646c;
        --border: #e5e7eb;
        --btn: #111111;
        --btnText: #ffffff;
        --btn2: #ffffff;
        --btn2Text: #111111;
        --field: #ffffff;
        --fieldText: #111111;
        --fieldBorder: #d1d5db;
      }
      [data-theme="dark"] {
        --bg: #0b0d10;
        --card: #111318;
        --text: #f3f4f6;
        --muted: #a1a1aa;
        --border: #2a2f3a;
        --btn: #f3f4f6;
        --btnText: #0b0d10;
        --btn2: #111318;
        --btn2Text: #f3f4f6;
        --field: #0b0d10;
        --fieldText: #f3f4f6;
        --fieldBorder: #2a2f3a;
      }
      html { background: var(--bg); }
      body {
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        margin: 0;
        padding: 16px;
        color: var(--text);
        background: var(--bg);
        -webkit-text-size-adjust: 100%;
      }
      .wrap { max-width: 520px; margin: 0 auto; }
      h1 { font-size: 18px; margin: 0; }
      .topbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
      .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 999px; overflow: hidden; }
      .seg button { border: 0; padding: 10px 12px; background: transparent; color: var(--muted); font-weight: 700; }
      .seg button.active { background: var(--text); color: var(--bg); }
      .card { border: 1px solid var(--border); background: var(--card); border-radius: 14px; padding: 14px; }
      .card + .card { margin-top: 12px; }
      label { display: block; font-size: 12px; margin: 12px 0 6px; color: var(--muted); }
      input, select {
        width: 100%;
        font-size: 16px;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid var(--fieldBorder);
        background: var(--field);
        color: var(--fieldText);
        outline: none;
      }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      .btns { display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 12px; }
      button.primary {
        font-size: 16px;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: var(--btn);
        color: var(--btnText);
        font-weight: 800;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        transition: transform 120ms ease, filter 160ms ease, background 160ms ease;
      }
      button.primary:active { transform: scale(0.99); }
      button.primary.ok { background: #16a34a; color: #ffffff; }
      button.primary.err { background: #dc2626; color: #ffffff; }
      button.primary.loading { filter: brightness(0.92); }
      button.secondary {
        font-size: 16px;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: var(--btn2);
        color: var(--btn2Text);
        font-weight: 800;
      }
      .muted { font-size: 12px; color: var(--muted); line-height: 1.35; }
      pre {
        white-space: pre-wrap;
        word-wrap: break-word;
        font-size: 12px;
        background: rgba(127,127,127,0.10);
        border: 1px solid var(--border);
        padding: 10px;
        border-radius: 12px;
        margin: 0;
      }
      .currentBox {
        margin: 8px 0 10px;
        padding: 10px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--field);
        color: var(--fieldText);
        font-size: 13px;
        line-height: 1.3;
      }
      .currentBox .k { color: var(--muted); font-weight: 800; margin-right: 8px; }
      .toggleRow { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; }
      .pill { display: inline-flex; align-items: center; gap: 10px; }
      .switch { width: 46px; height: 28px; border-radius: 999px; border: 1px solid var(--border); background: rgba(127,127,127,0.12); position: relative; }
      .switch > span { width: 24px; height: 24px; border-radius: 999px; background: var(--text); position: absolute; top: 1px; left: 1px; transition: transform 120ms ease; }
      .switch.on > span { transform: translateX(18px); }
      .advHidden { display: none !important; }
      .combo { position: relative; display: flex; gap: 8px; align-items: center; }
      .combo input { flex: 1; }
      .comboBtn {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        border: 1px solid var(--fieldBorder);
        background: var(--field);
        color: var(--fieldText);
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .comboList {
        position: absolute;
        left: 0;
        right: 0;
        top: 54px;
        z-index: 10;
        border: 1px solid var(--border);
        background: var(--card);
        border-radius: 12px;
        overflow: hidden;
        max-height: 280px;
        overflow-y: auto;
        box-shadow: 0 10px 30px rgba(0,0,0,0.20);
      }
      .comboItem {
        padding: 12px;
        border-bottom: 1px solid var(--border);
        cursor: pointer;
      }
      .comboItem:last-child { border-bottom: 0; }
      .comboItem:hover { background: rgba(127,127,127,0.10); }
      .titleWrap { display: inline-flex; align-items: center; gap: 10px; }
      .infoBtn {
        width: 32px;
        height: 32px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: transparent;
        color: var(--muted);
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .modalBack {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.40);
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding: 16px;
        z-index: 50;
      }
      .modal {
        width: 100%;
        max-width: 520px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 14px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.35);
        max-height: 78vh;
        overflow: auto;
      }
      .modalTop { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .modalTop h2 { font-size: 16px; margin: 0; }
      .closeBtn {
        width: 38px;
        height: 38px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: transparent;
        color: var(--text);
        font-weight: 800;
      }
      .modal p { margin: 10px 0; }
      .modal ul { margin: 8px 0 12px 18px; padding: 0; }
      .modal li { margin: 6px 0; }
      @media (max-width: 420px) { body { padding: 12px; } }
    </style>
  </head>
  <body data-theme="light">
    <div class="wrap">
      <div class="topbar">
        <div class="titleWrap">
          <h1>Matrix Scoreboard Control</h1>
          <button id="infoBtn" class="infoBtn" type="button" aria-label="Info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 17V11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M12 8h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
              <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke="currentColor" stroke-width="2"/>
            </svg>
          </button>
          <button id="settingsBtn" class="infoBtn" type="button" aria-label="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="2"/>
              <path d="M19.4 15a7.7 7.7 0 0 0 .1-1 7.7 7.7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 2h-6l-.3 2.9a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.7 7.7 0 0 0-.1 1 7.7 7.7 0 0 0 .1 1l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1L9 22h6l.3-2.9a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            </svg>
          </button>
          <button id="reloadBtn" class="infoBtn" type="button" aria-label="Reload">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.6-6.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M21 3v6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div class="seg" role="tablist" aria-label="UI Mode">
          <button id="tabBasic" class="active" type="button">Basic</button>
          <button id="tabAdv" type="button">Advanced</button>
        </div>
      </div>

      <div class="card">
        <div class="toggleRow">
          <div class="pill">
            <strong>Scoreboard</strong>
            <div id="displaySwitch" class="switch" role="switch" aria-checked="false" tabindex="0"><span></span></div>
            <strong>Clock</strong>
          </div>
          <div class="pill">
            <span class="muted">Light</span>
            <div id="themeSwitch" class="switch" role="switch" aria-checked="false" tabindex="0"><span></span></div>
            <span class="muted">Dark</span>
          </div>
        </div>

        <div id="scoreControls">
          <label for="sport">Sport</label>
          <select id="sport">
            <option value="nfl" selected>NFL</option>
            <option value="nba">NBA</option>
            <option value="mlb">MLB</option>
            <option value="nhl">NHL</option>
            <option value="softball">NCAA Softball</option>
            <option value="cbb">NCAA Basketball</option>
            <option value="dev">DEV</option>
          </select>

          <div id="liveTeamWrap">
            <label for="teamLive">Team (Live)</label>
            <select id="teamLive"></select>
            <div class="muted" style="margin-top:8px;">Shows teams actively playing right now (from ESPN). Choose <strong>Timer…</strong> for a next-game countdown.</div>
          </div>

          <div id="timerControls" class="advHidden">
            <label for="team">Team (Timer)</label>
            <div class="combo">
              <input id="team" value="Dallas Cowboys (DAL)" autocapitalize="words" />
              <button id="teamBtn" class="comboBtn" type="button" aria-label="Teams">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <div id="teamList" class="comboList advHidden" role="listbox" aria-label="Teams"></div>
            </div>
            <div class="muted" style="margin-top:8px;">Shows a days:hours:minutes countdown to the next game on the board.</div>
          </div>
        </div>

        <div id="tzWrap" class="advHidden">
          <label for="tz">Timezone (Clock)</label>
          <select id="tz">
            <option value="ct" selected>Central (CT)</option>
            <option value="et">Eastern (ET)</option>
            <option value="mt">Mountain (MT)</option>
            <option value="pt">Pacific (PT)</option>
            <option value="utc">UTC</option>
          </select>
        </div>

        <div class="btns">
          <button id="send" class="primary" type="button" aria-label="Send">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span id="sendText">Send</span>
          </button>
        </div>

        <div class="muted" style="margin-top:10px;">Controls: <code>${baseUrl}</code></div>
      </div>

      <div id="advanced" class="card advHidden">
        <div class="muted" style="margin-bottom:8px;">Advanced settings</div>

        <label for="device">Device ID</label>
        <input id="device" value="${deviceId}" autocapitalize="none" />

        <label for="token">Bearer Token (optional)</label>
        <input id="token" placeholder="Optional" autocapitalize="none" />

        <label for="source">Source</label>
        <select id="source">
          <option value="pro" selected>Pro</option>
          <option value="wellesley">Wellesley</option>
          <option value="ncaa-softball">NCAA Softball</option>
          <option value="ncaa-basketball">NCAA Basketball</option>
          <option value="olympics">Olympics</option>
          <option value="world-cup">World Cup</option>
        </select>

        <div class="row" style="margin-top:10px;">
          <button class="secondary" id="getHealth" type="button">Health / Version</button>
          <button class="secondary" id="copyLink" type="button">Copy Device Link</button>
        </div>

        <div class="row" style="margin-top:10px;">
          <button class="secondary" id="getControl" type="button">Get Control</button>
          <button class="secondary" id="getScore" type="button">Get Score</button>
        </div>
      </div>

      <div class="card">
        <div class="muted">Response</div>
        <div id="currentSummary" class="currentBox"><span class="k">Current</span><span id="currentText">(not loaded yet)</span></div>
        <pre id="out">(none)</pre>
      </div>

    </div>

    <div id="infoModal" class="modalBack advHidden" role="dialog" aria-modal="true" aria-label="Info">
      <div class="modal">
        <div class="modalTop">
          <h2>How this works</h2>
          <button id="closeInfo" class="closeBtn" type="button" aria-label="Close">×</button>
        </div>

        <p><strong>Basic</strong></p>
        <ul>
          <li><strong>Scoreboard / Clock</strong> chooses what the MatrixPortal shows.</li>
          <li><strong>Sport</strong> automatically selects the correct score source.</li>
          <li><strong>Team</strong> pick from the list or type to search, then tap <strong>Send</strong>.</li>
          <li>When <strong>Clock</strong> is selected, you can pick a <strong>Timezone</strong>.</li>
        </ul>

        <p><strong>Advanced</strong></p>
        <ul>
          <li><strong>Device ID</strong> selects which MatrixPortal device to control (default: matrix-01).</li>
          <li><strong>Bearer Token</strong> is optional (this UI is configured for public control).</li>
          <li><strong>Source</strong> lets you override where scores come from.</li>
          <li><strong>Get Control / Get Score</strong> shows the raw JSON from the Worker.</li>
        </ul>

        <p><strong>Nitty gritty</strong></p>
        <ul>
          <li>This page sends a <code>POST /control</code> with: <code>{ device_id, source, sport, team, view, mode, tz, brightness }</code>.</li>
          <li>Your MatrixPortal polls <code>/control</code> and <code>/score</code> every few seconds and updates the display.</li>
          <li><code>mode: "idle"</code> forces clock-only mode on the board.</li>
        </ul>
      </div>
    </div>

    <div id="settingsModal" class="modalBack advHidden" role="dialog" aria-modal="true" aria-label="Settings">
      <div class="modal">
        <div class="modalTop">
          <h2>Settings</h2>
          <button id="closeSettings" class="closeBtn" type="button" aria-label="Close">×</button>
        </div>

        <label for="brightness">Brightness</label>
        <div class="row">
          <input id="brightness" type="range" min="0.05" max="1" step="0.01" value="0.22" />
          <input id="brightnessNum" type="number" min="0.05" max="1" step="0.01" value="0.22" />
        </div>
        <div class="muted" style="margin-top:8px;">Saves to the device control state so the MatrixPortal remembers it.</div>

        <div class="btns" style="margin-top:12px;">
          <button id="applySettings" class="primary" type="button">Apply</button>
        </div>
      </div>
    </div>

    <script>
      const $ = (id) => document.getElementById(id);
      const out = $("out");
      const cookieGet = (k) => {
        const m = document.cookie.match(new RegExp('(?:^|; )' + k.replace(/[-.$?*|{}()\\[\\]\\\\\\/\\+^]/g, "\\\\$&") + '=([^;]*)'));
        return m ? decodeURIComponent(m[1]) : "";
      };
      const cookieSet = (k, v) => {
        document.cookie = k + "=" + encodeURIComponent(v) + "; path=/; max-age=" + (60 * 60 * 24 * 365);
      };

      const state = {
        advanced: false,
        dark: cookieGet("ui_dark") === "1",
        display: cookieGet("ui_disp") || "scoreboard", // scoreboard|clock
        sport: cookieGet("ui_sport") || "nfl",
        view: cookieGet("ui_view") || "score", // score|timer
        team: "", // timer/team-search display string
        liveTeam: cookieGet("ui_live_team") || "", // team code
        sourceOverride: cookieGet("ui_src_override") === "1",
        source: cookieGet("ui_source") || "pro",
        device: cookieGet("ui_device") || "${deviceId}",
        token: cookieGet("ui_token") || "",
        tz: cookieGet("ui_tz") || "ct",
        brightness: parseFloat(cookieGet("ui_brightness") || "") || 0.22,
      };

      const TIMER_VALUE = "__TIMER__";

      const teamLists = {
        dev: [
          ["Alpha", "ALP"],
          ["Bravo", "BRV"],
          ["Charlie", "CHR"],
          ["Delta", "DLT"],
          ["Echo", "ECH"],
          ["Foxtrot", "FOX"],
          ["Gamma", "GAM"],
          ["Hotel", "HOT"],
          ["Indigo", "IND"],
          ["Juliet", "JUL"],
          ["Kilo", "KIL"],
          ["Lima", "LIM"],
        ],
        nfl: [
          ["Arizona Cardinals", "ARI"], ["Atlanta Falcons", "ATL"], ["Baltimore Ravens", "BAL"], ["Buffalo Bills", "BUF"],
          ["Carolina Panthers", "CAR"], ["Chicago Bears", "CHI"], ["Cincinnati Bengals", "CIN"], ["Cleveland Browns", "CLE"],
          ["Dallas Cowboys", "DAL"], ["Denver Broncos", "DEN"], ["Detroit Lions", "DET"], ["Green Bay Packers", "GB"],
          ["Houston Texans", "HOU"], ["Indianapolis Colts", "IND"], ["Jacksonville Jaguars", "JAX"], ["Kansas City Chiefs", "KC"],
          ["Las Vegas Raiders", "LV"], ["Los Angeles Chargers", "LAC"], ["Los Angeles Rams", "LAR"], ["Miami Dolphins", "MIA"],
          ["Minnesota Vikings", "MIN"], ["New England Patriots", "NE"], ["New Orleans Saints", "NO"], ["New York Giants", "NYG"],
          ["New York Jets", "NYJ"], ["Philadelphia Eagles", "PHI"], ["Pittsburgh Steelers", "PIT"], ["San Francisco 49ers", "SF"],
          ["Seattle Seahawks", "SEA"], ["Tampa Bay Buccaneers", "TB"], ["Tennessee Titans", "TEN"], ["Washington Commanders", "WSH"],
        ],
        nba: [
          ["Atlanta Hawks", "ATL"], ["Boston Celtics", "BOS"], ["Brooklyn Nets", "BKN"], ["Charlotte Hornets", "CHA"],
          ["Chicago Bulls", "CHI"], ["Cleveland Cavaliers", "CLE"], ["Dallas Mavericks", "DAL"], ["Denver Nuggets", "DEN"],
          ["Detroit Pistons", "DET"], ["Golden State Warriors", "GS"], ["Houston Rockets", "HOU"], ["Indiana Pacers", "IND"],
          ["LA Clippers", "LAC"], ["Los Angeles Lakers", "LAL"], ["Memphis Grizzlies", "MEM"], ["Miami Heat", "MIA"],
          ["Milwaukee Bucks", "MIL"], ["Minnesota Timberwolves", "MIN"], ["New Orleans Pelicans", "NO"], ["New York Knicks", "NY"],
          ["Oklahoma City Thunder", "OKC"], ["Orlando Magic", "ORL"], ["Philadelphia 76ers", "PHI"], ["Phoenix Suns", "PHX"],
          ["Portland Trail Blazers", "POR"], ["Sacramento Kings", "SAC"], ["San Antonio Spurs", "SA"], ["Toronto Raptors", "TOR"],
          ["Utah Jazz", "UTA"], ["Washington Wizards", "WSH"],
        ],
        mlb: [
          ["Arizona Diamondbacks", "ARI"], ["Atlanta Braves", "ATL"], ["Baltimore Orioles", "BAL"], ["Boston Red Sox", "BOS"],
          ["Chicago Cubs", "CHC"], ["Chicago White Sox", "CWS"], ["Cincinnati Reds", "CIN"], ["Cleveland Guardians", "CLE"],
          ["Colorado Rockies", "COL"], ["Detroit Tigers", "DET"], ["Houston Astros", "HOU"], ["Kansas City Royals", "KC"],
          ["Los Angeles Angels", "LAA"], ["Los Angeles Dodgers", "LAD"], ["Miami Marlins", "MIA"], ["Milwaukee Brewers", "MIL"],
          ["Minnesota Twins", "MIN"], ["New York Mets", "NYM"], ["New York Yankees", "NYY"], ["Oakland Athletics", "OAK"],
          ["Philadelphia Phillies", "PHI"], ["Pittsburgh Pirates", "PIT"], ["San Diego Padres", "SD"], ["San Francisco Giants", "SF"],
          ["Seattle Mariners", "SEA"], ["St. Louis Cardinals", "STL"], ["Tampa Bay Rays", "TB"], ["Texas Rangers", "TEX"],
          ["Toronto Blue Jays", "TOR"], ["Washington Nationals", "WSH"],
        ],
        nhl: [
          ["Anaheim Ducks", "ANA"], ["Arizona Coyotes", "ARI"], ["Boston Bruins", "BOS"], ["Buffalo Sabres", "BUF"],
          ["Calgary Flames", "CGY"], ["Carolina Hurricanes", "CAR"], ["Chicago Blackhawks", "CHI"], ["Colorado Avalanche", "COL"],
          ["Columbus Blue Jackets", "CBJ"], ["Dallas Stars", "DAL"], ["Detroit Red Wings", "DET"], ["Edmonton Oilers", "EDM"],
          ["Florida Panthers", "FLA"], ["Los Angeles Kings", "LA"], ["Minnesota Wild", "MIN"], ["Montreal Canadiens", "MTL"],
          ["Nashville Predators", "NSH"], ["New Jersey Devils", "NJ"], ["New York Islanders", "NYI"], ["New York Rangers", "NYR"],
          ["Ottawa Senators", "OTT"], ["Philadelphia Flyers", "PHI"], ["Pittsburgh Penguins", "PIT"], ["San Jose Sharks", "SJ"],
          ["Seattle Kraken", "SEA"], ["St. Louis Blues", "STL"], ["Tampa Bay Lightning", "TB"], ["Toronto Maple Leafs", "TOR"],
          ["Vancouver Canucks", "VAN"], ["Vegas Golden Knights", "VGK"], ["Washington Capitals", "WSH"], ["Winnipeg Jets", "WPG"],
        ],
        softball: [
          ["Babson College", "BAB"],
          ["Clark University", "CLK"],
          ["Coast Guard Academy", "CGA"],
          ["Emerson College", "EME"],
          ["MIT", "MIT"],
          ["Mount Holyoke College", "MHC"],
          ["Salve Regina University", "SRU"],
          ["Smith College", "SMI"],
          ["Springfield College", "SPR"],
          ["Wellesley College", "WEL"],
          ["Wheaton College", "WHE"],
          ["Worcester Polytechnic Institute", "WPI"],
        ],
        cbb: [
          ["Duke", "Duke"],
          ["Alabama", "Alabama"],
          ["Wisconsin", "Wisconsin"],
          ["Arizona", "Arizona"],
          ["Oregon", "Oregon"],
          ["BYU", "BYU"],
          ["Saint Mary's", "Saint Mary's"],
          ["Mississippi State", "Mississippi State"],
          ["Baylor", "Baylor"],
          ["Vanderbilt", "Vanderbilt"],
          ["VCU", "VCU"],
          ["Liberty", "Liberty"],
          ["Akron", "Akron"],
          ["Montana", "Montana"],
          ["Robert Morris", "Robert Morris"],
          ["American", "American"],
          ["Mount St. Mary's", "Mount St. Mary's"],
          ["Florida", "Florida"],
          ["St. John's", "St. John's"],
          ["Texas Tech", "Texas Tech"],
          ["Maryland", "Maryland"],
          ["Memphis", "Memphis"],
          ["Missouri", "Missouri"],
          ["Kansas", "Kansas"],
          ["UConn", "UConn"],
          ["Oklahoma", "Oklahoma"],
          ["Arkansas", "Arkansas"],
          ["Drake", "Drake"],
          ["Colorado State", "Colorado State"],
          ["Grand Canyon", "Grand Canyon"],
          ["UNC Wilmington", "UNC Wilmington"],
          ["Omaha", "Omaha"],
          ["Norfolk State", "Norfolk State"],
          ["Auburn", "Auburn"],
          ["Michigan State", "Michigan State"],
          ["Iowa State", "Iowa State"],
          ["Texas A&M", "Texas A&M"],
          ["Michigan", "Michigan"],
          ["Ole Miss", "Ole Miss"],
          ["Marquette", "Marquette"],
          ["Louisville", "Louisville"],
          ["Creighton", "Creighton"],
          ["New Mexico", "New Mexico"],
          ["San Diego State", "San Diego State"],
          ["North Carolina", "North Carolina"],
          ["UC San Diego", "UC San Diego"],
          ["Yale", "Yale"],
          ["Lipscomb", "Lipscomb"],
          ["Bryant", "Bryant"],
          ["Alabama State", "Alabama State"],
          ["Saint Francis", "Saint Francis"],
          ["Houston", "Houston"],
          ["Tennessee", "Tennessee"],
          ["Kentucky", "Kentucky"],
          ["Purdue", "Purdue"],
          ["Clemson", "Clemson"],
          ["Illinois", "Illinois"],
          ["UCLA", "UCLA"],
          ["Gonzaga", "Gonzaga"],
          ["Georgia", "Georgia"],
          ["Utah State", "Utah State"],
          ["Texas", "Texas"],
          ["Xavier", "Xavier"],
          ["McNeese", "McNeese"],
          ["High Point", "High Point"],
          ["Troy", "Troy"],
          ["Wofford", "Wofford"],
          ["SIU Edwardsville", "SIU Edwardsville"],
        ],
      };

      const sportToSource = {
        nfl: "pro",
        nba: "pro",
        mlb: "pro",
        nhl: "pro",
        softball: "ncaa-softball",
        cbb: "ncaa-basketball",
        dev: "pro",
      };

      function teamCookieKey(sport) {
        return "ui_team_" + String(sport || "").toLowerCase();
      }

      function formatTeamDisplay(name, abbr) {
        const n = String(name || "").trim();
        const a = String(abbr || "").trim();
        if (a.toUpperCase() === "DEV") return "DEV";
        if (!a) return n;
        if (n && a && n.toLowerCase() === a.toLowerCase()) return n;
        return n + " (" + a + ")";
      }

      function defaultTeamForSport(sport) {
        if (sport === "dev") return "Alpha (ALP)";
        if (sport === "softball") return "Wellesley College (WEL)";
        if (sport === "nfl") return "Dallas Cowboys (DAL)";
        if (sport === "nba") return "Dallas Mavericks (DAL)";
        if (sport === "mlb") return "Texas Rangers (TEX)";
        if (sport === "nhl") return "Dallas Stars (DAL)";
        const arr = teamOptionsForSport(sport);
        if (arr && arr.length) return formatTeamDisplay(arr[0][0], arr[0][1]);
        return "";
      }

      function setSwitch(el, on) {
        el.classList.toggle("on", !!on);
        el.setAttribute("aria-checked", on ? "true" : "false");
      }

      function applyTheme() {
        document.body.setAttribute("data-theme", state.dark ? "dark" : "light");
        setSwitch($("themeSwitch"), state.dark);
        cookieSet("ui_dark", state.dark ? "1" : "0");
      }

      function applyTabs() {
        $("tabBasic").classList.toggle("active", !state.advanced);
        $("tabAdv").classList.toggle("active", state.advanced);
        $("advanced").classList.toggle("advHidden", !state.advanced);
        cookieSet("ui_adv", state.advanced ? "1" : "0");
      }

      function applyDisplayMode() {
        setSwitch($("displaySwitch"), state.display === "clock");
        cookieSet("ui_disp", state.display);
        $("tzWrap").classList.toggle("advHidden", state.display !== "clock");
        $("scoreControls").classList.toggle("advHidden", state.display === "clock");
      }

      function teamOptionsForSport(sport) {
        const base = teamLists[sport] || [];
        // DEV option: fake always-on scoreboard data.
        return [["DEV", "DEV"], ...base];
      }

      function renderTeamDropdown(filterText) {
        const list = $("teamList");
        const q = String(filterText || "").trim().toLowerCase();
        const arr = teamOptionsForSport(state.sport);
        const filtered = q
          ? arr.filter(([name, abbr]) => (name + " " + abbr).toLowerCase().includes(q))
          : arr;

        list.innerHTML = "";
        if (filtered.length === 0) {
          const div = document.createElement("div");
          div.className = "comboItem";
          div.textContent = "No matches";
          list.appendChild(div);
          return;
        }

        for (const [name, abbr] of filtered.slice(0, 60)) {
          const div = document.createElement("div");
          div.className = "comboItem";
          const label = formatTeamDisplay(name, abbr);
          div.textContent = label;
          div.addEventListener("click", () => {
            $("team").value = label;
            state.team = label;
            cookieSet(teamCookieKey(state.sport), state.team);
            closeTeamDropdown();
          });
          list.appendChild(div);
        }
      }

      function openTeamDropdown() {
        renderTeamDropdown("");
        $("teamList").classList.remove("advHidden");
      }

      function closeTeamDropdown() {
        $("teamList").classList.add("advHidden");
      }

      function parseTeamAbbr(input) {
        const m = String(input || "").match(/\(([A-Z0-9]{2,10})\)\s*$/);
        if (m) return m[1];
        return String(input || "").trim().toUpperCase();
      }

      function inferSource() {
        state.source = sportToSource[state.sport] || "pro";
        $("source").value = state.source;
        cookieSet("ui_source", state.source);
      }

      // Remove stale keys from older UI versions
      try { document.cookie = "ui_team=; path=/; max-age=0"; } catch {}

      state.team = cookieGet(teamCookieKey(state.sport)) || defaultTeamForSport(state.sport) || "";

      $("token").value = state.token;
      $("device").value = state.device;
      $("sport").value = state.sport;
      $("team").value = state.team;
      $("source").value = state.source;
      $("tz").value = state.tz || "ct";
      $("brightness").value = String(state.brightness);
      $("brightnessNum").value = String(state.brightness);

      function setView(view) {
        const v = String(view || "").trim().toLowerCase();
        state.view = (v === "timer") ? "timer" : "score";
        cookieSet("ui_view", state.view);
        $("timerControls").classList.toggle("advHidden", state.view !== "timer");
        $("liveTeamWrap").classList.toggle("advHidden", state.view === "timer");
      }

      async function loadLiveTeams() {
        try {
          if (state.source !== "pro" || state.display === "clock") {
            $("teamLive").innerHTML = '<option value="' + TIMER_VALUE + '">Timer…</option>';
            return;
          }

          const sport = $("sport").value.trim() || "nfl";
          const resp = await getJson("/teams?sport=" + encodeURIComponent(sport) + "&source=pro");
          const teams = (resp?.status === 200 && resp?.json && Array.isArray(resp.json.teams)) ? resp.json.teams : [];

          const sel = $("teamLive");
          sel.innerHTML = "";

          if (!teams.length) {
            const opt = document.createElement("option");
            opt.value = TIMER_VALUE;
            opt.textContent = "Timer…";
            sel.appendChild(opt);
            sel.value = TIMER_VALUE;
            setView("timer");
            return;
          }

          for (const t of teams) {
            const abbr = String(t?.abbr || "").trim().toUpperCase();
            if (!abbr) continue;
            const name = String(t?.name || abbr).trim() || abbr;
            const opt = document.createElement("option");
            opt.value = abbr;
            opt.textContent = formatTeamDisplay(name, abbr);
            sel.appendChild(opt);
          }

          // Timer option at bottom.
          const timerOpt = document.createElement("option");
          timerOpt.value = TIMER_VALUE;
          timerOpt.textContent = "Timer…";
          sel.appendChild(timerOpt);

          // Restore last selection if possible.
          const remembered = cookieGet("ui_live_team_" + sport.toLowerCase());
          if (remembered && Array.from(sel.options).some((o) => o.value === remembered)) {
            sel.value = remembered;
            state.liveTeam = remembered;
          } else {
            sel.value = sel.options[0]?.value || TIMER_VALUE;
            state.liveTeam = sel.value;
          }

          setView(sel.value === TIMER_VALUE ? "timer" : "score");
        } catch {
          try { $("teamLive").innerHTML = '<option value="' + TIMER_VALUE + '">Timer…</option>'; } catch {}
        }
      }

      inferSource();
      applyTheme();
      applyTabs();
      applyDisplayMode();
      setView(state.view);

      function buildControlPayload(opts) {
        const device_id = $("device").value.trim() || "matrix-01";
        const sport = $("sport").value.trim();
        const view = state.view;
        let team = "";
        if (view === "timer") {
          team = parseTeamAbbr($("team").value);
        } else {
          team = String($("teamLive").value || "").trim().toUpperCase();
        }
        const source = $("source").value.trim() || (sportToSource[sport] || "pro");

        const tz = $("tz").value || "ct";

        const brightnessRaw = parseFloat(String(state.brightness || "").trim());
        const brightness = Number.isFinite(brightnessRaw) ? Math.min(1, Math.max(0.05, brightnessRaw)) : 0.22;

        const clock = (opts && opts.forceClock) || state.display === "clock";
        const mode = clock ? "idle" : "auto";
        return { device_id, source, sport, team, view, mode, tz, brightness };
      }

      async function postControl(payload) {
        const token = $("token").value.trim();
        cookieSet("ui_token", token);
        cookieSet("ui_device", $("device").value.trim());
        cookieSet("ui_sport", $("sport").value.trim());
        cookieSet("ui_view", String(state.view || "score"));
        if (String(state.view) === "timer") {
          cookieSet(teamCookieKey($("sport").value.trim()), $("team").value);
        } else {
          const s = $("sport").value.trim().toLowerCase();
          cookieSet("ui_live_team_" + s, String($("teamLive").value || ""));
        }
        cookieSet("ui_source", $("source").value.trim());
        cookieSet("ui_tz", $("tz").value);
        cookieSet("ui_brightness", String(state.brightness));
        const res = await fetch("/control", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": token ? (token.startsWith("Bearer ") ? token : ("Bearer " + token)) : "",
          },
          body: JSON.stringify(payload),
        });
        const txt = await res.text();
        try { return { status: res.status, json: JSON.parse(txt) }; } catch { return { status: res.status, text: txt }; }
      }

      async function getJson(path) {
        const res = await fetch(path, { method: "GET" });
        const txt = await res.text();
        try { return { status: res.status, json: JSON.parse(txt) }; } catch { return { status: res.status, text: txt }; }
      }

      function show(obj) { out.textContent = JSON.stringify(obj, null, 2); }

      function teamDisplayFromControl(sport, teamCode) {
        const code = String(teamCode || "").trim().toUpperCase();
        if (!code) return "";

        const arr = teamOptionsForSport(sport);
        for (const [name, abbr] of arr) {
          const a = String(abbr || "").trim().toUpperCase();
          const n = String(name || "").trim().toUpperCase();
          if (a && a === code) return formatTeamDisplay(name, abbr);
          if (sport === "cbb" && n && n === code) return formatTeamDisplay(name, abbr);
        }

        // Fallback: show the raw code/name.
        return code;
      }

      function setCurrentSummary(control) {
        const el = $("currentText");
        if (!el) return;

        if (!control || typeof control !== "object") {
          el.textContent = "(unknown)";
          return;
        }

        const device = String(control.device_id || "").trim() || "matrix-01";
        const sport = String(control.sport || "").trim().toLowerCase();
        const source = String(control.source || "").trim().toLowerCase();
        const mode = String(control.mode || "auto").trim().toLowerCase();
        const tz = String(control.tz || "ct").trim().toLowerCase() || "ct";
        const view = String(control.view || "score").trim().toLowerCase();
        const teamRaw = String(control.team || "").trim();
        const teamDisp = teamDisplayFromControl(sport, teamRaw) || teamRaw;

        if (mode === "idle") {
          el.textContent = "Clock · " + tz.toUpperCase() + " · device " + device;
          return;
        }

        const sportLabel = (sport === "nfl") ? "NFL"
          : (sport === "nba") ? "NBA"
          : (sport === "mlb") ? "MLB"
          : (sport === "nhl") ? "NHL"
          : (sport === "softball") ? "NCAA Softball"
          : (sport === "cbb") ? "NCAA Basketball"
          : (sport === "dev") ? "DEV"
          : String(sport || "").toUpperCase();

        const src = source ? (" · src " + source) : "";
        const kind = view === "timer" ? "Timer" : "Scoreboard";
        el.textContent = kind + " · " + sportLabel + (teamDisp ? (" · " + teamDisp) : "") + " · device " + device + src;
      }

      function computeSendLabel() {
        const currentMode = String(state.currentMode || "").trim().toLowerCase();
        if (!currentMode) return "Send";
        const currentIsClock = currentMode === "idle";
        const desiredIsClock = state.display === "clock";
        if (currentIsClock !== desiredIsClock) {
          return desiredIsClock ? "Set To Clock & Send" : "Set To Scoreboard & Send";
        }
        return "Send";
      }

      function refreshSendButtonLabel() {
        const btn = $("send");
        if (!btn) return;
        if (btn.classList.contains("loading")) return;
        $("sendText").textContent = computeSendLabel();
      }

      function applyControlToUi(control) {
        if (!control || typeof control !== "object") return;

        const device_id = String(control.device_id || "").trim() || "matrix-01";
        const sport = String(control.sport || "").trim() || "nfl";
        const source = String(control.source || "").trim() || (sportToSource[sport] || "pro");
        const team = String(control.team || "").trim();
        const view = String(control.view || "score").trim().toLowerCase();
        const mode = String(control.mode || "auto").trim().toLowerCase();
        const tz = String(control.tz || "ct").trim().toLowerCase() || "ct";
        const brightness = Number(control.brightness);

        // Update state + cookies first
        state.device = device_id;
        state.sport = sport;
        setView(view);
        state.source = source;
        state.tz = tz;
        state.display = mode === "idle" ? "clock" : "scoreboard";
        state.currentMode = mode;

        cookieSet("ui_device", device_id);
        cookieSet("ui_sport", sport);
        cookieSet("ui_source", source);
        cookieSet("ui_tz", tz);

        if (Number.isFinite(brightness)) {
          const b = Math.min(1, Math.max(0.05, brightness));
          state.brightness = b;
          cookieSet("ui_brightness", String(b));
          if ($("brightness")) $("brightness").value = String(b);
          if ($("brightnessNum")) $("brightnessNum").value = String(b);
        }

        // If server source doesn't match the sport default mapping, mark it as overridden.
        const inferred = sportToSource[sport] || "pro";
        state.sourceOverride = source !== inferred;
        cookieSet("ui_src_override", state.sourceOverride ? "1" : "0");

        // Reflect in UI fields (setting .value does not trigger change events)
        $("device").value = device_id;
        $("sport").value = sport;
        $("source").value = source;
        $("tz").value = tz;
        applyDisplayMode();

        const teamDisplay = teamDisplayFromControl(sport, team);
        state.team = teamDisplay;
        $("team").value = teamDisplay;
        cookieSet(teamCookieKey(sport), teamDisplay);

        // Live team picker prefers storing a team code.
        try {
          const sportKey = String(sport || "").trim().toLowerCase();
          if (team) cookieSet("ui_live_team_" + sportKey, String(team || ""));
        } catch {}

        setCurrentSummary(control);
        refreshSendButtonLabel();
        loadLiveTeams();
      }

      // On load, read back the saved control so the UI reflects what's actually stored.
      (async () => {
        try {
          const device = $("device").value.trim() || "matrix-01";
          const resp = await getJson("/control?device_id=" + encodeURIComponent(device));
          if (resp?.status === 200 && resp?.json) {
            applyControlToUi(resp.json);
            return;
          }
        } catch {}

        // Fallback: reflect local form state.
        try {
          const control = {
            device_id: $("device").value.trim() || "matrix-01",
            sport: $("sport").value,
            source: $("source").value,
            team: state.view === "timer" ? parseTeamAbbr($("team").value) : String($("teamLive").value || "").trim().toUpperCase(),
            view: state.view,
            mode: state.display === "clock" ? "idle" : "auto",
            tz: $("tz").value || "ct",
          };
          state.currentMode = String(control.mode || "").trim().toLowerCase();
          setCurrentSummary(control);
          refreshSendButtonLabel();
        } catch {}
      })();

      function setSendState(kind, label) {
        const btn = $("send");
        btn.classList.remove("ok", "err", "loading");
        if (kind) btn.classList.add(kind);
        $("sendText").textContent = label || computeSendLabel();
      }

      $("send").addEventListener("click", async () => {
        try {
          setSendState("loading", "Sending…");
          const payload = buildControlPayload({ forceClock: false });
          show({ sending: payload });
          const resp = await postControl(payload);

          // Always show the response (advanced users), but also keep the form in sync.
          show(resp);

          if (resp && resp.status >= 200 && resp.status < 300) {
            const control = resp?.json?.control;
            if (control) {
              applyControlToUi(control);
            } else {
              // Fallback: read back current control.
              const device = $("device").value.trim() || "matrix-01";
              const readback = await getJson("/control?device_id=" + encodeURIComponent(device));
              if (readback?.status === 200 && readback?.json) applyControlToUi(readback.json);
            }
            setSendState("ok", "Sent");
            setTimeout(() => setSendState("", null), 900);
          } else {
            setSendState("err", "Error");
            setTimeout(() => setSendState("", null), 1400);
          }
        } catch (e) {
          show({ error: String(e && e.message ? e.message : e) });
          setSendState("err", "Error");
          setTimeout(() => setSendState("", null), 1400);
        }
      });

      $("getControl").addEventListener("click", async () => {
        const device = $("device").value.trim();
        const resp = await getJson("/control?device_id=" + encodeURIComponent(device));
        show(resp);
        if (resp?.status === 200 && resp?.json) {
          applyControlToUi(resp.json);
        }
      });

      $("getScore").addEventListener("click", async () => {
        const device = $("device").value.trim();
        show(await getJson("/score?device_id=" + encodeURIComponent(device)));
      });

      $("getHealth").addEventListener("click", async () => {
        show(await getJson("/health"));
      });

      $("copyLink").addEventListener("click", async () => {
        const device = $("device").value.trim() || "matrix-01";
        const link = window.location.origin + "/ui?device_id=" + encodeURIComponent(device);
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(link);
            show({ copied: link });
            return;
          }
        } catch {}

        try {
          window.prompt("Copy this link:", link);
          show({ link });
        } catch {
          show({ link });
        }
      });

      $("tabBasic").addEventListener("click", () => {
        state.advanced = false;
        applyTabs();
      });
      $("tabAdv").addEventListener("click", () => {
        state.advanced = true;
        applyTabs();
      });

      $("themeSwitch").addEventListener("click", () => {
        state.dark = !state.dark;
        applyTheme();
      });

      $("displaySwitch").addEventListener("click", () => {
        state.display = state.display === "clock" ? "scoreboard" : "clock";
        applyDisplayMode();
        refreshSendButtonLabel();
      });

      $("sport").addEventListener("change", () => {
        state.sport = $("sport").value;
        cookieSet("ui_sport", state.sport);
        // Sport change always forces default source mapping.
        state.sourceOverride = false;
        cookieSet("ui_src_override", "0");
        inferSource();

        const remembered = cookieGet(teamCookieKey(state.sport));
        state.team = remembered || defaultTeamForSport(state.sport);
        if (state.team) {
          $("team").value = state.team;
          cookieSet(teamCookieKey(state.sport), state.team);
        }
        closeTeamDropdown();
        setView("score");
        loadLiveTeams();
      });

      $("team").addEventListener("change", () => {
        state.team = $("team").value;
        cookieSet(teamCookieKey(state.sport), state.team);
      });

      $("teamLive").addEventListener("change", () => {
        const v = String($("teamLive").value || "").trim();
        if (v === TIMER_VALUE) {
          setView("timer");
          return;
        }
        state.liveTeam = v;
        try { cookieSet("ui_live_team_" + String(state.sport || "").toLowerCase(), v); } catch {}
        setView("score");
      });

      $("team").addEventListener("focus", () => {
        openTeamDropdown();
      });

      $("team").addEventListener("input", () => {
        state.team = $("team").value;
        renderTeamDropdown(state.team);
      });

      $("reloadBtn").addEventListener("click", () => {
        // Reload with fresh /teams + /control data.
        try { window.location.reload(); } catch {}
      });

      $("teamBtn").addEventListener("click", () => {
        const open = !$("teamList").classList.contains("advHidden");
        if (open) closeTeamDropdown();
        else openTeamDropdown();
      });

      document.addEventListener("click", (e) => {
        const combo = e.target && (e.target.closest ? e.target.closest(".combo") : null);
        if (!combo) closeTeamDropdown();
      });

      $("tz").addEventListener("change", () => {
        state.tz = $("tz").value;
        cookieSet("ui_tz", state.tz);
      });

      // Modal
      function openInfo() { $("infoModal").classList.remove("advHidden"); }
      function closeInfo() { $("infoModal").classList.add("advHidden"); }

      function openSettings() {
        if ($("brightness")) $("brightness").value = String(state.brightness);
        if ($("brightnessNum")) $("brightnessNum").value = String(state.brightness);
        $("settingsModal").classList.remove("advHidden");
      }
      function closeSettings() { $("settingsModal").classList.add("advHidden"); }

      // Safety: never show modal on initial load.
      closeInfo();
      closeSettings();
      $("infoBtn").addEventListener("click", openInfo);
      $("settingsBtn").addEventListener("click", openSettings);
      $("closeInfo").addEventListener("click", closeInfo);
      $("closeSettings").addEventListener("click", closeSettings);
      $("infoModal").addEventListener("click", (e) => {
        if (e.target && e.target.id === "infoModal") closeInfo();
      });

      $("settingsModal").addEventListener("click", (e) => {
        if (e.target && e.target.id === "settingsModal") closeSettings();
      });

      // Populate live teams on initial load.
      loadLiveTeams();

      function setBrightness(v) {
        const n = parseFloat(String(v || "").trim());
        if (!Number.isFinite(n)) return;
        const b = Math.min(1, Math.max(0.05, n));
        state.brightness = b;
        cookieSet("ui_brightness", String(b));
        $("brightness").value = String(b);
        $("brightnessNum").value = String(b);
      }

      $("brightness").addEventListener("input", () => setBrightness($("brightness").value));
      $("brightnessNum").addEventListener("change", () => setBrightness($("brightnessNum").value));

      $("applySettings").addEventListener("click", async () => {
        try {
          setSendState("loading", "Sending…");
          const payload = buildControlPayload({ forceClock: false });
          show({ sending: payload });
          const resp = await postControl(payload);
          show(resp);
          if (resp && resp.status >= 200 && resp.status < 300) {
            const control = resp?.json?.control;
            if (control) applyControlToUi(control);
            setSendState("ok", "Sent");
            setTimeout(() => setSendState("", null), 900);
            closeSettings();
          } else {
            setSendState("err", "Error");
            setTimeout(() => setSendState("", null), 1400);
          }
        } catch (e) {
          show({ error: String(e && e.message ? e.message : e) });
          setSendState("err", "Error");
          setTimeout(() => setSendState("", null), 1400);
        }
      });

      $("source").addEventListener("change", () => {
        state.sourceOverride = true;
        cookieSet("ui_src_override", "1");
        state.source = $("source").value;
        cookieSet("ui_source", state.source);
      });
    </script>
  </body>
</html>`;
}

async function handlePostControl(request, env) {
  // Public control is enabled (no token required) per UI requirements.
  // If an Authorization header is provided, validate it when CONTROL_TOKEN exists.
  const auth = request.headers.get("Authorization") || "";
  const expectedToken = env.CONTROL_TOKEN;
  if (auth) {
    if (!expectedToken) {
      return jsonResponse({ error: "CONTROL_TOKEN is not configured" }, 500);
    }
    if (!auth.startsWith("Bearer ") || auth.slice(7) !== expectedToken) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const deviceId = sanitizeDeviceId(body.device_id);
  if (!deviceId) {
    return jsonResponse({ error: "Missing or invalid device_id" }, 400);
  }

  const control = normalizeControl(body, deviceId);
  await putControl(env, control);
  return jsonResponse({ ok: true, control });
}

async function handleGetControl(searchParams, env) {
  const deviceId = sanitizeDeviceId(searchParams.get("device_id"));
  if (!deviceId) {
    return jsonResponse({ error: "Missing device_id" }, 400);
  }

  const control = await getControl(env, deviceId);
  return jsonResponse(control);
}

async function handleGetScore(searchParams, env) {
  const deviceId = sanitizeDeviceId(searchParams.get("device_id"));
  if (!deviceId) {
    return jsonResponse({ error: "Missing device_id" }, 400);
  }

  const control = await getControl(env, deviceId);
  let payload;

  // DEV mode: UI can set team=DEV to get fake, always-on scoreboard data
  // without hitting any upstream sports APIs.
  if (String(control?.sport || "").toLowerCase() === "dev" || String(control?.team || "").toUpperCase() === "DEV") {
    payload = makeDevScorePayload(control);
    return jsonResponse(finalizeDisplayPayload(payload));
  }

  // Timer view: countdown to next game (days:hours:minutes on device).
  // Implemented for ESPN Pro sports first.
  if (String(control?.view || "").toLowerCase() === "timer") {
    if (String(control?.source || "").toLowerCase() === "pro") {
      payload = await fetchProNextGameCountdown(control, env);
      return jsonResponse(finalizeDisplayPayload(payload));
    }
    // Fallback: if timer requested for unsupported sources, just return normal score payload.
  }

  if (isWorldCupControl(control)) {
    payload = await fetchSoccerScore(control, env, "world-cup");
  } else if (control.source === "pro") {
    payload = isIndividualSportControl(control)
      ? await fetchIndividualSportScore(control, env)
      : isRegularSoccerControl(control)
        ? await fetchSoccerScore(control, env, "regular")
      : await fetchProScore(control, env);
  } else if (isOlympicsControl(control)) {
    payload = isOlympicIndividualSport(control.sport)
      ? await fetchIndividualSportScore(control, env, "olympics")
      : await fetchOlympicsScore(control, env);
  } else if (isNcaaBasketballControl(control)) {
    payload = await fetchNcaaBasketballScore(control, env);
  } else if (isNcaaSoftballControl(control)) {
    payload = await fetchNcaaSoftballScore(control, env);
  } else {
    payload = await fetchWellesleyScore(control, env);
  }

  return jsonResponse(finalizeDisplayPayload(payload));
}

async function handleGetTeams(searchParams, env) {
  const sport = (searchParams.get("sport") || "nfl").toString().trim().toLowerCase();
  const source = (searchParams.get("source") || "pro").toString().trim().toLowerCase();

  // Only implemented for ESPN-backed "pro" sports right now.
  if (source !== "pro") {
    return jsonResponse({ sport, source, teams: [], updated_at: Math.floor(Date.now() / 1000) });
  }

  const baseUrl = env.SPORTS_API_URL;
  if (!baseUrl) {
    return jsonResponse({ sport, source, teams: [], updated_at: Math.floor(Date.now() / 1000) });
  }

  try {
    const url = buildProUrlForDateCompact(baseUrl, sport, false, formatDateCompact(new Date()));
    const resp = await fetch(url, {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 15, cacheEverything: false },
    });
    if (!resp.ok) {
      return jsonResponse({ sport, source, teams: [], updated_at: Math.floor(Date.now() / 1000) });
    }
    const data = await resp.json().catch(() => null);
    const teams = extractLiveTeamsFromEspnScoreboard(data);
    return jsonResponse({ sport, source, teams, updated_at: Math.floor(Date.now() / 1000) });
  } catch {
    return jsonResponse({ sport, source, teams: [], updated_at: Math.floor(Date.now() / 1000) });
  }
}

function makeDevScorePayload(control) {
  const step = Math.floor(Date.now() / 5000);
  const seedBase = (String(control?.device_id || "") + "|" + String(control?.sport || "") + "|" + String(control?.team || "") + "|" + String(step)).toUpperCase();

  // Simple deterministic hash -> PRNG (stable for 5s windows).
  let h = 2166136261;
  for (let i = 0; i < seedBase.length; i++) {
    h ^= seedBase.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let x = h >>> 0;
  const rand32 = () => {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
  const randInt = (lo, hi) => {
    if (hi <= lo) return lo;
    return lo + (rand32() % (hi - lo + 1));
  };
  const randColor = () => {
    const v = rand32() & 0xffffff;
    return "#" + v.toString(16).padStart(6, "0");
  };

  const pickAbbr = (v) => {
    const s = String(v || "").toUpperCase();
    const cleaned = s.replace(/[^A-Z0-9]/g, "");
    if (cleaned.length >= 3) return cleaned.slice(0, 3);
    if (cleaned.length === 2) return cleaned + "X";
    if (cleaned.length === 1) return cleaned + "XX";
    return "DEV";
  };

  const home_abbr = pickAbbr(control?.team || "DEV");
  let away_abbr = pickAbbr("AWY");
  // Ensure different abbreviations.
  if (away_abbr === home_abbr) away_abbr = pickAbbr("OPP");
  const home_score = randInt(0, 300);
  const away_score = randInt(0, 300);

  return {
    status: "LIVE",
    view_unavailable: false,
    display_text: "DEV",
    message: "DEV",
    at: "home",
    team_abbr: home_abbr,
    opponent_abbr: away_abbr,
    team: home_abbr,
    opponent: away_abbr,
    team_name: "Home",
    opponent_name: "Away",
    team_score: home_score,
    opp_score: away_score,
    team_primary: randColor(),
    team_secondary: "#FFFFFF",
    opp_primary: randColor(),
    opp_secondary: "#FFFFFF",
  };
}

async function handleHealth(env) {
  const today = new Date();
  const ymd = formatDateYMD(today);
  const compact = formatDateCompact(today);

  const checks = {
    control_kv: {
      configured: !!env.CONTROL_KV,
      reachable: !!env.CONTROL_KV,
      detail: env.CONTROL_KV ? "KV binding present" : "Missing CONTROL_KV binding",
    },
    control_token: {
      configured: !!env.CONTROL_TOKEN,
      reachable: !!env.CONTROL_TOKEN,
      detail: env.CONTROL_TOKEN ? "Token configured" : "Missing CONTROL_TOKEN secret",
    },
    sports_api: await probeEndpoint(env.SPORTS_API_URL, {
      url: buildProUrl(env.SPORTS_API_URL || "", "nfl", false),
      headers: { Accept: "application/json" },
      name: "SPORTS_API_URL",
    }),
    ncaa_softball: await probeEndpoint(env.NCAA_SOFTBALL_API_URL, {
      url: buildNcaaSoftballUrl(env.NCAA_SOFTBALL_API_URL || ""),
      headers: { Accept: "application/json" },
      name: "NCAA_SOFTBALL_API_URL",
    }),
    ncaa_basketball: await probeEndpoint(env.NCAA_BASKETBALL_API_URL, {
      url: buildNcaaBasketballUrl(env.NCAA_BASKETBALL_API_URL || ""),
      headers: { Accept: "application/json" },
      name: "NCAA_BASKETBALL_API_URL",
    }),
    olympics: await probeEndpoint(env.OLYMPICS_API_URL, {
      url: buildOlympicsUrl(env.OLYMPICS_API_URL || "", env, "olympic-basketball"),
      headers: { Accept: "application/json" },
      name: "OLYMPICS_API_URL",
    }),
    soccer: await probeEndpoint(env.SOCCER_API_URL, {
      url: buildSoccerUrl(env.SOCCER_API_URL || "", "regular"),
      headers: buildSoccerHeaders(env),
      name: "SOCCER_API_URL",
    }),
    individual: await probeEndpoint(env.INDIVIDUAL_SPORTS_API_URL, {
      url: buildIndividualSportUrl(env.INDIVIDUAL_SPORTS_API_URL || "", "tennis-singles", "pro"),
      headers: { Accept: "application/json" },
      name: "INDIVIDUAL_SPORTS_API_URL",
    }),
    wellesley: await probeEndpoint(env.WELLESLEY_SOFTBALL_URL || "https://athletics.wellesley.edu/sports/softball/schedule_text", {
      url: env.WELLESLEY_SOFTBALL_URL || "https://athletics.wellesley.edu/sports/softball/schedule_text",
      headers: { Accept: "text/plain,application/json" },
      name: "WELLESLEY_SOFTBALL_URL",
    }),
  };

  const requiredKeys = ["control_kv", "control_token", "sports_api", "ncaa_softball", "ncaa_basketball", "soccer", "wellesley"];
  const required_ok = requiredKeys.every((k) => checks[k]?.configured && checks[k]?.reachable);
  const optional_ok = ["olympics", "individual"].every((k) => !checks[k]?.configured || checks[k]?.reachable);

  return jsonResponse({
    worker_version: WORKER_VERSION,
    status: required_ok ? (optional_ok ? "ok" : "degraded") : "error",
    now_utc: ymd,
    now_compact: compact,
    checks,
  });
}

async function probeEndpoint(configValue, options) {
  const configured = !!configValue;
  if (!configured) {
    return {
      configured: false,
      reachable: false,
      detail: `Missing ${options.name}`,
    };
  }

  try {
    const res = await fetch(options.url, {
      method: "GET",
      headers: options.headers || { Accept: "application/json" },
      cf: { cacheTtl: 5, cacheEverything: false },
    });

    const reachable = res.status < 500;
    return {
      configured: true,
      reachable,
      status_code: res.status,
      detail: reachable ? "endpoint reachable" : "server error",
    };
  } catch (e) {
    return {
      configured: true,
      reachable: false,
      detail: String(e?.message || e),
    };
  }
}

function finalizeDisplayPayload(payload) {
  const out = payload && typeof payload === "object" ? { ...payload } : {};
  const hasScore = out.team_score !== null && out.team_score !== undefined && out.opp_score !== null && out.opp_score !== undefined;
  const hasCountdown = out.countdown_active === true;

  if (!hasScore && !hasCountdown) {
    out.status = "NONE";
    out.view_unavailable = true;
    out.display_text = "VIEW UNAVAILIBLE";
    out.message = "VIEW UNAVAILIBLE";
  }

  return out;
}

function sanitizeDeviceId(value) {
  if (!value || typeof value !== "string") return "";
  const cleaned = value.trim();
  if (!cleaned) return "";
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(cleaned)) return "";
  return cleaned;
}

function normalizeControl(input, deviceId) {
  const normalizedSource = (input.source || "").toString().trim().toLowerCase();
  const source = ["pro", "wellesley", ...NCAA_SOURCE_KEYS, ...NCAA_BASKETBALL_SOURCE_KEYS, ...OLYMPICS_SOURCE_KEYS, ...WORLD_CUP_SOURCE_KEYS].includes(normalizedSource)
    ? normalizedSource
    : DEFAULT_CONTROL.source;
  const normalizedSport = (input.sport || "").toString().trim().toLowerCase();
  const sport = [
    "dev",
    "nfl",
    "nba",
    "mlb",
    "nhl",
    "softball",
    "cbb",
    ...OLYMPIC_TEAM_SPORTS,
    ...OLYMPIC_INDIVIDUAL_SPORTS,
    ...INDIVIDUAL_SPORTS,
    ...SOCCER_SPORT_KEYS,
  ].includes(normalizedSport)
    ? normalizedSport
    : DEFAULT_CONTROL.sport;
  const teamRaw = (input.team || DEFAULT_CONTROL.team || "").toString().trim().toUpperCase();
  const team = normalizeTeamCodeFromInput(teamRaw);

  const normalizedView = (input.view || "").toString().trim().toLowerCase();
  const view = ["score", "timer"].includes(normalizedView) ? normalizedView : DEFAULT_CONTROL.view;
  const mode = ["auto", "force-live", "idle"].includes(input.mode)
    ? input.mode
    : DEFAULT_CONTROL.mode;

  const normalizedTz = (input.tz || "").toString().trim().toLowerCase();
  const tz = ["utc", "et", "ct", "mt", "pt"].includes(normalizedTz) ? normalizedTz : DEFAULT_CONTROL.tz;

  const rawBrightness = Number(input.brightness);
  const brightness = Number.isFinite(rawBrightness)
    ? Math.min(1, Math.max(0.05, rawBrightness))
    : (Number(DEFAULT_CONTROL.brightness) || 0.22);

  return {
    device_id: deviceId,
    source,
    sport,
    team,
    view,
    mode,
    tz,
    brightness,
    updated_at: Math.floor(Date.now() / 1000),
  };
}

function normalizeTeamCodeFromInput(teamRaw) {
  const s = (teamRaw || "").toString().trim().toUpperCase();
  if (!s) return "";
  // If UI accidentally sends a display string like "Arizona Cardinals (ARI)",
  // extract the code in parentheses.
  const m = s.match(/\(([A-Z0-9]{2,10})\)\s*$/);
  if (m) return m[1];
  return s;
}

function isNcaaSoftballControl(control) {
  const source = (control?.source || "").toString().trim().toLowerCase();
  const sport = (control?.sport || "").toString().trim().toLowerCase();
  return NCAA_SOURCE_KEYS.includes(source) || sport === "softball";
}

function isNcaaBasketballControl(control) {
  const source = (control?.source || "").toString().trim().toLowerCase();
  const sport = (control?.sport || "").toString().trim().toLowerCase();
  return NCAA_BASKETBALL_SOURCE_KEYS.includes(source) || sport === "cbb";
}

function isOlympicsControl(control) {
  const source = (control?.source || "").toString().trim().toLowerCase();
  const sport = (control?.sport || "").toString().trim().toLowerCase();
  return OLYMPICS_SOURCE_KEYS.includes(source) || isOlympicSportValue(sport);
}

function isOlympicSportValue(sportValue) {
  const sport = (sportValue || "").toString().trim().toLowerCase();
  return sport.startsWith("olympic-") || OLYMPIC_INDIVIDUAL_SPORTS.includes(sport);
}

function isWorldCupControl(control) {
  const source = (control?.source || "").toString().trim().toLowerCase();
  return WORLD_CUP_SOURCE_KEYS.includes(source);
}

function isRegularSoccerControl(control) {
  const sport = (control?.sport || "").toString().trim().toLowerCase();
  return SOCCER_SPORT_KEYS.includes(sport);
}

function isIndividualSportControl(control) {
  const sport = canonicalIndividualSport((control?.sport || "").toString().trim().toLowerCase());
  return sport === "golf" || sport === "tennis-singles";
}

function isOlympicIndividualSport(sportValue) {
  const sport = (sportValue || "").toString().trim().toLowerCase();
  return OLYMPIC_INDIVIDUAL_SPORTS.includes(sport) || sport.startsWith("olympic-tennis") || sport === "olympic-golf";
}

async function fetchSoccerScore(control, env, mode = "regular") {
  const requestedTeam = (control.team || "").toString().trim();
  const baseUrl = env.SOCCER_API_URL || env.SPORTS_API_URL;
  if (!baseUrl) {
    return makeSoccerMock(requestedTeam, mode, "SCHEDULED");
  }

  const upstreamUrl = buildSoccerUrl(baseUrl, mode);
  const headers = buildSoccerHeaders(env);

  try {
    const resp = await fetch(upstreamUrl, {
      headers,
      cf: { cacheTtl: 20, cacheEverything: false },
    });
    if (!resp.ok) return makeSoccerMock(requestedTeam, mode, "SCHEDULED");

    const data = await resp.json().catch(() => null);
    if (!data) return makeSoccerMock(requestedTeam, mode, "SCHEDULED");

    const adapted = adaptUpstreamPayload(data, { sport: "soccer", source: mode === "world-cup" ? "world-cup" : "pro" });
    const normalized = normalizeSoccerUpstream(adapted, requestedTeam, mode);
    return normalized || makeSoccerMock(requestedTeam, mode, "SCHEDULED");
  } catch {
    return makeSoccerMock(requestedTeam, mode, "SCHEDULED");
  }
}

function normalizeSoccerUpstream(data, requestedTeam, mode = "regular") {
  const req = (requestedTeam || "").toString().trim().toUpperCase();
  const context = pickTeamGameContext(data, req);
  const game = context?.game;
  if (!game) return null;

  const normalized = normalizeHeadToHeadGame({
    game,
    requestedTeam: req,
    source: mode === "world-cup" ? "world-cup" : "pro",
    sport: mode === "world-cup" ? "world-cup-soccer" : "soccer",
    gameTime: game.game_time || game.start_time || game.kickoff || game.scheduled_at || null,
  });

  if (context?.kind === "next") {
    normalized.status = "SCHEDULED";
    normalized.team_score = null;
    normalized.opp_score = null;
  }

  normalized.tournament =
    game.tournament ||
    game.competition ||
    game.league ||
    (mode === "world-cup" ? "FIFA World Cup" : "Soccer");
  if (mode === "world-cup") {
    normalized.event = "WORLD_CUP";
    normalized.event_name = "FIFA World Cup";
  }

  const withTimer = withCountdownFromGame(normalized, game, context?.kind === "next");
  return withTeamMeta(withTimer, game);
}

function makeSoccerMock(requestedTeam, mode = "regular", status = "SCHEDULED") {
  return withTeamMeta({
    source: mode === "world-cup" ? "world-cup" : "pro",
    sport: mode === "world-cup" ? "world-cup-soccer" : "soccer",
    team: (requestedTeam || "TEAM").toString().toUpperCase(),
    opponent: "OPP",
    team_score: status === "SCHEDULED" ? null : 0,
    opp_score: status === "SCHEDULED" ? null : 0,
    status,
    game_time: null,
    at: "Neutral",
    tournament: mode === "world-cup" ? "FIFA World Cup" : "Soccer",
    event: mode === "world-cup" ? "WORLD_CUP" : undefined,
    event_name: mode === "world-cup" ? "FIFA World Cup" : undefined,
  });
}

async function getControl(env, deviceId) {
  const raw = await env.CONTROL_KV?.get(kvKey(deviceId));
  if (!raw) {
    return {
      device_id: deviceId,
      ...DEFAULT_CONTROL,
      updated_at: Math.floor(Date.now() / 1000),
    };
  }

  try {
    const parsed = JSON.parse(raw);
    return normalizeControl(parsed, deviceId);
  } catch {
    return {
      device_id: deviceId,
      ...DEFAULT_CONTROL,
      updated_at: Math.floor(Date.now() / 1000),
    };
  }
}

async function putControl(env, control) {
  if (!env.CONTROL_KV) {
    throw new Error("Missing CONTROL_KV binding");
  }
  await env.CONTROL_KV.put(kvKey(control.device_id), JSON.stringify(control));
}

function kvKey(deviceId) {
  return `device:${deviceId}`;
}

async function fetchProScore(control, env) {
  const baseUrl = env.SPORTS_API_URL;

  if (!baseUrl) {
    return makeProMock(control, "SCHEDULED");
  }

  const wantsSuperBowl = isSuperBowlControl(control);
  const upstreamUrl = buildProUrl(baseUrl, control.sport, wantsSuperBowl);

  try {
    const resp = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
      },
      cf: { cacheTtl: 20, cacheEverything: false },
    });

    if (!resp.ok) {
      return makeProMock(control, "SCHEDULED");
    }

    const data = await resp.json().catch(() => null);
    if (!data) {
      return makeProMock(control, "SCHEDULED");
    }

    const adapted = adaptUpstreamPayload(data, { sport: control.sport, source: "pro" });

    const normalized = normalizeProUpstream(adapted, control);
    return normalized || makeProMock(control, "SCHEDULED");
  } catch {
    return makeProMock(control, "SCHEDULED");
  }
}

async function fetchIndividualSportScore(control, env, sourceOverride = "pro") {
  const requested = (control.team || "").toString().trim();
  const sport = canonicalIndividualSport(control.sport);

  const baseUrl =
    sourceOverride === "olympics"
      ? env.OLYMPICS_API_URL || env.INDIVIDUAL_SPORTS_API_URL || env.SPORTS_API_URL
      : env.INDIVIDUAL_SPORTS_API_URL || env.SPORTS_API_URL;

  if (!baseUrl) {
    return makeIndividualSportMock(requested, sport, sourceOverride, "SCHEDULED");
  }

  const upstreamUrl = buildIndividualSportUrl(baseUrl, sport, sourceOverride);

  try {
    const resp = await fetch(upstreamUrl, {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 15, cacheEverything: false },
    });

    if (!resp.ok) {
      return makeIndividualSportMock(requested, sport, sourceOverride, "SCHEDULED");
    }

    const data = await resp.json().catch(() => null);
    if (!data) {
      return makeIndividualSportMock(requested, sport, sourceOverride, "SCHEDULED");
    }

    const adapted = adaptUpstreamPayload(data, {
      sport,
      source: sourceOverride,
      individual: true,
    });

    const normalized = normalizeIndividualSportUpstream(adapted, requested, sport, sourceOverride);
    return normalized || makeIndividualSportMock(requested, sport, sourceOverride, "SCHEDULED");
  } catch {
    return makeIndividualSportMock(requested, sport, sourceOverride, "SCHEDULED");
  }
}

function canonicalIndividualSport(sportValue) {
  const raw = (sportValue || "").toString().trim().toLowerCase();
  if (raw === "tennis" || raw === "tennis_singles" || raw === "olympic-tennis" || raw === "olympic-tennis-singles") {
    return "tennis-singles";
  }
  if (raw === "olympic-golf") return "golf";
  return raw;
}

function normalizeIndividualSportUpstream(data, requested, sport, sourceOverride) {
  if (sport === "golf") {
    return normalizeGolfUpstream(data, requested, sourceOverride);
  }
  if (sport === "tennis-singles") {
    return normalizeSinglesTennisUpstream(data, requested, sourceOverride);
  }
  return null;
}

function normalizeGolfUpstream(data, requested, sourceOverride) {
  const entries = extractGolfEntries(data);
  if (!entries.length) return null;

  const req = (requested || "").toString().trim().toUpperCase();
  const selected =
    entries.find((p) => playerMatches(p, req)) ||
    entries.find((p) => parseSportNumber(p.rank ?? p.position) === 1) ||
    entries[0];

  const sorted = [...entries].sort((a, b) => {
    const ra = parseSportNumber(a.rank ?? a.position);
    const rb = parseSportNumber(b.rank ?? b.position);
    if (ra === null && rb === null) return 0;
    if (ra === null) return 1;
    if (rb === null) return -1;
    return ra - rb;
  });

  const opponentEntry = sorted.find((p) => p !== selected) || selected;
  const teamName = toDisplayName(selected.name || selected.player || selected.team || requested || "PLAYER");
  const oppName = toDisplayName(opponentEntry.name || opponentEntry.player || opponentEntry.team || "FIELD");

  const selectedScore = parseSportNumber(selected.to_par ?? selected.score ?? selected.relative);
  const opponentScore = parseSportNumber(opponentEntry.to_par ?? opponentEntry.score ?? opponentEntry.relative);

  const payload = {
    source: sourceOverride,
    sport: sourceOverride === "olympics" ? "olympic-golf" : "golf",
    team: teamName,
    opponent: oppName,
    team_score: selectedScore,
    opp_score: opponentScore,
    status: normalizeStatus(data.status || selected.status || data.state || "SCHEDULED"),
    game_time: selected.tee_time || selected.start_time || data.next_start || data.start_time || null,
    at: "Neutral",
    rank: parseSportNumber(selected.rank ?? selected.position),
    opp_rank: parseSportNumber(opponentEntry.rank ?? opponentEntry.position),
    tournament: data.tournament || data.event_name || data.event || (sourceOverride === "olympics" ? "Olympics" : "Golf"),
  };

  const withTimer = withCountdownFromMs(payload, getGameStartMs(selected) || getGameStartMs(data), payload.status === "SCHEDULED");
  if (!withTimer.countdown_active && withTimer.status === "SCHEDULED" && withTimer.team_score !== null) {
    withTimer.status = "FINAL";
  }
  return withTeamMeta(withTimer, selected);
}

function normalizeSinglesTennisUpstream(data, requested, sourceOverride) {
  const req = (requested || "").toString().trim().toUpperCase();
  const matches = extractMatchCandidates(data);
  if (!matches.length) return null;

  const context = pickIndividualMatchContext(matches, req);
  const game = context.game;
  if (!game) return null;

  const p1 = toDisplayName(game.player1 || game.home_player || game.home || game.homeTeam || "PLAYER1");
  const p2 = toDisplayName(game.player2 || game.away_player || game.away || game.awayTeam || "PLAYER2");
  const pickP1 = req ? normalizeToken(p1).includes(req) || normalizeToken(req).includes(normalizeToken(p1)) : true;
  const team = pickP1 ? p1 : p2;
  const opponent = pickP1 ? p2 : p1;

  const p1Score = parseSportNumber(game.player1_sets ?? game.home_score ?? game.player1_score);
  const p2Score = parseSportNumber(game.player2_sets ?? game.away_score ?? game.player2_score);

  const payload = {
    source: sourceOverride,
    sport: sourceOverride === "olympics" ? "olympic-tennis-singles" : "tennis-singles",
    team,
    opponent,
    team_score: pickP1 ? p1Score : p2Score,
    opp_score: pickP1 ? p2Score : p1Score,
    status: normalizeStatus(game.status || game.state || data.status || "SCHEDULED"),
    game_time: game.start_time || game.match_time || game.scheduled_at || data.next_start || null,
    at: normalizeAt(game.at || game.court || "Neutral"),
    detail_score: game.scoreline || game.set_score || game.score || null,
    event: game.event || game.event_name || data.event || undefined,
    tournament: game.tournament || data.tournament || (sourceOverride === "olympics" ? "Olympics" : "Tennis"),
  };

  if (context.kind === "next") {
    payload.team_score = null;
    payload.opp_score = null;
    payload.status = "SCHEDULED";
  }

  const withTimer = withCountdownFromGame(payload, game, context.kind === "next");
  return withTeamMeta(withTimer, game);
}

function makeIndividualSportMock(requested, sport, sourceOverride = "pro", status = "SCHEDULED") {
  const olympic = sourceOverride === "olympics";
  const outSport = olympic ? (sport === "golf" ? "olympic-golf" : "olympic-tennis-singles") : sport;
  return withTeamMeta({
    source: sourceOverride,
    sport: outSport,
    team: (requested || "PLAYER").toString().toUpperCase(),
    opponent: sport === "golf" ? "FIELD" : "OPP",
    team_score: status === "SCHEDULED" ? null : 0,
    opp_score: status === "SCHEDULED" ? null : 0,
    status,
    game_time: null,
    at: "Neutral",
    tournament: olympic ? "Olympics" : undefined,
  });
}

function extractGolfEntries(data) {
  const list = Array.isArray(data?.leaderboard)
    ? data.leaderboard
    : Array.isArray(data?.players)
      ? data.players
      : Array.isArray(data?.entries)
        ? data.entries
        : Array.isArray(data)
          ? data
          : [];
  return list.filter((x) => x && typeof x === "object");
}

function extractMatchCandidates(data) {
  const list = Array.isArray(data?.matches)
    ? data.matches
    : Array.isArray(data?.games)
      ? data.games
      : Array.isArray(data?.events)
        ? data.events
        : Array.isArray(data)
          ? data
          : data?.game
            ? [data.game]
            : [];
  return list.filter((x) => x && typeof x === "object");
}

function pickIndividualMatchContext(matches, req) {
  const scoped = req ? matches.filter((m) => matchHasPlayer(m, req)) : matches;
  const pool = scoped.length ? scoped : matches;

  const live = pool.find((m) => normalizeStatus(m.status || m.state || m.match_status || "") === "LIVE");
  if (live) return { game: live, kind: "live" };

  const now = Date.now();
  const upcoming = pool
    .map((m) => ({ game: m, ms: getGameStartMs(m) }))
    .filter((x) => x.ms !== null && x.ms >= now)
    .sort((a, b) => a.ms - b.ms);
  if (upcoming.length) return { game: upcoming[0].game, kind: "next" };

  const lastFinal = pickLatestFinalGame(pool);
  if (lastFinal) return { game: lastFinal, kind: "last-final" };

  return { game: pool[0], kind: "fallback" };
}

function matchHasPlayer(match, req) {
  const p1 = toDisplayName(match.player1 || match.home_player || match.home || match.homeTeam || "");
  const p2 = toDisplayName(match.player2 || match.away_player || match.away || match.awayTeam || "");
  const tReq = normalizeToken(req);
  return normalizeToken(p1).includes(tReq) || normalizeToken(p2).includes(tReq);
}

function playerMatches(player, req) {
  const name = toDisplayName(player.name || player.player || player.team || "");
  const code = (player.code || player.abbr || player.country || "").toString().toUpperCase();
  const tReq = normalizeToken(req);
  return normalizeToken(name).includes(tReq) || normalizeToken(code).includes(tReq);
}

function toDisplayName(v) {
  return (v || "").toString().trim().replace(/\s+/g, " ");
}

function normalizeToken(v) {
  return (v || "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function parseSportNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  const s = String(value).trim().toUpperCase();
  if (s === "E" || s === "EVEN") return 0;
  const m = s.match(/^[+-]?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeProUpstream(data, control) {
  const teamCode = (control.team || "").toUpperCase();
  const wantsSuperBowl = isSuperBowlControl(control);
  const context = wantsSuperBowl ? pickSuperBowlCandidate(data) : pickTeamGameContext(data, teamCode);
  const game = context?.game;
  if (!game) return null;

  const requestedTeam = wantsSuperBowl ? resolveRequestedTeamForGame(game) : teamCode;

  const normalized = normalizeHeadToHeadGame({
    game,
    requestedTeam,
    source: "pro",
    sport: control.sport,
    gameTime: game.game_time || game.start_time || game.kickoff || null,
  });

  if (wantsSuperBowl) {
    normalized.event = "SUPER_BOWL";
    normalized.event_name = "Super Bowl";
    normalized.super_bowl = true;
  }

  if (context?.kind === "next") {
    normalized.status = "SCHEDULED";
    normalized.team_score = null;
    normalized.opp_score = null;
  }

  const withTimer = withCountdownFromGame(normalized, game, context?.kind === "next");

  return withTeamMeta(withTimer, game);
}

function makeProMock(control, status = "SCHEDULED") {
  const wantsSuperBowl = isSuperBowlControl(control);
  return withTeamMeta({
    source: "pro",
    sport: control.sport,
    team: wantsSuperBowl ? "AFC" : control.team || "TEAM",
    opponent: wantsSuperBowl ? "NFC" : "OPP",
    team_score: status === "SCHEDULED" ? null : 0,
    opp_score: status === "SCHEDULED" ? null : 0,
    status,
    game_time: null,
    event: wantsSuperBowl ? "SUPER_BOWL" : undefined,
    event_name: wantsSuperBowl ? "Super Bowl" : undefined,
    super_bowl: wantsSuperBowl ? true : undefined,
  });
}

async function fetchOlympicsScore(control, env) {
  const team = (control.team || "").toString().trim();
  const sport = normalizeOlympicSport(control.sport);
  const baseUrl = env.OLYMPICS_API_URL || env.SPORTS_API_URL;

  if (!baseUrl) {
    return makeOlympicsMock(team, sport, "SCHEDULED");
  }

  const upstreamUrl = buildOlympicsUrl(baseUrl, env, sport);

  try {
    const resp = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
      },
      cf: { cacheTtl: 20, cacheEverything: false },
    });

    if (!resp.ok) {
      return makeOlympicsMock(team, sport, "SCHEDULED");
    }

    const data = await resp.json().catch(() => null);
    if (!data) {
      return makeOlympicsMock(team, sport, "SCHEDULED");
    }

    const adapted = adaptUpstreamPayload(data, { sport, source: "olympics" });

    const normalized = normalizeOlympicsUpstream(adapted, team, sport);
    return normalized || makeOlympicsMock(team, sport, "SCHEDULED");
  } catch {
    return makeOlympicsMock(team, sport, "SCHEDULED");
  }
}

function normalizeOlympicsUpstream(data, requestedTeam, sport) {
  const req = (requestedTeam || "").toString().trim().toUpperCase();
  const context = pickTeamGameContext(data, req);
  const game = context?.game;
  if (!game) return null;

  const normalized = normalizeHeadToHeadGame({
    game,
    requestedTeam: req,
    source: "olympics",
    sport,
    gameTime: game.game_time || game.start_time || game.start || game.scheduled_at || null,
  });

  if (context?.kind === "next") {
    normalized.status = "SCHEDULED";
    normalized.team_score = null;
    normalized.opp_score = null;
  }

  normalized.event = game.event || game.event_name || game.eventName || "OLYMPICS";
  normalized.tournament = game.tournament || game.competition || "Olympics";

  const withTimer = withCountdownFromGame(normalized, game, context?.kind === "next");
  return withTeamMeta(withTimer, game);
}

function makeOlympicsMock(team, sport, status = "SCHEDULED") {
  return withTeamMeta({
    source: "olympics",
    sport,
    team: (team || "TEAM").toString().toUpperCase(),
    opponent: "OPP",
    team_score: status === "SCHEDULED" ? null : 0,
    opp_score: status === "SCHEDULED" ? null : 0,
    status,
    game_time: null,
    at: "Neutral",
    event: "OLYMPICS",
    tournament: "Olympics",
  });
}

function normalizeOlympicSport(input) {
  const s = (input || "").toString().trim().toLowerCase();
  if (s.startsWith("olympic-")) return s;
  if (["basketball", "soccer", "volleyball", "handball", "water-polo", "field-hockey", "rugby-sevens"].includes(s)) {
    return `olympic-${s}`;
  }
  return "olympic-basketball";
}

async function fetchNcaaBasketballScore(control, env) {
  const team = (control.team || "").toString().trim();
  const baseUrl = env.NCAA_BASKETBALL_API_URL || env.SPORTS_API_URL;

  if (!baseUrl) {
    return makeNcaaBasketballMock(team, "SCHEDULED");
  }

  const upstreamUrl = buildNcaaBasketballUrl(baseUrl);

  try {
    const resp = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
      },
      cf: { cacheTtl: 20, cacheEverything: false },
    });

    if (!resp.ok) {
      return makeNcaaBasketballMock(team, "SCHEDULED");
    }

    const data = await resp.json().catch(() => null);
    if (!data) {
      return makeNcaaBasketballMock(team, "SCHEDULED");
    }

    const adapted = adaptUpstreamPayload(data, { sport: "cbb", source: "ncaa-basketball" });

    const normalized = normalizeNcaaBasketballUpstream(adapted, team);
    return normalized || makeNcaaBasketballMock(team, "SCHEDULED");
  } catch {
    return makeNcaaBasketballMock(team, "SCHEDULED");
  }
}

function normalizeNcaaBasketballUpstream(data, requestedTeam) {
  const req = (requestedTeam || "").toString().trim().toUpperCase();
  const context = pickTeamGameContext(data, req);
  const game = context?.game;
  if (!game) return null;

  const normalized = normalizeHeadToHeadGame({
    game,
    requestedTeam: req,
    source: "ncaa-basketball",
    sport: "cbb",
    gameTime: game.game_time || game.start_time || game.tipoff || null,
  });

  if (context?.kind === "next") {
    normalized.status = "SCHEDULED";
    normalized.team_score = null;
    normalized.opp_score = null;
  }

  const withTimer = withCountdownFromGame(normalized, game, context?.kind === "next");
  return withTeamMeta(withTimer, game);
}

function makeNcaaBasketballMock(team, status = "SCHEDULED") {
  return withTeamMeta({
    source: "ncaa-basketball",
    sport: "cbb",
    team: (team || "TEAM").toString().toUpperCase(),
    opponent: "OPP",
    team_score: status === "SCHEDULED" ? null : 0,
    opp_score: status === "SCHEDULED" ? null : 0,
    status,
    game_time: null,
    at: "Home",
  });
}

async function fetchNcaaSoftballScore(control, env) {
  const team = (control.team || "").toString().trim();
  const baseUrl = env.NCAA_SOFTBALL_API_URL;

  if (!baseUrl) {
    return makeNcaaSoftballMock(team, "SCHEDULED");
  }

  const upstreamUrl = buildNcaaSoftballUrl(baseUrl);

  try {
    const resp = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
      },
      cf: { cacheTtl: 20, cacheEverything: false },
    });

    if (!resp.ok) {
      return makeNcaaSoftballMock(team, "SCHEDULED");
    }

    const data = await resp.json().catch(() => null);
    if (!data) {
      return makeNcaaSoftballMock(team, "SCHEDULED");
    }

    const adapted = adaptUpstreamPayload(data, { sport: "softball", source: "ncaa-softball" });

    const normalized = normalizeNcaaSoftballUpstream(adapted, team);
    return normalized || makeNcaaSoftballMock(team, "SCHEDULED");
  } catch {
    return makeNcaaSoftballMock(team, "SCHEDULED");
  }
}

function buildSoccerHeaders(env) {
  const headers = { Accept: "application/json" };
  const token = env.SOCCER_API_TOKEN || env.FOOTBALL_DATA_API_TOKEN || "";
  if (token) {
    headers["X-Auth-Token"] = token;
  }
  return headers;
}

function buildSoccerUrl(baseUrl, mode) {
  const now = new Date();
  const ymd = formatDateYMD(now);

  if (baseUrl.includes("football-data.org")) {
    if (mode === "world-cup") {
      return `https://api.football-data.org/v4/competitions/WC/matches?dateFrom=${ymd}&dateTo=${ymd}`;
    }
    return `https://api.football-data.org/v4/matches?dateFrom=${ymd}&dateTo=${ymd}`;
  }

  const competition = mode === "world-cup" ? "world-cup" : "regular";
  return appendQuery(baseUrl, {
    sport: "soccer",
    competition,
    date: ymd,
  });
}

function buildProUrl(baseUrl, sport, wantsSuperBowl) {
  const compact = formatDateCompact(new Date());
  return buildProUrlForDateCompact(baseUrl, sport, wantsSuperBowl, compact);

  return appendQuery(baseUrl, {
    sport,
    event: wantsSuperBowl ? "superbowl" : undefined,
    date: compact,
  });
}

function buildProUrlForDateCompact(baseUrl, sport, wantsSuperBowl, compact) {
  const date = String(compact || "").trim() || formatDateCompact(new Date());
  if (baseUrl.includes("site.api.espn.com") || baseUrl.includes("apis/site/v2/sports")) {
    const path = espnSportPath(sport);
    let url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${encodeURIComponent(date)}`;
    if (wantsSuperBowl) url += "&seasontype=3";
    return url;
  }
  return appendQuery(baseUrl, {
    sport,
    event: wantsSuperBowl ? "superbowl" : undefined,
    date,
  });
}

function buildProUrlRange(baseUrl, sport, wantsSuperBowl, startCompact, endCompact) {
  const start = String(startCompact || "").trim();
  const end = String(endCompact || "").trim();
  if (!start) return buildProUrl(baseUrl, sport, wantsSuperBowl);
  const dates = end ? `${start}-${end}` : start;
  if (baseUrl.includes("site.api.espn.com") || baseUrl.includes("apis/site/v2/sports")) {
    const path = espnSportPath(sport);
    let url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${encodeURIComponent(dates)}`;
    if (wantsSuperBowl) url += "&seasontype=3";
    return url;
  }
  // Best-effort for non-ESPN endpoints.
  return appendQuery(baseUrl, { sport, date: start, event: wantsSuperBowl ? "superbowl" : undefined });
}

function extractLiveTeamsFromEspnScoreboard(data) {
  const teams = [];
  const seen = new Set();
  const events = Array.isArray(data?.events) ? data.events : [];
  for (const event of events) {
    const comp = (event?.competitions && event.competitions[0]) || null;
    if (!comp) continue;
    const statusObj = comp.status?.type || event.status?.type || {};
    const status = normalizeStatus(statusObj?.name || statusObj?.state || statusObj?.description || statusObj?.shortDetail || "");
    if (status !== "LIVE") continue;
    const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
    for (const c of competitors) {
      const t = c?.team || {};
      const abbr = String(t.abbreviation || "").trim().toUpperCase();
      if (!abbr) continue;
      if (seen.has(abbr)) continue;
      seen.add(abbr);
      teams.push({
        abbr,
        name: String(t.displayName || t.shortDisplayName || t.name || abbr).trim() || abbr,
      });
    }
  }
  teams.sort((a, b) => (a.abbr || "").localeCompare(b.abbr || ""));
  return teams;
}

function addDaysUtcCompact(date, days) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + (Number(days) || 0));
  return formatDateCompact(d);
}

async function fetchProNextGameCountdown(control, env) {
  const baseUrl = env.SPORTS_API_URL;
  if (!baseUrl) {
    return makeProMock(control, "SCHEDULED");
  }

  const sport = (control?.sport || "nfl").toString().trim().toLowerCase() || "nfl";
  const requestedTeam = (control?.team || "TEAM").toString().trim().toUpperCase() || "TEAM";
  const wantsSuperBowl = isSuperBowlControl(control);

  // Look ahead so we can find the next scheduled game.
  const today = new Date();
  const start = formatDateCompact(today);
  const end = addDaysUtcCompact(today, 14);
  const upstreamUrl = buildProUrlRange(baseUrl, sport, wantsSuperBowl, start, end);

  try {
    const resp = await fetch(upstreamUrl, {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 30, cacheEverything: false },
    });
    if (!resp.ok) return makeProMock(control, "SCHEDULED");

    const data = await resp.json().catch(() => null);
    const next = pickNextScheduledGameFromEspnScoreboard(data, requestedTeam);
    if (!next) {
      return withTeamMeta({
        source: "pro",
        sport,
        team: requestedTeam,
        opponent: "TBD",
        team_score: null,
        opp_score: null,
        status: "NONE",
        at: "Neutral",
      });
    }

    const normalized = normalizeHeadToHeadGame({
      game: next,
      requestedTeam,
      source: "pro",
      sport,
      gameTime: next.game_time || next.start_time || null,
    });

    normalized.status = "SCHEDULED";
    normalized.team_score = null;
    normalized.opp_score = null;

    const withTimer = withCountdownFromGame(normalized, next, true);
    return withTeamMeta(withTimer, next);
  } catch {
    return makeProMock(control, "SCHEDULED");
  }
}

function pickNextScheduledGameFromEspnScoreboard(data, requestedTeam) {
  const req = String(requestedTeam || "").trim().toUpperCase();
  if (!req) return null;
  const events = Array.isArray(data?.events) ? data.events : [];
  const nowMs = Date.now();

  let best = null;
  let bestStart = null;

  for (const event of events) {
    const comp = (event?.competitions && event.competitions[0]) || null;
    if (!comp) continue;
    const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
    const hasReq = competitors.some((c) => String(c?.team?.abbreviation || "").trim().toUpperCase() === req);
    if (!hasReq) continue;

    const startMs = getGameStartMs({ game_time: comp.date || event.date || null, start_time: comp.date || event.date || null });
    if (!startMs || startMs <= nowMs) continue;

    if (bestStart === null || startMs < bestStart) {
      const homeC = competitors.find((c) => (c.homeAway || "").toLowerCase() === "home") || competitors[0];
      const awayC = competitors.find((c) => (c.homeAway || "").toLowerCase() === "away") || competitors[1];
      if (!homeC || !awayC) continue;
      const homeTeam = homeC.team || {};
      const awayTeam = awayC.team || {};
      bestStart = startMs;
      best = {
        home: String(homeTeam.abbreviation || homeTeam.shortDisplayName || homeTeam.displayName || "HOME").trim() || "HOME",
        away: String(awayTeam.abbreviation || awayTeam.shortDisplayName || awayTeam.displayName || "AWAY").trim() || "AWAY",
        home_score: null,
        away_score: null,
        status: "SCHEDULED",
        game_time: comp.date || event.date || null,
        at: "Neutral",
        home_primary: normalizeHexColor(homeTeam.color),
        home_secondary: normalizeHexColor(homeTeam.alternateColor),
        away_primary: normalizeHexColor(awayTeam.color),
        away_secondary: normalizeHexColor(awayTeam.alternateColor),
        event_name: event.name || null,
        event: event.shortName || event.name || null,
        competition: data?.leagues?.[0]?.name || null,
      };
    }
  }

  return best;
}

function buildNcaaBasketballUrl(baseUrl) {
  const compact = formatDateCompact(new Date());
  if (baseUrl.includes("site.api.espn.com")) {
    return appendQuery(baseUrl, { dates: compact });
  }
  return appendQuery(baseUrl, { sport: "cbb", dates: compact });
}

function buildNcaaSoftballUrl(baseUrl) {
  const ymd = formatDateYMD(new Date());
  if (baseUrl.includes("ncaa-api.henrygd.me")) {
    return appendQuery(baseUrl, { date: ymd });
  }
  return appendQuery(baseUrl, { sport: "softball", date: ymd });
}

function buildOlympicsUrl(baseUrl, env, sport) {
  const year = new Date().getUTCFullYear();
  const key = env.OLYMPICS_API_KEY || env.SPORTSDATAIO_API_KEY || "";

  if (baseUrl.includes("sportsdata.io")) {
    const root = baseUrl.replace(/\/$/, "");
    const candidate = root.includes("/Competitions/") ? root : `${root}/Competitions/${year}`;
    return appendQuery(candidate, key ? { key } : {});
  }

  return appendQuery(baseUrl, {
    source: "olympics",
    sport,
    year,
    key: key || undefined,
  });
}

function buildIndividualSportUrl(baseUrl, sport, sourceOverride) {
  const compact = formatDateCompact(new Date());

  if (baseUrl.includes("site.api.espn.com") && sport === "tennis-singles") {
    return appendQuery(baseUrl, { dates: compact });
  }

  if (sourceOverride === "olympics") {
    return appendQuery(baseUrl, { sport, source: "olympics", dates: compact });
  }
  return appendQuery(baseUrl, { sport, dates: compact });
}

function espnSportPath(sport) {
  const s = (sport || "").toString().trim().toLowerCase();
  if (s === "nfl") return "football/nfl";
  if (s === "nba") return "basketball/nba";
  if (s === "mlb") return "baseball/mlb";
  if (s === "nhl") return "hockey/nhl";
  if (s === "cbb") return "basketball/mens-college-basketball";
  return "football/nfl";
}

function appendQuery(baseUrl, params) {
  const url = new URL(baseUrl);
  Object.keys(params || {}).forEach((k) => {
    const val = params[k];
    if (val !== undefined && val !== null && val !== "") {
      url.searchParams.set(k, String(val));
    }
  });
  return url.toString();
}

function formatDateYMD(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateCompact(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function adaptUpstreamPayload(data, hint = {}) {
  if (!data || typeof data !== "object") return data;

  if (Array.isArray(data?.events) && data.events.length) {
    return adaptEspnScoreboard(data, hint);
  }

  if (Array.isArray(data?.matches) && (data.count !== undefined || data.filters || data.competition)) {
    return adaptFootballDataMatches(data);
  }

  if (Array.isArray(data?.games) || Array.isArray(data?.matches) || Array.isArray(data?.leaderboard) || Array.isArray(data?.players)) {
    return data;
  }

  return data;
}

function adaptEspnScoreboard(data, hint = {}) {
  const hintedSport = (hint?.sport || "").toString().trim().toLowerCase();
  const hintedSource = (hint?.source || "").toString().trim().toLowerCase();
  const preferNames = hintedSport === "cbb" || hintedSource === "ncaa-basketball";

  const games = [];
  for (const event of data.events || []) {
    const comp = (event.competitions && event.competitions[0]) || null;
    if (!comp) continue;
    const competitors = comp.competitors || [];
    const homeC = competitors.find((c) => (c.homeAway || "").toLowerCase() === "home") || competitors[0];
    const awayC = competitors.find((c) => (c.homeAway || "").toLowerCase() === "away") || competitors[1];
    if (!homeC || !awayC) continue;

    const homeTeam = homeC.team || {};
    const awayTeam = awayC.team || {};

    const pickTeamKey = (t) => {
      if (preferNames) return t.shortDisplayName || t.displayName || t.abbreviation || "TEAM";
      return t.abbreviation || t.shortDisplayName || t.displayName || "TEAM";
    };

    games.push({
      home: pickTeamKey(homeTeam) || "HOME",
      away: pickTeamKey(awayTeam) || "AWAY",
      home_score: parseNullableInt(homeC.score),
      away_score: parseNullableInt(awayC.score),
      status: normalizeStatus((comp.status && comp.status.type && (comp.status.type.name || comp.status.type.state)) || event.status?.type?.name || "SCHEDULED"),
      game_time: comp.date || event.date || null,
      at: "Neutral",
      home_primary: normalizeHexColor(homeTeam.color),
      home_secondary: normalizeHexColor(homeTeam.alternateColor),
      away_primary: normalizeHexColor(awayTeam.color),
      away_secondary: normalizeHexColor(awayTeam.alternateColor),
      event_name: event.name || null,
      event: event.shortName || event.name || null,
      competition: data.leagues?.[0]?.name || null,
    });
  }
  return { games };
}

function adaptFootballDataMatches(data) {
  const games = [];
  for (const m of data.matches || []) {
    games.push({
      home: m.homeTeam?.tla || m.homeTeam?.shortName || m.homeTeam?.name || "HOME",
      away: m.awayTeam?.tla || m.awayTeam?.shortName || m.awayTeam?.name || "AWAY",
      home_score: parseNullableInt(m.score?.fullTime?.home ?? m.score?.halfTime?.home),
      away_score: parseNullableInt(m.score?.fullTime?.away ?? m.score?.halfTime?.away),
      status: normalizeStatus(m.status || "SCHEDULED"),
      game_time: m.utcDate || null,
      at: "Neutral",
      event_name: m.competition?.name || null,
      competition: m.competition?.name || null,
    });
  }
  return { games };
}

function normalizeNcaaSoftballUpstream(data, requestedTeam) {
  const req = (requestedTeam || "").toString().trim().toUpperCase();
  const context = pickTeamGameContext(data, req);
  const game = context?.game;
  if (!game) return null;

  const normalized = normalizeHeadToHeadGame({
    game,
    requestedTeam: req,
    source: "ncaa-softball",
    sport: "softball",
    gameTime: game.game_time || game.start_time || game.first_pitch || null,
  });

  if (context?.kind === "next") {
    normalized.status = "SCHEDULED";
    normalized.team_score = null;
    normalized.opp_score = null;
  }

  const withTimer = withCountdownFromGame(normalized, game, context?.kind === "next");
  return withTeamMeta(withTimer, game);
}

function makeNcaaSoftballMock(team, status = "SCHEDULED") {
  return withTeamMeta({
    source: "ncaa-softball",
    sport: "softball",
    team: (team || "TEAM").toString().toUpperCase(),
    opponent: "OPP",
    team_score: status === "SCHEDULED" ? null : 0,
    opp_score: status === "SCHEDULED" ? null : 0,
    status,
    game_time: null,
    at: "Home",
  });
}

async function fetchWellesleyScore(control, env) {
  const url = env.WELLESLEY_SOFTBALL_URL || "https://athletics.wellesley.edu/sports/softball/schedule_text";

  try {
    const resp = await fetch(url, {
      headers: { Accept: "text/plain,application/json" },
      cf: { cacheTtl: 30, cacheEverything: false },
    });

    if (!resp.ok) {
      return makeWellesleyMock("NONE");
    }

    const contentType = (resp.headers.get("content-type") || "").toLowerCase();

    if (contentType.includes("application/json")) {
      const data = await resp.json().catch(() => null);
      const normalized = normalizeWellesleyJson(data);
      return normalized || makeWellesleyMock("NONE");
    }

    const raw = await resp.text();
    const normalized = parseWellesleyScheduleText(raw);
    return normalized || makeWellesleyMock("NONE");
  } catch {
    return makeWellesleyMock("NONE");
  }
}

function normalizeWellesleyJson(data) {
  const games = Array.isArray(data?.games) ? data.games : Array.isArray(data) ? data : [];
  if (!games.length) return null;

  const live = games.find((g) => normalizeStatus(g.status) === "LIVE");
  const scheduled = games.find((g) => normalizeStatus(g.status) === "SCHEDULED");
  const finalGame = [...games].reverse().find((g) => normalizeStatus(g.status) === "FINAL");
  const pick = live || scheduled || finalGame;
  if (!pick) return null;

  const withTimer = withCountdownFromGame({
    source: "wellesley",
    sport: "softball",
    team: "WEL",
    opponent: pick.opponent || pick.opp || "TBD",
    team_score: parseNullableInt(pick.team_score ?? pick.wel_score),
    opp_score: parseNullableInt(pick.opp_score),
    status: normalizeStatus(pick.status || "NONE"),
    game_time: pick.game_time || pick.start_time || pick.first_pitch || null,
    at: normalizeAt(pick.at || pick.location || "Home"),
  }, pick);

  return withTeamMeta(withTimer, pick);
}

function parseWellesleyScheduleText(raw) {
  if (!raw || typeof raw !== "string") return null;
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith("#"));

  if (!lines.length) return null;

  const games = [];
  for (const line of lines) {
    const g = parseScheduleLine(line);
    if (g) games.push(g);
  }

  if (!games.length) return null;

  const live = games.find((g) => g.status === "LIVE");
  if (live) return toWellesleyPayload(live);

  const now = Date.now();
  const upcoming = games
    .filter((g) => g.whenMs && g.whenMs >= now)
    .sort((a, b) => a.whenMs - b.whenMs)[0];

  if (upcoming) return toWellesleyPayload(upcoming);

  const finals = games.filter((g) => g.status === "FINAL");
  if (finals.length) return toWellesleyPayload(finals[finals.length - 1]);

  return makeWellesleyMock("NONE");
}

function parseScheduleLine(line) {
  const status = normalizeStatusFromLine(line);

  const scoreMatch = line.match(/(\d{1,2})\s*[-:]\s*(\d{1,2})/);
  const oppFromVs = line.match(/(?:vs\.?|@)\s*([A-Za-z0-9 .'-]+)/i);

  const isoMatch = line.match(/(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)/);
  let whenMs = null;
  if (isoMatch) {
    const parsed = Date.parse(isoMatch[1].replace(" ", "T"));
    whenMs = Number.isFinite(parsed) ? parsed : null;
  }

  const at = /\bneutral\b/i.test(line)
    ? "Neutral"
    : /\b@\b/.test(line) || /\baway\b/i.test(line)
      ? "Away"
      : "Home";

  return {
    opponent: cleanupOpponent(oppFromVs?.[1] || extractOpponentFallback(line)),
    team_score: scoreMatch ? parseInt(scoreMatch[1], 10) : null,
    opp_score: scoreMatch ? parseInt(scoreMatch[2], 10) : null,
    status,
    at,
    whenMs,
  };
}

function extractOpponentFallback(line) {
  const cleaned = line
    .replace(/\d{4}-\d{2}-\d{2}.*/, "")
    .replace(/\b(final|live|scheduled|in progress)\b/gi, "")
    .trim();
  return cleaned.slice(0, 18) || "TBD";
}

function cleanupOpponent(value) {
  return (value || "TBD")
    .replace(/\s+\d+\s*[-:]\s*\d+/, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 24);
}

function toWellesleyPayload(g) {
  const withTimer = withCountdownFromMs({
    source: "wellesley",
    sport: "softball",
    team: "WEL",
    opponent: g.opponent || "TBD",
    team_score: parseNullableInt(g.team_score),
    opp_score: parseNullableInt(g.opp_score),
    status: g.status || "NONE",
    at: normalizeAt(g.at || "Home"),
  }, g.whenMs, g.status === "SCHEDULED");

  return withTeamMeta(withTimer, g);
}

function makeWellesleyMock(status = "NONE") {
  return withTeamMeta({
    source: "wellesley",
    sport: "softball",
    team: "WEL",
    opponent: "TBD",
    team_score: null,
    opp_score: null,
    status,
    at: "Home",
  });
}

function pickGameCandidate(data, requestedTeam) {
  const candidates = extractGameCandidates(data);

  if (!candidates.length) return null;

  const req = (requestedTeam || "").toString().toUpperCase();
  if (!req) return candidates[0];

  return (
    candidates.find((g) => {
      const home = (g.home_team || g.home || g.homeTeam || "").toString().toUpperCase();
      const away = (g.away_team || g.away || g.awayTeam || "").toString().toUpperCase();
      const team = (g.team || g.team_code || g.teamCode || "").toString().toUpperCase();
      return home === req || away === req || team === req;
    }) || candidates[0]
  );
}

function pickTeamGameContext(data, requestedTeam) {
  const candidates = extractGameCandidates(data);
  if (!candidates.length) return { game: null, kind: "none" };

  const req = (requestedTeam || "").toString().trim().toUpperCase();
  const scoped = req ? candidates.filter((g) => gameHasTeam(g, req)) : candidates;
  const pool = scoped.length ? scoped : candidates;

  const live = pool.find((g) => normalizeStatus(g.status || g.state || g.game_status || "") === "LIVE");
  if (live) return { game: live, kind: "live" };

  const now = Date.now();
  const upcoming = pool
    .map((g) => ({ game: g, ms: getGameStartMs(g) }))
    .filter((x) => x.ms !== null && x.ms >= now)
    .sort((a, b) => a.ms - b.ms);

  if (upcoming.length) return { game: upcoming[0].game, kind: "next" };

  const lastFinal = pickLatestFinalGame(pool);
  if (lastFinal) return { game: lastFinal, kind: "last-final" };

  return { game: pool[0], kind: "fallback" };
}

function gameHasTeam(game, requestedTeam) {
  const req = (requestedTeam || "").toString().trim().toUpperCase();
  if (!req) return false;
  const home = (game?.home_team || game?.home || game?.homeTeam || "").toString().toUpperCase();
  const away = (game?.away_team || game?.away || game?.awayTeam || "").toString().toUpperCase();
  const team = (game?.team || game?.team_code || game?.teamCode || "").toString().toUpperCase();
  return home === req || away === req || team === req;
}

function extractGameCandidates(data) {
  return Array.isArray(data?.games)
    ? data.games
    : Array.isArray(data)
      ? data
      : data?.game
        ? [data.game]
        : [data];
}

function isSuperBowlControl(control) {
  if ((control?.sport || "").toString().trim().toLowerCase() !== "nfl") return false;
  const team = (control?.team || "").toString().trim().toUpperCase();
  return SUPER_BOWL_TEAM_KEYS.includes(team);
}

function pickSuperBowlCandidate(data) {
  const candidates = extractGameCandidates(data);
  if (!candidates.length) return { game: null, kind: "none" };

  const matches = candidates.filter((g) => isSuperBowlGame(g));
  const pool = matches.length ? matches : candidates;

  const live = pool.find((g) => normalizeStatus(g.status || g.state || g.game_status || "") === "LIVE");
  if (live) return { game: live, kind: "live" };

  const now = Date.now();
  const upcoming = pool
    .map((g) => ({ game: g, ms: getGameStartMs(g) }))
    .filter((x) => x.ms !== null && x.ms >= now)
    .sort((a, b) => a.ms - b.ms);
  if (upcoming.length) return { game: upcoming[0].game, kind: "next" };

  const lastFinal = pickLatestFinalGame(pool);
  if (lastFinal) return { game: lastFinal, kind: "last-final" };

  const scored = pool
    .filter((g) => parseNullableInt(g.home_score ?? g.homeScore) !== null || parseNullableInt(g.away_score ?? g.awayScore) !== null)
    .sort((a, b) => gameSortMsDesc(a) - gameSortMsDesc(b));
  if (scored.length) return { game: scored[scored.length - 1], kind: "fallback" };
  return { game: pool[0], kind: "fallback" };
}

function pickLatestFinalGame(pool) {
  const finals = pool.filter((g) => normalizeStatus(g.status || g.state || g.game_status || g.match_status || "") === "FINAL");
  if (!finals.length) return null;

  finals.sort((a, b) => gameSortMsDesc(a) - gameSortMsDesc(b));
  return finals[finals.length - 1];
}

function gameSortMsDesc(game) {
  return gameOrderMs(game);
}

function gameOrderMs(game) {
  const endMs = getGameEndMs(game);
  if (endMs !== null) return endMs;
  const startMs = getGameStartMs(game);
  if (startMs !== null) return startMs;
  return 0;
}

function isSuperBowlGame(game) {
  const hay = [
    game?.event,
    game?.event_name,
    game?.eventName,
    game?.name,
    game?.title,
    game?.round,
    game?.stage,
    game?.week,
    game?.notes,
  ]
    .map((v) => (v || "").toString().toUpperCase())
    .join(" ");

  return hay.includes("SUPER BOWL") || hay.includes("SUPERBOWL") || hay.includes("SB ");
}

function resolveRequestedTeamForGame(game) {
  const explicit = (game?.team || game?.team_code || game?.teamCode || "").toString().trim().toUpperCase();
  if (explicit) return explicit;
  const away = (game?.away_team || game?.away || game?.awayTeam || "").toString().trim().toUpperCase();
  const home = (game?.home_team || game?.home || game?.homeTeam || "").toString().trim().toUpperCase();
  return away || home || "TEAM";
}

function normalizeHeadToHeadGame({ game, requestedTeam, source, sport, gameTime }) {
  const home = (game.home_team || game.home || game.homeTeam || "HOME").toString().trim().toUpperCase();
  const away = (game.away_team || game.away || game.awayTeam || "AWAY").toString().trim().toUpperCase();
  const explicit = (game.team || game.team_code || game.teamCode || "").toString().trim().toUpperCase();
  const preferred = (requestedTeam || explicit || away).toString().trim().toUpperCase();

  const homeScore = parseNullableInt(game.home_score ?? game.homeScore);
  const awayScore = parseNullableInt(game.away_score ?? game.awayScore);
  const isTeamHome = preferred === home;
  const homePrimary = normalizeHexColor(game.home_primary || game.homePrimary || game.home_color || game.homeColor);
  const homeSecondary = normalizeHexColor(game.home_secondary || game.homeSecondary || game.home_alt || game.homeAlt);
  const awayPrimary = normalizeHexColor(game.away_primary || game.awayPrimary || game.away_color || game.awayColor);
  const awaySecondary = normalizeHexColor(game.away_secondary || game.awaySecondary || game.away_alt || game.awayAlt);

  return {
    source,
    sport,
    team: preferred || away,
    opponent: isTeamHome ? away : home,
    team_score: isTeamHome ? homeScore : awayScore,
    opp_score: isTeamHome ? awayScore : homeScore,
    status: normalizeStatus(game.status || game.state || game.game_status || "SCHEDULED"),
    game_time: gameTime || null,
    at: normalizeAt(game.at || game.location || (isTeamHome ? "Home" : "Away")),
    team_primary: isTeamHome ? homePrimary : awayPrimary,
    team_secondary: isTeamHome ? homeSecondary : awaySecondary,
    opp_primary: isTeamHome ? awayPrimary : homePrimary,
    opp_secondary: isTeamHome ? awaySecondary : homeSecondary,
  };
}

function getGameStartMs(game) {
  const raw =
    game?.start_time ||
    game?.game_time ||
    game?.kickoff ||
    game?.tipoff ||
    game?.first_pitch ||
    game?.start ||
    game?.scheduled_at ||
    game?.scheduledAt ||
    null;

  if (raw === null || raw === undefined || raw === "") return null;

  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return raw > 1e12 ? Math.trunc(raw) : Math.trunc(raw * 1000);
  }

  const asNum = Number(raw);
  if (Number.isFinite(asNum) && String(raw).trim().match(/^\d+(\.\d+)?$/)) {
    return asNum > 1e12 ? Math.trunc(asNum) : Math.trunc(asNum * 1000);
  }

  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : null;
}

function getGameEndMs(game) {
  const raw =
    game?.end_time ||
    game?.completed_at ||
    game?.final_at ||
    game?.updated_at ||
    game?.updatedAt ||
    null;

  if (raw === null || raw === undefined || raw === "") return null;

  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return raw > 1e12 ? Math.trunc(raw) : Math.trunc(raw * 1000);
  }

  const asNum = Number(raw);
  if (Number.isFinite(asNum) && String(raw).trim().match(/^\d+(\.\d+)?$/)) {
    return asNum > 1e12 ? Math.trunc(asNum) : Math.trunc(asNum * 1000);
  }

  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : null;
}

function withCountdownFromGame(payload, game, clearScoresForScheduled = false) {
  const ms = getGameStartMs(game) || getGameStartMs(payload);
  return withCountdownFromMs(payload, ms, clearScoresForScheduled);
}

function withCountdownFromMs(payload, startMs, clearScoresForScheduled = false) {
  const out = { ...payload };
  const nowMs = Date.now();
  out.now_unix = Math.floor(nowMs / 1000);

  if (startMs !== null && Number.isFinite(startMs) && startMs > nowMs) {
    const seconds = Math.max(0, Math.floor((startMs - nowMs) / 1000));
    out.next_game_time_unix = Math.floor(startMs / 1000);
    out.countdown_seconds = seconds;
    out.countdown_text = formatCountdown(seconds);
    out.countdown_active = true;
    if (clearScoresForScheduled) {
      out.team_score = null;
      out.opp_score = null;
      out.status = "SCHEDULED";
    }
  } else {
    out.countdown_active = false;
  }

  return out;
}

function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.trunc(totalSeconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function withTeamMeta(payload, game = null) {
  const sport = (payload?.sport || "").toString().trim().toLowerCase();
  const teamMeta = resolveTeamMeta(payload?.team, sport, {
    abbr: game?.team_abbr || game?.teamAbbr,
    primary: payload?.team_primary || game?.team_primary || game?.teamPrimary || game?.primary,
    secondary: payload?.team_secondary || game?.team_secondary || game?.teamSecondary || game?.secondary,
  });
  const oppMeta = resolveTeamMeta(payload?.opponent, sport, {
    abbr: game?.opponent_abbr || game?.opp_abbr || game?.oppAbbr,
    primary: payload?.opp_primary || game?.opp_primary || game?.opponent_primary || game?.oppPrimary,
    secondary: payload?.opp_secondary || game?.opp_secondary || game?.opponent_secondary || game?.oppSecondary,
  });

  return {
    ...payload,
    team_name: payload?.team || "TEAM",
    opponent_team: payload?.opponent || "OPP",
    opponent_name: payload?.opponent || "OPP",
    team_abbr: teamMeta.abbr,
    team_primary: teamMeta.primary,
    team_secondary: teamMeta.secondary,
    opponent_abbr: oppMeta.abbr,
    opp_primary: oppMeta.primary,
    opp_secondary: oppMeta.secondary,
  };
}

function resolveTeamMeta(teamName, sport, upstream = {}) {
  const raw = (teamName || "TEAM").toString().trim();
  const abbr = normalizeAbbr(upstream.abbr || raw);
  const override = TEAM_COLOR_OVERRIDES[`${sport}:${abbr}`];
  const upstreamPrimary = normalizeHexColor(upstream.primary);
  const upstreamSecondary = normalizeHexColor(upstream.secondary);

  let primary = upstreamPrimary || (override && override.primary) || makeDeterministicPrimary(`${sport}:${raw}`);
  let secondary = upstreamSecondary || (override && override.secondary) || pickContrastingSecondary(primary);

  if (!isHexColor(primary)) primary = "#3366CC";
  if (!isHexColor(secondary)) secondary = "#FFFFFF";

  return { abbr, primary, secondary };
}

function normalizeAbbr(value) {
  const text = (value || "").toString().toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").trim();
  if (!text) return "TM0";
  if (/^[A-Z0-9]{2,4}$/.test(text)) {
    return text.slice(0, 3).padEnd(3, "X");
  }

  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length >= 3) {
    return (parts[0][0] + parts[1][0] + parts[2][0]).slice(0, 3);
  }
  if (parts.length === 2) {
    return (parts[0][0] + parts[1].slice(0, 2)).slice(0, 3);
  }
  return parts[0].slice(0, 3).padEnd(3, "X");
}

function makeDeterministicPrimary(seed) {
  const hash = hash32(seed || "TEAM");
  const hue = hash % 360;
  const sat = 62 + (hash % 12);
  const light = 42 + (hash % 10);
  return hslToHex(hue, sat, light);
}

function pickContrastingSecondary(primaryHex) {
  if (!isHexColor(primaryHex)) return "#FFFFFF";
  const rgb = hexToRgb(primaryHex);
  const luma = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luma > 0.52 ? "#111111" : "#FFFFFF";
}

function normalizeHexColor(value) {
  if (!value) return null;
  const v = String(value).trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(v)) return v;
  if (/^[0-9A-F]{6}$/.test(v)) return `#${v}`;
  return null;
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9A-F]{6}$/i.test(value);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const rr = Math.round((r + m) * 255);
  const gg = Math.round((g + m) * 255);
  const bb = Math.round((b + m) * 255);
  return `#${toHex2(rr)}${toHex2(gg)}${toHex2(bb)}`;
}

function toHex2(n) {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0").toUpperCase();
}

function normalizeStatus(value) {
  const raw = (value || "").toString().trim().toUpperCase();
  if (!raw) return "SCHEDULED";
  // ESPN often uses STATUS_* or short states like IN/POST.
  if (raw === "IN" || raw === "IN GAME" || raw === "INGAME") return "LIVE";
  if (raw === "POST") return "FINAL";
  if (raw.includes("IN_PROGRESS") || raw.includes("IN-PROGRESS") || raw.includes("IN PROGRESS")) return "LIVE";
  if (raw.includes("STATUS_IN_PROGRESS") || raw.includes("STATUS_IN")) return "LIVE";
  if (raw.includes("STATUS_HALFTIME") || raw.includes("HALFTIME")) return "LIVE";
  if (raw.includes("STATUS_FINAL") || raw.includes("STATUS_END") || raw.includes("STATUS_COMPLETE")) return "FINAL";
  if (["LIVE", "IN_PROGRESS", "IN-PROGRESS", "IN PLAY", "INPLAY", "PAUSED", "Q1", "Q2", "Q3", "Q4", "HALF"].includes(raw)) {
    return "LIVE";
  }
  if (["FINAL", "FT", "ENDED", "COMPLETE", "COMPLETED", "FINISHED", "AFTER_EXTRA_TIME", "AFTER_PENALTIES"].includes(raw)) {
    return "FINAL";
  }
  if (["NONE", "OFF", "NO_GAME", "NO-GAME", "POSTPONED", "CANCELLED", "SUSPENDED"].includes(raw)) {
    return "NONE";
  }
  return "SCHEDULED";
}

function normalizeStatusFromLine(line) {
  if (/\b(live|in progress|top \d|bot \d)\b/i.test(line)) return "LIVE";
  if (/\b(final|f\b|completed?)\b/i.test(line)) return "FINAL";
  if (/\b(cancelled|postponed|tbd)\b/i.test(line)) return "SCHEDULED";
  return "SCHEDULED";
}

function normalizeAt(value) {
  const raw = (value || "").toString().trim().toLowerCase();
  if (raw.includes("away") || raw.includes("@")) return "Away";
  if (raw.includes("neutral")) return "Neutral";
  return "Home";
}

function parseNullableInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
    },
  });
}

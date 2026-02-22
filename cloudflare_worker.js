const DEFAULT_CONTROL = {
  source: "wellesley",
  sport: "nfl",
  team: "DAL",
  mode: "auto",
  tz: "ct", // utc|et|ct|mt|pt
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

const WORKER_VERSION = "2026.02.22-ui3";

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
            <option value="soccer">Soccer</option>
          </select>

          <label for="team">Team</label>
          <div class="combo">
            <input id="team" value="Dallas Cowboys (DAL)" autocapitalize="words" />
            <button id="teamBtn" class="comboBtn" type="button" aria-label="Teams">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div id="teamList" class="comboList advHidden" role="listbox" aria-label="Teams"></div>
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
          <button class="secondary" id="setClock" type="button">Set Clock</button>
          <button class="secondary" id="getControl" type="button">Get Control</button>
        </div>
        <div class="btns" style="margin-top:10px;">
          <button class="secondary" id="getScore" type="button">Get Score</button>
        </div>
      </div>

      <div class="card">
        <div class="muted">Response</div>
        <pre id="out">(none)</pre>
      </div>

      <div class="muted">Preferences are saved on this device.</div>
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
          <li>This page sends a <code>POST /control</code> with: <code>{ device_id, source, sport, team, mode, tz }</code>.</li>
          <li>Your MatrixPortal polls <code>/control</code> and <code>/score</code> every few seconds and updates the display.</li>
          <li><code>mode: "idle"</code> forces clock-only mode on the board.</li>
        </ul>
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
        team: "",
        sourceOverride: cookieGet("ui_src_override") === "1",
        source: cookieGet("ui_source") || "pro",
        device: cookieGet("ui_device") || "${deviceId}",
        token: cookieGet("ui_token") || "",
        tz: cookieGet("ui_tz") || "ct",
      };

      const teamLists = {
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
        softball: [["Wellesley", "WEL"]],
        cbb: [],
        soccer: [],
      };

      const sportToSource = {
        nfl: "pro",
        nba: "pro",
        mlb: "pro",
        nhl: "pro",
        softball: "ncaa-softball",
        cbb: "ncaa-basketball",
        soccer: "pro",
      };

      function teamCookieKey(sport) {
        return "ui_team_" + String(sport || "").toLowerCase();
      }

      function defaultTeamForSport(sport) {
        if (sport === "softball") return "Wellesley (WEL)";
        const arr = teamOptionsForSport(sport);
        if (arr && arr.length) return arr[0][0] + " (" + arr[0][1] + ")";
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
        return teamLists[sport] || [];
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
          div.textContent = name + " (" + abbr + ")";
          div.addEventListener("click", () => {
            $("team").value = div.textContent;
            state.team = div.textContent;
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
        const m = String(input || "").match(/\(([A-Z0-9]{2,4})\)\s*$/);
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

      state.team = cookieGet(teamCookieKey(state.sport)) || defaultTeamForSport(state.sport) || "Dallas Cowboys (DAL)";

      $("token").value = state.token;
      $("device").value = state.device;
      $("sport").value = state.sport;
      $("team").value = state.team;
      $("source").value = state.source;
      $("tz").value = state.tz || "ct";

      inferSource();
      applyTheme();
      applyTabs();
      applyDisplayMode();

      function buildControlPayload(opts) {
        const device_id = $("device").value.trim() || "matrix-01";
        const sport = $("sport").value.trim();
        const teamInput = $("team").value;
        const team = parseTeamAbbr(teamInput);
        const source = $("source").value.trim() || (sportToSource[sport] || "pro");

        const tz = $("tz").value || "ct";

        const clock = (opts && opts.forceClock) || state.display === "clock";
        const mode = clock ? "idle" : "auto";
        return { device_id, source, sport, team, mode, tz };
      }

      async function postControl(payload) {
        const token = $("token").value.trim();
        cookieSet("ui_token", token);
        cookieSet("ui_device", $("device").value.trim());
        cookieSet("ui_sport", $("sport").value.trim());
        cookieSet(teamCookieKey($("sport").value.trim()), $("team").value);
        cookieSet("ui_source", $("source").value.trim());
        cookieSet("ui_tz", $("tz").value);
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

      function setSendState(kind, label) {
        const btn = $("send");
        btn.classList.remove("ok", "err", "loading");
        if (kind) btn.classList.add(kind);
        $("sendText").textContent = label || "Send";
      }

      $("send").addEventListener("click", async () => {
        try {
          setSendState("loading", "Sending…");
          show({ sending: buildControlPayload({ forceClock: false }) });
          const resp = await postControl(buildControlPayload({ forceClock: false }));
          show(resp);
          if (resp && resp.status >= 200 && resp.status < 300) {
            setSendState("ok", "Sent");
            setTimeout(() => setSendState("", "Send"), 900);
          } else {
            setSendState("err", "Error");
            setTimeout(() => setSendState("", "Send"), 1400);
          }
        } catch (e) {
          show({ error: String(e && e.message ? e.message : e) });
          setSendState("err", "Error");
          setTimeout(() => setSendState("", "Send"), 1400);
        }
      });

      $("setClock").addEventListener("click", async () => {
        try {
          show({ sending: buildControlPayload({ forceClock: true }) });
          show(await postControl(buildControlPayload({ forceClock: true })));
        } catch (e) {
          show({ error: String(e && e.message ? e.message : e) });
        }
      });

      $("getControl").addEventListener("click", async () => {
        const device = $("device").value.trim();
        show(await getJson("/control?device_id=" + encodeURIComponent(device)));
      });

      $("getScore").addEventListener("click", async () => {
        const device = $("device").value.trim();
        show(await getJson("/score?device_id=" + encodeURIComponent(device)));
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
      });

      $("sport").addEventListener("change", () => {
        state.sport = $("sport").value;
        cookieSet("ui_sport", state.sport);
        // Sport change always forces default source mapping.
        state.sourceOverride = false;
        cookieSet("ui_src_override", "0");
        inferSource();

        const remembered = cookieGet(teamCookieKey(state.sport));
        state.team = state.sport === "softball" ? "Wellesley (WEL)" : (remembered || defaultTeamForSport(state.sport));
        if (state.team) {
          $("team").value = state.team;
          cookieSet(teamCookieKey(state.sport), state.team);
        }
        closeTeamDropdown();
      });

      $("team").addEventListener("change", () => {
        state.team = $("team").value;
        cookieSet(teamCookieKey(state.sport), state.team);
      });

      $("team").addEventListener("focus", () => {
        openTeamDropdown();
      });

      $("team").addEventListener("input", () => {
        state.team = $("team").value;
        renderTeamDropdown(state.team);
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

      // Safety: never show modal on initial load.
      closeInfo();
      $("infoBtn").addEventListener("click", openInfo);
      $("closeInfo").addEventListener("click", closeInfo);
      $("infoModal").addEventListener("click", (e) => {
        if (e.target && e.target.id === "infoModal") closeInfo();
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
    "nfl",
    "nba",
    "mlb",
    "softball",
    "cbb",
    ...OLYMPIC_TEAM_SPORTS,
    ...OLYMPIC_INDIVIDUAL_SPORTS,
    ...INDIVIDUAL_SPORTS,
    ...SOCCER_SPORT_KEYS,
  ].includes(normalizedSport)
    ? normalizedSport
    : DEFAULT_CONTROL.sport;
  const team = (input.team || DEFAULT_CONTROL.team || "").toString().trim().toUpperCase();
  const mode = ["auto", "force-live", "idle"].includes(input.mode)
    ? input.mode
    : DEFAULT_CONTROL.mode;

  const normalizedTz = (input.tz || "").toString().trim().toLowerCase();
  const tz = ["utc", "et", "ct", "mt", "pt"].includes(normalizedTz) ? normalizedTz : DEFAULT_CONTROL.tz;

  return {
    device_id: deviceId,
    source,
    sport,
    team,
    mode,
    tz,
    updated_at: Math.floor(Date.now() / 1000),
  };
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
  if (baseUrl.includes("site.api.espn.com") || baseUrl.includes("apis/site/v2/sports")) {
    const path = espnSportPath(sport);
    let url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${compact}`;
    if (wantsSuperBowl) {
      url += "&seasontype=3";
    }
    return url;
  }

  return appendQuery(baseUrl, {
    sport,
    event: wantsSuperBowl ? "superbowl" : undefined,
    date: compact,
  });
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
    return adaptEspnScoreboard(data);
  }

  if (Array.isArray(data?.matches) && (data.count !== undefined || data.filters || data.competition)) {
    return adaptFootballDataMatches(data);
  }

  if (Array.isArray(data?.games) || Array.isArray(data?.matches) || Array.isArray(data?.leaderboard) || Array.isArray(data?.players)) {
    return data;
  }

  return data;
}

function adaptEspnScoreboard(data) {
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

    games.push({
      home: homeTeam.abbreviation || homeTeam.shortDisplayName || homeTeam.displayName || "HOME",
      away: awayTeam.abbreviation || awayTeam.shortDisplayName || awayTeam.displayName || "AWAY",
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
      ...CORS_HEADERS,
    },
  });
}

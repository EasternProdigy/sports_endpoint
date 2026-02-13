const DEFAULT_CONTROL = {
  source: "wellesley",
  sport: "nfl",
  team: "DAL",
  mode: "auto",
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

async function handlePostControl(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const expectedToken = env.CONTROL_TOKEN;
  if (!expectedToken) {
    return jsonResponse({ error: "CONTROL_TOKEN is not configured" }, 500);
  }
  if (!auth.startsWith("Bearer ") || auth.slice(7) !== expectedToken) {
    return jsonResponse({ error: "Unauthorized" }, 401);
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

  return {
    device_id: deviceId,
    source,
    sport,
    team,
    mode,
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

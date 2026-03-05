var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// cloudflare/worker.mjs
var API_V1_REWRITES = /* @__PURE__ */ new Map([
  ["/api/v1/fuckyouuuu", "/api/fuckyouuuu"],
  ["/api/v1/fckyouuu1", "/api/fckyouuu1"],
  ["/api/v1/fckyouuu2", "/api/scanx"]
]);
var TV_UPSTREAM_BASE = "https://www.tradingview.com/api/v1";
var AES_KEY_BYTES = new Uint8Array([
  74,
  156,
  46,
  241,
  131,
  215,
  86,
  187,
  18,
  126,
  164,
  56,
  197,
  105,
  240,
  29,
  232,
  49,
  91,
  151,
  4,
  172,
  114,
  223,
  99,
  184,
  31,
  69,
  234,
  6,
  141,
  196
]);
var HOP_BY_HOP_REQUEST_HEADERS = /* @__PURE__ */ new Set([
  "host",
  "connection",
  "content-length",
  "accept-encoding"
]);
var HOP_BY_HOP_RESPONSE_HEADERS = /* @__PURE__ */ new Set([
  "connection",
  "content-encoding",
  "content-length",
  "transfer-encoding"
]);
var NSE_SNAPSHOT_PREFIX = "snapshots/nse";
var NSE_META_KEY = `${NSE_SNAPSHOT_PREFIX}/meta.json`;
var NSE_CHUNK_PREFIX = `${NSE_SNAPSHOT_PREFIX}/chunks/`;
var DEFAULT_NSE_CHUNK_MODE = "alpha2";
var NSE_SNAPSHOT_CACHE_CONTROL = "public, max-age=300";
var NSE_META_CACHE_CONTROL = "public, max-age=60";
var INTERVAL_SNAPSHOT_PREFIX = "snapshots/intervals";
var INTERVAL_META_KEY = `${INTERVAL_SNAPSHOT_PREFIX}/meta.json`;
var INTERVAL_META_CACHE_CONTROL = "public, max-age=60";
var INTERVAL_SNAPSHOT_CACHE_CONTROL = "public, max-age=300";
var DEFAULT_INTERVALS = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y"];
var INTERVAL_WINDOWS = {
  "1D": 1,
  "5D": 2,
  "1M": 3,
  "3M": 4,
  "6M": 4,
  "YTD": 5,
  "1Y": 6,
  "5Y": 7,
  "MAX": 8
};
var GOOGLE_RPC_CHART = "AiCwsd";
var GOOGLE_RPC_PRICE = "xh8wxf";
var PRICE_SNAPSHOT_PREFIX = "snapshots/prices";
var PRICE_META_KEY = `${PRICE_SNAPSHOT_PREFIX}/meta.json`;
var FUNDA_SNAPSHOT_PREFIX = "snapshots/fundamentals";
var FUNDA_META_KEY = `${FUNDA_SNAPSHOT_PREFIX}/meta.json`;
var CHART_SNAPSHOT_PREFIX = "snapshots/charts";
var CHART_META_KEY = `${CHART_SNAPSHOT_PREFIX}/meta.json`;
var WORKER_BUILD_ID = "2026-03-04-201";
var DEFAULT_SNAPSHOT_SOURCE_URL = "https://24e8e3a97bab753a1a1d82e0b7a5b283.r2.cloudflarestorage.com/nexusmap/data.json";
var REFRESH_STATUS_KEY = "snapshots/system/refresh-status.json";
var cachedDecryptKey = null;
var lastRefreshState = {
  runId: null,
  startedAt: null,
  finishedAt: null,
  status: "idle",
  errors: {},
  stages: {}
};
async function writeRefreshStatus(env, status) {
  if (!env?.NSE_SNAPSHOTS?.put) return;
  try {
    await putSnapshotObject(env, REFRESH_STATUS_KEY, status, { gzip: false, cacheControl: "no-store" });
  } catch (error) {
    console.error("[Refresh Status] write failed", error);
  }
}
__name(writeRefreshStatus, "writeRefreshStatus");
async function readRefreshStatus(env) {
  if (!env?.NSE_SNAPSHOTS?.get) return null;
  try {
    const object = await env.NSE_SNAPSHOTS.get(REFRESH_STATUS_KEY);
    if (!object) return null;
    const text = await object.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}
__name(readRefreshStatus, "readRefreshStatus");
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
__name(sleep, "sleep");
function getNoStoreHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "CDN-Cache-Control": "no-store"
  };
}
__name(getNoStoreHeaders, "getNoStoreHeaders");
function createJsonResponse(status, data, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...getNoStoreHeaders(),
      ...extraHeaders
    }
  });
}
__name(createJsonResponse, "createJsonResponse");
var CF_BROTLI_MIN_BYTES = 1024;
function pickEncoding(headerValue) {
  const header = String(headerValue || "").toLowerCase();
  if (header.includes("br")) return "br";
  if (header.includes("gzip")) return "gzip";
  return null;
}
__name(pickEncoding, "pickEncoding");
async function createCompressedTextResponse(request, status, text, extraHeaders = {}) {
  const encoding = pickEncoding(request.headers.get("accept-encoding"));
  const payload = typeof text === "string" ? text : String(text ?? "");
  const baseHeaders = {
    "Content-Type": "text/plain; charset=utf-8",
    ...getNoStoreHeaders(),
    ...extraHeaders,
    "Vary": "Accept-Encoding"
  };
  if (!encoding || payload.length < CF_BROTLI_MIN_BYTES || typeof CompressionStream === "undefined") {
    return new Response(payload, { status, headers: baseHeaders });
  }
  try {
    const stream = new CompressionStream(encoding);
    const writer = stream.writable.getWriter();
    await writer.write(new TextEncoder().encode(payload));
    await writer.close();
    return new Response(stream.readable, {
      status,
      headers: {
        ...baseHeaders,
        "Content-Encoding": encoding
      }
    });
  } catch {
    return new Response(payload, { status, headers: baseHeaders });
  }
}
__name(createCompressedTextResponse, "createCompressedTextResponse");
function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase().replace(/^(NSE|BSE|BOM|GOOGLE):/i, "").replace(/:(NSE|BOM|BSE)$/i, "").replace(/\.(NS|BO)$/i, "").replace(/-EQ$/i, "").split(":")[0];
}
__name(normalizeSymbol, "normalizeSymbol");
function resolveChunkMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "alpha1" || mode === "alpha2") return mode;
  return DEFAULT_NSE_CHUNK_MODE;
}
__name(resolveChunkMode, "resolveChunkMode");
function chunkKeyForSymbol(symbol, chunkMode) {
  const cleaned = normalizeSymbol(symbol);
  if (!cleaned) return chunkMode === "alpha2" ? "__" : "_";
  const first = cleaned[0];
  const isAlpha = first >= "A" && first <= "Z";
  const isDigit = first >= "0" && first <= "9";
  if (chunkMode === "alpha2") {
    if (isDigit) return "0-9";
    if (!isAlpha) return "__";
    const second = cleaned.length > 1 ? cleaned[1] : "_";
    const secondKey = second >= "A" && second <= "Z" ? second : "_";
    return `${first}${secondKey}`;
  }
  if (isDigit) return "0-9";
  if (!isAlpha) return "_";
  return first;
}
__name(chunkKeyForSymbol, "chunkKeyForSymbol");
function extractSymbolMap(payload) {
  if (!payload) return { map: /* @__PURE__ */ new Map(), format: "empty" };
  const pickCandidate = /* @__PURE__ */ __name(() => {
    if (payload?.data && typeof payload.data === "object") return payload.data;
    if (payload?.symbols && typeof payload.symbols === "object") return payload.symbols;
    return payload;
  }, "pickCandidate");
  const candidate = pickCandidate();
  const map = /* @__PURE__ */ new Map();
  if (Array.isArray(candidate)) {
    candidate.forEach((row) => {
      const symbol = normalizeSymbol(row?.symbol ?? row?.sym ?? row?.s);
      if (!symbol) return;
      map.set(symbol, row);
    });
    return { map, format: "array" };
  }
  if (candidate && typeof candidate === "object") {
    Object.entries(candidate).forEach(([key, value]) => {
      const symbol = normalizeSymbol(value?.symbol ?? key);
      if (!symbol) return;
      map.set(symbol, value);
    });
    return { map, format: "map" };
  }
  return { map, format: "unknown" };
}
__name(extractSymbolMap, "extractSymbolMap");
async function gzipString(payload) {
  if (typeof CompressionStream === "undefined") {
    return { data: new TextEncoder().encode(payload), encoding: null };
  }
  const stream = new CompressionStream("gzip");
  const writer = stream.writable.getWriter();
  await writer.write(new TextEncoder().encode(payload));
  await writer.close();
  const buffer = await new Response(stream.readable).arrayBuffer();
  return { data: new Uint8Array(buffer), encoding: "gzip" };
}
__name(gzipString, "gzipString");
function buildSourceHeaders(env) {
  const headers = new Headers({ Accept: "application/json" });
  if (env?.NSE_SNAPSHOT_AUTH_TOKEN) {
    headers.set("Authorization", `Bearer ${env.NSE_SNAPSHOT_AUTH_TOKEN}`);
  }
  if (env?.NSE_SNAPSHOT_HEADERS_JSON) {
    try {
      const extra = JSON.parse(env.NSE_SNAPSHOT_HEADERS_JSON);
      if (extra && typeof extra === "object") {
        Object.entries(extra).forEach(([key, value]) => {
          if (typeof value === "string") headers.set(key, value);
        });
      }
    } catch {
    }
  }
  return headers;
}
__name(buildSourceHeaders, "buildSourceHeaders");
function buildUniverseFetchCandidates(env) {
  const direct = String(env?.NSE_SNAPSHOT_SOURCE_URL || "").trim();
  const manualOrigin = String(env?._manualOrigin || "").trim();
  const origin = String(env?.ORIGIN_BASE_URL || "").trim();
  const fallback = String(env?.NSE_SNAPSHOT_FALLBACK_URL || "").trim();
  const urls = [
    direct,
    manualOrigin ? new URL("/data.json", manualOrigin).toString() : "",
    origin ? new URL("/data.json", origin).toString() : "",
    fallback,
    DEFAULT_SNAPSHOT_SOURCE_URL
  ].filter(Boolean);
  const seen = /* @__PURE__ */ new Set();
  const list = [];
  urls.forEach((url) => {
    if (seen.has(url)) return;
    seen.add(url);
    list.push({ type: "url", url });
  });
  if (env?.ASSETS?.fetch) list.push({ type: "assets" });
  return list;
}
__name(buildUniverseFetchCandidates, "buildUniverseFetchCandidates");
async function mirrorUniverseToR2(env, payload) {
  if (!env?.NSE_SNAPSHOTS?.put) return;
  try {
    await env.NSE_SNAPSHOTS.put("data.json", JSON.stringify(payload), {
      httpMetadata: {
        contentType: "application/json; charset=utf-8",
        cacheControl: "public, max-age=300"
      }
    });
  } catch (error) {
    console.error("[Universe Mirror] failed", error);
  }
}
__name(mirrorUniverseToR2, "mirrorUniverseToR2");
function parseIntervalListValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_INTERVALS.slice();
  return raw.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
}
__name(parseIntervalListValue, "parseIntervalListValue");
function parseIntervalList(env) {
  return parseIntervalListValue(env?.NSE_INTERVAL_SNAPSHOT_INTERVALS);
}
__name(parseIntervalList, "parseIntervalList");
function getIntervalWindow(interval) {
  return INTERVAL_WINDOWS[interval] || 3;
}
__name(getIntervalWindow, "getIntervalWindow");
function buildGoogleBatchUrl(rpcId) {
  return `https://www.google.com/finance/_/GoogleFinanceUi/data/batchexecute?rpcids=${encodeURIComponent(rpcId)}&source-path=%2Ffinance%2F&f.sid=dummy&hl=en-US&soc-app=162&soc-platform=1&soc-device=1&rt=c`;
}
__name(buildGoogleBatchUrl, "buildGoogleBatchUrl");
function getExchangeForSymbol(symbol) {
  return /^\d+$/.test(symbol) ? "BOM" : "NSE";
}
__name(getExchangeForSymbol, "getExchangeForSymbol");
function extractPriceFromFrame(payload) {
  const quote = payload?.[0]?.[0]?.[0];
  if (!Array.isArray(quote)) return null;
  const symbolInfo = quote[1];
  const priceTuple = quote[5];
  const prevClose = quote[7];
  if (!Array.isArray(priceTuple) || typeof priceTuple[0] !== "number") return null;
  if (!Array.isArray(symbolInfo)) return null;
  return {
    symbol: normalizeSymbol(symbolInfo[0]),
    data: {
      price: priceTuple[0],
      change: priceTuple[1] || 0,
      changePct: priceTuple[2] || 0,
      prevClose: prevClose || 0,
      source: "google"
    }
  };
}
__name(extractPriceFromFrame, "extractPriceFromFrame");
function extractWideChartFromFrame(payload) {
  const root = payload?.[0]?.[0];
  if (!Array.isArray(root)) return null;
  const symbolInfo = root[0];
  let points = root[3]?.[0]?.[1];
  if (!Array.isArray(points) || points.length < 2) {
    points = root[3]?.[1];
  }
  if (!Array.isArray(points) || points.length === 0) return null;
  const parseTime = /* @__PURE__ */ __name((val) => {
    if (typeof val === "number") return val;
    if (Array.isArray(val)) {
      const [y, m, d, h, min] = val;
      return new Date(y, m - 1, d, h || 0, min || 0).getTime();
    }
    return 0;
  }, "parseTime");
  const rawSeries = points.map((p) => {
    const stats = p[1];
    const time = parseTime(p[0]);
    const close = stats?.[0] || 0;
    const changePct = (stats?.[2] || 0) * 100;
    const validateAbs = /* @__PURE__ */ __name((val) => {
      if (!val || val <= 0) return close;
      if (val < close * 0.1) return close;
      return val;
    }, "validateAbs");
    const high = validateAbs(stats?.[3]);
    const low = validateAbs(stats?.[4]);
    const open = validateAbs(stats?.[5]);
    const volume = p[2] || 0;
    return { time, close, open, high, low, volume, changePct };
  }).filter((p) => isFinite(p.close) && p.time > 0);
  const series = rawSeries.map((p) => ({ ...p, price: p.close, value: p.close }));
  return {
    symbol: normalizeSymbol(symbolInfo?.[0]),
    series
  };
}
__name(extractWideChartFromFrame, "extractWideChartFromFrame");
async function executeGoogleBatch(entries, rpcId) {
  if (!entries.length) return { text: "", responseTtlMs: null };
  const url = buildGoogleBatchUrl(rpcId);
  const fReq = JSON.stringify([entries]);
  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      "Origin": "https://www.google.com",
      "Referer": "https://www.google.com/finance/",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
    body: new URLSearchParams({ "f.req": fReq }).toString()
  });
  if (!upstream.ok) throw new Error(`Google batch failed: ${upstream.status}`);
  return { text: await upstream.text(), responseTtlMs: null };
}
__name(executeGoogleBatch, "executeGoogleBatch");
function parseAllFrames(text) {
  const frames = [];
  const lines = String(text || "").split("\n");
  for (let line of lines) {
    line = line.trim();
    if (!line.startsWith("[") || !line.includes('"wrb.fr"')) continue;
    try {
      const parsed = JSON.parse(line);
      if (!Array.isArray(parsed)) continue;
      for (const frame of parsed) {
        if (!Array.isArray(frame) || frame[0] !== "wrb.fr") continue;
        try {
          const payload = JSON.parse(frame[2]);
          frames.push({ rpcId: frame[1], payload });
        } catch {
        }
      }
    } catch {
    }
  }
  return frames;
}
__name(parseAllFrames, "parseAllFrames");
function extractIntervalFromFrame(payload, interval) {
  const root = payload?.[0]?.[0];
  if (!Array.isArray(root)) return null;
  const symbolInfo = root[0];
  let points = root[3]?.[0]?.[1];
  if (!Array.isArray(points) || points.length < 2) {
    points = root[3]?.[1];
  }
  if (!Array.isArray(symbolInfo) || !Array.isArray(points) || points.length === 0) return null;
  const lastPoint = points[points.length - 1];
  const close = lastPoint?.[1]?.[0];
  let changePct = lastPoint?.[1]?.[2];
  if (interval === "3M") {
    const lookback = 63;
    const startIndex = Math.max(0, points.length - 1 - lookback);
    const startPrice = points[startIndex]?.[1]?.[0];
    if (startPrice && close) {
      changePct = (close - startPrice) / startPrice;
    }
  }
  if (typeof changePct !== "number" || !isFinite(changePct)) return null;
  return {
    symbol: normalizeSymbol(symbolInfo[0]),
    data: { changePct: changePct * 100, close }
  };
}
__name(extractIntervalFromFrame, "extractIntervalFromFrame");
async function fetchUniverseData(env) {
  const candidates = buildUniverseFetchCandidates(env);
  let lastError = null;
  for (const candidate of candidates) {
    try {
      if (candidate.type === "assets") {
        const response2 = await env.ASSETS.fetch(new Request("https://assets.local/data.json"), {
          signal: env?._abortSignal
        });
        if (!response2.ok) throw new Error(`Asset universe fetch failed: ${response2.status}`);
        const json2 = await response2.json();
        await mirrorUniverseToR2(env, json2);
        return json2;
      }
      const response = await fetch(candidate.url, {
        headers: buildSourceHeaders(env),
        signal: env?._abortSignal
      });
      if (!response.ok) throw new Error(`Universe fetch failed: ${response.status}`);
      const json = await response.json();
      if (candidate.url !== DEFAULT_SNAPSHOT_SOURCE_URL) {
        await mirrorUniverseToR2(env, json);
      }
      return json;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No universe source available");
}
__name(fetchUniverseData, "fetchUniverseData");
async function putSnapshotObject(env, key, payload, { gzip = true, cacheControl } = {}) {
  if (!env?.NSE_SNAPSHOTS?.put) {
    throw new Error("NSE_SNAPSHOTS binding missing");
  }
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  let data = text;
  let encoding = null;
  if (gzip) {
    const compressed = await gzipString(text);
    data = compressed.data;
    encoding = compressed.encoding;
  }
  await env.NSE_SNAPSHOTS.put(key, data, {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      contentEncoding: encoding || void 0,
      cacheControl: cacheControl || NSE_SNAPSHOT_CACHE_CONTROL
    }
  });
}
__name(putSnapshotObject, "putSnapshotObject");
async function refreshNseSnapshots(env) {
  let payload;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), 12e4);
  try {
    payload = await fetchUniverseData({
      ...env,
      _abortSignal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
  const { map: symbolMap, format } = extractSymbolMap(payload);
  if (symbolMap.size === 0) {
    throw new Error("NSE snapshot returned no symbols");
  }
  const chunkMode = resolveChunkMode(env.NSE_SNAPSHOT_CHUNK_MODE);
  const chunks = /* @__PURE__ */ new Map();
  symbolMap.forEach((value, symbol) => {
    const key = chunkKeyForSymbol(symbol, chunkMode);
    let bucket = chunks.get(key);
    if (!bucket) {
      bucket = /* @__PURE__ */ new Map();
      chunks.set(key, bucket);
    }
    bucket.set(symbol, value);
  });
  for (const [chunkKey, bucket] of chunks) {
    const chunkPayload = Object.fromEntries(bucket);
    await putSnapshotObject(
      env,
      `${NSE_CHUNK_PREFIX}${chunkKey}.json.gz`,
      chunkPayload,
      { gzip: true, cacheControl: NSE_SNAPSHOT_CACHE_CONTROL }
    );
  }
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  let sourceHost = "";
  try {
    sourceHost = new URL(env.NSE_SNAPSHOT_SOURCE_URL).host;
  } catch {
    sourceHost = "";
  }
  const meta = {
    schemaVersion: 1,
    generatedAt,
    sourceHost,
    format,
    chunkMode,
    totalSymbols: symbolMap.size,
    chunkCount: chunks.size,
    chunks: Array.from(chunks.keys()).sort()
  };
  await putSnapshotObject(env, NSE_META_KEY, meta, { gzip: false, cacheControl: NSE_META_CACHE_CONTROL });
}
__name(refreshNseSnapshots, "refreshNseSnapshots");
async function runRefreshPipeline(env) {
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const errors = {};
  const stages = {};
  await writeRefreshStatus(env, {
    runId,
    startedAt,
    finishedAt: null,
    status: "running",
    errors: {},
    stages: {}
  });
  try {
    stages.nse = { status: "running", startedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await writeRefreshStatus(env, { runId, startedAt, finishedAt: null, status: "running", errors, stages });
    await refreshNseSnapshots(env);
    stages.nse = { status: "success", startedAt: stages.nse.startedAt, finishedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await writeRefreshStatus(env, { runId, startedAt, finishedAt: null, status: "running", errors, stages });
  } catch (error) {
    errors.nse = error?.message || "NSE snapshot failed";
    stages.nse = { status: "error", startedAt: stages.nse?.startedAt || null, finishedAt: (/* @__PURE__ */ new Date()).toISOString() };
    console.error("[NSE Snapshot] refresh failed", error);
  }
  try {
    stages.intervals = { status: "running", startedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await writeRefreshStatus(env, { runId, startedAt, finishedAt: null, status: "running", errors, stages });
    await refreshIntervalSnapshots(env);
    stages.intervals = { status: "success", startedAt: stages.intervals.startedAt, finishedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await writeRefreshStatus(env, { runId, startedAt, finishedAt: null, status: "running", errors, stages });
  } catch (error) {
    errors.intervals = error?.message || "Interval snapshot failed";
    stages.intervals = { status: "error", startedAt: stages.intervals?.startedAt || null, finishedAt: (/* @__PURE__ */ new Date()).toISOString() };
    console.error("[Interval Snapshot] refresh failed", error);
  }
  try {
    stages.prices = { status: "running", startedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await writeRefreshStatus(env, { runId, startedAt, finishedAt: null, status: "running", errors, stages });
    await refreshPriceSnapshots(env);
    stages.prices = { status: "success", startedAt: stages.prices.startedAt, finishedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await writeRefreshStatus(env, { runId, startedAt, finishedAt: null, status: "running", errors, stages });
  } catch (error) {
    errors.prices = error?.message || "Price snapshot failed";
    stages.prices = { status: "error", startedAt: stages.prices?.startedAt || null, finishedAt: (/* @__PURE__ */ new Date()).toISOString() };
    console.error("[Price Snapshot] refresh failed", error);
  }
  try {
    stages.charts = { status: "running", startedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await writeRefreshStatus(env, { runId, startedAt, finishedAt: null, status: "running", errors, stages });
    await refreshChartSnapshots(env);
    stages.charts = { status: "success", startedAt: stages.charts.startedAt, finishedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await writeRefreshStatus(env, { runId, startedAt, finishedAt: null, status: "running", errors, stages });
  } catch (error) {
    errors.charts = error?.message || "Chart snapshot failed";
    stages.charts = { status: "error", startedAt: stages.charts?.startedAt || null, finishedAt: (/* @__PURE__ */ new Date()).toISOString() };
    console.error("[Chart Snapshot] refresh failed", error);
  }
  const finishedAt = (/* @__PURE__ */ new Date()).toISOString();
  const result = { runId, startedAt, finishedAt, errors, ok: Object.keys(errors).length === 0 };
  await writeRefreshStatus(env, {
    runId,
    startedAt,
    finishedAt,
    status: result.ok ? "success" : "error",
    errors
  });
  return result;
}
__name(runRefreshPipeline, "runRefreshPipeline");
async function checkAndFixStuckStages(env) {
  const status = await readRefreshStatus(env);
  if (!status || status.status !== "running") return status;
  const stuckTimeout = 5 * 60 * 1e3;
  const stages = status.stages || {};
  const now = Date.now();
  const fixedStages = { ...stages };
  let hasStuck = false;
  for (const [key, stage] of Object.entries(stages)) {
    if (stage.status === "running" && stage.startedAt) {
      const startTime = new Date(stage.startedAt).getTime();
      if (now - startTime > stuckTimeout) {
        console.log(`[Incremental] Detected stuck stage: ${key}, resetting`);
        fixedStages[key] = { status: "pending", startedAt: null, finishedAt: null };
        hasStuck = true;
      }
    }
  }
  if (hasStuck) {
    await writeRefreshStatus(env, {
      ...status,
      status: "partial",
      stages: fixedStages
    });
    return { ...status, stages: fixedStages };
  }
  return status;
}
__name(checkAndFixStuckStages, "checkAndFixStuckStages");
async function runIncrementalRefresh(env) {
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const errors = {};
  const status = await checkAndFixStuckStages(env);
  console.log("[Incremental] Status after fix:", JSON.stringify(status));
  const lastRunId = status?.runId;
  const stages = status?.stages || {};
  const currentErrors = status?.errors || {};
  const isNsePending = !stages.nse || stages.nse.status !== "success";
  const isIntervalsPending = !stages.intervals || stages.intervals.status !== "success";
  const isPricesPending = !stages.prices || stages.prices.status !== "success";
  const isChartsPending = !stages.charts || stages.charts.status !== "success";
  console.log("[Incremental] isNsePending:", isNsePending, "isIntervalsPending:", isIntervalsPending, "isPricesPending:", isPricesPending, "isChartsPending:", isChartsPending, "status.status:", status?.status || null);
  const allComplete = !isNsePending && !isIntervalsPending && !isPricesPending && !isChartsPending;
  if (allComplete || !lastRunId || status?.status === "success" || status?.status === "error") {
    await writeRefreshStatus(env, {
      runId,
      startedAt,
      finishedAt: null,
      status: "running",
      errors: {},
      stages: {}
    });
  } else {
    await writeRefreshStatus(env, {
      ...status,
      runId
    });
  }
  const currentStages = { ...stages };
  console.log("[Incremental] currentStages:", JSON.stringify(currentStages));
  if (isNsePending && !currentStages.nse?.startedAt) {
    try {
      currentStages.nse = { status: "running", startedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await writeRefreshStatus(env, { runId, startedAt, finishedAt: null, status: "running", errors, stages: currentStages });
      await refreshNseSnapshots(env);
      currentStages.nse = { status: "success", startedAt: currentStages.nse.startedAt, finishedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await writeRefreshStatus(env, { runId, startedAt, finishedAt: null, status: "running", errors, stages: currentStages });
      return { runId, startedAt, finishedAt: startedAt, errors, ok: false, stage: "nse", stages: currentStages };
    } catch (error) {
      errors.nse = error?.message || "NSE snapshot failed";
      currentStages.nse = { status: "error", startedAt: currentStages.nse?.startedAt || null, finishedAt: (/* @__PURE__ */ new Date()).toISOString() };
      console.error("[NSE Snapshot] refresh failed", error);
      await writeRefreshStatus(env, { runId, startedAt, finishedAt: (/* @__PURE__ */ new Date()).toISOString(), status: "partial", errors: { ...currentErrors, ...errors }, stages: currentStages });
      return { runId, startedAt, finishedAt: (/* @__PURE__ */ new Date()).toISOString(), errors: { ...currentErrors, ...errors }, ok: false, stage: "nse", stages: currentStages };
    }
  }
  console.log("[Incremental] Checking intervals, isIntervalsPending:", isIntervalsPending, "startedAt:", currentStages.intervals?.startedAt);
  if (isIntervalsPending && !currentStages.intervals?.startedAt) {
    console.log("[Incremental] RUNNING INTERVALS");
    try {
      currentStages.intervals = { status: "running", startedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await writeRefreshStatus(env, { runId, startedAt, finishedAt: null, status: "running", errors: currentErrors, stages: currentStages });
      await refreshIntervalSnapshots(env);
      currentStages.intervals = { status: "success", startedAt: currentStages.intervals.startedAt, finishedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await writeRefreshStatus(env, { runId, startedAt, finishedAt: null, status: "running", errors: currentErrors, stages: currentStages });
      return { runId, startedAt, finishedAt: startedAt, errors: currentErrors, ok: false, stage: "intervals", stages: currentStages };
    } catch (error) {
      errors.intervals = error?.message || "Interval snapshot failed";
      currentStages.intervals = { status: "error", startedAt: currentStages.intervals?.startedAt || null, finishedAt: (/* @__PURE__ */ new Date()).toISOString() };
      console.error("[Interval Snapshot] refresh failed", error);
      await writeRefreshStatus(env, { runId, startedAt, finishedAt: (/* @__PURE__ */ new Date()).toISOString(), status: "partial", errors: { ...currentErrors, ...errors }, stages: currentStages });
      return { runId, startedAt, finishedAt: (/* @__PURE__ */ new Date()).toISOString(), errors: { ...currentErrors, ...errors }, ok: false, stage: "intervals", stages: currentStages };
    }
  }
  if (isPricesPending && !currentStages.prices?.startedAt) {
    try {
      currentStages.prices = { status: "running", startedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await writeRefreshStatus(env, { runId, startedAt, finishedAt: null, status: "running", errors: currentErrors, stages: currentStages });
      await refreshPriceSnapshots(env);
      currentStages.prices = { status: "success", startedAt: currentStages.prices.startedAt, finishedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await writeRefreshStatus(env, { runId, startedAt, finishedAt: null, status: "running", errors: currentErrors, stages: currentStages });
      return { runId, startedAt, finishedAt: startedAt, errors: currentErrors, ok: false, stage: "prices", stages: currentStages };
    } catch (error) {
      errors.prices = error?.message || "Price snapshot failed";
      currentStages.prices = { status: "error", startedAt: currentStages.prices?.startedAt || null, finishedAt: (/* @__PURE__ */ new Date()).toISOString() };
      console.error("[Price Snapshot] refresh failed", error);
      await writeRefreshStatus(env, { runId, startedAt, finishedAt: (/* @__PURE__ */ new Date()).toISOString(), status: "partial", errors: { ...currentErrors, ...errors }, stages: currentStages });
      return { runId, startedAt, finishedAt: (/* @__PURE__ */ new Date()).toISOString(), errors: { ...currentErrors, ...errors }, ok: false, stage: "prices", stages: currentStages };
    }
  }
  if (isChartsPending && !currentStages.charts?.startedAt) {
    try {
      currentStages.charts = { status: "running", startedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await writeRefreshStatus(env, { runId, startedAt, finishedAt: null, status: "running", errors: currentErrors, stages: currentStages });
      await refreshChartSnapshots(env);
      currentStages.charts = { status: "success", startedAt: currentStages.charts.startedAt, finishedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await writeRefreshStatus(env, { runId, startedAt, finishedAt: null, status: "running", errors: currentErrors, stages: currentStages });
      return { runId, startedAt, finishedAt: startedAt, errors: currentErrors, ok: false, stage: "charts", stages: currentStages };
    } catch (error) {
      errors.charts = error?.message || "Chart snapshot failed";
      currentStages.charts = { status: "error", startedAt: currentStages.charts?.startedAt || null, finishedAt: (/* @__PURE__ */ new Date()).toISOString() };
      console.error("[Chart Snapshot] refresh failed", error);
      await writeRefreshStatus(env, { runId, startedAt, finishedAt: (/* @__PURE__ */ new Date()).toISOString(), status: "partial", errors: { ...currentErrors, ...errors }, stages: currentStages });
      return { runId, startedAt, finishedAt: (/* @__PURE__ */ new Date()).toISOString(), errors: { ...currentErrors, ...errors }, ok: false, stage: "charts", stages: currentStages };
    }
  }
  const finishedAt = (/* @__PURE__ */ new Date()).toISOString();
  const finalStages = {
    nse: currentStages.nse || { status: "success" },
    intervals: currentStages.intervals || { status: "success" },
    prices: currentStages.prices || { status: "success" },
    charts: currentStages.charts || { status: "success" }
  };
  const isComplete = finalStages.nse?.status === "success" && finalStages.intervals?.status === "success" && finalStages.prices?.status === "success" && finalStages.charts?.status === "success";
  const result = { runId, startedAt, finishedAt, errors: { ...currentErrors, ...errors }, ok: isComplete, stages: finalStages };
  await writeRefreshStatus(env, {
    runId,
    startedAt,
    finishedAt,
    status: result.ok ? "success" : "partial",
    errors: { ...currentErrors, ...errors },
    stages: finalStages
  });
  return result;
}
__name(runIncrementalRefresh, "runIncrementalRefresh");
async function refreshIntervalSnapshots(env) {
  if (!env?.NSE_INTERVAL_SNAPSHOT_ENABLED || String(env.NSE_INTERVAL_SNAPSHOT_ENABLED).toLowerCase() !== "true") {
    return;
  }
  const rawUniverse = await fetchUniverseData(env);
  if (!Array.isArray(rawUniverse)) {
    throw new Error("Universe payload invalid");
  }
  const symbols = Array.from(new Set(rawUniverse.map((row) => normalizeSymbol(row?.symbol)).filter(Boolean)));
  if (symbols.length === 0) {
    throw new Error("Universe returned no symbols");
  }
  const intervals = parseIntervalList(env);
  const chunkMode = resolveChunkMode(env?.NSE_SNAPSHOT_CHUNK_MODE);
  const batchSize = Math.max(1, Math.min(Number(env?.NSE_INTERVAL_SNAPSHOT_BATCH_SIZE || 550), 550));
  const concurrency = Math.max(1, Math.min(Number(env?.NSE_INTERVAL_SNAPSHOT_CONCURRENCY || 3), 8));
  const metaChunks = /* @__PURE__ */ new Set();
  for (const interval of intervals) {
    const window = getIntervalWindow(interval);
    const buckets = /* @__PURE__ */ new Map();
    const ensureBucket = /* @__PURE__ */ __name((key) => {
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {};
        buckets.set(key, bucket);
      }
      return bucket;
    }, "ensureBucket");
    const chunks = [];
    for (let i = 0; i < symbols.length; i += batchSize) {
      chunks.push(symbols.slice(i, i + batchSize));
    }
    let cursor = 0;
    const runWorker = /* @__PURE__ */ __name(async () => {
      while (cursor < chunks.length) {
        const index = cursor;
        cursor += 1;
        const groupSymbols = chunks[index];
        const entries = groupSymbols.map((sym) => {
          const ex = /^\d+$/.test(sym) ? "BOM" : "NSE";
          const rpcArgs = JSON.stringify([[[null, [sym, ex]]], window, null, null, null, null, null, 0]);
          return [GOOGLE_RPC_CHART, rpcArgs, null, "generic"];
        });
        let frames = [];
        try {
          const batchResult = await executeGoogleBatch(entries, GOOGLE_RPC_CHART);
          frames = parseAllFrames(batchResult.text).filter((frame) => frame.rpcId === GOOGLE_RPC_CHART);
        } catch (error) {
          console.error(`[Interval Snapshot] Batch failed (${interval})`, error);
        }
        const returned = /* @__PURE__ */ new Map();
        frames.forEach((frame) => {
          const extracted = extractIntervalFromFrame(frame.payload, interval);
          if (extracted?.symbol) {
            returned.set(extracted.symbol, extracted.data);
          }
        });
        groupSymbols.forEach((sym) => {
          const data = returned.has(sym) ? returned.get(sym) : null;
          const chunkKey = chunkKeyForSymbol(sym, chunkMode);
          metaChunks.add(chunkKey);
          const bucket = ensureBucket(chunkKey);
          bucket[sym] = data;
        });
        await sleep(50);
      }
    }, "runWorker");
    await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, runWorker));
    for (const [chunkKey, bucket] of buckets.entries()) {
      await putSnapshotObject(
        env,
        `${INTERVAL_SNAPSHOT_PREFIX}/${interval}/chunks/${chunkKey}.json.gz`,
        bucket,
        { gzip: true, cacheControl: INTERVAL_SNAPSHOT_CACHE_CONTROL }
      );
    }
    const intervalMeta = {
      interval,
      window,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      symbolCount: symbols.length,
      chunkMode,
      chunkCount: buckets.size,
      chunks: Array.from(buckets.keys()).sort()
    };
    await putSnapshotObject(
      env,
      `${INTERVAL_SNAPSHOT_PREFIX}/${interval}/meta.json`,
      intervalMeta,
      { gzip: false, cacheControl: INTERVAL_META_CACHE_CONTROL }
    );
  }
  const meta = {
    schemaVersion: 1,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    intervals,
    chunkMode,
    chunks: Array.from(metaChunks).sort(),
    chunkCount: metaChunks.size,
    symbolCount: symbols.length
  };
  await putSnapshotObject(env, INTERVAL_META_KEY, meta, { gzip: false, cacheControl: INTERVAL_META_CACHE_CONTROL });
}
__name(refreshIntervalSnapshots, "refreshIntervalSnapshots");
async function refreshPriceSnapshots(env) {
  if (!env?.NSE_PRICE_SNAPSHOT_ENABLED || String(env.NSE_PRICE_SNAPSHOT_ENABLED).toLowerCase() !== "true") {
    return;
  }
  const rawUniverse = await fetchUniverseData(env);
  if (!Array.isArray(rawUniverse)) throw new Error("Universe payload invalid");
  const symbols = Array.from(new Set(rawUniverse.map((row) => normalizeSymbol(row?.symbol)).filter(Boolean)));
  if (symbols.length === 0) throw new Error("Universe returned no symbols");
  const chunkMode = resolveChunkMode(env?.NSE_SNAPSHOT_CHUNK_MODE);
  const batchSize = Math.max(1, Math.min(Number(env?.NSE_PRICE_SNAPSHOT_BATCH_SIZE || 550), 550));
  const concurrency = Math.max(1, Math.min(Number(env?.NSE_PRICE_SNAPSHOT_CONCURRENCY || 3), 8));
  const buckets = /* @__PURE__ */ new Map();
  const ensureBucket = /* @__PURE__ */ __name((key) => {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {};
      buckets.set(key, bucket);
    }
    return bucket;
  }, "ensureBucket");
  const batches = [];
  for (let i = 0; i < symbols.length; i += batchSize) {
    batches.push(symbols.slice(i, i + batchSize));
  }
  let cursor = 0;
  const runWorker = /* @__PURE__ */ __name(async () => {
    while (cursor < batches.length) {
      const index = cursor;
      cursor += 1;
      const groupSymbols = batches[index];
      const entries = groupSymbols.map((sym) => {
        const ex = getExchangeForSymbol(sym);
        const rpcArgs = JSON.stringify([[[null, [sym, ex]]], 1]);
        return [GOOGLE_RPC_PRICE, rpcArgs, null, "generic"];
      });
      let frames = [];
      try {
        const batchResult = await executeGoogleBatch(entries, GOOGLE_RPC_PRICE);
        frames = parseAllFrames(batchResult.text).filter((frame) => frame.rpcId === GOOGLE_RPC_PRICE);
      } catch (error) {
        console.error("[Price Snapshot] Batch failed", error);
      }
      const returned = /* @__PURE__ */ new Map();
      frames.forEach((frame) => {
        const extracted = extractPriceFromFrame(frame.payload);
        if (extracted?.symbol) returned.set(extracted.symbol, extracted.data);
      });
      groupSymbols.forEach((sym) => {
        const data = returned.has(sym) ? returned.get(sym) : null;
        const chunkKey = chunkKeyForSymbol(sym, chunkMode);
        const bucket = ensureBucket(chunkKey);
        bucket[sym] = data;
      });
      await sleep(50);
    }
  }, "runWorker");
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, runWorker));
  for (const [chunkKey, bucket] of buckets.entries()) {
    await putSnapshotObject(
      env,
      `${PRICE_SNAPSHOT_PREFIX}/chunks/${chunkKey}.json.gz`,
      bucket,
      { gzip: true, cacheControl: INTERVAL_SNAPSHOT_CACHE_CONTROL }
    );
  }
  const meta = {
    schemaVersion: 1,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    chunkMode,
    chunkCount: buckets.size,
    symbolCount: symbols.length,
    chunks: Array.from(buckets.keys()).sort()
  };
  await putSnapshotObject(env, PRICE_META_KEY, meta, { gzip: false, cacheControl: INTERVAL_META_CACHE_CONTROL });
}
__name(refreshPriceSnapshots, "refreshPriceSnapshots");
async function refreshChartSnapshots(env) {
  if (!env?.NSE_CHART_SNAPSHOT_ENABLED || String(env.NSE_CHART_SNAPSHOT_ENABLED).toLowerCase() !== "true") {
    return;
  }
  const rawUniverse = await fetchUniverseData(env);
  if (!Array.isArray(rawUniverse)) throw new Error("Universe payload invalid");
  const symbols = Array.from(new Set(rawUniverse.map((row) => normalizeSymbol(row?.symbol)).filter(Boolean)));
  if (symbols.length === 0) throw new Error("Universe returned no symbols");
  const intervals = parseIntervalListValue(env?.NSE_CHART_SNAPSHOT_INTERVALS);
  const batchSize = Math.max(1, Math.min(Number(env?.NSE_CHART_SNAPSHOT_BATCH_SIZE || 200), 550));
  const concurrency = Math.max(1, Math.min(Number(env?.NSE_CHART_SNAPSHOT_CONCURRENCY || 2), 6));
  for (const interval of intervals) {
    const window = getIntervalWindow(interval);
    const batches = [];
    for (let i = 0; i < symbols.length; i += batchSize) {
      batches.push(symbols.slice(i, i + batchSize));
    }
    let cursor = 0;
    const runWorker = /* @__PURE__ */ __name(async () => {
      while (cursor < batches.length) {
        const index = cursor;
        cursor += 1;
        const groupSymbols = batches[index];
        const entries = groupSymbols.map((sym) => {
          const ex = getExchangeForSymbol(sym);
          const rpcArgs = JSON.stringify([[[null, [sym, ex]]], window, null, null, null, null, null, 0]);
          return [GOOGLE_RPC_CHART, rpcArgs, null, "generic"];
        });
        let frames = [];
        try {
          const batchResult = await executeGoogleBatch(entries, GOOGLE_RPC_CHART);
          frames = parseAllFrames(batchResult.text).filter((frame) => frame.rpcId === GOOGLE_RPC_CHART);
        } catch (error) {
          console.error(`[Chart Snapshot] Batch failed (${interval})`, error);
        }
        const returned = /* @__PURE__ */ new Map();
        frames.forEach((frame) => {
          const extracted = extractWideChartFromFrame(frame.payload);
          if (extracted?.symbol) returned.set(extracted.symbol, extracted.series);
        });
        for (const sym of groupSymbols) {
          const series = returned.has(sym) ? returned.get(sym) : null;
          await putSnapshotObject(
            env,
            `${CHART_SNAPSHOT_PREFIX}/${interval}/symbols/${sym}.json.gz`,
            series,
            { gzip: true, cacheControl: INTERVAL_SNAPSHOT_CACHE_CONTROL }
          );
        }
        await sleep(50);
      }
    }, "runWorker");
    await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, runWorker));
    const intervalMeta = {
      interval,
      window,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      symbolCount: symbols.length
    };
    await putSnapshotObject(
      env,
      `${CHART_SNAPSHOT_PREFIX}/${interval}/meta.json`,
      intervalMeta,
      { gzip: false, cacheControl: INTERVAL_META_CACHE_CONTROL }
    );
  }
  const meta = {
    schemaVersion: 1,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    intervals,
    symbolCount: symbols.length
  };
  await putSnapshotObject(env, CHART_META_KEY, meta, { gzip: false, cacheControl: INTERVAL_META_CACHE_CONTROL });
}
__name(refreshChartSnapshots, "refreshChartSnapshots");
async function handleIntervalSnapshotRequest(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return createMethodNotAllowedResponse("GET, HEAD");
  }
  if (!env?.NSE_SNAPSHOTS?.get) {
    return createJsonResponse(500, { error: "R2 binding not configured" });
  }
  let key = "";
  let cacheControl = INTERVAL_SNAPSHOT_CACHE_CONTROL;
  if (url.pathname === "/api/nse/intervals/meta") {
    key = INTERVAL_META_KEY;
    cacheControl = INTERVAL_META_CACHE_CONTROL;
  } else {
    const match = url.pathname.match(/^\/api\/nse\/intervals\/([^/]+)\/(meta|chunks)\/?([^/]*)?$/);
    if (!match) return createJsonResponse(404, { error: "Unknown interval route" });
    const interval = decodeURIComponent(match[1]).toUpperCase();
    const kind = match[2];
    const tail = decodeURIComponent(match[3] || "");
    if (kind === "meta") {
      key = `${INTERVAL_SNAPSHOT_PREFIX}/${interval}/meta.json`;
      cacheControl = INTERVAL_META_CACHE_CONTROL;
    } else {
      if (!tail) return createJsonResponse(400, { error: "Missing chunk key" });
      key = `${INTERVAL_SNAPSHOT_PREFIX}/${interval}/chunks/${tail}.json.gz`;
    }
  }
  const object = await env.NSE_SNAPSHOTS.get(key);
  if (!object) return createJsonResponse(404, { error: "Snapshot not found" });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", cacheControl);
  headers.set("ETag", object.httpEtag);
  return new Response(request.method === "HEAD" ? null : object.body, {
    status: 200,
    headers
  });
}
__name(handleIntervalSnapshotRequest, "handleIntervalSnapshotRequest");
async function handleNseSnapshotRequest(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return createMethodNotAllowedResponse("GET, HEAD");
  }
  if (!env?.NSE_SNAPSHOTS?.get) {
    return createJsonResponse(500, { error: "R2 binding not configured" });
  }
  let key = "";
  let cacheControl = NSE_SNAPSHOT_CACHE_CONTROL;
  if (url.pathname === "/api/nse/meta") {
    key = NSE_META_KEY;
    cacheControl = NSE_META_CACHE_CONTROL;
  } else if (url.pathname.startsWith("/api/nse/chunks/")) {
    const chunkKey = decodeURIComponent(url.pathname.slice("/api/nse/chunks/".length));
    if (!chunkKey) return createJsonResponse(400, { error: "Missing chunk key" });
    key = `${NSE_CHUNK_PREFIX}${chunkKey}.json.gz`;
  } else {
    return createJsonResponse(404, { error: "Unknown NSE route" });
  }
  const object = await env.NSE_SNAPSHOTS.get(key);
  if (!object) return createJsonResponse(404, { error: "Snapshot not found" });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", cacheControl);
  headers.set("ETag", object.httpEtag);
  return new Response(request.method === "HEAD" ? null : object.body, {
    status: 200,
    headers
  });
}
__name(handleNseSnapshotRequest, "handleNseSnapshotRequest");
async function handlePriceSnapshotRequest(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return createMethodNotAllowedResponse("GET, HEAD");
  }
  if (!env?.NSE_SNAPSHOTS?.get) {
    return createJsonResponse(500, { error: "R2 binding not configured" });
  }
  let key = "";
  let cacheControl = INTERVAL_SNAPSHOT_CACHE_CONTROL;
  if (url.pathname === "/api/nse/prices/meta") {
    key = PRICE_META_KEY;
    cacheControl = INTERVAL_META_CACHE_CONTROL;
  } else if (url.pathname.startsWith("/api/nse/prices/chunks/")) {
    const chunkKey = decodeURIComponent(url.pathname.slice("/api/nse/prices/chunks/".length));
    if (!chunkKey) return createJsonResponse(400, { error: "Missing chunk key" });
    key = `${PRICE_SNAPSHOT_PREFIX}/chunks/${chunkKey}.json.gz`;
  } else {
    return createJsonResponse(404, { error: "Unknown price snapshot route" });
  }
  const object = await env.NSE_SNAPSHOTS.get(key);
  if (!object) return createJsonResponse(404, { error: "Snapshot not found" });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", cacheControl);
  headers.set("ETag", object.httpEtag);
  return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
}
__name(handlePriceSnapshotRequest, "handlePriceSnapshotRequest");
async function handleFundaSnapshotRequest(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return createMethodNotAllowedResponse("GET, HEAD");
  }
  if (!env?.NSE_SNAPSHOTS?.get) {
    return createJsonResponse(500, { error: "R2 binding not configured" });
  }
  let key = "";
  let cacheControl = INTERVAL_SNAPSHOT_CACHE_CONTROL;
  if (url.pathname === "/api/nse/fundamentals/meta") {
    key = FUNDA_META_KEY;
    cacheControl = INTERVAL_META_CACHE_CONTROL;
  } else if (url.pathname.startsWith("/api/nse/fundamentals/chunks/")) {
    const chunkKey = decodeURIComponent(url.pathname.slice("/api/nse/fundamentals/chunks/".length));
    if (!chunkKey) return createJsonResponse(400, { error: "Missing chunk key" });
    key = `${FUNDA_SNAPSHOT_PREFIX}/chunks/${chunkKey}.json.gz`;
  } else {
    return createJsonResponse(404, { error: "Unknown fundamentals snapshot route" });
  }
  const object = await env.NSE_SNAPSHOTS.get(key);
  if (!object) return createJsonResponse(404, { error: "Snapshot not found" });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", cacheControl);
  headers.set("ETag", object.httpEtag);
  return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
}
__name(handleFundaSnapshotRequest, "handleFundaSnapshotRequest");
async function handleChartSnapshotRequest(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return createMethodNotAllowedResponse("GET, HEAD");
  }
  if (!env?.NSE_SNAPSHOTS?.get) {
    return createJsonResponse(500, { error: "R2 binding not configured" });
  }
  let key = "";
  let cacheControl = INTERVAL_SNAPSHOT_CACHE_CONTROL;
  if (url.pathname === "/api/nse/charts/meta") {
    key = CHART_META_KEY;
    cacheControl = INTERVAL_META_CACHE_CONTROL;
  } else {
    const match = url.pathname.match(/^\/api\/nse\/charts\/([^/]+)\/(meta|symbols)\/?([^/]*)?$/);
    if (!match) return createJsonResponse(404, { error: "Unknown chart snapshot route" });
    const interval = decodeURIComponent(match[1]).toUpperCase();
    const kind = match[2];
    const tail = decodeURIComponent(match[3] || "");
    if (kind === "meta") {
      key = `${CHART_SNAPSHOT_PREFIX}/${interval}/meta.json`;
      cacheControl = INTERVAL_META_CACHE_CONTROL;
    } else {
      if (!tail) return createJsonResponse(400, { error: "Missing symbol" });
      key = `${CHART_SNAPSHOT_PREFIX}/${interval}/symbols/${tail}.json.gz`;
    }
  }
  const object = await env.NSE_SNAPSHOTS.get(key);
  if (!object) return createJsonResponse(404, { error: "Snapshot not found" });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", cacheControl);
  headers.set("ETag", object.httpEtag);
  return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
}
__name(handleChartSnapshotRequest, "handleChartSnapshotRequest");
async function handleSnapshotHealth(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return createMethodNotAllowedResponse("GET, HEAD");
  }
  if (!env?.NSE_SNAPSHOTS?.get) {
    return createJsonResponse(500, { ok: false, error: "R2 binding not configured" });
  }
  const checks = [
    { name: "nse", key: NSE_META_KEY },
    { name: "intervals", key: INTERVAL_META_KEY },
    { name: "prices", key: PRICE_META_KEY },
    { name: "fundamentals", key: FUNDA_META_KEY },
    { name: "charts", key: CHART_META_KEY }
  ];
  const results = {};
  const fetchedAt = (/* @__PURE__ */ new Date()).toISOString();
  await Promise.all(checks.map(async (check) => {
    try {
      const object = await env.NSE_SNAPSHOTS.get(check.key);
      results[check.name] = {
        exists: Boolean(object),
        etag: object?.httpEtag || null,
        uploadedAt: object?.uploaded || null,
        size: object?.size || null
      };
    } catch (error) {
      results[check.name] = { exists: false, error: error?.message || "fetch failed" };
    }
  }));
  const storedRefresh = await readRefreshStatus(env);
  return createJsonResponse(200, {
    ok: true,
    fetchedAt,
    results,
    lastRefresh: storedRefresh || lastRefreshState
  });
}
__name(handleSnapshotHealth, "handleSnapshotHealth");
function createOptionsResponse(allowMethods, allowHeaders = "Content-Type") {
  return new Response(null, {
    status: 204,
    headers: {
      ...getNoStoreHeaders(),
      "Access-Control-Allow-Methods": allowMethods,
      "Access-Control-Allow-Headers": allowHeaders,
      "Allow": allowMethods.replace(/,\s*/g, ", ")
    }
  });
}
__name(createOptionsResponse, "createOptionsResponse");
function createMethodNotAllowedResponse(allowMethods) {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: {
      ...getNoStoreHeaders(),
      "Allow": allowMethods
    }
  });
}
__name(createMethodNotAllowedResponse, "createMethodNotAllowedResponse");
function normalizeApiPath(url) {
  const mapped = API_V1_REWRITES.get(url.pathname);
  if (mapped) url.pathname = mapped;
  if (url.pathname.startsWith("/api/tv/")) {
    const tvPath = url.pathname.slice("/api/tv/".length);
    url.pathname = "/api/tv";
    url.searchParams.set("tv_path", tvPath);
  }
}
__name(normalizeApiPath, "normalizeApiPath");
function toUint8ArrayFromHex(hexStr) {
  const clean = String(hexStr || "").trim();
  if (!clean || clean.length % 2 !== 0) throw new Error("Invalid encrypted payload");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}
__name(toUint8ArrayFromHex, "toUint8ArrayFromHex");
function decodeBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
__name(decodeBase64Url, "decodeBase64Url");
async function getDecryptKey() {
  if (cachedDecryptKey) return cachedDecryptKey;
  cachedDecryptKey = await crypto.subtle.importKey(
    "raw",
    AES_KEY_BYTES,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  return cachedDecryptKey;
}
__name(getDecryptKey, "getDecryptKey");
async function unsealHexPayload(hexStr) {
  const raw = toUint8ArrayFromHex(hexStr);
  if (raw.byteLength < 13) throw new Error("Encrypted payload too short");
  const iv = raw.slice(0, 12);
  const cipherPlusTag = raw.slice(12);
  const key = await getDecryptKey();
  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipherPlusTag);
  return new TextDecoder().decode(plainBuffer);
}
__name(unsealHexPayload, "unsealHexPayload");
async function handleGoogleBatch(request, url, { encryptedPost }) {
  if (request.method === "OPTIONS") return createOptionsResponse("GET, POST, OPTIONS", "Content-Type, x-app-entropy, x-rpc-ids");
  if (request.method !== "GET" && request.method !== "POST") return createMethodNotAllowedResponse("GET, POST");
  try {
    const isGet = request.method === "GET";
    let decodedFReq = "";
    let rpcIds = "";
    if (isGet) {
      const encoded = url.searchParams.get("f_req");
      if (!encoded) return createJsonResponse(400, { error: "Missing f_req" });
      decodedFReq = decodeBase64Url(encoded);
      rpcIds = url.searchParams.get("rpcids") || "xh8wxf";
    } else if (encryptedPost) {
      const encrypted = await request.text();
      decodedFReq = await unsealHexPayload(encrypted);
      rpcIds = request.headers.get("x-app-entropy") || "xh8wxf";
    } else {
      rpcIds = request.headers.get("x-rpc-ids") || "xh8wxf";
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const formText = await request.text();
        decodedFReq = new URLSearchParams(formText).get("f.req") || "";
      } else if (contentType.includes("application/json")) {
        const body = await request.json();
        decodedFReq = body?.["f.req"] ?? "";
      } else {
        const text2 = await request.text();
        try {
          const body = JSON.parse(text2);
          decodedFReq = body?.["f.req"] ?? "";
        } catch {
          decodedFReq = text2;
        }
      }
    }
    if (!decodedFReq) return createJsonResponse(400, { error: "Missing f.req payload" });
    const rpc = String(rpcIds);
    const googleUrl = `https://www.google.com/finance/_/GoogleFinanceUi/data/batchexecute?rpcids=${encodeURIComponent(rpc)}&source-path=%2Ffinance%2F&f.sid=dummy&hl=en-US&soc-app=162&soc-platform=1&soc-device=1&rt=c`;
    const upstream = await fetch(googleUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        "Origin": "https://www.google.com",
        "Referer": "https://www.google.com/finance/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      body: new URLSearchParams({ "f.req": decodedFReq }).toString()
    });
    const text = await upstream.text();
    if (!upstream.ok) return createCompressedTextResponse(request, upstream.status, text || `Upstream Error: ${upstream.status}`);
    return createCompressedTextResponse(request, 200, text);
  } catch (error) {
    return createJsonResponse(500, { error: "Proxy error", details: error?.message || "Unknown error" });
  }
}
__name(handleGoogleBatch, "handleGoogleBatch");
async function getEncryptedJsonBody(request, url) {
  if (request.method === "GET") {
    const encoded = url.searchParams.get("f_req");
    if (!encoded) throw new Error("Missing f_req");
    return JSON.parse(decodeBase64Url(encoded));
  }
  const encrypted = await request.text();
  const plain = await unsealHexPayload(encrypted);
  return JSON.parse(plain);
}
__name(getEncryptedJsonBody, "getEncryptedJsonBody");
async function handleStrikeProxy(request, url) {
  if (request.method === "OPTIONS") return createOptionsResponse("GET, POST, OPTIONS");
  if (request.method !== "GET" && request.method !== "POST") return createMethodNotAllowedResponse("GET, POST");
  try {
    const body = await getEncryptedJsonBody(request, url);
    const { fromStr, toStr, encoded, path } = body;
    const strikeUrl = `https://api-v2.strike.money${path}?candleInterval=1d&from=${fromStr}&to=${toStr}&securities=${encoded}`;
    const upstream = await fetch(strikeUrl, { headers: { Accept: "application/json" } });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...getNoStoreHeaders(),
        "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8"
      }
    });
  } catch (error) {
    return createJsonResponse(500, { error: "System Error", details: error?.message || "Unknown error" });
  }
}
__name(handleStrikeProxy, "handleStrikeProxy");
async function handleScanxProxy(request, url) {
  if (request.method === "OPTIONS") return createOptionsResponse("GET, POST, OPTIONS");
  if (request.method !== "GET" && request.method !== "POST") return createMethodNotAllowedResponse("GET, POST");
  try {
    const payload = await getEncryptedJsonBody(request, url);
    const upstream = await fetch("https://ow-static-scanx.dhan.co/staticscanx/company_filings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Origin": "https://ow-static-scanx.dhan.co",
        "Referer": "https://ow-static-scanx.dhan.co/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      body: JSON.stringify(payload)
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...getNoStoreHeaders(),
        "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8"
      }
    });
  } catch (error) {
    return createJsonResponse(500, { error: "Failed to fetch filings", details: error?.message || "Unknown error" });
  }
}
__name(handleScanxProxy, "handleScanxProxy");
async function handleMobileScanx(request) {
  if (request.method === "OPTIONS") return createOptionsResponse("POST, OPTIONS");
  if (request.method !== "POST") return createMethodNotAllowedResponse("POST");
  try {
    const payload = await request.json();
    const upstream = await fetch("https://ow-static-scanx.dhan.co/staticscanx/company_filings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Origin": "https://ow-static-scanx.dhan.co",
        "Referer": "https://ow-static-scanx.dhan.co/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      body: JSON.stringify(payload)
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...getNoStoreHeaders(),
        "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8"
      }
    });
  } catch (error) {
    return createJsonResponse(500, { error: "Failed to fetch filings", details: error?.message || "Unknown error" });
  }
}
__name(handleMobileScanx, "handleMobileScanx");
async function handleMobileStrike(request) {
  if (request.method === "OPTIONS") return createOptionsResponse("POST, OPTIONS");
  if (request.method !== "POST") return createMethodNotAllowedResponse("POST");
  try {
    const body = await request.json();
    const { fromStr, toStr, encoded, path } = body;
    const strikeUrl = `https://api-v2.strike.money${path}?candleInterval=1d&from=${fromStr}&to=${toStr}&securities=${encoded}`;
    const upstream = await fetch(strikeUrl, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...getNoStoreHeaders(),
        "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8"
      }
    });
  } catch (error) {
    return createJsonResponse(500, { error: "Proxy error", details: error?.message || "Unknown error" });
  }
}
__name(handleMobileStrike, "handleMobileStrike");
function buildTradingViewCookie(request) {
  const existingCookie = request.headers.get("cookie");
  const sessionId = request.headers.get("x-tv-sessionid");
  const sessionSign = request.headers.get("x-tv-sessionid-sign");
  const parts = [];
  if (existingCookie) parts.push(existingCookie);
  if (sessionId) parts.push(`sessionid=${sessionId}`);
  if (sessionSign) parts.push(`sessionid_sign=${sessionSign}`);
  return parts.length > 0 ? parts.join("; ") : "";
}
__name(buildTradingViewCookie, "buildTradingViewCookie");
function buildTradingViewHeaders(request) {
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    const normalized = key.toLowerCase();
    if (HOP_BY_HOP_REQUEST_HEADERS.has(normalized)) continue;
    if (normalized.startsWith("x-tv-sessionid")) continue;
    headers.set(key, value);
  }
  headers.set("Origin", "https://www.tradingview.com");
  headers.set("Referer", "https://www.tradingview.com/");
  headers.set("X-Requested-With", "XMLHttpRequest");
  const cookie = buildTradingViewCookie(request);
  if (cookie) headers.set("Cookie", cookie);
  else headers.delete("Cookie");
  return headers;
}
__name(buildTradingViewHeaders, "buildTradingViewHeaders");
async function handleTradingView(request, url) {
  if (request.method === "OPTIONS") {
    return createOptionsResponse("GET, POST, PATCH, DELETE, PUT, OPTIONS", "Content-Type, x-tv-sessionid, x-tv-sessionid-sign");
  }
  const rawPath = url.searchParams.get("tv_path") || "";
  const upstreamPath = rawPath ? `/${rawPath.replace(/^\/+/, "")}` : "/";
  const query = new URLSearchParams(url.search);
  query.delete("tv_path");
  const upstreamUrl = `${TV_UPSTREAM_BASE}${upstreamPath}${query.toString() ? `?${query.toString()}` : ""}`;
  const method = request.method || "GET";
  const hasBody = !["GET", "HEAD"].includes(method.toUpperCase());
  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers: buildTradingViewHeaders(request),
      body: hasBody ? await request.arrayBuffer() : void 0,
      redirect: "manual"
    });
    const outHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
      outHeaders.set(key, value);
    });
    outHeaders.set("Access-Control-Allow-Origin", "*");
    outHeaders.set("Cache-Control", "no-store");
    outHeaders.set("CDN-Cache-Control", "no-store");
    outHeaders.set("Vary", "x-tv-sessionid, x-tv-sessionid-sign, Cookie");
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: outHeaders
    });
  } catch (error) {
    return createJsonResponse(502, { error: "TradingView proxy failed", details: error?.message || "Unknown error" });
  }
}
__name(handleTradingView, "handleTradingView");
async function proxyToOrigin(request, env, url) {
  const originBaseUrl = env?.ORIGIN_BASE_URL || "";
  if (!originBaseUrl) return null;
  const upstreamUrl = new URL(originBaseUrl);
  upstreamUrl.pathname = url.pathname;
  upstreamUrl.search = url.search;
  return fetch(new Request(upstreamUrl.toString(), request));
}
__name(proxyToOrigin, "proxyToOrigin");
function isLikelyAssetPath(pathname) {
  const tail = pathname.split("/").pop() || "";
  return tail.includes(".");
}
__name(isLikelyAssetPath, "isLikelyAssetPath");
async function handleStatic(request, env, url) {
  if (env?.ASSETS?.fetch) {
    let response = await env.ASSETS.fetch(request);
    if (request.method === "GET" && response.status === 404 && !isLikelyAssetPath(url.pathname)) {
      const spaUrl = new URL(url.toString());
      spaUrl.pathname = "/index.html";
      spaUrl.search = "";
      response = await env.ASSETS.fetch(new Request(spaUrl.toString(), request));
    }
    return response;
  }
  const proxied = await proxyToOrigin(request, env, url);
  if (proxied) return proxied;
  return new Response("Not found. Configure ASSETS binding or ORIGIN_BASE_URL.", { status: 404 });
}
__name(handleStatic, "handleStatic");
async function handleWorkerVersion(request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return createMethodNotAllowedResponse("GET, HEAD");
  }
  return createJsonResponse(200, {
    ok: true,
    buildId: WORKER_BUILD_ID,
    ts: (/* @__PURE__ */ new Date()).toISOString()
  });
}
__name(handleWorkerVersion, "handleWorkerVersion");
async function handleSnapshotRefresh(request, env, ctx) {
  if (request.method !== "POST") {
    return createMethodNotAllowedResponse("POST");
  }
  const expectedToken = String(env?.NSE_REFRESH_TOKEN || "").trim();
  if (!expectedToken) {
    return createJsonResponse(403, { ok: false, error: "Refresh token not configured" });
  }
  const providedToken = request.headers.get("x-refresh-token") || "";
  if (providedToken !== expectedToken) {
    return createJsonResponse(403, { ok: false, error: "Unauthorized" });
  }
  const origin = new URL(request.url).origin;
  const envWithOrigin = { ...env, _manualOrigin: origin };
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  lastRefreshState = {
    runId: `manual-${Date.now()}`,
    startedAt,
    finishedAt: null,
    status: "running",
    errors: {},
    stages: {}
  };
  await writeRefreshStatus(env, lastRefreshState);
  const runner = (async () => {
    const result = await runRefreshPipeline(envWithOrigin);
    lastRefreshState = {
      runId: result.runId,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      status: result.ok ? "success" : "partial",
      errors: result.errors,
      stages: result.stages
    };
  })();
  if (ctx?.waitUntil) {
    ctx.waitUntil(runner);
  } else {
    await runner;
  }
  return createJsonResponse(200, { ok: true, startedAt });
}
__name(handleSnapshotRefresh, "handleSnapshotRefresh");
async function handleApi(request, env, url, ctx) {
  if (url.pathname === "/api/nse/meta" || url.pathname.startsWith("/api/nse/chunks/")) {
    return handleNseSnapshotRequest(request, env, url);
  }
  if (url.pathname === "/api/nse/intervals/meta" || url.pathname.startsWith("/api/nse/intervals/")) {
    return handleIntervalSnapshotRequest(request, env, url);
  }
  if (url.pathname === "/api/nse/prices/meta" || url.pathname.startsWith("/api/nse/prices/")) {
    return handlePriceSnapshotRequest(request, env, url);
  }
  if (url.pathname === "/api/nse/fundamentals/meta" || url.pathname.startsWith("/api/nse/fundamentals/")) {
    return handleFundaSnapshotRequest(request, env, url);
  }
  if (url.pathname === "/api/nse/charts/meta" || url.pathname.startsWith("/api/nse/charts/")) {
    return handleChartSnapshotRequest(request, env, url);
  }
  if (url.pathname === "/api/nse/health") {
    return handleSnapshotHealth(request, env, url);
  }
  if (url.pathname === "/api/version") {
    return handleWorkerVersion(request);
  }
  if (url.pathname === "/api/nse/refresh") {
    return handleSnapshotRefresh(request, env, ctx);
  }
  switch (url.pathname) {
    case "/api/fuckyouuuu":
      return handleGoogleBatch(request, url, { encryptedPost: true });
    case "/api/mobile-batch":
      return handleGoogleBatch(request, url, { encryptedPost: false });
    case "/api/fckyouuu1":
      return handleStrikeProxy(request, url);
    case "/api/scanx":
      return handleScanxProxy(request, url);
    case "/api/mobile-scanx":
      return handleMobileScanx(request);
    case "/api/mobile-strike":
      return handleMobileStrike(request);
    case "/api/tv":
      return handleTradingView(request, url);
    case "/api/nse/reset":
      return (async () => {
        if (request.method !== "POST" && request.method !== "GET") {
          return createMethodNotAllowedResponse("GET, POST");
        }
        const resetState = {
          runId: `reset-${Date.now()}`,
          startedAt: (/* @__PURE__ */ new Date()).toISOString(),
          finishedAt: null,
          status: "idle",
          errors: {},
          stages: {}
        };
        await writeRefreshStatus(env, resetState);
        return createJsonResponse(200, { ok: true, message: "Refresh status reset", state: resetState });
      })();
    default: {
      const proxied = await proxyToOrigin(request, env, url);
      if (proxied) return proxied;
      return createJsonResponse(404, { error: "Unknown API route" });
    }
  }
}
__name(handleApi, "handleApi");
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    normalizeApiPath(url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url, ctx);
    }
    return handleStatic(request, env, url);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const status = await readRefreshStatus(env);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      if (status?.status === "running") {
        console.log("[Cron] Previous refresh still running, checking if stuck...");
        const stuckTime = 10 * 60 * 1e3;
        const startTime = new Date(status.startedAt).getTime();
        if (Date.now() - startTime > stuckTime) {
          console.log("[Cron] Previous refresh stuck, resetting for incremental retry");
          await writeRefreshStatus(env, {
            runId: `resumed-${Date.now()}`,
            startedAt: status.startedAt,
            finishedAt: now,
            status: "partial",
            errors: { ...status.errors, timeout: "Previous run stuck, resuming" },
            stages: status.stages
          });
        } else {
          console.log("[Cron] Skipping - previous refresh still in progress");
          return;
        }
      }
      const result = await runIncrementalRefresh(env);
      lastRefreshState = {
        runId: result.runId,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        status: result.ok ? "success" : "partial",
        errors: result.errors,
        stages: result.stages || {}
      };
      await writeRefreshStatus(env, lastRefreshState);
      console.log("[Cron] Refresh result:", result.ok ? "complete" : "partial", Object.keys(result.errors));
    })());
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-scheduled.ts
var scheduled = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  const url = new URL(request.url);
  if (url.pathname === "/__scheduled") {
    const cron = url.searchParams.get("cron") ?? "";
    await middlewareCtx.dispatch("scheduled", { cron });
    return new Response("Ran scheduled event");
  }
  const resp = await middlewareCtx.next(request, env);
  if (request.headers.get("referer")?.endsWith("/__scheduled") && url.pathname === "/favicon.ico" && resp.status === 500) {
    return new Response(null, { status: 404 });
  }
  return resp;
}, "scheduled");
var middleware_scheduled_default = scheduled;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-Hp1C0a/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_scheduled_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-Hp1C0a/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map

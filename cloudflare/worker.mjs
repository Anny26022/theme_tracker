const UPSTREAM_BASE = "https://www.tradingview.com/api/v1";

const HOP_BY_HOP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "accept-encoding",
]);

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "transfer-encoding",
]);

const AES_KEY_BYTES = new Uint8Array([
  0x4a, 0x9c, 0x2e, 0xf1, 0x83, 0xd7, 0x56, 0xbb,
  0x12, 0x7e, 0xa4, 0x38, 0xc5, 0x69, 0xf0, 0x1d,
  0xe8, 0x31, 0x5b, 0x97, 0x04, 0xac, 0x72, 0xdf,
  0x63, 0xb8, 0x1f, 0x45, 0xea, 0x06, 0x8d, 0xc4,
]);

const TEXT_DECODER = new TextDecoder();

const CDN_CACHE_5M = "public, max-age=0, s-maxage=300, stale-while-revalidate=60";
const CDN_CACHE_1H = "public, max-age=0, s-maxage=3600, stale-while-revalidate=600";
const DATA_JSON_CACHE = "public, max-age=0, s-maxage=54000, stale-while-revalidate=60";
const EDGE_META_CACHED_AT = "x-tt-edge-cached-at";
const EDGE_META_TTL = "x-tt-edge-ttl";
const EDGE_META_SWR = "x-tt-edge-swr";

let cryptoKeyPromise;
function getCryptoKey() {
  if (!cryptoKeyPromise) {
    cryptoKeyPromise = crypto.subtle.importKey(
      "raw",
      AES_KEY_BYTES,
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );
  }
  return cryptoKeyPromise;
}

function withCors(headers = new Headers(), allowMethods = "GET, POST, PATCH, DELETE, PUT, OPTIONS", allowHeaders = "Content-Type") {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", allowMethods);
  headers.set("Access-Control-Allow-Headers", allowHeaders);
  return headers;
}

function withNoStore(headers = new Headers()) {
  headers.set("Cache-Control", "no-store");
  return headers;
}

function withCache(headers = new Headers(), cacheControl) {
  headers.set("Cache-Control", cacheControl);
  return headers;
}

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function cloneResponseWithHeaders(response, mutateHeaders) {
  const headers = new Headers(response.headers);
  mutateHeaders(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function applyEdgeAgeHeader(headers, ageSec) {
  headers.delete(EDGE_META_CACHED_AT);
  headers.delete(EDGE_META_TTL);
  headers.delete(EDGE_META_SWR);
  if (Number.isFinite(ageSec) && ageSec >= 0) {
    headers.set("Age", String(Math.floor(ageSec)));
  } else {
    headers.delete("Age");
  }
}

async function fetchWithEdgeCache({ cacheKeyUrl, ttlSec, swrSec, cacheControl, ctx, fetchFresh }) {
  const cache = caches.default;
  const cacheKey = new Request(cacheKeyUrl, { method: "GET" });
  const cached = await cache.match(cacheKey);
  const now = Date.now();

  const buildStoredResponse = (response) => {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", cacheControl);
    headers.set(EDGE_META_CACHED_AT, String(now));
    headers.set(EDGE_META_TTL, String(ttlSec));
    headers.set(EDGE_META_SWR, String(swrSec));
    headers.delete("x-vercel-cache");
    headers.delete("Age");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };

  const cacheAndReturnFresh = async () => {
    const fresh = await fetchFresh();
    const freshForClient = fresh.clone();
    const out = cloneResponseWithHeaders(freshForClient, (headers) => {
      headers.set("Cache-Control", cacheControl);
      applyEdgeAgeHeader(headers, 0);
    });

    if (fresh.ok) {
      const stored = buildStoredResponse(fresh);
      ctx.waitUntil(cache.put(cacheKey, stored));
    }

    return out;
  };

  if (!cached) {
    return cacheAndReturnFresh();
  }

  const cachedAtMs = Number.parseInt(cached.headers.get(EDGE_META_CACHED_AT) || "0", 10);
  const ageSec = cachedAtMs > 0 ? Math.max(0, Math.floor((now - cachedAtMs) / 1000)) : 0;
  const maxFresh = ttlSec;
  const maxStale = ttlSec + swrSec;

  if (ageSec <= maxFresh) {
    return cloneResponseWithHeaders(cached, (headers) => {
      headers.set("Cache-Control", cacheControl);
      applyEdgeAgeHeader(headers, ageSec);
    });
  }

  if (ageSec <= maxStale) {
    ctx.waitUntil((async () => {
      const fresh = await fetchFresh();
      if (!fresh.ok) return;
      const stored = buildStoredResponse(fresh.clone());
      await cache.put(cacheKey, stored);
    })().catch(() => {}));

    return cloneResponseWithHeaders(cached, (headers) => {
      headers.set("Cache-Control", cacheControl);
      applyEdgeAgeHeader(headers, ageSec);
    });
  }

  return cacheAndReturnFresh();
}

function firstQueryValue(url, key) {
  return url.searchParams.get(key);
}

function base64UrlToUtf8(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return TEXT_DECODER.decode(bytes);
}

function hexToBytes(hexStr) {
  const hex = String(hexStr || "").trim();
  if (hex.length % 2 !== 0) throw new Error("Invalid encrypted payload");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const value = Number.parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(value)) throw new Error("Invalid encrypted payload");
    bytes[i / 2] = value;
  }
  return bytes;
}

async function unseal(hexStr) {
  const raw = hexToBytes(hexStr);
  if (raw.length <= 28) throw new Error("Encrypted payload too short");
  const iv = raw.slice(0, 12);
  const ciphertextWithTag = raw.slice(12);
  const key = await getCryptoKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertextWithTag,
  );
  return TEXT_DECODER.decode(new Uint8Array(decrypted));
}

async function parseJsonBody(request) {
  const raw = await request.text();
  if (!raw) return {};
  return JSON.parse(raw);
}

function buildTvUpstreamUrl(requestUrl) {
  const rewrittenPath = firstQueryValue(requestUrl, "tv_path");
  const upstreamPath = rewrittenPath
    ? `/${String(rewrittenPath).replace(/^\/+/, "")}`
    : (requestUrl.pathname.replace(/^\/api\/tv/, "") || "/");

  const upstreamUrl = new URL(`${UPSTREAM_BASE}${upstreamPath}`);
  requestUrl.searchParams.forEach((value, key) => {
    if (key === "tv_path") return;
    upstreamUrl.searchParams.append(key, value);
  });
  return upstreamUrl.toString();
}

function buildTvCookieHeader(request) {
  const cookieParts = [];
  const existingCookie = request.headers.get("cookie");
  const sessionId = request.headers.get("x-tv-sessionid");
  const sessionSign = request.headers.get("x-tv-sessionid-sign");
  if (existingCookie && existingCookie.trim()) cookieParts.push(existingCookie.trim());
  if (sessionId) cookieParts.push(`sessionid=${sessionId}`);
  if (sessionSign) cookieParts.push(`sessionid_sign=${sessionSign}`);
  return cookieParts.length > 0 ? cookieParts.join("; ") : null;
}

function buildTvUpstreamHeaders(request) {
  const headers = new Headers();
  for (const [key, value] of request.headers) {
    const normalized = key.toLowerCase();
    if (HOP_BY_HOP_REQUEST_HEADERS.has(normalized)) continue;
    if (normalized.startsWith("x-tv-sessionid")) continue;
    headers.set(key, value);
  }

  headers.set("Origin", "https://www.tradingview.com");
  headers.set("Referer", "https://www.tradingview.com/");
  headers.set("X-Requested-With", "XMLHttpRequest");

  const cookie = buildTvCookieHeader(request);
  if (cookie) headers.set("Cookie", cookie);
  else headers.delete("Cookie");

  return headers;
}

function applyTvNoStoreHeaders(headers) {
  withCors(
    headers,
    "GET, POST, PATCH, DELETE, PUT, OPTIONS",
    "Content-Type, x-tv-sessionid, x-tv-sessionid-sign",
  );
  headers.set("Cache-Control", "no-store");
  headers.set("Vary", "x-tv-sessionid, x-tv-sessionid-sign, Cookie");
}

async function handleTvProxy(request, url) {
  const corsHeaders = new Headers();
  applyTvNoStoreHeaders(corsHeaders);

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const method = request.method || "GET";
  const allowsBody = !["GET", "HEAD"].includes(method.toUpperCase());
  const upstreamUrl = buildTvUpstreamUrl(url);
  const headers = buildTvUpstreamHeaders(request);
  const body = allowsBody ? await request.arrayBuffer() : undefined;

  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      redirect: "manual",
    });

    const responseHeaders = new Headers();
    for (const [key, value] of upstream.headers) {
      if (HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) continue;
      responseHeaders.set(key, value);
    }
    applyTvNoStoreHeaders(responseHeaders);

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return json(
      { error: "TradingView proxy failed", details: error?.message || String(error) },
      { status: 502, headers: corsHeaders },
    );
  }
}

async function handleGoogleBatch(request, url, { encrypted }, ctx) {
  const isGet = request.method === "GET";
  const isPost = request.method === "POST";
  if (!isGet && !isPost) return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });

  const headers = withCors(new Headers(), "GET, POST, OPTIONS", "Content-Type, x-app-entropy");
  if (isGet) withCache(headers, CDN_CACHE_5M);
  else withNoStore(headers);

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

  try {
    let decoded;
    let rpcIds;

    if (isGet) {
      const encoded = firstQueryValue(url, "f_req");
      if (!encoded) return json({ error: "Missing f_req" }, { status: 400, headers });
      decoded = base64UrlToUtf8(encoded);
      rpcIds = firstQueryValue(url, "rpcids") || "xh8wxf";
    } else {
      const rawBody = await request.text();
      decoded = encrypted ? await unseal(rawBody) : rawBody;
      rpcIds = request.headers.get("x-app-entropy") || "xh8wxf";
    }

    const googleUrl = `https://www.google.com/finance/_/GoogleFinanceUi/data/batchexecute?rpcids=${encodeURIComponent(rpcIds)}&source-path=%2Ffinance%2F&f.sid=dummy&hl=en-US&soc-app=162&soc-platform=1&soc-device=1&rt=c`;

    const fetchFresh = async () => {
      const upstream = await fetch(googleUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
          Origin: "https://www.google.com",
          Referer: "https://www.google.com/finance/",
          "User-Agent": "Mozilla/5.0",
        },
        body: new URLSearchParams({ "f.req": decoded }).toString(),
      });
      const text = await upstream.text();
      const outHeaders = new Headers(headers);
      return new Response(text, { status: upstream.status, headers: outHeaders });
    };

    if (!isGet) return fetchFresh();
    return fetchWithEdgeCache({
      cacheKeyUrl: request.url,
      ttlSec: 300,
      swrSec: 60,
      cacheControl: CDN_CACHE_5M,
      ctx,
      fetchFresh,
    });
  } catch (error) {
    return json({ error: "System Error", details: error?.message || String(error) }, { status: 500, headers });
  }
}

async function handleStrikeProxy(request, url, { encrypted }, ctx) {
  const isGet = request.method === "GET";
  const isPost = request.method === "POST";
  if (!isGet && !isPost) return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });

  const headers = withCors(new Headers(), "GET, POST, OPTIONS", "Content-Type, x-app-entropy");
  if (isGet) withCache(headers, CDN_CACHE_5M);
  else withNoStore(headers);

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

  try {
    const rawBody = isGet
      ? base64UrlToUtf8(firstQueryValue(url, "f_req") || "")
      : (encrypted ? await unseal(await request.text()) : await request.text());
    const decoded = JSON.parse(rawBody);
    const { fromStr, toStr, encoded, path } = decoded || {};
    const strikeUrl = `https://api-v2.strike.money${path}?candleInterval=1d&from=${fromStr}&to=${toStr}&securities=${encoded}`;

    const fetchFresh = async () => {
      const upstream = await fetch(strikeUrl, { headers: { Accept: "application/json" } });
      const payload = await upstream.text();
      const responseHeaders = new Headers(headers);
      responseHeaders.set("content-type", "application/json; charset=utf-8");
      return new Response(payload, { status: upstream.status, headers: responseHeaders });
    };

    if (!isGet) return fetchFresh();
    return fetchWithEdgeCache({
      cacheKeyUrl: request.url,
      ttlSec: 300,
      swrSec: 60,
      cacheControl: CDN_CACHE_5M,
      ctx,
      fetchFresh,
    });
  } catch (error) {
    return json({ error: "System Error", details: error?.message || String(error) }, { status: 500, headers });
  }
}

async function handleScanxProxy(request, url, { encrypted, mobile }, ctx) {
  const isGet = request.method === "GET";
  const isPost = request.method === "POST";

  if (mobile) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: withCors(withNoStore(new Headers()), "POST, OPTIONS", "Content-Type") });
    }
    if (!isPost) return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  } else {
    if (!isGet && !isPost) return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST" } });
  }

  const headers = withCors(new Headers(), mobile ? "POST, OPTIONS" : "GET, POST, OPTIONS", "Content-Type, x-app-entropy");
  if (mobile || isPost) withNoStore(headers);
  else withCache(headers, CDN_CACHE_1H);

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

  try {
    const rawBody = isGet
      ? base64UrlToUtf8(firstQueryValue(url, "f_req") || "")
      : (encrypted ? await unseal(await request.text()) : await request.text());
    const decoded = JSON.parse(rawBody);

    const fetchFresh = async () => {
      const upstream = await fetch("https://ow-static-scanx.dhan.co/staticscanx/company_filings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: "https://ow-static-scanx.dhan.co",
          Referer: "https://ow-static-scanx.dhan.co/",
          "User-Agent": "Mozilla/5.0",
        },
        body: JSON.stringify(decoded),
      });

      const payload = await upstream.text();
      const responseHeaders = new Headers(headers);
      responseHeaders.set("content-type", "application/json; charset=utf-8");
      return new Response(payload, { status: upstream.status, headers: responseHeaders });
    };

    if (mobile || !isGet) return fetchFresh();
    return fetchWithEdgeCache({
      cacheKeyUrl: request.url,
      ttlSec: 3600,
      swrSec: 600,
      cacheControl: CDN_CACHE_1H,
      ctx,
      fetchFresh,
    });
  } catch (error) {
    return json({ error: "Failed to fetch filings", details: error?.message || String(error) }, { status: 500, headers });
  }
}

async function handleMobileBatch(request, url, ctx) {
  const headers = withCors(new Headers(), "GET, POST, OPTIONS", "Content-Type, x-rpc-ids");
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers });
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
  }

  const isGet = request.method === "GET";
  if (isGet) withCache(headers, CDN_CACHE_5M);
  else withNoStore(headers);

  try {
    const rpcIds = isGet ? (firstQueryValue(url, "rpcids") || "xh8wxf") : (request.headers.get("x-rpc-ids") || "xh8wxf");
    const googleUrl = `https://www.google.com/finance/_/GoogleFinanceUi/data/batchexecute?rpcids=${encodeURIComponent(rpcIds)}&source-path=%2Ffinance%2F&f.sid=dummy&hl=en-US&soc-app=162&soc-platform=1&soc-device=1&rt=c`;

    let body;
    if (isGet) {
      const encoded = firstQueryValue(url, "f_req");
      if (!encoded) return json({ error: "Missing f_req query param" }, { status: 400, headers });
      body = new URLSearchParams({ "f.req": base64UrlToUtf8(encoded) }).toString();
    } else {
      const raw = await request.text();
      if (!raw) {
        body = "";
      } else if (raw.includes("f.req=")) {
        body = raw;
      } else {
        try {
          const parsed = JSON.parse(raw);
          body = new URLSearchParams(parsed).toString();
        } catch {
          body = raw;
        }
      }
    }

    const fetchFresh = async () => {
      const upstream = await fetch(googleUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
          Origin: "https://www.google.com",
          Referer: "https://www.google.com/finance/",
          "User-Agent": "Mozilla/5.0",
        },
        body,
      });

      const text = await upstream.text();
      const outHeaders = new Headers(headers);
      return new Response(text, { status: upstream.status, headers: outHeaders });
    };

    if (!isGet) return fetchFresh();
    return fetchWithEdgeCache({
      cacheKeyUrl: request.url,
      ttlSec: 300,
      swrSec: 60,
      cacheControl: CDN_CACHE_5M,
      ctx,
      fetchFresh,
    });
  } catch (error) {
    return json({ error: "Proxy error", details: error?.message || String(error) }, { status: 500, headers });
  }
}

async function handleMobileStrike(request) {
  const headers = withCors(withNoStore(new Headers()), "POST, OPTIONS", "Content-Type");
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });

  try {
    const body = await parseJsonBody(request);
    const { fromStr, toStr, encoded, path } = body;
    const strikeUrl = `https://api-v2.strike.money${path}?candleInterval=1d&from=${fromStr}&to=${toStr}&securities=${encoded}`;
    const upstream = await fetch(strikeUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    });
    const payload = await upstream.text();
    const responseHeaders = new Headers(headers);
    responseHeaders.set("content-type", "application/json; charset=utf-8");
    return new Response(payload, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    return json({ error: "Proxy error", details: error?.message || String(error) }, { status: 500, headers });
  }
}

async function handleAssetRequest(request, env) {
  const url = new URL(request.url);
  let response = await env.ASSETS.fetch(request);

  if (url.pathname === "/data.json" && response.ok) {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", DATA_JSON_CACHE);
    response = new Response(response.body, { status: response.status, headers });
  }

  if (response.status !== 404) return response;
  if (url.pathname.startsWith("/api/")) return response;
  if (url.pathname.includes(".")) return response;
  return env.ASSETS.fetch(new Request(`${url.origin}/index.html`, request));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname.startsWith("/api/tv")) return handleTvProxy(request, url);

    if (pathname === "/api/fuckyouuuu" || pathname === "/api/v1/fuckyouuuu") {
      return handleGoogleBatch(request, url, { encrypted: true }, ctx);
    }
    if (pathname === "/api/fckyouuu1" || pathname === "/api/v1/fckyouuu1") {
      return handleStrikeProxy(request, url, { encrypted: true }, ctx);
    }
    if (pathname === "/api/scanx" || pathname === "/api/v1/fckyouuu2") {
      return handleScanxProxy(request, url, { encrypted: true, mobile: false }, ctx);
    }
    if (pathname === "/api/mobile-batch") return handleMobileBatch(request, url, ctx);
    if (pathname === "/api/mobile-strike") return handleMobileStrike(request);
    if (pathname === "/api/mobile-scanx") {
      return handleScanxProxy(request, url, { encrypted: false, mobile: true }, ctx);
    }

    return handleAssetRequest(request, env);
  },
};

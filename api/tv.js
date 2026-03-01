const UPSTREAM_BASE = 'https://www.tradingview.com/api/v1';

const HOP_BY_HOP_REQUEST_HEADERS = new Set([
    'host',
    'connection',
    'content-length',
    'accept-encoding',
]);

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
    'connection',
    'content-encoding',
    'content-length',
    'transfer-encoding',
]);

function getFirstQueryValue(value) {
    if (Array.isArray(value)) return value[0];
    return value;
}

function buildUpstreamUrl(req) {
    const incomingUrl = new URL(req.url || '/api/tv', 'http://localhost');
    const rewrittenPath = getFirstQueryValue(req.query?.tv_path);
    const upstreamPath = rewrittenPath
        ? `/${String(rewrittenPath).replace(/^\/+/, '')}`
        : incomingUrl.pathname.replace(/^\/api\/tv/, '') || '/';

    incomingUrl.searchParams.delete('tv_path');
    const query = incomingUrl.searchParams.toString();
    return `${UPSTREAM_BASE}${upstreamPath}${query ? `?${query}` : ''}`;
}

function buildCookieHeader(req) {
    const cookieParts = [];
    const existingCookie = req.headers.cookie;
    const sessionId = req.headers['x-tv-sessionid'];
    const sessionSign = req.headers['x-tv-sessionid-sign'];

    if (typeof existingCookie === 'string' && existingCookie.trim()) {
        cookieParts.push(existingCookie.trim());
    }
    if (sessionId) cookieParts.push(`sessionid=${sessionId}`);
    if (sessionSign) cookieParts.push(`sessionid_sign=${sessionSign}`);

    return cookieParts.length > 0 ? cookieParts.join('; ') : null;
}

function buildUpstreamHeaders(req) {
    const headers = new Headers();

    Object.entries(req.headers || {}).forEach(([key, value]) => {
        const normalized = key.toLowerCase();
        if (HOP_BY_HOP_REQUEST_HEADERS.has(normalized)) return;
        if (normalized.startsWith('x-tv-sessionid')) return;
        if (value == null) return;
        if (Array.isArray(value)) {
            headers.set(key, value.join(','));
        } else {
            headers.set(key, String(value));
        }
    });

    headers.set('Origin', 'https://www.tradingview.com');
    headers.set('Referer', 'https://www.tradingview.com/');
    headers.set('X-Requested-With', 'XMLHttpRequest');

    const cookie = buildCookieHeader(req);
    if (cookie) headers.set('Cookie', cookie);
    else headers.delete('Cookie');

    return headers;
}

function serializeBody(body) {
    if (body == null) return undefined;
    if (typeof body === 'string' || Buffer.isBuffer(body) || body instanceof Uint8Array) {
        return body;
    }
    return JSON.stringify(body);
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-tv-sessionid, x-tv-sessionid-sign');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') return res.status(204).end();

    const method = req.method || 'GET';
    const allowsBody = !['GET', 'HEAD'].includes(method.toUpperCase());
    const upstreamUrl = buildUpstreamUrl(req);
    const headers = buildUpstreamHeaders(req);
    const body = allowsBody ? serializeBody(req.body) : undefined;

    try {
        const upstream = await fetch(upstreamUrl, {
            method,
            headers,
            body,
            redirect: 'manual',
        });

        upstream.headers.forEach((value, key) => {
            if (HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
            res.setHeader(key, value);
        });

        res.status(upstream.status);
        const arrayBuffer = await upstream.arrayBuffer();
        return res.send(Buffer.from(arrayBuffer));
    } catch (error) {
        console.error('[tv proxy] Error:', error?.message || error);
        return res.status(502).json({ error: 'TradingView proxy failed' });
    }
}

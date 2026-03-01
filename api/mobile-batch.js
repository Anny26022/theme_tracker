/**
 * Mobile Proxy — Google Finance batchexecute relay.
 * 
 * Accepts plain POST bodies from the React Native app (no AES encryption).
 * Also accepts cacheable GET requests with query params:
 *   /api/mobile-batch?rpcids=...&f_req=<base64url-json>
 * Forwards to Google Finance with proper server-side headers.
 * 
 * Request format:
 *   POST /api/mobile-batch
 *   Headers: x-rpc-ids: "xh8wxf,AiCwsd"  (comma-separated RPC IDs)
 *   Body: URL-encoded f.req=... (standard batchexecute format)
 */
import { getMarketCachePolicy } from './_marketCachePolicy.js';

export default async function handler(req, res) {
    // CORS headers for mobile clients
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-rpc-ids');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST' && req.method !== 'GET') {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).end();
    }

    try {
        const isGet = req.method === 'GET';
        if (isGet) {
            const policy = getMarketCachePolicy();
            res.setHeader('Cache-Control', policy.cacheControl);
            res.setHeader('Vercel-CDN-Cache-Control', policy.vercelCdnCacheControl);
            res.setHeader('X-TT-Market-Cache-Phase', policy.phase);
        } else {
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
        }

        const rpcIds = (isGet ? req.query?.rpcids : req.headers['x-rpc-ids']) || 'xh8wxf';
        const normalizedRpcIds = Array.isArray(rpcIds) ? rpcIds.join(',') : String(rpcIds);

        const googleUrl = `https://www.google.com/finance/_/GoogleFinanceUi/data/batchexecute?rpcids=${encodeURIComponent(normalizedRpcIds)}&source-path=%2Ffinance%2F&f.sid=dummy&hl=en-US&soc-app=162&soc-platform=1&soc-device=1&rt=c`;

        // Body handling: Google expects f.req=... in URL-encoded format.
        // If the environment has already parsed this into an object, we must
        // reconstruct the form encoding. JSON.stringify would fail here.
        let body;
        if (isGet) {
            const encoded = req.query?.f_req;
            const encodedValue = Array.isArray(encoded) ? encoded[0] : encoded;
            if (!encodedValue) {
                return res.status(400).json({ error: 'Missing f_req query param' });
            }

            const normalized = String(encodedValue).replace(/-/g, '+').replace(/_/g, '/');
            const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
            const fReq = Buffer.from(padded, 'base64').toString('utf-8');
            body = new URLSearchParams({ 'f.req': fReq }).toString();
        } else if (typeof req.body === 'string') {
            body = req.body;
        } else if (req.body && typeof req.body === 'object') {
            body = new URLSearchParams(req.body).toString();
        } else {
            body = JSON.stringify(req.body);
        }

        const response = await fetch(googleUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
                'Origin': 'https://www.google.com',
                'Referer': 'https://www.google.com/finance/',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            body: body,
        });

        if (!response.ok) {
            return res.status(response.status).send(`Google returned ${response.status}`);
        }

        const text = await response.text();
        return res.status(200).send(text);
    } catch (error) {
        console.error('[mobile-batch] Error:', error.message);
        return res.status(500).json({ error: 'Proxy error' });
    }
}

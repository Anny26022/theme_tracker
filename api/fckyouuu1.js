import { unseal } from './_unseal.js';
import { getMarketCachePolicy } from './_marketCachePolicy.js';

function firstQueryValue(value) {
    if (Array.isArray(value)) return value[0];
    return value;
}

function decodeBase64Url(value) {
    const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return Buffer.from(padded, 'base64').toString('utf-8');
}

export default async function handler(req, res) {
    const isGet = req.method === 'GET';
    const isPost = req.method === 'POST';

    if (!isGet && !isPost) {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).end();
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    if (isGet) {
        const policy = getMarketCachePolicy();
        res.setHeader('Cache-Control', policy.cacheControl);
        res.setHeader('Vercel-CDN-Cache-Control', policy.vercelCdnCacheControl);
        res.setHeader('X-TT-Market-Cache-Phase', policy.phase);
    } else {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    }

    try {
        const rawBody = isGet ? decodeBase64Url(firstQueryValue(req.query?.f_req)) : unseal(req.body);
        const decoded = JSON.parse(rawBody);

        const { fromStr, toStr, encoded, path } = decoded;
        const strikeUrl = `https://api-v2.strike.money${path}?candleInterval=1d&from=${fromStr}&to=${toStr}&securities=${encoded}`;

        const response = await fetch(strikeUrl, {
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) return res.status(response.status).json({ error: `Strike Error: ${response.status}` });

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error('[fckyouuu1] Error:', error.message);
        return res.status(500).json({ error: 'System Error' });
    }
}

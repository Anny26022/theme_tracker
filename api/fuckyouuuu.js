import { unseal } from './_unseal.js';

const CDN_CACHE_CONTROL = 'public, max-age=0, s-maxage=300, stale-while-revalidate=60';
const CDN_S_MAXAGE = 's-maxage=300, stale-while-revalidate=60';

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

    // CORS and Cache Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (isGet) {
        res.setHeader('Cache-Control', CDN_CACHE_CONTROL);
        res.setHeader('Vercel-CDN-Cache-Control', CDN_S_MAXAGE);
    } else {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    }

    try {
        let decoded;
        let rpcIds;

        if (isGet) {
            const encoded = firstQueryValue(req.query?.f_req);
            if (!encoded) return res.status(400).json({ error: 'Missing f_req' });
            decoded = decodeBase64Url(encoded);
            rpcIds = firstQueryValue(req.query?.rpcids) || 'xh8wxf';
        } else {
            decoded = unseal(req.body);
            rpcIds = req.headers['x-app-entropy'] || 'xh8wxf';
        }

        const normalizedRpcIds = Array.isArray(rpcIds) ? rpcIds.join(',') : String(rpcIds);
        const googleUrl = `https://www.google.com/finance/_/GoogleFinanceUi/data/batchexecute?rpcids=${encodeURIComponent(normalizedRpcIds)}&source-path=%2Ffinance%2F&f.sid=dummy&hl=en-US&soc-app=162&soc-platform=1&soc-device=1&rt=c`;

        const response = await fetch(googleUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
                'Origin': 'https://www.google.com',
                'Referer': 'https://www.google.com/finance/',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            body: new URLSearchParams({ 'f.req': decoded }).toString(),
        });

        if (!response.ok) return res.status(response.status).send(`Upstream Error: ${response.status}`);

        const text = await response.text();
        return res.status(200).send(text);
    } catch (error) {
        console.error('[fuckyouuuu] Error:', error.message);
        return res.status(500).json({ error: 'System Error' });
    }
}

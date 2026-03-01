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
    if (req.method !== 'POST' && req.method !== 'GET') {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).end();
    }

    const isGet = req.method === 'GET';
    if (isGet) {
        res.setHeader('Cache-Control', CDN_CACHE_CONTROL);
        res.setHeader('Vercel-CDN-Cache-Control', CDN_S_MAXAGE);
    } else {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    }

    try {
        const encodedPayload = isGet ? firstQueryValue(req.query?.f_req) : null;
        if (isGet && !encodedPayload) {
            return res.status(400).json({ error: 'Missing f_req query param' });
        }

        const decoded = isGet ? decodeBase64Url(encodedPayload) : unseal(req.body);
        const cid = isGet
            ? (firstQueryValue(req.query?.rpcids) || req.headers['x-app-entropy'] || 'xh8wxf')
            : (req.headers['x-app-entropy'] || 'xh8wxf');
        const normalizedCid = Array.isArray(cid) ? cid.join(',') : String(cid);

        const googleUrl = `https://www.google.com/finance/_/GoogleFinanceUi/data/batchexecute?rpcids=${encodeURIComponent(normalizedCid)}&source-path=%2Ffinance%2F&f.sid=dummy&hl=en-US&soc-app=162&soc-platform=1&soc-device=1&rt=c`;

        const response = await fetch(googleUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
                'Origin': 'https://www.google.com',
                'Referer': 'https://www.google.com/finance/',
            },
            body: new URLSearchParams({ 'f.req': decoded }).toString(),
        });

        const text = await response.text();
        return res.status(200).send(text);
    } catch (error) {
        return res.status(500).json({ error: 'System Error' });
    }
}

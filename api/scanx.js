import { unseal } from './_unseal.js';

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
        return res.status(405).end('Method Not Allowed');
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

    try {
        const rawBody = isGet ? decodeBase64Url(firstQueryValue(req.query?.f_req)) : unseal(req.body);
        const decoded = JSON.parse(rawBody);

        const response = await fetch('https://ow-static-scanx.dhan.co/staticscanx/company_filings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': 'https://ow-static-scanx.dhan.co',
                'Referer': 'https://ow-static-scanx.dhan.co/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: JSON.stringify(decoded)
        });

        if (!response.ok) return res.status(response.status).json({ error: `ScanX Error: ${response.status}` });

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error('ScanX Proxy Error:', error);
        return res.status(500).json({ error: 'Failed to fetch filings', details: error.message });
    }
}

import { unseal } from './_unseal.js';

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const decoded = JSON.parse(unseal(req.body));

        const { fromStr, toStr, encoded, path } = decoded;
        const strikeUrl = `https://api-v2.strike.money${path}?candleInterval=1d&from=${fromStr}&to=${toStr}&securities=${encoded}`;

        const response = await fetch(strikeUrl, {
            headers: { 'Accept': 'application/json' }
        });

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: 'System Error' });
    }
}

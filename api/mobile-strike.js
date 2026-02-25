/**
 * Mobile Proxy — Strike Money price ticks relay.
 * 
 * Accepts plain POST from the React Native app with JSON body containing
 * { fromStr, toStr, encoded, path } and forwards to Strike's API.
 */

export default async function handler(req, res) {
    // CORS headers for mobile clients
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { fromStr, toStr, encoded, path } = body;

        const strikeUrl = `https://api-v2.strike.money${path}?candleInterval=1d&from=${fromStr}&to=${toStr}&securities=${encoded}`;

        const response = await fetch(strikeUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            }
        });

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (error) {
        console.error('[mobile-strike] Error:', error.message);
        return res.status(500).json({ error: 'Proxy error' });
    }
}

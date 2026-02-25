export default async function handler(req, res) {
    // CORS headers for mobile clients
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).end('Method Not Allowed');
    }

    try {
        const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        const response = await fetch('https://ow-static-scanx.dhan.co/staticscanx/company_filings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': 'https://ow-static-scanx.dhan.co',
                'Referer': 'https://ow-static-scanx.dhan.co/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (error) {
        console.error('Mobile ScanX Proxy Error:', error);
        return res.status(500).json({ error: 'Failed to fetch filings', details: error.message });
    }
}

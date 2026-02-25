export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const rawBody = req.body;
        const decoded = JSON.parse(Buffer.from(rawBody, 'base64').toString('utf-8'));

        // Construct the Strike URL from the decoded params
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

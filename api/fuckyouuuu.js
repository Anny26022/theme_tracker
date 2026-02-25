import { unseal } from './_unseal.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    try {
        const decoded = unseal(req.body);
        const cid = req.headers['x-app-entropy'] || 'xh8wxf';

        const googleUrl = `https://www.google.com/finance/_/GoogleFinanceUi/data/batchexecute?rpcids=${cid}&source-path=%2Ffinance%2F&f.sid=dummy&hl=en-US&soc-app=162&soc-platform=1&soc-device=1&rt=c`;

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

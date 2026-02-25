import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
    optimizeDeps: {
        entries: ['index.html'],
    },
    server: {
        host: true,
        proxy: {
            // Advanced Stealth Telemetry Proxy
            '/api/v1/fuckyouuuu': {
                target: 'https://www.google.com',
                changeOrigin: true,
                configure: (proxy, _options) => {
                    proxy.on('proxyReq', (proxyReq, req, _res) => {
                        const cid = req.headers['x-cid'] || 'AiCwsd';
                        proxyReq.path = `/finance/_/GoogleFinanceUi/data/batchexecute?rpcids=${cid}&source-path=%2Ffinance%2F&f.sid=dummy&hl=en-US&soc-app=162&soc-platform=1&soc-device=1&rt=c`;
                    });
                },
                headers: {
                    'Origin': 'https://www.google.com',
                    'Referer': 'https://www.google.com/finance/',
                },
            },
            // Strike Money API proxy (Obfuscated)
            '/api/v1/fckyouuu1': {
                target: 'https://api-v2.strike.money',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/v1\/fckyouuu1/, ''),
            },
            // Dhan ScanX API proxy (Obfuscated)
            '/api/v1/fckyouuu2': {
                target: 'https://ow-static-scanx.dhan.co/staticscanx/company_filings',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/v1\/fckyouuu2/, ''),
            },
        },
    },
})

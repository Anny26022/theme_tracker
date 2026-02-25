import { defineConfig } from 'vite'
import obfuscatorPlugin from 'rollup-plugin-obfuscator'

// https://vitejs.dev/config/
export default defineConfig({
    optimizeDeps: {
        entries: ['index.html'],
    },
    build: {
        rollupOptions: {
            plugins: [
                obfuscatorPlugin({
                    options: {
                        compact: true,
                        controlFlowFlattening: true,
                        controlFlowFlatteningThreshold: 0.5,
                        deadCodeInjection: true,
                        deadCodeInjectionThreshold: 0.2,
                        identifierNamesGenerator: 'hexadecimal',
                        renameGlobals: false,
                        selfDefending: false,
                        stringArray: true,
                        stringArrayEncoding: ['rc4'],
                        stringArrayThreshold: 0.8,
                        transformObjectKeys: true,
                        unicodeEscapeSequence: false,
                    },
                }),
            ],
        },
    },
    // Nuclear Stealth Middleware: Decodes Base64 bodies before they hit the proxy
    plugins: [
        {
            name: 'nuclear-stealth-middleware',
            configureServer(server) {
                server.middlewares.use(async (req, res, next) => {
                    const nuclearPaths = ['/api/v1/fuckyouuuu', '/api/v1/fckyouuu1', '/api/v1/fckyouuu2'];
                    if (nuclearPaths.some(p => req.url.startsWith(p)) && req.method === 'POST') {
                        const chunks = [];
                        for await (const chunk of req) chunks.push(chunk);
                        const body = Buffer.concat(chunks).toString('utf-8');

                        try {
                            // Attach decoded body to the request object for the proxy to use
                            if (req.url.startsWith('/api/v1/fuckyouuuu')) {
                                req.rawBody = Buffer.from(body, 'base64').toString('utf-8');
                            } else {
                                // For Strike/ScanX, we keep it as JSON string or object
                                req.rawBody = Buffer.from(body, 'base64').toString('utf-8');
                            }
                            req.isNuclear = true;
                        } catch (e) {
                            console.error('[Nuclear Middleware] Decode Failed:', e.message);
                        }
                    }
                    next();
                });
            }
        }
    ],
    server: {
        host: true,
        proxy: {
            '/api/v1/fuckyouuuu': {
                target: 'https://www.google.com',
                changeOrigin: true,
                configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq, req) => {
                        if (req.isNuclear && req.rawBody) {
                            const cid = req.headers['x-app-entropy'] || 'AiCwsd';
                            const googlePath = `/finance/_/GoogleFinanceUi/data/batchexecute?rpcids=${cid}&source-path=%2Ffinance%2F&f.sid=dummy&hl=en-US&soc-app=162&soc-platform=1&soc-device=1&rt=c`;
                            const newBody = new URLSearchParams({ 'f.req': req.rawBody }).toString();

                            proxyReq.setHeader('Content-Type', 'application/x-www-form-urlencoded;charset=utf-8');
                            proxyReq.setHeader('Content-Length', Buffer.byteLength(newBody));
                            proxyReq.path = googlePath;
                            proxyReq.write(newBody);
                        }
                        // Always end to prevent hangs if middleware consumed the body
                        if (!proxyReq.writableEnded) proxyReq.end();
                    });
                }
            },
            '/api/v1/fckyouuu1': {
                target: 'https://api-v2.strike.money',
                changeOrigin: true,
                configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq, req) => {
                        if (req.isNuclear && req.rawBody) {
                            try {
                                const decoded = JSON.parse(req.rawBody);
                                const strikePath = `${decoded.path}?candleInterval=1d&from=${decoded.fromStr}&to=${decoded.toStr}&securities=${decoded.encoded}`;

                                // Scrub all identity headers
                                proxyReq.removeHeader('origin');
                                proxyReq.removeHeader('referer');
                                proxyReq.removeHeader('content-type');
                                proxyReq.removeHeader('content-length');

                                // Spoof Strike identity
                                proxyReq.setHeader('Host', 'api-v2.strike.money');
                                proxyReq.setHeader('Origin', 'https://api-v2.strike.money');
                                proxyReq.setHeader('Referer', 'https://api-v2.strike.money/');
                                proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

                                proxyReq.method = 'GET';
                                proxyReq.path = strikePath;
                            } catch (e) {
                                console.error('[Strike Proxy] Parse Error:', e.message);
                            }
                        }
                        if (!proxyReq.writableEnded) proxyReq.end();
                    });
                }
            },
            '/api/v1/fckyouuu2': {
                target: 'https://ow-static-scanx.dhan.co',
                changeOrigin: true,
                configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq, req) => {
                        // Point to the correct endpoint path on Dhan
                        proxyReq.path = '/staticscanx/company_filings';

                        if (req.isNuclear && req.rawBody) {
                            proxyReq.setHeader('Origin', 'https://ow-static-scanx.dhan.co');
                            proxyReq.setHeader('Referer', 'https://ow-static-scanx.dhan.co/');
                            proxyReq.setHeader('Content-Type', 'application/json');
                            proxyReq.setHeader('Content-Length', Buffer.byteLength(req.rawBody));
                            proxyReq.write(req.rawBody);
                        }
                        if (!proxyReq.writableEnded) proxyReq.end();
                    });
                }
            }
        }
    }
})

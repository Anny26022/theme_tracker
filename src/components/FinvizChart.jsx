import React, { useMemo, useRef, useCallback, useState, useEffect, useSyncExternalStore } from 'react';
import { cleanSymbol, getCachedComparisonSeries, getCachedInterval } from '../services/priceService';
import { useMarketDataRegistry, useChartVersion } from '../context/MarketDataContext';
import { useLivePrice } from '../context/PriceContext';
import { ZoomIn, ZoomOut, Maximize2, ExternalLink } from 'lucide-react';

const buildSmaSeries = (values, period) => {
    if (!values?.length) return [];
    const r = new Array(values.length).fill(null); let s = 0;
    for (let i = 0; i < values.length; i++) { s += values[i]; if (i >= period) s -= values[i - period]; if (i >= period - 1) r[i] = s / period; }
    return r;
};
const buildEmaSeries = (values, period) => {
    if (!values?.length) return [];
    const r = new Array(values.length).fill(null), k = 2 / (period + 1); let ema = null;
    for (let i = 0; i < values.length; i++) {
        if (ema === null) { if (i >= period - 1) { let s = 0; for (let j = i - period + 1; j <= i; j++) s += values[j]; ema = s / period; r[i] = ema; } }
        else { ema = values[i] * k + ema * (1 - k); r[i] = ema; }
    }
    return r;
};
const MA_COLORS = { 5: '#ff6b6b', 10: '#ffa94d', 21: '#ffd43b', 50: '#51cf66', 100: '#22b8cf', 200: '#9d27b0' };
const _defaultMa = [{ type: 'SMA', period: 50 }, { type: 'SMA', period: 200 }];
let _maSnap = { raw: null, pb: null, val: { lines: _defaultMa, paintBars: false } };
let _styleSnap = { raw: null, val: 'candles' };
const getMAConfig = () => {
    const r = localStorage.getItem('tt_pro_ma');
    const pb = localStorage.getItem('tt_pro_paint_bars') === 'true';
    if (r === _maSnap.raw && pb === _maSnap.pb) return _maSnap.val;
    let lines = _defaultMa;
    try { lines = r ? JSON.parse(r) : _defaultMa; } catch { lines = _defaultMa; }
    _maSnap = { raw: r, pb, val: { lines, paintBars: pb } };
    return _maSnap.val;
};
const getStyle = () => { const r = localStorage.getItem('tt_pro_style'); if (r === _styleSnap.raw) return _styleSnap.val; _styleSnap = { raw: r, val: r || 'candles' }; return _styleSnap.val; };
const subChartSettings = (cb) => { window.addEventListener('tt_chart_settings', cb); return () => window.removeEventListener('tt_chart_settings', cb); };

let _cs = null;
const cs = () => _cs || (_cs = JSON.parse(localStorage.getItem('tt_cs_v4') || '{}'));
const setCs = (s, t, d) => { (cs()[s] ||= {})[t] = d; localStorage.setItem('tt_cs_v4', JSON.stringify(_cs)); };

const FinvizChart = React.memo(function FinvizChart({
    symbol,
    name,
    series,
    height = null,
    onExpand,
    forcedTimeframe = null,
    initialTimeframe = '1D',
    isProMode = false,
    allCompanies = [],
    disabled = false,
    chartStyle: chartStyleProp = null,
    maConfig: maConfigProp = null
}) {
    const lsStyle = useSyncExternalStore(subChartSettings, getStyle);
    const lsMa = useSyncExternalStore(subChartSettings, getMAConfig);
    const chartStyle = chartStyleProp ?? lsStyle;
    const maConfig = maConfigProp ?? lsMa;
    const containerRef = useRef(null);
    const chartAreaRef = useRef(null);
    const totalPointsRef = useRef(9999);
    const cleaned = useMemo(() => cleanSymbol(symbol), [symbol]);
    const hoverIndexRef = useRef(null);
    const tooltipRef = useRef(null);
    const tooltipDateRef = useRef(null);
    const tooltipOpenRef = useRef(null);
    const tooltipCloseRef = useRef(null);
    const tooltipHighRef = useRef(null);
    const tooltipLowRef = useRef(null);
    const [internalTimeframe, setInternalTimeframe] = useState(initialTimeframe);
    const timeframe = forcedTimeframe || internalTimeframe;
    const setTimeframe = setInternalTimeframe;

    const init = cs()[cleaned]?.[timeframe] || {};
    const [zoomDays, setZoomDays] = useState(init.z ?? (isProMode ? 260 : 168));
    const [panOffset, setPanOffset] = useState(init.p ?? 0);
    const [priceOffset, setPriceOffset] = useState(init.y ?? 0);
    const [vScale, setVScale] = useState(init.v ?? 1.0);
    const dragRef = useRef({ isDragging: false, isYDragging: false, isFreeDragging: false, startX: 0, startY: 0, startPan: 0, startVPan: 0, startVScale: 1.0 });
    const zoomDaysRef = useRef(zoomDays);
    const panOffsetRef = useRef(panOffset);
    const priceOffsetRef = useRef(priceOffset);
    const vScaleRef = useRef(vScale);

    useEffect(() => { zoomDaysRef.current = zoomDays; }, [zoomDays]);
    useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);
    useEffect(() => { priceOffsetRef.current = priceOffset; }, [priceOffset]);
    useEffect(() => { vScaleRef.current = vScale; }, [vScale]);

    useEffect(() => setCs(cleaned, timeframe, { z: zoomDays, p: panOffset, y: priceOffset, v: vScale }),
        [cleaned, timeframe, zoomDays, panOffset, priceOffset, vScale]);

    const { subscribeChartSymbols } = useMarketDataRegistry();
    const chartVersion = useChartVersion();

    const apiInterval = useMemo(() => {
        if (timeframe === '1D') return '1Y';
        return 'MAX';
    }, [timeframe]);

    useEffect(() => {
        if (!symbol) return;
        // Fetch the appropriate high-res window + MAX for deep history/SMA
        const unsubs = [subscribeChartSymbols(apiInterval, [symbol])];
        if (apiInterval === '1Y') {
            unsubs.push(subscribeChartSymbols('MAX', [symbol]));
        }
        return () => unsubs.forEach(u => u?.());
    }, [symbol, apiInterval, subscribeChartSymbols]);

    const activeSeries = useMemo(() => {
        if (!symbol) return series || [];
        const cachedTarget = getCachedComparisonSeries(cleaned, apiInterval, { silent: true });
        const cachedMax = (apiInterval === '1Y') ? getCachedComparisonSeries(cleaned, 'MAX', { silent: true }) : null;

        // REOLUTION STITCHER: If we want 1D (daily), merge 1Y daily data onto MAX weekly history
        if (apiInterval === '1Y' && Array.isArray(cachedTarget) && cachedTarget.length > 0) {
            if (Array.isArray(cachedMax) && cachedMax.length > 0) {
                const firstDaily = cachedTarget[0].time;
                const historical = cachedMax.filter(p => p.time < firstDaily);
                return [...historical, ...cachedTarget];
            }
            return cachedTarget;
        }

        return (cachedTarget && cachedTarget.length > 0) ? cachedTarget : (series || []);
    }, [cleaned, apiInterval, chartVersion, series]);

    const [dimensions, setDimensions] = useState({ width: 600, height: height || 400 });
    const measuredRef = useRef(false);
    useEffect(() => {
        if (!containerRef.current) return;
        const obs = new ResizeObserver((entries) => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                if (width > 0 && height > 0) { measuredRef.current = true; setDimensions({ width, height }); }
            }
        });
        obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, []);

    const rafRef = useRef(null);

    const handleWheel = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        const factor = e.deltaY < 0 ? 0.9 : 1.1;
        setZoomDays(p => {
            const next = Math.max(20, Math.min(totalPointsRef.current, Math.round(p * factor)));
            // Clamp panOffset if it would go out of bounds after zoom change
            setPanOffset(o => Math.max(0, Math.min(totalPointsRef.current - next, o)));
            return next;
        });
    }, [setZoomDays]);


    const baseData = useMemo(() => {
        if (!activeSeries || activeSeries.length === 0) return null;

        let ordered = [...activeSeries].sort((a, b) => a.time - b.time);
        if (timeframe !== '1D') {
            const b = new Map();
            ordered.forEach(p => {
                const d = new Date(p.time);
                let k;
                if (timeframe === '1W') {
                    const day = d.getDay();
                    k = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (day === 0 ? 6 : day - 1), 0, 0, 0, 0).getTime();
                } else if (timeframe === '1M') {
                    k = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
                } else if (timeframe === '1Y') {
                    k = new Date(d.getFullYear(), 0, 1).getTime();
                }
                if (!b.has(k)) b.set(k, { time: k, open: p.open ?? p.close, high: p.high ?? p.close, low: p.low ?? p.close, close: p.close, volume: p.volume ?? 0 });
                else {
                    const cur = b.get(k);
                    cur.high = Math.max(cur.high, p.high ?? p.close);
                    cur.low = Math.min(cur.low, p.low ?? p.close);
                    cur.close = p.close;
                    cur.volume += (p.volume ?? 0);
                }
            });
            ordered = Array.from(b.values());
        }

        const allPoints = ordered
            .map(p => ({
                time: p.time,
                open: p.open,
                high: p.high,
                low: p.low,
                close: p.close,
                volume: p.volume,
            }))
            .filter(p => !isNaN(p.time) && p.time > 0 && isFinite(p.close) && p.close > 0);

        if (allPoints.length < 2) return null;

        const allCloses = allPoints.map(p => p.close);
        const allVolumes = allPoints.map(p => p.volume);

        // --- Volume Metrics (Simple Volume Logic) ---
        const volSMA50 = buildSmaSeries(allVolumes, 50);

        // Process each point for labels and colors
        for (let i = 0; i < allPoints.length; i++) {
            const p = allPoints[i];
            const prev = i > 0 ? allPoints[i - 1] : p;
            const sma = volSMA50[i];
            const isUp = p.close > prev.close || (p.close === prev.close && p.close >= p.open);

            // 1. PPV (Pocket Pivot Volume) - Up day, volume > max(down-day volumes in last 10 trading days)
            let maxDownVol10 = 0;
            const lookback = 10;
            for (let j = Math.max(0, i - lookback); j < i; j++) {
                const ref = allPoints[j];
                const preRef = j > 0 ? allPoints[j - 1] : ref;
                const refIsDown = ref.close < preRef.close || (ref.close === preRef.close && ref.close < ref.open);
                if (refIsDown) maxDownVol10 = Math.max(maxDownVol10, ref.volume);
            }
            const isPPV = isUp && p.volume > maxDownVol10 && i >= 10;

            // 2. Bull Snort - 3x vol SMA50, close in top 35%, above previous close
            const range = p.high - p.low || 0.01;
            const relativeClose = (p.close - p.low) / range;
            const isBullSnort = (sma > 0 && p.volume > 3 * sma) && (relativeClose >= 0.65) && (p.close > prev.close);

            // 3. Dry/Low Volume - Volume < 1/5 SMA50
            const isDry = sma > 0 && p.volume < (sma / 5);

            // 4. Color Decision
            let color = '#8b95a7'; // Neutral Grey-Blue (clear visibility)
            if (isPPV) color = '#3b82f6'; // Blue
            else if (isUp && sma > 0 && p.volume > sma) color = '#22c55e'; // Green
            else if (!isUp && sma > 0 && p.volume > sma) color = '#ef4444'; // Red
            else if (isDry) color = '#f59e0b'; // Orange

            p.volColor = color;
            p.volSMA50 = sma;
            p.isBullSnort = isBullSnort;
            p.isPPV = isPPV;
            p.isDry = isDry;

            // Relative Volume (RVol)
            p.rVol = sma > 0 ? (p.volume / sma) : 0;
        }

        // 5. Summary Stats (for the last points or 50 bars)
        const last50 = allPoints.slice(-50);
        let sumUpVol = 0, sumDownVol = 0, sumVol = 0, sumPrice = 0;
        last50.forEach((p, idx) => {
            sumVol += p.volume;
            sumPrice += p.close;
            const prev = idx > 0 ? last50[idx - 1] : p;
            const isUp = p.close >= prev.close;
            if (isUp) sumUpVol += p.volume;
            else sumDownVol += p.volume;
        });

        const avgVol50 = sumVol / (last50.length || 1);
        const avgPrice50 = sumPrice / (last50.length || 1);
        const udRatio = sumDownVol > 0 ? (sumUpVol / sumDownVol) : (sumUpVol > 0 ? 99 : 0);
        const avgDollarVol = avgVol50 * avgPrice50;
        const currentRVol = allPoints[allPoints.length - 1].rVol || 0;

        const maSeriesMap = {};
        (maConfig.lines || []).forEach(m => { maSeriesMap[`${m.type}_${m.period}`] = (m.type === 'EMA' ? buildEmaSeries : buildSmaSeries)(allCloses, m.period); });

        return {
            allPoints, maSeriesMap, totalPoints: allPoints.length,
            stats: { udRatio, avgDollarVol: avgDollarVol / 10000000, currentRVol, avgVol50 } // avgDollarVol in Crores (approx)
        };
    }, [activeSeries, timeframe, maConfig.lines]);

    // Sync view state cleanly on timeframe/symbol change
    useEffect(() => {
        const s = cs()[cleaned]?.[timeframe] || {};
        setZoomDays(s.z ?? (timeframe === '1D' ? (isProMode ? 260 : 168) : { '1W': 100, '1M': 60, '1Y': 20 }[timeframe]) ?? 168);
        setPanOffset(s.p ?? 0);
        setPriceOffset(s.y ?? 0);
        setVScale(s.v ?? 1.0);
    }, [timeframe, cleaned]);

    // Dimensions & Padding
    const paddingX = 40, paddingLeft = 40, paddingTop = 50, paddingBottom = 45;
    const W = dimensions.width, H = dimensions.height;
    const chartW = W - paddingX - paddingLeft;
    const chartH = H - paddingTop - paddingBottom;
    const volH = Math.min(60, chartH * 0.15);

    const data = useMemo(() => {
        if (!baseData) return null;

        // 3. Slice for Display using panOffset
        const sliceCount = Math.min(zoomDays, baseData.allPoints.length);
        const endIdx = Math.max(sliceCount, baseData.allPoints.length - panOffset);
        const startIdx = Math.max(0, endIdx - sliceCount);

        let points = baseData.allPoints.slice(startIdx, endIdx).map(p => ({ ...p }));
        const slicedMaMap = Object.fromEntries(Object.entries(baseData.maSeriesMap).map(([k, a]) => [k, a.slice(startIdx, endIdx)]));

        if (chartStyle === 'heikin') {
            const haPoints = [];
            points.forEach((p, i) => {
                const close = (p.open + p.high + p.low + p.close) / 4;
                let open;
                if (i === 0) {
                    open = (p.open + p.close) / 2;
                } else {
                    const prev = haPoints[i - 1];
                    open = (prev.open + prev.close) / 2;
                }
                const high = Math.max(p.high, open, close);
                const low = Math.min(p.low, open, close);
                haPoints.push({ ...p, open, high, low, close });
            });
            points = haPoints;
        }

        // 4. Subtle Synthesis (Only if data is totally flat)
        points.forEach((p, i) => {
            if (p.high === p.low || Math.abs(p.high - p.low) < p.close * 0.001) {
                const prev = i > 0 ? points[i - 1] : p;
                const range = Math.abs(p.close - prev.close) || (p.close * 0.005);
                p.high = p.close + range * 0.6;
                p.low = p.close - range * 0.6;
                p.open = p.close - (p.close - prev.close) * 0.5; // Smooth deterministic open
            }
        });

        // 5. Price Scale
        let minP = Infinity, maxP = -Infinity, maxV = 0;
        points.forEach((p, i) => {
            minP = Math.min(minP, p.low); maxP = Math.max(maxP, p.high); maxV = Math.max(maxV, p.volume);
            Object.values(slicedMaMap).forEach(a => { const v = a[i]; if (v > 0 && isFinite(v)) { minP = Math.min(minP, v); maxP = Math.max(maxP, v); } });
        });

        // Ensure we have a valid range
        if (minP === Infinity || maxP === -Infinity) {
            minP = 0; maxP = 100;
        }

        // Apply Vertical Scaling and Panning
        const mid = (maxP + minP) / 2;
        const range = (maxP - minP) / vScale;
        const padding = range * 0.15;

        // Final coordinate window (including user's manual vertical pan)
        const pricePerPixel = range / chartH;
        const pOffset = priceOffset * pricePerPixel;

        minP = mid - range / 2 - padding + pOffset;
        maxP = mid + range / 2 + padding + pOffset;

        return {
            points, maMap: slicedMaMap, minP, maxP, maxV, pRange: maxP - minP || 0.01,
            totalPoints: baseData.totalPoints
        };
    }, [baseData, zoomDays, panOffset, vScale, priceOffset, chartH, chartStyle, maConfig.lines]);

    // Keep ref in sync with latest totalPoints (inline, no useEffect needed)
    if (data) totalPointsRef.current = data.totalPoints;

    const getX = useCallback((idx) => data ? paddingLeft + (idx / (data.points.length - 1 || 1)) * chartW : paddingLeft, [data, chartW]);
    const getY = useCallback((p) => data ? paddingTop + (chartH - ((p - data.minP) / (data.pRange || 1)) * chartH) : paddingTop, [data, chartH]);

    const points = data?.points ?? [];
    const maMap = data?.maMap ?? {};
    const maxV = data?.maxV ?? 0;
    const minP = data?.minP ?? 0;
    const maxP = data?.maxP ?? 0;
    const candleWidth = Math.max(1.8, (chartW / (points.length || 1)) * 0.82);

    const chartColors = useMemo(() => {
        if (chartStyle === 'white') return { up: '#ffffff', down: '#ffffff' };
        if (chartStyle === 'area') return { up: '#3b82f6', down: '#ef4444' };
        return { up: '#00c805', down: '#ff2e2e' };
    }, [chartStyle]);
    const { up: colorUp, down: colorDown } = chartColors;

    const maLines = useMemo(() => <>{Object.entries(maMap).map(([key, arr]) => {
        const c = MA_COLORS[parseInt(key.split('_')[1])] || '#888';
        const d = arr.map((v, i) => v ? `${i === 0 || !arr[i - 1] ? 'M' : 'L'}${getX(i).toFixed(1)},${getY(v).toFixed(1)}` : '').filter(Boolean).join(' ');
        return d.length > 3 ? <path key={key} d={d} fill="none" stroke={c} strokeWidth="1" opacity="0.8" style={{ shapeRendering: 'auto' }} /> : null;
    })}</>, [maMap, getX, getY]);

    const monthLabels = useMemo(() => {
        const labels = [];
        let prevM = -1, lastX = -100;
        points.forEach((p, i) => {
            const d = new Date(p.time);
            const m = d.getMonth();
            const y = d.getFullYear();
            const x = getX(i);
            if (m !== prevM && (x - lastX) > 40) {
                const isYear = m === 0;
                const text = isYear ? y.toString() : d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
                labels.push({ x, text, isYear });
                prevM = m;
                lastX = x;
            }
        });
        return labels;
    }, [points, getX]);

    const updateTooltip = useCallback((idx) => {
        if (!points.length) return;
        const point = points[idx];
        if (!point) return;
        if (tooltipRef.current) {
            tooltipRef.current.style.opacity = '1';
        }
        if (tooltipDateRef.current) {
            tooltipDateRef.current.textContent = new Date(point.time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        }
        if (tooltipOpenRef.current) tooltipOpenRef.current.textContent = `O: ${point.open.toFixed(1)}`;
        if (tooltipCloseRef.current) tooltipCloseRef.current.textContent = `C: ${point.close.toFixed(1)}`;
        if (tooltipHighRef.current) tooltipHighRef.current.textContent = `H: ${point.high.toFixed(1)}`;
        if (tooltipLowRef.current) tooltipLowRef.current.textContent = `L: ${point.low.toFixed(1)}`;
    }, [points]);

    const handleMouseMove = useCallback((e) => {
        if (!points.length) return;
        const rect = e.currentTarget.getBoundingClientRect();

        // Change cursor if hovering over the price axis (right 50px)
        const isRightSide = (e.clientX - rect.left) > (rect.width - 50);
        e.currentTarget.style.cursor = isRightSide ? 'ns-resize' : 'crosshair';

        const xRatio = (e.clientX - rect.left - paddingLeft) / chartW;
        const idx = Math.min(points.length - 1, Math.max(0, Math.round(xRatio * (points.length - 1))));
        if (idx === hoverIndexRef.current) return;
        hoverIndexRef.current = idx;

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            updateTooltip(idx);
        });
    }, [chartW, paddingLeft, points.length, updateTooltip]);

    const handleMouseLeave = useCallback(() => {
        hoverIndexRef.current = null;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (tooltipRef.current) tooltipRef.current.style.opacity = '0';
    }, []);

    const candleGraphics = useMemo(() => {
        if (!data || points.length < 2) return null;

        if (chartStyle === 'line' || chartStyle === 'area') {
            const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${getX(i).toFixed(1)},${getY(p.close).toFixed(1)}`).join(' ');

            if (chartStyle === 'area') {
                const areaPath = `${linePath} L${getX(points.length - 1).toFixed(1)},${(H - paddingBottom).toFixed(1)} L${getX(0).toFixed(1)},${(H - paddingBottom).toFixed(1)} Z`;
                return (
                    <>
                        <defs>
                            <linearGradient id={`areaGradient-${cleaned}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={colorUp} stopOpacity="0.3" />
                                <stop offset="100%" stopColor={colorUp} stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <path d={areaPath} fill={`url(#areaGradient-${cleaned})`} style={{ shapeRendering: 'auto' }} />
                        <path d={linePath} fill="none" stroke={colorUp} strokeWidth="1.5" opacity="0.9" style={{ shapeRendering: 'auto' }} />
                    </>
                );
            }

            return (
                <path d={linePath} fill="none" stroke={colorUp} strokeWidth="1.5" opacity="0.9" style={{ shapeRendering: 'auto' }} />
            );
        }

        const volBars = [];
        const bullSnortDots = [];

        const wickUp = [], wickDown = [];
        const bodyUpFill = [], bodyUpStroke = [], bodyDownStroke = [], bodyDownFill = [];
        const barUp = [], barDown = [];
        const hw = candleWidth / 2;

        points.forEach((p, i) => {
            const x = getX(i);
            const isUp = p.close >= p.open;
            const isGrowth = i > 0 ? p.close >= points[i - 1].close : true;

            const vColor = p.volColor || (isGrowth ? colorUp : colorDown);
            const pColor = (maConfig && maConfig.paintBars && p.volColor && p.volColor !== '#8b95a7') ? p.volColor : (isUp ? colorUp : colorDown);

            // Volume
            if (maxV > 0 && p.volume > 0) {
                const vh = (p.volume / maxV) * volH;
                const vy = H - paddingBottom - vh;
                volBars.push(<path key={`v-${i}`} d={`M${(x - hw).toFixed(1)},${vy.toFixed(1)}h${candleWidth.toFixed(1)}v${vh.toFixed(1)}h-${candleWidth.toFixed(1)}Z`} fill={vColor} opacity={isProMode ? "1" : "0.78"} />);

            }

            if (chartStyle === 'bars') {
                const highY = getY(p.high), lowY = getY(p.low), openY = getY(p.open), closeY = getY(p.close);
                const path = `M${x.toFixed(1)},${highY.toFixed(1)}V${lowY.toFixed(1)} M${(x - hw).toFixed(1)},${openY.toFixed(1)}H${x.toFixed(1)} M${x.toFixed(1)},${closeY.toFixed(1)}H${(x + hw).toFixed(1)}`;
                if (isUp) barUp.push({ path, color: pColor });
                else barDown.push({ path, color: pColor });
            } else {
                // Wicks
                const highY = getY(p.high), lowY = getY(p.low);
                (isUp ? wickUp : wickDown).push({ d: `M${x.toFixed(1)},${highY.toFixed(1)}V${lowY.toFixed(1)}`, color: pColor });

                // Bodies
                const openY = getY(p.open), closeY = getY(p.close);
                const top = Math.min(openY, closeY), bodyH = Math.max(1, Math.abs(openY - closeY));
                const bodyD = `M${(x - hw).toFixed(1)},${top.toFixed(1)}h${candleWidth.toFixed(1)}v${bodyH.toFixed(1)}h-${candleWidth.toFixed(1)}Z`;

                if (chartStyle === 'hollow' || chartStyle === 'white') {
                    if (isUp) bodyUpStroke.push({ d: bodyD, color: pColor });
                    else bodyDownFill.push({ d: bodyD, color: pColor });
                } else {
                    if (isUp) bodyUpFill.push({ d: bodyD, color: pColor });
                    else bodyDownFill.push({ d: bodyD, color: pColor });
                }

                // Bull Snort Dot
                if (p.isBullSnort) {
                    bullSnortDots.push(<circle key={`bs-${i}`} cx={x} cy={lowY + 10} r="2" fill="#a855f7" />);
                }
            }
        });

        return (
            <>
                {volBars}
                {bullSnortDots}

                {chartStyle === 'bars' ? (
                    <>
                        {barUp.map((b, i) => <path key={`up-${i}`} d={b.path} fill="none" stroke={b.color} strokeWidth="1.2" />)}
                        {barDown.map((b, i) => <path key={`dn-${i}`} d={b.path} fill="none" stroke={b.color} strokeWidth="1.2" />)}
                    </>
                ) : (
                    <>
                        {wickUp.map((w, i) => <path key={`wup-${i}`} d={w.d} fill="none" stroke={w.color} strokeWidth="1" />)}
                        {wickDown.map((w, i) => <path key={`wdn-${i}`} d={w.d} fill="none" stroke={w.color} strokeWidth="1" />)}
                        {bodyUpFill.map((b, i) => <path key={`buf-${i}`} d={b.d} fill={b.color} />)}
                        {bodyUpStroke.map((b, i) => <path key={`bus-${i}`} d={b.d} fill="#0b0e14" stroke={b.color} strokeWidth="0.8" />)}
                        {bodyDownFill.map((b, i) => <path key={`bdf-${i}`} d={b.d} fill={b.color} />)}
                        {bodyDownStroke.map((b, i) => <path key={`bds-${i}`} d={b.d} fill="#0b0e14" stroke={b.color} strokeWidth="0.8" />)}
                    </>
                )}
            </>
        );
    }, [data, points, getX, getY, candleWidth, maxV, volH, H, paddingBottom, colorUp, colorDown, chartStyle, cleaned, isProMode, maConfig]);

    const liveData = useLivePrice(cleaned);

    // Map chart timeframe → interval key for actual period performance
    const TIMEFRAME_TO_INTERVAL = { '1D': '1D', '1W': '5D', '1M': '1M', '1Y': '1Y' };
    const intervalKey = TIMEFRAME_TO_INTERVAL[timeframe] || '1D';
    const cachedPerf = getCachedInterval(cleaned, intervalKey, { silent: true });

    let changePct = cachedPerf?.changePct ?? 0;
    let change = cachedPerf?.close ? cachedPerf.close - cachedPerf.close / (1 + changePct / 100) : 0;

    // When rendered inside a mobile gallery or pure display mode, disable interaction hooks
    // to allow native browser swiping (overflow-x-auto) to work properly.
    useEffect(() => {
        if (disabled) return undefined;
        const node = chartAreaRef.current;
        if (!node) return undefined;

        const onStart = (e) => {
            e.stopPropagation();
            const clientX = e.clientX || e.touches?.[0]?.clientX || 0;
            const clientY = e.clientY || e.touches?.[0]?.clientY || 0;
            const rect = node.getBoundingClientRect();
            const isRight = (clientX - rect.left) > (rect.width - 50);

            if (isRight || e.shiftKey) {
                dragRef.current = { ...dragRef.current, isYDragging: true, startY: clientY, startVScale: vScaleRef.current };
            } else {
                dragRef.current = { ...dragRef.current, isDragging: true, startX: clientX, startY: clientY, startPan: panOffsetRef.current, startVPan: priceOffsetRef.current };
            }
        };

        const onMove = (e) => {
            if (!dragRef.current.isYDragging && !dragRef.current.isDragging) return;
            const clientX = e.clientX || e.touches?.[0]?.clientX || 0;
            const clientY = e.clientY || e.touches?.[0]?.clientY || 0;

            if ((dragRef.current.isDragging || dragRef.current.isYDragging) && e.cancelable) {
                e.preventDefault();
            }

            if (dragRef.current.isYDragging) {
                const dy = dragRef.current.startY - clientY;
                setVScale(Math.max(0.1, Math.min(10, dragRef.current.startVScale + dy * 0.005)));
            } else {
                const dxPoints = Math.round(((clientX - dragRef.current.startX) / node.clientWidth) * zoomDaysRef.current);
                const dyPrice = (clientY - dragRef.current.startY);
                setPanOffset(Math.max(0, Math.min(totalPointsRef.current - zoomDaysRef.current, dragRef.current.startPan + dxPoints)));
                setPriceOffset(dragRef.current.startVPan + dyPrice);
            }
        };

        const onEnd = () => { dragRef.current.isDragging = false; dragRef.current.isYDragging = false; };
        const onDblClick = () => {
            setVScale(1.0);
            setPriceOffset(0);
        };

        node.addEventListener('wheel', handleWheel, { passive: false });
        node.addEventListener('mousedown', onStart);
        node.addEventListener('dblclick', onDblClick);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);
        node.addEventListener('touchstart', onStart, { passive: true });
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onEnd);

        return () => {
            node.removeEventListener('wheel', handleWheel);
            node.removeEventListener('mousedown', onStart);
            node.removeEventListener('dblclick', onDblClick);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onEnd);
            node.removeEventListener('touchstart', onStart);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
        };
    }, [handleWheel, disabled, !!data]);

    const projectedStats = useMemo(() => {
        if (!isProMode || !liveData || !data?.stats?.avgVol50) return null;
        const now = new Date();
        const start = new Date(now); start.setHours(9, 15, 0, 0);
        const end = new Date(now); end.setHours(15, 30, 0, 0);
        let elapsed = (now - start) / 60000;
        if (elapsed < 0) elapsed = 0; if (elapsed > 375) elapsed = 375;
        const prog = elapsed / 375;
        const currentVol = liveData.volume || 0;
        const liquidity1m = elapsed > 3 ? (currentVol / elapsed) : 0;
        const projVol = prog > 0.05 ? (currentVol / prog) : 0;
        const projRVol = data.stats.avgVol50 > 0 ? (projVol / data.stats.avgVol50) : 0;
        return { projRVol, liquidity1m };
    }, [liveData, data, isProMode]);

    if (!data) return null;

    // For 1D: use live price data which has accurate intraday change from prev close
    if (timeframe === '1D' && liveData.changePct !== null) {
        change = liveData.change ?? 0;
        changePct = liveData.changePct;
    }

    return (
        <div className="flex flex-col w-full h-full">
            {/* Timeframe Toggles - Always visible to prevent layout shift */}
            {!isProMode && (
                <div className="flex flex-row justify-end gap-0.5 mb-1 px-1">
                    {[
                        { label: 'TD', value: '1D' },
                        { label: 'TW', value: '1W' },
                        { label: 'TM', value: '1M' },
                        { label: 'TY', value: '1Y' }
                    ].map(tf => (
                        <button
                            key={tf.value}
                            onClick={(e) => { e.stopPropagation(); setTimeframe(tf.value); }}
                            disabled={!data || points.length < 2}
                            className={`px-1 py-0 rounded-[2px] text-[7px] font-black tracking-tighter border transition-all ${timeframe === tf.value ? 'bg-[var(--accent-primary)] text-black border-[var(--accent-primary)]' : 'bg-[#1a1c22]/50 border-white/5 text-white/20 hover:text-white hover:border-white/10'}`}
                        >
                            {tf.label}
                        </button>
                    ))}
                </div>
            )}

            {(!data || points.length < 2) ? (
                <div
                    className="bg-[#0b0e14] animate-pulse rounded-md border border-[#23272d] flex items-center justify-center overflow-hidden"
                    style={{ height: height ? `${height}px` : '100%' }}
                >
                    <div className="flex flex-col items-center gap-2 opacity-20">
                        <span className="text-[12px] font-black uppercase tracking-widest">{name || symbol}</span>
                        <span className="text-[8px] font-bold text-[var(--accent-primary)] uppercase tracking-tighter">{symbol}</span>
                    </div>
                </div>
            ) : (
                <div
                    ref={containerRef}
                    className="bg-[#0b0e14] text-white border border-[#23272d] rounded-md flex flex-col font-sans relative select-none hover:border-[#444] shadow-lg group overflow-hidden w-full"
                    style={{ height: height ? `${height}px` : '100%' }}
                >
                    {/* Legend */}
                    <div className="absolute top-1.5 left-3 right-2 flex justify-between items-start pointer-events-none z-10">
                        <div className="flex flex-col">
                            {!isProMode && (
                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                    <span className="text-[16px] font-black tracking-tight text-white uppercase">
                                        {/^\d+$/.test(cleaned) ? (name || symbol) : cleaned}
                                    </span>
                                </div>
                            )}
                            <div className="flex flex-col gap-0 text-[10px] font-black leading-tight mt-1">
                                {Object.keys(maMap).map(k => { const [t, p] = k.split('_'); return <span key={k} style={{ color: MA_COLORS[+p] || '#888' }}>{t} {p}</span>; })}
                                {isProMode && data?.stats && (
                                    <div className="flex items-center gap-1.5 mt-2 select-none pointer-events-auto flex-wrap max-w-[400px]">
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-black/40 backdrop-blur-md rounded border border-white/5">
                                            <span className="text-[8px] text-white/40 uppercase tracking-tighter font-bold">Avg₹Vol:</span>
                                            <span className="text-[9px] text-[var(--accent-primary)] font-black">{data.stats.avgDollarVol.toFixed(2)} Cr</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-black/40 backdrop-blur-md rounded border border-white/5">
                                            <span className="text-[8px] text-white/40 uppercase tracking-tighter font-bold">RVol:</span>
                                            <span className="text-[9px] text-white font-black">{(data.stats.currentRVol * 100).toFixed(0)}%</span>
                                        </div>
                                        {projectedStats && projectedStats.projRVol > 0 && (
                                            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-black/40 backdrop-blur-md rounded border border-white/5">
                                                <span className="text-[8px] text-white/40 uppercase tracking-tighter font-bold">Proj RVol:</span>
                                                <span className={`text-[9px] font-black ${projectedStats.projRVol >= 1 ? 'text-[#00c805]' : 'text-white/60'}`}>{projectedStats.projRVol.toFixed(1)}x</span>
                                            </div>
                                        )}
                                        {projectedStats && projectedStats.liquidity1m > 0 && (
                                            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-black/40 backdrop-blur-md rounded border border-white/5">
                                                <span className="text-[8px] text-white/40 uppercase tracking-tighter font-bold">1mL:</span>
                                                <span className="text-[9px] text-[#22b8cf] font-black">{projectedStats.liquidity1m > 100000 ? (projectedStats.liquidity1m / 100000).toFixed(2) + ' L' : projectedStats.liquidity1m.toFixed(0)}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-black/40 backdrop-blur-md rounded border border-white/5">
                                            <span className="text-[8px] text-white/40 uppercase tracking-tighter font-bold">U/D Vol:</span>
                                            <span className={`text-[9px] font-black ${data.stats.udRatio >= 1 ? 'text-[#00c805]' : 'text-[#ff2e2e]'}`}>{data.stats.udRatio.toFixed(2)}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {!isProMode && (
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none mt-0.5">
                                <span className="text-[12px] font-black italic" style={{ color: change >= 0 ? colorUp : colorDown }}>
                                    {change >= 0 ? '+' : ''}{change.toFixed(2)} ({Math.abs(changePct).toFixed(2)}%)
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-row gap-px z-30 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-md border border-white/10 rounded px-0.5 py-0.5">
                        <button onClick={(e) => { e.stopPropagation(); setZoomDays(prev => Math.max(20, Math.round(prev * 0.7))); }} className="p-0.5 hover:bg-white/10 rounded"><ZoomIn size={10} /></button>
                        <button onClick={(e) => { e.stopPropagation(); setZoomDays(prev => Math.min(data.totalPoints, Math.round(prev * 1.4))); }} className="p-0.5 hover:bg-white/10 rounded ml-1"><ZoomOut size={10} /></button>
                        <button onClick={(e) => { e.stopPropagation(); setZoomDays(isProMode ? 260 : 190); setPanOffset(0); setVScale(1.0); }} className="p-0.5 hover:bg-white/10 rounded ml-1"><Maximize2 size={10} /></button>
                        {!isProMode && onExpand && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onExpand({ symbol, name, series, timeframe }); }}
                                className="p-0.5 hover:bg-[var(--accent-primary)] hover:text-black rounded ml-1 transition-colors"
                            >
                                <ExternalLink size={10} />
                            </button>
                        )}
                    </div>

                    <div
                        ref={chartAreaRef}
                        className={`flex-1 relative cursor-crosshair ${disabled ? 'touch-auto' : 'touch-pan-y'}`}
                        onMouseMove={handleMouseMove}
                        onMouseLeave={handleMouseLeave}
                        style={{ opacity: measuredRef.current ? 1 : 0 }}
                    >
                        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none" style={{ shapeRendering: 'crispEdges' }}>

                            {maLines}

                            {candleGraphics}

                            {isProMode && points.length > 0 && (
                                <line
                                    x1={getX(points.length - 1)} x2={getX(points.length - 1)}
                                    y1={0} y2={H - paddingBottom}
                                    stroke="white" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.25"
                                />
                            )}

                            <g transform={`translate(${W - paddingX + 5}, 0)`}>
                                {[0, 0.25, 0.5, 0.75, 1].map(v => (
                                    <text key={v} y={paddingTop + chartH * v + 3} fill="#555" fontSize="10" fontWeight="bold" fontFamily="monospace">
                                        {(maxP - (maxP - minP) * v).toFixed(1)}
                                    </text>
                                ))}
                            </g>
                            {monthLabels.map((m, i) => (
                                <text
                                    key={i}
                                    x={m.x}
                                    y={H - 8}
                                    fill={m.isYear ? "#888" : "#444"}
                                    fontSize={m.isYear ? "11" : "10"}
                                    fontWeight={m.isYear ? "900" : "800"}
                                    fontFamily="monospace"
                                    textAnchor="middle"
                                >
                                    {m.text}
                                </text>
                            ))}
                        </svg>

                        <div
                            ref={tooltipRef}
                            className="absolute top-10 left-12 bg-black/95 border border-[#333] p-1.5 rounded text-white text-[9px] font-mono z-50 pointer-events-none"
                            style={{ opacity: 0 }}
                        >
                            <span ref={tooltipDateRef} className="font-black border-b border-gray-700 block mb-1">—</span>
                            <div className="grid grid-cols-2 gap-x-2">
                                <span ref={tooltipOpenRef}>O: —</span>
                                <span ref={tooltipCloseRef}>C: —</span>
                                <span ref={tooltipHighRef} className="text-[#00c3a5]">H: —</span>
                                <span ref={tooltipLowRef} className="text-[#ff4d52]">L: —</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
},
    (prevProps, nextProps) => {
        if (prevProps.height !== nextProps.height) return false;
        if (prevProps.symbol !== nextProps.symbol) return false;
        if (prevProps.name !== nextProps.name) return false;
        if (prevProps.series !== nextProps.series) return false;
        if (prevProps.forcedTimeframe !== nextProps.forcedTimeframe) return false;
        if (prevProps.chartStyle !== nextProps.chartStyle) return false;
        if (prevProps.maConfig !== nextProps.maConfig) return false;
        if (prevProps.disabled !== nextProps.disabled) return false;
        return true;
    });

export default FinvizChart;

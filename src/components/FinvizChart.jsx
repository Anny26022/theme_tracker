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
const NOOP_SUBSCRIBE = () => () => { };
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
const isSameMaConfig = (left, right) => {
    const lPaintBars = !!left?.paintBars;
    const rPaintBars = !!right?.paintBars;
    if (lPaintBars !== rPaintBars) return false;

    const lLines = Array.isArray(left?.lines) ? left.lines : [];
    const rLines = Array.isArray(right?.lines) ? right.lines : [];
    if (lLines === rLines) return true;
    if (lLines.length !== rLines.length) return false;

    for (let i = 0; i < lLines.length; i += 1) {
        const l = lLines[i];
        const r = rLines[i];
        if (l?.type !== r?.type || l?.period !== r?.period) return false;
    }
    return true;
};

let _cs = null;
const cs = () => _cs || (_cs = JSON.parse(localStorage.getItem('tt_cs_v4') || '{}'));
const setCs = (s, t, d) => { (cs()[s] ||= {})[t] = d; localStorage.setItem('tt_cs_v4', JSON.stringify(_cs)); };

const areFinvizChartPropsEqual = (prevProps, nextProps) => {
    if (prevProps.height !== nextProps.height) return false;
    if (prevProps.symbol !== nextProps.symbol) return false;
    if (prevProps.name !== nextProps.name) return false;
    if (prevProps.series !== nextProps.series) return false;
    if (prevProps.forcedTimeframe !== nextProps.forcedTimeframe) return false;
    if (prevProps.chartStyle !== nextProps.chartStyle) return false;
    if (!isSameMaConfig(prevProps.maConfig, nextProps.maConfig)) return false;
    if (prevProps.disabled !== nextProps.disabled) return false;
    if (prevProps.useExternalSeries !== nextProps.useExternalSeries) return false;
    if (prevProps.enableLivePrice !== nextProps.enableLivePrice) return false;
    return true;
};

function FinvizChartBase({
    symbol,
    name,
    series,
    height = null,
    onExpand,
    forcedTimeframe = null,
    initialTimeframe = '1D',
    isProMode = false,
    isActive = false,
    allCompanies = [],
    disabled = false,
    chartStyle: chartStyleProp = null,
    maConfig: maConfigProp = null,
    allowStrike: allowStrikeProp = null,
    useExternalSeries = false,
    enableLivePrice = false,
    chartVersion = 0,
    subscribeChartSymbols = null
}) {
    const lsStyle = useSyncExternalStore(
        chartStyleProp == null ? subChartSettings : NOOP_SUBSCRIBE,
        chartStyleProp == null ? getStyle : () => chartStyleProp
    );
    const lsMa = useSyncExternalStore(
        maConfigProp == null ? subChartSettings : NOOP_SUBSCRIBE,
        maConfigProp == null ? getMAConfig : () => maConfigProp
    );
    const chartStyle = chartStyleProp ?? lsStyle;
    const maConfig = maConfigProp ?? lsMa;
    const maLinesConfig = maConfig?.lines || _defaultMa;
    const paintBars = !!maConfig?.paintBars;
    const isHeikinStyle = chartStyle === 'heikin';
    const containerRef = useRef(null);
    const chartAreaRef = useRef(null);
    const totalPointsRef = useRef(9999);
    const seriesCacheRef = useRef({ signature: null, ordered: null, byTimeframe: new Map() });
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
    const dragRafRef = useRef(null);
    const dragPendingRef = useRef({ x: 0, y: 0 });
    const zoomDaysRef = useRef(zoomDays);
    const panOffsetRef = useRef(panOffset);
    const priceOffsetRef = useRef(priceOffset);
    const vScaleRef = useRef(vScale);

    useEffect(() => { zoomDaysRef.current = zoomDays; }, [zoomDays]);
    useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);
    useEffect(() => { priceOffsetRef.current = priceOffset; }, [priceOffset]);
    useEffect(() => { vScaleRef.current = vScale; }, [vScale]);

    const persistRef = useRef({ timer: null, pending: null, lastSig: null });
    const schedulePersist = useCallback((next, sig) => {
        const ref = persistRef.current;
        ref.pending = { next, sig };
        if (ref.timer) return;
        ref.timer = setTimeout(() => {
            const pending = ref.pending;
            ref.timer = null;
            if (!pending || pending.sig === ref.lastSig) return;
            ref.lastSig = pending.sig;
            setCs(cleaned, timeframe, pending.next);
        }, 180);
    }, [cleaned, timeframe]);

    useEffect(() => {
        const sig = `${cleaned}:${timeframe}:${zoomDays}:${panOffset}:${priceOffset}:${vScale}`;
        schedulePersist({ z: zoomDays, p: panOffset, y: priceOffset, v: vScale }, sig);
    }, [cleaned, timeframe, zoomDays, panOffset, priceOffset, vScale, schedulePersist]);

    useEffect(() => () => {
        const ref = persistRef.current;
        if (!ref.timer) return;
        clearTimeout(ref.timer);
        ref.timer = null;
        const pending = ref.pending;
        if (pending && pending.sig !== ref.lastSig) {
            ref.lastSig = pending.sig;
            setCs(cleaned, timeframe, pending.next);
        }
    }, [cleaned, timeframe]);

    const shouldLive = enableLivePrice || (isProMode && isActive);
    const effectiveChartVersion = useExternalSeries ? 0 : chartVersion;

    const apiInterval = useMemo(() => {
        if (timeframe === '1D') return '1Y';
        return 'MAX';
    }, [timeframe]);

    useEffect(() => {
        if (useExternalSeries || !subscribeChartSymbols || !symbol) return;
        // Fetch the appropriate high-res window + MAX for deep history/SMA
        const unsubs = [subscribeChartSymbols(apiInterval, [symbol])];
        if (apiInterval === '1Y') {
            unsubs.push(subscribeChartSymbols('MAX', [symbol]));
        }
        return () => unsubs.forEach(u => u?.());
    }, [symbol, apiInterval, subscribeChartSymbols, useExternalSeries]);

    const activeSeries = useMemo(() => {
        if (useExternalSeries) return Array.isArray(series) ? series : [];
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
    }, [cleaned, apiInterval, effectiveChartVersion, series, symbol, useExternalSeries]);
    const hasSeriesData = (activeSeries?.length || 0) > 1;

    const [dimensions, setDimensions] = useState({ width: 600, height: height || 400 });
    const [isMeasured, setIsMeasured] = useState(false);
    useEffect(() => {
        const node = containerRef.current;
        if (!node) return;

        const applySize = (nextWidth, nextHeight) => {
            if (nextWidth <= 0 || nextHeight <= 0) return;
            setIsMeasured(true);
            setDimensions((prev) => (
                prev.width === nextWidth && prev.height === nextHeight
                    ? prev
                    : { width: nextWidth, height: nextHeight }
            ));
        };

        const rect = node.getBoundingClientRect();
        applySize(rect.width, rect.height);

        const obs = new ResizeObserver((entries) => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                applySize(width, height);
            }
        });
        obs.observe(node);
        return () => obs.disconnect();
    }, [height, hasSeriesData]);

    const rafRef = useRef(null);
    const wheelRafRef = useRef(null);
    const wheelDeltaRef = useRef(0);

    const handleWheel = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        wheelDeltaRef.current += e.deltaY || 0;
        if (wheelRafRef.current) return;
        wheelRafRef.current = requestAnimationFrame(() => {
            wheelRafRef.current = null;
            const delta = Math.max(-120, Math.min(120, wheelDeltaRef.current));
            wheelDeltaRef.current = 0;
            if (!delta) return;
            const factor = Math.exp(delta * 0.002);
            setZoomDays(p => {
                const next = Math.max(20, Math.min(totalPointsRef.current, Math.round(p * factor)));
                // Clamp panOffset if it would go out of bounds after zoom change
                setPanOffset(o => Math.max(0, Math.min(totalPointsRef.current - next, o)));
                return next;
            });
        });
    }, [setZoomDays]);


    const baseData = useMemo(() => {
        if (!activeSeries || activeSeries.length === 0) return null;

        const signature = (() => {
            const len = activeSeries.length;
            if (len === 0) return `${effectiveChartVersion}:0`;
            const sample = (i) => {
                const p = activeSeries[i];
                if (!p) return '0:0';
                return `${p.time ?? 0}:${p.close ?? 0}`;
            };
            const first = sample(0);
            const q1 = sample(Math.floor(len * 0.25));
            const mid = sample(Math.floor(len * 0.5));
            const q3 = sample(Math.floor(len * 0.75));
            const last = sample(len - 1);
            return `${effectiveChartVersion}:${len}:${first}:${q1}:${mid}:${q3}:${last}`;
        })();

        const cache = seriesCacheRef.current;
        if (cache.signature !== signature) {
            let isSorted = true;
            for (let i = 1; i < activeSeries.length; i += 1) {
                if ((activeSeries[i]?.time ?? 0) < (activeSeries[i - 1]?.time ?? 0)) {
                    isSorted = false;
                    break;
                }
            }
            cache.signature = signature;
            cache.ordered = isSorted ? activeSeries : [...activeSeries].sort((a, b) => a.time - b.time);
            cache.byTimeframe = new Map();
        }

        const cached = cache.byTimeframe.get(timeframe);
        if (cached) return cached;

        let ordered = cache.ordered || activeSeries;
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
                open: p.open ?? p.close,
                high: p.high ?? p.close,
                low: p.low ?? p.close,
                close: p.close,
                volume: p.volume ?? 0,
            }))
            .filter(p => !isNaN(p.time) && p.time > 0 && isFinite(p.close) && p.close > 0);

        if (allPoints.length < 2) return null;

        const allCloses = allPoints.map(p => p.close);
        const allVolumes = allPoints.map(p => p.volume);

        // --- Volume Metrics (precompute SMA only) ---
        const volSMA50 = buildSmaSeries(allVolumes, 50);

        // Summary Stats (for the last points or 50 bars)
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
        const lastIdx = allPoints.length - 1;
        const lastSma = volSMA50[lastIdx] || 0;
        const currentRVol = lastSma > 0 ? (allVolumes[lastIdx] / lastSma) : 0;

        const closePrefixSum = new Array(allCloses.length + 1);
        closePrefixSum[0] = 0;
        for (let i = 0; i < allCloses.length; i += 1) {
            closePrefixSum[i + 1] = closePrefixSum[i] + allCloses[i];
        }

        const result = {
            allPoints, allCloses, allVolumes, volSMA50, closePrefixSum, totalPoints: allPoints.length,
            stats: { udRatio, avgDollarVol: avgDollarVol / 10000000, currentRVol, avgVol50 } // avgDollarVol in Crores (approx)
        };
        cache.byTimeframe.set(timeframe, result);
        return result;
    }, [activeSeries, timeframe]);

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
        const maMap = {};
        const allCloses = baseData.allCloses || [];
        const closePrefixSum = baseData.closePrefixSum || [];
        const sliceLen = endIdx - startIdx;
        const buildSmaSlice = (period) => {
            const out = new Array(sliceLen).fill(null);
            if (!closePrefixSum.length) return out;
            for (let gi = startIdx; gi < endIdx; gi += 1) {
                if (gi >= period - 1) {
                    const sum = closePrefixSum[gi + 1] - closePrefixSum[gi + 1 - period];
                    out[gi - startIdx] = sum / period;
                }
            }
            return out;
        };
        const buildEmaSlice = (period) => {
            const out = new Array(sliceLen).fill(null);
            if (!allCloses.length || !closePrefixSum.length) return out;
            const k = 2 / (period + 1);
            const seedStart = Math.max(0, startIdx - period * 2);
            let ema = null;
            for (let gi = seedStart; gi < endIdx; gi += 1) {
                const v = allCloses[gi];
                if (ema === null) {
                    if (gi >= period - 1) {
                        const sum = closePrefixSum[gi + 1] - closePrefixSum[gi + 1 - period];
                        ema = sum / period;
                    }
                } else {
                    ema = v * k + ema * (1 - k);
                }
                if (gi >= startIdx && ema !== null) {
                    out[gi - startIdx] = ema;
                }
            }
            return out;
        };
        maLinesConfig.forEach((m) => {
            const key = `${m.type}_${m.period}`;
            maMap[key] = m.type === 'EMA' ? buildEmaSlice(m.period) : buildSmaSlice(m.period);
        });

        const basePoints = baseData.allPoints;
        const volSMA50 = baseData.volSMA50 || [];
        const lookback = 10;
        points.forEach((p, i) => {
            const g = startIdx + i;
            const prev = g > 0 ? basePoints[g - 1] : p;
            const sma = volSMA50[g] || 0;
            const isUp = p.close > prev.close || (p.close === prev.close && p.close >= p.open);

            let maxDownVol10 = 0;
            for (let j = Math.max(0, g - lookback); j < g; j++) {
                const ref = basePoints[j];
                const preRef = j > 0 ? basePoints[j - 1] : ref;
                const refIsDown = ref.close < preRef.close || (ref.close === preRef.close && ref.close < ref.open);
                if (refIsDown) maxDownVol10 = Math.max(maxDownVol10, ref.volume);
            }
            const isPPV = isUp && p.volume > maxDownVol10 && g >= lookback;

            const range = p.high - p.low || 0.01;
            const relativeClose = (p.close - p.low) / range;
            const isBullSnort = (sma > 0 && p.volume > 3 * sma) && (relativeClose >= 0.65) && (p.close > prev.close);

            const isDry = sma > 0 && p.volume < (sma / 5);

            let color = '#8b95a7';
            if (isPPV) color = '#3b82f6';
            else if (isUp && sma > 0 && p.volume > sma) color = '#22c55e';
            else if (!isUp && sma > 0 && p.volume > sma) color = '#ef4444';
            else if (isDry) color = '#f59e0b';

            p.volColor = color;
            p.volSMA50 = sma;
            p.isBullSnort = isBullSnort;
            p.isPPV = isPPV;
            p.isDry = isDry;
            p.rVol = sma > 0 ? (p.volume / sma) : 0;
        });

        if (isHeikinStyle) {
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
            Object.values(maMap).forEach(a => { const v = a[i]; if (v > 0 && isFinite(v)) { minP = Math.min(minP, v); maxP = Math.max(maxP, v); } });
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
            points, maMap, minP, maxP, maxV, pRange: maxP - minP || 0.01,
            totalPoints: baseData.totalPoints
        };
    }, [baseData, maLinesConfig, zoomDays, panOffset, vScale, priceOffset, chartH, isHeikinStyle]);

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
        const groupVolumeBars = !paintBars;
        const volBarsByColor = groupVolumeBars ? new Map() : null;
        const bullSnortDots = [];

        const useGroupedPaths = !paintBars;
        let wickUpD = '', wickDownD = '';
        let bodyUpFillD = '', bodyUpStrokeD = '', bodyDownFillD = '', bodyDownStrokeD = '';
        let barUpD = '', barDownD = '';

        const wickUp = [], wickDown = [];
        const bodyUpFill = [], bodyUpStroke = [], bodyDownStroke = [], bodyDownFill = [];
        const barUp = [], barDown = [];
        const hw = candleWidth / 2;

        points.forEach((p, i) => {
            const x = getX(i);
            const isUp = p.close >= p.open;
            const isGrowth = i > 0 ? p.close >= points[i - 1].close : true;

            const vColor = p.volColor || (isGrowth ? colorUp : colorDown);
            const pColor = (paintBars && p.volColor && p.volColor !== '#8b95a7') ? p.volColor : (isUp ? colorUp : colorDown);

            // Volume
            if (maxV > 0 && p.volume > 0) {
                const vh = (p.volume / maxV) * volH;
                const vy = H - paddingBottom - vh;
                const d = `M${(x - hw).toFixed(1)},${vy.toFixed(1)}h${candleWidth.toFixed(1)}v${vh.toFixed(1)}h-${candleWidth.toFixed(1)}Z`;
                if (groupVolumeBars) {
                    const cur = volBarsByColor.get(vColor) || '';
                    volBarsByColor.set(vColor, cur + d);
                } else {
                    volBars.push(<path key={`v-${i}`} d={d} fill={vColor} opacity={isProMode ? "1" : "0.78"} />);
                }
            }

            if (chartStyle === 'bars') {
                const highY = getY(p.high), lowY = getY(p.low), openY = getY(p.open), closeY = getY(p.close);
                const path = `M${x.toFixed(1)},${highY.toFixed(1)}V${lowY.toFixed(1)} M${(x - hw).toFixed(1)},${openY.toFixed(1)}H${x.toFixed(1)} M${x.toFixed(1)},${closeY.toFixed(1)}H${(x + hw).toFixed(1)}`;
                if (useGroupedPaths) {
                    if (isUp) barUpD += path; else barDownD += path;
                } else {
                    if (isUp) barUp.push({ path, color: pColor });
                    else barDown.push({ path, color: pColor });
                }
            } else {
                // Wicks
                const highY = getY(p.high), lowY = getY(p.low);
                const wickD = `M${x.toFixed(1)},${highY.toFixed(1)}V${lowY.toFixed(1)}`;
                if (useGroupedPaths) {
                    if (isUp) wickUpD += wickD; else wickDownD += wickD;
                } else {
                    (isUp ? wickUp : wickDown).push({ d: wickD, color: pColor });
                }

                // Bodies
                const openY = getY(p.open), closeY = getY(p.close);
                const top = Math.min(openY, closeY), bodyH = Math.max(1, Math.abs(openY - closeY));
                const bodyD = `M${(x - hw).toFixed(1)},${top.toFixed(1)}h${candleWidth.toFixed(1)}v${bodyH.toFixed(1)}h-${candleWidth.toFixed(1)}Z`;

                if (chartStyle === 'hollow' || chartStyle === 'white') {
                    if (useGroupedPaths) {
                        if (isUp) bodyUpStrokeD += bodyD; else bodyDownFillD += bodyD;
                    } else {
                        if (isUp) bodyUpStroke.push({ d: bodyD, color: pColor });
                        else bodyDownFill.push({ d: bodyD, color: pColor });
                    }
                } else {
                    if (useGroupedPaths) {
                        if (isUp) bodyUpFillD += bodyD; else bodyDownFillD += bodyD;
                    } else {
                        if (isUp) bodyUpFill.push({ d: bodyD, color: pColor });
                        else bodyDownFill.push({ d: bodyD, color: pColor });
                    }
                }

                // Bull Snort Dot
                if (p.isBullSnort) {
                    bullSnortDots.push(<circle key={`bs-${i}`} cx={x} cy={lowY + 10} r="2" fill="#a855f7" />);
                }
            }
        });

        return (
            <>
                {groupVolumeBars
                    ? Array.from(volBarsByColor.entries()).map(([color, d], i) => (
                        d ? <path key={`v-${i}`} d={d} fill={color} opacity={isProMode ? "1" : "0.78"} /> : null
                    ))
                    : volBars}
                {bullSnortDots}

                {chartStyle === 'bars' ? (
                    useGroupedPaths ? (
                        <>
                            {barUpD && <path d={barUpD} fill="none" stroke={colorUp} strokeWidth="1.2" />}
                            {barDownD && <path d={barDownD} fill="none" stroke={colorDown} strokeWidth="1.2" />}
                        </>
                    ) : (
                        <>
                            {barUp.map((b, i) => <path key={`up-${i}`} d={b.path} fill="none" stroke={b.color} strokeWidth="1.2" />)}
                            {barDown.map((b, i) => <path key={`dn-${i}`} d={b.path} fill="none" stroke={b.color} strokeWidth="1.2" />)}
                        </>
                    )
                ) : (
                    useGroupedPaths ? (
                        <>
                            {wickUpD && <path d={wickUpD} fill="none" stroke={colorUp} strokeWidth="1" />}
                            {wickDownD && <path d={wickDownD} fill="none" stroke={colorDown} strokeWidth="1" />}
                            {bodyUpFillD && <path d={bodyUpFillD} fill={colorUp} />}
                            {bodyUpStrokeD && <path d={bodyUpStrokeD} fill="#0b0e14" stroke={colorUp} strokeWidth="0.8" />}
                            {bodyDownFillD && <path d={bodyDownFillD} fill={colorDown} />}
                            {bodyDownStrokeD && <path d={bodyDownStrokeD} fill="#0b0e14" stroke={colorDown} strokeWidth="0.8" />}
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
                    )
                )}
            </>
        );
    }, [data, points, getX, getY, candleWidth, maxV, volH, H, paddingBottom, colorUp, colorDown, chartStyle, cleaned, isProMode, paintBars]);

    const allowStrike = allowStrikeProp ?? (isProMode ? isActive : false);
    const liveData = useLivePrice(shouldLive ? cleaned : '', { allowStrike });

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

            dragPendingRef.current.x = clientX;
            dragPendingRef.current.y = clientY;
            if (dragRafRef.current) return;
            dragRafRef.current = requestAnimationFrame(() => {
                dragRafRef.current = null;
                const pending = dragPendingRef.current;
                if (dragRef.current.isYDragging) {
                    const dy = dragRef.current.startY - pending.y;
                    const next = Math.max(0.1, Math.min(10, dragRef.current.startVScale + dy * 0.005));
                    setVScale((prev) => (prev === next ? prev : next));
                } else if (dragRef.current.isDragging) {
                    const dxPoints = Math.round(((pending.x - dragRef.current.startX) / node.clientWidth) * zoomDaysRef.current);
                    const dyPrice = (pending.y - dragRef.current.startY);
                    const nextPan = Math.max(0, Math.min(totalPointsRef.current - zoomDaysRef.current, dragRef.current.startPan + dxPoints));
                    const nextOffset = dragRef.current.startVPan + dyPrice;
                    setPanOffset((prev) => (prev === nextPan ? prev : nextPan));
                    setPriceOffset((prev) => (prev === nextOffset ? prev : nextOffset));
                }
            });
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
            if (wheelRafRef.current) cancelAnimationFrame(wheelRafRef.current);
            wheelRafRef.current = null;
            wheelDeltaRef.current = 0;
            if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current);
            dragRafRef.current = null;
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
                        style={{ opacity: isMeasured ? 1 : 0 }}
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
}

const ConnectedFinvizChart = React.memo(function ConnectedFinvizChart(props) {
    const { subscribeChartSymbols } = useMarketDataRegistry();
    const chartVersion = useChartVersion();

    return (
        <FinvizChartBase
            {...props}
            subscribeChartSymbols={subscribeChartSymbols}
            chartVersion={chartVersion}
        />
    );
}, areFinvizChartPropsEqual);

const ExternalSeriesFinvizChart = React.memo(function ExternalSeriesFinvizChart(props) {
    return (
        <FinvizChartBase
            {...props}
            useExternalSeries={true}
            enableLivePrice={false}
        />
    );
}, areFinvizChartPropsEqual);

export default function FinvizChart(props) {
    if (props.useExternalSeries) {
        return <ExternalSeriesFinvizChart {...props} />;
    }

    return <ConnectedFinvizChart {...props} />;
}

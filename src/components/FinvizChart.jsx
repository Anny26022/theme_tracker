import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { cleanSymbol, getCachedComparisonSeries } from '../services/priceService';
import { useMarketDataRegistry, useChartVersion } from '../context/MarketDataContext';
import { useLivePrice } from '../context/PriceContext';
import { ZoomIn, ZoomOut, Maximize2, ExternalLink } from 'lucide-react';

/**
 * AUTHENTIC Finviz Replica Component.
 * Fixed: "Normal" candle proportions and consistent SMA logic.
 */
const buildSmaSeries = (values, period) => {
    if (!values?.length) return [];
    const result = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        sum += values[i];
        if (i >= period) sum -= values[i - period];
        if (i >= period - 1) result[i] = sum / period;
    }
    return result;
};

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
    disabled = false
}) {
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
    const [zoomDays, setZoomDays] = useState(init.z ?? 168);
    const [panOffset, setPanOffset] = useState(init.p ?? 0);
    const [priceOffset, setPriceOffset] = useState(init.y ?? 0);
    const [vScale, setVScale] = useState(init.v ?? 1.0);
    const dragRef = useRef({ isDragging: false, isYDragging: false, isFreeDragging: false, startX: 0, startY: 0, startPan: 0, startVPan: 0, startVScale: 1.0 });

    useEffect(() => setCs(cleaned, timeframe, { z: zoomDays, p: panOffset, y: priceOffset, v: vScale }),
        [cleaned, timeframe, zoomDays, panOffset, priceOffset, vScale]);

    const { subscribeChartSymbols } = useMarketDataRegistry();
    const chartVersion = useChartVersion();

    const apiInterval = useMemo(() => {
        if (timeframe === '1D') return '1Y';
        return 'MAX';
    }, [timeframe]);

    useEffect(() => {
        if (!symbol || isProMode) return; // ProMode handles its own fetching
        return subscribeChartSymbols(apiInterval, [symbol]);
    }, [symbol, apiInterval, isProMode, subscribeChartSymbols]);

    const activeSeries = useMemo(() => {
        if (!symbol) return series || [];
        const cached = getCachedComparisonSeries(cleaned, apiInterval, { silent: true });
        return (cached && cached.length > 0) ? cached : (series || []);
    }, [cleaned, apiInterval, chartVersion, series]);

    useEffect(() => {
        if (!containerRef.current) return;
        const obs = new ResizeObserver((entries) => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                if (width > 0 && height > 0) {
                    setDimensions({ width, height });
                }
            }
        });
        obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, []);

    const [dimensions, setDimensions] = useState({ width: 600, height: height || 400 });

    const rafRef = useRef(null);

    const handleWheel = useCallback((e) => {
        e.preventDefault();
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

        // 1. Process points
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

        // 3. Full-History SMA (Crucial for correctness)
        const allCloses = allPoints.map(p => p.close);
        const sma50Arr = buildSmaSeries(allCloses, 50);
        const sma200Arr = buildSmaSeries(allCloses, 200);

        return {
            allPoints,
            sma50Arr,
            sma200Arr,
            totalPoints: allPoints.length
        };
    }, [activeSeries, timeframe]);

    // Sync view state cleanly on timeframe/symbol change
    useEffect(() => {
        const s = cs()[cleaned]?.[timeframe] || {};
        setZoomDays(s.z ?? { '1W': 100, '1M': 60, '1Y': 20 }[timeframe] ?? 168);
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

        const points = baseData.allPoints.slice(startIdx, endIdx).map(p => ({ ...p }));
        const sma50 = baseData.sma50Arr.slice(startIdx, endIdx);
        const sma200 = baseData.sma200Arr.slice(startIdx, endIdx);

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
            if (p.low < minP) minP = p.low;
            if (p.high > maxP) maxP = p.high;
            if (p.volume > maxV) maxV = p.volume;
            // Only include SMAs if they are valid numbers and not zero/outliers
            if (sma50[i] > 0 && isFinite(sma50[i])) {
                if (sma50[i] < minP) minP = sma50[i];
                if (sma50[i] > maxP) maxP = sma50[i];
            }
            if (sma200[i] > 0 && isFinite(sma200[i])) {
                if (sma200[i] < minP) minP = sma200[i];
                if (sma200[i] > maxP) maxP = sma200[i];
            }
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
            points, sma50, sma200, minP, maxP, maxV, pRange: maxP - minP || 0.01,
            totalPoints: baseData.totalPoints
        };
    }, [baseData, zoomDays, panOffset, vScale, priceOffset, chartH]);

    // Keep ref in sync with latest totalPoints (inline, no useEffect needed)
    if (data) totalPointsRef.current = data.totalPoints;

    const getX = useCallback((idx) => data ? paddingLeft + (idx / (data.points.length - 1 || 1)) * chartW : paddingLeft, [data, chartW]);
    const getY = useCallback((p) => data ? paddingTop + (chartH - ((p - data.minP) / (data.pRange || 1)) * chartH) : paddingTop, [data, chartH]);

    const points = data?.points ?? [];
    const sma50 = data?.sma50 ?? [];
    const sma200 = data?.sma200 ?? [];
    const maxV = data?.maxV ?? 0;
    const minP = data?.minP ?? 0;
    const maxP = data?.maxP ?? 0;
    const colorUp = '#00c805';
    const colorDown = '#ff2e2e';
    const colorSma50 = '#f8d347';
    const colorSma200 = '#9d27b0';
    const candleWidth = Math.max(1.8, (chartW / (points.length || 1)) * 0.82);
    const smaLines = useMemo(() => {
        const build = (arr, color) => {
            const pts = arr.map((val, i) => val ? `${i === 0 || !arr[i - 1] ? 'M' : 'L'}${getX(i).toFixed(1)},${getY(val).toFixed(1)}` : '').filter(Boolean);
            return pts.length > 1 ? <path d={pts.join(' ')} fill="none" stroke={color} strokeWidth="1" opacity="0.8" style={{ shapeRendering: 'auto' }} /> : null;
        };
        return <>{build(sma200, colorSma200)}{build(sma50, colorSma50)}</>;
    }, [sma50, sma200, getX, getY]);

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
        const volUp = [], volDown = [];
        const wickUp = [], wickDown = [];
        const bodyUpFill = [], bodyUpStroke = [], bodyDown = [];
        const hw = candleWidth / 2;

        points.forEach((p, i) => {
            const x = getX(i);
            const prevClose = i > 0 ? points[i - 1].close : p.close;
            const isUp = p.close >= prevClose;
            const isHollow = p.close >= p.open;

            // Volume
            if (maxV > 0 && p.volume > 0) {
                const vh = (p.volume / maxV) * volH;
                const vy = H - paddingBottom - vh;
                (isUp ? volUp : volDown).push(`M${(x - hw).toFixed(1)},${vy.toFixed(1)}h${candleWidth.toFixed(1)}v${vh.toFixed(1)}h-${candleWidth.toFixed(1)}Z`);
            }

            // Wicks
            const highY = getY(p.high), lowY = getY(p.low);
            (isUp ? wickUp : wickDown).push(`M${x.toFixed(1)},${highY.toFixed(1)}V${lowY.toFixed(1)}`);

            // Bodies
            const openY = getY(p.open), closeY = getY(p.close);
            const top = Math.min(openY, closeY), bodyH = Math.max(1, Math.abs(openY - closeY));
            const bodyD = `M${(x - hw).toFixed(1)},${top.toFixed(1)}h${candleWidth.toFixed(1)}v${bodyH.toFixed(1)}h-${candleWidth.toFixed(1)}Z`;
            if (isUp && isHollow) bodyUpStroke.push(bodyD);
            else if (isUp) bodyUpFill.push(bodyD);
            else bodyDown.push(bodyD);
        });

        return (
            <>
                {volUp.length > 0 && <path d={volUp.join('')} fill={colorUp} opacity="0.3" />}
                {volDown.length > 0 && <path d={volDown.join('')} fill={colorDown} opacity="0.3" />}
                {wickUp.length > 0 && <path d={wickUp.join('')} fill="none" stroke={colorUp} strokeWidth="1" />}
                {wickDown.length > 0 && <path d={wickDown.join('')} fill="none" stroke={colorDown} strokeWidth="1" />}
                {bodyUpFill.length > 0 && <path d={bodyUpFill.join('')} fill={colorUp} />}
                {bodyUpStroke.length > 0 && <path d={bodyUpStroke.join('')} fill="#0b0e14" stroke={colorUp} strokeWidth="1" />}
                {bodyDown.length > 0 && <path d={bodyDown.join('')} fill={colorDown} />}
            </>
        );
    }, [data, points, getX, getY, candleWidth, maxV, volH, H, paddingBottom, colorUp, colorDown]);

    const liveData = useLivePrice(cleaned);

    // Calculate performance explicitly based on timeframe
    const absolutePoints = baseData?.allPoints || points;
    const last = absolutePoints[absolutePoints.length - 1] || { close: 0 };
    const prevC = absolutePoints[absolutePoints.length - 2]?.close || absolutePoints[0]?.close || 0;

    // Default manual calculation from chart 
    let change = last.close - prevC;
    let changePct = prevC ? (change / prevC) * 100 : 0;

    // When rendered inside a mobile gallery or pure display mode, disable interaction hooks 
    // to allow native browser swiping (overflow-x-auto) to work properly.
    useEffect(() => {
        if (disabled) return undefined;
        const node = chartAreaRef.current;
        if (!node) return undefined;

        const onStart = (e) => {
            const clientX = e.clientX || e.touches?.[0]?.clientX || 0;
            const clientY = e.clientY || e.touches?.[0]?.clientY || 0;
            const rect = node.getBoundingClientRect();
            const isRight = (clientX - rect.left) > (rect.width - 50);

            if (isRight || e.shiftKey) {
                dragRef.current = { ...dragRef.current, isYDragging: true, startY: clientY, startVScale: vScale };
            } else {
                dragRef.current = { ...dragRef.current, isDragging: true, startX: clientX, startY: clientY, startPan: panOffset, startVPan: priceOffset };
            }
        };

        const onMove = (e) => {
            if (!dragRef.current.isYDragging && !dragRef.current.isDragging) return;
            const clientX = e.clientX || e.touches?.[0]?.clientX || 0;
            const clientY = e.clientY || e.touches?.[0]?.clientY || 0;

            // Only prevent default if we are actively dragging/panning to avoid blocking vertical page scroll
            if ((dragRef.current.isDragging || dragRef.current.isYDragging) && e.cancelable) {
                e.preventDefault();
            }

            if (dragRef.current.isYDragging) {
                const dy = dragRef.current.startY - clientY;
                setVScale(Math.max(0.1, Math.min(10, dragRef.current.startVScale + dy * 0.005)));
            } else {
                const dxPoints = Math.round(((clientX - dragRef.current.startX) / node.clientWidth) * zoomDays);
                const dyPrice = (clientY - dragRef.current.startY); // Pixels transferred to price logic via getY later
                setPanOffset(Math.max(0, Math.min(totalPointsRef.current - zoomDays, dragRef.current.startPan + dxPoints)));
                setPriceOffset(dragRef.current.startVPan + dyPrice);
            }
        };

        const onEnd = () => { dragRef.current.isDragging = false; dragRef.current.isYDragging = false; };
        const onDblClick = (e) => {
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
    }, [handleWheel, panOffset, priceOffset, zoomDays, vScale, disabled, !!data]);

    // Override absolutely everywhere with synchronized live market data for Daily performance (to fix cache races)
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
                            <div className="flex flex-col text-[9px] font-black leading-tight mt-1">
                                <span style={{ color: colorSma50 }}>SMA 50</span>
                                <span style={{ color: colorSma200 }}>SMA 200</span>
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
                        <button onClick={(e) => { e.stopPropagation(); setZoomDays(190); setPanOffset(0); setVScale(1.0); }} className="p-0.5 hover:bg-white/10 rounded ml-1"><Maximize2 size={10} /></button>
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
                    >
                        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none" style={{ shapeRendering: 'crispEdges' }}>

                            {/* Volume Labels (Left Axis) */}
                            {maxV > 0 && (
                                <g opacity="0.4" fontFamily="monospace" fontSize="9" fontWeight="bold">
                                    <text x={paddingLeft - 5} y={H - paddingBottom - volH + 3} textAnchor="end" fill="#666">{(maxV / 1000000).toFixed(1)}M</text>
                                    <text x={paddingLeft - 5} y={H - paddingBottom - (volH / 2) + 3} textAnchor="end" fill="#666">{(maxV / 2000000).toFixed(1)}M</text>
                                </g>
                            )}

                            {smaLines}

                            {candleGraphics}

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
        return true;
    });

export default FinvizChart;

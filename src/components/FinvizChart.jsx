import React, { useMemo, useRef, useCallback, useState } from 'react';
import { calculateSMA, cleanSymbol } from '../services/priceService';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

/**
 * AUTHENTIC Finviz Replica Component.
 * Fixed: "Normal" candle proportions and consistent SMA logic.
 */
const FinvizChart = ({ symbol, name, series, height = 300 }) => {
    const containerRef = useRef(null);
    const totalPointsRef = useRef(9999);
    const cleaned = useMemo(() => cleanSymbol(symbol), [symbol]);
    const hoverIndexRef = useRef(null);
    const tooltipRef = useRef(null);
    const tooltipDateRef = useRef(null);
    const tooltipOpenRef = useRef(null);
    const tooltipCloseRef = useRef(null);
    const tooltipHighRef = useRef(null);
    const tooltipLowRef = useRef(null);
    const [zoomDays, setZoomDays] = useState(190);
    const rafRef = useRef(null);

    // Callback ref: attaches a non-passive wheel listener once on mount.
    // Non-passive is required so e.preventDefault() can block the page scroll.
    const chartAreaRef = useCallback((node) => {
        if (!node) return;
        node.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY < 0) setZoomDays(p => Math.max(20, Math.round(p * 0.9)));
            else setZoomDays(p => Math.min(totalPointsRef.current, Math.round(p * 1.1)));
        }, { passive: false });
    }, []);


    const data = useMemo(() => {
        if (!series || series.length === 0) return null;

        // 1. Process points
        const allPoints = series
            .map(p => ({
                time: p.time,
                open: p.open ?? p.close ?? 0,
                high: p.high ?? p.close ?? 0,
                low: p.low ?? p.close ?? 0,
                close: p.close ?? 0,
                volume: p.volume ?? 0,
            }))
            .filter(p => p.time > 0 && isFinite(p.close) && p.close > 0)
            .sort((a, b) => a.time - b.time);

        if (allPoints.length < 2) return null;

        // 2. Full-History SMA (Crucial for correctness)
        const allCloses = allPoints.map(p => p.close);
        const sma50Arr = allPoints.map((_, i) => calculateSMA(allCloses.slice(0, i + 1), 50));
        const sma200Arr = allPoints.map((_, i) => calculateSMA(allCloses.slice(0, i + 1), 200));

        // 3. Slice for Display
        const sliceCount = Math.min(zoomDays, allPoints.length);
        const visibleIdx = allPoints.length - sliceCount;
        const points = allPoints.slice(visibleIdx).map(p => ({ ...p }));
        const sma50 = sma50Arr.slice(visibleIdx);
        const sma200 = sma200Arr.slice(visibleIdx);

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
            if (sma50[i] && sma50[i] < minP) minP = sma50[i];
            if (sma50[i] && sma50[i] > maxP) maxP = sma50[i];
        });

        const range = maxP - minP;
        const padding = range * 0.1; // Normal healthy padding
        minP -= padding;
        maxP += padding;

        return {
            points, sma50, sma200, minP, maxP, maxV, pRange: maxP - minP,
            totalPoints: allPoints.length
        };
    }, [series, zoomDays]);

    // Keep ref in sync with latest totalPoints (inline, no useEffect needed)
    if (data) totalPointsRef.current = data.totalPoints;

    const paddingX = 40, paddingLeft = 35, paddingTop = 35, paddingBottom = 25;
    const W = 600, H = height;
    const chartW = W - paddingX - paddingLeft;
    const chartH = H - paddingTop - paddingBottom;
    const volH = chartH * 0.2;

    const getX = useCallback((idx) => data ? paddingLeft + (idx / (data.points.length - 1 || 1)) * chartW : paddingLeft, [data, chartW]);
    const getY = useCallback((p) => data ? paddingTop + (chartH - ((p - data.minP) / (data.pRange || 1)) * chartH) : paddingTop, [data, chartH]);

    const points = data?.points ?? [];
    const sma50 = data?.sma50 ?? [];
    const sma200 = data?.sma200 ?? [];
    const maxV = data?.maxV ?? 0;
    const minP = data?.minP ?? 0;
    const maxP = data?.maxP ?? 0;
    const renderLine = (arr, color) => {
        const pts = arr.map((val, i) => val ? `${i === 0 || !arr[i - 1] ? 'M' : 'L'}${getX(i).toFixed(1)},${getY(val).toFixed(1)}` : '').filter(Boolean);
        return pts.length > 1 ? <path d={pts.join(' ')} fill="none" stroke={color} strokeWidth="1" opacity="0.8" style={{ shapeRendering: 'auto' }} /> : null;
    };

    const getMonthsLabel = () => {
        const labels = [];
        let prevM = -1;
        let lastX = -100;
        points.forEach((p, i) => {
            const d = new Date(p.time);
            const m = d.getMonth();
            const x = getX(i);
            // Only add label if it's a new month AND there's enough room (45px)
            if (m !== prevM && (x - lastX) > 45) {
                labels.push({ x, text: d.toLocaleDateString('en-US', { month: 'short' }) });
                prevM = m;
                lastX = x;
            }
        });
        return labels;
    };

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

    if (!data || points.length < 2) return <div className="bg-[#0b0e14] animate-pulse rounded-md" style={{ height }} />;

    const last = points[points.length - 1];
    const prevC = points[points.length - 2]?.close || points[0].close;
    const change = last.close - prevC;
    const changePct = (change / (prevC || 1)) * 100;

    const colorUp = '#00c805'; // Vibrant Finviz Green
    const colorDown = '#ff2e2e'; // Sharp Finviz Red (updated from #ff2e35)
    const colorSma50 = '#f8d347'; // Premium SMA50 Yellow
    const colorSma200 = '#9d27b0'; // Premium SMA200 Purple

    // Normal Candle Gap (0.82 factor for clean separation)
    const candleWidth = Math.max(1.8, (chartW / points.length) * 0.82);

    return (
        <div ref={containerRef} className="bg-[#0b0e14] text-white border border-[#23272d] rounded-md flex flex-col font-sans relative select-none hover:border-[#444] shadow-lg group overflow-hidden" style={{ height }}>
            {/* Legend */}
            <div className="absolute top-1.5 left-3 right-2 flex justify-between items-start pointer-events-none z-10">
                <div className="flex flex-col">
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-[16px] font-black tracking-tight text-white uppercase">
                            {/^\d+$/.test(cleaned) ? (name || symbol) : cleaned}
                        </span>
                    </div>
                    <div className="flex flex-col text-[9px] font-black leading-tight -mt-0.5">
                        <span style={{ color: colorSma50 }}>SMA 50</span>
                        <span style={{ color: colorSma200 }}>SMA 200</span>
                    </div>
                </div>
                <div className="flex flex-col items-end leading-none">
                    <span className="text-gray-800 text-[8px] font-black tracking-widest opacity-30">© FINVIZ.COM</span>
                    <span className="text-[12px] font-black italic mt-1" style={{ color: change >= 0 ? colorUp : colorDown }}>
                        {change >= 0 ? '+' : ''}{change.toFixed(2)} ({Math.abs(changePct).toFixed(2)}%)
                    </span>
                </div>
            </div>

            {/* Ultra-Mini Controls */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-row gap-px z-30 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-md border border-white/10 rounded px-0.5 py-0.5">
                <button onClick={() => setZoomDays(prev => Math.max(20, Math.round(prev * 0.7)))} className="p-0.5 hover:bg-white/10 rounded"><ZoomIn size={10} /></button>
                <button onClick={() => setZoomDays(prev => Math.min(data.totalPoints, Math.round(prev * 1.4)))} className="p-0.5 hover:bg-white/10 rounded ml-1"><ZoomOut size={10} /></button>
                <button onClick={() => setZoomDays(190)} className="p-0.5 hover:bg-white/10 rounded ml-1"><Maximize2 size={10} /></button>
            </div>

            <div
                ref={chartAreaRef}
                className="flex-1 relative cursor-crosshair mt-2"
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

                    {maxV > 0 && points.map((p, i) => {
                        const vh = (p.volume / maxV) * volH;
                        const color = p.close >= (i > 0 ? points[i - 1].close : p.close) ? colorUp : colorDown;
                        return <rect key={i} x={getX(i) - candleWidth / 2} y={H - paddingBottom - vh} width={candleWidth} height={vh} fill={color} opacity="0.3" />;
                    })}

                    {renderLine(sma200, colorSma200)}
                    {renderLine(sma50, colorSma50)}

                    {/* NORMAL CANDLES */}
                    {points.map((p, i) => {
                        const x = getX(i), openY = getY(p.open), closeY = getY(p.close), highY = getY(p.high), lowY = getY(p.low);
                        const prevClose = i > 0 ? points[i - 1].close : p.close;
                        const color = p.close >= prevClose ? colorUp : colorDown;
                        const isHollow = p.close >= p.open;
                        const top = Math.min(openY, closeY), bodyH = Math.max(1, Math.abs(openY - closeY));

                        return (
                            <g key={i}>
                                <line x1={x} y1={highY} x2={x} y2={lowY} stroke={color} strokeWidth="1" />
                                <rect
                                    x={x - candleWidth / 2}
                                    y={top}
                                    width={candleWidth}
                                    height={bodyH}
                                    fill={isHollow ? '#0b0e14' : color}
                                    stroke={isHollow ? color : 'none'}
                                    strokeWidth={isHollow ? 1 : 0}
                                />
                            </g>
                        );
                    })}

                    <g transform={`translate(${W - paddingX + 5}, 0)`}>
                        {[0, 0.25, 0.5, 0.75, 1].map(v => <text key={v} y={paddingTop + chartH * v + 3} fill="#555" fontSize="10" fontWeight="bold" fontFamily="monospace">{(maxP - (maxP - minP) * v).toFixed(1)}</text>)}
                    </g>
                    {getMonthsLabel().map((m, i) => <text key={i} x={m.x} y={H - 8} fill="#444" fontSize="10" fontWeight="black" textAnchor="middle">{m.text.toUpperCase()}</text>)}
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
    );
};

export default FinvizChart;

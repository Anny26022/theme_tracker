import React, { useMemo, useRef, useCallback, useEffect, useState } from 'react';

const COLORS = [
    '#3b82f6', // blue
    '#f97316', // orange
    '#eab308', // gold (replaces too-light cream)
    '#ec4899', // pink
    '#10b981', // green
    '#8b5cf6', // violet
    '#06b6d4', // cyan
];

const TooltipCompanyLogo = React.memo(({ symbol }) => {
    const [imgError, setImgError] = useState(false);

    React.useEffect(() => {
        setImgError(false);
    }, [symbol]);

    if (imgError) {
        return (
            <div className="w-4 h-4 rounded-[3px] bg-[var(--ui-divider)]/40 border border-[var(--ui-divider)]/60 flex items-center justify-center flex-shrink-0">
                <span className="text-[7px] font-bold text-[var(--text-muted)] uppercase">
                    {symbol?.charAt(0) || '?'}
                </span>
            </div>
        );
    }

    return (
        <img
            src={`https://images.dhan.co/symbol/${symbol}.png`}
            alt=""
            className="w-4 h-4 object-contain flex-shrink-0"
            onError={() => setImgError(true)}
        />
    );
});

/**
 * Binary Search for high-frequency time-series indexing.
 * Complexity: O(log n) vs previous O(n)
 */
function findClosestIndex(points, targetX) {
    if (!points || points.length === 0) return null;
    let low = 0;
    let high = points.length - 1;

    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (targetX < points[mid].time) {
            high = mid;
        } else {
            low = mid + 1;
        }
    }

    // Adjust to find the truly closest point after binary splitting
    if (low > 0 && Math.abs(points[low].time - targetX) > Math.abs(points[low - 1].time - targetX)) {
        return low - 1;
    }
    return low;
}

/**
 * Nexus High-Fidelity Comparison Chart - High Perf Edition
 * Optimizations: Binary Search, Path Memoization, RAF Batching
 */
export const ComparisonChart = ({ data, symbols, labels = new Map(), interval, height = 400 }) => {
    const containerRef = useRef(null);
    const hoverIndexRef = useRef(null);
    const rafRef = useRef(null);
    const tooltipRef = useRef(null);
    const tooltipTimeRef = useRef(null);
    const rowRefs = useRef(new Map());
    const lineRef = useRef(null);
    const dotRefs = useRef(new Map());

    // 1. Process all available series
    const seriesList = useMemo(() => {
        return symbols.map((sym, idx) => {
            const points = data.get(sym) || [];
            return {
                symbol: sym,
                color: COLORS[idx % COLORS.length],
                points
            };
        }).filter(s => s.points.length > 0);
    }, [data, symbols]);

    // 2. Determine global bounds
    const bounds = useMemo(() => {
        if (seriesList.length === 0) return null;

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        seriesList.forEach(s => {
            s.points.forEach(p => {
                if (p.time < minX) minX = p.time;
                if (p.time > maxX) maxX = p.time;
                if (p.value < minY) minY = p.value;
                if (p.value > maxY) maxY = p.value;
            });
        });

        const range = maxY - minY;
        const padding = range === 0 ? 1 : range * 0.15;

        return {
            minX, maxX,
            minY: minY - padding,
            maxY: maxY + padding
        };
    }, [seriesList]);

    const { minX, maxX, minY, maxY } = bounds || { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    const width = 1000;

    const getX = useCallback((time) => maxX === minX ? 0 : ((time - minX) / (maxX - minX)) * width, [minX, maxX]);
    const getY = useCallback((val) => maxY === minY ? height / 2 : height - ((val - minY) / (maxY - minY)) * height, [minY, maxY, height]);

    // 3. Pre-calculate SVG Paths (Critical Optimization)
    const memoizedPaths = useMemo(() => {
        return seriesList.map(s => {
            return s.points.map((p, i) =>
                `${i === 0 ? 'M' : 'L'} ${getX(p.time)} ${getY(p.value)}`
            ).join(' ');
        });
    }, [seriesList, getX, getY]);

    const gridY = useMemo(() => ([
        { id: 'min', value: minY },
        { id: 'mid', value: (minY + maxY) / 2 },
        { id: 'max', value: maxY }
    ]), [minY, maxY]);

    const formatTime = useCallback((ts) => {
        const d = new Date(ts);
        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    }, []);

    const timeLabels = useMemo(() => {
        if (!minX || !maxX) return [];
        return [
            { pos: 0, label: formatTime(minX) },
            { pos: 0.5, label: formatTime(minX + (maxX - minX) / 2) },
            { pos: 1, label: formatTime(maxX) }
        ];
    }, [minX, maxX]);

    const setRowRef = useCallback((symbol) => (node) => {
        if (node) {
            rowRefs.current.set(symbol, node);
        } else {
            rowRefs.current.delete(symbol);
        }
    }, []);

    const setDotRef = useCallback((symbol) => (node) => {
        if (node) {
            dotRefs.current.set(symbol, node);
        } else {
            dotRefs.current.delete(symbol);
        }
    }, []);

    const clearHover = useCallback(() => {
        hoverIndexRef.current = null;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (tooltipRef.current) {
            tooltipRef.current.style.opacity = '0';
            tooltipRef.current.style.pointerEvents = 'none';
        }
        if (lineRef.current) {
            lineRef.current.style.opacity = '0';
        }
        dotRefs.current.forEach((dot) => {
            dot.setAttribute('opacity', '0');
        });
    }, []);

    const updateHover = useCallback((closest) => {
        if (seriesList.length === 0) return;
        const basePoint = seriesList[0]?.points?.[closest];
        if (!basePoint) {
            clearHover();
            return;
        }

        const x = getX(basePoint.time);
        const leftPct = (x / width) * 100;

        if (lineRef.current) {
            lineRef.current.setAttribute('x1', `${x}`);
            lineRef.current.setAttribute('x2', `${x}`);
            lineRef.current.style.opacity = '0.4';
        }

        if (tooltipRef.current) {
            tooltipRef.current.style.left = `${leftPct}%`;
            tooltipRef.current.style.opacity = '1';
            tooltipRef.current.style.pointerEvents = 'auto';
        }

        if (tooltipTimeRef.current) {
            tooltipTimeRef.current.textContent = formatTime(basePoint.time);
        }

        const ranked = seriesList
            .map((s) => {
                const point = s.points[closest] || s.points[s.points.length - 1];
                return point ? { symbol: s.symbol, value: point.value, point } : null;
            })
            .filter(Boolean)
            .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));

        ranked.forEach((item, order) => {
            const rowEl = rowRefs.current.get(item.symbol);
            if (rowEl) {
                rowEl.style.order = String(order);
                const valueEl = rowEl.querySelector('[data-role="value"]');
                if (valueEl) {
                    const val = item.value ?? 0;
                    valueEl.textContent = `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
                    valueEl.style.color = val >= 0 ? '#10b981' : '#f43f5e';
                }
            }

            const dot = dotRefs.current.get(item.symbol);
            if (dot) {
                dot.setAttribute('cx', `${getX(item.point.time)}`);
                dot.setAttribute('cy', `${getY(item.point.value)}`);
                dot.setAttribute('opacity', '1');
            }
        });

        const activeSymbols = new Set(ranked.map((item) => item.symbol));
        dotRefs.current.forEach((dot, symbol) => {
            if (!activeSymbols.has(symbol)) {
                dot.setAttribute('opacity', '0');
            }
        });
    }, [clearHover, formatTime, getX, getY, seriesList]);

    const handleMouseMove = useCallback((e) => {
        if (!containerRef.current || seriesList.length === 0) return;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        rafRef.current = requestAnimationFrame(() => {
            const rect = containerRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const pct = Math.max(0, Math.min(1, x / rect.width));
            const targetTime = minX + pct * (maxX - minX);
            const closest = findClosestIndex(seriesList[0].points, targetTime);

            if (closest === hoverIndexRef.current) return;
            hoverIndexRef.current = closest;
            updateHover(closest);
        });
    }, [seriesList, minX, maxX, updateHover]);

    useEffect(() => () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }, []);

    if (!bounds || seriesList.length === 0) {
        return (
            <div className="w-full border border-[var(--ui-divider)] rounded-lg flex flex-col items-center justify-center gap-3 text-[var(--text-muted)] group transition-all" style={{ height }}>
                <div className="w-8 h-[1px] bg-[var(--accent-primary)]/30 group-hover:w-16 transition-all duration-500" />
                <span className="text-[9px] font-bold tracking-[0.3em] uppercase opacity-40">
                    Search & Select Standard Indices or Thematic Clusters to Compare
                </span>
                <div className="w-8 h-[1px] bg-[var(--accent-primary)]/30 group-hover:w-16 transition-all duration-500" />
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="relative w-full"
            style={{ height }}
            onMouseMove={handleMouseMove}
            onMouseLeave={clearHover}
        >
            {/* Liquid Tooltip */}
            <div
                ref={tooltipRef}
                className="absolute z-40 pointer-events-none glass-card p-3 border border-[var(--accent-primary)]/40 shadow-2xl flex flex-col gap-2 min-w-[240px] bg-[var(--bg-main)]/95 backdrop-blur-3xl"
                style={{
                    left: '0%',
                    top: '0%',
                    transform: 'translateX(-50%) translateY(0px)',
                    maxHeight: '400px',
                    opacity: 0
                }}
            >
                <div className="flex items-center justify-between gap-4 border-b border-[var(--ui-divider)] pb-1.5 mb-1 shrink-0">
                    <span className="text-[7px] font-bold text-[var(--accent-primary)] uppercase tracking-widest">Momentum Scan</span>
                    <span ref={tooltipTimeRef} className="text-[7px] font-mono text-[var(--text-muted)]">—</span>
                </div>
                <div className="flex flex-col gap-2 overflow-y-auto pr-1">
                    {seriesList.map((s) => (
                        <div
                            key={s.symbol}
                            ref={setRowRef(s.symbol)}
                            className="flex items-center justify-between gap-6"
                            style={{ order: 0 }}
                        >
                            <div className="flex items-center gap-2">
                                <TooltipCompanyLogo symbol={s.symbol} />
                                <div className="w-[1px] h-3.5 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: s.color, color: s.color }} />
                                <span className="text-[9px] font-bold tracking-tight text-[var(--text-main)] uppercase truncate max-w-[140px]">
                                    {labels.get(s.symbol) || s.symbol}
                                </span>
                            </div>
                            <span data-role="value" className="text-[9px] font-bold tabular-nums text-[var(--text-muted)]">—</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Price Y-Axis */}
            <div className="absolute left-0 top-0 h-full flex flex-col justify-between pointer-events-none z-10 py-6 md:py-10">
                {gridY.slice().reverse().map((entry) => (
                    <span key={`y-axis-${entry.id}`} className="text-[7.5px] font-mono text-[var(--text-muted)] ml-2 bg-[var(--bg-main)]/80 px-2 py-0.5 backdrop-blur-xl border border-white/5 rounded-sm shadow-2xl">
                        {entry.value > 0 ? '+' : ''}{entry.value.toFixed(1)}%
                    </span>
                ))}
            </div>

            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-full overflow-visible cursor-crosshair"
                preserveAspectRatio="none"
            >


                {/* Base Grid Lines */}
                <line x1="0" y1={getY(0)} x2={width} y2={getY(0)} stroke="var(--ui-divider)" strokeWidth="1" strokeDasharray="6 6" opacity="0.3" />
                {gridY.map((entry) => (
                    <line key={`grid-line-${entry.id}`} x1="0" y1={getY(entry.value)} x2={width} y2={getY(entry.value)} stroke="var(--ui-divider)" strokeWidth="0.5" opacity="0.05" />
                ))}

                {/* Highly Optimized Path Rendering */}
                {seriesList.map((s, idx) => {
                    const lastPoint = s.points[s.points.length - 1];

                    return (
                        <g key={s.symbol}>
                            <path
                                d={memoizedPaths[idx]}
                                fill="none"
                                stroke={s.color}
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <circle cx={getX(lastPoint.time)} cy={getY(lastPoint.value)} r="4" fill={s.color} opacity="0.4" />
                            <circle cx={getX(lastPoint.time)} cy={getY(lastPoint.value)} r="2.5" fill={s.color} />
                        </g>
                    );
                })}
            </svg>

            {/* Hover Layer (refs only, no React state updates on move) */}
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
                preserveAspectRatio="none"
            >
                <line
                    ref={lineRef}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2={height}
                    stroke="var(--accent-primary)"
                    strokeWidth="0.5"
                    strokeDasharray="4 4"
                    style={{ opacity: 0 }}
                />
                {seriesList.map((s) => (
                    <circle
                        key={`hover-dot-${s.symbol}`}
                        ref={setDotRef(s.symbol)}
                        cx="0"
                        cy="0"
                        r="4.5"
                        fill={s.color}
                        stroke="white"
                        strokeWidth="1.5"
                        opacity="0"
                        className=""
                    />
                ))}
            </svg>

            {/* X-Axis Real-Time Labels — Positioned inside for edge protection */}
            <div className="absolute bottom-2 left-0 w-full px-2 md:px-6 pointer-events-none z-10 flex justify-between opacity-50">
                {timeLabels.map((t) => (
                    <div
                        key={`x-label-${t.pos}`}
                        className="flex flex-col items-center bg-[var(--bg-main)]/70 px-2 py-0.5 backdrop-blur-md rounded border border-white/5 shadow-xl"
                        style={{
                            position: 'absolute',
                            left: `${t.pos * 100}%`,
                            transform: t.pos === 0 ? 'translateX(0%)' : t.pos === 1 ? 'translateX(-100%)' : 'translateX(-50%)'
                        }}
                    >
                        <span className="text-[7.5px] font-mono tracking-tighter whitespace-nowrap uppercase">{t.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export { COLORS };

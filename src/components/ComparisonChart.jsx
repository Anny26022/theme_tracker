import React, { useMemo, useState, useRef, useCallback } from 'react';
import { m } from 'framer-motion';

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
    const [hoverIndex, setHoverIndex] = useState(null);
    const svgRef = useRef(null);
    const rafRef = useRef(null);

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

    const formatTime = (ts) => {
        const d = new Date(ts);
        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const timeLabels = useMemo(() => {
        if (!minX || !maxX) return [];
        return [
            { pos: 0, label: formatTime(minX) },
            { pos: 0.5, label: formatTime(minX + (maxX - minX) / 2) },
            { pos: 1, label: formatTime(maxX) }
        ];
    }, [minX, maxX]);

    const handleMouseMove = useCallback((e) => {
        if (!svgRef.current || seriesList.length === 0) return;

        // Use requestAnimationFrame for smooth UI updates
        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        rafRef.current = requestAnimationFrame(() => {
            const rect = svgRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const pct = Math.max(0, Math.min(1, x / rect.width));

            const targetTime = minX + pct * (maxX - minX);
            const closest = findClosestIndex(seriesList[0].points, targetTime);

            if (closest !== hoverIndex) {
                setHoverIndex(closest);
            }
        });
    }, [seriesList, minX, maxX, hoverIndex]);

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
            ref={svgRef}
            className="relative w-full"
            style={{ height }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIndex(null)}
        >
            {/* Liquid Tooltip */}
            {hoverIndex !== null && seriesList.length > 0 && seriesList[0].points[hoverIndex] && (
                <div
                    className="absolute z-40 pointer-events-auto glass-card p-3 border border-[var(--accent-primary)]/40 shadow-2xl flex flex-col gap-2 min-w-[240px] bg-[var(--bg-main)]/95 backdrop-blur-3xl transition-all duration-75 ease-out"
                    style={{
                        left: `${(getX(seriesList[0].points[hoverIndex].time) / width) * 100}%`,
                        top: '0%',
                        transform: 'translateX(-50%) translateY(0px)',
                        maxHeight: '400px'
                    }}
                >
                    <div className="flex items-center justify-between gap-4 border-b border-[var(--ui-divider)] pb-1.5 mb-1 shrink-0">
                        <span className="text-[7px] font-bold text-[var(--accent-primary)] uppercase tracking-widest">Momentum Scan</span>
                        <span className="text-[7px] font-mono text-[var(--text-muted)]">{formatTime(seriesList[0].points[hoverIndex].time)}</span>
                    </div>
                    <div className="space-y-2 overflow-y-auto pr-1">
                        {seriesList
                            .map(s => ({
                                ...s,
                                currentPoint: s.points[hoverIndex] || s.points[s.points.length - 1]
                            }))
                            .filter(s => s.currentPoint)
                            .sort((a, b) => b.currentPoint.value - a.currentPoint.value)
                            .map((s) => {
                                const isPositive = s.currentPoint.value >= 0;
                                return (
                                    <div key={s.symbol} className="flex items-center justify-between gap-6">
                                        <div className="flex items-center gap-2">
                                            <TooltipCompanyLogo symbol={s.symbol} />
                                            <div className="w-[1px] h-3.5 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: s.color, color: s.color }} />
                                            <span className="text-[9px] font-bold tracking-tight text-[var(--text-main)] uppercase truncate max-w-[140px]">
                                                {labels.get(s.symbol) || s.symbol}
                                            </span>
                                        </div>
                                        <span className={`text-[9px] font-bold tabular-nums ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            {isPositive ? '+' : ''}{s.currentPoint.value.toFixed(2)}%
                                        </span>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}

            {/* Price Y-Axis */}
            <div className="absolute left-0 top-0 h-full flex flex-col justify-between pointer-events-none z-10 py-2">
                {gridY.slice().reverse().map((entry) => (
                    <span key={`y-axis-${entry.id}`} className="text-[8px] font-mono text-[var(--text-muted)] translate-x-[-110%] bg-[var(--bg-main)]/50 px-1">
                        {entry.value > 0 ? '+' : ''}{entry.value.toFixed(1)}%
                    </span>
                ))}
            </div>

            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-full overflow-visible cursor-crosshair"
                preserveAspectRatio="none"
            >
                <defs>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>

                {/* Vertical Cursor Beam */}
                {hoverIndex !== null && seriesList.length > 0 && seriesList[0].points[hoverIndex] && (
                    <line
                        x1={getX(seriesList[0].points[hoverIndex].time)} y1="0"
                        x2={getX(seriesList[0].points[hoverIndex].time)} y2={height}
                        stroke="var(--accent-primary)" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.4"
                    />
                )}

                {/* Base Grid Lines */}
                <line x1="0" y1={getY(0)} x2={width} y2={getY(0)} stroke="var(--ui-divider)" strokeWidth="1" strokeDasharray="6 6" opacity="0.3" />
                {gridY.map((entry) => (
                    <line key={`grid-line-${entry.id}`} x1="0" y1={getY(entry.value)} x2={width} y2={getY(entry.value)} stroke="var(--ui-divider)" strokeWidth="0.5" opacity="0.05" />
                ))}

                {/* Highly Optimized Path Rendering */}
                {seriesList.map((s, idx) => {
                    const hoverPoint = hoverIndex !== null ? (s.points[hoverIndex] || s.points[s.points.length - 1]) : null;
                    const lastPoint = s.points[s.points.length - 1];

                    return (
                        <g key={s.symbol}>
                            <m.path
                                initial={{ pathLength: 0, opacity: 0 }}
                                animate={{ pathLength: 1, opacity: 1 }}
                                transition={{ duration: 1.2, delay: idx * 0.08, ease: "easeInOut" }}
                                d={memoizedPaths[idx]}
                                fill="none"
                                stroke={s.color}
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="drop-shadow-[0_0_12px_rgba(0,0,0,0.5)]"
                                opacity={hoverIndex === null ? 1 : 0.7}
                            />

                            {/* Static Terminal Points */}
                            <circle cx={getX(lastPoint.time)} cy={getY(lastPoint.value)} r="4" fill={s.color} className="animate-pulse" opacity="0.4" />
                            <circle cx={getX(lastPoint.time)} cy={getY(lastPoint.value)} r="2.5" fill={s.color} />

                            {/* High-Performance Active Dot */}
                            {hoverPoint && (
                                <circle
                                    cx={getX(hoverPoint.time)}
                                    cy={getY(hoverPoint.value)}
                                    r="4.5"
                                    fill={s.color}
                                    stroke="white"
                                    strokeWidth="1.5"
                                    className="filter drop-shadow-[0_0_8px_white]"
                                />
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* X-Axis Real-Time Labels */}
            <div className="absolute bottom-0 left-0 w-full flex justify-between translate-y-full pt-4 px-2 opacity-50">
                {timeLabels.map((t) => (
                    <div
                        key={`x-label-${t.pos}`}
                        className="flex flex-col items-center"
                        style={{
                            position: 'absolute',
                            left: `${t.pos * 100}%`,
                            transform: t.pos === 0 ? 'none' : t.pos === 1 ? 'translateX(-100%)' : 'translateX(-50%)'
                        }}
                    >
                        <div className="w-[1px] h-1.5 bg-[var(--ui-divider)] mb-1" />
                        <span className="text-[8px] font-mono tracking-tighter whitespace-nowrap uppercase">{t.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export { COLORS };

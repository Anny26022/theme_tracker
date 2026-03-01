import React, { useState, useCallback, useRef, useEffect } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';

const EMPTY_ITEMS = [];

export const TrackerRow = ({ name, count, perf, leaders = EMPTY_ITEMS, laggards = EMPTY_ITEMS, breadth, onClick, loading }) => {
    const [tooltipOpen, setTooltipOpen] = useState(false);
    const [pos, setPos] = useState(null);
    const rowRef = useRef(null);

    const hasTooltip = (leaders && leaders.length > 0) || (laggards && laggards.length > 0) || !!breadth;
    const hasData = perf !== null && perf !== undefined;
    const isPos = hasData && perf > 0;
    const barWidth = hasData ? Math.min(Math.abs(perf) * 2, 50) : 0;

    const handleMouseEnter = useCallback(() => {
        if (!hasTooltip || !rowRef.current) return;
        const rect = rowRef.current.getBoundingClientRect();
        setPos({ top: rect.top, left: rect.left + 180 });
        setTooltipOpen(true);
    }, [hasTooltip]);

    const handleMouseLeave = useCallback(() => {
        setTooltipOpen(false);
    }, []);

    // Close on scroll
    useEffect(() => {
        if (!tooltipOpen) return;
        const close = () => setTooltipOpen(false);
        window.addEventListener('scroll', close, { capture: true, passive: true });
        return () => window.removeEventListener('scroll', close, { capture: true, passive: true });
    }, [tooltipOpen]);

    return (
        <div
            className="relative group/wrapper"
            ref={rowRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <button
                type="button"
                onClick={onClick}
                className={cn(
                    "group/row w-full text-left bg-transparent border-0 flex items-center justify-between py-3 border-b border-[var(--ui-divider)] transition-all px-2 md:px-4 cursor-pointer hover:bg-[var(--accent-primary)]/[0.03] relative",
                    tooltipOpen && "bg-[var(--accent-primary)]/[0.05] border-b-[var(--accent-primary)]/30"
                )}
            >
                <div className="w-[42%] md:w-5/12 min-w-0 relative">
                    <div className="flex items-center gap-2 md:gap-4 min-w-0">
                        <div className={cn(
                            "w-1 h-1 md:w-1.5 md:h-1.5 rounded-full transition-all duration-300 shrink-0",
                            tooltipOpen ? "bg-[var(--accent-primary)] shadow-[0_0_10px_var(--accent-primary)] scale-125" : "bg-[var(--ui-muted)] group-hover/row:bg-[var(--accent-primary)]/50"
                        )} />
                        <div className="flex items-baseline gap-1 md:gap-1.5 min-w-0">
                            <span className={cn(
                                "text-[10.5px] md:text-[12px] font-bold uppercase tracking-[0.15em] md:tracking-[0.2em] truncate transition-all duration-300",
                                tooltipOpen ? "text-[var(--accent-primary)]" : "text-[var(--text-muted)] group-hover/row:text-[var(--text-main)]"
                            )}>
                                {name}
                            </span>
                            {count !== undefined && (
                                <span className="text-[7.5px] md:text-[8.5px] font-mono opacity-40 shrink-0 tracking-tighter">({count})</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-1 px-2 md:px-12 relative h-4 flex items-center">
                    <div className="absolute left-1/2 w-[1px] h-4 bg-[var(--ui-divider)] -translate-x-1/2 opacity-20" />
                    <div className="w-full h-[3px] md:h-[5px] bg-[var(--ui-divider)]/40 rounded-full overflow-hidden relative">
                        {loading ? (
                            <div className="h-full w-24 bg-[var(--accent-primary)]/20 rounded-full animate-marquee absolute" />
                        ) : hasData ? (
                            <m.div
                                initial={{ width: 0 }}
                                animate={{ width: `${barWidth}%` }}
                                transition={{ duration: 0.8, ease: "circOut" }}
                                className={cn(
                                    "h-full rounded-full absolute will-change-transform shadow-[0_0_10px_currentColor]",
                                    isPos ? "left-1/2 bg-[var(--accent-primary)]" : "right-1/2 bg-rose-500",
                                    !tooltipOpen && "opacity-60 group-hover/row:opacity-100"
                                )}
                            />
                        ) : null}
                    </div>
                </div>

                <div className="w-16 md:w-24 text-right shrink-0">
                    {loading ? (
                        <div className="h-2 w-10 md:h-3 md:w-14 bg-[var(--ui-divider)] rounded animate-pulse ml-auto opacity-30" />
                    ) : hasData ? (
                        <span className={cn(
                            "text-[11.5px] md:text-[13px] font-bold tabular-nums tracking-[0.05em] md:tracking-[0.1em] transition-colors",
                            isPos ? "text-[var(--accent-primary)]" : "text-rose-500",
                            !tooltipOpen && "opacity-80 group-hover/row:opacity-100"
                        )}>
                            {isPos ? '+' : ''}{perf.toFixed(1)}%
                        </span>
                    ) : (
                        <span className="text-[9px] md:text-[10px] text-[var(--text-muted)] tracking-widest opacity-30">—</span>
                    )}
                </div>
            </button>

            {/* Tooltip via portal — escapes Virtuoso overflow clip, positioned at row's top-right */}
            {hasTooltip && createPortal(
                <AnimatePresence>
                    {tooltipOpen && pos && (
                        <m.div
                            key="row-tooltip"
                            initial={{ opacity: 0, y: 6, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.97 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
                            className="fixed z-[200] pointer-events-none"
                            style={{ top: pos.top, left: pos.left }}
                        >
                            <div className="glass-card p-4 border border-[var(--accent-primary)]/15 shadow-[0_20px_50px_rgba(0,0,0,0.6)] bg-[var(--bg-main)]/97 backdrop-blur-3xl flex flex-col gap-5 min-w-[320px] max-w-[520px]">
                                <div className="flex flex-row gap-6">
                                    {leaders.length > 0 && (
                                        <div className="flex-1 space-y-3">
                                            <div className="flex items-center gap-2 border-b border-emerald-500/20 pb-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
                                                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.2em]">Alpha Leaders</span>
                                            </div>
                                            <div className="space-y-1.5">
                                                {leaders.map((l) => (
                                                    <div key={l.symbol} className="flex items-center justify-between gap-3">
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-[11px] font-bold text-[var(--text-main)] truncate uppercase tracking-wider">{l.name}</span>
                                                            <span className="text-[8px] text-[var(--text-muted)] font-mono opacity-50">{l.symbol}</span>
                                                        </div>
                                                        <span className={cn(
                                                            "text-[11px] font-bold tabular-nums shrink-0",
                                                            l.perf > 0 ? "text-emerald-500" : l.perf < 0 ? "text-rose-500" : "text-[var(--text-main)]"
                                                        )}>
                                                            {l.perf > 0 ? '+' : ''}{l.perf.toFixed(1)}%
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {leaders.length > 0 && laggards.length > 0 && (
                                        <div className="w-[1px] bg-[var(--ui-divider)] self-stretch opacity-20" />
                                    )}

                                    {laggards.length > 0 && (
                                        <div className="flex-1 space-y-3">
                                            <div className="flex items-center gap-2 border-b border-rose-500/20 pb-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e]" />
                                                <span className="text-[10px] font-bold text-rose-400 uppercase tracking-[0.2em]">Bottom Laggards</span>
                                            </div>
                                            <div className="space-y-1.5">
                                                {laggards.map((l) => (
                                                    <div key={l.symbol} className="flex items-center justify-between gap-3">
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-[11px] font-bold text-[var(--text-main)] truncate uppercase tracking-wider">{l.name}</span>
                                                            <span className="text-[8px] text-[var(--text-muted)] font-mono opacity-50">{l.symbol}</span>
                                                        </div>
                                                        <span className="text-[11px] font-bold text-rose-500 tabular-nums shrink-0">
                                                            {l.perf.toFixed(1)}%
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {breadth && (
                                    <div className="border-t border-[var(--ui-divider)] pt-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[9px] font-bold text-[var(--accent-primary)] uppercase tracking-[0.2em]">Technical Breadth (EMA)</span>
                                            <span className="text-[8px] text-[var(--text-muted)] opacity-50 tabular-nums">{breadth.validCount}/{breadth.total} stocks</span>
                                        </div>
                                        <div className="grid grid-cols-5 gap-1.5">
                                            {[
                                                { label: 'Above 10 EMA', val: breadth.above10EMA },
                                                { label: 'Above 21 EMA', val: breadth.above21EMA },
                                                { label: 'Above 50 EMA', val: breadth.above50EMA },
                                                { label: 'Above 150 EMA', val: breadth.above150EMA },
                                                { label: 'Above 200 EMA', val: breadth.above200EMA }
                                            ].map(ma => {
                                                const count = breadth.validCount > 0 ? Math.round((ma.val / 100) * breadth.validCount) : 0;
                                                return (
                                                    <div key={ma.label} className="bg-white/[0.02] border border-white/[0.05] p-1.5 rounded flex flex-col items-center gap-1 min-w-0">
                                                        <span className="text-[6px] text-[var(--text-muted)] font-bold uppercase tracking-wider truncate w-full text-center">{ma.label}</span>
                                                        <span className={cn(
                                                            "text-[10px] font-bold font-mono tracking-tight",
                                                            ma.val > 70 ? "text-emerald-500" : ma.val > 40 ? "text-amber-500" : "text-rose-500"
                                                        )}>
                                                            {Math.round(ma.val)}%
                                                        </span>
                                                        <span className="text-[7px] text-[var(--text-muted)] opacity-40 tabular-nums">{count}/{breadth.validCount}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </m.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};

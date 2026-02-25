import React from 'react';
import { m } from 'framer-motion';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';

const EMPTY_ITEMS = [];

export const TrackerRow = ({ name, perf, leaders = EMPTY_ITEMS, laggards = EMPTY_ITEMS, onClick, loading }) => {
    const TOOLTIP_GAP = 32;
    const TOOLTIP_WIDTH = 320;
    const TOOLTIP_EDGE_MARGIN = 14;
    const TOOLTIP_SAFE_HALF_HEIGHT = 120;
    const hasData = perf !== null && perf !== undefined;
    const isPos = hasData && perf > 0;
    const barWidth = hasData ? Math.min(Math.abs(perf) * 2, 50) : 0;
    const hasTooltip = leaders.length > 0 || laggards.length > 0;
    const [tooltipOpen, setTooltipOpen] = React.useState(false);
    const [tooltipAnchor, setTooltipAnchor] = React.useState(null);

    const updateTooltipAnchor = React.useCallback((target) => {
        const rect = target.getBoundingClientRect();
        setTooltipAnchor({
            left: rect.left,
            right: rect.right,
            top: rect.top,
            height: rect.height
        });
    }, []);

    const handleTooltipEnter = React.useCallback((e) => {
        if (!hasTooltip) return;
        updateTooltipAnchor(e.currentTarget);
        setTooltipOpen(true);
    }, [hasTooltip, updateTooltipAnchor]);

    const handleTooltipMove = React.useCallback((e) => {
        if (!tooltipOpen) return;
        updateTooltipAnchor(e.currentTarget);
    }, [tooltipOpen, updateTooltipAnchor]);

    const handleTooltipLeave = React.useCallback(() => {
        setTooltipOpen(false);
    }, []);

    React.useEffect(() => {
        if (!tooltipOpen) return;

        const closeTooltip = () => setTooltipOpen(false);
        const capturePassive = { capture: true, passive: true };
        window.addEventListener('scroll', closeTooltip, capturePassive);
        window.addEventListener('resize', closeTooltip);

        return () => {
            window.removeEventListener('scroll', closeTooltip, capturePassive);
            window.removeEventListener('resize', closeTooltip);
        };
    }, [tooltipOpen]);

    const tooltipPlacement = React.useMemo(() => {
        if (!tooltipAnchor) return null;
        const rawTop = tooltipAnchor.top + tooltipAnchor.height / 2;
        const minTop = TOOLTIP_EDGE_MARGIN + TOOLTIP_SAFE_HALF_HEIGHT;
        const maxTop = window.innerHeight - TOOLTIP_EDGE_MARGIN - TOOLTIP_SAFE_HALF_HEIGHT;
        const top = Math.max(minTop, Math.min(rawTop, maxTop));
        const placeRight = tooltipAnchor.right + TOOLTIP_GAP + TOOLTIP_WIDTH <= window.innerWidth - 12;

        if (placeRight) {
            return {
                side: 'right',
                style: {
                    left: tooltipAnchor.right + TOOLTIP_GAP,
                    top
                }
            };
        }

        return {
            side: 'left',
            style: {
                left: tooltipAnchor.left - TOOLTIP_GAP,
                top
            }
        };
    }, [tooltipAnchor]);

    const tooltipContent = hasTooltip && tooltipOpen && tooltipPlacement && typeof document !== 'undefined'
        ? createPortal(
            <div
                className="fixed z-[140] pointer-events-none"
                style={{
                    left: tooltipPlacement.style.left,
                    top: tooltipPlacement.style.top,
                    transform: tooltipPlacement.side === 'right' ? 'translateY(-50%)' : 'translate(-100%, -50%)'
                }}
            >
                <div className="relative glass-card p-4 border border-[var(--accent-primary)]/10 shadow-[0_20px_50px_rgba(0,0,0,0.6)] bg-[var(--bg-main)]/95 backdrop-blur-2xl flex flex-col sm:flex-row gap-4 sm:gap-6 min-w-[280px] sm:min-w-[320px] max-w-[90vw]">
                    {leaders.length > 0 && (
                        <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-2 border-b border-emerald-500/20 pb-1.5">
                                <div className="w-1 h-2.5 bg-emerald-500 rounded-full" />
                                <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-[0.2em]">Alpha Leaders (6)</span>
                            </div>
                            <div className="space-y-1.5">
                                {leaders.map((l) => (
                                    <div key={l.symbol} className="flex items-center justify-between gap-4">
                                        <div className="flex flex-col min-w-0 max-w-[100px] sm:max-w-none">
                                            <span className="text-[8px] font-bold text-[var(--text-main)] truncate uppercase tracking-wider">{l.name}</span>
                                            <span className="text-[6px] text-[var(--text-muted)] font-mono">{l.symbol}</span>
                                        </div>
                                        <span className="text-[8px] font-bold text-emerald-500 tabular-nums">
                                            +{l.perf.toFixed(1)}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {leaders.length > 0 && laggards.length > 0 && (
                        <div className="hidden sm:block w-[1px] bg-[var(--ui-divider)] self-stretch" />
                    )}

                    {laggards.length > 0 && (
                        <div className="flex-1 space-y-3 border-t border-[var(--ui-divider)] pt-4 sm:border-t-0 sm:pt-0">
                            <div className="flex items-center gap-2 border-b border-rose-500/20 pb-1.5">
                                <div className="w-1 h-2.5 bg-rose-500 rounded-full" />
                                <span className="text-[8px] font-bold text-rose-400 uppercase tracking-[0.2em]">Bottom Laggards (6)</span>
                            </div>
                            <div className="space-y-1.5">
                                {laggards.map((l) => (
                                    <div key={l.symbol} className="flex items-center justify-between gap-4">
                                        <div className="flex flex-col min-w-0 max-w-[100px] sm:max-w-none">
                                            <span className="text-[8px] font-bold text-[var(--text-main)] truncate uppercase tracking-wider">{l.name}</span>
                                            <span className="text-[6px] text-[var(--text-muted)] font-mono">{l.symbol}</span>
                                        </div>
                                        <span className="text-[8px] font-bold text-rose-500 tabular-nums">
                                            {l.perf.toFixed(1)}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {tooltipPlacement.side === 'right' ? (
                        <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-[var(--bg-main)] border-l border-t border-[var(--ui-divider)]/30 rotate-[-45deg] hidden sm:block" />
                    ) : (
                        <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-[var(--bg-main)] border-r border-b border-[var(--ui-divider)]/30 rotate-[-45deg] hidden sm:block" />
                    )}
                </div>
            </div>,
            document.body
        )
        : null;

    return (
        <>
            <button
                type="button"
                onClick={onClick}
                className="group/row w-full text-left bg-transparent border-0 flex items-center justify-between py-2.5 border-b border-[var(--ui-divider)] transition-all px-1.5 md:px-2 cursor-pointer hover:bg-[var(--glass-border)] relative"
            >
                <div className="w-1/3 md:w-5/12 min-w-0 relative">
                    <div
                        className="flex items-center gap-4 min-w-0"
                        onMouseEnter={handleTooltipEnter}
                        onMouseMove={handleTooltipMove}
                        onMouseLeave={handleTooltipLeave}
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--ui-muted)] group-hover/row:bg-[var(--accent-primary)] transition-colors shrink-0" />
                        <div className="flex flex-col min-w-0">
                            <span className="text-[9px] font-bold text-[var(--text-muted)] group-hover/row:text-[var(--text-main)] uppercase tracking-[0.15em] truncate transition-colors">
                                {name}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex-1 px-4 md:px-8 relative h-4 flex items-center">
                    <div className="absolute left-1/2 w-[1px] h-3 bg-[var(--ui-muted)]/30 -translate-x-1/2" />
                    <div className="w-full h-[4px] bg-[var(--ui-divider)] rounded-full overflow-hidden relative">
                        {loading ? (
                            <div className="h-full w-1/4 bg-[var(--ui-muted)] rounded-full animate-pulse absolute left-1/2 -translate-x-1/2" />
                        ) : hasData ? (
                            <m.div
                                initial={{ width: 0 }}
                                animate={{ width: `${barWidth}%` }}
                                transition={{ duration: 0.6 }}
                                className={cn(
                                    "h-full rounded-full absolute will-change-transform",
                                    isPos ? "left-1/2 bg-[var(--accent-primary)]/40 group-hover/row:bg-[var(--accent-primary)]/60" : "right-1/2 bg-rose-500/40 group-hover/row:bg-rose-500/60"
                                )}
                            />
                        ) : null}
                    </div>
                </div>

                <div className="w-20 text-right shrink-0">
                    {loading ? (
                        <div className="h-2.5 w-12 bg-[var(--ui-divider)] rounded animate-pulse ml-auto" />
                    ) : hasData ? (
                        <span className={cn(
                            "text-[10px] font-bold tabular-nums tracking-[0.2em]",
                            isPos ? "text-[var(--accent-primary)]" : "text-rose-500"
                        )}>
                            {isPos ? '+' : ''}{perf.toFixed(2)}%
                        </span>
                    ) : (
                        <span className="text-[9px] text-[var(--text-muted)] tracking-widest">—</span>
                    )}
                </div>
            </button>
            {tooltipContent}
        </>
    );
};

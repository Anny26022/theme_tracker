import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

export const TrackerRow = ({ name, perf, leaders = [], laggards = [], onClick, loading }) => {
    const [isHovered, setIsHovered] = React.useState(false);
    const hasData = perf !== null && perf !== undefined;
    const isPos = hasData && perf > 0;
    const barWidth = hasData ? Math.min(Math.abs(perf) * 2, 50) : 0;

    return (
        <div
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="group flex items-center justify-between py-2.5 border-b border-[var(--ui-divider)] transition-all px-2 cursor-pointer hover:bg-[var(--glass-border)] relative"
        >
            <div className="flex items-center gap-4 w-5/12 min-w-0">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--ui-muted)] group-hover:bg-[var(--accent-primary)] transition-colors shrink-0" />
                <div className="flex flex-col min-w-0 relative">
                    <span className="text-[9px] font-bold text-[var(--text-muted)] group-hover:text-[var(--text-main)] uppercase tracking-[0.15em] truncate transition-colors">
                        {name}
                    </span>

                    {/* Highly Dynamic Liquid Tooltip (Top 6 Leaders/Laggards) */}
                    <AnimatePresence>
                        {isHovered && (leaders.length > 0 || laggards.length > 0) && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 10, x: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0, x: 30 }}
                                exit={{ opacity: 0, scale: 0.95, y: 10, x: 20 }}
                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                className="absolute left-full top-1/2 -translate-y-1/2 z-[100] pointer-events-none"
                            >
                                <div className="glass-card p-4 border border-[var(--accent-primary)]/10 shadow-[0_20px_50px_rgba(0,0,0,0.6)] bg-[var(--bg-main)]/95 backdrop-blur-2xl flex gap-6 min-w-[320px]">

                                    {/* Leaders Section */}
                                    {leaders.length > 0 && (
                                        <div className="flex-1 space-y-3">
                                            <div className="flex items-center gap-2 border-b border-emerald-500/20 pb-1.5">
                                                <div className="w-1 h-2.5 bg-emerald-500 rounded-full" />
                                                <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-[0.2em]">Alpha Leaders (6)</span>
                                            </div>
                                            <div className="space-y-1.5">
                                                {leaders.map((l, idx) => (
                                                    <div key={l.symbol} className="flex items-center justify-between gap-4 group/item">
                                                        <div className="flex flex-col min-w-0 max-w-[100px]">
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

                                    {/* Vertical Divider */}
                                    {leaders.length > 0 && laggards.length > 0 && (
                                        <div className="w-[1px] bg-[var(--ui-divider)] self-stretch" />
                                    )}

                                    {/* Laggards Section */}
                                    {laggards.length > 0 && (
                                        <div className="flex-1 space-y-3">
                                            <div className="flex items-center gap-2 border-b border-rose-500/20 pb-1.5">
                                                <div className="w-1 h-2.5 bg-rose-500 rounded-full" />
                                                <span className="text-[8px] font-bold text-rose-400 uppercase tracking-[0.2em]">Bottom Laggards (6)</span>
                                            </div>
                                            <div className="space-y-1.5">
                                                {laggards.map((l, idx) => (
                                                    <div key={l.symbol} className="flex items-center justify-between gap-4">
                                                        <div className="flex flex-col min-w-0 max-w-[100px]">
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

                                    {/* Small Pointer */}
                                    <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-[var(--bg-main)] border-l border-t border-[var(--ui-divider)]/30 rotate-[-45deg] -z-1" />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="flex-1 px-8 relative h-4 flex items-center">
                <div className="absolute left-1/2 w-[1px] h-3 bg-[var(--ui-muted)]/30 -translate-x-1/2" />
                <div className="w-full h-[4px] bg-[var(--ui-divider)] rounded-full overflow-hidden relative">
                    {loading ? (
                        <div className="h-full w-1/4 bg-[var(--ui-muted)] rounded-full animate-pulse absolute left-1/2 -translate-x-1/2" />
                    ) : hasData ? (
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${barWidth}%` }}
                            transition={{ duration: 0.6 }}
                            className={cn(
                                "h-full rounded-full absolute",
                                isPos ? "left-1/2 bg-[var(--accent-primary)]/40 group-hover:bg-[var(--accent-primary)]/60" : "right-1/2 bg-rose-500/40 group-hover:bg-rose-500/60"
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
        </div>
    );
};

import React, { useMemo, useState } from 'react';
import { m } from 'framer-motion';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { TrackerRow } from '../components/TrackerRow';
import { useIntervalPerformance } from '../hooks/useIntervalPerformance';
import { ViewWrapper } from '../components/ViewWrapper';
import { Virtuoso } from 'react-virtuoso';

const INTERVALS = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX'];

export const TrackerView = ({ sectors, hierarchy, onSectorClick, onIndustryClick, timeframe, setTimeframe }) => {
    const [sectorSortDesc, setSectorSortDesc] = useState(true);   // true = best first
    const [industrySortDesc, setIndustrySortDesc] = useState(true);

    // Flatten all industries (deduplicated by name)
    const allIndustries = useMemo(() => {
        const seen = new Set();
        const industries = [];
        sectors.forEach(sector => {
            const sectorData = hierarchy[sector] || {};
            Object.keys(sectorData).forEach(ind => {
                if (!seen.has(ind)) {
                    seen.add(ind);
                    industries.push({ name: ind, sector });
                }
            });
        });
        return industries.sort((a, b) => a.name.localeCompare(b.name));
    }, [sectors, hierarchy]);

    const industryNames = useMemo(() => allIndustries.map(i => i.name), [allIndustries]);

    // Real interval performance from Google Finance
    const { perfMap: sectorPerf, loading: sectorLoading } = useIntervalPerformance(
        sectors, hierarchy, timeframe, 'sector'
    );
    const { perfMap: industryPerf, loading: industryLoading } = useIntervalPerformance(
        industryNames, hierarchy, timeframe, 'industry'
    );

    // Sort sectors by performance
    const sortedSectors = useMemo(() => {
        const dir = sectorSortDesc ? -1 : 1;
        return [...sectors].sort((a, b) => dir * ((sectorPerf[a]?.avg || 0) - (sectorPerf[b]?.avg || 0)));
    }, [sectors, sectorPerf, sectorSortDesc]);

    // Sort industries by performance
    const sortedIndustries = useMemo(() => {
        const dir = industrySortDesc ? -1 : 1;
        return [...allIndustries].sort((a, b) => dir * ((industryPerf[a.name]?.avg || 0) - (industryPerf[b.name]?.avg || 0)));
    }, [allIndustries, industryPerf, industrySortDesc]);

    return (
        <ViewWrapper id="tracker">
            <div className="flex items-center justify-between border-b border-[var(--ui-divider)] pb-6">
                <div className="space-y-1">
                    <h2 className="text-xl font-light tracking-[0.5em] uppercase opacity-90 mb-3 text-glow-gold">
                        Performance Tracker
                    </h2>
                    <p className="text-[9px] font-bold leading-relaxed tracking-[0.2em] text-[var(--accent-primary)] uppercase">
                        {sectorLoading || industryLoading ? 'Loading live data...' : 'Real-time Sector & Industry Momentum'}
                    </p>
                </div>
                <div className="flex gap-3 text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex-wrap justify-end">
                    {INTERVALS.map(tf => (
                        <button
                            type="button"
                            key={tf}
                            onClick={() => setTimeframe(tf)}
                            className={`cursor-pointer transition-all uppercase px-1.5 py-0.5 rounded ${timeframe === tf
                                ? "text-[var(--accent-primary)] bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20"
                                : "hover:text-[var(--text-main)]"
                                }`}
                        >
                            {tf}
                        </button>
                    ))}
                </div>
            </div>

            <div className="relative">
                {/* Loading overlay on interval switch */}
                {(sectorLoading || industryLoading) && (
                    <m.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--bg-main)]/60 backdrop-blur-[2px] rounded-lg"
                    >
                        <m.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            className="w-8 h-8 border-2 border-[var(--ui-divider)] border-t-[var(--accent-primary)] rounded-full"
                        />
                        <span className="text-[8px] font-bold tracking-[0.3em] uppercase text-[var(--text-muted)]">
                            Loading {timeframe} data
                        </span>
                    </m.div>
                )}

                <div className={`grid grid-cols-1 lg:grid-cols-2 gap-12 transition-opacity duration-300 ${(sectorLoading || industryLoading) ? 'opacity-30' : 'opacity-100'}`}>
                    <div className="space-y-8">
                        <div className="flex items-center gap-3 border-b border-[var(--ui-divider)] pb-4">
                            <div className="w-1 h-3 bg-[var(--accent-primary)]" />
                            <h2 className="text-[10px] font-bold tracking-[0.4em] uppercase opacity-40">Sector Rankings</h2>
                            <div className="ml-auto flex items-center gap-2">
                                <span className="text-[7px] text-[var(--text-muted)] tracking-wider uppercase">{timeframe}</span>
                                <button
                                    onClick={() => setSectorSortDesc(p => !p)}
                                    className="flex items-center gap-0.5 text-[7px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded border border-[var(--ui-divider)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] transition-all text-[var(--text-muted)]"
                                >
                                    {sectorSortDesc ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowUp className="w-2.5 h-2.5" />}
                                    {sectorSortDesc ? 'Best' : 'Worst'}
                                </button>
                            </div>
                        </div>
                        <div className="space-y-0">
                            <div className="h-[min(70vh,720px)]">
                                <Virtuoso
                                    data={sortedSectors}
                                    computeItemKey={(_, sector) => sector}
                                    increaseViewportBy={300}
                                    itemContent={(_, sector) => (
                                        <TrackerRow
                                            name={sector}
                                            perf={sectorPerf[sector]?.avg ?? null}
                                            leaders={sectorPerf[sector]?.leaders}
                                            laggards={sectorPerf[sector]?.laggards}
                                            onClick={() => onSectorClick(sector)}
                                            loading={sectorLoading && sectorPerf[sector] === undefined}
                                        />
                                    )}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-8">
                        <div className="flex items-center gap-3 border-b border-[var(--ui-divider)] pb-4">
                            <div className="w-1 h-3 bg-[var(--accent-primary)]" />
                            <h2 className="text-[10px] font-bold tracking-[0.4em] uppercase opacity-40">Industry Alpha</h2>
                            <div className="ml-auto flex items-center gap-2">
                                <span className="text-[7px] text-[var(--text-muted)] tracking-wider uppercase">{timeframe}</span>
                                <button
                                    onClick={() => setIndustrySortDesc(p => !p)}
                                    className="flex items-center gap-0.5 text-[7px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded border border-[var(--ui-divider)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] transition-all text-[var(--text-muted)]"
                                >
                                    {industrySortDesc ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowUp className="w-2.5 h-2.5" />}
                                    {industrySortDesc ? 'Best' : 'Worst'}
                                </button>
                            </div>
                        </div>
                        <div className="space-y-0">
                            <div className="h-[min(70vh,720px)]">
                                <Virtuoso
                                    data={sortedIndustries}
                                    computeItemKey={(_, ind) => ind.name}
                                    increaseViewportBy={300}
                                    itemContent={(_, ind) => (
                                        <TrackerRow
                                            name={ind.name.toLowerCase()}
                                            perf={industryPerf[ind.name]?.avg ?? null}
                                            leaders={industryPerf[ind.name]?.leaders}
                                            laggards={industryPerf[ind.name]?.laggards}
                                            onClick={() => onIndustryClick(ind.sector, ind.name)}
                                            loading={industryLoading && industryPerf[ind.name] === undefined}
                                        />
                                    )}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </ViewWrapper>
    );
};

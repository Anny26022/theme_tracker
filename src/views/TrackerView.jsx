import React, { useMemo, useState, useEffect } from 'react';
import { m } from 'framer-motion';
import { ArrowUp, ArrowDown, Activity, Info } from 'lucide-react';
import { TrackerRow } from '../components/TrackerRow';
import { useUnifiedTracker } from '../hooks/useUnifiedTracker';
import { ViewWrapper } from '../components/ViewWrapper';
import { Virtuoso } from 'react-virtuoso';

const INTERVALS = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX'];

const RANGE_TO_EMA = {
    '1D': 'above10EMA',
    '5D': 'above10EMA',
    '1M': 'above21EMA',
    '6M': 'above50EMA',
    'YTD': 'above150EMA',
    '1Y': 'above150EMA',
    '5Y': 'above200EMA',
    'MAX': 'above200EMA'
};

const RANGE_LABEL = {
    '1D': '10 EMA',
    '5D': '10 EMA',
    '1M': '21 EMA',
    '6M': '50 EMA',
    'YTD': '150 EMA',
    '1Y': '150 EMA',
    '5Y': '200 EMA',
    'MAX': '200 EMA'
};

export const TrackerView = ({ sectors, hierarchy, onSectorClick, onIndustryClick, timeframe, setTimeframe, onOpenInsights }) => {
    const [viewMode, setViewMode] = useState('performance'); // 'performance' | 'breadth'
    const [sectorSortDesc, setSectorSortDesc] = useState(true);
    const [industrySortDesc, setIndustrySortDesc] = useState(true);

    const activeEMAKey = RANGE_TO_EMA[timeframe] || 'above200EMA';
    const activeEMALabel = RANGE_LABEL[timeframe] || '200 EMA';

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

    // Unified Data Hook: Fetched 1Y data once and derives both Perf and Breadth
    const { trackerMap: sectorData, loading: sectorLoading } = useUnifiedTracker(
        sectors, hierarchy, timeframe, 'sector'
    );
    const { trackerMap: industryData, loading: industryLoading } = useUnifiedTracker(
        industryNames, hierarchy, timeframe, 'industry'
    );

    // Sorting Logic
    const sortedSectors = useMemo(() => {
        const dir = sectorSortDesc ? -1 : 1;
        if (viewMode === 'breadth') {
            return [...sectors].sort((a, b) => dir * ((sectorData[a]?.breadth?.[activeEMAKey] || 0) - (sectorData[b]?.breadth?.[activeEMAKey] || 0)));
        }
        return [...sectors].sort((a, b) => dir * ((sectorData[a]?.avgPerf || 0) - (sectorData[b]?.avgPerf || 0)));
    }, [sectors, sectorData, viewMode, sectorSortDesc, activeEMAKey]);

    const sortedIndustries = useMemo(() => {
        const dir = industrySortDesc ? -1 : 1;
        if (viewMode === 'breadth') {
            return [...allIndustries].sort((a, b) => dir * ((industryData[a.name]?.breadth?.[activeEMAKey] || 0) - (industryData[b.name]?.breadth?.[activeEMAKey] || 0)));
        }
        return [...allIndustries].sort((a, b) => dir * ((industryData[a.name]?.avgPerf || 0) - (industryData[b.name]?.avgPerf || 0)));
    }, [allIndustries, industryData, viewMode, industrySortDesc, activeEMAKey]);

    const isGlobalLoading = sectorLoading || industryLoading;

    return (
        <ViewWrapper id="tracker">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-[var(--ui-divider)] pb-6">
                <div className="space-y-1">
                    <div className="flex items-center gap-3 mb-3">
                        <h2 className="text-xl font-light tracking-[0.5em] uppercase opacity-90 text-glow-gold">
                            Tracker
                        </h2>
                        <div className="flex bg-[var(--nav-bg)]/80 p-0.5 rounded-lg border border-[var(--ui-divider)]">
                            <button
                                onClick={() => setViewMode('performance')}
                                className={`px-3 py-1 text-[8px] font-bold uppercase tracking-widest rounded transition-all ${viewMode === 'performance' ? 'bg-[var(--accent-primary)] text-[var(--bg-main)] shadow-lg' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                            >
                                Perf
                            </button>
                            <button
                                onClick={() => setViewMode('breadth')}
                                className={`px-3 py-1 text-[8px] font-bold uppercase tracking-widest rounded transition-all ${viewMode === 'breadth' ? 'bg-[var(--accent-primary)] text-[var(--bg-main)] shadow-lg' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                            >
                                Breadth
                            </button>
                        </div>
                    </div>
                    <p className="text-[9px] font-bold leading-relaxed tracking-[0.2em] text-[var(--accent-primary)] uppercase">
                        {isGlobalLoading ? 'Loading metrics...' : viewMode === 'performance' ? 'Real-time Sector & Industry Momentum' : 'Technical Breadth & Health'}
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex gap-2 text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex-wrap md:justify-end bg-[var(--nav-bg)]/50 p-1 rounded-lg border border-[var(--ui-divider)] overflow-x-auto no-scrollbar">
                        {INTERVALS.map(tf => (
                            <button
                                type="button"
                                key={tf}
                                onClick={() => setTimeframe(tf)}
                                className={`cursor-pointer transition-all uppercase px-2 py-1 rounded flex-shrink-0 ${timeframe === tf
                                    ? "text-[var(--accent-primary)] bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 shadow-[0_0_10px_rgba(197,160,89,0.1)]"
                                    : "hover:text-[var(--text-main)]"
                                    }`}
                            >
                                {tf}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="relative">
                <div className={`grid grid-cols-2 gap-4 md:gap-12 transition-opacity duration-300 ${isGlobalLoading ? 'opacity-30' : 'opacity-100'}`}>
                    {/* SECTORS */}
                    <div className="space-y-8">
                        <div className="flex items-center gap-3 border-b border-[var(--ui-divider)] pb-4">
                            <div className="w-1 h-2 md:h-3 bg-[var(--accent-primary)]" />
                            <h2 className="text-[8px] md:text-[10px] font-bold tracking-[0.2em] md:tracking-[0.4em] uppercase opacity-40">Sector {viewMode === 'breadth' ? 'Health' : 'Rankings'}</h2>
                            <div className="ml-auto flex items-center gap-2">
                                <span className="text-[7px] text-[var(--text-muted)] tracking-wider uppercase">{viewMode === 'breadth' ? activeEMALabel : timeframe}</span>
                                <button
                                    onClick={() => setSectorSortDesc(p => !p)}
                                    className="flex items-center gap-0.5 text-[7px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded border border-[var(--ui-divider)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] transition-all text-[var(--text-muted)]"
                                >
                                    {sectorSortDesc ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowUp className="w-2.5 h-2.5" />}
                                    {sectorSortDesc ? (viewMode === 'breadth' ? 'Strongest' : 'Best') : (viewMode === 'breadth' ? 'Weakest' : 'Worst')}
                                </button>
                            </div>
                        </div>
                        <div className="h-[min(70vh,720px)]">
                            <Virtuoso
                                data={sortedSectors}
                                computeItemKey={(_, sector) => sector}
                                itemContent={(_, sector) => {
                                    const data = sectorData[sector];
                                    return (
                                        <TrackerRow
                                            name={sector}
                                            perf={viewMode === 'breadth' ? (data?.breadth?.[activeEMAKey] ?? null) : (data?.avgPerf ?? null)}
                                            breadth={data?.breadth}
                                            leaders={data?.leaders}
                                            laggards={data?.laggards}
                                            onClick={() => onSectorClick(sector)}
                                            loading={isGlobalLoading && !data}
                                        />
                                    );
                                }}
                            />
                        </div>
                    </div>

                    {/* INDUSTRIES */}
                    <div className="space-y-8">
                        <div className="flex items-center gap-3 border-b border-[var(--ui-divider)] pb-4">
                            <div className="w-1 h-2 md:h-3 bg-[var(--accent-primary)]" />
                            <h2 className="text-[8px] md:text-[10px] font-bold tracking-[0.2em] md:tracking-[0.4em] uppercase opacity-40">Industry {viewMode === 'breadth' ? 'Breadth' : 'Alpha'}</h2>
                            <div className="ml-auto flex items-center gap-2">
                                <span className="text-[7px] text-[var(--text-muted)] tracking-wider uppercase">{viewMode === 'breadth' ? activeEMALabel : timeframe}</span>
                                <button
                                    onClick={() => setIndustrySortDesc(p => !p)}
                                    className="flex items-center gap-0.5 text-[7px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded border border-[var(--ui-divider)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] transition-all text-[var(--text-muted)]"
                                >
                                    {industrySortDesc ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowUp className="w-2.5 h-2.5" />}
                                    {industrySortDesc ? (viewMode === 'breadth' ? 'Strongest' : 'Best') : (viewMode === 'breadth' ? 'Weakest' : 'Worst')}
                                </button>
                            </div>
                        </div>
                        <div className="h-[min(70vh,720px)]">
                            <Virtuoso
                                data={sortedIndustries}
                                computeItemKey={(_, ind) => ind.name}
                                itemContent={(_, ind) => {
                                    const data = industryData[ind.name];
                                    return (
                                        <TrackerRow
                                            name={ind.name.toLowerCase()}
                                            perf={viewMode === 'breadth' ? (data?.breadth?.[activeEMAKey] ?? null) : (data?.avgPerf ?? null)}
                                            breadth={data?.breadth}
                                            leaders={data?.leaders}
                                            laggards={data?.laggards}
                                            onClick={() => onIndustryClick(ind.sector, ind.name)}
                                            loading={isGlobalLoading && !data}
                                        />
                                    );
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </ViewWrapper>
    );
};

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { m } from 'framer-motion';
import { ArrowUp, ArrowDown, Info } from 'lucide-react';
import { TrackerRow } from '../components/TrackerRow';
import { useUnifiedTracker } from '../hooks/useUnifiedTracker';
import { ViewWrapper } from '../components/ViewWrapper';
import { Virtuoso } from 'react-virtuoso';
import { THEMATIC_MAP, MACRO_PILLARS } from '../data/thematicMap';
import { UniverseLoader } from '../components/UniverseLoader';
import { WatchlistSyncCard } from '../components/WatchlistSyncCard';
import { useMarketMapSnapshot } from '../hooks/useMarketMapSnapshot';

const INTERVALS = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX'];

const RANGE_TO_EMA = {
    '1D': 'above10EMA',
    '5D': 'above10EMA',
    '1M': 'above21EMA',
    '3M': 'above50EMA',
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
    '3M': '50 EMA',
    '6M': '50 EMA',
    'YTD': '150 EMA',
    '1Y': '150 EMA',
    '5Y': '200 EMA',
    'MAX': '200 EMA'
};

export const TrackerView = ({ sectors, hierarchy, onSectorClick, onIndustryClick, timeframe, setTimeframe, onOpenInsights }) => {
    const [viewMode, _setViewMode] = useState(() => localStorage.getItem('tt_tracker_viewMode') || 'performance');
    const setViewMode = useCallback(v => { const next = typeof v === 'function' ? v(viewMode) : v; localStorage.setItem('tt_tracker_viewMode', next); _setViewMode(next); }, [viewMode]);
    const [trackingType, _setTrackingType] = useState(() => localStorage.getItem('tt_tracker_trackingType') || 'INDUSTRY');
    const setTrackingType = useCallback(v => { const next = typeof v === 'function' ? v(trackingType) : v; localStorage.setItem('tt_tracker_trackingType', next); _setTrackingType(next); }, [trackingType]);
    const [sectorSortDesc, setSectorSortDesc] = useState(true);
    const [industrySortDesc, setIndustrySortDesc] = useState(true);
    const leftRangeRef = useRef(null);
    const rightRangeRef = useRef(null);
    const leftRangeTimerRef = useRef(null);
    const rightRangeTimerRef = useRef(null);
    const { snapshotSymbolPerf, snapshotSymbolTechnicals, hasSnapshot, snapshotSource } = useMarketMapSnapshot('all');
    const useSnapshotOnly = hasSnapshot && snapshotSource === 'server';

    const activeEMAKey = RANGE_TO_EMA[timeframe] || 'above200EMA';
    const activeEMALabel = RANGE_LABEL[timeframe] || '200 EMA';

    // Flatten all industries (deduplicated by name)
    const allIndustries = useMemo(() => {
        const seen = new Set();
        const industries = [];
        sectors.forEach(sector => {
            const sectorData = hierarchy[sector] || {};
            Object.keys(sectorData).forEach(ind => {
                const count = sectorData[ind].length;
                if (!seen.has(ind)) {
                    seen.add(ind);
                    industries.push({ name: ind, sector, count: count });
                } else {
                    const existing = industries.find(i => i.name === ind);
                    if (existing) existing.count += count;
                }
            });
        });
        return industries.sort((a, b) => a.name.localeCompare(b.name));
    }, [sectors, hierarchy]);

    const industryNames = useMemo(() => allIndustries.map(i => i.name), [allIndustries]);

    // Derived Thematic Items
    const thematicPillars = useMemo(() => MACRO_PILLARS.map(p => p.title), []);
    const thematicThemes = useMemo(() => {
        const themes = [];
        THEMATIC_MAP.forEach(block => {
            block.themes.forEach(theme => themes.push(theme.name));
        });
        return themes;
    }, []);

    // Unified Data Hook
    const leftItems = trackingType === 'INDUSTRY' ? sectors : thematicPillars;
    const rightItems = trackingType === 'INDUSTRY' ? industryNames : thematicThemes;

    const [visibleLeftItems, setVisibleLeftItems] = useState(() => leftItems.slice(0, 20));
    const [visibleRightItems, setVisibleRightItems] = useState(() => rightItems.slice(0, 30));

    useEffect(() => {
        setVisibleLeftItems((prev) => {
            const next = leftItems.slice(0, 20);
            if (prev.length === next.length && prev.every((item, index) => item === next[index])) {
                return prev;
            }
            return next;
        });
    }, [leftItems]);

    useEffect(() => {
        setVisibleRightItems((prev) => {
            const next = rightItems.slice(0, 30);
            if (prev.length === next.length && prev.every((item, index) => item === next[index])) {
                return prev;
            }
            return next;
        });
    }, [rightItems]);

    const { trackerMap: leftData, loading: leftLoading } = useUnifiedTracker(
        leftItems,
        hierarchy,
        timeframe,
        trackingType === 'INDUSTRY' ? 'sector' : 'thematic',
        { includeBreadth: viewMode === 'breadth', activeItems: visibleLeftItems, snapshotSymbolPerf, snapshotSymbolTechnicals, useSnapshotOnly }
    );
    const { trackerMap: rightData, loading: rightLoading } = useUnifiedTracker(
        rightItems,
        hierarchy,
        timeframe,
        trackingType === 'INDUSTRY' ? 'industry' : 'thematic',
        { includeBreadth: viewMode === 'breadth', activeItems: visibleRightItems, snapshotSymbolPerf, snapshotSymbolTechnicals, useSnapshotOnly }
    );

    // Sorting Logic
    const sortedLeft = useMemo(() => {
        const dir = sectorSortDesc ? -1 : 1;
        const getCount = (name) => {
            if (trackingType === 'INDUSTRY') {
                return hierarchy[name] ? Object.values(hierarchy[name]).reduce((acc, comp) => acc + comp.length, 0) : 0;
            }
            // For thematic pillars, sum their constituent themes' companies
            const pillar = MACRO_PILLARS.find(p => p.title === name);
            if (!pillar) return 0;

            let total = 0;
            pillar.blocks.forEach(blockTitle => {
                const mapBlock = THEMATIC_MAP.find(b => b.title === blockTitle);
                if (mapBlock) {
                    mapBlock.themes.forEach(theme => {
                        total += rightData[theme.name]?.breadth?.total || 0;
                    });
                }
            });
            return total;
        };

        return [...leftItems].sort((a, b) => {
            if (trackingType === 'TRADITIONAL') {
                const aIsSmall = getCount(a) <= 3;
                const bIsSmall = getCount(b) <= 3;
                if (aIsSmall && !bIsSmall) return 1;
                if (!aIsSmall && bIsSmall) return -1;
            }

            if (viewMode === 'breadth') {
                return dir * ((leftData[a]?.breadth?.[activeEMAKey] || 0) - (leftData[b]?.breadth?.[activeEMAKey] || 0));
            }
            return dir * ((leftData[a]?.avgPerf || 0) - (leftData[b]?.avgPerf || 0));
        });
    }, [leftItems, leftData, viewMode, sectorSortDesc, activeEMAKey, hierarchy, trackingType]);

    const sortedRight = useMemo(() => {
        const dir = industrySortDesc ? -1 : 1;

        return [...rightItems].sort((a, b) => {
            if (viewMode === 'breadth') {
                return dir * ((rightData[a]?.breadth?.[activeEMAKey] || 0) - (rightData[b]?.breadth?.[activeEMAKey] || 0));
            }
            return dir * ((rightData[a]?.avgPerf || 0) - (rightData[b]?.avgPerf || 0));
        });
    }, [rightItems, rightData, viewMode, industrySortDesc, activeEMAKey, trackingType]);

    const isGlobalLoading = leftLoading || rightLoading;
    const isInitialLoading = (leftLoading && Object.keys(leftData).length === 0) || (rightLoading && Object.keys(rightData).length === 0);

    const handleLeftRangeChanged = useCallback((range) => {
        leftRangeRef.current = range;
        if (leftRangeTimerRef.current) return;
        leftRangeTimerRef.current = setTimeout(() => {
            leftRangeTimerRef.current = null;
            const { startIndex = 0, endIndex = 0 } = leftRangeRef.current || {};
            setVisibleLeftItems(sortedLeft.slice(startIndex, endIndex + 1));
        }, 120);
    }, [sortedLeft]);

    const handleRightRangeChanged = useCallback((range) => {
        rightRangeRef.current = range;
        if (rightRangeTimerRef.current) return;
        rightRangeTimerRef.current = setTimeout(() => {
            rightRangeTimerRef.current = null;
            const { startIndex = 0, endIndex = 0 } = rightRangeRef.current || {};
            setVisibleRightItems(sortedRight.slice(startIndex, endIndex + 1));
        }, 120);
    }, [sortedRight]);

    useEffect(() => () => {
        if (leftRangeTimerRef.current) clearTimeout(leftRangeTimerRef.current);
        if (rightRangeTimerRef.current) clearTimeout(rightRangeTimerRef.current);
    }, []);

    return (
        <ViewWrapper id="tracker">
            {isInitialLoading && <UniverseLoader />}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-[var(--ui-divider)] pb-6">
                <div className="space-y-1 w-full xl:max-w-xl shrink-0">
                    <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-sm md:text-lg xl:text-xl font-light tracking-[0.1em] md:tracking-[0.2em] xl:tracking-[0.4em] uppercase opacity-90 text-glow-gold truncate">
                            {trackingType === 'INDUSTRY' ? 'Industry & Sector' : 'Thematic Clusters'}
                        </h2>
                        <div className="relative group flex items-center shrink-0">
                            <Info className="w-4 h-4 text-[var(--accent-primary)]/50 cursor-help hover:text-[var(--accent-primary)] transition-colors group-hover:opacity-100" />
                            <div className="absolute left-0 xl:left-full xl:ml-3 top-full xl:top-1/2 xl:-translate-y-1/2 mt-3 xl:mt-0 w-[260px] md:w-[320px] p-4 glass-card text-[9px] text-[var(--text-muted)] tracking-wider leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[100] shadow-2xl border border-[var(--accent-primary)]/20 pointer-events-none">
                                <span className="text-[var(--accent-primary)] font-bold mb-2 block uppercase tracking-[0.2em] border-b border-[var(--accent-primary)]/20 pb-1">How rankings work</span>
                                <span className="block mb-2 font-bold text-[var(--text-main)]">- Performance</span>
                                <span className="block mb-3 opacity-80 text-[10px]">Calculates the avg return across all stocks within a group.</span>
                                <span className="block mb-2 font-bold text-[var(--text-main)]">- Breadth</span>
                                <span className="block mb-3 opacity-80 text-[10px]">Calculates % of stocks trading above Moving Averages (technical health).</span>
                                <span className="block italic opacity-40 text-[8px] border-t border-[var(--ui-divider)] pt-2 mt-2">* Hover over any row to see individual Alpha Leaders.</span>
                            </div>
                        </div>
                    </div>
                    <p className="text-[9px] font-bold leading-relaxed tracking-[0.2em] text-[var(--accent-primary)] uppercase">
                        {(leftLoading || rightLoading) ? 'Syncing...' : viewMode === 'performance' ? 'Real-time Performance Metrics' : 'Technical Breadth & Health'}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 md:gap-4 xl:justify-end w-full">
                    <div className="flex bg-[var(--nav-bg)]/80 p-0.5 rounded-lg border border-[var(--ui-divider)] shrink-0">
                        {['INDUSTRY', 'THEMATIC'].map(mode => (
                            <button
                                key={mode}
                                onClick={() => setTrackingType(mode)}
                                className={`px-2.5 py-1.5 text-[8px] md:text-[9px] font-bold uppercase tracking-widest rounded transition-all ${trackingType === mode ? 'bg-[var(--accent-primary)] text-[var(--bg-main)] shadow-lg' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>

                    <div className="flex bg-[var(--nav-bg)]/80 p-0.5 rounded-lg border border-[var(--ui-divider)] shrink-0">
                        <button
                            onClick={() => setViewMode('performance')}
                            className={`px-2.5 py-1.5 text-[8px] md:text-[9px] font-bold uppercase tracking-widest rounded transition-all ${viewMode === 'performance' ? 'bg-[var(--accent-primary)] text-[var(--bg-main)] shadow-lg' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                        >
                            Perf
                        </button>
                        <button
                            onClick={() => setViewMode('breadth')}
                            className={`px-2.5 py-1.5 text-[8px] md:text-[9px] font-bold uppercase tracking-widest rounded transition-all ${viewMode === 'breadth' ? 'bg-[var(--accent-primary)] text-[var(--bg-main)] shadow-lg' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                        >
                            Breadth
                        </button>
                    </div>

                    <div className="flex items-center gap-1 text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest bg-[var(--nav-bg)]/50 p-1 rounded-lg border border-[var(--ui-divider)] overflow-x-auto no-scrollbar min-w-0">
                        {INTERVALS.map(tf => (
                            <button
                                type="button"
                                key={tf}
                                onClick={() => setTimeframe(tf)}
                                className={`cursor-pointer transition-all uppercase px-2 py-1.5 rounded whitespace-nowrap flex-shrink-0 ${timeframe === tf
                                    ? "text-[var(--accent-primary)] bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 shadow-[0_0_10px_rgba(197,160,89,0.1)]"
                                    : "hover:text-[var(--text-main)]"
                                    }`}
                            >
                                {tf}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-end gap-4">
                    <div className="w-full md:w-auto min-w-[320px]">
                        <WatchlistSyncCard
                            sectors={sectors}
                            hierarchy={hierarchy}
                            allIndustries={allIndustries}
                        />
                    </div>
                </div>
            </div>

            <div className="relative">
                <div className={`grid grid-cols-1 xl:grid-cols-2 gap-12 xl:gap-20 transition-opacity duration-300 ${isInitialLoading ? 'opacity-30' : 'opacity-100'}`}>
                    {/* SECTORS / PILLARS */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 border-b border-[var(--ui-divider)] pb-4">
                            <div className="w-1 h-2 md:h-3 bg-[var(--accent-primary)]" />
                            <h2 className="text-[8px] md:text-[10px] font-bold tracking-[0.2em] md:tracking-[0.4em] uppercase opacity-40">
                                {trackingType === 'INDUSTRY' ? 'Sector' : 'Macro Pillar'} {viewMode === 'breadth' ? 'Health' : 'Rankings'}
                            </h2>
                            <div className="ml-auto flex items-center gap-2">
                                <span className="text-[7px] text-[var(--text-muted)] tracking-wider uppercase whitespace-nowrap">{viewMode === 'breadth' ? activeEMALabel : timeframe}</span>
                                <button
                                    onClick={() => setSectorSortDesc(p => !p)}
                                    className="flex items-center gap-0.5 text-[7px] font-bold tracking-wider uppercase px-2 py-1 rounded border border-[var(--ui-divider)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] transition-all text-[var(--text-muted)] whitespace-nowrap"
                                >
                                    {sectorSortDesc ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowUp className="w-2.5 h-2.5" />}
                                    <span className="hidden sm:inline">{sectorSortDesc ? (viewMode === 'breadth' ? 'Strongest' : 'Best') : (viewMode === 'breadth' ? 'Weakest' : 'Worst')}</span>
                                    <span className="sm:hidden">{sectorSortDesc ? 'High' : 'Low'}</span>
                                </button>
                            </div>
                        </div>
                        <div className="h-[500px] xl:h-[calc(100vh-320px)] min-h-[400px]">
                            <Virtuoso
                                data={sortedLeft}
                                computeItemKey={(_, item) => item}
                                rangeChanged={handleLeftRangeChanged}
                                itemContent={(_, item) => {
                                    const data = leftData[item];
                                    const companies = (trackingType === 'INDUSTRY') ? (hierarchy[item] ? Object.values(hierarchy[item]).flat() : []) : [];

                                    return (
                                        <TrackerRow
                                            name={item}
                                            count={data?.breadth?.total || 0}
                                            perf={viewMode === 'breadth' ? (data?.breadth?.[activeEMAKey] ?? null) : (data?.avgPerf ?? null)}
                                            breadth={viewMode === 'breadth' ? data?.breadth : null}
                                            leaders={data?.leaders}
                                            laggards={data?.laggards}
                                            onClick={() => trackingType === 'INDUSTRY' && onSectorClick(item)}
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
                            <h2 className="text-[8px] md:text-[10px] font-bold tracking-[0.2em] md:tracking-[0.4em] uppercase opacity-40">
                                {trackingType === 'INDUSTRY' ? 'Industry' : 'Thematic Theme'} {viewMode === 'breadth' ? 'Breadth' : 'Alpha'}
                            </h2>
                            <div className="ml-auto flex items-center gap-2">
                                <span className="text-[7px] text-[var(--text-muted)] tracking-wider uppercase whitespace-nowrap">{viewMode === 'breadth' ? activeEMALabel : timeframe}</span>
                                <button
                                    onClick={() => setIndustrySortDesc(p => !p)}
                                    className="flex items-center gap-0.5 text-[7px] font-bold tracking-wider uppercase px-2 py-1 rounded border border-[var(--ui-divider)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] transition-all text-[var(--text-muted)] whitespace-nowrap"
                                >
                                    {industrySortDesc ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowUp className="w-2.5 h-2.5" />}
                                    <span className="hidden sm:inline">{industrySortDesc ? (viewMode === 'breadth' ? 'Strongest' : 'Best') : (viewMode === 'breadth' ? 'Weakest' : 'Worst')}</span>
                                    <span className="sm:hidden">{industrySortDesc ? 'High' : 'Low'}</span>
                                </button>
                            </div>
                        </div>
                        <div className="h-[500px] xl:h-[calc(100vh-320px)] min-h-[400px]">
                            <Virtuoso
                                data={sortedRight}
                                computeItemKey={(_, item) => item}
                                rangeChanged={handleRightRangeChanged}
                                itemContent={(_, item) => {
                                    const data = rightData[item];
                                    return (
                                        <TrackerRow
                                            name={item.toLowerCase()}
                                            count={data?.breadth?.total || 0}
                                            perf={viewMode === 'breadth' ? (data?.breadth?.[activeEMAKey] ?? null) : (data?.avgPerf ?? null)}
                                            breadth={viewMode === 'breadth' ? data?.breadth : null}
                                            leaders={data?.leaders}
                                            laggards={data?.laggards}
                                            loading={isGlobalLoading && !data}
                                            onClick={() => {
                                                if (trackingType === 'INDUSTRY') {
                                                    const ind = allIndustries.find(i => i.name === item);
                                                    if (ind) onIndustryClick(ind.sector, item);
                                                }
                                            }}
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

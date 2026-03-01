import React, { useState, useMemo } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { SectorNode } from '../components/SectorNode';
import { WatchlistCopyButton } from '../components/WatchlistCopyButton';
import { formatTVWatchlist } from '../lib/watchlistUtils';
import { ViewWrapper } from '../components/ViewWrapper';

const UniverseGridComponents = {
    List: React.forwardRef(({ style, children, ...props }, ref) => (
        <div
            ref={ref}
            {...props}
            style={style}
            className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4"
        >
            {children}
        </div>
    )),
    Item: ({ children, ...props }) => (
        <div {...props} className="w-full">
            {children}
        </div>
    )
};

UniverseGridComponents.List.displayName = 'UniverseGridList';

export const UniverseView = ({ sectors, hierarchy, onSectorClick, onIndustryClick, timeframe, setTimeframe, onOpenInsights }) => {
    const [filter, setFilter] = useState('');
    const colors = [
        'border-blue-500/60 text-blue-500',
        'border-amber-500/60 text-amber-500',
        'border-emerald-500/60 text-emerald-500',
        'border-purple-500/60 text-purple-500',
        'border-rose-500/60 text-rose-500',
        'border-cyan-500/60 text-cyan-500'
    ];

    const sectorSearchIndex = useMemo(() => {
        const index = new Map();
        sectors.forEach((sectorName) => {
            const sectorData = hierarchy[sectorName] || {};
            let text = sectorName.toLowerCase();

            Object.values(sectorData).forEach(companies => {
                companies.forEach(c => {
                    const companyName = c.name ? c.name.toLowerCase() : '';
                    const companySymbol = c.symbol ? c.symbol.toLowerCase() : '';
                    text += `|${companyName}|${companySymbol}`;
                });
            });

            index.set(sectorName, text);
        });
        return index;
    }, [sectors, hierarchy]);

    const filteredSectors = useMemo(() => {
        if (!filter) return sectors;
        const search = filter.toLowerCase();

        return sectors.filter(s => sectorSearchIndex.get(s)?.includes(search));
    }, [sectors, filter, sectorSearchIndex]);

    const handleCopyAll = () => {
        let allData = [];
        filteredSectors.forEach(s => {
            const sectorData = hierarchy[s] || {};
            Object.entries(sectorData).forEach(([ind, companies]) => {
                allData.push({ label: ind, companies });
            });
        });
        const text = formatTVWatchlist(allData);
        if (text) navigator.clipboard.writeText(text);
        return !!text;
    };

    const handleCopySector = (sectorName) => {
        const sectorData = hierarchy[sectorName] || {};
        const grouped = Object.entries(sectorData).map(([industryName, companies]) => ({
            label: industryName,
            companies
        }));
        const text = formatTVWatchlist(grouped);
        if (text) navigator.clipboard.writeText(text);
        return !!text;
    };

    return (
        <ViewWrapper id="universe">
            <div className="space-y-8 md:space-y-12">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-[var(--ui-divider)] pb-6">
                    <div className="space-y-1">
                        <div className="flex items-center gap-4 mb-3">
                            <h2 className="text-2xl font-light tracking-[0.5em] uppercase opacity-90 text-glow-gold">
                                Index
                            </h2>
                            <WatchlistCopyButton
                                onCopy={handleCopyAll}
                                className="opacity-40 hover:opacity-100"
                            />
                        </div>
                        <p className="text-[11px] font-bold leading-relaxed tracking-[0.2em] text-[var(--accent-primary)] uppercase">
                            Market Architecture Overview
                        </p>
                    </div>
                    <div className="relative group w-full md:w-64">
                        <input
                            type="text"
                            placeholder="Find Sectors, Stocks or Symbols..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="glass-card py-2.5 px-4 text-[11px] uppercase tracking-widest font-bold focus:outline-none focus:border-[var(--accent-primary)] transition-all w-full bg-transparent text-[var(--text-main)]"
                        />
                    </div>
                </div>

                {filteredSectors.length > 0 ? (
                    <VirtuosoGrid
                        useWindowScroll
                        data={filteredSectors}
                        components={UniverseGridComponents}
                        computeItemKey={(_, sectorName) => sectorName}
                        increaseViewportBy={{ top: 400, bottom: 800 }}
                        itemContent={(i, sectorName) => {
                            const colorClass = colors[i % colors.length];
                            return (
                                <SectorNode
                                    name={sectorName}
                                    count={Object.keys(hierarchy[sectorName]).length}
                                    onClick={() => onSectorClick(sectorName)}
                                    onCopy={() => handleCopySector(sectorName)}
                                    index={i}
                                    accentClass={colorClass}
                                />
                            );
                        }}
                    />
                ) : (
                    <div className="py-12 text-center">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">No sectors found</span>
                    </div>
                )}
            </div>
        </ViewWrapper>
    );

};

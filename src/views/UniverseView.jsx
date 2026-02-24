import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { SectorNode } from '../components/SectorNode';
import { WatchlistCopyButton } from '../components/WatchlistCopyButton';
import { formatTVWatchlist } from '../lib/watchlistUtils';
import { ViewWrapper } from '../components/ViewWrapper';

export const UniverseView = ({ sectors, hierarchy, onSectorClick, onIndustryClick, timeframe, setTimeframe, onOpenInsights }) => {
    const [filter, setFilter] = useState('');
    const colors = [
        'border-blue-500/40 text-blue-300 text-glow-blue',
        'border-amber-500/40 text-amber-300 text-glow-gold',
        'border-emerald-500/40 text-emerald-300',
        'border-purple-500/20 text-purple-400',
        'border-rose-500/20 text-rose-400',
        'border-cyan-500/20 text-cyan-400'
    ];

    const filteredSectors = useMemo(() => {
        if (!filter) return sectors;
        const search = filter.toLowerCase();

        return sectors.filter(s => {
            // 1. Check sector name
            if (s.toLowerCase().includes(search)) return true;

            // 2. Check all industries and companies in this sector
            const sectorData = hierarchy[s] || {};
            return Object.values(sectorData).some(companies =>
                companies.some(c =>
                    c.name.toLowerCase().includes(search) ||
                    c.symbol.toLowerCase().includes(search)
                )
            );
        });
    }, [sectors, filter, hierarchy]);

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

    return (
        <ViewWrapper id="universe">
            <div className="space-y-12">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-[var(--ui-divider)] pb-6">
                    <div className="space-y-1">
                        <div className="flex items-center gap-4 mb-3">
                            <h2 className="text-xl font-light tracking-[0.5em] uppercase opacity-90 text-glow-gold">
                                Index
                            </h2>
                            <WatchlistCopyButton
                                onCopy={handleCopyAll}
                                className="opacity-40 hover:opacity-100"
                            />
                        </div>
                        <p className="text-[9px] font-bold leading-relaxed tracking-[0.2em] text-[var(--accent-primary)] uppercase">
                            Market Architecture Overview
                        </p>
                    </div>
                    <div className="relative group">
                        <input
                            type="text"
                            placeholder="Find Sectors, Stocks or Symbols..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="glass-card py-2 px-4 text-[9px] uppercase tracking-widest font-bold focus:outline-none focus:border-[var(--accent-primary)] transition-all min-w-[240px] bg-transparent text-[var(--text-main)]"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredSectors.map((s, i) => {
                        const colorClass = colors[i % colors.length];
                        return (
                            <SectorNode
                                key={s}
                                name={s}
                                count={Object.keys(hierarchy[s]).length}
                                onClick={() => onSectorClick(s)}
                                onCopy={() => handleCopySector(s)}
                                index={i}
                                accentClass={colorClass}
                            />
                        );
                    })}
                    {filteredSectors.length === 0 && (
                        <div className="col-span-full py-12 text-center">
                            <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">No sectors found</span>
                        </div>
                    )}
                </div>
            </div>
        </ViewWrapper>
    );

};

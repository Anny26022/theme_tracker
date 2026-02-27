import React, { useState, useMemo, useRef } from 'react';
import { Search, ArrowUpRight, Play, Check } from 'lucide-react';
import { motion as m } from 'framer-motion';
import clsx from 'clsx';
import { VirtuosoGrid } from 'react-virtuoso';
import { IndustryNode } from '../components/IndustryNode';
import { WatchlistCopyButton } from '../components/WatchlistCopyButton';
import { formatTVWatchlist } from '../lib/watchlistUtils';
import { ViewWrapper } from '../components/ViewWrapper';
import { WatchlistSyncCard } from '../components/WatchlistSyncCard';

const DomainGridComponents = {
    List: React.forwardRef(({ style, children, ...props }, ref) => (
        <div
            ref={ref}
            {...props}
            style={style}
            className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4 pb-12"
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

DomainGridComponents.List.displayName = 'DomainGridList';

export const DomainView = ({ sectors, hierarchy, onIndustryClick, onOpenInsights }) => {
    const [filter, setFilter] = useState('');
    const [showResults, setShowResults] = useState(false);
    const [syncCopied, setSyncCopied] = useState(false);
    const inputRef = useRef(null);

    // Flatten all industries across all sectors (deduplicated by name)
    const { allIndustries, companiesIndex } = useMemo(() => {
        const seen = new Set();
        const industries = [];
        const companies = [];

        sectors.forEach(s => {
            const indDict = hierarchy[s] || {};
            Object.keys(indDict).forEach(indName => {
                if (!seen.has(indName)) {
                    seen.add(indName);
                    industries.push({
                        name: indName,
                        searchName: indName.toLowerCase(),
                        sector: s,
                        count: indDict[indName].length
                    });
                }

                indDict[indName].forEach(c => {
                    companies.push({
                        ...c,
                        industry: indName,
                        sector: s,
                        searchName: c.name ? c.name.toLowerCase() : '',
                        searchSymbol: c.symbol ? c.symbol.toLowerCase() : '',
                    });
                });
            });
        });

        return {
            allIndustries: industries.sort((a, b) => a.name.localeCompare(b.name)),
            companiesIndex: companies
        };
    }, [sectors, hierarchy]);

    const filteredIndustries = useMemo(() => {
        if (!filter) return allIndustries;
        const search = filter.toLowerCase();
        return allIndustries.filter(ind => ind.searchName.includes(search));
    }, [allIndustries, filter]);

    const matchingCompanies = useMemo(() => {
        if (!filter || filter.length < 2) return [];
        const search = filter.toLowerCase();

        return companiesIndex
            .filter(c => c.searchName.includes(search) || c.searchSymbol.includes(search))
            .slice(0, 10)
            .map(({ searchName, searchSymbol, ...company }) => company);
    }, [filter, companiesIndex]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && matchingCompanies.length > 0) {
            const first = matchingCompanies[0];
            onIndustryClick(first.sector, first.industry);
            onOpenInsights?.({ symbol: first.symbol, name: first.name });
            setShowResults(false);
        }
        if (e.key === 'Escape') {
            setShowResults(false);
            inputRef.current?.blur();
        }
    };

    const handleCopyAll = () => {
        const data = filteredIndustries.map(ind => ({
            label: ind.name,
            companies: hierarchy[ind.sector][ind.name] || []
        }));
        const text = formatTVWatchlist(data);
        if (text) navigator.clipboard.writeText(text);
        return !!text;
    };

    const handleCopyIndustry = (ind) => {
        const text = formatTVWatchlist([{
            label: ind.name,
            companies: hierarchy[ind.sector][ind.name] || []
        }]);
        if (text) navigator.clipboard.writeText(text);
        return !!text;
    };

    const handleSyncFlaggedList = () => { }; // Placeholder for old reference if any

    return (
        <ViewWrapper id="domain">
            <div className="flex flex-col gap-8 border-b border-[var(--ui-divider)] pb-8">
                {/* 1. Sync Card (Expands downwards) */}
                <div className="flex items-start w-full">
                    <WatchlistSyncCard
                        sectors={sectors}
                        hierarchy={hierarchy}
                        allIndustries={allIndustries}
                    />
                </div>

                {/* 2. Page Title */}
                <div className="flex items-center gap-6">
                    <h2 className="text-2xl font-light tracking-[0.4em] uppercase opacity-90 text-glow-gold leading-none">
                        Domain Vector
                    </h2>
                    <WatchlistCopyButton
                        onCopy={handleCopyAll}
                        className="p-2 border border-[var(--ui-divider)] rounded hover:bg-[var(--accent-primary)]/10 hover:border-[var(--accent-primary)] transition-all text-[var(--text-muted)] hover:text-[var(--accent-primary)] bg-[var(--bg-main)]/50"
                    />
                </div>

                {/* 3. Search & Info (Pushed down by Sync expansion) */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <p className="text-[9px] font-bold leading-relaxed tracking-[0.2em] text-[var(--accent-primary)] uppercase opacity-60">
                        {allIndustries.length} Industries across {sectors.length} Sectors
                    </p>

                    <div className="relative group w-full md:w-80">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--accent-primary)] opacity-40 group-focus-within:opacity-100 transition-opacity">
                            <Search className="w-3.5 h-3.5" />
                        </div>
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Search Industries or Stocks..."
                            value={filter}
                            onChange={(e) => {
                                setFilter(e.target.value);
                                setShowResults(true);
                            }}
                            onFocus={() => setShowResults(true)}
                            onKeyDown={handleKeyDown}
                            className="w-full glass-card bg-transparent pl-12 pr-4 py-3 text-[10px] uppercase tracking-[0.2em] font-bold focus:outline-none focus:border-[var(--accent-primary)] transition-all"
                        />

                        {/* Quick Results Dropdown */}
                        {showResults && matchingCompanies.length > 0 && (
                            <div className="absolute top-[calc(100%+8px)] left-0 right-0 glass-card bg-[var(--bg-main)]/95 backdrop-blur-xl border-[var(--ui-divider)] z-50 overflow-hidden">
                                <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
                                    {matchingCompanies.map((c) => (
                                        <button
                                            type="button"
                                            key={`${c.symbol}-${c.sector}-${c.industry}`}
                                            onClick={() => {
                                                onIndustryClick(c.sector, c.industry);
                                                onOpenInsights?.({ symbol: c.symbol, name: c.name });
                                                setShowResults(false);
                                            }}
                                            className="w-full text-left p-4 border-b border-[var(--ui-divider)] last:border-0 hover:bg-[var(--glass-border)] cursor-pointer transition-colors group flex items-center justify-between"
                                        >
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] font-bold text-[var(--text-main)] group-hover:text-[var(--accent-primary)] transition-colors tracking-widest">{c.symbol}</span>
                                                    <span className="text-[8px] font-bold text-[var(--text-muted)] line-clamp-1">{c.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[7px] font-bold text-[var(--accent-primary)] opacity-60 uppercase tracking-widest">{c.sector}</span>
                                                    <span className="text-[7px] opacity-20 text-[var(--text-muted)]">•</span>
                                                    <span className="text-[7px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{c.industry}</span>
                                                </div>
                                            </div>
                                            <ArrowUpRight className="w-3 h-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="pt-8">
                {filteredIndustries.length > 0 ? (
                    <VirtuosoGrid
                        useWindowScroll
                        data={filteredIndustries}
                        components={DomainGridComponents}
                        computeItemKey={(_, ind) => `${ind.sector}-${ind.name}`}
                        increaseViewportBy={{ top: 400, bottom: 800 }}
                        itemContent={(i, ind) => (
                            <IndustryNode
                                name={ind.name}
                                count={ind.count}
                                onClick={() => onIndustryClick(ind.sector, ind.name)}
                                onCopy={() => handleCopyIndustry(ind)}
                                index={i}
                            />
                        )}
                    />
                ) : (
                    <div className="py-24 text-center glass-card border-dashed">
                        <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--text-muted)]">No matches found for "{filter}"</p>
                    </div>
                )}
            </div>
        </ViewWrapper>
    );
};


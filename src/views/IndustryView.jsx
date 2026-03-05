import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { VirtuosoGrid } from 'react-virtuoso';
import { CompanyCardLite } from '../components/CompanyCardLite';
import { ViewWrapper } from '../components/ViewWrapper';
import { WatchlistSyncCard } from '../components/WatchlistSyncCard';
import { WatchlistCopyButton } from '../components/WatchlistCopyButton';
import { formatTVWatchlist } from '../lib/watchlistUtils';
import { useMarketDataRegistry } from '../context/MarketDataContext';
import { useMarketMapSnapshot } from '../hooks/useMarketMapSnapshot';

const IndustryGridComponents = {
    List: React.forwardRef(({ style, children, ...props }, ref) => (
        <div
            ref={ref}
            {...props}
            style={style}
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 pb-12"
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

IndustryGridComponents.List.displayName = 'IndustryGridList';

export const IndustryView = ({ sector, industry, companies, sectors, hierarchy, onBack, onOpenInsights }) => {
    const [filter, setFilter] = useState('');
    const { subscribeLiveSymbols } = useMarketDataRegistry();
    const { snapshotSymbolQuotes, hasSnapshot, snapshotSource } = useMarketMapSnapshot('all');
    const allSymbols = useMemo(() => companies.map(c => c.symbol), [companies]);
    const allowLiveFallback = !hasSnapshot || snapshotSource !== 'server';
    const missingLiveSymbols = useMemo(
        () => allSymbols.filter((symbol) => {
            const quote = snapshotSymbolQuotes?.[symbol];
            return !Number.isFinite(quote?.price) || !Number.isFinite(quote?.changePct);
        }),
        [allSymbols, snapshotSymbolQuotes]
    );
    useEffect(() => {
        if (!allowLiveFallback || missingLiveSymbols.length === 0) return;
        return subscribeLiveSymbols(missingLiveSymbols, { skipStrike: true });
    }, [allowLiveFallback, missingLiveSymbols, subscribeLiveSymbols]);

    const allIndustries = useMemo(() => [
        { name: industry, sector: sector }
    ], [industry, sector]);

    const filteredCompanies = useMemo(() => {
        if (!filter) return companies;
        const search = filter.toLowerCase();
        return companies.filter(c =>
            c.name.toLowerCase().includes(search) ||
            c.symbol.toLowerCase().includes(search)
        );
    }, [companies, filter]);

    const handleCopyAll = () => {
        const data = [{
            label: industry,
            companies: companies || []
        }];
        const text = formatTVWatchlist(data);
        if (text) navigator.clipboard.writeText(text);
        return !!text;
    };

    return (
        <ViewWrapper id="industry">
            <div className="flex flex-col gap-8 border-b border-[var(--ui-divider)] pb-8">
                {/* Row 1: Header & Search */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={onBack}
                            className="p-1.5 hover:bg-[var(--glass-border)] rounded-md transition-all group"
                        >
                            <ArrowLeft className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent-primary)] transition-colors" />
                        </button>
                        <div className="space-y-1">
                            <span className="text-[10px] font-bold text-[var(--accent-primary)] opacity-40 uppercase tracking-[0.4em]">
                                {sector}
                            </span>
                            <h2 className="text-3xl font-light tracking-[0.2em] uppercase opacity-90 leading-none text-glow-gold">
                                {industry}
                            </h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 border border-[var(--ui-divider)] bg-[var(--bg-main)]/50 rounded-lg px-4 py-2.5 focus-within:border-[var(--accent-primary)] transition-all w-full md:w-64">
                        <Search className="w-3.5 h-3.5 text-[var(--ui-muted)]" />
                        <input
                            type="text"
                            placeholder="FILTER COMPANIES..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="bg-transparent border-none outline-none text-[9.5px] uppercase tracking-widest font-bold w-full text-[var(--text-main)] placeholder:text-[var(--text-muted)] placeholder:opacity-50"
                        />
                    </div>
                </div>

                {/* Row 2: Actions */}
                <div className="flex items-start gap-3">
                    <WatchlistSyncCard
                        sectors={sectors}
                        hierarchy={hierarchy}
                        allIndustries={allIndustries}
                    />
                    <WatchlistCopyButton
                        onCopy={handleCopyAll}
                        className="p-2 border border-[var(--ui-divider)] rounded hover:bg-[var(--accent-primary)]/10 hover:border-[var(--accent-primary)] transition-all text-[var(--text-muted)] hover:text-[var(--accent-primary)] bg-[var(--bg-main)]/50 mt-1"
                    />
                </div>
            </div>

            {filteredCompanies.length > 0 ? (
                <VirtuosoGrid
                    useWindowScroll
                    data={filteredCompanies}
                    components={IndustryGridComponents}
                    computeItemKey={(_, company) => company.symbol}
                    increaseViewportBy={{ top: 400, bottom: 800 }}
                    itemContent={(i, company) => (
                        <CompanyCardLite
                            item={company}
                            index={i}
                            snapshotQuote={snapshotSymbolQuotes?.[company.symbol] || null}
                            allowLiveFetch={allowLiveFallback}
                            onClick={() => onOpenInsights(company)}
                        />
                    )}
                />
            ) : (
                <div className="py-24 text-center glass-card border-dashed">
                    <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--text-muted)]">No matches found for "{filter}"</p>
                </div>
            )}
        </ViewWrapper>
    );
};

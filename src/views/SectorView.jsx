import React, { useState, useMemo } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { IndustryNode } from '../components/IndustryNode';
import { ViewWrapper } from '../components/ViewWrapper';
import { formatTVWatchlist } from '../lib/watchlistUtils';

export const SectorView = ({ sector, industries, hierarchy, onBack, onIndustryClick }) => {
    const [filter, setFilter] = useState('');

    const filteredIndustries = useMemo(() => {
        if (!filter) return industries;
        const search = filter.toLowerCase();

        return industries.filter(ind => {
            if (ind.toLowerCase().includes(search)) return true;

            const companies = hierarchy[sector][ind] || [];
            return companies.some(c =>
                c.name.toLowerCase().includes(search) ||
                c.symbol.toLowerCase().includes(search)
            );
        });
    }, [industries, filter, sector, hierarchy]);

    const handleCopyIndustry = (industryName) => {
        const text = formatTVWatchlist([{
            label: industryName,
            companies: hierarchy[sector]?.[industryName] || []
        }]);
        if (text) navigator.clipboard.writeText(text);
        return !!text;
    };

    return (
        <ViewWrapper id="sector">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[var(--ui-divider)] pb-6">
                <div className="flex items-center gap-6">
                    <button
                        onClick={onBack}
                        className="p-1 hover:bg-[var(--glass-border)] rounded-sm transition-all group mt-2 md:mt-0"
                    >
                        <ArrowLeft className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent-primary)] transition-colors" />
                    </button>
                    <div className="space-y-1">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-[8px] font-bold text-[var(--accent-primary)] opacity-60 uppercase tracking-[0.4em]">Domain Vector</span>
                        </div>
                        <h2 className="text-xl font-light tracking-[0.2em] uppercase opacity-90 leading-none text-glow-gold">
                            {sector}
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-2 border border-[var(--ui-divider)] bg-[var(--bg-main)]/50 rounded-md px-3 py-1.5 focus-within:border-[var(--accent-primary)] transition-all min-w-[200px]">
                    <Search className="w-3 h-3 text-[var(--ui-muted)]" />
                    <input
                        type="text"
                        placeholder="FILTER INDUSTRIES..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="bg-transparent border-none outline-none text-[8px] uppercase tracking-widest font-bold w-full text-[var(--text-main)] placeholder:text-[var(--text-muted)] placeholder:opacity-50"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pb-12">
                {filteredIndustries.map((ind, i) => (
                    <IndustryNode
                        key={ind}
                        name={ind}
                        count={hierarchy[sector][ind].length}
                        onClick={() => onIndustryClick(ind)}
                        onCopy={() => handleCopyIndustry(ind)}
                        index={i}
                    />
                ))}
                {filteredIndustries.length === 0 && (
                    <div className="col-span-full py-24 text-center glass-card border-dashed">
                        <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--text-muted)]">No matches found for "{filter}"</p>
                    </div>
                )}
            </div>
        </ViewWrapper>
    );
};

import React, { useState, useMemo } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { VirtuosoGrid } from 'react-virtuoso';
import { CompanyCardLite } from '../components/CompanyCardLite';
import { ViewWrapper } from '../components/ViewWrapper';

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

export const IndustryView = ({ sector, industry, companies, onBack, onOpenInsights }) => {
    const [filter, setFilter] = useState('');

    const filteredCompanies = useMemo(() => {
        if (!filter) return companies;
        const search = filter.toLowerCase();
        return companies.filter(c =>
            c.name.toLowerCase().includes(search) ||
            c.symbol.toLowerCase().includes(search)
        );
    }, [companies, filter]);

    return (
        <ViewWrapper id="industry">
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
                            <span className="text-[8px] font-bold text-[var(--accent-primary)] opacity-60 uppercase tracking-[0.4em]">{sector}</span>
                        </div>
                        <h2 className="text-xl font-light tracking-[0.2em] uppercase opacity-90 leading-none text-glow-gold">
                            {industry}
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-2 border border-[var(--ui-divider)] bg-[var(--bg-main)]/50 rounded-md px-3 py-1.5 focus-within:border-[var(--accent-primary)] transition-all w-full md:w-64">
                    <Search className="w-3 h-3 text-[var(--ui-muted)]" />
                    <input
                        type="text"
                        placeholder="FILTER COMPANIES..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="bg-transparent border-none outline-none text-[8px] uppercase tracking-widest font-bold w-full text-[var(--text-main)] placeholder:text-[var(--text-muted)] placeholder:opacity-50"
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

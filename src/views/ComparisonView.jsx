import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Plus, TrendingUp, BarChart3, Activity } from 'lucide-react';
import { ComparisonChart, COLORS } from '../components/ComparisonChart';
import { useComparisonData } from '../hooks/useComparisonData';
import { cleanSymbol } from '../services/priceService';
import { ViewWrapper } from '../components/ViewWrapper';

const INTERVALS = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX'];

/**
 * Premium Symbol Comparison View
 */
export const ComparisonView = ({ hierarchy, timeframe, setTimeframe, onOpenInsights }) => {
    // Selection Persistence: Load from localStorage or use defaults
    const [selectedSymbols, setSelectedSymbols] = useState(() => {
        const saved = localStorage.getItem('tt_comparison_symbols_v2');
        return saved ? JSON.parse(saved) : [
            { id: 'RELIANCE', type: 'STOCK' },
            { id: 'HDFCBANK', type: 'STOCK' }
        ];
    });

    const [searchQuery, setSearchQuery] = useState('');
    const [exchangePreference, setExchangePreference] = useState('ALL'); // ALL, NSE, BSE

    // Save selection whenever it changes
    React.useEffect(() => {
        localStorage.setItem('tt_comparison_symbols_v2', JSON.stringify(selectedSymbols));
    }, [selectedSymbols]);

    // Flatten all companies and industries for search
    const { allCompanies, allIndustries, symbolNames } = useMemo(() => {
        const companies = [];
        const industries = new Map(); // name -> symbols[]
        const names = new Map(); // symbol -> name
        const seen = new Set();

        Object.keys(hierarchy).forEach(sector => {
            Object.keys(hierarchy[sector]).forEach(industryName => {
                const members = hierarchy[sector][industryName];
                industries.set(industryName, members.map(m => cleanSymbol(m.symbol)));

                members.forEach(c => {
                    const clean = cleanSymbol(c.symbol);
                    names.set(clean, c.name);
                    if (!seen.has(clean)) {
                        seen.add(clean);
                        companies.push({ ...c, clean, industry: industryName });
                    }
                });
            });
        });
        return { allCompanies: companies, allIndustries: industries, symbolNames: names };
    }, [hierarchy]);

    // Filtered search results (Stock + Industry)
    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase();

        const stockMatches = allCompanies
            .filter(c =>
                c.symbol.toLowerCase().includes(q) ||
                c.name.toLowerCase().includes(q)
            ).map(s => ({ ...s, type: 'STOCK' }));

        // Find related industries from stock matches
        const relatedIndustries = new Set(stockMatches.map(s => s.industry));

        const directIndustryMatches = Array.from(allIndustries.keys())
            .filter(name => name.toLowerCase().includes(q));

        // Combine and deduplicate
        const mergedIndustries = Array.from(new Set([
            ...directIndustryMatches,
            ...Array.from(relatedIndustries)
        ]));

        const industryResults = mergedIndustries.map(name => ({
            symbol: name,
            name: 'Industry Index',
            type: 'INDUSTRY',
            constituents: allIndustries.get(name)
        }));

        return [...industryResults, ...stockMatches].slice(0, 10);
    }, [allCompanies, allIndustries, searchQuery]);

    const normalizedSymbols = useMemo(() => selectedSymbols.map(s => {
        if (s.type === 'INDUSTRY') {
            return { id: s.id, type: 'INDUSTRY', members: allIndustries.get(s.id) || [] };
        }
        return s.id;
    }), [selectedSymbols, allIndustries]);

    const isNumeric = (s) => /^\d+$/.test(s);

    const chartSymbols = useMemo(() => {
        const unique = new Set();
        selectedSymbols.forEach(s => {
            if (s.type === 'INDUSTRY') {
                const members = allIndustries.get(s.id) || [];
                members.forEach(m => {
                    const numeric = isNumeric(m);
                    if (exchangePreference === 'ALL') unique.add(m);
                    else if (exchangePreference === 'NSE' && !numeric) unique.add(m);
                    else if (exchangePreference === 'BSE' && numeric) unique.add(m);
                });
            } else {
                unique.add(s.id);
            }
        });
        return Array.from(unique);
    }, [selectedSymbols, allIndustries, exchangePreference]);

    const { data: chartData, loading } = useComparisonData(normalizedSymbols, timeframe);

    const toggleSymbol = (item) => {
        const isSelected = selectedSymbols.find(s => s.id === item.symbol);
        if (isSelected) {
            setSelectedSymbols(prev => prev.filter(s => s.id !== item.symbol));
        } else {
            if (selectedSymbols.length >= 7) return;
            setSelectedSymbols(prev => [...prev, {
                id: item.symbol,
                type: item.type,
                name: item.name
            }]);
            setSearchQuery('');
        }
    };

    return (
        <ViewWrapper id="comparison">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[var(--ui-divider)] pb-8">
                <div className="space-y-2">
                    <h2 className="text-xl font-light tracking-[0.5em] uppercase opacity-90 text-glow-gold">Comparison Engine</h2>
                    <p className="text-[9px] font-bold tracking-[0.3em] text-[var(--accent-primary)] uppercase">Cross-vector performance analysis</p>
                </div>

                <div className="flex bg-[var(--nav-bg)] rounded-lg p-1 border border-[var(--ui-divider)]">
                    {INTERVALS.map(tf => (
                        <button
                            key={tf}
                            onClick={() => setTimeframe(tf)}
                            className={`px-3 py-1 text-[8px] font-bold tracking-widest uppercase transition-all rounded ${timeframe === tf
                                ? "bg-[var(--accent-primary)] text-black"
                                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                                }`}
                        >
                            {tf}
                        </button>
                    ))}
                </div>
            </div>

            {/* Selection Area */}
            <div className="flex flex-wrap gap-3 items-center">
                <AnimatePresence mode="popLayout">
                    {selectedSymbols.map((item, idx) => {
                        return (
                            <motion.div
                                key={item.id}
                                layout
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className={`flex items-center gap-2 px-3 py-1.5 glass-card border-[3px] rounded-full transition-all ${item.type === 'STOCK' ? 'cursor-pointer hover:border-[var(--accent-primary)]' : ''}`}
                                style={{ borderColor: COLORS[idx % COLORS.length] + '44' }}
                                onClick={() => item.type === 'STOCK' && onOpenInsights?.({ symbol: item.id, name: item.name })}
                            >
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-bold tracking-widest max-w-[80px] truncate leading-tight">
                                        {item.type === 'STOCK' ? item.name : item.id}
                                    </span>
                                    {item.type === 'INDUSTRY' && (
                                        <span className="text-[6px] font-bold text-[var(--accent-primary)] uppercase tracking-tighter">Industry Index</span>
                                    )}
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSymbol({ symbol: item.id });
                                    }}
                                    className="hover:text-rose-500 transition-colors ml-1"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                <div className="flex items-center gap-1.5 glass-card p-1 border border-[var(--ui-divider)] rounded-full">
                    {['ALL', 'NSE', 'BSE'].map(ex => (
                        <button
                            key={ex}
                            onClick={() => setExchangePreference(ex)}
                            className={`px-3 py-1 rounded-full text-[7px] font-bold tracking-widest transition-all ${exchangePreference === ex
                                ? "bg-[var(--accent-primary)] text-black shadow-[0_0_10px_var(--accent-primary)]"
                                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                                }`}
                        >
                            {ex}
                        </button>
                    ))}
                </div>

                <div className="relative">
                    <div className="flex items-center gap-2 px-4 py-1.5 glass-card border-dashed border-[var(--ui-divider)] rounded-full hover:border-[var(--accent-primary)] transition-all">
                        <Search className="w-3 h-3 text-[var(--text-muted)]" />
                        <input
                            type="text"
                            placeholder="COMPARE SYMBOL..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent border-none outline-none text-[9px] font-bold tracking-widest w-32 uppercase placeholder:text-[var(--ui-muted)]"
                        />
                    </div>

                    {/* Search Results Dropdown */}
                    <AnimatePresence>
                        {searchResults.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className="absolute top-full left-0 mt-2 w-64 glass-card border border-[var(--ui-divider)] z-50 p-2 shadow-2xl overflow-hidden"
                            >
                                {searchResults.map(res => (
                                    <div
                                        key={res.symbol + res.type}
                                        onClick={() => toggleSymbol(res)}
                                        className="flex items-center justify-between p-2 hover:bg-[var(--accent-primary)]/10 rounded cursor-pointer group"
                                    >
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-bold tracking-widest text-[var(--text-main)]">{res.symbol}</span>
                                                {res.type === 'INDUSTRY' && (
                                                    <span className="text-[6px] px-1 bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] rounded h-fit">INDEX</span>
                                                )}
                                            </div>
                                            <span className="text-[7px] text-[var(--text-muted)] uppercase tracking-tighter truncate max-w-[150px]">{res.name}</span>
                                        </div>
                                        <Plus className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--accent-primary)]" />
                                    </div>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Chart Area */}
            <div className="glass-card p-10 relative">
                {loading && (
                    <div className="absolute inset-0 bg-[var(--bg-main)]/40 backdrop-blur-[2px] z-20 flex items-center justify-center">
                        <Activity className="w-6 h-6 text-[var(--accent-primary)] animate-pulse" />
                    </div>
                )}
                <ComparisonChart
                    data={chartData}
                    symbols={chartSymbols}
                    labels={symbolNames}
                    interval={timeframe}
                />
            </div>

            {/* Footnote */}
            <div className="flex items-center justify-center gap-6 opacity-30 grayscale hover:grayscale-0 transition-all">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-3 h-3" />
                    <span className="text-[8px] font-bold tracking-[0.4em] uppercase">Normalized Yields</span>
                </div>
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-3 h-3" />
                    <span className="text-[8px] font-bold tracking-[0.4em] uppercase">Intraday Precision</span>
                </div>
            </div>
        </ViewWrapper>
    );
};

import React, { useState, useMemo } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { X, Search, Plus, TrendingUp, BarChart3, Activity, Info } from 'lucide-react';
import { ComparisonChart, COLORS } from '../components/ComparisonChart';
import { useComparisonData } from '../hooks/useComparisonData';
import { cleanSymbol } from '../services/priceService';
import { ViewWrapper } from '../components/ViewWrapper';
import { THEMATIC_MAP } from '../data/thematicMap';

const INTERVALS = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX'];
const MAX_CHART_SYMBOLS = 60;
const COMPARISON_STORAGE_KEY = 'tt_comparison_symbols:v2';
const LEGACY_COMPARISON_STORAGE_KEY = 'tt_comparison_symbols_v2';

/**
 * Premium Symbol Comparison View
 */
export const ComparisonView = ({ hierarchy, timeframe, setTimeframe, onOpenInsights }) => {
    // Selection Persistence: Load from localStorage or use defaults
    const [selectedSymbols, setSelectedSymbols] = useState(() => {
        try {
            const saved = localStorage.getItem(COMPARISON_STORAGE_KEY) || localStorage.getItem(LEGACY_COMPARISON_STORAGE_KEY);
            return saved ? JSON.parse(saved) : [
                { id: 'RELIANCE', type: 'STOCK' },
                { id: 'HDFCBANK', type: 'STOCK' }
            ];
        } catch {
            return [
                { id: 'RELIANCE', type: 'STOCK' },
                { id: 'HDFCBANK', type: 'STOCK' }
            ];
        }
    });

    const [searchQuery, setSearchQuery] = useState('');
    const [searchMode, setSearchMode] = useState('INDUSTRY'); // INDUSTRY, THEMATIC
    const [exchangePreference, setExchangePreference] = useState('ALL'); // ALL, NSE, BSE

    // Save selection whenever it changes
    React.useEffect(() => {
        try {
            localStorage.setItem(COMPARISON_STORAGE_KEY, JSON.stringify(selectedSymbols));
            localStorage.removeItem(LEGACY_COMPARISON_STORAGE_KEY);
        } catch {
            // Ignore storage errors
        }
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

    // Derived Clusters from THEMATIC_MAP
    const allClusters = useMemo(() => {
        const clusters = new Map();
        THEMATIC_MAP.forEach(block => {
            block.themes.forEach(theme => {
                const symbols = new Set();
                if (theme.industries) {
                    theme.industries.forEach(indName => {
                        const members = allIndustries.get(indName) || [];
                        members.forEach(s => symbols.add(s));
                    });
                }
                if (theme.symbols) {
                    theme.symbols.forEach(s => symbols.add(cleanSymbol(s)));
                }
                clusters.set(theme.name, Array.from(symbols));
            });
        });
        return clusters;
    }, [allIndustries]);

    // Filtered search results (Stock + Industry/Cluster)
    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase();

        const stockMatches = allCompanies
            .filter(c =>
                c.symbol.toLowerCase().includes(q) ||
                c.name.toLowerCase().includes(q)
            ).map(s => ({ ...s, type: 'STOCK' }));

        if (searchMode === 'THEMATIC') {
            const clusterMatches = Array.from(allClusters.keys())
                .filter(name => name.toLowerCase().includes(q))
                .map(name => ({
                    symbol: name,
                    name: 'Thematic Cluster',
                    type: 'THEMATIC',
                    constituents: allClusters.get(name)
                }));
            return [...clusterMatches, ...stockMatches].slice(0, 10);
        }

        // Default: INDUSTRY mode
        const relatedIndustries = new Set(stockMatches.map(s => s.industry));
        const directIndustryMatches = Array.from(allIndustries.keys())
            .filter(name => name.toLowerCase().includes(q));

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
    }, [allCompanies, allIndustries, allClusters, searchQuery, searchMode]);

    const isNumeric = (s) => /^\d+$/.test(s);

    const { chartSymbols, totalChartSymbols } = useMemo(() => {
        const unique = new Set();
        selectedSymbols.forEach(s => {
            if (s.type === 'INDUSTRY' || s.type === 'THEMATIC') {
                const members = (s.type === 'INDUSTRY' ? allIndustries.get(s.id) : allClusters.get(s.id)) || [];
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

        const all = Array.from(unique);
        return {
            totalChartSymbols: all.length,
            chartSymbols: all.slice(0, MAX_CHART_SYMBOLS)
        };
    }, [selectedSymbols, allIndustries, allClusters, exchangePreference]);

    const { data: chartData, loading } = useComparisonData(chartSymbols, timeframe);

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

                <div className="flex bg-[var(--nav-bg)] rounded-lg p-1 border border-[var(--ui-divider)] overflow-x-auto no-scrollbar">
                    {INTERVALS.map(tf => (
                        <button
                            key={tf}
                            onClick={() => setTimeframe(tf)}
                            className={`px-3 py-1 text-[8px] font-bold tracking-widest uppercase transition-all rounded flex-shrink-0 ${timeframe === tf
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
                            <m.div
                                key={item.id}
                                layout
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className={`flex items-center gap-2 px-3 py-1.5 glass-card border-[3px] rounded-full transition-all ${item.type === 'STOCK' ? 'cursor-pointer hover:border-[var(--accent-primary)]' : ''}`}
                                style={{ borderColor: COLORS[idx % COLORS.length] + '44' }}
                                onClick={() => item.type === 'STOCK' && onOpenInsights?.({ symbol: item.id, name: item.name })}
                            >
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                <div className="flex flex-col min-w-0">
                                    <span className="text-[9px] font-bold tracking-widest max-w-[80px] truncate leading-tight">
                                        {item.type === 'STOCK' ? item.name : item.id}
                                    </span>
                                    {(item.type === 'INDUSTRY' || item.type === 'THEMATIC') && (
                                        <span className="text-[6px] font-bold text-[var(--accent-primary)] uppercase tracking-tighter">
                                            {item.type === 'INDUSTRY' ? 'Industry Index' : 'Thematic Cluster'}
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSymbol({ symbol: item.id });
                                    }}
                                    className="hover:text-rose-500 transition-colors ml-1 flex-shrink-0"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </m.div>
                        );
                    })}
                </AnimatePresence>

                <div className="flex items-center gap-1.5 glass-card p-1 border border-[var(--ui-divider)] rounded-full relative">
                    {['INDUSTRY', 'THEMATIC'].map(mode => (
                        <button
                            key={mode}
                            onClick={() => {
                                // Batch these updates to prevent flicker/race conditions
                                if (searchMode !== mode) {
                                    setSearchMode(mode);
                                    setSelectedSymbols([]);
                                    setSearchQuery('');
                                }
                            }}
                            className={`px-3 py-1 rounded-full text-[7px] font-bold tracking-widest transition-all ${searchMode === mode
                                ? "bg-[var(--accent-primary)] text-black shadow-[0_0_10px_var(--accent-primary)]"
                                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                                }`}
                        >
                            {mode}
                        </button>
                    ))}

                    <div className="px-1.5 cursor-help opacity-40 hover:opacity-100 transition-opacity group">
                        <Info className="w-3 h-3" />
                        {/* Info Tooltip */}
                        <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-64 p-4 glass-card border border-[var(--accent-primary)]/20 shadow-2xl transition-all opacity-0 invisible group-hover:opacity-100 group-hover:visible z-[100] pointer-events-none">
                            <div className="space-y-3">
                                <div>
                                    <h4 className="text-[9px] font-bold text-[var(--accent-primary)] uppercase tracking-widest mb-1 border-b border-[var(--accent-primary)]/10 pb-1">Industry Mode</h4>
                                    <p className="text-[8px] text-[var(--text-muted)] leading-relaxed">Refined industry classifications mapped from market data. Best for tracking traditional vertical segments.</p>
                                </div>
                                <div>
                                    <h4 className="text-[9px] font-bold text-[var(--accent-primary)] uppercase tracking-widest mb-1 border-b border-[var(--accent-primary)]/10 pb-1">Thematic Mode</h4>
                                    <p className="text-[8px] text-[var(--text-muted)] leading-relaxed">Curated Alpha-Clusters spanning multiple industries. Best for tracking high-conviction trends (e.g. Defense, EV, Rural Cons).</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

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

                <div className="relative flex-grow md:flex-grow-0">
                    <div className="flex items-center gap-2 px-4 py-1.5 glass-card border-dashed border-[var(--ui-divider)] rounded-full hover:border-[var(--accent-primary)] transition-all">
                        <Search className="w-3 h-3 text-[var(--text-muted)]" />
                        <input
                            type="text"
                            placeholder="COMPARE SYMBOL..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent border-none outline-none text-[9px] font-bold tracking-widest w-full md:w-32 uppercase placeholder:text-[var(--ui-muted)]"
                        />
                    </div>

                    {/* Search Results Dropdown */}
                    <AnimatePresence>
                        {searchResults.length > 0 && (
                            <m.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className="absolute top-full left-0 mt-2 w-64 glass-card border border-[var(--ui-divider)] z-50 p-2 shadow-2xl overflow-hidden"
                            >
                                {searchResults.map(res => (
                                    <button
                                        type="button"
                                        key={res.symbol + res.type}
                                        onClick={() => toggleSymbol(res)}
                                        className="w-full flex items-center justify-between p-2 hover:bg-[var(--accent-primary)]/10 rounded cursor-pointer group text-left"
                                    >
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-bold tracking-widest text-[var(--text-main)]">{res.symbol}</span>
                                                {(res.type === 'INDUSTRY' || res.type === 'THEMATIC') && (
                                                    <span className="text-[6px] px-1 bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] rounded h-fit">
                                                        {res.type === 'INDUSTRY' ? 'INDUSTRY' : 'THEMATIC'}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[7px] text-[var(--text-muted)] uppercase tracking-tighter truncate max-w-[150px]">{res.name}</span>
                                        </div>
                                        <Plus className="w-3 h-3 text-[var(--text-muted)] group-hover:text-[var(--accent-primary)]" />
                                    </button>
                                ))}
                            </m.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Chart Area */}
            <div className="glass-card p-4 md:p-10 relative">
                {loading && (
                    <div className="absolute inset-0 bg-[var(--bg-main)]/40 backdrop-blur-[2px] z-20 flex items-center justify-center">
                        <Activity className="w-6 h-6 text-[var(--accent-primary)] animate-pulse" />
                    </div>
                )}
                {totalChartSymbols > MAX_CHART_SYMBOLS && (
                    <div className="absolute top-3 right-3 z-20 px-2 py-1 rounded border border-[var(--ui-divider)] bg-[var(--bg-main)]/80 text-[7px] font-bold tracking-widest uppercase text-[var(--text-muted)]">
                        Showing {MAX_CHART_SYMBOLS} / {totalChartSymbols}
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

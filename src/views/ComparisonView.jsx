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
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const [searchQuery, setSearchQuery] = useState('');
    const [searchMode, setSearchMode] = useState('INDUSTRY');
    const [exchangePreference, _setExchangePreference] = useState(() => localStorage.getItem('tt_comp_exchange') || 'ALL');
    const setExchangePreference = React.useCallback(v => { _setExchangePreference(v); localStorage.setItem('tt_comp_exchange', v); }, []);

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
            const directClusterMatches = Array.from(allClusters.keys())
                .filter(name => name.toLowerCase().includes(q));

            // Identify clusters that contain any of the matched stocks
            const relatedClusters = new Set();
            stockMatches.forEach(stock => {
                allClusters.forEach((constituents, clusterName) => {
                    if (constituents.includes(stock.clean)) {
                        relatedClusters.add(clusterName);
                    }
                });
            });

            const mergedClusterNames = Array.from(new Set([
                ...directClusterMatches,
                ...Array.from(relatedClusters)
            ]));

            const clusterResults = mergedClusterNames.map(name => ({
                symbol: name,
                name: 'Thematic Cluster',
                type: 'THEMATIC',
                constituents: allClusters.get(name)
            }));

            return [...clusterResults, ...stockMatches].slice(0, 10);
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
            <div className="flex flex-wrap gap-2 md:gap-3 items-center">
                <AnimatePresence mode="popLayout">
                    {selectedSymbols.map((item, idx) => {
                        return (
                            <m.div
                                key={item.id}
                                layout
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className={`flex items-center gap-2 px-2.5 py-1 md:px-3 md:py-1.5 glass-card border-[2px] md:border-[3px] rounded-full transition-all ${item.type === 'STOCK' ? 'cursor-pointer hover:border-[var(--accent-primary)]' : ''}`}
                                style={{ borderColor: COLORS[idx % COLORS.length] + '44' }}
                                onClick={() => item.type === 'STOCK' && onOpenInsights?.({ symbol: item.id, name: item.name })}
                            >
                                <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                <div className="flex flex-col min-w-0">
                                    <span className="text-[8px] md:text-[9px] font-bold tracking-widest max-w-[60px] md:max-w-[80px] truncate leading-tight">
                                        {item.type === 'STOCK' ? item.name : item.id}
                                    </span>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSymbol({ symbol: item.id });
                                    }}
                                    className="hover:text-rose-500 transition-colors ml-0.5 md:ml-1 flex-shrink-0"
                                >
                                    <X className="w-2.5 h-2.5 md:w-3 md:h-3" />
                                </button>
                            </m.div>
                        );
                    })}
                </AnimatePresence>

                {/* Left/Center Toggles */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 glass-card p-1 border border-[var(--ui-divider)] rounded-full relative">
                        {['INDUSTRY', 'THEMATIC'].map(mode => (
                            <button
                                key={mode}
                                onClick={() => {
                                    if (searchMode !== mode) {
                                        setSearchMode(mode);
                                        setSelectedSymbols([]);
                                        setSearchQuery('');
                                    }
                                }}
                                className={`px-2 md:px-3 py-1 rounded-full text-[7px] font-bold tracking-widest transition-all ${searchMode === mode
                                    ? "bg-[var(--accent-primary)] text-black shadow-[0_0_10px_var(--accent-primary)]"
                                    : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                                    }`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-1 glass-card p-1 border border-[var(--ui-divider)] rounded-full">
                        {['ALL', 'NSE', 'BSE'].map(ex => (
                            <button
                                key={ex}
                                onClick={() => setExchangePreference(ex)}
                                className={`px-2 md:px-3 py-1 rounded-full text-[7px] font-bold tracking-widest transition-all ${exchangePreference === ex
                                    ? "bg-[var(--accent-primary)] text-black shadow-[0_0_10px_var(--accent-primary)]"
                                    : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                                    }`}
                            >
                                {ex}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Aligned Search */}
                <div className="relative flex-grow md:flex-grow-0 ml-0 md:ml-auto w-full md:w-auto mt-2 md:mt-0">
                    <div className="flex items-center gap-2 px-3 md:px-4 py-1.5 glass-card border-dashed border-[var(--ui-divider)] rounded-full hover:border-[var(--accent-primary)] transition-all">
                        <Search className="w-3 h-3 text-[var(--text-muted)]" />
                        <input
                            type="text"
                            placeholder="SEARCH..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent border-none outline-none text-[8px] md:text-[9px] font-bold tracking-widest w-full md:w-44 uppercase placeholder:text-[var(--ui-muted)]"
                        />
                    </div>

                    <AnimatePresence>
                        {searchResults.length > 0 && (
                            <m.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className="absolute top-full right-0 mt-3 w-72 md:w-80 glass-card border border-[var(--accent-primary)]/20 z-[200] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.9)] bg-[var(--bg-main)] backdrop-blur-3xl overflow-y-auto max-h-[320px] custom-scrollbar"
                            >
                                {searchResults.map(res => (
                                    <button
                                        type="button"
                                        key={res.symbol + res.type}
                                        onClick={() => toggleSymbol(res)}
                                        className="w-full flex items-center justify-between p-2.5 hover:bg-[var(--accent-primary)]/10 rounded cursor-pointer group text-left transition-colors"
                                    >
                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black tracking-widest text-[var(--accent-primary)] uppercase truncate">{res.symbol}</span>
                                                {(res.type === 'INDUSTRY' || res.type === 'THEMATIC') && (
                                                    <span className="text-[6px] px-1 font-bold bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20 rounded uppercase">
                                                        {res.type === 'INDUSTRY' ? 'Sector' : 'Theme'}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[8px] text-[var(--text-muted)] font-bold uppercase tracking-tighter truncate opacity-70">{res.name}</span>
                                        </div>
                                        <Plus className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent-primary)] transition-transform group-hover:scale-110" />
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

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ViewWrapper } from '../components/ViewWrapper';
import { THEMATIC_MAP } from '../data/thematicMap';
import { cn } from '../lib/utils';
import { useThematicHeatmap } from '../hooks/useThematicHeatmap';
import { Search } from 'lucide-react';

const COLUMNS = [
    { label: '1D', key: '1D' },
    { label: '1W', key: '5D' },
    { label: '1M', key: '1M' },
    { label: '6M', key: '6M' },
    { label: 'YTD', key: 'YTD' }
];
const EMPTY_THEME_PERF = Object.freeze({});

const getHeatmapColor = (value) => {
    if (value === null || value === undefined || isNaN(value)) return 'bg-[var(--ui-muted)]/5 text-[var(--text-muted)] opacity-20';
    const num = parseFloat(value);

    // Positive Scale - Emerald with flat borders
    if (num > 10) return 'bg-[#10b981] border border-[#059669] text-white font-black';
    if (num > 5) return 'bg-[#34d399] border border-[#10b981] text-white font-bold';
    if (num > 2) return 'bg-[#6ee7b7] border border-[#34d399] text-[#064e3b] font-bold';
    if (num > 0.5) return 'bg-[#a7f3d0] border border-[#6ee7b7] text-[#064e3b] font-bold';
    if (num > 0) return 'bg-[#ecfdf5] border border-[#a7f3d0] text-[#059669] font-bold';

    // Negative Scale - Rose with flat borders
    if (num < -10) return 'bg-[#f43f5e] border border-[#e11d48] text-white font-black';
    if (num < -5) return 'bg-[#fb7185] border border-[#f43f5e] text-white font-bold';
    if (num < -2) return 'bg-[#fda4af] border border-[#fb7185] text-[#881337] font-bold';
    if (num < -0.5) return 'bg-[#fecdd3] border border-[#fda4af] text-[#881337] font-bold';
    if (num < 0) return 'bg-[#fff1f2] border border-[#fecdd3] text-[#e11d48] font-bold';

    return 'bg-[var(--ui-muted)]/10 border border-[var(--ui-divider)]/20 text-[var(--text-muted)]';
};

const ThemeRow = React.memo(({ theme, companies, themePerf, loading, stockPerfMap, isHighlighted }) => {
    const [isHovered, setIsHovered] = useState(false);
    const count = companies.length;

    return (
        <tr className="group/row relative">
            <td
                className="pr-1 py-0.5 relative cursor-help"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <div className={cn(
                    "flex items-center justify-between gap-1 w-full relative z-10 px-1 py-1 rounded transition-all duration-700",
                    isHighlighted
                        ? "bg-[var(--accent-primary)]/20 shadow-[0_0_20px_rgba(var(--accent-primary-rgb),0.3)] border border-[var(--accent-primary)]/30 scale-[1.02] z-20"
                        : "group-hover/row:bg-[var(--accent-primary)]/5"
                )}>
                    <span className={cn(
                        "text-[8.5px] font-black uppercase tracking-tight leading-tight transition-colors",
                        isHighlighted ? "text-[var(--accent-primary)]" : "text-[var(--text-main)]/90"
                    )}>
                        {theme.name}
                    </span>
                    <span className={cn(
                        "text-[7.5px] font-black flex-shrink-0 font-mono transition-colors",
                        isHighlighted ? "text-[var(--accent-primary)]" : "text-[var(--text-main)]/60 group-hover/row:text-[var(--accent-primary)]"
                    )}>
                        ({count})
                    </span>
                </div>

                {isHovered && companies.length > 0 && (
                    <div
                        className={cn(
                            "absolute right-full top-0 mr-4 z-[100] glass-card p-4 border border-[var(--accent-primary)]/30 shadow-[0_40px_120px_rgba(0,0,0,0.9)] backdrop-blur-3xl pointer-events-none",
                            "bg-[var(--bg-main)] !bg-opacity-100", // Follow theme but stay solid
                            companies.length > 15 ? "w-[680px]" : "w-[340px]"
                        )}
                    >
                        <div className="flex flex-col gap-3">
                            <div className="border-b border-[var(--ui-divider)]/40 pb-2 mb-1 flex justify-between items-end">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent-primary)]">Thematic Composition</span>
                                    <span className="text-[8.5px] font-black text-[var(--text-main)] uppercase tracking-tight">{theme.name}</span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-[7.5px] font-black text-[var(--text-muted)] opacity-80 uppercase tracking-widest">{count} Stocks</span>
                                    <div className="flex gap-0.5 mt-1">
                                        {COLUMNS.map(col => (
                                            <span key={col.key} className="w-7 text-center text-[5.5px] font-black text-[var(--text-muted)] opacity-40 uppercase">{col.label}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className={cn(
                                "grid gap-x-8 gap-y-1",
                                companies.length > 15 ? "grid-cols-2" : "grid-cols-1"
                            )}>
                                {companies.map((stock) => {
                                    const cleaned = stock.symbol.replace(':NSE', '').replace(':BSE', '');
                                    return (
                                        <div key={stock.symbol} className="flex items-center justify-between gap-3 group/item py-0.5 border-b border-[var(--ui-divider)]/10 last:border-0">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <div className="w-5 h-5 flex-shrink-0 rounded-sm overflow-hidden bg-white/5 p-0.5 flex items-center justify-center border border-[var(--ui-divider)]/10">
                                                    <img
                                                        src={`https://images.dhan.co/symbol/${stock.symbol}.png`}
                                                        alt=""
                                                        className="w-full h-full object-contain"
                                                        onError={(e) => {
                                                            e.target.style.display = 'none';
                                                            e.target.nextSibling.style.display = 'flex';
                                                        }}
                                                    />
                                                    <div className="hidden w-full h-full items-center justify-center bg-[var(--accent-primary)]/10">
                                                        <span className="text-[6px] font-bold text-[var(--accent-primary)]">
                                                            {stock.symbol.charAt(0)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-[7.5px] font-black uppercase tracking-tight text-[var(--text-main)] truncate">
                                                        {stock.name}
                                                    </span>
                                                    <span className="text-[6px] font-bold text-[var(--text-muted)] opacity-30 uppercase font-mono">
                                                        {stock.symbol}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Stock Specific Performance Grid */}
                                            <div className="flex items-center gap-0.5 flex-shrink-0">
                                                {COLUMNS.map(col => {
                                                    const perfMap = stockPerfMap.get(col.key);
                                                    const data = perfMap?.get(cleaned);
                                                    const val = data?.changePct;
                                                    const displayVal = val !== null && val !== undefined ? (val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)) : '-';

                                                    return (
                                                        <div
                                                            key={col.key}
                                                            className={cn(
                                                                "w-7 h-4 flex items-center justify-center text-[6px] rounded-[2px] border transition-colors",
                                                                getHeatmapColor(val)
                                                            )}
                                                        >
                                                            {displayVal}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </td>
            {COLUMNS.map(col => {
                const val = themePerf[col.key];
                const displayVal = val !== null && val !== undefined ? (val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)) : '-';
                const numVal = val !== null ? parseFloat(val) : null;

                return (
                    <td key={col.key} className="p-0">
                        <div className={cn(
                            "h-5.5 flex items-center justify-center text-[7px] border rounded-[4px] transition-all duration-500",
                            loading ? "animate-pulse bg-[var(--ui-muted)]/5" : getHeatmapColor(numVal)
                        )}>
                            <span className="line-clamp-1">{displayVal}{numVal !== null && '%'}</span>
                        </div>
                    </td>
                );
            })}
        </tr>
    );
}, (prevProps, nextProps) => {
    if (prevProps.loading !== nextProps.loading) return false;
    if (prevProps.theme !== nextProps.theme) return false;
    if (prevProps.companies !== nextProps.companies) return false;
    if (prevProps.stockPerfMap !== nextProps.stockPerfMap) return false;
    if (prevProps.isHighlighted !== nextProps.isHighlighted) return false;

    return COLUMNS.every(({ key }) => prevProps.themePerf[key] === nextProps.themePerf[key]);
});

const ThemeBlock = React.memo(({ block, themeCompaniesMap, heatmapData, loading, stockPerfMap, highlightedTheme }) => {
    const blockId = `block-${block.title.toLowerCase().replace(/[^a-z0-s]/g, '-')}`;

    return (
        <div id={blockId} className="flex flex-col h-full group/block transition-all duration-700 scroll-mt-32">
            <div className="px-2 py-3 border-b border-[var(--ui-divider)]/40 bg-transparent flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--accent-primary)]">
                    {block.title}
                </h3>
            </div>

            <div className="flex-1 overflow-visible px-1">
                <table className="w-full text-left border-separate border-spacing-x-1 border-spacing-y-1.5 table-fixed">
                    <thead>
                        <tr className="opacity-40">
                            <th className="px-1 text-[6.5px] font-black uppercase tracking-[0.1em] text-[var(--text-muted)] w-[40%]">Cluster</th>
                            {COLUMNS.map(col => (
                                <th key={col.key} className="px-0 text-[6.5px] font-black uppercase tracking-[0.1em] text-[var(--text-muted)] text-center w-[12%]">{col.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="align-middle">
                        {block.themes.map((theme) => (
                            <ThemeRow
                                key={theme.name}
                                theme={theme}
                                companies={themeCompaniesMap[theme.name] || []}
                                themePerf={heatmapData[theme.name] || EMPTY_THEME_PERF}
                                loading={loading}
                                stockPerfMap={stockPerfMap}
                                isHighlighted={highlightedTheme === theme.name}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
});

const Legend = () => (
    <div className="flex items-center gap-8 px-6 py-2.5 glass-card border-[var(--ui-divider)]/20 rounded-full mb-10 w-fit bg-[var(--bg-main)]/40 shadow-xl">
        <span className="text-[7.5px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Performance Analytics</span>
        <div className="flex items-center gap-2">
            {[
                { label: '-5%', color: 'bg-[#f43f5e]' },
                { label: 'Neg', color: 'bg-[#fecdd3]' },
                { label: '0%', color: 'bg-[var(--ui-muted)]/20' },
                { label: 'Pos', color: 'bg-[#a7f3d0]' },
                { label: '+5%', color: 'bg-[#10b981]' }
            ].map((item, idx) => (
                <div key={idx} className="flex flex-col gap-1 items-center">
                    <div className={cn("w-8 h-1 rounded-full", item.color)} />
                    <span className={cn("text-[5.5px] font-black uppercase tracking-tighter text-[var(--text-muted)]")}>{item.label}</span>
                </div>
            ))}
        </div>
    </div>
);

export const MarketMapView = ({ hierarchy }) => {
    const [hideBSE, setHideBSE] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [highlightedTheme, setHighlightedTheme] = useState(null);
    const searchRef = useRef(null);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0, width: 0 });

    useEffect(() => {
        if (isSearchFocused && searchRef.current) {
            const rect = searchRef.current.getBoundingClientRect();
            setDropdownPos({
                top: rect.bottom + window.scrollY + 6,
                right: window.innerWidth - rect.right,
                width: rect.width
            });
        }
    }, [isSearchFocused, searchQuery]);

    // Helper to detect BSE-only stocks (usually numeric codes that lack logos in Dhan infra)
    const isBSESymbol = (symbol) => {
        if (!symbol) return false;
        // Check if numeric (typical for BSE only scripts like "532540")
        return /^\d+$/.test(symbol) || symbol.includes(':BSE');
    };

    const filteredHierarchy = useMemo(() => {
        if (!hierarchy) return null;
        if (!hideBSE) return hierarchy;

        const newHierarchy = {};
        Object.keys(hierarchy).forEach(sector => {
            newHierarchy[sector] = {};
            Object.keys(hierarchy[sector]).forEach(industry => {
                newHierarchy[sector][industry] = hierarchy[sector][industry].filter(c => !isBSESymbol(c.symbol));
            });
        });
        return newHierarchy;
    }, [hierarchy, hideBSE]);

    const industryMap = useMemo(() => {
        const map = {};
        if (!filteredHierarchy) return map;
        Object.keys(filteredHierarchy).forEach(sector => {
            const industries = filteredHierarchy[sector];
            if (industries) {
                Object.keys(industries).forEach(ind => {
                    map[ind] = industries[ind];
                });
            }
        });
        return map;
    }, [filteredHierarchy]);

    const symbolNameMap = useMemo(() => {
        const map = new Map();
        Object.keys(industryMap).forEach((industry) => {
            const companies = industryMap[industry];
            if (!Array.isArray(companies)) return;
            companies.forEach((company) => {
                if (company?.symbol && !map.has(company.symbol)) {
                    map.set(company.symbol, company.name || company.symbol);
                }
            });
        });
        return map;
    }, [industryMap]);

    const themeCompaniesMap = useMemo(() => {
        const next = {};

        THEMATIC_MAP.forEach((block) => {
            block.themes.forEach((theme) => {
                const symbolToName = new Map();

                if (theme.industries) {
                    theme.industries.forEach((industry) => {
                        const companies = industryMap[industry];
                        if (!Array.isArray(companies)) return;
                        companies.forEach((company) => {
                            if (company?.symbol && !symbolToName.has(company.symbol)) {
                                symbolToName.set(company.symbol, company.name || company.symbol);
                            }
                        });
                    });
                }

                if (theme.symbols) {
                    theme.symbols.forEach((symbol) => {
                        if (!symbolToName.has(symbol)) {
                            symbolToName.set(symbol, symbolNameMap.get(symbol) || symbol);
                        }
                    });
                }

                next[theme.name] = Array.from(symbolToName.entries())
                    .map(([symbol, name]) => ({ symbol, name }))
                    .sort((a, b) => a.name.localeCompare(b.name));
            });
        });

        return next;
    }, [industryMap, symbolNameMap]);

    // Search Index
    const searchIndex = useMemo(() => {
        const index = [];
        THEMATIC_MAP.forEach(block => {
            block.themes.forEach(theme => {
                const companies = themeCompaniesMap[theme.name] || [];
                companies.forEach(company => {
                    index.push({
                        ...company,
                        themeName: theme.name,
                        groupTitle: block.title,
                        blockId: `block-${block.title.toLowerCase().replace(/[^a-z0-s]/g, '-')}`
                    });
                });
            });
        });
        return index;
    }, [themeCompaniesMap]);

    const searchResults = useMemo(() => {
        if (!searchQuery.trim() || searchQuery.length < 2) return [];
        const q = searchQuery.toLowerCase();

        // Remove duplicates and filter
        const seen = new Set();
        return searchIndex.filter(item => {
            const matches = item.name.toLowerCase().includes(q) || item.symbol.toLowerCase().includes(q);
            if (matches && !seen.has(item.symbol)) {
                seen.add(item.symbol);
                return true;
            }
            return false;
        }).slice(0, 8);
    }, [searchIndex, searchQuery]);

    const scrollToBlock = (blockId, themeName) => {
        const el = document.getElementById(blockId);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            if (themeName) {
                setHighlightedTheme(themeName);
                setTimeout(() => setHighlightedTheme(null), 3500);
            }
            setSearchQuery('');
            setIsSearchFocused(false);
        }
    };

    const { heatmapData, stockPerfMap, loading } = useThematicHeatmap(THEMATIC_MAP, filteredHierarchy);

    return (
        <ViewWrapper id="market-map" className="space-y-12 pb-32 !overflow-visible">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-[var(--ui-divider)]/40 pb-8 relative z-[60] !overflow-visible">
                <div className="space-y-2 relative z-10">
                    <h2 className="text-3xl font-light tracking-[0.5em] uppercase opacity-90 text-glow-gold">
                        Market <span className="text-[var(--accent-primary)]">Architecture</span>
                    </h2>
                    <p className="text-[10px] font-black leading-relaxed tracking-[0.4em] text-[var(--accent-primary)] uppercase opacity-60">
                        {hideBSE ? 'Institutional Alpha (NSE Focus)' : 'Deep Thematic Mapping (Global)'}
                    </p>
                </div>

                {/* Visual Flair */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-[var(--accent-primary)]/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2 animate-pulse" />

                <div className="flex items-center gap-6 relative z-10 w-full md:w-auto">
                    {/* Search Bar */}
                    <div ref={searchRef} className="relative md:w-56 z-[100]">
                        <div className={cn(
                            "flex items-center gap-2.5 px-3.5 py-1.5 glass-card border-[var(--ui-divider)]/30 bg-[var(--bg-main)]/20 rounded-full transition-all duration-300",
                            isSearchFocused && "border-[var(--accent-primary)]/40 bg-[var(--bg-main)]/40 shadow-[0_0_20px_rgba(var(--accent-primary-rgb),0.05)]"
                        )}>
                            <Search className={cn(
                                "w-3 h-3 transition-colors",
                                isSearchFocused ? "text-[var(--accent-primary)]" : "text-[var(--text-muted)]/40"
                            )} />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => setIsSearchFocused(true)}
                                placeholder="FIND STOCKS..."
                                className="bg-transparent border-none outline-none text-[7.5px] font-bold uppercase tracking-[0.15em] text-[var(--text-main)] placeholder:text-[var(--text-muted)] placeholder:opacity-30 w-full"
                            />
                        </div>

                        {/* Portal-based Search Results */}
                        {isSearchFocused && searchResults.length > 0 && createPortal(
                            <div
                                style={{
                                    position: 'absolute',
                                    top: dropdownPos.top,
                                    right: dropdownPos.right,
                                    width: dropdownPos.width,
                                    zIndex: 10000
                                }}
                                className="glass-card bg-[var(--bg-main)] !bg-opacity-100 border border-[var(--ui-divider)]/40 shadow-[0_20px_40px_rgba(0,0,0,0.4)] rounded-xl overflow-hidden max-h-[320px] overflow-y-auto no-scrollbar"
                            >
                                <div className="p-1 space-y-0.5">
                                    {searchResults.map((result, idx) => (
                                        <button
                                            key={`${result.symbol}-${idx}`}
                                            onClick={() => scrollToBlock(result.blockId, result.themeName)}
                                            className="w-full flex items-center justify-between py-1.5 px-2.5 hover:bg-[var(--accent-primary)]/5 rounded-lg transition-colors group/res"
                                        >
                                            <div className="flex flex-col items-start min-w-0">
                                                <span className="text-[7.5px] font-bold uppercase tracking-tight text-[var(--text-main)]/90 truncate">
                                                    {result.name}
                                                </span>
                                                <span className="text-[5.5px] font-medium text-[var(--text-muted)] opacity-30 uppercase">
                                                    {result.symbol}
                                                </span>
                                            </div>
                                            <span className="text-[5px] font-black text-[var(--accent-primary)]/60 uppercase tracking-tighter bg-[var(--accent-primary)]/5 px-1 py-0.5 rounded-sm flex-shrink-0 ml-2">
                                                {result.groupTitle.split(' ')[0]}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>,
                            document.body
                        )}

                        {/* Overlay to close search */}
                        {isSearchFocused && (
                            <div
                                className="fixed inset-0 z-[-1]"
                                onClick={() => setIsSearchFocused(false)}
                            />
                        )}
                    </div>

                    <button
                        onClick={() => setHideBSE(!hideBSE)}
                        className={cn(
                            "flex items-center gap-3 px-5 py-2.5 rounded-full border transition-all duration-700 group/btn",
                            hideBSE
                                ? "bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]/30 text-[var(--accent-primary)] shadow-[0_0_20px_rgba(var(--accent-primary-rgb),0.1)]"
                                : "bg-transparent border-[var(--ui-divider)]/40 text-[var(--text-muted)] hover:border-[var(--accent-primary)]/20"
                        )}
                    >
                        <div className={cn(
                            "w-1.5 h-1.5 rounded-full transition-all duration-700",
                            hideBSE ? "bg-[var(--accent-primary)] shadow-[0_0_10px_var(--accent-primary)]" : "bg-[var(--text-muted)] opacity-30 group-hover/btn:opacity-100"
                        )} />
                        <span className="text-[8.5px] font-black uppercase tracking-[0.25em]">
                            {hideBSE ? 'NSE PRIMARY' : 'SHOW ALL'}
                        </span>
                    </button>
                </div>
            </div>

            <div className="max-w-[1800px] mx-auto">
                <Legend />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-8 gap-y-12 auto-rows-fr">
                    {THEMATIC_MAP.map((block, idx) => (
                        <ThemeBlock
                            key={block.title || idx}
                            block={block}
                            themeCompaniesMap={themeCompaniesMap}
                            heatmapData={heatmapData}
                            loading={loading}
                            stockPerfMap={stockPerfMap}
                            highlightedTheme={highlightedTheme}
                        />
                    ))}
                </div>
            </div>
        </ViewWrapper>
    );
};

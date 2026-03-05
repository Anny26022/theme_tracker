import React, { startTransition, useDeferredValue, useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ViewWrapper } from '../components/ViewWrapper';
import { THEMATIC_MAP, MACRO_PILLARS } from '../data/thematicMap';
import { cn } from '../lib/utils';
import { useThematicHeatmap } from '../hooks/useThematicHeatmap';
import { Search, X, BarChart3, LayoutGrid } from 'lucide-react';
import { UniverseLoader } from '../components/UniverseLoader';
import { WatchlistSyncCard } from '../components/WatchlistSyncCard';
import ThematicGridChartView from './ThematicGridChartView';

const COLUMNS = [
    { label: '1D', key: '1D' },
    { label: '1W', key: '5D' },
    { label: '1M', key: '1M' },
    { label: '3M', key: '3M' },
    { label: '6M', key: '6M' },
    { label: '12M', key: '1Y' },
    { label: 'YTD', key: 'YTD' }
];
const EMPTY_THEME_PERF = Object.freeze({});
const EMPTY_OBJECT = Object.freeze({});
const EMPTY_ARRAY = Object.freeze([]);
const BLOCK_PREFETCH_ROOT_MARGIN = '160px 0px';
const INITIAL_VISIBLE_BLOCKS = 1;
const makeBlockId = (title) => `block-${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

const isBSESymbol = (symbol) => {
    if (!symbol) return false;
    return /^\d+$/.test(symbol) || symbol.includes(':BSE');
};

const buildIndustryMap = (sourceHierarchy) => {
    if (!sourceHierarchy) return EMPTY_OBJECT;

    const map = {};
    Object.keys(sourceHierarchy).forEach((sector) => {
        const industries = sourceHierarchy[sector];
        if (!industries) return;
        Object.keys(industries).forEach((industry) => {
            map[industry] = industries[industry];
        });
    });
    return map;
};

const buildSymbolNameMap = (industryMap) => {
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
};

const buildThemeCompaniesMap = (industryMap, symbolNameMap) => {
    const next = {};
    // Global set — once a symbol is assigned to a theme, it won't appear in any other.
    const assigned = new Set();

    // PASS 1: Explicit symbols get priority (hand-curated = most intentional).
    // First explicit mention wins across the entire map.
    THEMATIC_MAP.forEach((block) => {
        block.themes.forEach((theme) => {
            if (!theme.symbols) return;
            if (!next[theme.name]) next[theme.name] = new Map();
            theme.symbols.forEach((symbol) => {
                if (assigned.has(symbol)) return;
                assigned.add(symbol);
                next[theme.name].set(symbol, symbolNameMap.get(symbol) || symbol);
            });
        });
    });

    // PASS 2: Industry-based companies fill remaining slots.
    // Only added if the symbol hasn't already been claimed by an explicit listing
    // or by an earlier industry theme.
    THEMATIC_MAP.forEach((block) => {
        block.themes.forEach((theme) => {
            if (!theme.industries) return;
            if (!next[theme.name]) next[theme.name] = new Map();
            theme.industries.forEach((industry) => {
                const companies = industryMap[industry];
                if (!Array.isArray(companies)) return;
                companies.forEach((company) => {
                    if (!company?.symbol) return;
                    if (assigned.has(company.symbol)) return;
                    assigned.add(company.symbol);
                    next[theme.name].set(company.symbol, company.name || company.symbol);
                });
            });
        });
    });

    // Convert Maps to sorted arrays
    const result = {};
    for (const [themeName, symMap] of Object.entries(next)) {
        result[themeName] = Array.from(symMap.entries())
            .map(([symbol, name]) => ({ symbol, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }
    return result;
};

const buildNseThemeCompaniesMap = (allThemeCompaniesMap) => {
    const next = {};

    Object.keys(allThemeCompaniesMap || {}).forEach((themeName) => {
        const allCompanies = allThemeCompaniesMap[themeName] || EMPTY_ARRAY;
        const filtered = allCompanies.filter((company) => !isBSESymbol(company.symbol));
        // Preserve referential identity when no BSE symbols were present.
        next[themeName] = filtered.length === allCompanies.length ? allCompanies : filtered;
    });

    return next;
};

const buildSyncData = (mapSource, themeCompaniesMap) => {
    const sectors = mapSource.map((group) => group.title);
    const hierarchy = {};
    const allIndustries = [];

    mapSource.forEach((group) => {
        hierarchy[group.title] = {};
        (group.themes || []).forEach((theme) => {
            const companies = themeCompaniesMap[theme.name] || EMPTY_ARRAY;
            hierarchy[group.title][theme.name] = companies;
            allIndustries.push({ name: theme.name, sector: group.title, count: companies.length });
        });
    });

    return { sectors, hierarchy, allIndustries };
};

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

const CompositionCard = ({ theme, companies, stockPerfMap, stockPerfMapRef, onClose, isMobile }) => {
    const count = companies.length;
    const perfMap = stockPerfMapRef?.current ?? stockPerfMap;
    const hasAnyMissingData = useMemo(() => {
        if (!perfMap || perfMap.size === 0) return false;
        return companies.some(stock => {
            const cleaned = stock.symbol.replace(':NSE', '').replace(':BSE', '');
            return COLUMNS.some(col => {
                const val = perfMap.get(col.key)?.get(cleaned)?.changePct;
                return val === null || val === undefined;
            });
        });
    }, [companies, perfMap]);

    return (
        <div className="flex flex-col gap-3">
            <div className="border-b border-[var(--ui-divider)]/40 pb-2 mb-1 flex justify-between items-end">
                <div className="flex flex-col">
                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--accent-primary)]">Thematic Composition</span>
                    <span className="text-[10px] font-black text-[var(--text-main)] uppercase tracking-tight">{theme.name}</span>
                </div>
                <div className="flex flex-col items-end gap-2">
                    {isMobile && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onClose(); }}
                            className="p-1.5 bg-white/5 rounded-full hover:bg-white/10 transition-colors"
                        >
                            <X size={12} className="text-[var(--text-muted)]" />
                        </button>
                    )}
                    <div className="text-right">
                        <span className="text-[7.5px] font-black text-[var(--text-muted)] opacity-80 uppercase tracking-widest">{count} Stocks</span>
                        <div className="flex gap-0.5 mt-1">
                            {COLUMNS.map(col => (
                                <span key={col.key} className="w-9 text-center text-[7px] font-black text-[var(--text-muted)] opacity-40 uppercase">{col.label}</span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div className={cn(
                "grid gap-x-8 gap-y-1 overflow-y-auto max-h-[60vh] no-scrollbar",
                companies.length > 15 && !isMobile ? "grid-cols-2" : "grid-cols-1"
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
                                    <span className="text-[9px] font-black uppercase tracking-tight text-[var(--text-main)] whitespace-normal leading-tight flex items-center gap-1">
                                        {stock.name}
                                        {(() => {
                                            const cleaned = stock.symbol.replace(':NSE', '').replace(':BSE', '');
                                            const hasData = COLUMNS.some(col => {
                                                const val = perfMap?.get(col.key)?.get(cleaned)?.changePct;
                                                return val !== null && val !== undefined;
                                            });
                                            return !hasData && <span className="text-[var(--accent-primary)] animate-pulse">*</span>;
                                        })()}
                                    </span>
                                    <span className="text-[6px] font-bold text-[var(--text-muted)] opacity-30 uppercase font-mono">
                                        {stock.symbol}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                                {COLUMNS.map(col => {
                                    const intervalMap = perfMap?.get(col.key);
                                    const data = intervalMap?.get(cleaned);
                                    const val = data?.changePct;
                                    const displayVal = val !== null && val !== undefined ? (val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)) : '-';
                                    return (
                                        <div
                                            key={col.key}
                                            className={cn(
                                                "w-9 h-5 flex items-center justify-center text-[8.5px] rounded-[2px] border transition-colors",
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

            {hasAnyMissingData && (
                <div className="mt-4 pt-4 border-t border-[var(--ui-divider)]/40 bg-[var(--accent-primary)]/[0.03] -mx-4 px-4 pb-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--accent-primary)] mb-2.5 flex items-center gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] shadow-[0_0_8px_var(--accent-primary)]"></span>
                        CALCULATION POOL ADVISORY
                    </p>
                    <div className="space-y-3.5">
                        <p className="text-[9px] font-bold text-[var(--text-main)] opacity-90 leading-relaxed uppercase tracking-tight italic">
                            Stocks marked with <span className="text-[var(--accent-primary)] font-black text-[12px]">*</span> (or showing <span className="font-mono bg-white/10 px-1 rounded text-[var(--accent-primary)]">-</span>) have no fetched price data for the selected timeframe.
                        </p>
                        <p className="text-[8.5px] font-medium text-[var(--text-muted)] opacity-80 leading-normal uppercase tracking-wide">
                            These symbols are <span className="text-[var(--text-main)] font-black underline decoration-[var(--accent-primary)] underline-offset-4 decoration-2">completely excluded</span> from the thematic performance calculation pool to ensure statistical accuracy.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

const ThemeRow = React.memo(({ theme, companies, themePerf, loading, stockPerfMapRef, isHighlighted, isMobile, alignPopover = 'right', onSelect }) => {
    const [isHovered, setIsHovered] = useState(false);
    const count = companies.length;

    const showPopover = isHovered && companies.length > 0;

    return (
        <tr className="group/row relative">
            <td
                className="pr-1 py-0.5 relative cursor-pointer md:cursor-help"
                onMouseEnter={() => !isMobile && setIsHovered(true)}
                onMouseLeave={() => !isMobile && setIsHovered(false)}
                onClick={() => {
                    if (isMobile) setIsHovered((prev) => !prev);
                    else onSelect?.(theme.name);
                }}
            >
                <div className={cn(
                    "flex items-center justify-between gap-1 w-full relative z-10 px-1 py-1 rounded transition-all duration-700",
                    isHighlighted
                        ? "bg-[var(--accent-primary)]/20 shadow-[0_0_20px_rgba(var(--accent-primary-rgb),0.3)] border border-[var(--accent-primary)]/30 scale-[1.02] z-20"
                        : "group-hover/row:bg-[var(--accent-primary)]/5"
                )}>
                    <span className={cn(
                        "text-[10.5px] font-black uppercase tracking-tight leading-tight transition-colors",
                        isHighlighted ? "text-[var(--accent-primary)]" : "text-[var(--text-main)]/90"
                    )}>
                        {theme.name}
                    </span>
                    <span className={cn(
                        "text-[8.5px] font-black flex-shrink-0 font-mono transition-colors",
                        isHighlighted ? "text-[var(--accent-primary)]" : "text-[var(--text-main)]/60 group-hover/row:text-[var(--accent-primary)]"
                    )}>
                        ({count})
                    </span>
                </div>

                {showPopover && (
                    isMobile ? createPortal(
                        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setIsHovered(false)}>
                            <div
                                className="w-full max-w-[95vw] glass-card p-4 border border-[var(--accent-primary)]/30 shadow-2xl !bg-[var(--bg-main)] !opacity-100"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <CompositionCard
                                    theme={theme}
                                    companies={companies}
                                    stockPerfMapRef={stockPerfMapRef}
                                    onClose={() => setIsHovered(false)}
                                    isMobile={true}
                                />
                            </div>
                        </div>,
                        document.body
                    ) : (
                        <div
                            className={cn(
                                "absolute top-8 z-[100] glass-card p-4 border border-[var(--accent-primary)]/30 shadow-[0_40px_120px_rgba(0,0,0,0.9)] pointer-events-none",
                                "!bg-[var(--bg-main)] !opacity-100",
                                companies.length > 15 ? "w-[800px]" : "w-[400px]",
                                alignPopover === 'right' ? "left-full ml-6" : "right-full mr-6"
                            )}
                        >
                            <CompositionCard
                                theme={theme}
                                companies={companies}
                                stockPerfMapRef={stockPerfMapRef}
                                isMobile={false}
                            />
                        </div>
                    )
                )}
            </td>
            {COLUMNS.map(col => {
                const val = themePerf[col.key];
                const displayVal = val !== null && val !== undefined ? (val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)) : '-';
                const numVal = val !== null ? parseFloat(val) : null;

                return (
                    <td key={col.key} className="p-0 pl-1">
                        <div className={cn(
                            "h-5.5 flex items-center justify-center text-[8.5px] border rounded-[4px] transition-all duration-500",
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
    if (prevProps.stockPerfMapRef !== nextProps.stockPerfMapRef) return false;
    if (prevProps.isHighlighted !== nextProps.isHighlighted) return false;
    if (prevProps.isMobile !== nextProps.isMobile) return false;
    if (prevProps.alignPopover !== nextProps.alignPopover) return false;

    return COLUMNS.every(({ key }) => prevProps.themePerf[key] === nextProps.themePerf[key]);
});

const ThemeBlock = React.memo(({ block, themeCompaniesMap, heatmapData, loading, stockPerfMapRef, highlightedTheme, isMobile, alignPopover, onSelect }) => {
    return (
        <div className="flex flex-col h-full group/block transition-all duration-700">
            <div className="px-2 py-3 border-b border-[var(--ui-divider)]/40 bg-transparent flex items-center justify-between mb-2 group/header relative">
                <h3 className="text-[12.5px] font-black uppercase tracking-[0.2em] text-[var(--accent-primary)]">
                    {block.title}
                </h3>
                {onSelect && (
                    <button
                        onClick={() => {
                            // Determine all companies in this block
                            const allBlockCompanies = block.themes.flatMap(t => themeCompaniesMap[t.name] || []);
                            // We can either pass a composite "theme" or just the first theme name
                            // For now, let's select the first theme to open the view, or we could handle "Block" selections in ChartView
                            if (block.themes.length > 0) {
                                onSelect(block.themes[0].name);
                            }
                        }}
                        className="p-1.5 hover:bg-[var(--accent-primary)]/10 rounded-full transition-colors opacity-0 group-hover/header:opacity-100"
                        title="View Group Charts"
                    >
                        <BarChart3 size={11} className="text-[var(--accent-primary)]" />
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-visible px-1">
                <table className="w-full text-left border-separate border-spacing-x-1 border-spacing-y-1.5 table-fixed">
                    <thead>
                        <tr className="opacity-40">
                            <th className="px-1 text-[8px] font-black uppercase tracking-[0.1em] text-[var(--text-muted)] w-[37%]">Cluster</th>
                            {COLUMNS.map(col => (
                                <th key={col.key} className="px-0 text-[8px] font-black uppercase tracking-[0.1em] text-[var(--text-muted)] text-center w-[9%]">{col.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="align-middle">
                        {block.themes.map((theme) => (
                            <ThemeRow
                                key={theme.name}
                                theme={theme}
                                companies={themeCompaniesMap[theme.name] || EMPTY_ARRAY}
                                themePerf={heatmapData[theme.name] || EMPTY_THEME_PERF}
                                loading={loading}
                                stockPerfMapRef={stockPerfMapRef}
                                isHighlighted={highlightedTheme === theme.name}
                                isMobile={isMobile}
                                alignPopover={alignPopover}
                                onSelect={onSelect}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
});

const estimateBlockHeight = (themeCount) => Math.max(260, 84 + (Math.max(1, themeCount) * 30));

const ThemeBlockSkeleton = ({ themeCount = 1 }) => (
    <div
        className="rounded-xl border border-[var(--ui-divider)]/20 bg-[var(--bg-main)]/15"
        style={{ height: `${estimateBlockHeight(themeCount)}px` }}
    />
);

const buildInitialVisibleIds = (mapSource) => {
    const ids = new Set();
    mapSource.slice(0, INITIAL_VISIBLE_BLOCKS).forEach((block) => {
        ids.add(makeBlockId(block.title));
    });
    return ids;
};

const buildVisibleIdsFromMap = (visibilityMap, mapSource) => {
    const ids = new Set();
    mapSource.forEach((block) => {
        const id = makeBlockId(block.title);
        if (visibilityMap.get(id)) ids.add(id);
    });
    return ids;
};

const areThemePerfValuesEqual = (prevPerf = EMPTY_THEME_PERF, nextPerf = EMPTY_THEME_PERF) => (
    COLUMNS.every(({ key }) => prevPerf?.[key] === nextPerf?.[key])
);

const doesBlockNeedUpdate = (prevProps, nextProps) => {
    const themeNames = prevProps.block?.themes?.map((theme) => theme.name) || EMPTY_ARRAY;

    for (const themeName of themeNames) {
        if ((prevProps.themeCompaniesMap?.[themeName] || EMPTY_ARRAY) !== (nextProps.themeCompaniesMap?.[themeName] || EMPTY_ARRAY)) {
            return true;
        }
        if (!areThemePerfValuesEqual(prevProps.heatmapData?.[themeName], nextProps.heatmapData?.[themeName])) {
            return true;
        }
    }

    if (prevProps.highlightedTheme !== nextProps.highlightedTheme) {
        const prevHighlightedInBlock = prevProps.highlightedTheme && themeNames.includes(prevProps.highlightedTheme);
        const nextHighlightedInBlock = nextProps.highlightedTheme && themeNames.includes(nextProps.highlightedTheme);
        if (prevHighlightedInBlock || nextHighlightedInBlock) return true;
    }

    return false;
};

const DeferredThemeBlock = React.memo(({
    block,
    blockId,
    isVisible,
    attachRef,
    alignPopover,
    themeCompaniesMap,
    heatmapData,
    loading,
    stockPerfMapRef,
    highlightedTheme,
    isMobile,
    onSelect
}) => {
    return (
        <div id={blockId} ref={attachRef} data-block-id={blockId} className="scroll-mt-32 min-h-[220px]">
            {isVisible ? (
                <ThemeBlock
                    block={block}
                    themeCompaniesMap={themeCompaniesMap}
                    heatmapData={heatmapData}
                    loading={loading}
                    stockPerfMapRef={stockPerfMapRef}
                    highlightedTheme={highlightedTheme}
                    isMobile={isMobile}
                    alignPopover={alignPopover}
                    onSelect={onSelect}
                />
            ) : (
                <ThemeBlockSkeleton themeCount={block?.themes?.length || 1} />
            )}
        </div>
    );
}, (prevProps, nextProps) => {
    if (prevProps.block !== nextProps.block) return false;
    if (prevProps.blockId !== nextProps.blockId) return false;
    if (prevProps.isVisible !== nextProps.isVisible) return false;
    if (prevProps.attachRef !== nextProps.attachRef) return false;
    if (prevProps.alignPopover !== nextProps.alignPopover) return false;
    if (!prevProps.isVisible && !nextProps.isVisible) return true;
    if (prevProps.loading !== nextProps.loading) return false;
    if (prevProps.stockPerfMapRef !== nextProps.stockPerfMapRef) return false;
    if (prevProps.isMobile !== nextProps.isMobile) return false;
    if (prevProps.onSelect !== nextProps.onSelect) return false;
    return !doesBlockNeedUpdate(prevProps, nextProps);
});
DeferredThemeBlock.displayName = 'DeferredThemeBlock';

const ThemeGrid = React.memo(({ mapSource, gridClassName, isMobile, themeCompaniesMap, heatmapData, loading, stockPerfMapRef, highlightedTheme, onSelect }) => {
    const [visibleIds, setVisibleIds] = useState(() => buildInitialVisibleIds(mapSource));
    const visibilityRef = useRef(new Map());
    const nodeRefs = useRef(new Map());
    const refCallbacks = useRef(new Map());

    useEffect(() => {
        const initialIds = buildInitialVisibleIds(mapSource);
        const validIds = new Set();
        const nextVisibility = new Map();
        mapSource.forEach((block) => {
            const id = makeBlockId(block.title);
            validIds.add(id);
            nextVisibility.set(id, initialIds.has(id));
        });

        refCallbacks.current.forEach((_, id) => {
            if (!validIds.has(id)) refCallbacks.current.delete(id);
        });
        nodeRefs.current.forEach((_, id) => {
            if (!validIds.has(id)) nodeRefs.current.delete(id);
        });

        visibilityRef.current = nextVisibility;
        setVisibleIds(initialIds);
    }, [mapSource]);

    const attachNodeRef = useCallback((blockId, node) => {
        if (node) {
            nodeRefs.current.set(blockId, node);
        } else {
            nodeRefs.current.delete(blockId);
        }
    }, []);

    const getAttachRef = useCallback((blockId) => {
        const existing = refCallbacks.current.get(blockId);
        if (existing) return existing;

        const callback = (node) => attachNodeRef(blockId, node);
        refCallbacks.current.set(blockId, callback);
        return callback;
    }, [attachNodeRef]);

    useEffect(() => {
        if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
            setVisibleIds(() => new Set(mapSource.map((block) => makeBlockId(block.title))));
            return undefined;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                let hasChanges = false;
                entries.forEach((entry) => {
                    const id = entry.target.getAttribute('data-block-id');
                    if (!id) return;
                    const prevValue = !!visibilityRef.current.get(id);
                    const nextValue = entry.isIntersecting;
                    if (prevValue === nextValue) return;
                    visibilityRef.current.set(id, nextValue);
                    hasChanges = true;
                });

                if (!hasChanges) return;
                const nextIds = buildVisibleIdsFromMap(visibilityRef.current, mapSource);
                setVisibleIds(nextIds.size > 0 ? nextIds : buildInitialVisibleIds(mapSource));
            },
            { root: null, rootMargin: isMobile ? '320px 0px' : BLOCK_PREFETCH_ROOT_MARGIN, threshold: 0.01 }
        );

        nodeRefs.current.forEach((node) => {
            observer.observe(node);
        });

        return () => observer.disconnect();
    }, [mapSource, isMobile]);

    return (
        <div className={gridClassName}>
            {mapSource.map((block, idx) => {
                const blockId = makeBlockId(block.title);
                return (
                    <DeferredThemeBlock
                        key={block.title || idx}
                        block={block}
                        blockId={blockId}
                        isVisible={visibleIds.has(blockId)}
                        attachRef={getAttachRef(blockId)}
                        alignPopover={idx % 3 === 2 ? 'left' : 'right'}
                        themeCompaniesMap={themeCompaniesMap}
                        heatmapData={heatmapData}
                        loading={loading}
                        stockPerfMapRef={stockPerfMapRef}
                        highlightedTheme={highlightedTheme}
                        isMobile={isMobile}
                        onSelect={onSelect}
                    />
                );
            })}
        </div>
    );
});
ThemeGrid.displayName = 'ThemeGrid';

const ThematicGridPane = React.memo(({ isActive, isMounted, themeCompaniesMap, heatmapData, loading, stockPerfMapRef, highlightedTheme, isMobile, onSelectTheme }) => {
    if (!isMounted) return null;

    return (
        <div className={cn(isActive ? 'block' : 'hidden')} aria-hidden={!isActive}>
            <ThemeGrid
                mapSource={THEMATIC_MAP}
                gridClassName="grid items-start gap-x-4 md:gap-x-8 gap-y-8 md:gap-y-12 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-3 md:auto-rows-fr"
                isMobile={isMobile}
                themeCompaniesMap={themeCompaniesMap}
                heatmapData={heatmapData}
                loading={loading}
                stockPerfMapRef={stockPerfMapRef}
                highlightedTheme={highlightedTheme}
                onSelect={onSelectTheme}
            />
        </div>
    );
}, (prevProps, nextProps) => {
    if (prevProps.isMounted !== nextProps.isMounted) return false;
    if (prevProps.isActive !== nextProps.isActive) return false;
    if (prevProps.isMobile !== nextProps.isMobile) return false;
    if (!prevProps.isActive && !nextProps.isActive) return true;
    if (prevProps.loading !== nextProps.loading) return false;
    if (prevProps.stockPerfMapRef !== nextProps.stockPerfMapRef) return false;
    if (prevProps.onSelectTheme !== nextProps.onSelectTheme) return false;
    return !doesBlockNeedUpdate(
        { block: { themes: THEMATIC_MAP.flatMap((mapBlock) => mapBlock.themes) }, themeCompaniesMap: prevProps.themeCompaniesMap, heatmapData: prevProps.heatmapData, highlightedTheme: prevProps.highlightedTheme },
        { block: { themes: THEMATIC_MAP.flatMap((mapBlock) => mapBlock.themes) }, themeCompaniesMap: nextProps.themeCompaniesMap, heatmapData: nextProps.heatmapData, highlightedTheme: nextProps.highlightedTheme }
    );
});
ThematicGridPane.displayName = 'ThematicGridPane';

const MacroGridPane = React.memo(({ isActive, isMounted, macroMap, themeCompaniesMap, heatmapData, loading, stockPerfMapRef, highlightedTheme, isMobile, onSelectTheme }) => {
    if (!isMounted) return null;

    return (
        <div className={cn(isActive ? 'block' : 'hidden')} aria-hidden={!isActive}>
            <ThemeGrid
                mapSource={macroMap}
                gridClassName="grid items-start gap-x-4 md:gap-x-8 gap-y-8 md:gap-y-12 grid-cols-1 md:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3 md:auto-rows-fr"
                isMobile={isMobile}
                themeCompaniesMap={themeCompaniesMap}
                heatmapData={heatmapData}
                loading={loading}
                stockPerfMapRef={stockPerfMapRef}
                highlightedTheme={highlightedTheme}
                onSelect={onSelectTheme}
            />
        </div>
    );
}, (prevProps, nextProps) => {
    if (prevProps.isMounted !== nextProps.isMounted) return false;
    if (prevProps.isActive !== nextProps.isActive) return false;
    if (prevProps.isMobile !== nextProps.isMobile) return false;
    if (prevProps.macroMap !== nextProps.macroMap) return false;
    if (!prevProps.isActive && !nextProps.isActive) return true;
    if (prevProps.loading !== nextProps.loading) return false;
    if (prevProps.stockPerfMapRef !== nextProps.stockPerfMapRef) return false;
    if (prevProps.onSelectTheme !== nextProps.onSelectTheme) return false;
    return !doesBlockNeedUpdate(
        { block: { themes: prevProps.macroMap.flatMap((mapBlock) => mapBlock.themes || EMPTY_ARRAY) }, themeCompaniesMap: prevProps.themeCompaniesMap, heatmapData: prevProps.heatmapData, highlightedTheme: prevProps.highlightedTheme },
        { block: { themes: nextProps.macroMap.flatMap((mapBlock) => mapBlock.themes || EMPTY_ARRAY) }, themeCompaniesMap: nextProps.themeCompaniesMap, heatmapData: nextProps.heatmapData, highlightedTheme: nextProps.highlightedTheme }
    );
});
MacroGridPane.displayName = 'MacroGridPane';

const ThemeGridSection = React.memo(({ viewMode, macroMap, themeCompaniesMap, heatmapData, loading, stockPerfMapRef, highlightedTheme, isMobile, onSelectTheme }) => {
    const [hasMountedMacro, setHasMountedMacro] = useState(viewMode === 'MACRO');

    useEffect(() => {
        if (viewMode === 'MACRO' && !hasMountedMacro) {
            setHasMountedMacro(true);
        }
    }, [viewMode, hasMountedMacro]);

    return (
        <>
            <ThematicGridPane
                isActive={viewMode === 'THEMATIC'}
                isMounted={true}
                themeCompaniesMap={themeCompaniesMap}
                heatmapData={heatmapData}
                loading={loading}
                stockPerfMapRef={stockPerfMapRef}
                highlightedTheme={highlightedTheme}
                isMobile={isMobile}
                onSelectTheme={onSelectTheme}
            />
            <MacroGridPane
                isActive={viewMode === 'MACRO'}
                isMounted={hasMountedMacro}
                macroMap={macroMap}
                themeCompaniesMap={themeCompaniesMap}
                heatmapData={heatmapData}
                loading={loading}
                stockPerfMapRef={stockPerfMapRef}
                highlightedTheme={highlightedTheme}
                isMobile={isMobile}
                onSelectTheme={onSelectTheme}
            />
        </>
    );
});
ThemeGridSection.displayName = 'ThemeGridSection';

const Legend = React.memo(() => (
    <div className="flex items-center gap-4 md:gap-8 px-4 md:px-6 py-2.5 glass-card border-[var(--ui-divider)]/20 rounded-full mb-10 w-fit mx-auto md:mx-0 bg-[var(--bg-main)]/40 shadow-xl">
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
));

const MarketMapViewComponent = ({ hierarchy }) => {
    const [hideBSE, _setHideBSE] = useState(() => localStorage.getItem('tt_map_hideBSE') === 'true');
    const setHideBSE = useCallback(v => _setHideBSE(prev => { const next = typeof v === 'function' ? v(prev) : v; localStorage.setItem('tt_map_hideBSE', String(next)); return next; }), []);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [highlightedTheme, setHighlightedTheme] = useState(null);
    const [viewMode, _setViewMode] = useState(() => localStorage.getItem('tt_map_viewMode') || 'THEMATIC');
    const setViewMode = useCallback(v => _setViewMode(prev => { const next = typeof v === 'function' ? v(prev) : v; localStorage.setItem('tt_map_viewMode', next); return next; }), []);
    const [displayMode, _setDisplayMode] = useState(() => localStorage.getItem('tt_map_displayMode') || 'HEATMAP');
    const setDisplayMode = useCallback(v => _setDisplayMode(prev => { const next = typeof v === 'function' ? v(prev) : v; localStorage.setItem('tt_map_displayMode', next); return next; }), []);
    const scrollPosRef = useRef(0);
    const onEnterCharts = useCallback((name) => {
        scrollPosRef.current = window.scrollY;
        setSelectedThemeName(name);
        setDisplayMode('CHARTS');
        window.scrollTo(0, 0);
    }, [setDisplayMode]);

    const onExitCharts = useCallback(() => {
        setDisplayMode('HEATMAP');
        setTimeout(() => window.scrollTo(0, scrollPosRef.current), 0);
    }, [setDisplayMode]);

    const [selectedThemeName, _setSelectedThemeName] = useState(() => localStorage.getItem('tt_map_theme') || null);
    const setSelectedThemeName = useCallback(v => { _setSelectedThemeName(v); if (v) localStorage.setItem('tt_map_theme', v); }, []);
    const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
    const searchRef = useRef(null);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0, width: 0 });

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        if (isSearchFocused && searchRef.current) {
            const rect = searchRef.current.getBoundingClientRect();
            setDropdownPos({
                top: rect.bottom + window.scrollY + 6,
                left: rect.left,
                width: rect.width
            });
        }
    }, [isSearchFocused, searchQuery]);

    const nseHierarchy = useMemo(() => {
        if (!hierarchy) return null;

        const newHierarchy = {};
        Object.keys(hierarchy).forEach((sector) => {
            newHierarchy[sector] = {};
            Object.keys(hierarchy[sector]).forEach((industry) => {
                newHierarchy[sector][industry] = hierarchy[sector][industry].filter((company) => !isBSESymbol(company.symbol));
            });
        });

        return newHierarchy;
    }, [hierarchy]);

    const allIndustryMap = useMemo(() => buildIndustryMap(hierarchy), [hierarchy]);
    const allSymbolNameMap = useMemo(() => buildSymbolNameMap(allIndustryMap), [allIndustryMap]);

    const allThemeCompaniesMap = useMemo(
        () => buildThemeCompaniesMap(allIndustryMap, allSymbolNameMap),
        [allIndustryMap, allSymbolNameMap]
    );
    const nseThemeCompaniesMap = useMemo(
        () => buildNseThemeCompaniesMap(allThemeCompaniesMap),
        [allThemeCompaniesMap]
    );
    const thematicSyncDataAll = useMemo(
        () => buildSyncData(THEMATIC_MAP, allThemeCompaniesMap),
        [allThemeCompaniesMap]
    );
    const thematicSyncDataNse = useMemo(
        () => buildSyncData(THEMATIC_MAP, nseThemeCompaniesMap),
        [nseThemeCompaniesMap]
    );

    const macroMap = useMemo(() => {
        return MACRO_PILLARS.map((pillar) => ({
            title: pillar.title,
            isPillar: true,
            themes: pillar.blocks.flatMap((blockTitle) =>
                THEMATIC_MAP.find((block) => block.title === blockTitle)?.themes || EMPTY_ARRAY
            )
        }));
    }, []);
    const macroSyncDataAll = useMemo(
        () => buildSyncData(macroMap, allThemeCompaniesMap),
        [macroMap, allThemeCompaniesMap]
    );
    const macroSyncDataNse = useMemo(
        () => buildSyncData(macroMap, nseThemeCompaniesMap),
        [macroMap, nseThemeCompaniesMap]
    );

    const filteredHierarchy = hideBSE ? nseHierarchy : hierarchy;
    const themeCompaniesMap = hideBSE ? nseThemeCompaniesMap : allThemeCompaniesMap;
    const deferredViewMode = useDeferredValue(viewMode);
    const deferredFilteredHierarchy = useDeferredValue(filteredHierarchy);
    const deferredThemeCompaniesMap = useDeferredValue(themeCompaniesMap);

    const searchResults = useMemo(() => {
        if (!searchQuery.trim() || searchQuery.length < 2) return [];
        const q = searchQuery.toLowerCase();
        const seen = new Set();
        const matches = [];
        const activeMap = viewMode === 'MACRO' ? macroMap : THEMATIC_MAP;

        for (const block of activeMap) {
            for (const theme of block.themes) {
                const companies = themeCompaniesMap[theme.name] || EMPTY_ARRAY;
                for (const company of companies) {
                    if (seen.has(company.symbol)) continue;
                    const companyName = company.name?.toLowerCase() || '';
                    const companySymbol = company.symbol?.toLowerCase() || '';
                    if (!companyName.includes(q) && !companySymbol.includes(q)) continue;
                    seen.add(company.symbol);
                    matches.push({
                        ...company,
                        type: 'STOCK',
                        themeName: theme.name,
                        groupTitle: block.title,
                        blockId: makeBlockId(block.title)
                    });
                    if (matches.length >= 8) return matches;
                }
            }
        }

        return matches;
    }, [viewMode, macroMap, themeCompaniesMap, searchQuery]);

    const scrollToBlock = (blockId, themeName) => {
        const el = document.getElementById(blockId);
        if (el) {
            const headerOffset = 70;
            const elementPosition = el.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });

            if (themeName) {
                setHighlightedTheme(themeName);
                setTimeout(() => setHighlightedTheme(null), 3500);
            }
            setSearchQuery('');
            setIsSearchFocused(false);
        }
    };

    const { heatmapData, stockPerfMap, loading, pendingIntervals, intervalProgress } = useThematicHeatmap(
        THEMATIC_MAP,
        deferredFilteredHierarchy
    );
    const deferredHeatmapData = useDeferredValue(heatmapData);
    const stockPerfMapRef = useRef(stockPerfMap);
    useEffect(() => {
        stockPerfMapRef.current = stockPerfMap;
    }, [stockPerfMap]);
    const hasHeatmapData = Object.keys(heatmapData || {}).length > 0;
    const pendingLabel = pendingIntervals
        .map((interval) => {
            const status = intervalProgress?.[interval];
            if (!status) return interval;
            if (Number.isFinite(status.totalGroups) && status.totalGroups > 0) {
                return `${interval} ${status.completedGroups || 0}/${status.totalGroups}`;
            }
            if (Number.isFinite(status.totalSymbols) && status.totalSymbols > 0) {
                return `${interval} ${status.completedSymbols || 0}/${status.totalSymbols}`;
            }
            return interval;
        })
        .join(' | ');

    const activeSyncData = useMemo(() => {
        if (deferredViewMode === 'MACRO') {
            return hideBSE ? macroSyncDataNse : macroSyncDataAll;
        }
        return hideBSE ? thematicSyncDataNse : thematicSyncDataAll;
    }, [deferredViewMode, hideBSE, macroSyncDataAll, macroSyncDataNse, thematicSyncDataAll, thematicSyncDataNse]);
    const deferredActiveSyncData = useDeferredValue(activeSyncData);

    return (
        <ViewWrapper id="market-map" className="space-y-6 md:space-y-8 pb-32 overflow-x-hidden relative">
            {loading && !hasHeatmapData && <UniverseLoader />}

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-[var(--ui-divider)]/40 pb-6 md:pb-8 relative z-[60]">
                <div className="space-y-1 relative z-10 w-full md:w-auto">
                    <h2 className="text-xl md:text-3xl font-light tracking-[0.15em] md:tracking-[0.5em] uppercase opacity-90 text-glow-gold leading-tight">
                        Market <span className="text-[var(--accent-primary)]">Architecture</span>
                    </h2>
                    <p className="text-[8.5px] md:text-[11.5px] font-black leading-relaxed tracking-[0.2em] md:tracking-[0.4em] text-[var(--accent-primary)] uppercase opacity-60">
                        {hideBSE ? 'Deep Thematic Mapping (NSE Only)' : 'Deep Thematic Mapping (Full Universe)'}
                    </p>
                    {pendingIntervals?.length > 0 && (
                        <p className="text-[6px] md:text-[8px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)] opacity-70 mt-2">
                            Loading Intervals: {pendingLabel}
                        </p>
                    )}
                </div>

                {/* Visual Flair (Stay within bounds to prevent horizontal overflow) */}
                <div className="hidden md:block absolute top-0 right-20 w-80 h-80 bg-[var(--accent-primary)]/10 rounded-full blur-[120px] -translate-y-1/2 animate-pulse" />

                <div className="flex items-center gap-6 relative z-10 w-full md:w-auto">
                    {/* Display Mode Toggle */}
                    <div className="flex bg-[var(--ui-muted)]/5 p-1 rounded-full border border-[var(--ui-divider)]/20">
                        <button
                            onClick={onExitCharts}
                            className={cn(
                                "p-2 rounded-full transition-all duration-300",
                                displayMode === 'HEATMAP' ? "bg-[var(--accent-primary)] text-white" : "text-[var(--text-muted)] hover:text-white"
                            )}
                            title="Heatmap View"
                        >
                            <LayoutGrid size={14} />
                        </button>
                        <button
                            onClick={() => {
                                if (!selectedThemeName) {
                                    onEnterCharts(THEMATIC_MAP[0].themes[0].name);
                                } else {
                                    onEnterCharts(selectedThemeName);
                                }
                            }}
                            className={cn(
                                "p-2 rounded-full transition-all duration-300",
                                displayMode === 'CHARTS' ? "bg-[var(--accent-primary)] text-white" : "text-[var(--text-muted)] hover:text-white"
                            )}
                            title="Chart Grid View"
                        >
                            <BarChart3 size={14} />
                        </button>
                    </div>

                    {/* Search Bar */}
                    <div ref={searchRef} className="relative flex-1 md:flex-none md:w-56 z-[100]">
                        <div className={cn(
                            "flex items-center gap-2.5 px-3.5 py-1.5 glass-card border-[var(--ui-divider)]/30 bg-[#16191f]/80 rounded-full transition-all duration-300",
                            isSearchFocused && "border-[var(--accent-primary)]/40 ring-1 ring-[var(--accent-primary)]/20 shadow-[0_0_20px_rgba(0,133,255,0.1)]"
                        )}>
                            <Search className={cn(
                                "w-3 h-3 transition-colors",
                                isSearchFocused ? "text-[var(--accent-primary)]" : "text-white/20"
                            )} />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => setIsSearchFocused(true)}
                                placeholder="FIND STOCKS..."
                                className="bg-transparent border-none outline-none text-[12px] md:text-[9px] font-bold uppercase tracking-[0.15em] text-white placeholder:text-white/20 w-full"
                            />
                        </div>

                        {isSearchFocused && searchResults.length > 0 && createPortal(
                            <div
                                style={isMobile ? {
                                    position: 'fixed',
                                    top: dropdownPos.top,
                                    left: dropdownPos.left,
                                    width: '180px',
                                    zIndex: 10000
                                } : {
                                    position: 'absolute',
                                    top: dropdownPos.top,
                                    left: dropdownPos.left,
                                    width: Math.max(dropdownPos.width, 240),
                                    zIndex: 10000
                                }}
                                className="glass-card !bg-[#0b0e14]/95 backdrop-blur-md border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.6)] rounded-lg overflow-hidden max-h-[280px] overflow-y-auto no-scrollbar"
                            >
                                <div className="p-0.5 space-y-0">
                                    {searchResults.map((result, idx) => (
                                        <button
                                            key={`${result.symbol}-${idx}`}
                                            onClick={() => {
                                                if (displayMode === 'CHARTS') {
                                                    setSelectedThemeName(result.themeName);
                                                    setSearchQuery('');
                                                    setIsSearchFocused(false);
                                                } else {
                                                    scrollToBlock(result.blockId, result.themeName);
                                                }
                                            }}
                                            className="w-full flex flex-col items-start py-1.5 px-2 hover:bg-white/5 transition-colors border-b border-white/[0.03] last:border-0"
                                        >
                                            <div className="flex items-center justify-between w-full gap-1 mb-0.5">
                                                <span className="text-[9px] font-black uppercase text-white/90 truncate flex-1 text-left">
                                                    {result.symbol}
                                                </span>
                                                <span className="text-[7px] font-black text-[var(--accent-primary)]/80 uppercase tracking-tighter shrink-0">
                                                    {result.themeName}
                                                </span>
                                            </div>
                                            <span className="text-[7px] font-bold text-white/30 uppercase truncate w-full text-left">
                                                {result.name}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>,
                            document.body
                        )}

                        {isSearchFocused && (
                            <div className="fixed inset-0 z-[-1]" onClick={() => setIsSearchFocused(false)} />
                        )}
                    </div>

                    {/* ViewMode Toggle */}
                    <div className="flex bg-[var(--ui-muted)]/5 p-1 rounded-full border border-[var(--ui-divider)]/20">
                        <button
                            onClick={() => startTransition(() => setViewMode('THEMATIC'))}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-[7.5px] font-black uppercase tracking-widest transition-all duration-500",
                                viewMode === 'THEMATIC' ? "bg-[var(--accent-primary)] text-white shadow-lg" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                            )}
                        >
                            Thematic
                        </button>
                        <button
                            onClick={() => startTransition(() => setViewMode('MACRO'))}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-[7.5px] font-black uppercase tracking-widest transition-all duration-500",
                                viewMode === 'MACRO' ? "bg-[var(--accent-primary)] text-white shadow-lg" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                            )}
                        >
                            Macro
                        </button>
                    </div>

                    {/* HideBSE Toggle */}
                    <button
                        onClick={() => startTransition(() => setHideBSE(prev => !prev))}
                        className={cn(
                            "flex items-center gap-2 px-4 py-1.5 rounded-full border transition-all duration-700 group/btn whitespace-nowrap",
                            hideBSE ? "bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]/30 text-[var(--accent-primary)]" : "bg-transparent border-[var(--ui-divider)]/40 text-[var(--text-muted)]"
                        )}
                    >
                        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", hideBSE ? "bg-[var(--accent-primary)]" : "bg-[var(--text-muted)] opacity-30")} />
                        <span className="text-[8.5px] font-black uppercase tracking-[0.25em]">{hideBSE ? 'NSE ONLY' : 'SHOW ALL'}</span>
                    </button>
                </div>
            </div>

            <div className="w-full">
                {displayMode === 'HEATMAP' ? (
                    <>
                        <div className="flex flex-col md:flex-row items-start justify-between gap-6 mb-8">
                            <Legend />
                            <div className="w-full md:w-auto min-w-[320px]">
                                <WatchlistSyncCard
                                    {...deferredActiveSyncData}
                                />
                            </div>
                        </div>
                        <ThemeGridSection
                            viewMode={deferredViewMode}
                            macroMap={macroMap}
                            themeCompaniesMap={deferredThemeCompaniesMap}
                            heatmapData={deferredHeatmapData}
                            loading={loading}
                            stockPerfMapRef={stockPerfMapRef}
                            highlightedTheme={highlightedTheme}
                            isMobile={isMobile}
                            onSelectTheme={onEnterCharts}
                        />
                    </>
                ) : (
                    <ThematicGridChartView
                        themeName={selectedThemeName}
                        companies={themeCompaniesMap[selectedThemeName] || []}
                        allThemeCompanies={themeCompaniesMap}
                        onBack={onExitCharts}
                        onSelectTheme={setSelectedThemeName}
                        onViewModeChange={setViewMode}
                        viewMode={viewMode}
                        loading={loading}
                    />
                )}
            </div>
        </ViewWrapper >
    );
};

export const MarketMapView = React.memo(MarketMapViewComponent, (prevProps, nextProps) => (
    prevProps.hierarchy === nextProps.hierarchy
));

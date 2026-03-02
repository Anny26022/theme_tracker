import React, { useMemo, useState, useEffect, useRef } from 'react';
import FinvizChart from '../components/FinvizChart';
import { cleanSymbol, getCachedComparisonSeries } from '../services/priceService';
import { ChevronLeft, ChevronDown, Layers } from 'lucide-react';
import { THEMATIC_MAP, MACRO_PILLARS } from '../data/thematicMap';
import { useChartVersion, useMarketDataRegistry } from '../context/MarketDataContext';
import { VirtuosoGrid } from 'react-virtuoso';

const ChartSkeleton = ({ company, height }) => (
    <div
        className="w-full bg-[#0b0e14] border border-[#23272d] rounded-md animate-pulse flex items-center justify-center"
        style={{ height }}
    >
        <div className="flex flex-col items-center gap-2 opacity-20">
            <span className="text-[10px] font-black uppercase tracking-widest">{company.name}</span>
            <span className="text-[8px] font-bold text-[var(--accent-primary)] uppercase tracking-tighter">{company.symbol}</span>
        </div>
    </div>
);

const FinvizChartCard = React.memo(({ company, series, height }) => (
    <FinvizChart
        symbol={company.symbol}
        name={company.name}
        series={series}
        height={height}
    />
), (prevProps, nextProps) => {
    if (prevProps.series !== nextProps.series) return false;
    if (prevProps.height !== nextProps.height) return false;
    if (prevProps.company?.symbol !== nextProps.company?.symbol) return false;
    if (prevProps.company?.name !== nextProps.company?.name) return false;
    return true;
});

const DeferredFinvizChart = ({ company, series, height }) => {
    const [isVisible, setIsVisible] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '400px 0px', threshold: 0.01 }
        );

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => observer.disconnect();
    }, []);

    const hasSeries = series.length > 0;

    return (
        <div ref={containerRef} style={{ minHeight: height }}>
            {isVisible ? (
                hasSeries ? (
                    <FinvizChartCard
                        company={company}
                        series={series}
                        height={height}
                    />
                ) : (
                    <ChartSkeleton company={company} height={height} />
                )
            ) : (
                <ChartSkeleton company={company} height={height} />
            )}
        </div>
    );
};

const ChartGridComponents = {
    List: React.forwardRef(({ style, children, ...props }, ref) => (
        <div
            ref={ref}
            {...props}
            style={style}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-12"
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

ChartGridComponents.List.displayName = 'ChartGridList';

const ThematicGridChartView = ({ themeName, companies = [], onBack, onSelectTheme, viewMode = 'THEMATIC' }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const { subscribeChartSymbols } = useMarketDataRegistry();
    const chartVersion = useChartVersion();

    // Reset when theme changes
    useEffect(() => {
        setIsMenuOpen(false);
    }, [themeName]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const normalizedSymbols = useMemo(
        () => Array.from(new Set((companies || []).map((c) => cleanSymbol(c.symbol)).filter(Boolean))),
        [companies]
    );

    // Build the hierarchical menu data based on viewMode
    const switcherData = useMemo(() => {
        if (viewMode === 'THEMATIC') {
            return THEMATIC_MAP.map(block => ({
                title: block.title,
                themes: block.themes.map(t => t.name)
            }));
        } else {
            return MACRO_PILLARS.map(pillar => ({
                title: pillar.title,
                blocks: pillar.blocks.map(bTitle => {
                    const block = THEMATIC_MAP.find(b => b.title === bTitle);
                    return {
                        title: bTitle,
                        themes: block?.themes.map(t => t.name) || []
                    };
                })
            }));
        }
    }, [viewMode]);

    useEffect(() => {
        if (!normalizedSymbols.length) return;
        return subscribeChartSymbols('MAX', normalizedSymbols);
    }, [normalizedSymbols, subscribeChartSymbols]);

    const seriesBySymbol = useMemo(() => {
        const map = new Map();
        normalizedSymbols.forEach((symbol) => {
            const series = getCachedComparisonSeries(symbol, 'MAX', { silent: true });
            if (series) map.set(symbol, series);
        });
        return map;
    }, [normalizedSymbols, chartVersion]);

    const companySeries = useMemo(() => {
        return companies.map((company) => ({
            company,
            series: seriesBySymbol.get(cleanSymbol(company.symbol)) || []
        }));
    }, [companies, seriesBySymbol]);


    return (
        <div className="flex flex-col gap-6">
            {/* Header Controls */}
            {/* Header Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 py-2 border-b border-[var(--ui-divider)]">
                <div className="flex items-center gap-4 relative" ref={menuRef}>
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="p-1.5 hover:bg-[var(--ui-muted)] rounded transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)] group"
                        >
                            <ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                        </button>
                    )}

                    <div className="flex flex-col">
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="flex items-center gap-2 group cursor-pointer"
                        >
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--accent-primary)] group-hover:opacity-80 transition-opacity">
                                {themeName}
                            </h2>
                            <ChevronDown size={12} className={`text-[var(--accent-primary)] transition-transform duration-300 ${isMenuOpen ? 'rotate-180' : ''}`} />
                        </button>
                        <span className="text-[var(--text-muted)] text-[7px] font-black uppercase tracking-[0.2em] mt-1 opacity-60">({companies.length} Stocks)</span>
                    </div>

                    {/* Hierarchical Dropdown Menu */}
                    {isMenuOpen && (
                        <div className="absolute top-full left-0 mt-3 w-[280px] max-h-[520px] overflow-y-auto no-scrollbar bg-[var(--bg-main)] border border-[var(--glass-border)] rounded shadow-[0_20px_40px_rgba(0,0,0,0.5)] z-[100] backdrop-blur-xl">
                            <div className="p-2 space-y-4">
                                {viewMode === 'THEMATIC' ? (
                                    switcherData.map((block, bi) => (
                                        <div key={bi} className="space-y-1 p-1">
                                            <div className="px-2 py-1 flex items-center gap-2 border-b border-[var(--ui-divider)]/50 mb-2">
                                                <span className="text-[9px] font-black text-[var(--accent-primary)] tracking-widest uppercase truncate">{block.title}</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1 p-1">
                                                {block.themes.map((theme, ti) => (
                                                    <button
                                                        key={ti}
                                                        onClick={() => {
                                                            if (onSelectTheme) onSelectTheme(theme);
                                                            setIsMenuOpen(false);
                                                        }}
                                                        className={`text-[9px] px-2 py-1 rounded-sm transition-all font-black uppercase tracking-tight
                                                            ${theme === themeName
                                                                ? 'bg-[var(--accent-primary)] text-white shadow-lg'
                                                                : 'bg-[var(--ui-divider)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--ui-muted)]'}`}
                                                    >
                                                        {theme}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    switcherData.map((pillar, pi) => (
                                        <div key={pi} className="space-y-2">
                                            <div className="px-3 py-1 flex items-center gap-2 border-b border-[var(--ui-divider)]/50 mb-1">
                                                <Layers size={10} className="text-[var(--accent-primary)]" />
                                                <span className="text-[9px] font-black text-[var(--text-muted)] tracking-widest uppercase truncate">{pillar.title}</span>
                                            </div>
                                            {pillar.blocks.map((block, bi) => (
                                                <div key={bi} className="px-1 border-l-2 border-[var(--accent-primary)]/10 ml-2 mt-1">
                                                    <div className="px-2 py-0.5 text-[8px] font-bold text-[var(--text-main)]/40 uppercase tracking-tighter">{block.title}</div>
                                                    <div className="flex flex-wrap gap-1 p-1">
                                                        {block.themes.map((theme, ti) => (
                                                            <button
                                                                key={ti}
                                                                onClick={() => {
                                                                    if (onSelectTheme) onSelectTheme(theme);
                                                                    setIsMenuOpen(false);
                                                                }}
                                                                className={`text-[9px] px-2 py-1 rounded-sm transition-all font-black uppercase tracking-tight
                                                                    ${theme === themeName
                                                                        ? 'bg-[var(--accent-primary)] text-white shadow-lg'
                                                                        : 'bg-[var(--ui-divider)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--ui-muted)]'}`}
                                                            >
                                                                {theme}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Virtualized Chart Grid */}
            {companySeries.length > 0 ? (
                <VirtuosoGrid
                    useWindowScroll
                    data={companySeries}
                    components={ChartGridComponents}
                    computeItemKey={(_, item) => item.company.symbol}
                    increaseViewportBy={{ top: 400, bottom: 1200 }}
                    itemContent={(idx, item) => (
                        <DeferredFinvizChart
                            company={item.company}
                            series={item.series || []}
                            height={280}
                        />
                    )}
                />
            ) : null}

            {companies.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 opacity-20">
                    <span className="text-[10px] font-black uppercase tracking-[0.5em]">No Stocks in Cluster</span>
                </div>
            )}
        </div>
    );
};

export default ThematicGridChartView;

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import FinvizChart from '../components/FinvizChart';
import { cleanSymbol, getCachedComparisonSeries } from '../services/priceService';
import { ChevronLeft, ChevronDown, Layers, ExternalLink, LayoutGrid, StretchHorizontal } from 'lucide-react';
import ProChartModal from '../components/ProChartModal';
import { THEMATIC_MAP, MACRO_PILLARS } from '../data/thematicMap';
import { useChartVersion, useMarketDataRegistry } from '../context/MarketDataContext';
import { VirtuosoGrid } from 'react-virtuoso';
import { useThemeChartSnapshot } from '../hooks/useThemeChartSnapshot';

const ChartSkeleton = ({ company, height }) => (
    <div className="flex flex-col w-full h-full">
        {/* Timeframe Toggle Placeholders to match FinvizChart */}
        <div className="flex flex-row justify-end gap-0.5 mb-1 px-1">
            {[
                { label: 'TD', value: '1D' },
                { label: 'TW', value: '1W' },
                { label: 'TM', value: '1M' },
                { label: 'TY', value: '1Y' }
            ].map(tf => (
                <div
                    key={tf.value}
                    className="px-1 py-0 rounded-[2px] text-[7px] font-black tracking-tighter border bg-[#1a1c22]/50 border-white/5 text-white/5 h-[14px] flex items-center"
                >
                    {tf.label}
                </div>
            ))}
        </div>
        <div
            className="w-full bg-[#0b0e14] border border-[#23272d] rounded-md animate-pulse flex items-center justify-center overflow-hidden"
            style={{ height: `${height}px` }}
        >
            <div className="flex flex-col items-center gap-2 opacity-20">
                <span className="text-[12px] font-black uppercase tracking-widest">{company.name}</span>
                <span className="text-[8px] font-bold text-[var(--accent-primary)] uppercase tracking-tighter">{company.symbol}</span>
            </div>
        </div>
    </div>
);

const DEEP_DIVE_SNAPSHOT_INTERVAL = 'MAX';

const FinvizChartCard = React.memo(({ company, series, height, onExpand, initialTimeframe, disabled, snapshotScope }) => (
    <FinvizChart
        symbol={company.symbol}
        name={company.name}
        series={series}
        height={height}
        onExpand={onExpand}
        initialTimeframe={initialTimeframe}
        disabled={disabled}
        useExternalSeries={true}
        snapshotScope={snapshotScope}
    />
), (prevProps, nextProps) => {
    if (prevProps.series !== nextProps.series) return false;
    if (prevProps.height !== nextProps.height) return false;
    if (prevProps.company?.symbol !== nextProps.company?.symbol) return false;
    if (prevProps.company?.name !== nextProps.company?.name) return false;
    if (prevProps.snapshotScope !== nextProps.snapshotScope) return false;
    return true;
});

const DeferredFinvizChart = React.memo(({ company, series, height, onExpand, disabled }) => {
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
                        onExpand={onExpand}
                        disabled={disabled}
                    />
                ) : (
                    <ChartSkeleton company={company} height={height} />
                )
            ) : (
                <ChartSkeleton company={company} height={height} />
            )}
        </div>
    );
}, (prevProps, nextProps) => {
    if (prevProps.series !== nextProps.series) return false;
    if (prevProps.height !== nextProps.height) return false;
    if (prevProps.company?.symbol !== nextProps.company?.symbol) return false;
    if (prevProps.company?.name !== nextProps.company?.name) return false;
    return true;
});

const ChartGridComponents = {
    List: React.forwardRef(({ style, children, ...props }, ref) => (
        <div
            ref={ref}
            {...props}
            style={style}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 pb-12"
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

const ThematicGridChartView = ({
    themeName,
    companies = [],
    allThemeCompanies = {},
    snapshotScope = 'nse',
    onBack,
    onSelectTheme,
    onViewModeChange,
    viewMode = 'THEMATIC',
    loading = false
}) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const { subscribeChartSymbols } = useMarketDataRegistry();
    const chartVersion = useChartVersion();
    const [proViewSymbol, setProViewSymbol] = useState(() => JSON.parse(localStorage.getItem('tt_pvs') || 'null'));
    const [proViewTimeframe, setProViewTimeframe] = useState(() => localStorage.getItem('tt_pvtf') || '1D');
    useEffect(() => {
        localStorage.setItem('tt_pvs', JSON.stringify(proViewSymbol));
        localStorage.setItem('tt_pvtf', proViewTimeframe);
    }, [proViewSymbol, proViewTimeframe]);
    const [isMobileMode, setIsMobileMode] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
    const [mobileLayout, setMobileLayout] = useState('VERTICAL'); // VERTICAL or HORIZONTAL

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleResize = () => setIsMobileMode(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const globalCompanyList = useMemo(() => {
        const list = [];
        const seen = new Set();
        Object.entries(allThemeCompanies).forEach(([tName, tCompanies]) => {
            tCompanies.forEach(c => {
                if (!seen.has(c.symbol)) {
                    list.push({ ...c, theme: tName });
                    seen.add(c.symbol);
                }
            });
        });
        return list;
    }, [allThemeCompanies]);

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

    const {
        chartSnapshotSeriesBySymbol,
        chartSnapshotLoading,
        hasChartSnapshot,
    } = useThemeChartSnapshot(themeName, snapshotScope, DEEP_DIVE_SNAPSHOT_INTERVAL);

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

    const seriesBySymbol = useMemo(() => {
        if (hasChartSnapshot) return chartSnapshotSeriesBySymbol;
        const map = new Map();
        normalizedSymbols.forEach((symbol) => {
            const series = getCachedComparisonSeries(symbol, DEEP_DIVE_SNAPSHOT_INTERVAL, { silent: true });
            if (series) map.set(symbol, series);
        });
        return map;
    }, [chartSnapshotSeriesBySymbol, chartVersion, hasChartSnapshot, normalizedSymbols]);

    // Handle Pro View Symbol Subscription
    useEffect(() => {
        if (!proViewSymbol) return;
        return subscribeChartSymbols('MAX', [cleanSymbol(proViewSymbol.symbol)]);
    }, [proViewSymbol, subscribeChartSymbols]);

    const proViewSeries = useMemo(() => {
        if (!proViewSymbol) return [];
        return getCachedComparisonSeries(cleanSymbol(proViewSymbol.symbol), 'MAX', { silent: true }) || [];
    }, [proViewSymbol, chartVersion]);

    const companySeries = useMemo(() => {
        return companies.map((company) => ({
            company,
            series: seriesBySymbol.get(cleanSymbol(company.symbol)) || []
        }));
    }, [companies, seriesBySymbol]);

    const handleCloseProView = useCallback(() => {
        setProViewSymbol(null);
    }, []);

    const handleProSymbolChange = useCallback((nextSymbol) => {
        setProViewSymbol(nextSymbol);
        if (nextSymbol?.theme && nextSymbol.theme !== themeName && nextSymbol.theme !== 'Current Cluster') {
            onSelectTheme(nextSymbol.theme);
        }
    }, [themeName, onSelectTheme]);

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

                {/* Layout Toggle - Right Side */}
                <div className="flex items-center gap-2">
                    {isMobileMode && (
                        <div className="flex bg-[#1a1c22]/50 p-0.5 rounded border border-white/5 shadow-2xl">
                            <button
                                onClick={() => setMobileLayout('VERTICAL')}
                                className={`p-1 rounded transition-all ${mobileLayout === 'VERTICAL' ? 'bg-[var(--accent-primary)] text-black' : 'text-white/20 hover:text-white/60'}`}
                            >
                                <LayoutGrid size={14} />
                            </button>
                            <button
                                onClick={() => setMobileLayout('HORIZONTAL')}
                                className={`p-1 rounded transition-all ${mobileLayout === 'HORIZONTAL' ? 'bg-[var(--accent-primary)] text-black' : 'text-white/20 hover:text-white/60'}`}
                            >
                                <StretchHorizontal size={14} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Virtualized Chart Grid */}
            {companySeries.length > 0 ? (
                isMobileMode && mobileLayout === 'HORIZONTAL' ? (
                    <div className="flex overflow-x-auto gap-4 pb-6 snap-x snap-mandatory no-scrollbar scroll-smooth touch-pan-x cursor-grab active:cursor-grabbing">
                        {companySeries.map((item) => (
                            <div key={item.company.symbol} className="min-w-[85vw] snap-center shrink-0 transition-transform duration-500 hover:scale-[1.01]">
                                {item.series.length > 0 ? (
                                    <FinvizChartCard
                                        company={item.company}
                                        series={item.series}
                                        height={320}
                                        disabled={true}
                                        onExpand={(data) => {
                                            setProViewSymbol(item.company);
                                            setProViewTimeframe(data.timeframe);
                                        }}
                                        snapshotScope={snapshotScope}
                                    />
                                ) : (
                                    <ChartSkeleton company={item.company} height={320} />
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <VirtuosoGrid
                        useWindowScroll
                        data={companySeries}
                        components={ChartGridComponents}
                        computeItemKey={(_, item) => item.company.symbol}
                        increaseViewportBy={{ top: 200, bottom: 400 }}
                        itemContent={(idx, item) => (
                            item.series.length > 0 ? (
                                <FinvizChartCard
                                    company={item.company}
                                    series={item.series}
                                    height={isMobileMode ? 320 : 280}
                                    onExpand={(data) => {
                                        setProViewSymbol(item.company);
                                        setProViewTimeframe(data.timeframe);
                                    }}
                                    snapshotScope={snapshotScope}
                                />
                            ) : (
                                <ChartSkeleton company={item.company} height={isMobileMode ? 320 : 280} />
                            )
                        )}
                    />
                )
            ) : null}

            {companies.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 opacity-20">
                    <span className="text-[10px] font-black uppercase tracking-[0.5em]">
                        {loading ? 'Initializing Data...' : 'No Stocks in Cluster'}
                    </span>
                </div>
            )}
            {!loading && companies.length > 0 && chartSnapshotLoading && !hasChartSnapshot && (
                <div className="flex flex-col items-center justify-center py-10 opacity-40">
                    <span className="text-[10px] font-black uppercase tracking-[0.4em]">Loading Chart Snapshot...</span>
                </div>
            )}
            {proViewSymbol && (
                <ProChartModal
                    isOpen={!!proViewSymbol}
                    symbol={proViewSymbol.symbol}
                    name={proViewSymbol.name}
                    series={proViewSeries}
                    allCompanies={globalCompanyList}
                    navigationCompanies={companies}
                    initialTimeframe={proViewTimeframe}
                    themeName={themeName}
                    snapshotScope={snapshotScope}
                    onSelectTheme={onSelectTheme}
                    onViewModeChange={onViewModeChange}
                    viewMode={viewMode}
                    onClose={handleCloseProView}
                    onSymbolChange={handleProSymbolChange}
                />
            )}
        </div>
    );
};

export default ThematicGridChartView;

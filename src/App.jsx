import React, { useCallback, useMemo } from 'react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'framer-motion';

// Hooks
import { useUrlState, VIEWS } from './hooks/useUrlState';
import { useMarketData } from './hooks/useMarketData';

// Components
import { Navbar } from './components/Navbar';
import { BackgroundAmbience } from './components/BackgroundAmbience';

// Context
import { PriceProvider } from './context/PriceContext';

// Views
import { UniverseView } from './views/UniverseView';
import { DomainView } from './views/DomainView';
import { SectorView } from './views/SectorView';
import { IndustryView } from './views/IndustryView';
import { TrackerView } from './views/TrackerView';
import { ComparisonView } from './views/ComparisonView';
import { MapperView } from './views/MapperView';
import { MarketMapView } from './views/MarketMapView';

const CompanyInsights = React.lazy(() => import('./components/CompanyInsights').then((mod) => ({ default: mod.CompanyInsights })));
const VALID_VIEWS = new Set(Object.values(VIEWS));

const AppLoadingScreen = React.memo(() => (
    <LazyMotion features={domAnimation}>
        <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-main)]">
            <m.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-12 h-12 border-2 border-white/5 border-t-[#c5a059] rounded-full mb-4"
            />
            <span className="text-white/20 text-[10px] font-bold tracking-[0.2em] uppercase">Initializing Universe</span>
        </div>
    </LazyMotion>
));

AppLoadingScreen.displayName = 'AppLoadingScreen';

const AppErrorScreen = React.memo(({ error }) => (
    <LazyMotion features={domAnimation}>
        <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-main)]">
            <div className="p-8 glass-card border-rose-500/20 text-center space-y-4">
                <h2 className="text-rose-500 text-xs font-bold uppercase tracking-[0.2em]">Data Sync Failure</h2>
                <p className="text-white/40 text-[10px] uppercase tracking-widest">{error}</p>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="px-6 py-2 glass-card text-[10px] font-bold uppercase tracking-widest hover:border-[var(--accent-primary)] transition-all"
                >
                    Retry Connection
                </button>
            </div>
        </div>
    </LazyMotion>
));

AppErrorScreen.displayName = 'AppErrorScreen';

const RouterView = React.memo(({
    view,
    sectors,
    hierarchy,
    sector,
    industry,
    timeframe,
    setTimeframe,
    currentIndustries,
    currentCompanies,
    onSectorClick,
    onIndustryClick,
    onDomainIndustryClick,
    onTrackerSectorClick,
    onTrackerIndustryClick,
    onSectorBack,
    onIndustryBack,
    onSectorIndustryClick,
    onOpenInsights,
    rawData,
    loading
}) => {
    switch (view) {
        case VIEWS.UNIVERSE:
            return (
                <UniverseView
                    sectors={sectors}
                    hierarchy={hierarchy}
                    onSectorClick={onSectorClick}
                    onIndustryClick={onIndustryClick}
                    timeframe={timeframe}
                    setTimeframe={setTimeframe}
                    onOpenInsights={onOpenInsights}
                />
            );
        case VIEWS.DOMAIN:
            return (
                <DomainView
                    sectors={sectors}
                    hierarchy={hierarchy}
                    onIndustryClick={onDomainIndustryClick}
                    onOpenInsights={onOpenInsights}
                />
            );
        case VIEWS.SECTOR:
            return (
                <SectorView
                    sector={sector}
                    industries={currentIndustries}
                    hierarchy={hierarchy}
                    onBack={onSectorBack}
                    onIndustryClick={onSectorIndustryClick}
                />
            );
        case VIEWS.INDUSTRY:
            return (
                <IndustryView
                    sector={sector}
                    industry={industry}
                    companies={currentCompanies}
                    sectors={sectors}
                    hierarchy={hierarchy}
                    onBack={onIndustryBack}
                    onOpenInsights={onOpenInsights}
                />
            );
        case VIEWS.TRACKER:
            return (
                <TrackerView
                    sectors={sectors}
                    hierarchy={hierarchy}
                    onSectorClick={onTrackerSectorClick}
                    onIndustryClick={onTrackerIndustryClick}
                    timeframe={timeframe}
                    setTimeframe={setTimeframe}
                    onOpenInsights={onOpenInsights}
                />
            );
        case VIEWS.COMPARE:
            return (
                <ComparisonView
                    hierarchy={hierarchy}
                    timeframe={timeframe}
                    setTimeframe={setTimeframe}
                    onOpenInsights={onOpenInsights}
                />
            );
        case VIEWS.MAPPER:
            return <MapperView hierarchy={hierarchy} rawData={rawData} loading={loading} />;
        case VIEWS.MARKET_MAP:
            return <MarketMapView hierarchy={hierarchy} />;
        default:
            return null;
    }
});

RouterView.displayName = 'RouterView';

const App = () => {
    const { view, sector, industry, timeframe, from, navigate, setTimeframe } = useUrlState();
    const { hierarchy, rawData, loading, error } = useMarketData();
    const [insightsCompany, setInsightsCompany] = React.useState(null);
    const [hasVisitedMarketMap, setHasVisitedMarketMap] = React.useState(view === VIEWS.MARKET_MAP);

    // Source of truth from hierarchy to avoid drift between lists and lookup map.
    const sectors = useMemo(() => Object.keys(hierarchy).sort(), [hierarchy]);
    const normalizedView = useMemo(() => (VALID_VIEWS.has(view) ? view : VIEWS.UNIVERSE), [view]);

    const currentIndustries = useMemo(() => {
        if (!sector || !hierarchy[sector]) return [];
        return Object.keys(hierarchy[sector]).sort();
    }, [hierarchy, sector]);

    const currentCompanies = useMemo(() => {
        if (!sector || !industry || !hierarchy[sector]) return [];
        return hierarchy[sector][industry] || [];
    }, [hierarchy, sector, industry]);

    const handleOpenInsights = useCallback((company) => setInsightsCompany(company), []);
    const handleCloseInsights = useCallback(() => setInsightsCompany(null), []);

    const handleSectorClick = useCallback((s) => navigate(VIEWS.SECTOR, s, null), [navigate]);
    const handleIndustryClick = useCallback((s, ind) => navigate(VIEWS.INDUSTRY, s, ind), [navigate]);
    const handleDomainIndustryClick = useCallback((s, ind) => navigate(VIEWS.INDUSTRY, s, ind, 'domain'), [navigate]);
    const handleTrackerSectorClick = useCallback((s) => navigate(VIEWS.SECTOR, s, null, 'tracker'), [navigate]);
    const handleTrackerIndustryClick = useCallback((s, ind) => navigate(VIEWS.INDUSTRY, s, ind, 'tracker'), [navigate]);
    const handleSectorBack = useCallback(() => navigate(from === 'tracker' ? VIEWS.TRACKER : VIEWS.DOMAIN, null, null), [navigate, from]);
    const handleIndustryBack = useCallback(() => navigate(from === 'tracker' ? VIEWS.TRACKER : VIEWS.DOMAIN, null, null), [navigate, from]);
    const handleSectorIndustryClick = useCallback((ind) => navigate(VIEWS.INDUSTRY, sector, ind), [navigate, sector]);

    React.useEffect(() => {
        if (view !== normalizedView) {
            navigate(normalizedView, null, null, null);
        }
    }, [view, normalizedView, navigate]);

    React.useEffect(() => {
        if (normalizedView === VIEWS.MARKET_MAP && !hasVisitedMarketMap) {
            setHasVisitedMarketMap(true);
        }
    }, [normalizedView, hasVisitedMarketMap]);

    // Self-heal stale URLs when industry moved sectors.
    React.useEffect(() => {
        if (!loading && normalizedView === VIEWS.INDUSTRY && industry && (!sector || !hierarchy[sector]?.[industry])) {
            for (const s of sectors) {
                if (hierarchy[s]?.[industry]) {
                    console.debug(`[Self-Healing] Moving industry "${industry}" from "${sector}" to "${s}"`);
                    navigate(VIEWS.INDUSTRY, s, industry);
                    break;
                }
            }
        }
    }, [loading, normalizedView, sector, industry, hierarchy, sectors, navigate]);

    if (loading) return <AppLoadingScreen />;
    if (error) return <AppErrorScreen error={error} />;

    const insightsFallback = insightsCompany ? <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm" /> : null;

    return (
        <LazyMotion features={domAnimation}>
            <PriceProvider>
                <div className="min-h-screen selection:bg-[#c5a059]/30 !overflow-visible bg-[var(--bg-main)] text-[var(--text-main)] transition-colors duration-400">
                    <BackgroundAmbience />
                    <Navbar view={normalizedView} navigate={navigate} />

                    <main className="pt-24 md:pt-32 pb-20 px-4 md:px-8 max-w-7xl mx-auto relative z-10 !overflow-visible">
                        <AnimatePresence mode="wait">
                            {normalizedView !== VIEWS.MARKET_MAP && (
                                <RouterView
                                    key={normalizedView}
                                    view={normalizedView}
                                    sectors={sectors}
                                    hierarchy={hierarchy}
                                    sector={sector}
                                    industry={industry}
                                    timeframe={timeframe}
                                    setTimeframe={setTimeframe}
                                    currentIndustries={currentIndustries}
                                    currentCompanies={currentCompanies}
                                    onSectorClick={handleSectorClick}
                                    onIndustryClick={handleIndustryClick}
                                    onDomainIndustryClick={handleDomainIndustryClick}
                                    onTrackerSectorClick={handleTrackerSectorClick}
                                    onTrackerIndustryClick={handleTrackerIndustryClick}
                                    onSectorBack={handleSectorBack}
                                    onIndustryBack={handleIndustryBack}
                                    onSectorIndustryClick={handleSectorIndustryClick}
                                    onOpenInsights={handleOpenInsights}
                                    rawData={rawData}
                                    loading={loading}
                                />
                            )}
                        </AnimatePresence>

                        {(normalizedView === VIEWS.MARKET_MAP || hasVisitedMarketMap) && (
                            <div className={normalizedView === VIEWS.MARKET_MAP ? 'relative z-[60]' : 'hidden'}>
                                <MarketMapView hierarchy={hierarchy} />
                            </div>
                        )}
                    </main>

                    <React.Suspense fallback={insightsFallback}>
                        <CompanyInsights
                            isOpen={!!insightsCompany}
                            symbol={insightsCompany?.symbol}
                            name={insightsCompany?.name}
                            onClose={handleCloseInsights}
                        />
                    </React.Suspense>
                </div>
            </PriceProvider>
        </LazyMotion>
    );
};

export default App;

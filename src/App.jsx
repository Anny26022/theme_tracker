import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Hooks
import { useTheme } from './hooks/useTheme';
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
import { CompanyInsights } from './components/CompanyInsights';

const App = () => {
    // 1. Data & State Management (Hooks)
    const { theme, toggleTheme } = useTheme();
    const { view, sector, industry, timeframe, from, navigate, setTimeframe } = useUrlState();
    const { hierarchy, sectors, loading, error } = useMarketData();
    const [insightsCompany, setInsightsCompany] = React.useState(null);

    // 2. Derived State
    const currentIndustries = useMemo(() => {
        if (!sector || !hierarchy[sector]) return [];
        return Object.keys(hierarchy[sector]).sort();
    }, [hierarchy, sector]);

    const currentCompanies = useMemo(() => {
        if (!sector || !industry || !hierarchy[sector]) return [];
        return hierarchy[sector][industry] || [];
    }, [hierarchy, sector, industry]);

    // 3. Self-Healing URL Logic
    React.useEffect(() => {
        if (!loading && view === VIEWS.INDUSTRY && industry && (!sector || !hierarchy[sector] || !hierarchy[sector][industry])) {
            for (const s of sectors) {
                if (hierarchy[s][industry]) {
                    console.debug(`[Self-Healing] Moving industry "${industry}" from "${sector}" to "${s}"`);
                    navigate(VIEWS.INDUSTRY, s, industry);
                    break;
                }
            }
        }
    }, [loading, view, sector, industry, hierarchy, sectors, navigate]);

    // 4. Loading & Error States
    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#050508]">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-12 h-12 border-2 border-white/5 border-t-[#c5a059] rounded-full mb-4"
                />
                <span className="text-white/20 text-[10px] font-bold tracking-[0.2em] uppercase">Initializing Universe</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#050508]">
                <div className="p-8 glass-card border-rose-500/20 text-center space-y-4">
                    <h2 className="text-rose-500 text-xs font-bold uppercase tracking-[0.2em]">Data Sync Failure</h2>
                    <p className="text-white/40 text-[10px] uppercase tracking-widest">{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-2 glass-card text-[10px] font-bold uppercase tracking-widest hover:border-[var(--accent-primary)] transition-all"
                    >
                        Retry Connection
                    </button>
                </div>
            </div>
        );
    }

    // 4. Main Render
    return (
        <PriceProvider>
            <div className="min-h-screen selection:bg-[#c5a059]/30 overflow-x-hidden bg-[var(--bg-main)] text-[var(--text-main)] transition-colors duration-400">
                <BackgroundAmbience />
                <Navbar
                    view={view}
                    navigate={navigate}
                    theme={theme}
                    toggleTheme={toggleTheme}
                    sectors={sectors}
                    currentSector={sector}
                />

                <main className="pt-32 pb-20 px-8 max-w-7xl mx-auto relative z-10">
                    <AnimatePresence mode="wait">
                        {view === VIEWS.UNIVERSE && (
                            <UniverseView
                                sectors={sectors}
                                hierarchy={hierarchy}
                                onSectorClick={(s) => navigate(VIEWS.SECTOR, s, null)}
                                onIndustryClick={(s, ind) => navigate(VIEWS.INDUSTRY, s, ind)}
                                timeframe={timeframe}
                                setTimeframe={setTimeframe}
                                onOpenInsights={setInsightsCompany}
                            />
                        )}

                        {view === VIEWS.DOMAIN && (
                            <DomainView
                                sectors={sectors}
                                hierarchy={hierarchy}
                                onIndustryClick={(s, ind) => navigate(VIEWS.INDUSTRY, s, ind, 'domain')}
                            />
                        )}

                        {view === VIEWS.SECTOR && (
                            <SectorView
                                sector={sector}
                                industries={currentIndustries}
                                hierarchy={hierarchy}
                                onBack={() => navigate(from === 'tracker' ? VIEWS.TRACKER : VIEWS.DOMAIN, null, null)}
                                onIndustryClick={(ind) => navigate(VIEWS.INDUSTRY, sector, ind)}
                            />
                        )}

                        {view === VIEWS.INDUSTRY && (
                            <IndustryView
                                sector={sector}
                                industry={industry}
                                companies={currentCompanies}
                                onBack={() => navigate(from === 'tracker' ? VIEWS.TRACKER : VIEWS.DOMAIN, null, null)}
                                onOpenInsights={setInsightsCompany}
                            />
                        )}

                        {view === VIEWS.TRACKER && (
                            <TrackerView
                                sectors={sectors}
                                hierarchy={hierarchy}
                                onSectorClick={(s) => navigate(VIEWS.SECTOR, s, null, 'tracker')}
                                onIndustryClick={(s, ind) => navigate(VIEWS.INDUSTRY, s, ind, 'tracker')}
                                timeframe={timeframe}
                                setTimeframe={setTimeframe}
                                onOpenInsights={setInsightsCompany}
                            />
                        )}

                        {view === VIEWS.COMPARE && (
                            <ComparisonView
                                hierarchy={hierarchy}
                                timeframe={timeframe}
                                setTimeframe={setTimeframe}
                                onOpenInsights={setInsightsCompany}
                            />
                        )}
                    </AnimatePresence>
                </main>

                <CompanyInsights
                    isOpen={!!insightsCompany}
                    symbol={insightsCompany?.symbol}
                    name={insightsCompany?.name}
                    onClose={() => setInsightsCompany(null)}
                />
            </div>
        </PriceProvider>
    );
};

export default App;

import React, { useMemo, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { X, TrendingUp, Award, Landmark, BarChart3, PieChart, Activity, FileText, Newspaper, HelpCircle, ExternalLink } from 'lucide-react';
import { useFundamentals } from '../hooks/useFundamentals';
import { useFilings } from '../hooks/useFilings';
import { useLivePrice } from '../context/PriceContext';
import { getIsin } from '../services/isinService';
import { AnimatedPrice, AnimatedChange } from './AnimatedPrice';
import { formatIndianNumber, formatPercent, formatFilingDate } from '../lib/intlUtils';

const SNAPSHOT_SKELETON_KEYS = ['snapshot-1', 'snapshot-2', 'snapshot-3', 'snapshot-4', 'snapshot-5', 'snapshot-6'];
const FILINGS_SKELETON_KEYS = ['filings-1', 'filings-2', 'filings-3', 'filings-4'];

/**
 * Isolated Price Consumer to prevent panel-wide rerenders on every tick.
 */
const PriceSection = React.memo(({ symbol }) => {
    const { price, changePct } = useLivePrice(symbol);
    return (
        <div className="glass-card p-6 flex items-center justify-between border-dashed">
            <div className="space-y-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Current Market Price</span>
                <div className="flex items-baseline gap-2">
                    <AnimatedPrice value={price} className="text-2xl font-light tracking-tight text-[var(--text-main)]" />
                    <span className="text-[10px] text-[var(--text-muted)]">INR</span>
                </div>
            </div>
            <div className="text-right space-y-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Session Change</span>
                <AnimatedChange value={changePct} className="text-sm font-bold block" />
            </div>
        </div>
    );
});

/**
 * Premium Deep Dive & Insights Suite
 * Optimized to handle high-frequency price pulses and concurrent tab transitions.
 */
export const CompanyInsights = ({ symbol, name, isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState('SNAPSHOT');
    const [selectedYear, setSelectedYear] = useState(2026);


    // Stable business logic
    const { data: funda, loading: fundaLoading } = useFundamentals(symbol);
    const isin = useMemo(() => getIsin(symbol), [symbol]);
    const { data: filings, loading: filingsLoading } = useFilings(isin);

    const tabs = useMemo(() => [
        { id: 'SNAPSHOT', label: 'Snapshot', icon: <Activity className="w-3 h-3" /> },
        { id: 'FILINGS', label: 'Filings', icon: <FileText className="w-3 h-3" /> },
        { id: 'NEWS', label: 'News', icon: <Newspaper className="w-3 h-3" /> },
    ], []);

    const groupedFilings = useMemo(() => {
        if (!filings || !Array.isArray(filings)) return {};
        const groups = {};

        // Filter by selected year
        const filtered = filings.filter(f => {
            const dateStr = f.news_date || f.date || f.filingDate || f.fillingDate;
            if (!dateStr) return false;
            const date = new Date(dateStr);
            return date.getFullYear() === selectedYear;
        });

        filtered.forEach(f => {
            const dateStr = f.news_date || f.date || f.filingDate || f.fillingDate;
            const date = new Date(dateStr);
            const monthYear = date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
            if (!groups[monthYear]) groups[monthYear] = [];
            groups[monthYear].push(f);
        });
        return groups;
    }, [filings, selectedYear]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <m.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
                    />

                    <m.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed right-0 top-0 h-full w-full max-w-xl bg-[var(--bg-main)] border-l border-[var(--ui-divider)] z-[101] flex flex-col overflow-hidden shadow-2xl shadow-black"
                    >
                        {/* Header */}
                        <div className="sticky top-0 bg-[var(--bg-main)]/80 backdrop-blur-md z-10 px-4 md:px-8 py-6 border-b border-[var(--ui-divider)] flex items-center justify-between">
                            <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-sm font-bold tracking-[0.2em] text-[var(--accent-primary)] uppercase">Intel Suite</h2>
                                    <div className="px-2 py-0.5 rounded bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center gap-2">
                                        <span className="text-[8px] font-bold text-[var(--accent-primary)] uppercase tracking-widest">{symbol}</span>
                                        {isin && <span className="text-[7px] text-[var(--accent-primary)]/40 font-mono tracking-tighter hidden sm:inline">{isin}</span>}
                                    </div>
                                </div>
                                <h3 className="text-lg md:text-xl font-light tracking-wide text-[var(--text-main)] truncate max-w-full">{name}</h3>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-[var(--glass-border)] rounded-full transition-colors text-[var(--text-muted)] shrink-0">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex px-4 md:px-8 border-b border-[var(--ui-divider)] bg-[var(--bg-main)]/50 overflow-x-auto no-scrollbar">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-4 md:px-6 py-4 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all relative shrink-0 ${activeTab === tab.id ? 'text-[var(--accent-primary)] border-[var(--accent-primary)]' : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-main)]'
                                        }`}
                                >
                                    {tab.icon}
                                    {tab.label}
                                    {activeTab === tab.id && (
                                        <m.div layoutId="activeTabGlow" className="absolute inset-0 bg-[var(--accent-primary)]/5 z-0" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto no-scrollbar p-4 md:p-8">
                            <AnimatePresence mode="wait">
                                {activeTab === 'SNAPSHOT' && (
                                    <m.div
                                        key="snapshot"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="space-y-10"
                                    >
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Activity className="w-3 h-3 text-[var(--accent-primary)]" />
                                                <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-[var(--text-muted)]">Live Quote</span>
                                            </div>
                                            <PriceSection symbol={symbol} />
                                        </div>

                                        <div className="space-y-6">
                                            <div className="flex items-center gap-2">
                                                <BarChart3 className="w-3 h-3 text-[var(--accent-primary)]" />
                                                <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-[var(--text-muted)]">Fundamental Specs</span>
                                            </div>

                                            {fundaLoading ? (
                                                <div className="grid grid-cols-2 gap-4 md:gap-8">
                                                    {SNAPSHOT_SKELETON_KEYS.map((skeletonKey) => (
                                                        <div key={skeletonKey} className="h-16 bg-[var(--ui-divider)]/5 rounded animate-pulse" />
                                                    ))}
                                                </div>
                                            ) : funda ? (
                                                <div className="grid grid-cols-2 gap-x-4 md:gap-x-12 gap-y-8 md:gap-y-10">
                                                    <Metric label="Market Cap" value={formatIndianNumber(funda.marketCap)} subValue="INR" icon={<PieChart className="w-3 h-3" />} />
                                                    <Metric label="P/E Ratio" value={funda.peRatio ? funda.peRatio.toFixed(2) : "—"} subValue="Multiple" icon={<TrendingUp className="w-3 h-3" />} />
                                                    <Metric label="Div. Yield" value={formatPercent(funda.yield)} subValue="Yield" icon={<Landmark className="w-3 h-3" />} />
                                                    <Metric label="Volume" value={formatIndianNumber(funda.volume)} subValue="Shares" icon={<BarChart3 className="w-3 h-3" />} />
                                                    <Metric label="EPS (TTM)" value={funda.eps ? funda.eps.toFixed(2) : "—"} subValue="Per Share" icon={<TrendingUp className="w-3 h-3" />} />
                                                    <Metric label="52W Range" value={`${formatIndianNumber(funda.low52)} - ${formatIndianNumber(funda.high52)}`} subValue="Price" icon={<Activity className="w-3 h-3" />} />
                                                </div>
                                            ) : (
                                                <div className="py-12 text-center border border-dashed border-[var(--ui-divider)] rounded">
                                                    <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Alpha data restricted</span>
                                                </div>
                                            )}
                                        </div>

                                        {funda?.description && (
                                            <div className="space-y-4 pt-4">
                                                <div className="flex items-center gap-2">
                                                    <Award className="w-3 h-3 text-[var(--accent-primary)]" />
                                                    <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-[var(--text-muted)]">Corporate Profile</span>
                                                </div>
                                                <p className="text-[10px] leading-relaxed text-[var(--text-muted)] font-light tracking-wide first-letter:text-lg first-letter:text-[var(--accent-primary)] first-letter:float-left first-letter:mr-2">
                                                    {funda.description}
                                                </p>
                                            </div>
                                        )}
                                    </m.div>
                                )}

                                {activeTab === 'FILINGS' && (
                                    <m.div
                                        key="filings"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="space-y-8"
                                    >
                                        {!isin ? (
                                            <div className="py-20 text-center flex flex-col items-center gap-4">
                                                <HelpCircle className="w-8 h-8 text-[var(--ui-muted)]" />
                                                <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[var(--text-muted)]">ISIN Missing</span>
                                            </div>
                                        ) : filingsLoading ? (
                                            <div className="space-y-8">
                                                {FILINGS_SKELETON_KEYS.map((skeletonKey) => (
                                                    <div key={skeletonKey} className="h-20 bg-[var(--ui-divider)]/5 rounded animate-pulse" />
                                                ))}
                                            </div>
                                        ) : (
                                            <>
                                                {/* Year Selector UI */}
                                                <div className="flex md:justify-end mb-8 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
                                                    <div className="flex bg-[var(--ui-divider)]/10 p-1 rounded-xl border border-[var(--ui-divider)]/20 shrink-0">
                                                        {[2026, 2025, 2024, 2023, 2022, 2021].map(year => (
                                                            <button
                                                                key={year}
                                                                onClick={() => setSelectedYear(year)}
                                                                className={`px-3 md:px-4 py-1.5 rounded-lg text-[9px] font-bold transition-all ${selectedYear === year
                                                                    ? 'bg-white text-black shadow-lg'
                                                                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                                                                    }`}
                                                            >
                                                                {year}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {Object.keys(groupedFilings).length > 0 ? (

                                                    <div className="relative pl-6 space-y-10">
                                                        <div className="absolute left-[7px] top-2 bottom-0 w-[1px] bg-gradient-to-b from-[var(--accent-primary)]/40 via-[var(--ui-divider)] to-transparent" />
                                                        {Object.entries(groupedFilings).map(([month, items]) => (
                                                            <div key={month} className="relative space-y-4">
                                                                <div className="absolute -left-[23px] top-1 w-2.5 h-2.5 rounded-full bg-[var(--bg-main)] border-2 border-[var(--accent-primary)] shadow-[0_0_8px_var(--accent-primary)] z-10" />
                                                                <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-[var(--text-main)]">{month}</span>
                                                                <div className="grid grid-cols-1 gap-2">
                                                                    {items.map((item) => (
                                                                        <a key={item.file_url || item.pdfUrl || item.url || `${item.caption || item.title || item.subject || 'filing'}-${item.news_date || item.date || item.filingDate || item.fillingDate || 'unknown'}`} href={item.file_url || item.pdfUrl || item.url || '#'} target="_blank" rel="noopener noreferrer" className="glass-card p-4 flex items-center justify-between group hover:border-[var(--accent-primary)] transition-all">
                                                                            <div className="flex items-center gap-4">
                                                                                <div className="p-3 rounded bg-[var(--ui-divider)]/5 group-hover:bg-[var(--accent-primary)]/10 transition-colors">
                                                                                    <FileText className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent-primary)]" />
                                                                                </div>
                                                                                <div className="flex flex-col gap-1">
                                                                                    <span className="text-[10px] uppercase font-bold text-[var(--text-main)] tracking-widest group-hover:text-[var(--accent-primary)] line-clamp-1">{item.caption || item.title || item.subject || 'Corporate Filing'}</span>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="text-[8px] uppercase font-bold tracking-[0.2em] text-[var(--accent-primary)]">{item.cat || item.descriptor || item.categoryLabel || item.type || 'Notification'}</span>
                                                                                        <span className="text-[8px] text-[var(--text-muted)]">•</span>
                                                                                        <span className="text-[8px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{formatFilingDate(item.news_date || item.date || item.filingDate || item.fillingDate)}</span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <ExternalLink className="w-3 h-3 text-[var(--ui-muted)] group-hover:text-[var(--accent-primary)] opacity-0 group-hover:opacity-100 transition-all transform translate-x-1 group-hover:translate-x-0" />
                                                                        </a>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="py-20 text-center text-[var(--text-muted)] text-[9px] uppercase tracking-widest font-bold">
                                                        No filings detected for {selectedYear}
                                                    </div>
                                                )}
                                            </>
                                        )}

                                    </m.div>
                                )}

                                {activeTab === 'NEWS' && (
                                    <m.div
                                        key="news"
                                        initial={{ opacity: 0, scale: 0.98 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 1.02 }}
                                        className="py-20 text-center space-y-4"
                                    >
                                        <div className="w-12 h-12 rounded-full border border-dashed border-[var(--ui-divider)] flex items-center justify-center mx-auto">
                                            <Newspaper className="w-5 h-5 text-[var(--ui-muted)]" />
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[10px] uppercase font-bold tracking-[0.5em] text-[var(--accent-primary)]">Wire Feed Offline</span>
                                            <p className="text-[8px] text-[var(--text-muted)] uppercase tracking-widest opacity-60">Connecting to high-frequency news nodes...</p>
                                        </div>
                                    </m.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </m.div>
                </>
            )}
        </AnimatePresence>
    );
};

const Metric = React.memo(({ label, value, subValue, icon, color = "text-[var(--text-main)]" }) => (
    <div className="space-y-3 group">
        <div className="flex items-center gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
            {icon}
            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">{label}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
            <span className={`text-base font-light tracking-tight ${color}`}>{value}</span>
            {subValue && <span className="text-[8px] font-bold uppercase text-[var(--ui-muted)] tracking-tighter">{subValue}</span>}
        </div>
    </div>
));

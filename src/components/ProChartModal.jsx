import React, { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, ChevronLeft, ChevronRight, Hash } from 'lucide-react';
import FinvizChart from './FinvizChart';
import { THEMATIC_MAP, MACRO_PILLARS } from '../data/thematicMap';
import { cleanSymbol, getCachedComparisonSeries } from '../services/priceService';
import { useMarketDataRegistry, useChartVersion } from '../context/MarketDataContext';

const ProChartModal = ({
    isOpen,
    onClose,
    symbol,
    name,
    series,
    allCompanies = [],
    navigationCompanies = [],
    onSymbolChange,
    initialTimeframe = '1D'
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [currentTimeframe, setCurrentTimeframe] = useState(initialTimeframe);
    const searchInputRef = useRef(null);

    const { subscribeChartSymbols } = useMarketDataRegistry();
    const chartVersion = useChartVersion();

    // Determine the ideal Google Finance API interval to fetch.
    // To get "daily" candles (1D resolution), we must fetch the 1Y window. 
    // For anything larger (1W, 1M, 1Y resolution), MAX gives us enough history (weekly points).
    const apiInterval = useMemo(() => {
        if (currentTimeframe === '1D') return '1Y';
        return 'MAX';
    }, [currentTimeframe]);

    // Subscribe to the correct resolution data stream
    useEffect(() => {
        if (!isOpen || !symbol) return;
        return subscribeChartSymbols(apiInterval, [symbol]);
    }, [isOpen, symbol, apiInterval, subscribeChartSymbols]);

    const localSeries = useMemo(() => {
        if (!isOpen || !symbol) return [];
        // Fallback to the `series` passed from parent if our specific interval is still loading
        const cached = getCachedComparisonSeries(cleanSymbol(symbol), apiInterval, { silent: true });
        return (cached && cached.length > 0) ? cached : series;
    }, [isOpen, symbol, apiInterval, chartVersion, series]);


    // Keyboard Hotkeys
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e) => {
            // Navigation remains active
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                navigateSymbol(1);
                return;
            }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                navigateSymbol(-1);
                return;
            }

            // Close
            if (e.key === 'Escape') {
                onClose();
                return;
            }

            // Search Trigger (Start typing or '/')
            if (!isSearchOpen && /^[a-zA-Z0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
                setIsSearchOpen(true);
                setSearchTerm(e.key);
                setTimeout(() => searchInputRef.current?.focus(), 10);
            }
            if (e.key === '/') {
                e.preventDefault();
                setIsSearchOpen(true);
                setSearchTerm('');
                setTimeout(() => searchInputRef.current?.focus(), 10);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isSearchOpen, allCompanies, symbol, onClose]);

    const navigateSymbol = (dir) => {
        const navList = navigationCompanies.length > 0 ? navigationCompanies : allCompanies;
        if (!navList.length) return;
        const currentIdx = navList.findIndex(c => cleanSymbol(c.symbol) === cleanSymbol(symbol));
        if (currentIdx === -1) {
            // If current symbol not in nav list (e.g. after search), just go to first/last
            onSymbolChange(navList[dir > 0 ? 0 : navList.length - 1]);
            return;
        }
        const nextIdx = (currentIdx + dir + navList.length) % navList.length;
        onSymbolChange(navList[nextIdx]);
    };

    const filteredSymbols = useMemo(() => {
        if (!searchTerm) return [];
        const lowSearch = searchTerm.toLowerCase();

        // Search in current list first, then everywhere? No, let's just search in everything for "Sleek search"
        // Search in the provided companies list
        const results = allCompanies.filter(company =>
            company.symbol.toLowerCase().includes(lowSearch) ||
            company.name.toLowerCase().includes(lowSearch)
        ).map(c => ({ ...c, theme: 'Current Cluster' }));

        // Deduplicate
        const seen = new Set();
        return results.filter(r => {
            if (seen.has(r.symbol)) return false;
            seen.add(r.symbol);
            return true;
        }).slice(0, 10);
    }, [searchTerm]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[20000] bg-[#050608] flex flex-col font-sans text-white transition-all duration-300">
            {/* Header / Toolbar */}
            <div className="h-12 border-b border-white/5 bg-[#0b0e14]/80 backdrop-blur-xl flex items-center justify-between px-4">
                <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center border border-white/10 p-1">
                        <img
                            src={`https://images.dhan.co/symbol/${symbol}.png`}
                            alt=""
                            className="w-full h-full object-contain"
                            onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                            }}
                        />
                        <div className="hidden w-full h-full items-center justify-center bg-[var(--accent-primary)]/10">
                            <span className="text-[10px] font-black text-[var(--accent-primary)]">
                                {symbol.charAt(0)}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[14px] font-black tracking-tight text-[var(--accent-primary)] uppercase leading-none">{symbol}</span>
                        <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest mt-1">{name}</span>
                    </div>

                    {/* Timeframe Toggles */}
                    <div className="flex bg-[#1a1c22]/50 p-0.5 rounded border border-white/5 gap-0.5">
                        {['1D', '1W', '1M', '1Y'].map(tf => (
                            <button
                                key={tf}
                                onClick={() => setCurrentTimeframe(tf)}
                                className={`px-2 py-1 rounded-[2px] text-[9px] font-black transition-all ${currentTimeframe === tf ? 'bg-[var(--accent-primary)] text-black' : 'text-white/30 hover:text-white hover:bg-white/5'}`}
                            >
                                {tf}
                            </button>
                        ))}
                    </div>

                    <div className="h-4 w-[1px] bg-white/10 mx-2" />

                    <button
                        onClick={() => setIsSearchOpen(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded hover:bg-white/10 transition-colors border border-white/5"
                    >
                        <Search size={12} className="text-white/40" />
                        <span className="text-[9px] font-black text-white/60 uppercase tracking-widest">Search Symbol...</span>
                    </button>
                </div>

                <div className="flex items-center gap-2">


                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-red-500/20 text-white/40 hover:text-red-500 rounded-full transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Main Chart Area */}
            <div className="flex-1 overflow-hidden relative p-4 flex flex-col">
                <div className="flex-1 bg-black/40 rounded-xl border border-white/5 overflow-hidden shadow-2xl relative flex flex-col">
                    <FinvizChart
                        symbol={symbol}
                        name={name}
                        series={localSeries}
                        forcedTimeframe={currentTimeframe}
                        isProMode={true}
                    />
                </div>
            </div>

            <div className="h-8 border-t border-white/5 bg-[#0b0e14] px-4 flex items-center justify-center text-[8px] font-black tracking-widest text-white/20 uppercase">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-white/40 font-sans">ESC</kbd> CLOSE
                        </div>
                        <div className="w-[1px] h-2 bg-white/10" />
                        <div className="flex items-center gap-2">
                            <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-white/40 font-sans">/</kbd> COMMANDS
                        </div>
                        <div className="w-[1px] h-2 bg-white/10" />
                        <div className="flex items-center gap-2 text-white/10">
                            <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-white/40 font-sans">← →</kbd> SWITCH SYMBOL
                        </div>
                    </div>
                </div>
            </div>

            {/* Symbol Search Overlay */}
            {isSearchOpen && (
                <div className="fixed inset-0 z-[10000] flex items-start justify-center pt-24 backdrop-blur-md bg-black/60">
                    <div className="w-full max-w-xl bg-[#0b0e14] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-2.5 flex items-center gap-3 border-b border-white/5">
                            <Search className="text-[var(--accent-primary)] opacity-60" size={16} />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchTerm}
                                onChange={(e) => {
                                    const val = e.target.value.toUpperCase();
                                    setSearchTerm(val);

                                    // Timeframe commands (TradingView style) - Enforce numeric format
                                    if (['1D', '1W', '1M', '1Y', '12M'].includes(val)) {
                                        const finalTf = val === '12M' ? '1Y' : val;
                                        setCurrentTimeframe(finalTf);
                                        setIsSearchOpen(false);
                                        setSearchTerm('');
                                        return;
                                    }

                                    if (!val) setIsSearchOpen(false);
                                }}
                                placeholder="Search Symbol..."
                                className="flex-1 bg-transparent border-none outline-none text-[16px] font-black uppercase tracking-tight text-white placeholder:text-white/10"
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                        if (searchTerm) setSearchTerm('');
                                        else setIsSearchOpen(false);
                                    }
                                    if (e.key === 'Enter' && filteredSymbols.length > 0) {
                                        onSymbolChange(filteredSymbols[0]);
                                        setIsSearchOpen(false);
                                        setSearchTerm('');
                                    }
                                }}
                            />
                            <button onClick={() => setIsSearchOpen(false)} className="text-[10px] font-black text-white/20 hover:text-white px-2 tracking-widest bg-white/5 rounded py-1 transition-colors border border-white/5">ESC</button>
                        </div>

                        <div className="max-h-[400px] overflow-y-auto p-2 no-scrollbar">
                            {filteredSymbols.length > 0 ? (
                                filteredSymbols.map((s, i) => (
                                    <button
                                        key={s.symbol}
                                        onClick={() => {
                                            onSymbolChange(s);
                                            setIsSearchOpen(false);
                                            setSearchTerm('');
                                        }}
                                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 rounded-lg transition-colors group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center border border-white/10 p-1 group-hover:bg-[var(--accent-primary)] transition-colors">
                                                <img
                                                    src={`https://images.dhan.co/symbol/${s.symbol}.png`}
                                                    alt=""
                                                    className="w-full h-full object-contain group-hover:invert group-hover:brightness-0"
                                                    onError={(e) => {
                                                        e.target.style.display = 'none';
                                                        e.target.nextSibling.style.display = 'flex';
                                                    }}
                                                />
                                                <div className="hidden w-full h-full items-center justify-center bg-[var(--accent-primary)]/10 group-hover:bg-transparent">
                                                    <span className="text-[10px] font-black text-[var(--accent-primary)] group-hover:text-black">
                                                        {s.symbol[0]}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-start leading-tight">
                                                <span className="text-[13px] font-black uppercase tracking-tight">{s.symbol}</span>
                                                <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{s.name}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-white/5 border border-white/10 rounded text-white/40">{s.theme}</span>
                                        </div>
                                    </button>
                                ))
                            ) : searchTerm ? (
                                <div className="py-12 flex flex-col items-center opacity-20 italic text-[12px]">No matches found</div>
                            ) : (
                                <div className="py-12 flex flex-col items-center opacity-20 italic text-[12px]">Type to find symbol...</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>,
        document.body
    );
};

export default ProChartModal;

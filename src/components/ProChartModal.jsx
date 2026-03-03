import React, { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, ChevronLeft, ChevronRight, Hash, LayoutGrid, Link2, Clock, Crosshair, ChevronDown, Layers, TrendingUp } from 'lucide-react';
import FinvizChart from './FinvizChart';
import { THEMATIC_MAP, MACRO_PILLARS } from '../data/thematicMap';
import { cleanSymbol, getCachedComparisonSeries } from '../services/priceService';
import { useMarketDataRegistry, useChartVersion } from '../context/MarketDataContext';

const CHART_LAYOUTS = {
    '1': { rows: 1, cols: 1, areas: ['area-0'] },
    '2h': { rows: 2, cols: 1, areas: ['area-0', 'area-1'] },
    '2v': { rows: 1, cols: 2, areas: ['area-0', 'area-1'] },
    '3h': { rows: 3, cols: 1, areas: ['area-0', 'area-1', 'area-2'] },
    '3v': { rows: 1, cols: 3, areas: ['area-0', 'area-1', 'area-2'] },
    '3sl': { rows: 2, cols: 2, areas: ['area-0', 'area-1', 'area-0', 'area-2'], custom: 'grid-template-areas: "a b" "a c"' },
    '3sr': { rows: 2, cols: 2, areas: ['area-0', 'area-1', 'area-2', 'area-1'], custom: 'grid-template-areas: "a b" "c b"' },
    '3st': { rows: 2, cols: 2, areas: ['area-0', 'area-0', 'area-1', 'area-2'], custom: 'grid-template-areas: "a a" "b c"' },
    '3sb': { rows: 2, cols: 2, areas: ['area-0', 'area-1', 'area-2', 'area-2'], custom: 'grid-template-areas: "a b" "c c"' },
    '4g': { rows: 2, cols: 2, areas: ['area-0', 'area-1', 'area-2', 'area-3'] },
    '4h': { rows: 4, cols: 1, areas: ['area-0', 'area-1', 'area-2', 'area-3'] },
    '4v': { rows: 1, cols: 4, areas: ['area-0', 'area-1', 'area-2', 'area-3'] },
    '6g': { rows: 2, cols: 3, areas: ['area-0', 'area-1', 'area-2', 'area-3', 'area-4', 'area-5'] },
    '8g': { rows: 2, cols: 4, areas: ['area-0', 'area-1', 'area-2', 'area-3', 'area-4', 'area-5', 'area-6', 'area-7'] },
};

const ProChartModal = ({
    isOpen,
    onClose,
    symbol,
    name,
    series,
    allCompanies = [],
    navigationCompanies = [],
    onSymbolChange,
    themeName,
    onSelectTheme,
    onViewModeChange,
    viewMode = 'THEMATIC',
    initialTimeframe = '1D'
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isLayoutOpen, setIsLayoutOpen] = useState(false);
    const [isClusterOpen, setIsClusterOpen] = useState(false);
    const [isStyleOpen, setIsStyleOpen] = useState(false);

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
    const load = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
    const [layoutId, _setLayoutId] = useState(() => localStorage.getItem('tt_pro_layout') || '1');
    const setLayoutId = (v) => { _setLayoutId(v); localStorage.setItem('tt_pro_layout', v); };

    const [clusterOffset, setClusterOffset] = useState(0);
    const chartsCount = CHART_LAYOUTS[layoutId].rows * CHART_LAYOUTS[layoutId].cols;

    // Initialize offset only when theme changes
    useEffect(() => {
        const idx = navigationCompanies.findIndex(c => c.symbol === symbol);
        setClusterOffset(idx !== -1 ? Math.floor(idx / chartsCount) * chartsCount : 0);
    }, [themeName, navigationCompanies.length]);

    const [syncOptions, _setSyncOptions] = useState(() => load('tt_pro_sync', { symbol: false, interval: true, crosshair: false, cluster: true, slotNav: true, pageNav: true }));
    const setSyncOptions = (v) => _setSyncOptions(prev => { const next = typeof v === 'function' ? v(prev) : v; localStorage.setItem('tt_pro_sync', JSON.stringify(next)); return next; });
    const [chartStates, _setChartStates] = useState(() => load('tt_pro_charts', Array.from({ length: 16 }, () => ({ symbol, name, timeframe: initialTimeframe }))));
    const setChartStates = (v) => _setChartStates(prev => { const next = typeof v === 'function' ? v(prev) : v; localStorage.setItem('tt_pro_charts', JSON.stringify(next)); return next; });
    const [chartStyle, _setChartStyle] = useState(() => localStorage.getItem('tt_pro_style') || 'candles');
    const setChartStyle = (v) => { _setChartStyle(v); localStorage.setItem('tt_pro_style', v); };
    const [activeChartIndex, setActiveChartIndex] = useState(0);
    const currentChart = chartStates[activeChartIndex] || chartStates[0];
    const searchInputRef = useRef(null);

    const { subscribeChartSymbols } = useMarketDataRegistry();
    const chartVersion = useChartVersion();

    const prevOpenRef = useRef(false);
    useEffect(() => {
        if (isOpen && !prevOpenRef.current && symbol) {
            setChartStates(prev => {
                const next = [...prev];
                next[0] = { ...next[0], symbol, name };
                return next;
            });
            setActiveChartIndex(0);
        }
        prevOpenRef.current = isOpen;
    }, [isOpen, symbol, name]);


    // Bulk Sync Cluster: Only when theme or page manually changes
    useEffect(() => {
        if (!isOpen || layoutId === '1' || !syncOptions.cluster || !navigationCompanies.length) return;
        setChartStates(prev => prev.map((s, i) => {
            const stock = navigationCompanies[clusterOffset + i];
            return stock ? { ...s, symbol: stock.symbol, name: stock.name } : { ...s, symbol: '', name: 'Empty' };
        }));
    }, [themeName, clusterOffset, layoutId, isOpen, syncOptions.cluster]);


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

        // Page Nav: shift the whole batch by one page
        if (syncOptions.pageNav && layoutId !== '1') {
            setClusterOffset(prev => {
                const next = prev + dir * chartsCount;
                return next >= 0 && next < navigationCompanies.length ? next : prev;
            });
            return;
        }

        // Slot Nav: only change the active slot's symbol
        if (syncOptions.slotNav) {
            const curIdx = navList.findIndex(c => cleanSymbol(c.symbol) === cleanSymbol(chartStates[activeChartIndex].symbol));
            const nextIdx = curIdx === -1 ? (dir > 0 ? 0 : navList.length - 1) : (curIdx + dir + navList.length) % navList.length;
            handleChartChange(activeChartIndex, navList[nextIdx]);
            return;
        }

        // Default: change currentChart symbol
        const curIdx = navList.findIndex(c => cleanSymbol(c.symbol) === cleanSymbol(currentChart.symbol));
        const nextIdx = curIdx === -1 ? (dir > 0 ? 0 : navList.length - 1) : (curIdx + dir + navList.length) % navList.length;
        handleChartChange(activeChartIndex, navList[nextIdx]);
    };

    const handleChartChange = (index, newData) => {
        setChartStates(prev => {
            const next = [...prev];
            const updatedSymbol = typeof newData === 'string' ? newData : newData.symbol;
            const updatedName = typeof newData === 'string' ? prev[index].name : newData.name;

            if (syncOptions.symbol) {
                // Update all charts
                return next.map(c => ({ ...c, symbol: updatedSymbol, name: updatedName }));
            } else {
                next[index] = { ...next[index], symbol: updatedSymbol, name: updatedName };
                return next;
            }
        });
        if (activeChartIndex === index) {
            onSymbolChange(newData);
        }
    };

    const handleTimeframeChange = (index, tf) => {
        setChartStates(prev => {
            const next = [...prev];
            if (syncOptions.interval) {
                return next.map(c => ({ ...c, timeframe: tf }));
            } else {
                next[index] = { ...next[index], timeframe: tf };
                return next;
            }
        });
    };

    const filteredSymbols = useMemo(() => {
        if (!searchTerm) return [];
        const lowSearch = searchTerm.toLowerCase();

        // Search in current list first, then everywhere? No, let's just search in everything for "Sleek search"
        // Search in the provided companies list
        const results = allCompanies.filter(company =>
            company.symbol.toLowerCase().includes(lowSearch) ||
            company.name.toLowerCase().includes(lowSearch)
        );

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
        <div className="fixed inset-0 z-[20000] bg-[#050608] flex flex-col font-sans text-white selection:bg-[var(--accent-primary)]/30 animate-in fade-in duration-300">
            {/* Header / Toolbar */}
            <div className="h-10 border-b border-white/5 bg-[#0b0e14]/40 backdrop-blur-xl flex items-center justify-between px-4 z-[100]">
                <div className="flex items-center gap-3">
                    {layoutId === '1' && (
                        <>
                            <div className="w-7 h-7 rounded bg-white/5 flex items-center justify-center border border-white/5 p-1">
                                <img
                                    src={`https://images.dhan.co/symbol/${currentChart.symbol}.png`}
                                    alt=""
                                    className="w-full h-full object-contain brightness-110"
                                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                                />
                                <div className="hidden w-full h-full items-center justify-center">
                                    <span className="text-[10px] font-black text-[var(--accent-primary)]">{currentChart.symbol.charAt(0)}</span>
                                </div>
                            </div>
                            <div className="flex flex-col -space-y-1">
                                <span className="text-[16px] font-black tracking-tight text-[var(--accent-primary)] uppercase leading-tight">{currentChart.symbol}</span>
                                <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest leading-none mt-0.5">{currentChart.name}</span>
                            </div>
                            <div className="flex bg-white/5 p-0.5 rounded border border-white/5 gap-0.5 ml-1">
                                {['1D', '1W', '1M', '1Y'].map(tf => (
                                    <button key={tf} onClick={() => handleTimeframeChange(activeChartIndex, tf)}
                                        className={`px-2 py-1 rounded-[2px] text-[10px] font-black transition-all ${currentChart.timeframe === tf ? 'bg-[var(--accent-primary)] text-black' : 'text-white/25 hover:text-white hover:bg-white/5'}`}
                                    >{tf}</button>
                                ))}
                            </div>
                            <div className="h-4 w-[1px] bg-white/5 mx-1" />
                        </>
                    )}

                    {/* Inline Search */}
                    <div className="relative">
                        <div className={`flex items-center gap-2 px-2.5 py-1 rounded border transition-all duration-300 ${isSearchOpen ? 'bg-white/10 border-white/20 w-[220px]' : 'bg-white/5 border-white/5 w-[120px] cursor-pointer hover:bg-white/10'}`}
                            onClick={() => { if (!isSearchOpen) { setIsSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 10); } }}
                        >
                            <Search size={11} className="text-white/30 shrink-0" />
                            {isSearchOpen ? (
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => {
                                        const val = e.target.value.toUpperCase();
                                        setSearchTerm(val);
                                        if (['1D', '1W', '1M', '1Y', '12M'].includes(val)) {
                                            handleTimeframeChange(activeChartIndex, val === '12M' ? '1Y' : val);
                                            setIsSearchOpen(false); setSearchTerm('');
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape') { setIsSearchOpen(false); setSearchTerm(''); }
                                        if (e.key === 'Enter' && filteredSymbols.length > 0) {
                                            handleChartChange(activeChartIndex, filteredSymbols[0]);
                                            setIsSearchOpen(false); setSearchTerm('');
                                        }
                                    }}
                                    onBlur={() => { setTimeout(() => { setIsSearchOpen(false); setSearchTerm(''); }, 200); }}
                                    placeholder="SEARCH..."
                                    className="flex-1 bg-transparent border-none outline-none text-[10px] font-black uppercase tracking-widest text-white placeholder:text-white/20 w-full"
                                />
                            ) : (
                                <span className="text-[9px] font-black text-white/25 uppercase tracking-[0.2em]">Quick Find</span>
                            )}
                        </div>

                        {isSearchOpen && searchTerm && filteredSymbols.length > 0 && (
                            <div className="absolute top-full left-0 mt-2 w-[280px] bg-[#0b0e14]/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden z-[101]">
                                {filteredSymbols.map(s => (
                                    <button key={s.symbol}
                                        onMouseDown={(e) => { e.preventDefault(); handleChartChange(activeChartIndex, s); setIsSearchOpen(false); setSearchTerm(''); }}
                                        className="w-full px-3 py-2 flex items-center gap-3 hover:bg-white/5 transition-colors"
                                    >
                                        <div className="w-5 h-5 rounded bg-white/5 flex items-center justify-center border border-white/5 overflow-hidden shrink-0">
                                            <img src={`https://images.dhan.co/symbol/${s.symbol}.png`} alt="" className="w-full h-full object-contain brightness-110"
                                                onError={(e) => { e.target.style.display = 'none'; }} />
                                        </div>
                                        <div className="flex flex-col items-start leading-tight">
                                            <span className="text-[11px] font-black uppercase tracking-tight">{s.symbol}</span>
                                            <span className="text-[8px] font-bold text-white/20 uppercase tracking-wider">{s.name}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Cluster Switcher */}
                    <div className="relative">
                        <button
                            onClick={() => setIsClusterOpen(!isClusterOpen)}
                            className={`flex items-center gap-2 px-2.5 py-1 rounded transition-all border ${isClusterOpen ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]/30 text-[var(--accent-primary)]' : 'bg-white/5 border-white/5 text-white/30 hover:text-white hover:bg-white/10'}`}
                        >
                            <Hash size={11} />
                            <span className="text-[9px] font-black uppercase tracking-widest truncate max-w-[100px]">{themeName}</span>
                            <ChevronDown size={9} className={`transition-transform duration-300 opacity-30 ${isClusterOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isClusterOpen && (
                            <>
                                <div className="fixed inset-0 z-[100]" onClick={() => setIsClusterOpen(false)} />
                                <div className="absolute top-full left-0 mt-1 w-[260px] max-h-[420px] overflow-y-auto no-scrollbar bg-[#080a0f]/98 backdrop-blur-xl border border-white/8 rounded-lg shadow-[0_16px_48px_rgba(0,0,0,0.9)] p-1.5 z-[101] animate-in fade-in slide-in-from-top-2 duration-200">
                                    {/* View Mode Toggle */}
                                    <div className="flex bg-white/[0.03] p-[2px] rounded border border-white/[0.06] mb-2 mx-0.5">
                                        <button
                                            onClick={() => onViewModeChange && onViewModeChange('THEMATIC')}
                                            className={`flex-1 py-0.5 rounded-[2px] text-[9px] font-black tracking-[0.1em] uppercase transition-all ${viewMode === 'THEMATIC' ? 'bg-[var(--accent-primary)] text-black shadow-sm' : 'text-white/20 hover:text-white/40 hover:bg-white/5'}`}
                                        >
                                            Thematic
                                        </button>
                                        <button
                                            onClick={() => onViewModeChange && onViewModeChange('MACRO')}
                                            className={`flex-1 py-0.5 rounded-[2px] text-[9px] font-black tracking-[0.1em] uppercase transition-all ${viewMode === 'MACRO' ? 'bg-[var(--accent-primary)] text-black shadow-sm' : 'text-white/20 hover:text-white/40 hover:bg-white/5'}`}
                                        >
                                            Macro
                                        </button>
                                    </div>

                                    <div className="space-y-1">
                                        {viewMode === 'THEMATIC' ? (
                                            switcherData.map((block, bi) => (
                                                <div key={bi} className="mb-1">
                                                    <div className="px-2 py-0.5 border-b border-white/[0.06] mb-1">
                                                        <span className="text-[8.5px] font-black text-[var(--accent-primary)]/70 tracking-[0.12em] uppercase truncate">{block.title}</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-1 px-0.5">
                                                        {block.themes.map((theme, ti) => (
                                                            <button
                                                                key={ti}
                                                                onClick={() => {
                                                                    if (onSelectTheme) onSelectTheme(theme);
                                                                    setIsClusterOpen(false);
                                                                }}
                                                                className={`text-[8.5px] px-2 py-1 rounded-[2px] transition-all font-bold uppercase tracking-tight text-left truncate
                                                                    ${theme === themeName
                                                                        ? 'bg-[var(--accent-primary)] text-black shadow-sm'
                                                                        : 'bg-white/[0.03] text-white/30 hover:text-white/60 hover:bg-white/[0.06] border border-transparent hover:border-white/10'}`}
                                                                title={theme}
                                                            >
                                                                {theme}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            switcherData.map((pillar, pi) => (
                                                <div key={pi} className="mb-2">
                                                    <div className="px-2 py-0.5 flex items-center gap-1.5 border-b border-white/[0.06] mb-1">
                                                        <Layers size={9} className="text-[var(--accent-primary)]/60" />
                                                        <span className="text-[8.5px] font-black text-white/30 tracking-[0.1em] uppercase truncate">{pillar.title}</span>
                                                    </div>
                                                    {pillar.blocks.map((block, bi) => (
                                                        <div key={bi} className="pl-1.5 border-l border-[var(--accent-primary)]/10 ml-1.5 mb-1">
                                                            <div className="px-1 py-0.5 text-[7.5px] font-bold text-white/20 uppercase tracking-tight mb-0.5">{block.title}</div>
                                                            <div className="grid grid-cols-2 gap-1">
                                                                {block.themes.map((theme, ti) => (
                                                                    <button
                                                                        key={ti}
                                                                        onClick={() => {
                                                                            if (onSelectTheme) onSelectTheme(theme);
                                                                            setIsClusterOpen(false);
                                                                        }}
                                                                        className={`text-[8px] px-2 py-1 rounded-[2px] transition-all font-bold uppercase tracking-tight text-left truncate
                                                                            ${theme === themeName
                                                                                ? 'bg-[var(--accent-primary)] text-black shadow-sm'
                                                                                : 'bg-white/[0.03] text-white/30 hover:text-white/60 hover:bg-white/[0.06] border border-transparent hover:border-white/10'}`}
                                                                        title={theme}
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
                            </>
                        )}
                    </div>

                    <div className="h-4 w-[1px] bg-white/5 mx-2" />

                    {/* Simplified Batch Controls */}
                    {layoutId !== '1' && syncOptions.cluster && (
                        <div className="flex bg-white/5 p-0.5 rounded border border-white/5 mr-2">
                            <button onClick={() => setClusterOffset(o => Math.max(0, o - (CHART_LAYOUTS[layoutId].rows * CHART_LAYOUTS[layoutId].cols)))} className="p-1 opacity-40 hover:opacity-100"><ChevronLeft size={14} /></button>
                            <button onClick={() => setClusterOffset(o => o + (CHART_LAYOUTS[layoutId].rows * CHART_LAYOUTS[layoutId].cols) < navigationCompanies.length ? o + (CHART_LAYOUTS[layoutId].rows * CHART_LAYOUTS[layoutId].cols) : o)} className="p-1 opacity-40 hover:opacity-100"><ChevronRight size={14} /></button>
                        </div>
                    )}

                    {/* Style Switcher Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setIsStyleOpen(!isStyleOpen)}
                            className={`flex items-center gap-2 px-2.5 py-1 rounded transition-all border ${isStyleOpen ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]/30 text-[var(--accent-primary)]' : 'bg-white/5 border-white/5 text-white/30 hover:text-white hover:bg-white/10'}`}
                        >
                            <TrendingUp size={11} className={isStyleOpen ? 'text-[var(--accent-primary)]' : 'text-white/30'} />
                            <span className="text-[9px] font-black uppercase tracking-widest min-w-[50px] text-left">
                                {chartStyle === 'candles' ? 'Candles' :
                                    chartStyle === 'hollow' ? 'Hollow' :
                                        chartStyle === 'heikin' ? 'Heikin' :
                                            chartStyle === 'white' ? 'Classic' :
                                                chartStyle === 'bars' ? 'Bars' :
                                                    chartStyle === 'line' ? 'Line' : 'Area'}
                            </span>
                            <ChevronDown size={9} className={`transition-transform duration-300 opacity-30 ${isStyleOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isStyleOpen && (
                            <>
                                <div className="fixed inset-0 z-[100]" onClick={() => setIsStyleOpen(false)} />
                                <div className="absolute top-full left-0 mt-1 w-[160px] bg-[#080a0f]/98 backdrop-blur-xl border border-white/8 rounded-lg shadow-[0_16px_48px_rgba(0,0,0,0.9)] p-1 z-[101] animate-in fade-in slide-in-from-top-2 duration-200">
                                    {[
                                        { id: 'candles', label: 'CANDLES' },
                                        { id: 'hollow', label: 'HOLLOW' },
                                        { id: 'heikin', label: 'HEIKIN ASHI' },
                                        { id: 'white', label: 'CLASSIC B/W' },
                                        { id: 'bars', label: 'BARS' },
                                        { id: 'line', label: 'LINE' },
                                        { id: 'area', label: 'AREA' }
                                    ].map(s => (
                                        <button key={s.id} onClick={() => { setChartStyle(s.id); setIsStyleOpen(false); }}
                                            className={`w-full px-3 py-1.5 flex items-center justify-between rounded-[4px] transition-all text-[9px] font-black tracking-tight ${chartStyle === s.id ? 'bg-[var(--accent-primary)] text-black' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}
                                        >
                                            {s.label}
                                            {chartStyle === s.id && <div className="w-1 h-1 rounded-full bg-black/40" />}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Layout Picker Button */}
                    <div className="relative">
                        <button
                            onClick={() => setIsLayoutOpen(!isLayoutOpen)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded transition-all border ${isLayoutOpen ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]/30 text-[var(--accent-primary)]' : 'bg-white/5 border-white/5 text-white/40 hover:text-white hover:bg-white/10'}`}
                        >
                            <LayoutGrid size={12} />
                            <span className="text-[10px] font-black uppercase tracking-widest">Grid</span>
                        </button>

                        {isLayoutOpen && (
                            <>
                                <div className="fixed inset-0 z-[100]" onClick={() => setIsLayoutOpen(false)} />
                                <div className="absolute top-full right-0 mt-2 z-[101] w-[280px] bg-[#0b0e14]/98 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,1)] p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="grid grid-cols-4 gap-2 mb-4">
                                        {Object.entries(CHART_LAYOUTS).map(([id, cfg]) => (
                                            <button
                                                key={id}
                                                onClick={() => { setLayoutId(id); setIsLayoutOpen(false); }}
                                                className={`aspect-square rounded border flex flex-col items-center justify-center transition-all ${layoutId === id ? 'bg-[var(--accent-primary)]/20 border-[var(--accent-primary)]/40' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20'}`}
                                            >
                                                <div className="w-8 h-8 grid gap-0.5 overflow-hidden rounded-[2px] border border-white/10 p-0.5" style={{
                                                    gridTemplateRows: `repeat(${cfg.rows}, 1fr)`,
                                                    gridTemplateColumns: `repeat(${cfg.cols}, 1fr)`,
                                                    ...(cfg.custom ? { gridTemplateAreas: cfg.custom.split('"')[1] } : {})
                                                }}>
                                                    {cfg.areas.map((area, i) => (
                                                        <div key={i} className="bg-white/20 rounded-[1px]" style={{ gridArea: area.charAt(area.length - 1) }} />
                                                    ))}
                                                </div>
                                                <span className="text-[9px] font-black text-white/30 uppercase mt-1">{id}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="h-[1px] bg-white/5 my-3" />
                                    <div className="space-y-1.5">
                                        {[
                                            { key: 'cluster', label: 'Sync Cluster', icon: <Hash size={12} /> },
                                            { key: 'symbol', label: 'Sync Symbol', icon: <Link2 size={12} /> },
                                            { key: 'interval', label: 'Sync Interval', icon: <Clock size={12} /> },
                                            { key: 'crosshair', label: 'Sync Crosshair', icon: <Crosshair size={12} /> },
                                        ].map(opt => (
                                            <button
                                                key={opt.key}
                                                onClick={() => setSyncOptions(prev => ({ ...prev, [opt.key]: !prev[opt.key] }))}
                                                className={`w-full flex items-center justify-between p-2 rounded transition-all ${syncOptions[opt.key] ? 'bg-white/5 text-[var(--accent-primary)] shadow-sm shadow-[var(--accent-primary)]/5' : 'text-white/30 hover:text-white'}`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    {React.cloneElement(opt.icon, { size: 12, className: syncOptions[opt.key] ? 'text-[var(--accent-primary)]' : 'opacity-30' })}
                                                    <span className="text-[10px] font-black uppercase tracking-widest">{opt.label}</span>
                                                </div>
                                                <div className={`w-6 h-3 rounded-full relative transition-all ${syncOptions[opt.key] ? 'bg-[var(--accent-primary)]' : 'bg-white/10'}`}>
                                                    <div className={`absolute top-0.5 w-2 h-2 rounded-full bg-black transition-all ${syncOptions[opt.key] ? 'right-0.5' : 'left-0.5'}`} />
                                                </div>
                                            </button>
                                        ))}
                                        <div className="h-[1px] bg-white/5 my-1" />
                                        <p className="text-[9px] text-white/20 uppercase tracking-widest px-1 pb-1">Arrow Key Behaviour</p>
                                        {[
                                            { key: 'slotNav', label: 'Slot Navigation', desc: 'Arrows change active slot only' },
                                            { key: 'pageNav', label: 'Page Navigation', desc: 'Arrows flip entire batch page' },
                                        ].map(opt => (
                                            <button
                                                key={opt.key}
                                                onClick={() => setSyncOptions(prev => ({ ...prev, slotNav: opt.key === 'slotNav' ? !prev.slotNav : prev.slotNav, pageNav: opt.key === 'pageNav' ? !prev.pageNav : prev.pageNav }))}
                                                className={`w-full flex items-center justify-between p-2 rounded transition-all ${syncOptions[opt.key] ? 'bg-white/5 text-[var(--accent-primary)]' : 'text-white/30 hover:text-white'}`}
                                            >
                                                <div className="flex flex-col items-start gap-0">
                                                    <span className="text-[10px] font-black uppercase tracking-widest">{opt.label}</span>
                                                    <span className="text-[10px] opacity-60">{opt.desc}</span>
                                                </div>
                                                <div className={`w-6 h-3 rounded-full relative transition-all ${syncOptions[opt.key] ? 'bg-[var(--accent-primary)]' : 'bg-white/10'}`}>
                                                    <div className={`absolute top-0.5 w-2 h-2 rounded-full bg-black transition-all ${syncOptions[opt.key] ? 'right-0.5' : 'left-0.5'}`} />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-all text-white/30 hover:text-white"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Main Chart Area */}
            <div className="flex-1 overflow-hidden relative p-1.5 flex flex-col">
                <div
                    className="flex-1 grid gap-1.5 h-full w-full"
                    style={{
                        gridTemplateRows: `repeat(${CHART_LAYOUTS[layoutId].rows}, 1fr)`,
                        gridTemplateColumns: `repeat(${CHART_LAYOUTS[layoutId].cols}, 1fr)`,
                        ...(layoutId === '3sl' ? { gridTemplateAreas: '"a b" "a c"' } :
                            layoutId === '3sr' ? { gridTemplateAreas: '"a b" "c b"' } :
                                layoutId === '3st' ? { gridTemplateAreas: '"a a" "b c"' } :
                                    layoutId === '3sb' ? { gridTemplateAreas: '"a b" "c c"' } : {})
                    }}
                >
                    {Array.from({ length: 16 }).slice(0, chartsCount).map((_, idx) => {
                        const chart = chartStates[idx] || chartStates[0];
                        if (layoutId !== '1' && syncOptions.cluster && !chart?.symbol) return null;
                        const isActive = activeChartIndex === idx;
                        const isMulti = layoutId !== '1';

                        return (
                            <div
                                key={idx}
                                onClick={() => setActiveChartIndex(idx)}
                                className={`relative bg-black/20 rounded-lg overflow-hidden border transition-all duration-300 flex flex-col ${isActive ? 'border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]/20 shadow-[0_0_30px_rgba(0,133,255,0.15)] z-10' : 'border-white/[0.04] hover:border-white/10'}`}
                                style={{
                                    ...(layoutId === '3sl' ? { gridArea: idx === 0 ? 'a' : idx === 1 ? 'b' : 'c' } :
                                        layoutId === '3sr' ? { gridArea: idx === 1 ? 'b' : idx === 0 ? 'a' : 'c' } :
                                            layoutId === '3st' ? { gridArea: idx === 0 ? 'a' : idx === 1 ? 'b' : 'c' } :
                                                layoutId === '3sb' ? { gridArea: idx === 2 ? 'c' : idx === 0 ? 'a' : 'b' } : {})
                                }}
                            >
                                {isMulti && (
                                    <div className="h-9 flex items-center gap-2.5 px-3 bg-white/[0.03] border-b border-white/[0.06] shrink-0">
                                        <div className="w-5 h-5 rounded bg-white/5 flex items-center justify-center border border-white/5 overflow-hidden">
                                            <img src={`https://images.dhan.co/symbol/${chart.symbol}.png`} alt="" className="w-full h-full object-contain brightness-110"
                                                onError={(e) => { e.target.style.display = 'none'; }} />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[13px] font-black text-[var(--accent-primary)] uppercase tracking-tight">{chart.symbol}</span>
                                            {isActive && <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]" />}
                                        </div>
                                        <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest truncate max-w-[100px]">{chart.name}</span>
                                        <div className="ml-auto flex gap-1.5">
                                            {['1D', '1W', '1M', '1Y'].map(tf => (
                                                <button key={tf}
                                                    onClick={(e) => { e.stopPropagation(); handleTimeframeChange(idx, tf); }}
                                                    className={`px-2 py-0.5 rounded-[2px] text-[10px] font-black transition-all ${chart.timeframe === tf ? 'bg-[var(--accent-primary)] text-black' : 'text-white/20 hover:text-white'}`}
                                                >{tf}</button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className="flex-1 min-h-0">
                                    <FinvizChart
                                        symbol={chart.symbol}
                                        name={chart.name}
                                        series={[]}
                                        forcedTimeframe={chart.timeframe}
                                        isProMode={true}
                                        chartStyle={chartStyle}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Footer */}
            <div className="h-8 border-t border-white/[0.04] bg-[#0b0e14]/30 px-4 flex items-center justify-center text-[9px] font-black tracking-[0.3em] text-white/20 uppercase">
                <div className="flex items-center gap-5">
                    <div className="flex items-center gap-2">
                        <kbd className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-[3px] text-white/40 font-sans">ESC</kbd> CLOSE
                    </div>
                    <div className="w-[1px] h-3 bg-white/10" />
                    <div className="flex items-center gap-2">
                        <kbd className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-[3px] text-white/40 font-sans">/</kbd> SEARCH
                    </div>
                    <div className="w-[1px] h-3 bg-white/10" />
                    <div className="flex items-center gap-2 opacity-60">
                        <kbd className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-[3px] text-white/40 font-sans">←→</kbd> NAVIGATE
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ProChartModal;

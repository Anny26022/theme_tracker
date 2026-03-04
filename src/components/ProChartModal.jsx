import React, { useEffect, useState, useMemo, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, ChevronLeft, ChevronRight, Hash, LayoutGrid, Link2, Clock, Crosshair, ChevronDown, Layers, TrendingUp, Activity, Save, FolderOpen, Star, Trash2, Edit3, Copy, Plus, Check, BookOpen } from 'lucide-react';
const MA_PERIODS = [5, 10, 21, 50, 100, 200];
const MA_COLORS = { 5: '#ff6b6b', 10: '#ffa94d', 21: '#ffd43b', 50: '#51cf66', 100: '#22b8cf', 200: '#9d27b0' };
import FinvizChart from './FinvizChart';
import { THEMATIC_MAP, MACRO_PILLARS } from '../data/thematicMap';
import { cleanSymbol, getCachedComparisonSeries, getCachedInterval } from '../services/priceService';
import { useLivePrice } from '../context/PriceContext';
import ProWatchlist from './ProWatchlist';
import { ListIcon } from 'lucide-react';

/* ─── Template Helpers ─── */
const TT_TEMPLATES_KEY = 'tt_pro_templates';
const TT_ACTIVE_TPL_KEY = 'tt_pro_active_template';
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const loadTemplates = () => {
    try { const v = localStorage.getItem(TT_TEMPLATES_KEY); return v ? JSON.parse(v) : []; } catch { return []; }
};

const SleekSwitch = ({ active, onClick, disabled }) => (
    <button
        onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(); }}
        disabled={disabled}
        className={`w-8 h-4.5 rounded-full relative transition-all duration-300 shadow-inner ${disabled ? 'bg-white/5 cursor-not-allowed' : (active ? 'bg-[var(--accent-primary)]' : 'bg-white/10')}`}
    >
        <div
            className={`absolute top-0.5 w-3.5 h-3.5 rounded-full shadow-lg transition-all duration-300 transform ${disabled ? 'translate-x-0.5 bg-white/10' : (active ? 'translate-x-[14px] bg-black' : 'translate-x-0.5 bg-white/30')}`}
        />
    </button>
);
const saveTemplates = (list) => { localStorage.setItem(TT_TEMPLATES_KEY, JSON.stringify(list)); };
const loadActiveId = () => localStorage.getItem(TT_ACTIVE_TPL_KEY) || null;
const saveActiveId = (id) => { if (id) localStorage.setItem(TT_ACTIVE_TPL_KEY, id); else localStorage.removeItem(TT_ACTIVE_TPL_KEY); };
const DEFAULT_TEMPLATE_ID = '__tt_default_template__';
const DEFAULT_SYNC_OPTIONS = { symbol: false, interval: true, crosshair: false, cluster: true, slotNav: true, pageNav: true };
const DEFAULT_MA_CONFIG = [{ type: 'SMA', period: 50 }, { type: 'SMA', period: 200 }];
const WATCHLISTS_STORAGE_KEY = 'tt_pro_watchlists';
const ACTIVE_WATCHLIST_STORAGE_KEY = 'tt_pro_active_watchlist';
const SYMBOL_COLORS_STORAGE_KEY = 'tt_pro_symbol_colors';
const WATCHLIST_FILTER_COLOR_KEY = 'tt_pro_watchlist_filter_color';
const WATCHLIST_NAV_MODE_KEY = 'tt_pro_watchlist_nav_mode';
const WATCHLISTS_CHANGE_EVENT = 'tt_pro_watchlists_changed';
const FLAG_VIEW_PREFIX = 'flag:';
const makeDefaultChartStates = (symbol, name, timeframe) =>
    Array.from({ length: 16 }, (_, i) => (
        i === 0
            ? { symbol, name, timeframe }
            : { symbol: '', name: 'Empty', timeframe }
    ));
const loadWatchlistNavigationCompanies = (allCompanies) => {
    const companyBySymbol = new Map((allCompanies || []).map((company) => [company.symbol, company]));
    const parse = (value, fallback) => {
        try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
    };
    const watchlists = parse(localStorage.getItem(WATCHLISTS_STORAGE_KEY), []);
    const activeListId = localStorage.getItem(ACTIVE_WATCHLIST_STORAGE_KEY);
    const filterColor = localStorage.getItem(WATCHLIST_FILTER_COLOR_KEY) || 'all';
    if (!watchlists.length) return [];

    const symbolColors = parse(localStorage.getItem(SYMBOL_COLORS_STORAGE_KEY), {});
    let symbols = [];
    if (activeListId?.startsWith(FLAG_VIEW_PREFIX)) {
        const activeFlag = activeListId.slice(FLAG_VIEW_PREFIX.length);
        symbols = Object.entries(symbolColors)
            .filter(([_, color]) => color === activeFlag)
            .map(([symbol]) => symbol);
    } else {
        const activeList = watchlists.find((list) => list.id === activeListId) || watchlists[0];
        let listSymbols = (activeList?.symbols || [])
            .filter((entry) => entry?.symbol && !entry?.isHeader)
            .map((entry) => entry.symbol);
        if (filterColor !== 'all') {
            listSymbols = listSymbols.filter((entrySymbol) => (symbolColors[entrySymbol] || 'none') === filterColor);
        }
        symbols = listSymbols;
    }

    const uniqueSymbols = [];
    const seen = new Set();
    symbols.forEach((symbol) => {
        if (!symbol || seen.has(symbol)) return;
        seen.add(symbol);
        uniqueSymbols.push(symbol);
    });
    return uniqueSymbols.map((symbol) => companyBySymbol.get(symbol) || { symbol, name: symbol });
};

const CHART_LAYOUTS = {
    '1': { r: 1, c: 1 },
    '2h': { r: 2, c: 1 },
    '2v': { r: 1, c: 2 },
    '3h': { r: 3, c: 1 },
    '3v': { r: 1, c: 3 },
    '3sl': { r: 2, c: 2, custom: '"a b" "a c"' },
    '3sr': { r: 2, c: 2, custom: '"a b" "c b"' },
    '3st': { r: 2, c: 2, custom: '"a a" "b c"' },
    '3sb': { r: 2, c: 2, custom: '"a b" "c c"' },
    '4g': { r: 2, c: 2 },
    '4h': { r: 4, c: 1 },
    '4v': { r: 1, c: 4 },
    '4sl': { r: 3, c: 2, custom: '"a b" "a c" "a d"' },
    '4sr': { r: 3, c: 2, custom: '"a b" "c b" "d b"' },
    '4st': { r: 2, c: 3, custom: '"a a a" "b c d"' },
    '4sb': { r: 2, c: 3, custom: '"a b c" "d d d"' },
    '5g': { r: 2, c: 3, custom: '"a b c" "d e c"' },
    '6g': { r: 2, c: 3 },
    '6h': { r: 3, c: 2 },
    '6v': { r: 1, c: 6 },
    '8g': { r: 2, c: 4 },
    '8h': { r: 4, c: 2 },
    '9g': { r: 3, c: 3 },
    '10g': { r: 2, c: 5 },
    '12g': { r: 3, c: 4 },
    '14g': { r: 2, c: 7 },
    '16g': { r: 4, c: 4 },
};
const EMPTY_SERIES = Object.freeze([]);

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
    const [isMaOpen, setIsMaOpen] = useState(false);
    const [isTemplateSelectOpen, setIsTemplateSelectOpen] = useState(false);
    const [isWatchlistOpen, setIsWatchlistOpen] = useState(() => localStorage.getItem('tt_pro_watchlist_open') !== 'false');
    const [isWatchlistNavMode, setIsWatchlistNavMode] = useState(() => localStorage.getItem(WATCHLIST_NAV_MODE_KEY) === 'true');

    const toggleWatchlist = () => {
        setIsWatchlistOpen(!isWatchlistOpen);
        localStorage.setItem('tt_pro_watchlist_open', !isWatchlistOpen);
    };
    const toggleWatchlistNavMode = () => {
        setIsWatchlistNavMode((prev) => {
            const next = !prev;
            localStorage.setItem(WATCHLIST_NAV_MODE_KEY, next ? 'true' : 'false');
            return next;
        });
        setIsClusterOpen(false);
    };

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
    const setLayoutId = useCallback((updater) => _setLayoutId((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        localStorage.setItem('tt_pro_layout', next);
        return next;
    }), []);

    const [clusterOffset, setClusterOffset] = useState(0);
    const [watchlistNavVersion, setWatchlistNavVersion] = useState(0);
    const chartsCount = useMemo(() => {
        const cfg = CHART_LAYOUTS[layoutId];
        if (cfg.custom) {
            // Unique chars in the grid-template-areas string
            return new Set(cfg.custom.replace(/["\s]/g, '').split('')).size;
        }
        return cfg.r * cfg.c;
    }, [layoutId]);

    useEffect(() => {
        const handleWatchlistChange = (event) => {
            const changeKind = event?.detail?.kind;
            if (changeKind === 'symbolColors') {
                const activeListId = localStorage.getItem(ACTIVE_WATCHLIST_STORAGE_KEY) || '';
                if (activeListId.startsWith(FLAG_VIEW_PREFIX)) {
                    setWatchlistNavVersion((prev) => prev + 1);
                    return;
                }
                const filterColor = localStorage.getItem(WATCHLIST_FILTER_COLOR_KEY) || 'all';
                if (filterColor === 'all') return;
                setWatchlistNavVersion((prev) => prev + 1);
                return;
            }
            setWatchlistNavVersion((prev) => prev + 1);
        };
        window.addEventListener(WATCHLISTS_CHANGE_EVENT, handleWatchlistChange);
        window.addEventListener('storage', handleWatchlistChange);
        return () => {
            window.removeEventListener(WATCHLISTS_CHANGE_EVENT, handleWatchlistChange);
            window.removeEventListener('storage', handleWatchlistChange);
        };
    }, []);

    const watchlistNavigationCompanies = useMemo(
        () => loadWatchlistNavigationCompanies(allCompanies),
        [allCompanies, watchlistNavVersion]
    );
    const clusterNavigationCompanies = useMemo(
        () => (navigationCompanies.length > 0 ? navigationCompanies : allCompanies),
        [navigationCompanies, allCompanies]
    );
    const activeNavigationCompanies = useMemo(
        () => (isWatchlistNavMode ? watchlistNavigationCompanies : clusterNavigationCompanies),
        [clusterNavigationCompanies, isWatchlistNavMode, watchlistNavigationCompanies]
    );

    // Keep current page aligned to selected symbol when source/theme changes.
    useEffect(() => {
        const idx = activeNavigationCompanies.findIndex((company) => cleanSymbol(company.symbol) === cleanSymbol(symbol));
        setClusterOffset(idx !== -1 ? Math.floor(idx / chartsCount) * chartsCount : 0);
    }, [activeNavigationCompanies, chartsCount, symbol, themeName]);

    const [syncOptions, _setSyncOptions] = useState(() => load('tt_pro_sync', DEFAULT_SYNC_OPTIONS));
    const setSyncOptions = useCallback((updater) => _setSyncOptions((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        localStorage.setItem('tt_pro_sync', JSON.stringify(next));
        return next;
    }), []);
    const isBatchSyncEnabled = layoutId !== '1' && (syncOptions.cluster || isWatchlistNavMode);
    const [chartStates, _setChartStates] = useState(() => load('tt_pro_charts', makeDefaultChartStates(symbol, name, initialTimeframe)));
    const setChartStates = useCallback((updater) => _setChartStates((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        localStorage.setItem('tt_pro_charts', JSON.stringify(next));
        return next;
    }), []);
    const [chartStyle, _setChartStyle] = useState(() => localStorage.getItem('tt_pro_style') || 'candles');
    const setChartStyle = useCallback((updater) => _setChartStyle((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        localStorage.setItem('tt_pro_style', next);
        window.dispatchEvent(new Event('tt_chart_settings'));
        return next;
    }), []);
    const [maConfig, _setMaConfig] = useState(() => load('tt_pro_ma', DEFAULT_MA_CONFIG));
    const setMaConfig = useCallback((updater) => _setMaConfig((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        localStorage.setItem('tt_pro_ma', JSON.stringify(next));
        window.dispatchEvent(new Event('tt_chart_settings'));
        return next;
    }), []);
    const [paintBars, _setPaintBars] = useState(() => localStorage.getItem('tt_pro_paint_bars') === 'true');
    const setPaintBars = useCallback((val) => {
        _setPaintBars(val);
        localStorage.setItem('tt_pro_paint_bars', val);
        window.dispatchEvent(new Event('tt_chart_settings'));
    }, []);

    const toggleMa = (type, period) => setMaConfig(prev => prev.find(m => m.type === type && m.period === period) ? prev.filter(m => !(m.type === type && m.period === period)) : [...prev, { type, period }].sort((a, b) => a.period - b.period));
    const hasMa = (type, period) => maConfig.some(m => m.type === type && m.period === period);
    const [activeChartIndex, setActiveChartIndex] = useState(0);
    const currentChart = chartStates[activeChartIndex] || chartStates[0];
    const activeChartIndexRef = useRef(activeChartIndex);
    const syncSymbolRef = useRef(syncOptions.symbol);
    const onSymbolChangeRef = useRef(onSymbolChange);
    activeChartIndexRef.current = activeChartIndex;
    syncSymbolRef.current = syncOptions.symbol;
    onSymbolChangeRef.current = onSymbolChange;

    /* ─── Template System State ─── */
    const [templates, _setTemplates] = useState(() => loadTemplates());
    const setTemplates = useCallback((updater) => _setTemplates((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        saveTemplates(next);
        return next;
    }), []);
    const [activeTemplateId, _setActiveTemplateId] = useState(() => loadActiveId());
    const setActiveTemplateId = useCallback((updater) => _setActiveTemplateId((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        saveActiveId(next);
        return next;
    }), []);
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const renameInputRef = useRef(null);
    const [saveFlash, setSaveFlash] = useState(null); // template id that was just saved

    const currentSnapshot = useCallback(() => ({
        layoutId,
        chartStyle,
        maConfig: [...maConfig],
        syncOptions: { ...syncOptions },
        chartStates: chartStates.map(c => ({ ...c })),
    }), [layoutId, chartStyle, maConfig, syncOptions, chartStates]);

    const applyTemplate = useCallback((tpl) => {
        if (tpl.data.layoutId) setLayoutId(tpl.data.layoutId);
        if (tpl.data.chartStyle) { _setChartStyle(tpl.data.chartStyle); localStorage.setItem('tt_pro_style', tpl.data.chartStyle); }
        if (tpl.data.maConfig) { _setMaConfig(tpl.data.maConfig); localStorage.setItem('tt_pro_ma', JSON.stringify(tpl.data.maConfig)); }
        if (tpl.data.syncOptions) { _setSyncOptions(tpl.data.syncOptions); localStorage.setItem('tt_pro_sync', JSON.stringify(tpl.data.syncOptions)); }
        if (tpl.data.chartStates) { _setChartStates(tpl.data.chartStates); localStorage.setItem('tt_pro_charts', JSON.stringify(tpl.data.chartStates)); }
        setActiveTemplateId(tpl.id);
        window.dispatchEvent(new Event('tt_chart_settings'));
    }, []);

    const handleSaveTemplate = useCallback((nameOverride) => {
        const snap = currentSnapshot();
        const primarySymbol = chartStates[0]?.symbol || symbol;
        const primaryTf = chartStates[0]?.timeframe || initialTimeframe;
        const newTpl = {
            id: genId(),
            name: nameOverride || 'Unnamed',
            starred: false,
            createdAt: Date.now(),
            lastUsed: Date.now(),
            meta: { symbol: primarySymbol, timeframe: primaryTf, layoutId, chartCount: chartsCount },
            data: snap,
        };
        setTemplates(prev => [newTpl, ...prev]);
        setActiveTemplateId(newTpl.id);
        setSaveFlash(newTpl.id);
        setTimeout(() => setSaveFlash(null), 1500);
    }, [currentSnapshot, chartStates, symbol, initialTimeframe, layoutId, chartsCount]);

    const handleUpdateTemplate = useCallback((id) => {
        const snap = currentSnapshot();
        const primarySymbol = chartStates[0]?.symbol || symbol;
        const primaryTf = chartStates[0]?.timeframe || initialTimeframe;
        setTemplates(prev => prev.map(t => t.id === id ? {
            ...t,
            lastUsed: Date.now(),
            meta: { symbol: primarySymbol, timeframe: primaryTf, layoutId, chartCount: chartsCount },
            data: snap,
        } : t));
        setSaveFlash(id);
        setTimeout(() => setSaveFlash(null), 1500);
    }, [currentSnapshot, chartStates, symbol, initialTimeframe, layoutId, chartsCount]);

    const handleDuplicateTemplate = useCallback((tpl) => {
        const dup = { ...tpl, id: genId(), name: tpl.name + ' Copy', starred: false, createdAt: Date.now(), lastUsed: Date.now(), data: { ...tpl.data } };
        setTemplates(prev => [dup, ...prev]);
    }, []);

    const handleDeleteTemplate = useCallback((id) => {
        if (id === DEFAULT_TEMPLATE_ID) return;
        setTemplates(prev => prev.filter(t => t.id !== id));
        if (activeTemplateId === id) setActiveTemplateId(null);
    }, [activeTemplateId]);

    const handleToggleStar = useCallback((id) => {
        setTemplates(prev => prev.map(t => t.id === id ? { ...t, starred: !t.starred } : t));
    }, []);

    const handleRenameTemplate = useCallback((id, newName) => {
        if (id === DEFAULT_TEMPLATE_ID) return;
        setTemplates(prev => prev.map(t => t.id === id ? { ...t, name: newName || t.name } : t));
        setRenamingId(null);
    }, []);

    const sortedTemplates = useMemo(() => {
        const starred = templates.filter(t => t.starred).sort((a, b) => b.lastUsed - a.lastUsed);
        const rest = templates.filter(t => !t.starred).sort((a, b) => b.lastUsed - a.lastUsed);
        return [...starred, ...rest];
    }, [templates]);
    const defaultTemplate = useMemo(() => ({
        id: DEFAULT_TEMPLATE_ID,
        name: 'Default',
        system: true,
        starred: true,
        createdAt: 0,
        lastUsed: Date.now(),
        meta: {
            symbol: symbol || chartStates[0]?.symbol || '—',
            timeframe: initialTimeframe || chartStates[0]?.timeframe || '1D',
            layoutId: '1',
            chartCount: 1
        },
        data: {
            layoutId: '1',
            chartStyle: 'candles',
            maConfig: DEFAULT_MA_CONFIG,
            syncOptions: DEFAULT_SYNC_OPTIONS,
            chartStates: makeDefaultChartStates(symbol, name, initialTimeframe),
        },
    }), [symbol, name, initialTimeframe, chartStates]);
    const templatesWithDefault = useMemo(() => {
        const userTemplates = sortedTemplates.filter((tpl) => tpl.id !== DEFAULT_TEMPLATE_ID);
        return [defaultTemplate, ...userTemplates];
    }, [sortedTemplates, defaultTemplate]);
    const activeTemplate = useMemo(
        () => templatesWithDefault.find((tpl) => tpl.id === activeTemplateId) || defaultTemplate,
        [templatesWithDefault, activeTemplateId, defaultTemplate]
    );
    useEffect(() => {
        if (!activeTemplateId || !templatesWithDefault.some((tpl) => tpl.id === activeTemplateId)) {
            setActiveTemplateId(DEFAULT_TEMPLATE_ID);
        }
    }, [activeTemplateId, templatesWithDefault, setActiveTemplateId]);
    const searchInputRef = useRef(null);

    const activeSymbol = useMemo(() => cleanSymbol(currentChart.symbol), [currentChart.symbol]);
    const liveData = useLivePrice(activeSymbol);
    const TF_MAP = { '1D': '1D', '1W': '5D', '1M': '1M', '1Y': '1Y' };
    const perf = getCachedInterval(activeSymbol, TF_MAP[currentChart.timeframe] || '1D', { silent: true });
    let changePct = perf?.changePct ?? 0;
    let change = perf?.close ? perf.close - perf.close / (1 + changePct / 100) : 0;
    if (currentChart.timeframe === '1D' && liveData.changePct !== null) { change = liveData.change ?? 0; changePct = liveData.changePct; }

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

    // Batch sync for multi-chart pages from active navigation source.
    useEffect(() => {
        if (!isOpen || !isBatchSyncEnabled || !activeNavigationCompanies.length) return;
        setChartStates(prev => {
            let changed = false;
            const next = prev.map((slot, i) => {
                const stock = activeNavigationCompanies[clusterOffset + i];
                const nextSymbol = stock?.symbol || '';
                const nextName = stock?.name || 'Empty';
                if (slot.symbol === nextSymbol && slot.name === nextName) return slot;
                changed = true;
                return { ...slot, symbol: nextSymbol, name: nextName };
            });
            return changed ? next : prev;
        });
    }, [activeNavigationCompanies, clusterOffset, isBatchSyncEnabled, isOpen, setChartStates]);


    // Keyboard Hotkeys
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
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
        const navList = activeNavigationCompanies;
        if (!navList.length) return;

        // Page Nav: shift the whole batch by one page
        if (syncOptions.pageNav && layoutId !== '1' && isBatchSyncEnabled) {
            setClusterOffset(prev => {
                const next = prev + dir * chartsCount;
                return next >= 0 && next < navList.length ? next : prev;
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

    const handleChartChange = useCallback((index, newData) => {
        setChartStates(prev => {
            const next = [...prev];
            const updatedSymbol = typeof newData === 'string' ? newData : newData.symbol;
            const updatedName = typeof newData === 'string' ? prev[index].name : newData.name;

            if (syncSymbolRef.current) {
                // Update all charts
                return next.map(c => ({ ...c, symbol: updatedSymbol, name: updatedName }));
            } else {
                next[index] = { ...next[index], symbol: updatedSymbol, name: updatedName };
                return next;
            }
        });
        if (activeChartIndexRef.current === index) {
            onSymbolChangeRef.current?.(newData);
        }
    }, [setChartStates]);

    const handleTimeframeChange = useCallback((index, tf) => {
        setChartStates(prev => {
            const next = [...prev];
            if (syncOptions.interval) {
                return next.map(c => ({ ...c, timeframe: tf }));
            } else {
                next[index] = { ...next[index], timeframe: tf };
                return next;
            }
        });
    }, [setChartStates, syncOptions.interval]);

    const handleWatchlistSymbolSelect = useCallback((selected) => {
        handleChartChange(activeChartIndex, selected);
    }, [handleChartChange, activeChartIndex]);

    const companyNameBySymbol = useMemo(() => {
        const map = new Map();
        allCompanies.forEach((company) => {
            map.set(company.symbol, company.name);
        });
        return map;
    }, [allCompanies]);

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
                            <span className="text-[13px] font-black italic ml-2" style={{ color: changePct >= 0 ? '#00c805' : '#ff2e2e' }}>
                                {changePct >= 0 ? '+' : ''}{change.toFixed(2)} ({Math.abs(changePct).toFixed(2)}%)
                            </span>
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
                            onClick={() => { if (!isWatchlistNavMode) setIsClusterOpen(!isClusterOpen); }}
                            className={`group flex items-center gap-2.5 px-3 py-1.5 rounded-full transition-all duration-300 border ${isWatchlistNavMode
                                ? 'bg-white/[0.02] border-white/5 text-white/15 cursor-not-allowed opacity-50'
                                : (isClusterOpen ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]/40 text-[var(--accent-primary)] shadow-[0_0_20px_rgba(var(--accent-primary-rgb),0.15)]' : 'bg-white/5 border-white/5 text-white/35 hover:text-white hover:bg-white/10 hover:border-white/10')}`}
                        >
                            <Hash size={12} className={`${isWatchlistNavMode ? 'opacity-20' : (isClusterOpen ? 'text-[var(--accent-primary)]' : 'text-white/30')} transition-colors`} />
                            <span className="text-[10px] font-black uppercase tracking-[0.15em] truncate max-w-[140px]">
                                {isWatchlistNavMode ? 'WATCHLIST ACTIVE' : themeName}
                            </span>
                            <ChevronDown size={10} className={`transition-transform duration-500 opacity-20 group-hover:opacity-100 ${isClusterOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isClusterOpen && !isWatchlistNavMode && (
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
                    {isBatchSyncEnabled && (
                        <div className="flex bg-white/5 p-0.5 rounded border border-white/5 mr-2">
                            <button
                                onClick={() => setClusterOffset((offset) => Math.max(0, offset - chartsCount))}
                                className="p-1 opacity-40 hover:opacity-100"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <button
                                onClick={() => setClusterOffset((offset) => (
                                    offset + chartsCount < activeNavigationCompanies.length ? offset + chartsCount : offset
                                ))}
                                className="p-1 opacity-40 hover:opacity-100"
                            >
                                <ChevronRight size={14} />
                            </button>
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

                    {/* MA Picker */}
                    <div className="relative">
                        <button onClick={() => setIsMaOpen(!isMaOpen)} className={`flex items-center gap-2 px-2.5 py-1 rounded transition-all border ${isMaOpen ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]/30 text-[var(--accent-primary)]' : 'bg-white/5 border-white/5 text-white/30 hover:text-white hover:bg-white/10'}`}>
                            <Activity size={11} /><span className="text-[9px] font-black uppercase tracking-widest">MA</span>
                            {maConfig.length > 0 && <span className="text-[8px] font-black bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] px-1.5 rounded-full">{maConfig.length}</span>}
                            <ChevronDown size={9} className={`transition-transform duration-300 opacity-30 ${isMaOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isMaOpen && (<>
                            <div className="fixed inset-0 z-[100]" onClick={() => setIsMaOpen(false)} />
                            <div className="absolute top-full left-0 mt-1 w-[240px] bg-[#080a0f]/98 backdrop-blur-xl border border-white/8 rounded-lg shadow-[0_16px_48px_rgba(0,0,0,0.9)] p-2 z-[101] animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="px-2 pb-1.5 mb-1 border-b border-white/[0.06]"><span className="text-[8px] font-black text-white/25 uppercase tracking-[0.15em]">Moving Averages</span></div>
                                {MA_PERIODS.map(p => (
                                    <div key={p} className="flex items-center gap-1.5 px-1 py-0.5">
                                        <div className="w-2 h-2 rounded-full" style={{ background: MA_COLORS[p] }} />
                                        <span className="text-[10px] font-black text-white/50 w-7">{p}</span>
                                        {['SMA', 'EMA'].map(t => <button key={t} onClick={() => toggleMa(t, p)} className={`px-2 py-0.5 rounded-[3px] text-[9px] font-black transition-all border ml-auto ${hasMa(t, p) ? 'text-black border-transparent' : 'bg-white/[0.03] text-white/25 border-white/[0.06] hover:text-white/50'}`} style={hasMa(t, p) ? { background: MA_COLORS[p] } : {}}>{t}</button>)}
                                    </div>
                                ))}
                                <div className="px-2 pb-1.5 mb-1 border-b border-white/[0.06] mt-3 flex justify-between items-center">
                                    <span className="text-[8px] font-black text-white/25 uppercase tracking-[0.15em]">Signals</span>
                                </div>
                                <button
                                    onClick={() => setPaintBars(!paintBars)}
                                    className={`flex items-center justify-between w-full px-2 py-1.5 rounded transition-all ${paintBars ? 'text-[var(--accent-primary)] bg-[var(--accent-primary)]/5' : 'text-white/30 hover:text-white/50'}`}
                                >
                                    <span className="text-[10px] font-bold">Paint Price Bars</span>
                                    <div className={`w-6 h-3 rounded-full relative transition-colors ${paintBars ? 'bg-[var(--accent-primary)]' : 'bg-white/10'}`}>
                                        <div className={`absolute top-0.5 left-0.5 w-2 h-2 rounded-full bg-white transition-transform ${paintBars ? 'translate-x-3' : ''}`} />
                                    </div>
                                </button>

                                {maConfig.length > 0 && <button onClick={() => setMaConfig([])} className="w-full text-center text-[8px] font-black text-white/20 uppercase tracking-widest hover:text-white/40 py-1 mt-1 border-t border-white/[0.06]">Clear All</button>}
                            </div>
                        </>)}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Template Switcher Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setIsTemplateSelectOpen(!isTemplateSelectOpen)}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded transition-all border ${isTemplateSelectOpen ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]/30 text-[var(--accent-primary)]' : 'bg-white/5 border-white/5 text-white/40 hover:text-white hover:bg-white/10'}`}
                        >
                            <BookOpen size={12} className={activeTemplateId ? 'text-[var(--accent-primary)]' : ''} />
                            <span className="text-[10px] font-black uppercase tracking-widest max-w-[100px] truncate">
                                {activeTemplate?.name || 'Templates'}
                            </span>
                            <ChevronDown size={9} className={`transition-transform duration-300 opacity-30 ${isTemplateSelectOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isTemplateSelectOpen && (
                            <>
                                <div className="fixed inset-0 z-[100]" onClick={() => setIsTemplateSelectOpen(false)} />
                                <div className="absolute top-full right-0 mt-2 z-[101] w-[260px] bg-[#0b0e14]/98 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_24px_64px_rgba(0,0,0,1)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="px-3 py-2 border-b border-white/[0.05] flex items-center justify-between bg-white/[0.02]">
                                        <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Templates</span>
                                        <button
                                            onClick={() => {
                                                const name = `Layout ${templates.length + 1}`;
                                                handleSaveTemplate(name);
                                            }}
                                            className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/20 transition-all group"
                                        >
                                            <Plus size={10} className="group-hover:rotate-90 transition-transform duration-300" />
                                            <span className="text-[8px] font-black uppercase tracking-widest">Add New</span>
                                        </button>
                                    </div>
                                    <div className="max-h-[360px] overflow-y-auto no-scrollbar py-1">
                                        {templatesWithDefault.map(tpl => {
                                            const isActive = tpl.id === activeTemplateId;
                                            const isRenaming = renamingId === tpl.id;
                                            const isSystem = !!tpl.system;

                                            return (
                                                <div key={tpl.id} className="relative group/tpl px-1">
                                                    <div className={`w-full text-left px-2 py-2 rounded-lg transition-all flex items-center justify-between group-hover/tpl:bg-white/[0.03] ${isActive ? 'bg-[var(--accent-primary)]/[0.03]' : ''}`}>
                                                        <div
                                                            className="flex-1 min-w-0 cursor-pointer"
                                                            onClick={() => { if (!isRenaming) { applyTemplate(tpl); setIsTemplateSelectOpen(false); } }}
                                                        >
                                                            {isRenaming ? (
                                                                <input
                                                                    ref={renameInputRef}
                                                                    autoFocus
                                                                    value={renameValue}
                                                                    onChange={(e) => setRenameValue(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') handleRenameTemplate(tpl.id, renameValue);
                                                                        if (e.key === 'Escape') setRenamingId(null);
                                                                    }}
                                                                    onBlur={() => handleRenameTemplate(tpl.id, renameValue)}
                                                                    className="w-full bg-white/[0.05] border-b border-[var(--accent-primary)]/50 outline-none text-[11px] font-black text-white px-1 pb-0.5 rounded-sm"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            ) : (
                                                                <div className="flex flex-col gap-0.5">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className={`text-[11px] font-black truncate ${isActive ? 'text-[var(--accent-primary)]' : 'text-white/70'}`}>{tpl.name}</span>
                                                                        {isSystem && <span className="text-[7px] font-black uppercase tracking-[0.14em] text-white/35">built-in</span>}
                                                                        {isActive && <div className="w-1 h-1 rounded-full bg-[var(--accent-primary)] shadow-[0_0_8px_var(--accent-primary)]" />}
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 opacity-30 text-[8px] font-bold uppercase tracking-tighter">
                                                                        <span>{tpl.meta?.symbol || '—'}</span>
                                                                        <span>·</span>
                                                                        <span>{tpl.meta?.timeframe || '—'}</span>
                                                                        <span>·</span>
                                                                        <span>{tpl.data?.layoutId || '1'} Slots</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Mini Actions */}
                                                        {!isRenaming && !isSystem && (
                                                            <div className="flex items-center gap-0.5 opacity-0 group-hover/tpl:opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setRenamingId(tpl.id); setRenameValue(tpl.name); setTimeout(() => renameInputRef.current?.focus(), 50); }}
                                                                    className="p-1 px-1.5 rounded hover:bg-white/10 text-white/20 hover:text-white/60 transition-colors"
                                                                >
                                                                    <Edit3 size={10} />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tpl.id); }}
                                                                    className="p-1 px-1.5 rounded hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors"
                                                                >
                                                                    <Trash2 size={10} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="px-3 py-2 border-t border-white/[0.05] bg-white/[0.01]">
                                        <p className="text-[7.5px] font-black text-white/15 uppercase tracking-[0.1em] text-center">
                                            {templates.length > 0 ? 'Templates save all isolated views & sync settings' : 'Default template is built-in. Save to create custom templates.'}
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

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
                                <div className="absolute top-full right-0 mt-2 z-[101] w-[320px] bg-[#0b0e14]/98 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,1)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="flex flex-col max-h-[500px]">
                                        <div className="flex-1 overflow-y-auto no-scrollbar p-3 pt-4">
                                            <div className="space-y-4">
                                                {[1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 14, 16].map(count => {
                                                    const group = Object.entries(CHART_LAYOUTS).filter(([_, cfg]) => {
                                                        const slotCount = cfg.custom ? new Set(cfg.custom.replace(/["\s]/g, '').split('')).size : cfg.r * cfg.c;
                                                        return slotCount === count;
                                                    });
                                                    if (!group.length) return null;

                                                    return (
                                                        <div key={count} className="space-y-2">
                                                            <div className="flex items-center gap-2 px-1">
                                                                <span className="text-[9px] font-black text-white/30 tracking-widest">{count}</span>
                                                                <div className="h-[1px] flex-1 bg-white/[0.03]" />
                                                            </div>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {group.map(([id, cfg]) => {
                                                                    const iconCount = cfg.custom ? new Set(cfg.custom.replace(/["\s]/g, '').split('')).size : cfg.r * cfg.c;
                                                                    return (
                                                                        <button
                                                                            key={id}
                                                                            onClick={() => { setLayoutId(id); setIsLayoutOpen(false); }}
                                                                            className={`w-10 h-10 rounded border flex flex-col items-center justify-center transition-all ${layoutId === id ? 'bg-[var(--accent-primary)]/20 border-[var(--accent-primary)]/40' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20'}`}
                                                                        >
                                                                            <div className="w-5 h-5 grid gap-0.5 overflow-hidden rounded-[1px] border border-white/10 p-0.5" style={{
                                                                                gridTemplateRows: `repeat(${cfg.r}, 1fr)`,
                                                                                gridTemplateColumns: `repeat(${cfg.c}, 1fr)`,
                                                                                ...(cfg.custom ? { gridTemplateAreas: cfg.custom } : {})
                                                                            }}>
                                                                                {Array.from({ length: iconCount }).map((_, i) => (
                                                                                    <div key={i} className="bg-white/20 rounded-[0.5px]" style={{ gridArea: "abcdefghijklmnop"[i] }} />
                                                                                ))}
                                                                            </div>
                                                                            <span className="text-[7px] font-black text-white/20 uppercase mt-0.5">{id}</span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="border-t border-white/10 bg-[#0b0e14] p-3 space-y-1.5 shrink-0">
                                            {[
                                                { key: 'cluster', label: 'Sync Cluster', icon: <Hash size={12} /> },
                                                { key: 'symbol', label: 'Sync Symbol', icon: <Link2 size={12} /> },
                                                { key: 'interval', label: 'Sync Interval', icon: <Clock size={12} /> },
                                                { key: 'crosshair', label: 'Sync Crosshair', icon: <Crosshair size={12} /> },
                                            ].map(opt => (
                                                (() => {
                                                    const isDisabled = opt.key === 'cluster' && isWatchlistNavMode;
                                                    return (
                                                        <div
                                                            key={opt.key}
                                                            className={`w-full flex items-center justify-between p-2 rounded transition-all ${isDisabled
                                                                ? 'text-white/15 opacity-50'
                                                                : (syncOptions[opt.key] ? 'bg-white/[0.03] text-[var(--accent-primary)]' : 'text-white/30 hover:text-white hover:bg-white/[0.01]')}`}
                                                        >
                                                            <div className="flex items-center gap-2.5">
                                                                {React.cloneElement(opt.icon, { size: 12, className: isDisabled ? 'opacity-15' : (syncOptions[opt.key] ? 'text-[var(--accent-primary)]' : 'opacity-30') })}
                                                                <span className="text-[10px] font-black uppercase tracking-widest">{opt.label}</span>
                                                            </div>
                                                            <SleekSwitch
                                                                active={syncOptions[opt.key]}
                                                                onClick={() => setSyncOptions(prev => ({ ...prev, [opt.key]: !prev[opt.key] }))}
                                                                disabled={isDisabled}
                                                            />
                                                        </div>
                                                    );
                                                })()
                                            ))}
                                            <div className="h-[1px] bg-white/5 my-1" />
                                            <p className="text-[9px] text-white/20 uppercase tracking-widest px-1 pb-1">Arrow Key Behaviour</p>
                                            {[
                                                { key: 'slotNav', label: 'Slot Navigation', desc: 'Arrows change active slot only' },
                                                { key: 'pageNav', label: 'Page Navigation', desc: 'Arrows flip entire batch page' },
                                            ].map(opt => (
                                                <button
                                                    key={opt.key}
                                                    onClick={() => setSyncOptions(prev => ({ ...prev, slotNav: opt.key === 'slotNav', pageNav: opt.key === 'pageNav' }))}
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
                                </div>
                            </>
                        )}
                    </div>

                    {/* Navigation & Sidebar Control Unit */}
                    <div className="flex items-center gap-1.5 p-1 bg-black/40 backdrop-blur-xl border border-white/5 rounded-full shadow-2xl mx-1 select-none">
                        {/* Nav Source Toggle: Cluster vs Watchlist */}
                        <div className="relative flex items-center bg-white/5 p-0.5 rounded-full">
                            {/* Sliding highlight */}
                            <div
                                className="absolute h-6 w-[34px] bg-[var(--accent-primary)] rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-[0_0_15px_rgba(var(--accent-primary-rgb),0.3)]"
                                style={{ transform: `translateX(${isWatchlistNavMode ? '34px' : '0px'})` }}
                            />

                            <button
                                onClick={() => isWatchlistNavMode && toggleWatchlistNavMode()}
                                className={`relative z-10 w-[34px] h-6 flex items-center justify-center rounded-full transition-colors duration-200 ${!isWatchlistNavMode ? 'text-black' : 'text-white/20 hover:text-white/40'}`}
                                title="Cluster Navigation"
                            >
                                <Hash size={12} className={!isWatchlistNavMode ? 'stroke-[2.5]' : ''} />
                            </button>

                            <button
                                onClick={() => !isWatchlistNavMode && toggleWatchlistNavMode()}
                                className={`relative z-10 w-[34px] h-6 flex items-center justify-center rounded-full transition-colors duration-200 ${isWatchlistNavMode ? 'text-black' : 'text-white/20 hover:text-white/40'}`}
                                title="Watchlist Navigation"
                            >
                                <span className={`text-[9px] font-black ${isWatchlistNavMode ? '' : 'opacity-40'}`}>WL</span>
                            </button>
                        </div>

                        {/* Sidebar Visibility Toggle */}
                        <button
                            onClick={toggleWatchlist}
                            className={`group relative w-7 h-7 flex items-center justify-center rounded-full transition-all duration-300 ${isWatchlistOpen ? 'text-black bg-[var(--accent-primary)] shadow-[0_0_20px_rgba(var(--accent-primary-rgb),0.4)]' : 'text-white/20 hover:text-white hover:bg-white/10'}`}
                        >
                            <ListIcon size={14} className={`${isWatchlistOpen ? 'stroke-[2.5]' : 'group-hover:scale-110 transition-transform'}`} />
                            {!isWatchlistOpen && isWatchlistNavMode && (
                                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[var(--accent-primary)] rounded-full border-2 border-[#080a0f] animate-pulse" />
                            )}
                        </button>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-all text-white/30 hover:text-white"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            < div className="flex-1 overflow-hidden flex" >
                {/* Main Chart Area */}
                < div className="flex-1 overflow-hidden relative p-1.5 flex flex-col" >
                    <div
                        className="flex-1 grid gap-1.5 h-full w-full"
                        style={{
                            gridTemplateRows: `repeat(${CHART_LAYOUTS[layoutId].r}, 1fr)`,
                            gridTemplateColumns: `repeat(${CHART_LAYOUTS[layoutId].c}, 1fr)`,
                            ...(CHART_LAYOUTS[layoutId].custom ? { gridTemplateAreas: CHART_LAYOUTS[layoutId].custom } : {})
                        }}
                    >
                        {Array.from({ length: 16 }).slice(0, chartsCount).map((_, idx) => {
                            const chart = chartStates[idx] || chartStates[0];
                            if (isBatchSyncEnabled && !chart?.symbol) return null;
                            const isActive = activeChartIndex === idx;
                            const isMulti = layoutId !== '1';

                            return (
                                <div
                                    key={idx}
                                    onClick={() => setActiveChartIndex(idx)}
                                    className={`relative bg-black/20 rounded-lg overflow-hidden border transition-all duration-300 flex flex-col ${isActive ? 'border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]/20 shadow-[0_0_30px_rgba(0,133,255,0.15)] z-10' : 'border-white/[0.04] hover:border-white/10'}`}
                                    style={{
                                        ...(CHART_LAYOUTS[layoutId].custom ? { gridArea: "abcdefghijklmnop"[idx] } : {})
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
                                            <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest truncate max-w-[100px]">
                                                {(chart.name && chart.name !== 'Empty')
                                                    ? chart.name
                                                    : companyNameBySymbol.get(chart.symbol) || ''
                                                }
                                            </span>
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
                                            series={EMPTY_SERIES}
                                            forcedTimeframe={chart.timeframe}
                                            isProMode={true}
                                            chartStyle={chartStyle}
                                            maConfig={maConfig}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div >

                {/* Sidebar Views */}
                {
                    isWatchlistOpen && (
                        <ProWatchlist
                            allCompanies={allCompanies}
                            onSymbolSelect={handleWatchlistSymbolSelect}
                        />
                    )
                }
            </div >

            {/* Footer */}
            < div className="h-8 border-t border-white/[0.04] bg-[#0b0e14]/30 px-4 flex items-center justify-center text-[9px] font-black tracking-[0.3em] text-white/20 uppercase" >
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
            </div >
        </div >,
        document.body
    );
};

export default memo(ProChartModal);

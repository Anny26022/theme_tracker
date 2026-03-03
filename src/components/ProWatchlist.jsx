import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { Plus, Trash2, ChevronDown, MoreHorizontal, LayoutPanelLeft, Flag, Check } from 'lucide-react';
import { cleanSymbol, getCachedInterval, getCachedPrice } from '../services/priceService';
import { useLiveVersion } from '../context/MarketDataContext';

const FLAG_COLORS = [
    { id: 'red', hex: '#ff5252' },
    { id: 'blue', hex: '#2196f3' },
    { id: 'green', hex: '#4caf50' },
    { id: 'purple', hex: '#9c27b0' },
    { id: 'orange', hex: '#ff9800' },
    { id: 'cyan', hex: '#00bcd4' },
    { id: 'pink', hex: '#e91e63' },
    { id: 'none', hex: 'transparent' }
];

const ProWatchlist = ({ allCompanies, onSymbolSelect }) => {
    const [watchlists, setWatchlists] = useState(() => {
        const saved = localStorage.getItem('tt_pro_watchlists');
        return saved ? JSON.parse(saved) : [{ id: 'default', name: 'WATCHLIST', symbols: [] }];
    });
    const [activeListId, setActiveListId] = useState(() => {
        return localStorage.getItem('tt_pro_active_watchlist') || 'default';
    });
    const [isListSelectorOpen, setIsListSelectorOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [width, setWidth] = useState(() => parseInt(localStorage.getItem('tt_pro_wl_width')) || 300);
    const [config, setConfig] = useState(() => {
        const saved = localStorage.getItem('tt_pro_wl_config');
        return saved ? JSON.parse(saved) : { showLast: true, showChange: true, compact: false };
    });
    const [filterColor, setFilterColor] = useState('all');
    const addInputRef = useRef(null);
    const isResizing = useRef(false);
    const containerRef = useRef(null);

    // Sync filter state during render - cleaner alternative to useEffect
    if (filterColor !== 'all' && !activeList.symbols.some(s => s.color === filterColor)) {
        setFilterColor('all');
    }

    useEffect(() => {
        localStorage.setItem('tt_pro_wl_config', JSON.stringify(config));
    }, [config]);

    useEffect(() => {
        const onMove = (e) => {
            if (!isResizing.current) return;
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth > 200 && newWidth < 600 && containerRef.current) {
                containerRef.current.style.width = `${newWidth}px`;
            }
        };
        const onUp = () => {
            if (!isResizing.current) return;
            isResizing.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            if (containerRef.current) {
                const finalWidth = parseInt(containerRef.current.style.width);
                if (finalWidth) {
                    setWidth(finalWidth);
                    localStorage.setItem('tt_pro_wl_width', finalWidth);
                }
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, []);

    const handleResizeStart = (e) => {
        e.preventDefault();
        isResizing.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    useEffect(() => {
        localStorage.setItem('tt_pro_watchlists', JSON.stringify(watchlists));
    }, [watchlists]);

    useEffect(() => {
        localStorage.setItem('tt_pro_active_watchlist', activeListId);
    }, [activeListId]);

    const activeList = useMemo(() =>
        watchlists.find(l => l.id === activeListId) || watchlists[0],
        [watchlists, activeListId]);

    const handleCreateList = () => {
        const name = prompt('Enter Watchlist Name:');
        if (name) {
            const newList = { id: Date.now().toString(), name: name.toUpperCase(), symbols: [] };
            setWatchlists([...watchlists, newList]);
            setActiveListId(newList.id);
        }
    };

    const handleDeleteList = () => {
        if (watchlists.length <= 1) return;
        if (confirm(`Delete ${activeList.name}?`)) {
            const next = watchlists.filter(l => l.id !== activeListId);
            setWatchlists(next);
            setActiveListId(next[0].id);
        }
    };

    const handleAddSymbol = (symbolObj) => {
        if (!symbolObj) return;
        setWatchlists(prev => prev.map(l => {
            if (l.id === activeListId) {
                if (l.symbols.some(s => s.symbol === symbolObj.symbol)) return l;
                return { ...l, symbols: [{ ...symbolObj, color: 'none' }, ...l.symbols] };
            }
            return l;
        }));
        setIsAdding(false);
        setSearchQuery('');
    };

    const handleBulkAdd = (text) => {
        const lines = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        const newItems = [];

        lines.forEach(line => {
            if (line.startsWith('###')) {
                // Section Header
                const headerText = line.replace(/^#+/, '').trim();
                newItems.push({ id: `header-${Date.now()}-${Math.random()}`, header: headerText, isHeader: true });
            } else {
                // Potential Symbol
                const symbol = line.split(':').pop().toUpperCase();
                const found = allCompanies.find(c => c.symbol.toUpperCase() === symbol);
                if (found) {
                    newItems.push({ ...found, color: 'none' });
                }
            }
        });

        if (newItems.length > 0) {
            setWatchlists(prev => prev.map(l => {
                if (l.id === activeListId) {
                    // Filter out duplicate symbols but keep all headers
                    const filteredNew = newItems.filter(item =>
                        item.isHeader || !l.symbols.some(s => s.symbol === item.symbol)
                    );
                    return { ...l, symbols: [...filteredNew, ...l.symbols] };
                }
                return l;
            }));
            setIsAdding(false);
            setSearchQuery('');
        }
    };

    const handleRemoveSymbol = useCallback((symbol) => {
        setWatchlists(prev => prev.map(l => {
            if (l.id === activeListId) {
                return { ...l, symbols: l.symbols.filter(s => s.symbol !== symbol) };
            }
            return l;
        }));
    }, [activeListId]);

    const handleSetColor = useCallback((symbol, color) => {
        setWatchlists(prev => prev.map(l => {
            if (l.id === activeListId) {
                return { ...l, symbols: l.symbols.map(s => s.symbol === symbol ? { ...s, color } : s) };
            }
            return l;
        }));
    }, [activeListId]);

    const filteredSearch = useMemo(() => {
        if (!searchQuery) return [];
        const low = searchQuery.toLowerCase();

        // Prioritize symbol matches, especially ones starting with the query
        return allCompanies.filter(c =>
            c.symbol.toLowerCase().includes(low) ||
            c.name.toLowerCase().includes(low)
        ).sort((a, b) => {
            const aSym = a.symbol.toLowerCase();
            const bSym = b.symbol.toLowerCase();
            const aStarts = aSym.startsWith(low);
            const bStarts = bSym.startsWith(low);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return aSym.localeCompare(bSym);
        }).slice(0, 8);
    }, [searchQuery, allCompanies]);

    return (
        <div
            ref={containerRef}
            className="relative flex flex-col h-full bg-[#0b0e14]/40 border-l border-white/5 animate-in slide-in-from-right duration-300 group/sidebar shrink-0"
            style={{ width: `${width}px` }}
        >
            {/* Resize Handle */}
            <div
                onMouseDown={handleResizeStart}
                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/10 transition-colors z-[120]"
            />
            {/* Watchlist Header */}
            <div className="h-10 px-3 flex items-center justify-between border-b border-white/5 shrink-0">
                <div className="relative flex-1">
                    <button
                        onClick={() => setIsListSelectorOpen(!isListSelectorOpen)}
                        className="flex items-center gap-2 hover:text-white transition-colors group"
                    >
                        <LayoutPanelLeft size={12} className="text-white/40 opacity-80" />
                        <span className="text-[11px] font-black tracking-widest uppercase truncate max-w-[120px]">{activeList.name}</span>
                        <ChevronDown size={10} className={`opacity-30 group-hover:opacity-100 transition-transform ${isListSelectorOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isListSelectorOpen && (
                        <>
                            <div className="fixed inset-0 z-[110]" onClick={() => setIsListSelectorOpen(false)} />
                            <div className="absolute top-full left-0 mt-1 w-[200px] bg-[#0b0e14] border border-white/10 rounded-lg shadow-2xl z-[111] p-1 overflow-hidden">
                                {watchlists.map(l => (
                                    <button
                                        key={l.id}
                                        onClick={() => { setActiveListId(l.id); setIsListSelectorOpen(false); }}
                                        className={`w-full text-left px-3 py-2 rounded-[4px] text-[10px] font-black tracking-widest uppercase flex items-center justify-between ${l.id === activeListId ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}
                                    >
                                        {l.name}
                                        {l.id === activeListId && <Check size={10} />}
                                    </button>
                                ))}
                                <div className="h-[1px] bg-white/5 my-1" />
                                <button
                                    onClick={() => { handleCreateList(); setIsListSelectorOpen(false); }}
                                    className="w-full text-left px-3 py-2 text-[9px] font-black text-white/40 hover:text-white hover:bg-white/5 rounded transition-all uppercase tracking-widest"
                                >
                                    + Create New List
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    <button onClick={() => setIsAdding(true)} className="p-1.5 rounded hover:bg-white/10 text-white/30 hover:text-white transition-all">
                        <Plus size={14} />
                    </button>
                    <button className="p-1.5 rounded hover:bg-white/10 text-white/30 hover:text-white transition-all">
                        <LayoutPanelLeft size={14} />
                    </button>
                    <div className="relative">
                        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-1.5 rounded hover:bg-white/10 text-white/30 hover:text-white transition-all">
                            <MoreHorizontal size={14} />
                        </button>
                        {isMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-[110]" onClick={() => setIsMenuOpen(false)} />
                                <div className="absolute top-full right-0 mt-1 w-[200px] bg-[#0b0e14] border border-white/10 rounded-lg shadow-2xl z-[111] p-1">
                                    <div className="px-2 py-1.5 border-b border-white/5 mb-1">
                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Display Options</span>
                                    </div>
                                    <button
                                        onClick={() => setConfig(prev => ({ ...prev, showLast: !prev.showLast }))}
                                        className="w-full text-left px-2.5 py-1.5 text-[9px] font-black text-white/50 hover:text-white hover:bg-white/5 rounded flex items-center justify-between uppercase tracking-widest"
                                    >
                                        Last Price {config.showLast && <Check size={10} className="text-white/80" />}
                                    </button>
                                    <button
                                        onClick={() => setConfig(prev => ({ ...prev, showChange: !prev.showChange }))}
                                        className="w-full text-left px-2.5 py-1.5 text-[9px] font-black text-white/50 hover:text-white hover:bg-white/5 rounded flex items-center justify-between uppercase tracking-widest"
                                    >
                                        Change % {config.showChange && <Check size={10} className="text-white/80" />}
                                    </button>
                                    <button
                                        onClick={() => setConfig(prev => ({ ...prev, compact: !prev.compact }))}
                                        className="w-full text-left px-2.5 py-1.5 text-[9px] font-black text-white/50 hover:text-white hover:bg-white/5 rounded flex items-center justify-between uppercase tracking-widest"
                                    >
                                        Compact Mode {config.compact && <Check size={10} className="text-white/80" />}
                                    </button>
                                    <div className="h-[1px] bg-white/5 my-1" />
                                    <button
                                        onClick={() => { handleDeleteList(); setIsMenuOpen(false); }}
                                        className="w-full text-left px-2.5 py-1.5 text-[9px] font-black text-red-500/60 hover:text-red-500 hover:bg-red-500/5 rounded flex items-center gap-2 uppercase tracking-widest"
                                    >
                                        <Trash2 size={10} /> Delete List
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
            {/* Flag Filters Row */}
            {activeList.symbols.some(s => s.color !== 'none') && (
                <div className="px-3 py-1.5 flex items-center gap-1.5 border-b border-white/5 bg-white/[0.02]">
                    {FLAG_COLORS.filter(f => f.id !== 'none' && activeList.symbols.some(s => s.color === f.id)).map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFilterColor(filterColor === f.id ? 'all' : f.id)}
                            className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all ${filterColor === f.id ? 'border-white/40 bg-white/10 ring-1 ring-white/20' : 'border-white/5 hover:border-white/20 hover:bg-white/5'}`}
                        >
                            <div
                                className="w-[10px] h-[14px]"
                                style={{
                                    backgroundColor: f.hex,
                                    clipPath: 'polygon(0 0, 100% 0, 70% 50%, 100% 100%, 0 100%)'
                                }}
                            />
                        </button>
                    ))}
                </div>
            )}

            {/* Symbols Area */}
            <div className="flex-1 overflow-y-auto no-scrollbar py-1">
                {isAdding && (
                    <div className="px-2 mb-2">
                        <div className="relative">
                            <input
                                ref={addInputRef}
                                autoFocus
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                                placeholder="ADD SYMBOL..."
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') setIsAdding(false);
                                    if (e.key === 'Enter') {
                                        if (searchQuery.includes(',') || searchQuery.includes(' ') || searchQuery.includes(':')) {
                                            handleBulkAdd(searchQuery);
                                        } else if (filteredSearch.length > 0) {
                                            handleAddSymbol(filteredSearch[0]);
                                        }
                                    }
                                }}
                                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[10px] font-black text-white focus:outline-none focus:border-white/40 transition-all"
                            />
                            {searchQuery && filteredSearch.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-[#0b0e14] border border-white/10 rounded shadow-2xl z-[120] overflow-hidden">
                                    {filteredSearch.map(s => (
                                        <button
                                            key={s.symbol}
                                            onClick={() => handleAddSymbol(s)}
                                            className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center gap-3 border-b border-white/[0.02] last:border-0"
                                        >
                                            <div className="w-5 h-5 rounded bg-white/5 flex items-center justify-center border border-white/5 overflow-hidden shrink-0">
                                                <img src={`https://images.dhan.co/symbol/${s.symbol}.png`} alt="" className="w-full h-full object-contain brightness-110"
                                                    onError={(e) => { e.target.style.display = 'none'; }} />
                                            </div>
                                            <div className="flex flex-col leading-tight min-w-0">
                                                <span className="text-[10px] font-black text-white">{s.symbol}</span>
                                                {/^\d+$/.test(s.symbol) && (
                                                    <span className="text-[8px] font-bold text-white/20 truncate">{s.name}</span>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex flex-col">
                    <div className="px-3 flex items-center text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">
                        <span className="flex-1">Symbol</span>
                        {config.showLast && <span className="w-16 text-right">Last</span>}
                        {config.showChange && <span className="w-16 text-right">Chg%</span>}
                    </div>

                    {activeList.symbols.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 opacity-20 select-none">
                            <Plus size={24} className="mb-2" />
                            <span className="text-[9px] font-black tracking-[0.2em]">EMPTY LIST</span>
                        </div>
                    ) : (
                        activeList.symbols
                            .filter(s => {
                                if (filterColor === 'all') return true;
                                if (s.isHeader) return false; // Hide headers when color filtering (TV style)
                                return s.color === filterColor;
                            })
                            .map((s, idx) => {
                                if (s.isHeader) {
                                    return (
                                        <div key={s.id || idx} className="sticky top-0 z-[5] group relative px-3 py-1.5 flex items-center justify-between border-b border-white/5 bg-[#0b0e14] mt-2 first:mt-0">
                                            <span className="text-[9px] font-black text-white/40 tracking-[0.2em] uppercase">{s.header}</span>
                                            <button
                                                onClick={() => {
                                                    setWatchlists(prev => prev.map(l => {
                                                        if (l.id === activeListId) {
                                                            return { ...l, symbols: l.symbols.filter((_, i) => i !== activeList.symbols.indexOf(s)) };
                                                        }
                                                        return l;
                                                    }));
                                                }}
                                                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"
                                            >
                                                <Trash2 size={10} />
                                            </button>
                                        </div>
                                    );
                                }
                                return (
                                    <WatchlistItem
                                        key={s.symbol}
                                        s={s}
                                        config={config}
                                        onSymbolSelect={onSymbolSelect}
                                        onRemoveSymbol={handleRemoveSymbol}
                                        onSetSymbolColor={handleSetColor}
                                    />
                                );
                            })
                    )}
                </div>
            </div>
        </div>
    );
};

const WatchlistItem = memo(({ s, config, onSymbolSelect, onRemoveSymbol, onSetSymbolColor }) => {
    const cleaned = cleanSymbol(s.symbol);
    useLiveVersion(); // subscribe to global tick for price refresh
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Read directly from cache — no per-item subscription overhead
    const live = getCachedPrice(cleaned);
    const perf = getCachedInterval(cleaned, '1D', { silent: true });
    const price = live?.price || perf?.close || 0;
    const changePct = live?.changePct ?? perf?.changePct ?? 0;

    const handleSelect = useCallback(() => onSymbolSelect(s), [s, onSymbolSelect]);
    const handleRemove = useCallback((e) => { e.stopPropagation(); onRemoveSymbol(s.symbol); }, [s.symbol, onRemoveSymbol]);
    const handleColor = useCallback((colorId, e) => { e.stopPropagation(); onSetSymbolColor(s.symbol, colorId); setIsMenuOpen(false); }, [s.symbol, onSetSymbolColor]);

    return (
        <div className={`group relative flex items-center pl-6 pr-3 hover:bg-white/[0.03] transition-colors cursor-pointer border-l-2 border-transparent hover:border-white/10 ${config.compact ? 'h-8' : 'h-10'}`}
            onClick={handleSelect}
        >
            {s.color !== 'none' && (
                <div
                    className="absolute left-[4px] top-1/2 -translate-y-1/2 w-[10px] h-[14px] z-10"
                    style={{
                        backgroundColor: FLAG_COLORS.find(f => f.id === s.color)?.hex,
                        clipPath: 'polygon(0 0, 100% 0, 70% 50%, 100% 100%, 0 100%)'
                    }}
                />
            )}

            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className={`${config.compact ? 'w-4 h-4' : 'w-5 h-5'} rounded bg-white/5 flex items-center justify-center border border-white/5 overflow-hidden shrink-0`}>
                    <img src={`https://images.dhan.co/symbol/${s.symbol}.png`} alt="" className="w-full h-full object-contain brightness-110"
                        onError={(e) => { e.target.style.display = 'none'; }} />
                </div>

                <div className="flex flex-col min-w-0 pr-2">
                    <span className="text-[11px] font-black text-white uppercase tracking-tight">{s.symbol}</span>
                    {/^\d+$/.test(s.symbol) && (
                        <span className="text-[8px] font-bold text-white/30 truncate uppercase tracking-tight leading-none">{s.name}</span>
                    )}
                </div>
            </div>

            {config.showLast && (
                <div className="w-16 text-right flex flex-col justify-center">
                    <span className={`${config.compact ? 'text-[9px]' : 'text-[10px]'} font-mono font-bold whitespace-nowrap`}>{price.toFixed(2)}</span>
                </div>
            )}

            {config.showChange && (
                <div className="w-16 text-right flex flex-col justify-center">
                    <span className={`${config.compact ? 'text-[9px]' : 'text-[10px]'} font-mono font-bold whitespace-nowrap ${changePct >= 0 ? 'text-[#00c805]' : 'text-[#ff2e2e]'}`}>
                        {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                    </span>
                </div>
            )}

            {/* Quick Actions (Hover) */}
            <div className="absolute inset-0 bg-[#0b0e14] opacity-0 group-hover:opacity-100 transition-all flex items-center justify-end pr-2 pointer-events-none group-hover:pointer-events-auto">
                <div className="flex items-center gap-1.5 p-1 bg-white/[0.03] rounded-full border border-white/5 shadow-2xl">
                    <div className="flex items-center gap-1 px-1.5 border-r border-white/5 mr-0.5">
                        {FLAG_COLORS.map(f => (
                            <button
                                key={f.id}
                                onClick={(e) => handleColor(f.id, e)}
                                className={`w-6 h-6 rounded-full hover:bg-white/10 transition-all flex items-center justify-center ${f.id === s.color ? 'ring-1 ring-white/50 bg-white/5' : ''}`}
                                title={f.id.toUpperCase()}
                            >
                                {f.id === 'none' ? (
                                    <X size={8} />
                                ) : (
                                    <div
                                        className="w-[8px] h-[11px]"
                                        style={{
                                            backgroundColor: f.hex,
                                            clipPath: 'polygon(0 0, 100% 0, 70% 50%, 100% 100%, 0 100%)'
                                        }}
                                    />
                                )}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={handleRemove}
                        className="p-1.5 hover:bg-red-500/20 text-white/30 hover:text-red-500 rounded-full transition-all"
                        title="REMOVE FROM LIST"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>
        </div>
    );
});

const X = ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);

export default ProWatchlist;

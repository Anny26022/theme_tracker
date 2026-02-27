import React, { useState, useMemo, useEffect } from 'react';
import { ViewWrapper } from '../components/ViewWrapper';
import { formatTVWatchlist } from '../lib/watchlistUtils';
import { Search, Plus, Play, Info, ListTree, ChevronRight, Check, Copy, LayoutGrid } from 'lucide-react';
import { cn } from '../lib/utils';
import { m, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { WatchlistSyncCard } from '../components/WatchlistSyncCard';
import { WatchlistCopyButton } from '../components/WatchlistCopyButton';
import { useWatchlistSync } from '../hooks/useWatchlistSync';

const TABS = {
    TRADINGVIEW: 'TradingView',
    DISTRIBUTION: 'Distribution',
    MAPPING: 'Mapping'
};

const CompanyLogo = ({ symbol, name }) => {
    const [imgError, setImgError] = useState(false);
    return (
        <div className="w-8 h-8 flex items-center justify-center bg-[var(--ui-muted)]/10 rounded overflow-hidden">
            {!imgError ? (
                <img
                    src={`https://images.dhan.co/symbol/${symbol}.png`}
                    alt=""
                    className="w-full h-full object-contain p-1"
                    onError={() => setImgError(true)}
                />
            ) : (
                <span className="text-[10px] font-black text-[var(--text-muted)]">
                    {symbol?.substring(0, 2)}
                </span>
            )}
        </div>
    );
};

export const MapperView = ({ hierarchy, rawData, loading }) => {
    const { customLists, tvSessionId, fetchCustomLists } = useWatchlistSync();
    const [input, setInput] = useState(() => localStorage.getItem('preferred_mapper_input') || '');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState(TABS.TRADINGVIEW);
    const [processedData, setProcessedData] = useState(null);
    const [copied, setCopied] = useState(false);
    const [showSessGuide, setShowSessGuide] = useState(false);
    const [selectedWatchlistId, setSelectedWatchlistId] = useState(() => localStorage.getItem('preferred_mapper_watchlist') || '');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [dropdownSearch, setDropdownSearch] = useState('');

    // Create a mapping index for fast lookups
    const symbolMap = useMemo(() => {
        const map = new Map();
        rawData.forEach(item => {
            if (item.symbol) map.set(item.symbol.toUpperCase(), item);
            if (item.name) map.set(item.name.toUpperCase(), item);
        });
        return map;
    }, [rawData]);

    const handleProcess = (overrideInput) => {
        const sourceData = overrideInput ?? input;
        if (!sourceData.trim()) return;

        const tokens = sourceData
            .split(/[,\n\+\/\(\)\*]/)
            .map(t => {
                let token = t.trim().toUpperCase();
                token = token.replace(/^(NSE|BSE|MCX):/, '');
                return token.trim();
            })
            .filter(token => {
                if (!token) return false;
                if (/^\d+(\.\d+)?$/.test(token)) return false;
                if (token.startsWith('NIFTY') || token.startsWith('CNX') || token.startsWith('MCX')) return false;
                if (token.length < 2) return false;
                return true;
            });
        const mapped = [];
        const unmapped = [];

        tokens.forEach(token => {
            let match = symbolMap.get(token);
            if (match) {
                mapped.push(match);
            } else {
                const fuzzyMatch = rawData.find(item =>
                    (item.symbol || '').toUpperCase().includes(token) ||
                    (item.name || '').toUpperCase().includes(token)
                );
                if (fuzzyMatch) {
                    mapped.push(fuzzyMatch);
                } else {
                    unmapped.push(token);
                }
            }
        });

        const groups = {};
        mapped.forEach(item => {
            const ind = item.industry || 'Uncategorized';
            if (!groups[ind]) groups[ind] = [];
            if (!groups[ind].find(c => c.symbol === item.symbol)) {
                groups[ind].push(item);
            }
        });

        const watchlistData = Object.entries(groups).map(([label, companies]) => ({
            label,
            companies
        })).sort((a, b) => b.companies.length - a.companies.length);

        setProcessedData({
            tokens,
            mappedCount: mapped.length,
            unmapped,
            groups,
            watchlistData,
            tvFormat: formatTVWatchlist(watchlistData)
        });
    };

    const handleWatchlistSelect = (list) => {
        setSelectedWatchlistId(String(list.id));
        localStorage.setItem('preferred_mapper_watchlist', String(list.id));
        setIsDropdownOpen(false);
        setDropdownSearch('');

        if (list.symbols) {
            const symbolsText = list.symbols.join(', ');
            setInput(symbolsText);
            localStorage.setItem('preferred_mapper_input', symbolsText);
        }
    };

    // Initial process on mount if input exists
    useEffect(() => {
        if (input) {
            handleProcess();
        }
    }, [rawData]); // Re-run if rawData arrives but input was already there

    // Auto-process when input changes via manual selection
    useEffect(() => {
        if (input) {
            localStorage.setItem('preferred_mapper_input', input);
            handleProcess();
        } else {
            localStorage.removeItem('preferred_mapper_input');
            setProcessedData(null);
        }
    }, [input]);

    const currentListName = useMemo(() => {
        const list = customLists.find(l => String(l.id) === String(selectedWatchlistId));
        return list ? `${list.name} (${list.count})` : '-- SELECT WATCHLIST --';
    }, [customLists, selectedWatchlistId]);

    const filteredLists = useMemo(() => {
        // UI-Level Deduplication: Group by name and keep the best version (usually newest/most symbols)
        const uniqueMap = new Map();
        customLists.forEach(list => {
            const existing = uniqueMap.get(list.name);
            if (!existing || list.count > existing.count || (list.count === existing.count && String(list.id) > String(existing.id))) {
                uniqueMap.set(list.name, list);
            }
        });

        const uniqueLists = Array.from(uniqueMap.values());

        if (!dropdownSearch.trim()) return uniqueLists.sort((a, b) => a.name.localeCompare(b.name));
        const q = dropdownSearch.toLowerCase();
        return uniqueLists
            .filter(l => l.name.toLowerCase().includes(q))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [customLists, dropdownSearch]);

    const handleAddSearch = () => {
        if (!searchQuery.trim()) return;
        setInput(prev => {
            const separator = prev.trim() ? (prev.includes('\n') ? '\n' : ',') : '';
            return prev.trim() + separator + searchQuery.trim();
        });
        setSearchQuery('');
    };

    const suggestions = useMemo(() => {
        if (!searchQuery.trim() || searchQuery.length < 2) return [];
        const query = searchQuery.toUpperCase();
        return rawData
            .filter(item =>
                (item.symbol || '').toUpperCase().includes(query) ||
                (item.name || '').toUpperCase().includes(query)
            )
            .slice(0, 8);
    }, [searchQuery, rawData]);

    const handleSelectSuggestion = (suggestion) => {
        const symbol = suggestion.symbol;
        setInput(prev => {
            const separator = prev.trim() ? (prev.includes('\n') ? '\n' : ',') : '';
            return prev.trim() + separator + symbol;
        });
        setSearchQuery('');
    };

    const handleCopy = () => {
        if (processedData?.tvFormat) {
            navigator.clipboard.writeText(processedData.tvFormat);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <ViewWrapper id="mapper">
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-[var(--ui-divider)] pb-6 relative">
                    <div className="space-y-1">
                        <h2 className="text-lg font-light tracking-[0.6em] uppercase opacity-90 text-[var(--text-main)] transition-colors">
                            Industry Mapper
                        </h2>
                        <p className="text-[8px] font-bold leading-relaxed tracking-[0.3em] text-[var(--accent-primary)] uppercase opacity-60">
                            Translate symbols into industry-aware lists
                        </p>
                    </div>

                    {/* Custom Sleek Dropdown */}
                    <div className="relative min-w-[280px]">
                        <label className="text-[7px] font-black uppercase tracking-[0.4em] text-[var(--text-muted)] flex items-center gap-2 mb-2 ml-1">
                            <LayoutGrid size={8} className="text-[var(--accent-primary)] opacity-60" />
                            Active Watchlist
                        </label>

                        <div className="relative group/dd">
                            <button
                                onClick={() => tvSessionId && setIsDropdownOpen(!isDropdownOpen)}
                                disabled={!tvSessionId}
                                className={clsx(
                                    "w-full flex items-center justify-between gap-4 px-4 py-2.5 rounded-lg border transition-all text-[9.5px] font-black tracking-widest uppercase",
                                    !tvSessionId ? "opacity-20 grayscale cursor-not-allowed bg-transparent border-[var(--ui-divider)]" :
                                        "bg-[var(--ui-muted)]/5 border-[var(--ui-divider)] hover:border-[var(--accent-primary)]/40 hover:bg-[var(--ui-muted)]/10 text-[var(--text-main)]/80"
                                )}
                            >
                                <span className="truncate">{currentListName}</span>
                                <ChevronRight size={14} className={clsx("text-[var(--accent-primary)] transition-transform duration-300", isDropdownOpen ? "rotate-90" : "opacity-40")} />
                            </button>

                            <AnimatePresence>
                                {isDropdownOpen && (
                                    <m.div
                                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.98 }}
                                        onAnimationComplete={() => {
                                            if (!isDropdownOpen) setDropdownSearch('');
                                        }}
                                        className="absolute top-full left-0 right-0 mt-3 glass-card bg-[var(--bg-main)] border-[var(--ui-divider)] rounded-xl overflow-hidden z-[500] shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
                                    >
                                        <div className="p-2 border-b border-[var(--ui-divider)] bg-[var(--ui-muted)]/5 flex items-center gap-2">
                                            <div className="relative group flex-1">
                                                <Search size={10} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--accent-primary)] opacity-40 group-focus-within:opacity-100 transition-opacity" />
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    placeholder="Search lists..."
                                                    value={dropdownSearch}
                                                    onChange={(e) => setDropdownSearch(e.target.value)}
                                                    className="w-full bg-transparent border-none focus:outline-none pl-8 pr-4 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-main)] placeholder:text-[var(--text-muted)]/30"
                                                />
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); fetchCustomLists(); }}
                                                className="p-1.5 hover:bg-white/5 rounded text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-all"
                                                title="Refresh Watchlists"
                                            >
                                                <RotateCw size={10} />
                                            </button>
                                        </div>
                                        <div className="max-h-[260px] overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
                                            {filteredLists.length > 0 ? filteredLists.map(list => (
                                                <button
                                                    key={list.id}
                                                    onClick={() => handleWatchlistSelect(list)}
                                                    className={clsx(
                                                        "w-full text-left px-4 py-3 rounded-lg flex items-center justify-between group transition-all",
                                                        String(list.id) === String(selectedWatchlistId) ? "bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20" : "hover:bg-white/5 border border-transparent"
                                                    )}
                                                >
                                                    <span className={clsx(
                                                        "text-[9px] font-bold tracking-widest uppercase transition-colors",
                                                        String(list.id) === String(selectedWatchlistId) ? "text-[var(--accent-primary)]" : "text-[var(--text-main)]/60 group-hover:text-[var(--text-main)]"
                                                    )}>
                                                        {list.name}
                                                    </span>
                                                    <span className="text-[7px] font-black px-2 py-0.5 bg-[var(--ui-muted)]/20 rounded-full text-[var(--text-muted)] opacity-40 group-hover:opacity-100 transition-opacity">
                                                        {list.count}
                                                    </span>
                                                </button>
                                            )) : (
                                                <div className="py-8 text-center text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest opacity-40">
                                                    No lists found
                                                </div>
                                            )}
                                        </div>
                                    </m.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {!tvSessionId && (
                            <span className="absolute -bottom-4 left-1 text-[6px] font-black text-amber-500/80 uppercase tracking-widest animate-pulse">
                                Requires Active Session
                            </span>
                        )}
                    </div>
                </div>

                {/* Input Section */}
                <div className="glass-card p-6 space-y-6 bg-[var(--glass-bg)] border-[var(--glass-border)] transition-colors hover:border-[var(--accent-primary)]/10">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold">
                        <span className="flex items-center gap-2 font-black text-[var(--text-main)] opacity-60">
                            <Info size={12} className="text-[var(--accent-primary)]" />
                            Input Tokens
                        </span>
                        <span className="text-[8px] font-medium text-[var(--accent-primary)] opacity-40">
                            {input.split(/[,\n]/).filter(t => t.trim()).length} detected
                        </span>
                    </div>

                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <div className="relative flex-1 group z-[110]">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--accent-primary)] transition-colors opacity-40" size={12} />
                                <input
                                    type="text"
                                    placeholder="Quick append symbols..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddSearch()}
                                    className="w-full bg-[var(--bg-main)]/5 border border-[var(--ui-divider)] rounded-lg py-2.5 pl-10 pr-4 text-[9px] font-bold uppercase tracking-[0.2em] focus:outline-none focus:border-[var(--accent-primary)] transition-all text-[var(--text-main)] placeholder:text-[var(--text-muted)]/30"
                                />

                                <AnimatePresence>
                                    {suggestions.length > 0 && (
                                        <m.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="absolute top-full left-0 right-0 mt-2 glass-card bg-[var(--bg-main)] border-[var(--ui-divider)] rounded-xl overflow-hidden z-[500] shadow-[0_30px_60px_rgba(0,0,0,0.5)]"
                                        >
                                            <div className="p-1 space-y-0.5 max-h-[280px] overflow-y-auto custom-scrollbar">
                                                {suggestions.map((s, idx) => (
                                                    <button
                                                        key={`${s.symbol}-${idx}`}
                                                        type="button"
                                                        onClick={() => handleSelectSuggestion(s)}
                                                        className="w-full text-left px-4 py-3 hover:bg-[var(--accent-primary)]/10 flex items-center justify-between group transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <CompanyLogo symbol={s.symbol} name={s.name} />
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-[9px] font-black tracking-widest text-[var(--text-main)] transition-colors group-hover:text-[var(--accent-primary)]">{s.name}</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[7px] font-black px-1.5 py-0.5 bg-[var(--ui-muted)]/20 rounded text-[var(--accent-primary)]">{s.symbol}</span>
                                                                    <span className="text-[7px] font-bold text-[var(--text-muted)] uppercase tracking-tight opacity-40">{s.industry}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <Plus size={10} className="text-[var(--accent-primary)] opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    </button>
                                                ))}
                                            </div>
                                        </m.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        <textarea
                            className="w-full h-32 bg-[var(--bg-main)]/5 border border-[var(--ui-divider)] rounded p-4 text-[9.5px] font-mono tracking-widest leading-relaxed focus:outline-none focus:border-[var(--accent-primary)]/40 transition-all resize-none placeholder:text-[var(--text-muted)]/20 text-[var(--text-main)]/70 scrollbar-none"
                            placeholder="RELIANCE, TCS, HDFCBANK..."
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value);
                                if (processedData) setProcessedData(null);
                                if (selectedWatchlistId) setSelectedWatchlistId('');
                            }}
                        />

                        <div className="flex items-center justify-end">
                            <button
                                onClick={() => handleProcess()}
                                disabled={!input.trim() || loading}
                                className="flex items-center gap-2 px-8 py-2 glass-card text-[8px] font-black uppercase tracking-[0.3em] hover:border-[var(--accent-primary)] transition-all disabled:opacity-30 disabled:cursor-not-allowed group/btn text-[var(--text-main)]/80 border-[var(--ui-divider)] rounded-full"
                            >
                                Process Selection
                                <ChevronRight size={10} className="group-hover/btn:translate-x-1 transition-transform text-[var(--accent-primary)]" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Results Section */}
                <AnimatePresence mode="wait">
                    {processedData && (
                        <m.div
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            className="space-y-6"
                        >
                            <div className="flex border-b border-[var(--ui-divider)] bg-[var(--ui-muted)]/5 rounded-t overflow-hidden">
                                {Object.values(TABS).map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={cn(
                                            "flex-1 py-2 text-[8px] font-bold uppercase tracking-[0.2em] transition-all relative",
                                            activeTab === tab ? "text-[var(--accent-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                                        )}
                                    >
                                        {tab}
                                        {activeTab === tab && (
                                            <m.div
                                                layoutId="activeTabUnderline"
                                                className="absolute bottom-0 left-0 right-0 h-[1px] bg-[var(--accent-primary)] shadow-[0_0_10px_var(--accent-primary)]"
                                            />
                                        )}
                                    </button>
                                ))}
                            </div>

                            <div className="glass-card min-h-[300px] overflow-hidden border-[var(--glass-border)] rounded-xl">
                                <AnimatePresence mode="wait">
                                    {activeTab === TABS.TRADINGVIEW && (
                                        <m.div
                                            key="tv"
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 10 }}
                                            className="p-6 flex flex-col gap-6"
                                        >
                                            <WatchlistSyncCard
                                                sectors={Object.keys(processedData.groups || {})}
                                                hierarchy={Object.keys(processedData.groups || {}).reduce((acc, key) => {
                                                    acc[key] = { [key]: processedData.groups[key] };
                                                    return acc;
                                                }, {})}
                                                allIndustries={processedData.watchlistData.map(g => ({ name: g.label, sector: g.label }))}
                                                defaultExpanded={true}
                                            />

                                            <div className="flex flex-col gap-2 relative">
                                                <div className="flex items-center justify-between px-2">
                                                    <span className="text-[8px] font-black uppercase text-[var(--accent-primary)] tracking-widest opacity-60">Serialized Output</span>
                                                    <WatchlistCopyButton
                                                        onCopy={handleCopy}
                                                        className="hover:bg-[var(--accent-primary)]/10 px-2 py-1 rounded"
                                                    />
                                                </div>
                                                <div className="bg-[var(--bg-main)]/40 rounded-xl p-6 font-mono text-[9.5px] leading-relaxed break-all border border-[var(--ui-divider)] text-[var(--text-main)]/40 selection:bg-[var(--accent-primary)]/20 min-h-[120px] max-h-48 overflow-y-auto custom-scrollbar">
                                                    {processedData.tvFormat || "No tokens mapped."}
                                                </div>
                                            </div>
                                        </m.div>
                                    )}

                                    {activeTab === TABS.DISTRIBUTION && (
                                        <m.div
                                            key="dist"
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 10 }}
                                            className="p-8 grid grid-cols-1 md:grid-cols-2 gap-4"
                                        >
                                            {processedData.watchlistData.map((group, idx) => (
                                                <div key={idx} className="glass-card p-4 border-[var(--ui-divider)] flex items-center justify-between group hover:border-[var(--accent-primary)]/30 transition-all bg-[var(--ui-muted)]/5 rounded-xl">
                                                    <div className="space-y-1">
                                                        <span className="text-[7px] font-black text-[var(--accent-primary)] uppercase tracking-widest opacity-40">Industry</span>
                                                        <h4 className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-main)]/70 truncate max-w-[140px]">{group.label}</h4>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-xl font-light text-[var(--text-main)]/60">{group.companies.length}</span>
                                                        <div className="text-[7px] font-bold uppercase tracking-widest opacity-20 text-[var(--text-main)]">Units</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </m.div>
                                    )}

                                    {activeTab === TABS.MAPPING && (
                                        <m.div
                                            key="mapping"
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 10 }}
                                            className="divide-y divide-[var(--ui-divider)]"
                                        >
                                            {processedData.watchlistData.map((group, gIdx) => (
                                                <div key={gIdx} className="p-6 space-y-4">
                                                    <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--accent-primary)] flex items-center gap-2 opacity-80">
                                                        <ListTree size={10} />
                                                        {group.label}
                                                    </h4>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                                        {group.companies.map((company, cIdx) => (
                                                            <div key={cIdx} className="p-3 bg-[var(--ui-muted)]/5 rounded-xl border border-[var(--ui-divider)]/50 flex items-center gap-3 hover:border-[var(--accent-primary)]/20 transition-colors">
                                                                <CompanyLogo symbol={company.symbol} name={company.name} />
                                                                <div className="min-w-0">
                                                                    <div className="text-[9px] font-black uppercase tracking-wider truncate text-[var(--text-main)]/70">{company.name}</div>
                                                                    <div className="text-[8px] font-bold text-[var(--accent-primary)]/40">{company.symbol}</div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </m.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {processedData.unmapped.length > 0 && (
                                <div className="p-6 glass-card border-rose-500/10 bg-rose-500/[0.03] space-y-3 rounded-xl hover:border-rose-500/30 transition-all">
                                    <div className="flex items-center gap-2 text-rose-500 text-[8px] font-black uppercase tracking-[0.3em] opacity-60">
                                        <Info size={10} />
                                        NA / UNMAPPED TOKENS ({processedData.unmapped.length})
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {processedData.unmapped.map((token, idx) => (
                                            <span key={idx} className="px-3 py-1 bg-rose-500/[0.05] border border-rose-500/10 rounded-full text-[8px] font-bold text-rose-400/60 uppercase tracking-widest">
                                                {token}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </m.div>
                    )}
                </AnimatePresence>
            </div>
            {/* Session ID Guide Modal */}
            <AnimatePresence>
                {showSessGuide && (
                    <m.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[1000] flex items-center justify-center p-8 bg-black/80 backdrop-blur-xl"
                        onClick={() => setShowSessGuide(false)}
                    >
                        <m.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-[var(--bg-main)] border border-[var(--ui-divider)] rounded-xl overflow-hidden max-w-2xl w-full shadow-2xl relative"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-6 border-b border-[var(--ui-divider)] flex items-center justify-between bg-[var(--ui-muted)]/10">
                                <div>
                                    <h2 className="text-sm font-bold uppercase tracking-[0.3em] text-[var(--text-main)]">TradingView Session Guide</h2>
                                    <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest mt-1">Follow these 3 steps to unlock Direct Sync</p>
                                </div>
                                <button
                                    onClick={() => setShowSessGuide(false)}
                                    className="p-2 hover:bg-[var(--accent-primary)]/10 text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-all rounded"
                                >
                                    <Plus className="rotate-45" size={20} />
                                </button>
                            </div>

                            <div className="p-8 space-y-8">
                                <img
                                    src="/tv-guide.png"
                                    alt="How to find session ID and signature"
                                    className="w-full rounded-lg border border-[var(--ui-divider)] shadow-2xl"
                                />

                                <div className="grid grid-cols-3 gap-6">
                                    <div className="space-y-2">
                                        <div className="text-[12px] font-black text-amber-500 tracking-tighter">01</div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-main)] leading-tight">TradingView <br /> <span className="text-amber-500/80">Press F12</span></div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="text-[12px] font-black text-amber-500 tracking-tighter">02</div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-main)] leading-tight">DevTools <br /> <span className="text-amber-500/80">Application</span></div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="text-[12px] font-black text-amber-500 tracking-tighter">03</div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-main)] leading-tight">Copy Both <br /> <span className="text-amber-500/80">ID & Sign</span></div>
                                    </div>
                                </div>
                            </div>
                        </m.div>
                    </m.div>
                )}
            </AnimatePresence>
        </ViewWrapper>
    );
};

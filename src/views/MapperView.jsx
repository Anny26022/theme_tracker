import React, { useState, useMemo, useEffect } from 'react';
import { ViewWrapper } from '../components/ViewWrapper';
import { formatTVWatchlist } from '../lib/watchlistUtils';
import { Search, Plus, Play, Info, ListTree, ChevronRight, Check, Copy } from 'lucide-react';
import { cn } from '../lib/utils';
import { m, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { WatchlistSyncCard } from '../components/WatchlistSyncCard';
import { WatchlistCopyButton } from '../components/WatchlistCopyButton';

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
    const [input, setInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState(TABS.TRADINGVIEW);
    const [processedData, setProcessedData] = useState(null);
    const [copied, setCopied] = useState(false);
    const [syncCopied, setSyncCopied] = useState(false);
    const [showSessGuide, setShowSessGuide] = useState(false);

    // Create a mapping index for fast lookups
    const symbolMap = useMemo(() => {
        const map = new Map();
        rawData.forEach(item => {
            if (item.symbol) map.set(item.symbol.toUpperCase(), item);
            if (item.name) map.set(item.name.toUpperCase(), item);
        });
        return map;
    }, [rawData]);

    const handleProcess = () => {
        if (!input.trim()) return;

        const tokens = input
            // Split by common separators: commas, newlines, plus signs, brackets, slashes, asterisks
            .split(/[,\n\+\/\(\)\*]/)
            .map(t => {
                let token = t.trim().toUpperCase();
                // Strip TradingView prefixes like NSE:, BSE:, or MCX:
                token = token.replace(/^(NSE|BSE|MCX):/, '');
                // Clean any trailing whitespace or dots
                return token.trim();
            })
            .filter(token => {
                // Filter out empty strings
                if (!token) return false;
                // Filter out purely numeric tokens (like /10, /8 etc)
                if (/^\d+(\.\d+)?$/.test(token)) return false;
                // Filter out indices starting with NIFTY, CNX or MCX
                if (token.startsWith('NIFTY') || token.startsWith('CNX') || token.startsWith('MCX')) return false;
                // Filter out very short tokens that are usually junk from formulas
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
                // Try fuzzy/partial match if exact fails
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

        // Group by industry
        const groups = {};
        mapped.forEach(item => {
            const ind = item.industry || 'Uncategorized';
            if (!groups[ind]) groups[ind] = [];

            // Avoid duplicates within group
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

    const handleCleanAllWatchlists = () => { }; // Placeholder for reference if needed elsewhere or handled by component

    return (
        <ViewWrapper id="mapper">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header Section */}
                <div className="space-y-2 border-b border-[var(--ui-divider)] pb-6">
                    <h2 className="text-xl font-light tracking-[0.5em] uppercase opacity-90 text-[var(--text-main)] transition-colors">
                        Stock Industry Mapper
                    </h2>
                    <p className="text-[9px] font-bold leading-relaxed tracking-[0.2em] text-[var(--accent-primary)] uppercase">
                        Translate raw symbols into industry-aware watchlists
                    </p>
                </div>

                {/* Input Section */}
                <div className="glass-card p-6 space-y-6 bg-[var(--glass-bg)] border-[var(--glass-border)] transition-colors">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold">
                        <span className="flex items-center gap-2 font-black text-[var(--text-main)] opacity-60">
                            <Info size={12} className="text-[var(--accent-primary)]" />
                            Symbol Input
                        </span>
                        <span className="text-[8px] font-medium text-[var(--accent-primary)]">
                            {input.split(/[,\n]/).filter(t => t.trim()).length} symbols detected
                        </span>
                    </div>

                    <div className="space-y-4">
                        {/* Search Input */}
                        <div className="flex gap-2">
                            <div className="relative flex-1 group z-[110]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--accent-primary)] transition-colors" size={14} />
                                <input
                                    type="text"
                                    placeholder="Type to search symbols (e.g. RELIANCE, TATAMOTORS)..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddSearch()}
                                    className="w-full bg-[var(--bg-main)]/5 border border-[var(--ui-divider)] rounded-lg py-2.5 pl-10 pr-4 text-[10px] font-bold uppercase tracking-widest focus:outline-none focus:border-[var(--accent-primary)] transition-all text-[var(--text-main)] placeholder:text-[var(--text-muted)]/50"
                                />

                                {/* Suggestions Dropdown */}
                                <AnimatePresence>
                                    {suggestions.length > 0 && (
                                        <m.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="absolute top-full left-0 right-0 mt-2 border border-[var(--ui-divider)] rounded-lg overflow-hidden z-[500] shadow-[0_30px_60px_rgba(0,0,0,0.5)]"
                                            style={{ backgroundColor: 'var(--bg-main)', opacity: 1 }}
                                        >
                                            <div className="p-1 space-y-0.5 max-h-[280px] overflow-y-auto custom-scrollbar bg-[var(--bg-main)]">
                                                {suggestions.map((s, idx) => (
                                                    <button
                                                        key={`${s.symbol}-${idx}`}
                                                        type="button"
                                                        onClick={() => handleSelectSuggestion(s)}
                                                        className="w-full text-left px-4 py-3 hover:bg-[var(--accent-primary)]/10 flex items-center justify-between group transition-colors bg-[var(--bg-main)]"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <CompanyLogo symbol={s.symbol} name={s.name} />
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-[10px] font-black tracking-widest text-[var(--text-main)] transition-colors group-hover:text-[var(--accent-primary)]">{s.name}</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[8px] font-black px-1.5 py-0.5 bg-[var(--ui-muted)]/20 rounded text-[var(--accent-primary)]">{s.symbol}</span>
                                                                    <span className="text-[7px] font-bold text-[var(--text-muted)] uppercase tracking-tight">{s.industry}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[var(--ui-muted)]/10 group-hover:bg-[var(--accent-primary)]/20 transition-all opacity-0 group-hover:opacity-100">
                                                            <Plus size={12} className="text-[var(--accent-primary)]" />
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </m.div>
                                    )}
                                </AnimatePresence>
                            </div>
                            <button
                                onClick={handleAddSearch}
                                className="p-1.5 glass-card border-[var(--ui-divider)] hover:bg-[var(--accent-primary)]/10 hover:border-[var(--accent-primary)] transition-all text-[var(--text-main)] rounded"
                            >
                                <Plus size={14} />
                            </button>
                        </div>

                        {/* Textarea */}
                        <textarea
                            className="w-full h-32 bg-[var(--bg-main)]/10 border border-[var(--ui-divider)] rounded p-3 text-[10px] font-mono tracking-wider leading-relaxed focus:outline-none focus:border-[var(--accent-primary)] transition-all resize-none placeholder:text-[var(--text-muted)]/30 text-[var(--text-main)]/80"
                            placeholder="Enter stock symbols separated by commas or new lines (e.g. RELIANCE, TCS, HDFCBANK...)"
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value);
                                if (processedData) setProcessedData(null);
                            }}
                        />

                        {/* Footer Actions */}
                        <div className="flex items-center justify-end pt-1">
                            <button
                                onClick={handleProcess}
                                disabled={!input.trim() || loading}
                                className="flex items-center gap-2 px-6 py-1.5 glass-card text-[9px] font-medium uppercase tracking-[0.2em] hover:border-[var(--accent-primary)] transition-all disabled:opacity-30 disabled:cursor-not-allowed group/btn text-[var(--text-main)] border-[var(--ui-divider)] rounded"
                            >
                                Process
                                <ChevronRight size={12} className="group-hover/btn:translate-x-1 transition-transform text-[var(--accent-primary)]" />
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
                            {/* Tabs */}
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

                            {/* Tab Content */}
                            <div className="glass-card min-h-[300px] overflow-hidden border-[var(--glass-border)] rounded">
                                <AnimatePresence mode="wait">
                                    {activeTab === TABS.TRADINGVIEW && (
                                        <m.div
                                            key="tv"
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 10 }}
                                            className="p-6 flex flex-col gap-6"
                                        >
                                            <div className="w-full">
                                                <WatchlistSyncCard
                                                    sectors={Object.keys(processedData.groups || {})}
                                                    hierarchy={Object.keys(processedData.groups || {}).reduce((acc, key) => {
                                                        acc[key] = { [key]: processedData.groups[key] };
                                                        return acc;
                                                    }, {})}
                                                    allIndustries={processedData.watchlistData.map(g => ({ name: g.label, sector: g.label }))}
                                                    defaultExpanded={true}
                                                />
                                            </div>

                                            <div className="flex flex-col gap-2 relative">
                                                <div className="flex items-center justify-between px-2">
                                                    <span className="text-[9px] font-black uppercase text-[var(--accent-primary)] tracking-widest pl-1">Target Format Data</span>
                                                    <WatchlistCopyButton
                                                        onCopy={handleCopy}
                                                        className="hover:bg-[var(--accent-primary)]/10 px-2 py-1 rounded"
                                                    />
                                                </div>
                                                <div className="bg-[var(--bg-main)] rounded-lg p-6 font-mono text-[10px] leading-relaxed break-all border border-[var(--ui-divider)] text-[var(--text-main)]/60 selection:bg-[var(--accent-primary)]/20 min-h-[120px] max-h-48 overflow-y-auto custom-scrollbar shadow-inner">
                                                    {processedData.tvFormat || "No valid symbols mapped."}
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
                                                <div key={idx} className="glass-card p-4 border-[var(--ui-divider)] flex items-center justify-between group hover:border-[var(--accent-primary)]/30 transition-all bg-[var(--ui-muted)]/5">
                                                    <div className="space-y-1">
                                                        <span className="text-[7px] font-black text-[var(--accent-primary)] uppercase tracking-widest opacity-60">Industry</span>
                                                        <h4 className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-main)]/80">{group.label}</h4>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-xl font-light text-[var(--text-main)]/80">{group.companies.length}</span>
                                                        <div className="text-[7px] font-bold uppercase tracking-widest opacity-30 text-[var(--text-main)]">Stocks</div>
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
                                                    <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--accent-primary)] flex items-center gap-2">
                                                        <ListTree size={12} />
                                                        {group.label}
                                                    </h4>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                                        {group.companies.map((company, cIdx) => (
                                                            <div key={cIdx} className="p-3 bg-[var(--ui-muted)]/5 rounded-lg border border-[var(--ui-divider)] flex items-center gap-3 hover:border-[var(--ui-divider)]/50 transition-colors">
                                                                <CompanyLogo symbol={company.symbol} name={company.name} />
                                                                <div className="min-w-0">
                                                                    <div className="text-[9px] font-black uppercase tracking-wider truncate text-[var(--text-main)]/80">{company.name}</div>
                                                                    <div className="text-[8px] font-bold text-[var(--accent-primary)]/60">{company.symbol}</div>
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

                            {/* Unmapped Section */}
                            {processedData.unmapped.length > 0 && (
                                <div className="p-6 glass-card border-rose-500/20 bg-rose-500/[0.05] space-y-3">
                                    <div className="flex items-center gap-2 text-rose-500 text-[9px] font-black uppercase tracking-widest">
                                        <Info size={12} />
                                        Unmapped Symbols ({processedData.unmapped.length})
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {processedData.unmapped.map((token, idx) => (
                                            <span key={idx} className="px-2 py-1 bg-rose-500/10 border border-rose-500/20 rounded text-[8px] font-bold text-rose-400 uppercase tracking-widest">
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

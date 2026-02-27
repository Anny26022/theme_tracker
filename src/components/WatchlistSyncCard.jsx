import React, { useState } from 'react';
import { Play, RotateCw, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { motion as m, AnimatePresence } from 'framer-motion';
import { useWatchlistSync } from '../hooks/useWatchlistSync';
import { WatchlistCopyButton } from './WatchlistCopyButton';
import { formatTVWatchlist } from '../lib/watchlistUtils';

export const WatchlistSyncCard = ({ sectors, hierarchy, allIndustries, onCopyAll, defaultExpanded }) => {
    const {
        isSyncing,
        setIsSyncing,
        syncStatus,
        setSyncStatus,
        coloredCounts,
        fetchColoredStatus,
        tvSessionId,
        tvSessionSign,
        TV_SYMBOL_LIMIT,
        syncColors,
        showStatus,
        customLists,
        fetchCustomLists,
        disconnectTV,
        setTvSessionId,
        setTvSessionSign
    } = useWatchlistSync();

    const [tempId, setTempId] = useState('');
    const [tempSign, setTempSign] = useState('');

    const [syncMode, setSyncMode] = useState('replace');
    const [targetListName, setTargetListName] = useState('MASTER LIST');
    const [showGuide, setShowGuide] = useState(false);
    const [isExpanded, setIsExpanded] = useState(defaultExpanded ?? false);

    const handleSyncAllIndustries = async () => {
        if (!tvSessionId) {
            showStatus('error', 'SESSION ID REQUIRED');
            return;
        }

        setIsSyncing(true);
        setSyncStatus({ type: 'info', message: 'SCANNING TV...' });
        let successCount = 0;
        let errorCount = 0;

        try {
            const listResponse = await fetch('/api/tv/symbols_list/all/', {
                method: 'GET',
                headers: { 'x-tv-sessionid': tvSessionId, 'x-tv-sessionid-sign': tvSessionSign }
            });
            if (!listResponse.ok) throw new Error('Auth Failed');
            const existingLists = await listResponse.json();

            const BATCH_SIZE = 5;
            for (let i = 0; i < allIndustries.length; i += BATCH_SIZE) {
                const batch = allIndustries.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(async (ind) => {
                    try {
                        const targetName = ind.name.replace(' COMPANIES', '');
                        const symbols = (hierarchy[ind.sector][ind.name] || []).map(c => `NSE:${c.symbol}`);
                        const existing = existingLists.find(l => l.name === targetName);

                        if (existing) {
                            const isIdentical = existing.symbols.length === symbols.length &&
                                existing.symbols.every((s, i) => s === symbols[i]);
                            if (isIdentical) { successCount++; return; }
                            await fetch(`/api/tv/symbols_list/custom/${existing.id}/`, {
                                method: 'DELETE',
                                headers: { 'x-tv-sessionid': tvSessionId, 'x-tv-sessionid-sign': tvSessionSign }
                            });
                        }

                        const response = await fetch('/api/tv/symbols_list/custom/', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-tv-sessionid': tvSessionId, 'x-tv-sessionid-sign': tvSessionSign },
                            body: JSON.stringify({ name: targetName, symbols })
                        });
                        if (response.ok) successCount++; else errorCount++;
                    } catch (e) { errorCount++; }
                }));
            }
            showStatus('success', `${successCount} INDUSTRIES SYNCED!`);
        } catch (err) {
            showStatus('error', 'SYNC FAILED');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleSyncMasterList = async () => {
        if (!tvSessionId) {
            showStatus('error', 'SESSION ID REQUIRED');
            return;
        }

        setIsSyncing(true);
        setSyncStatus({ type: 'info', message: 'BUILDING SECTIONAL MASTER LIST...' });

        const baseName = targetListName.trim() || 'MASTER LIST';
        let allNewSymbols = [];

        allIndustries.forEach(ind => {
            const indName = ind.name;
            const sectorName = ind.sector;
            const companies = hierarchy[sectorName]?.[indName] || [];
            const validSymbols = companies
                .filter(c => c.symbol && !/^\d+$/.test(c.symbol))
                .map(c => {
                    const exch = (c.exch === "BSE") ? "BSE" : "NSE";
                    return `${exch}:${c.symbol}`;
                });

            if (validSymbols.length > 0) {
                const cleanLabel = indName.replace(" COMPANIES", "").toUpperCase();
                allNewSymbols.push(`### ${cleanLabel} (${validSymbols.length})`);
                allNewSymbols.push(...validSymbols);
            }
        });

        try {
            const listResponse = await fetch('/api/tv/symbols_list/all/', {
                method: 'GET',
                headers: { 'x-tv-sessionid': tvSessionId, 'x-tv-sessionid-sign': tvSessionSign }
            });
            const existingLists = await listResponse.json();

            let combinedSymbols = [];
            if (syncMode === 'append') {
                const matchingLists = existingLists.filter(l =>
                    l.name === baseName || l.name.startsWith(`${baseName} `)
                );
                matchingLists.sort((a, b) => a.name.localeCompare(b.name));
                matchingLists.forEach(l => {
                    if (l.symbols) combinedSymbols.push(...l.symbols);
                });
            }

            const finalSet = new Set(combinedSymbols);
            allNewSymbols.forEach(sym => finalSet.add(sym));
            combinedSymbols = Array.from(finalSet);

            const chunks = [];
            if (combinedSymbols.length === 0) chunks.push([]);
            for (let i = 0; i < combinedSymbols.length; i += TV_SYMBOL_LIMIT) {
                chunks.push(combinedSymbols.slice(i, i + TV_SYMBOL_LIMIT));
            }

            let totalSynced = 0;
            for (let i = 0; i < chunks.length; i++) {
                const listName = chunks.length === 1 ? baseName : `${baseName} ${i + 1}`;
                const symbols = chunks[i];
                totalSynced += symbols.length;

                const existing = existingLists.find(l => l.name === listName);
                if (existing) {
                    await fetch(`/api/tv/symbols_list/custom/${existing.id}/`, {
                        method: 'DELETE',
                        headers: { 'x-tv-sessionid': tvSessionId, 'x-tv-sessionid-sign': tvSessionSign }
                    });
                }
                await fetch('/api/tv/symbols_list/custom/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-tv-sessionid': tvSessionId, 'x-tv-sessionid-sign': tvSessionSign },
                    body: JSON.stringify({ name: listName, symbols })
                });
            }
            showStatus('success', `SYNCED ${totalSynced} ITEMS ACROSS ${chunks.length} LISTS!`);
            fetchCustomLists();
        } catch (err) {
            showStatus('error', 'MASTER SYNC FAILED');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleSyncColoredList = async (colorId) => {
        if (!tvSessionId) {
            showStatus('error', 'SESSION ID REQUIRED');
            return;
        }

        setIsSyncing(true);
        setSyncStatus({ type: 'info', message: `SYNCING TO ${colorId.toUpperCase()} LIST...` });

        try {
            const listSymbols = [];
            allIndustries.forEach(ind => {
                const indName = ind.name;
                const sectorName = ind.sector;
                const companies = hierarchy[sectorName]?.[indName] || [];
                const validSymbols = companies
                    .filter(c => c.symbol && !/^\d+$/.test(c.symbol))
                    .map(c => {
                        const exch = (c.exch === "BSE") ? "BSE" : "NSE";
                        return `${exch}:${c.symbol}`;
                    });

                if (validSymbols.length > 0) {
                    const cleanLabel = indName.replace(" COMPANIES", "").toUpperCase();
                    listSymbols.push(`### ${cleanLabel} (${validSymbols.length})`);
                    validSymbols.forEach(sym => listSymbols.push(sym));
                }
            });

            let finalSymbols = [...listSymbols];

            await fetch(`/api/tv/symbols_list/active/${colorId}/`, {
                method: 'POST',
                headers: { 'x-tv-sessionid': tvSessionId, 'x-tv-sessionid-sign': tvSessionSign }
            });

            if (syncMode === 'append') {
                const res = await fetch(`/api/tv/symbols_list/colored/${colorId}/`, {
                    headers: { 'x-tv-sessionid': tvSessionId, 'x-tv-sessionid-sign': tvSessionSign }
                });
                if (res.ok) {
                    const existing = await res.json();
                    if (Array.isArray(existing)) {
                        const set = new Set(existing);
                        listSymbols.forEach(sym => set.add(sym));
                        finalSymbols = Array.from(set);
                    }
                }
            }

            const targetSymbols = finalSymbols.slice(0, TV_SYMBOL_LIMIT);

            await fetch(`/api/tv/symbols_list/colored/${colorId}/replace/?unsafe=true`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-tv-sessionid': tvSessionId,
                    'x-tv-sessionid-sign': tvSessionSign
                },
                body: JSON.stringify(targetSymbols)
            });

            showStatus('success', `${colorId.toUpperCase()} LIST UPDATED!`);
            fetchColoredStatus();
        } catch (err) {
            showStatus('error', `${colorId.toUpperCase()} SYNC FAILED`);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleClearColoredList = async (colorId) => {
        if (!tvSessionId) {
            showStatus('error', 'SESSION ID REQUIRED');
            return;
        }

        if (!confirm(`Are you sure you want to clear your TradingView ${colorId.toUpperCase()} List?`)) return;

        setIsSyncing(true);
        setSyncStatus({ type: 'info', message: `CLEARING ${colorId.toUpperCase()} LIST...` });

        try {
            await fetch(`/api/tv/symbols_list/colored/${colorId}/replace/?unsafe=true`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-tv-sessionid': tvSessionId,
                    'x-tv-sessionid-sign': tvSessionSign
                },
                body: JSON.stringify([])
            });

            showStatus('success', `${colorId.toUpperCase()} LIST PURGED!`);
            fetchColoredStatus();
        } catch (err) {
            showStatus('error', `FAILED TO CLEAR ${colorId.toUpperCase()} LIST`);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleCleanAllWatchlists = async () => {
        if (!tvSessionId) {
            showStatus('error', 'SESSION ID REQUIRED');
            return;
        }

        setIsSyncing(true);
        setSyncStatus({ type: 'info', message: 'SCANNING ALL WATCHLISTS...' });

        try {
            const listResponse = await fetch('/api/tv/symbols_list/all/', {
                method: 'GET',
                headers: {
                    'x-tv-sessionid': tvSessionId,
                    'x-tv-sessionid-sign': tvSessionSign
                }
            });

            if (!listResponse.ok) throw new Error('Failed to fetch watchlists');
            const allLists = await listResponse.json();

            let cleanedCount = 0;
            const isJunk = (s) => {
                if (!s || typeof s !== 'string') return false;
                const sym = s.trim();
                if (/^\d+$/.test(sym)) return true;
                if (sym.includes(':')) {
                    const parts = sym.split(':');
                    if (parts.some(p => /^\d+$/.test(p.trim()))) return true;
                }
                return false;
            };

            const listsToClean = allLists.filter(list =>
                list.symbols && list.symbols.some(isJunk)
            );

            if (listsToClean.length === 0) {
                showStatus('success', 'ALL LISTS ARE ALREADY CLEAN!');
                return;
            }

            setSyncStatus({ type: 'info', message: `PURGING JUNK FROM ${listsToClean.length} LISTS...` });

            for (const list of listsToClean) {
                const junkSymbols = list.symbols.filter(isJunk);
                if (junkSymbols.length === 0) continue;

                await fetch(`/api/tv/symbols_list/custom/${list.id}/remove/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-tv-sessionid': tvSessionId,
                        'x-tv-sessionid-sign': tvSessionSign
                    },
                    body: JSON.stringify(junkSymbols)
                });
                cleanedCount++;
            }

            showStatus('success', `PURGED JUNK FROM ${cleanedCount} LISTS!`);
        } catch (err) {
            showStatus('error', 'CLEANUP FAILED');
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="flex flex-col items-end gap-3 p-4 glass-card border-[var(--ui-divider)] bg-[var(--ui-muted)]/5 rounded-lg min-w-[340px]">
            <div
                className="flex items-center justify-between w-full gap-6 cursor-pointer select-none"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="space-y-1 text-left">
                    <div className="flex items-center gap-2">
                        <h4 className="text-[9px] font-bold uppercase tracking-widest text-[var(--accent-primary)]">Watchlist Sync</h4>
                        {allIndustries?.length === 1 && (
                            <span className="px-1.5 py-0.5 rounded-[2px] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] text-[5px] font-black uppercase tracking-tighter border border-[var(--accent-primary)]/20">
                                Scoped
                            </span>
                        )}
                        <ChevronDown
                            size={12}
                            className={clsx(
                                "text-[var(--accent-primary)] transition-transform duration-300 ml-1",
                                !isExpanded && "-rotate-90"
                            )}
                        />
                    </div>
                    <p className="text-[7px] text-[var(--text-muted)] uppercase tracking-tight max-w-[150px] leading-tight">
                        Auto-sync <b>{allIndustries?.length || 0}</b> {allIndustries?.length === 1 ? 'industry' : 'industries'} directly to TradingView.
                    </p>
                </div>

                {!isExpanded && tvSessionId && (
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Connected</span>
                    </div>
                )}
            </div>

            <AnimatePresence>
                {isExpanded && (
                    <m.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="w-full flex flex-col items-end gap-3 overflow-hidden"
                    >
                        <div className="flex items-center justify-between w-full gap-6 pt-2 border-t border-[var(--ui-divider)]/30">
                            <div className="space-y-1 text-left">
                                {tvSessionId && (
                                    <div className="flex flex-col gap-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); disconnectTV(); }}
                                            disabled={isSyncing}
                                            className="flex items-center gap-1.5 group text-[6px] font-black uppercase tracking-widest text-[#ff9800]/60 hover:text-[#ff9800] transition-colors"
                                            title="Disconnect current TradingView session"
                                        >
                                            <div className="w-1 h-1 bg-[#ff9800]/40 rounded-full group-hover:bg-[#ff9800] transition-colors" />
                                            Disconnect Session
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleCleanAllWatchlists(); }}
                                            disabled={isSyncing}
                                            className="flex items-center gap-1.5 group text-[6px] font-black uppercase tracking-widest text-rose-400/60 hover:text-rose-400 transition-colors"
                                            title="Purge all ### header symbols from EVERY watchlist on your account"
                                        >
                                            <div className="w-1 h-1 bg-rose-500/40 rounded-full group-hover:bg-rose-500 transition-colors" />
                                            Clean TradingView Junk
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col gap-1.5 min-w-[140px]">
                                {tvSessionId && (
                                    <div className="flex flex-col gap-3 mb-2 p-2.5 bg-[var(--ui-muted)]/5 rounded-md border border-[var(--ui-divider)]">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[5.5px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Action</span>
                                            <div className="flex items-center p-0.5 bg-[var(--bg-main)] rounded border border-[var(--ui-divider)]">
                                                <button
                                                    onClick={() => setSyncMode('replace')}
                                                    className={clsx(
                                                        "flex-1 text-[6.5px] font-black uppercase tracking-widest py-1.5 rounded-sm transition-all",
                                                        syncMode === 'replace' ? "bg-[var(--ui-divider)] text-[var(--text-main)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]")}
                                                >
                                                    Overwrite
                                                </button>
                                                <button
                                                    onClick={() => setSyncMode('append')}
                                                    className={clsx(
                                                        "flex-1 text-[6.5px] font-black uppercase tracking-widest py-1.5 rounded-sm transition-all",
                                                        syncMode === 'append' ? "bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]")}
                                                >
                                                    Append
                                                </button>
                                            </div>
                                            <span className="text-[5px] uppercase font-bold tracking-wider text-[var(--text-muted)]/70 text-left pt-0.5">
                                                {syncMode === 'replace' ? '* Replaces all stocks in list' : '* Safely adds to existing list'}
                                            </span>
                                        </div>

                                        {allIndustries?.length !== 1 && (
                                            <div className="flex flex-col gap-1.5 border-t border-[var(--ui-divider)]/50 pt-2.5">
                                                <span className="text-[5.5px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Target List Name</span>
                                                <input
                                                    type="text"
                                                    value={targetListName}
                                                    onChange={(e) => setTargetListName(e.target.value)}
                                                    placeholder="E.G. MASTER LIST"
                                                    className="w-full bg-[var(--bg-main)] border border-[var(--ui-divider)] rounded px-2 py-1.5 text-[8px] text-[var(--text-main)] font-bold uppercase tracking-widest focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]/20 transition-all placeholder:text-[var(--text-muted)]/30"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {allIndustries?.length !== 1 && (
                                    <div className="flex flex-col gap-2">
                                        <button
                                            onClick={handleSyncAllIndustries}
                                            disabled={isSyncing || !tvSessionId}
                                            className={clsx(
                                                "flex items-center justify-center px-4 py-2 bg-[var(--accent-primary)]/5 border border-[var(--accent-primary)]/20 rounded text-[9px] font-black uppercase tracking-widest text-[var(--accent-primary)] transition-all",
                                                !tvSessionId ? "opacity-10 grayscale cursor-not-allowed" : "hover:bg-[var(--accent-primary)]/10 hover:border-[var(--accent-primary)] shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)]",
                                                isSyncing && "opacity-50 cursor-wait"
                                            )}
                                        >
                                            <Play size={10} className={!tvSessionId ? "opacity-20" : "fill-[var(--accent-primary)]/20"} />
                                            SYNC SPLIT LISTS
                                        </button>
                                        <button
                                            onClick={handleSyncMasterList}
                                            disabled={isSyncing || !tvSessionId}
                                            className={clsx(
                                                "flex items-center gap-2 px-4 py-2 bg-[var(--bg-main)] border border-[var(--ui-divider)] rounded text-[9px] font-black uppercase tracking-widest transition-all",
                                                !tvSessionId ? "opacity-20 grayscale cursor-not-allowed" : "hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] shadow-sm",
                                                isSyncing && "opacity-50 cursor-wait"
                                            )}
                                            title="Sync all items to Target List Name (chunked at 999)"
                                        >
                                            <Play size={10} className={!tvSessionId ? "opacity-20" : "fill-[var(--accent-primary)]/20"} />
                                            SYNC '{(targetListName || 'MASTER LIST').toUpperCase()}'
                                        </button>
                                    </div>
                                )}

                                <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-[var(--ui-divider)]">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[6px] font-black uppercase text-[var(--accent-primary)] tracking-[0.2em] opacity-80">Sync to Flags</span>
                                        <button
                                            onClick={fetchColoredStatus}
                                            className="text-[6px] font-bold text-[var(--text-muted)] hover:text-white transition-colors"
                                        >
                                            <RotateCw size={6} className={clsx(isSyncing && "animate-spin")} />
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                        {syncColors.map(color => (
                                            <div key={color.id} className="flex flex-col items-center gap-1">
                                                <button
                                                    onClick={() => handleSyncColoredList(color.id)}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        handleClearColoredList(color.id);
                                                    }}
                                                    disabled={isSyncing || !tvSessionId}
                                                    className={clsx(
                                                        "w-3.5 h-3.5 rounded-full transition-all border-2 border-transparent hover:scale-110",
                                                        isSyncing && "opacity-50 cursor-wait"
                                                    )}
                                                    style={{
                                                        backgroundColor: color.hex,
                                                        borderColor: coloredCounts[color.id] > 0 ? 'rgba(255,255,255,0.4)' : 'transparent'
                                                    }}
                                                    title={`Sync to ${color.id.toUpperCase()} (Right click to clear)`}
                                                />
                                                <span className="text-[5px] font-black opacity-40 tabular-nums">
                                                    {coloredCounts[color.id] || 0}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {!tvSessionId && (
                            <div className="flex flex-col w-full gap-5 pt-6 mt-3 border-t border-[var(--ui-divider)] bg-[var(--bg-main)]/30 p-4 rounded-lg">
                                <div className="flex flex-col gap-4">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 text-[12px] font-black text-amber-500 uppercase tracking-[0.2em]">
                                            <div className="w-2.5 h-2.5 bg-amber-500 animate-pulse rounded-full shadow-[0_0_12px_rgba(245,158,11,0.6)]" />
                                            Connection Required
                                        </div>
                                    </div>

                                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed font-bold uppercase tracking-wider max-w-sm">
                                        Connect your session to bypass manual copying. Projected lists will appear instantly in your TradingView account with industry headers and color flags.
                                    </p>

                                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 py-4 border-y border-[var(--ui-divider)]">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-1.5 h-1.5 bg-[var(--accent-primary)] rounded-full shadow-[0_0_8px_var(--accent-primary)]" />
                                            <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Instant Flagging</span>
                                        </div>
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-1.5 h-1.5 bg-[var(--accent-primary)] rounded-full shadow-[0_0_8px_var(--accent-primary)]" />
                                            <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Auto-Dividers</span>
                                        </div>
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-1.5 h-1.5 bg-[var(--accent-primary)] rounded-full shadow-[0_0_8px_var(--accent-primary)]" />
                                            <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Bulk Creation</span>
                                        </div>
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-1.5 h-1.5 bg-[var(--accent-primary)] rounded-full shadow-[0_0_8px_var(--accent-primary)]" />
                                            <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Real-time Sync</span>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3 py-4 border-b border-[var(--ui-divider)]">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">Session ID (sessionid)</span>
                                            <input
                                                type="text"
                                                value={tempId}
                                                onChange={(e) => setTempId(e.target.value)}
                                                placeholder="Paste sessionid here..."
                                                className="w-full bg-[var(--bg-main)] border border-[var(--ui-divider)] rounded px-3 py-2 text-[10px] text-[var(--text-main)] font-bold focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]/20 transition-all placeholder:text-[var(--text-muted)]/30"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">Session Signature (sessionid_sign)</span>
                                            <input
                                                type="text"
                                                value={tempSign}
                                                onChange={(e) => setTempSign(e.target.value)}
                                                placeholder="Paste sessionid_sign here..."
                                                className="w-full bg-[var(--bg-main)] border border-[var(--ui-divider)] rounded px-3 py-2 text-[10px] text-[var(--text-main)] font-bold focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]/20 transition-all placeholder:text-[var(--text-muted)]/30"
                                            />
                                        </div>
                                        <button
                                            onClick={() => {
                                                if (!tempId || !tempSign) {
                                                    showStatus('error', 'BOTH ID & SIGN REQUIRED');
                                                    return;
                                                }
                                                localStorage.setItem('tv_session_id', tempId.trim());
                                                localStorage.setItem('tv_session_sign', tempSign.trim());
                                                window.dispatchEvent(new Event('tvAuthChanged'));
                                                showStatus('success', 'SESSION CONNECTED!');
                                            }}
                                            className="w-full py-2.5 mt-2 bg-[var(--accent-primary)] text-white text-[10px] font-black uppercase tracking-[0.2em] rounded shadow-lg shadow-[var(--accent-primary)]/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                        >
                                            Connect TradingView
                                        </button>
                                        <p className="text-[7px] text-[var(--text-muted)]/60 font-medium uppercase tracking-[0.1em] text-center mt-1">
                                            * Sessions typically expire every <b>30 days</b> or if you manually log out from TradingView.
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setShowGuide(!showGuide)}
                                    className="w-full py-2.5 glass-card border-dashed border-blue-500/30 text-[9px] font-black text-blue-400 uppercase tracking-[0.3em] hover:bg-blue-500/10 hover:border-blue-500 transition-all flex items-center justify-center gap-2"
                                >
                                    {showGuide ? "Close Instructions" : "Open Authentication Guide"}
                                    <Play size={10} className={showGuide ? "-rotate-90 transition-transform" : "rotate-90 transition-transform"} />
                                </button>
                            </div>
                        )}

                        <AnimatePresence>
                            {showGuide && (
                                <m.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="w-full relative rounded overflow-hidden space-y-4 pt-4"
                                >
                                    <img
                                        src="/tv-guide.png"
                                        alt="TradingView Auth Guide"
                                        className="w-full h-auto object-contain rounded border border-[var(--ui-divider)]"
                                    />

                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-black text-amber-500 tracking-tighter block">STEP 01</span>
                                            <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-main)] leading-tight">
                                                OPEN <span className="text-amber-500/80">TV.COM</span>
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-black text-amber-500 tracking-tighter block">STEP 02</span>
                                            <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-main)] leading-tight">
                                                PRESS <span className="text-amber-500/80">F12</span>
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-black text-amber-500 tracking-tighter block">STEP 03</span>
                                            <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-main)] leading-tight">
                                                COPY <span className="text-amber-500/80">ID & SIGN</span>
                                            </p>
                                        </div>
                                    </div>
                                </m.div>
                            )}
                        </AnimatePresence>

                        <AnimatePresence>
                            {syncStatus && (
                                <m.div
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    className={clsx(
                                        "w-full text-center py-1 mt-1 rounded text-[7px] font-black uppercase tracking-[0.1em]",
                                        syncStatus.type === 'success' ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
                                            syncStatus.type === 'info' ? "bg-blue-500/10 text-blue-500 border border-blue-500/20" :
                                                "bg-red-500/10 text-red-500 border border-red-500/20"
                                    )}
                                >
                                    {syncStatus.message}
                                </m.div>
                            )}
                        </AnimatePresence>
                    </m.div>
                )}
            </AnimatePresence>
        </div>
    );
};

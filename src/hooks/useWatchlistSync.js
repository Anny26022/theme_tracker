import { useState, useEffect, useCallback } from 'react';

export const useWatchlistSync = () => {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState(null);
    const [coloredCounts, setColoredCounts] = useState({});
    const [customLists, setCustomLists] = useState([]);

    const [tvSessionId, setTvSessionId] = useState(() => localStorage.getItem('tv_session_id') || '');
    const [tvSessionSign, setTvSessionSign] = useState(() => localStorage.getItem('tv_session_sign') || '');
    const TV_SYMBOL_LIMIT = 999;

    const disconnectTV = useCallback(() => {
        if (confirm('Are you sure you want to disconnect from TradingView?')) {
            localStorage.removeItem('tv_session_id');
            localStorage.removeItem('tv_session_sign');
            setTvSessionId('');
            setTvSessionSign('');
            setColoredCounts({});
            setCustomLists([]);
            setSyncStatus({ type: 'info', message: 'DISCONNECTED FROM TRADINGVIEW' });

            // Broadcast event so all other WatchlistSync components instantly update
            window.dispatchEvent(new Event('tvAuthChanged'));

            setTimeout(() => setSyncStatus(null), 3000);
        }
    }, [setSyncStatus]);

    const syncColors = [
        { id: 'red', hex: '#ff5252' },
        { id: 'blue', hex: '#2196f3' },
        { id: 'green', hex: '#4caf50' },
        { id: 'orange', hex: '#ff9800' },
        { id: 'purple', hex: '#9c27b0' },
        { id: 'cyan', hex: '#00bcd4' },
        { id: 'pink', hex: '#e91e63' }
    ];

    const fetchColoredStatus = useCallback(async () => {
        if (!tvSessionId) return;
        const counts = {};
        try {
            await Promise.all(syncColors.map(async (color) => {
                try {
                    const res = await fetch(`/api/tv/symbols_list/colored/${color.id}/`, {
                        headers: { 'x-tv-sessionid': tvSessionId, 'x-tv-sessionid-sign': tvSessionSign }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        counts[color.id] = Array.isArray(data) ? data.length : 0;
                    }
                } catch (e) { }
            }));
            setColoredCounts(counts);
        } catch (e) { }
    }, [tvSessionId, tvSessionSign]);

    const fetchCustomLists = useCallback(async () => {
        if (!tvSessionId) return;
        try {
            const res = await fetch('/api/tv/symbols_list/all/', {
                headers: { 'x-tv-sessionid': tvSessionId, 'x-tv-sessionid-sign': tvSessionSign }
            });
            if (res.ok) {
                const data = await res.json();
                setCustomLists(data.map(l => ({ id: l.id, name: l.name, count: l.symbols?.length || 0, symbols: l.symbols || [] })));
            }
        } catch (e) { }
    }, [tvSessionId, tvSessionSign]);

    useEffect(() => {
        fetchColoredStatus();
        fetchCustomLists();

        // Listen to cross-component network events AND manual browser storage modifications 
        const handleAuthUpdate = () => {
            const newId = localStorage.getItem('tv_session_id') || '';
            const newSign = localStorage.getItem('tv_session_sign') || '';

            setTvSessionId(newId);
            setTvSessionSign(newSign);

            if (!newId) {
                setColoredCounts({});
                setCustomLists([]);
            } else {
                fetchColoredStatus();
                fetchCustomLists();
            }
        };

        window.addEventListener('tvAuthChanged', handleAuthUpdate);
        window.addEventListener('storage', handleAuthUpdate);

        return () => {
            window.removeEventListener('tvAuthChanged', handleAuthUpdate);
            window.removeEventListener('storage', handleAuthUpdate);
        };
    }, [fetchColoredStatus, fetchCustomLists]);

    const showStatus = (type, message) => {
        setSyncStatus({ type, message });
        setTimeout(() => setSyncStatus(null), 5000);
    };

    const deleteList = useCallback(async (listId) => {
        try {
            const res = await fetch(`/api/tv/symbols_list/custom/${listId}/`, {
                method: 'DELETE',
                headers: { 'x-tv-sessionid': tvSessionId, 'x-tv-sessionid-sign': tvSessionSign }
            });
            if (res.ok) {
                setCustomLists(prev => prev.filter(l => String(l.id) !== String(listId)));
                return true;
            }
        } catch (e) { }
        return false;
    }, [tvSessionId, tvSessionSign]);

    const purgeDuplicates = useCallback(async () => {
        if (!tvSessionId || customLists.length === 0) return;
        setIsSyncing(true);
        setSyncStatus({ type: 'info', message: 'PURGING DUPLICATE LISTS...' });

        try {
            const nameGroups = {};
            customLists.forEach(l => {
                if (!nameGroups[l.name]) nameGroups[l.name] = [];
                nameGroups[l.name].push(l);
            });

            let deletedCount = 0;
            for (const name in nameGroups) {
                const group = nameGroups[name];
                if (group.length > 1) {
                    // Keep the one with the highest ID (usually newest)
                    const sorted = [...group].sort((a, b) => String(b.id).localeCompare(String(a.id)));
                    const [keep, ...others] = sorted;

                    for (const other of others) {
                        await fetch(`/api/tv/symbols_list/custom/${other.id}/`, {
                            method: 'DELETE',
                            headers: { 'x-tv-sessionid': tvSessionId, 'x-tv-sessionid-sign': tvSessionSign }
                        });
                        deletedCount++;
                    }
                }
            }

            if (deletedCount > 0) {
                showStatus('success', `PURGED ${deletedCount} DUPLICATE LISTS!`);
                fetchCustomLists();
            } else {
                showStatus('success', 'NO DUPLICATES FOUND');
            }
        } catch (e) {
            showStatus('error', 'PURGE FAILED');
        } finally {
            setIsSyncing(false);
        }
    }, [tvSessionId, tvSessionSign, customLists, fetchCustomLists]);

    return {
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
        deleteList,
        purgeDuplicates
    };
};

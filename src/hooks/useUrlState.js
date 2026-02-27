import { useState, useEffect, useCallback } from 'react';

export const VIEWS = {
    UNIVERSE: 'universe',
    DOMAIN: 'domain',
    SECTOR: 'sector',
    INDUSTRY: 'industry',
    TRACKER: 'tracker',
    COMPARE: 'compare',
    MAPPER: 'mapper'
};

export const useUrlState = () => {
    const getInitialState = () => {
        const params = new URLSearchParams(window.location.search);
        return {
            view: params.get('view') || VIEWS.UNIVERSE,
            sector: params.get('sector'),
            industry: params.get('industry'),
            timeframe: params.get('timeframe') || '1M',
            from: params.get('from') || null
        };
    };

    const [state, setState] = useState(getInitialState);

    // Update state from back/forward buttons
    useEffect(() => {
        const handlePopState = () => {
            setState(getInitialState());
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // Sync state to URL
    useEffect(() => {
        const params = new URLSearchParams();
        params.set('view', state.view);
        params.set('timeframe', state.timeframe);

        if (state.view === VIEWS.SECTOR || state.view === VIEWS.INDUSTRY) {
            if (state.sector) params.set('sector', state.sector);
            if (state.from) params.set('from', state.from);
        }
        if (state.view === VIEWS.INDUSTRY) {
            if (state.industry) params.set('industry', state.industry);
        }

        const newUrl = `${window.location.pathname}?${params.toString()}`;
        const currentUrl = window.location.search;
        const newSearch = `?${params.toString()}`;

        if (currentUrl !== newSearch) {
            const isMinorChange = currentUrl.replace(/timeframe=[^&]*/, '') === newSearch.replace(/timeframe=[^&]*/, '');
            if (isMinorChange) {
                window.history.replaceState(null, '', newUrl);
            } else {
                window.history.pushState(null, '', newUrl);
            }
        }
    }, [state]);

    const navigate = useCallback((view, sector = null, industry = null, from = null) => {
        setState(prev => ({
            ...prev,
            view,
            sector: sector !== undefined ? sector : prev.sector,
            industry: industry !== undefined ? industry : prev.industry,
            from: from !== undefined ? from : (view === VIEWS.SECTOR || view === VIEWS.INDUSTRY ? prev.from : null)
        }));
    }, []);

    const setTimeframe = useCallback((timeframe) => {
        setState(prev => ({ ...prev, timeframe }));
    }, []);

    return {
        ...state,
        navigate,
        setTimeframe
    };
};

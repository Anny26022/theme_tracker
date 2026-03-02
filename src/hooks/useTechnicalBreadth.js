import { useMemo, useEffect, useCallback } from 'react';
import { calculateEMA, calculateSMA, cleanSymbol, getCachedComparisonSeries } from '../services/priceService';
import { useChartVersion, useMarketDataRegistry } from '../context/MarketDataContext';

export function useTechnicalBreadth(items, hierarchy, type = 'sector') {
    const { subscribeChartSymbols, refreshCharts } = useMarketDataRegistry();
    const chartVersion = useChartVersion();
    const itemToSymbols = useMemo(() => {
        const itemToSymbols = new Map();
        if (!items || items.length === 0) return itemToSymbols;

        for (const name of items) {
            const symbols = [];
            if (type === 'sector') {
                const sectorData = hierarchy[name];
                if (sectorData) {
                    Object.values(sectorData).forEach(companies => {
                        companies.forEach(c => symbols.push(c.symbol));
                    });
                }
            } else {
                for (const sector of Object.keys(hierarchy)) {
                    if (hierarchy[sector][name]) {
                        hierarchy[sector][name].forEach(c => symbols.push(c.symbol));
                        break;
                    }
                }
            }
            itemToSymbols.set(name, symbols);
        }
        return itemToSymbols;
    }, [items, hierarchy, type]);

    const allSymbols = useMemo(() => {
        const unique = new Set();
        itemToSymbols.forEach((symbols) => {
            symbols.forEach((symbol) => {
                const cleaned = cleanSymbol(symbol);
                if (cleaned) unique.add(cleaned);
            });
        });
        return Array.from(unique);
    }, [itemToSymbols]);

    useEffect(() => {
        if (!allSymbols.length) return;
        return subscribeChartSymbols('1Y', allSymbols);
    }, [allSymbols, subscribeChartSymbols]);

    const { breadthMap, hasAnyData } = useMemo(() => {
        const updates = {};
        let anyData = false;

        for (const [name, symbols] of itemToSymbols.entries()) {
            if (symbols.length === 0) {
                updates[name] = null;
                continue;
            }

            let above21EMA = 0;
            let above50SMA = 0;
            let above150SMA = 0;
            let above200SMA = 0;
            let validCount = 0;

            symbols.forEach((symbol) => {
                const series = getCachedComparisonSeries(symbol, '1Y', { silent: true });
                if (!series || series.length < 5) return;

                const prices = series.map((p) => p.price).filter((p) => p > 0);
                if (prices.length < 20) return;

                const currentPrice = prices[prices.length - 1];
                const ema21 = calculateEMA(prices, 21);
                const sma50 = calculateSMA(prices, 50);
                const sma150 = calculateSMA(prices, 150);
                const sma200 = calculateSMA(prices, 200);

                if (ema21 && currentPrice > ema21) above21EMA++;
                if (sma50 && currentPrice > sma50) above50SMA++;
                if (sma150 && currentPrice > sma150) above150SMA++;
                if (sma200 && currentPrice > sma200) above200SMA++;

                validCount++;
            });

            if (validCount > 0) anyData = true;

            updates[name] = {
                above21EMA: validCount > 0 ? (above21EMA / validCount) * 100 : 0,
                above50SMA: validCount > 0 ? (above50SMA / validCount) * 100 : 0,
                above150SMA: validCount > 0 ? (above150SMA / validCount) * 100 : 0,
                above200SMA: validCount > 0 ? (above200SMA / validCount) * 100 : 0,
                validCount,
                total: symbols.length
            };
        }

        return { breadthMap: updates, hasAnyData: anyData };
    }, [itemToSymbols, chartVersion]);

    const refresh = useCallback(() => {
        if (!allSymbols.length) return Promise.resolve({});
        return refreshCharts('1Y', allSymbols);
    }, [allSymbols, refreshCharts]);

    const loading = allSymbols.length > 0 && !hasAnyData;

    return { breadthMap: breadthMap || {}, loading, refresh };
}

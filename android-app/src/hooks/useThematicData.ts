import { useMemo } from 'react';
import { useMarketData } from './useMarketData';
import { THEMATIC_MAP } from '@core/market/thematicMap';

export const useThematicData = () => {
    const { hierarchy } = useMarketData();

    const industryMap = useMemo(() => {
        const map: Record<string, any[]> = {};
        if (!hierarchy) return map;
        Object.keys(hierarchy).forEach(sector => {
            const industries = hierarchy[sector];
            if (industries) {
                Object.keys(industries).forEach(ind => {
                    map[ind] = industries[ind];
                });
            }
        });
        return map;
    }, [hierarchy]);

    const symbolNameMap = useMemo(() => {
        const map = new Map<string, string>();
        Object.keys(industryMap).forEach((industry) => {
            const companies = industryMap[industry];
            if (!Array.isArray(companies)) return;
            companies.forEach((company) => {
                if (company?.symbol && !map.has(company.symbol)) {
                    map.set(company.symbol, company.name || company.symbol);
                }
            });
        });
        return map;
    }, [industryMap]);

    const themeCompaniesMap = useMemo(() => {
        const next: Record<string, { symbol: string; name: string }[]> = {};
        THEMATIC_MAP.forEach((block) => {
            block.themes.forEach((theme) => {
                const symbolToName = new Map<string, string>();
                if (theme.industries) {
                    theme.industries.forEach((industry) => {
                        const companies = industryMap[industry];
                        if (!Array.isArray(companies)) return;
                        companies.forEach((company: any) => {
                            if (company?.symbol && !symbolToName.has(company.symbol)) {
                                symbolToName.set(company.symbol, company.name || company.symbol);
                            }
                        });
                    });
                }
                if (theme.symbols) {
                    theme.symbols.forEach((symbol) => {
                        if (!symbolToName.has(symbol)) {
                            symbolToName.set(symbol, symbolNameMap.get(symbol) || symbol);
                        }
                    });
                }
                next[theme.name] = Array.from(symbolToName.entries())
                    .map(([symbol, name]) => ({ symbol, name }))
                    .sort((a, b) => a.name.localeCompare(b.name));
            });
        });
        return next;
    }, [industryMap, symbolNameMap]);

    return { themeCompaniesMap, industryMap, symbolNameMap };
};

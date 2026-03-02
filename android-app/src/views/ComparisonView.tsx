import React, { useMemo, useEffect, useReducer, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { Search, X, TrendingUp, BarChart3, Activity, Plus } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMarketData } from '../hooks/useMarketData';
import { useComparisonData } from '../hooks/useComparisonData';
import { cleanSymbol } from '../services/priceService';
import { isNumericSymbol } from '@core/symbol/cleanSymbol';
import { ViewWrapper } from '../components/ViewWrapper';
import { useTheme } from '../contexts/ThemeContext';
import { ComparisonChart } from '../components/ComparisonChart';

interface ComparisonViewProps {
    onOpenInsights: (company: any) => void;
}

const INTERVALS = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX'];
const COLORS = ['#c5a059', '#4f46e5', '#10b981', '#f43f5e', '#8b5cf6', '#f59e0b', '#06b6d4'];
const MAX_CHART_SYMBOLS = 60;
const STORAGE_KEY = 'tt_comparison_symbols:v2';

type ComparisonState = {
    selectedSymbols: any[];
    timeframe: string;
    searchQuery: string;
    exchangePreference: 'ALL' | 'NSE' | 'BSE';
    isLoaded: boolean;
};

type ComparisonAction =
    | { type: 'hydrate'; symbols: any[] }
    | { type: 'setTimeframe'; value: string }
    | { type: 'setSearchQuery'; value: string }
    | { type: 'setExchange'; value: 'ALL' | 'NSE' | 'BSE' }
    | { type: 'setSelected'; symbols: any[]; clearSearch?: boolean };

const INITIAL_STATE: ComparisonState = {
    selectedSymbols: [],
    timeframe: '1M',
    searchQuery: '',
    exchangePreference: 'ALL',
    isLoaded: false,
};

function comparisonReducer(state: ComparisonState, action: ComparisonAction): ComparisonState {
    switch (action.type) {
        case 'hydrate':
            return {
                ...state,
                selectedSymbols: action.symbols,
                isLoaded: true,
            };
        case 'setTimeframe':
            return { ...state, timeframe: action.value };
        case 'setSearchQuery':
            return { ...state, searchQuery: action.value };
        case 'setExchange':
            return { ...state, exchangePreference: action.value };
        case 'setSelected':
            return {
                ...state,
                selectedSymbols: action.symbols,
                searchQuery: action.clearSearch ? '' : state.searchQuery,
            };
        default:
            return state;
    }
}

const ComparisonHeader = ({ timeframe, onTimeframeChange, currentStyles }: any) => (
    <View style={currentStyles.header}>
        <View style={currentStyles.headerText}>
            <Text style={currentStyles.title}>COMPARISON ENGINE</Text>
            <Text style={currentStyles.subtitle}>CROSS-VECTOR PERFORMANCE ANALYSIS</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={currentStyles.intervalBar} contentInsetAdjustmentBehavior="automatic">
            {INTERVALS.map(tf => (
                <Pressable
                    key={tf}
                    onPress={() => onTimeframeChange(tf)}
                    style={[
                        currentStyles.intervalBtn,
                        timeframe === tf && currentStyles.intervalBtnActive
                    ]}
                >
                    <Text style={[
                        currentStyles.intervalText,
                        timeframe === tf && currentStyles.intervalTextActive
                    ]}>{tf}</Text>
                </Pressable>
            ))}
        </ScrollView>
    </View>
);

const SelectionArea = ({
    selectedSymbols,
    searchQuery,
    searchResults,
    exchangePreference,
    onToggleSymbol,
    onSearchChange,
    onExchangeChange,
    onOpenInsights,
    colors,
    currentStyles,
}: any) => (
    <View style={currentStyles.selectionArea}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={currentStyles.selectedList} contentInsetAdjustmentBehavior="automatic">
            {selectedSymbols.map((item: any, idx: number) => (
                <Pressable
                    key={item.id}
                    style={[
                        currentStyles.symbolChip,
                        { borderColor: COLORS[idx % COLORS.length] + '44' }
                    ]}
                    onPress={() => item.type === 'STOCK' && onOpenInsights?.({ symbol: item.id, name: item.name })}
                >
                    <View style={[currentStyles.dot, { backgroundColor: COLORS[idx % COLORS.length] }]} />
                    <View style={currentStyles.chipInfo}>
                        <Text style={currentStyles.chipText} numberOfLines={1}>
                            {item.type === 'STOCK' ? item.name : item.id}
                        </Text>
                        {item.type === 'INDUSTRY' && (
                            <Text style={currentStyles.chipSubtext}>INDEX</Text>
                        )}
                    </View>
                    <Pressable onPress={() => onToggleSymbol({ clean: item.id })}>
                        <X size={10} color={colors.textMuted} />
                    </Pressable>
                </Pressable>
            ))}
        </ScrollView>

        <View style={currentStyles.searchAndFilter}>
            <View style={currentStyles.exchangeBar}>
                {['ALL', 'NSE', 'BSE'].map(ex => (
                    <Pressable
                        key={ex}
                        onPress={() => onExchangeChange(ex)}
                        style={[
                            currentStyles.exchangeBtn,
                            exchangePreference === ex && currentStyles.exchangeBtnActive
                        ]}
                    >
                        <Text style={[
                            currentStyles.exchangeText,
                            exchangePreference === ex && currentStyles.exchangeTextActive
                        ]}>{ex}</Text>
                    </Pressable>
                ))}
            </View>

            <View style={currentStyles.searchBarContainer}>
                <View style={currentStyles.searchBar}>
                    <Search size={14} color={colors.textMuted} />
                    <TextInput
                        style={currentStyles.searchInput}
                        placeholder="COMPARE SYMBOL..."
                        placeholderTextColor={colors.uiMuted}
                        value={searchQuery}
                        onChangeText={onSearchChange}
                        autoCapitalize="characters"
                    />
                </View>

                {searchQuery.length > 0 && searchResults.length > 0 && (
                    <View style={currentStyles.searchResults}>
                        <ScrollView keyboardShouldPersistTaps="always" contentInsetAdjustmentBehavior="automatic">
                            {searchResults.map((res: any) => (
                                <Pressable
                                    key={res.clean + res.type}
                                    style={currentStyles.searchResultItem}
                                    onPress={() => onToggleSymbol(res)}
                                >
                                    <View style={currentStyles.resHeader}>
                                        <Text style={currentStyles.resSymbol}>{res.symbol}</Text>
                                        {res.type === 'INDUSTRY' && (
                                            <View style={currentStyles.indexBadge}>
                                                <Text style={currentStyles.indexBadgeText}>INDEX</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={currentStyles.resName} numberOfLines={1}>{res.name}</Text>
                                    <View pointerEvents="none" style={currentStyles.resPlus}>
                                        <Plus size={12} color={colors.accentPrimary} />
                                    </View>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                )}
            </View>
        </View>
    </View>
);

const ComparisonChartSection = ({
    loading,
    totalChartSymbols,
    chartData,
    chartSymbols,
    symbolNames,
    timeframe,
    colors,
    currentStyles,
}: any) => {
    const hasData = useMemo(() => {
        if (!chartData || chartData.size === 0) return false;
        return Array.from(chartData.values()).some((v: any) => v && v.length > 0);
    }, [chartData]);

    return (
        <View style={currentStyles.chartContainer}>
            {loading && (
                <View style={currentStyles.chartLoader}>
                    <ActivityIndicator color={colors.accentPrimary} />
                </View>
            )}
            {totalChartSymbols > MAX_CHART_SYMBOLS && (
                <View style={currentStyles.limitBadge}>
                    <Text style={currentStyles.limitText}>SHOWING {MAX_CHART_SYMBOLS} / {totalChartSymbols}</Text>
                </View>
            )}

            {hasData ? (
                <View style={currentStyles.chartWrapper}>
                    <ComparisonChart
                        data={chartData}
                        symbols={chartSymbols}
                        labels={symbolNames}
                        interval={timeframe}
                        height={280}
                    />
                </View>
            ) : (
                <View style={currentStyles.placeholderChart}>
                    <Activity size={48} color={colors.uiDivider} />
                    <Text style={currentStyles.placeholderText}>COMPARISON ENGINE</Text>
                    <Text style={currentStyles.placeholderSubtext}>
                        {chartSymbols.length > 0 ? `Analysing ${chartSymbols.length} Vectors...` : 'Select symbols to compare performance'}
                    </Text>
                </View>
            )}
        </View>
    );
};

const ComparisonFooter = ({ colors, currentStyles }: any) => (
    <View style={currentStyles.footer}>
        <View style={currentStyles.footerItem}>
            <TrendingUp size={12} color={colors.textMuted} />
            <Text style={currentStyles.footerText}>NORMALIZED YIELDS</Text>
        </View>
        <View style={currentStyles.footerItem}>
            <BarChart3 size={12} color={colors.textMuted} />
            <Text style={currentStyles.footerText}>INTRADAY PRECISION</Text>
        </View>
    </View>
);

export const ComparisonView = ({ onOpenInsights }: ComparisonViewProps) => {
    const { colors, isDark } = useTheme();
    const { hierarchy } = useMarketData();
    const [state, dispatch] = useReducer(comparisonReducer, INITIAL_STATE);

    const { selectedSymbols, timeframe, searchQuery, exchangePreference, isLoaded } = state;
    const currentStyles = styles(colors, isDark);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const saved = await AsyncStorage.getItem(STORAGE_KEY);
                const fallback = [
                    { id: 'RELIANCE', name: 'RELIANCE INDUSTRIES', type: 'STOCK' },
                    { id: 'HDFCBANK', name: 'HDFC BANK', type: 'STOCK' }
                ];
                const symbols = saved ? JSON.parse(saved) : fallback;
                if (!cancelled) dispatch({ type: 'hydrate', symbols });
            } catch (e) {
                console.warn('Failed to load comparison symbols', e);
                if (!cancelled) {
                    dispatch({
                        type: 'hydrate',
                        symbols: [
                            { id: 'RELIANCE', name: 'RELIANCE INDUSTRIES', type: 'STOCK' },
                            { id: 'HDFCBANK', name: 'HDFC BANK', type: 'STOCK' }
                        ]
                    });
                }
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!isLoaded) return;
        const save = async () => {
            try {
                await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(selectedSymbols));
            } catch (e) {
                console.warn('Failed to save comparison symbols', e);
            }
        };
        save();
    }, [selectedSymbols, isLoaded]);

    const { allCompanies, allIndustries, symbolNames } = useMemo(() => {
        const companies: any[] = [];
        const industries = new Map<string, string[]>();
        const names = new Map<string, string>();
        const seen = new Set();

        Object.keys(hierarchy).forEach(sector => {
            Object.keys(hierarchy[sector]).forEach(industryName => {
                const members = hierarchy[sector][industryName];
                industries.set(industryName, members.map((m: any) => cleanSymbol(m.symbol)));

                members.forEach((c: any) => {
                    const clean = cleanSymbol(c.symbol);
                    names.set(clean, c.name);
                    if (!seen.has(clean)) {
                        seen.add(clean);
                        companies.push({ ...c, clean, industry: industryName });
                    }
                });
            });
        });
        return { allCompanies: companies, allIndustries: industries, symbolNames: names };
    }, [hierarchy]);

    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase();

        const stockMatches = allCompanies
            .filter(c =>
                c.symbol.toLowerCase().includes(q) ||
                c.name.toLowerCase().includes(q)
            ).map(s => ({ ...s, type: 'STOCK' as const }));

        const relatedIndustries = new Set(stockMatches.map(s => s.industry));
        const directIndustryMatches = Array.from(allIndustries.keys())
            .filter(name => name.toLowerCase().includes(q));

        const mergedIndustries = Array.from(new Set([
            ...directIndustryMatches,
            ...Array.from(relatedIndustries)
        ]));

        const industryResults = mergedIndustries.map(name => ({
            symbol: name,
            clean: name,
            name: 'Industry Index',
            type: 'INDUSTRY' as const,
        }));

        return [...industryResults, ...stockMatches].slice(0, 10);
    }, [allCompanies, allIndustries, searchQuery]);

    const { chartSymbols, totalChartSymbols } = useMemo(() => {
        const unique = new Set<string>();
        selectedSymbols.forEach(s => {
            if (s.type === 'INDUSTRY') {
                const members = allIndustries.get(s.id) || [];
                members.forEach(m => {
                    const numeric = isNumericSymbol(m);
                    if (exchangePreference === 'ALL') unique.add(m);
                    else if (exchangePreference === 'NSE' && !numeric) unique.add(m);
                    else if (exchangePreference === 'BSE' && numeric) unique.add(m);
                });
            } else {
                unique.add(s.id);
            }
        });

        const all = Array.from(unique);
        return {
            totalChartSymbols: all.length,
            chartSymbols: all.slice(0, MAX_CHART_SYMBOLS)
        };
    }, [selectedSymbols, allIndustries, exchangePreference]);

    const { data: chartData, loading } = useComparisonData(chartSymbols, timeframe);

    const handleTimeframeChange = useCallback((tf: string) => {
        dispatch({ type: 'setTimeframe', value: tf });
    }, []);

    const handleSearchChange = useCallback((value: string) => {
        dispatch({ type: 'setSearchQuery', value });
    }, []);

    const handleExchangeChange = useCallback((value: 'ALL' | 'NSE' | 'BSE') => {
        dispatch({ type: 'setExchange', value });
    }, []);

    const toggleSymbol = useCallback((item: any) => {
        const id = item.clean || item.symbol;
        const existing = selectedSymbols.find(s => s.id === id);
        if (existing) {
            dispatch({
                type: 'setSelected',
                symbols: selectedSymbols.filter(s => s.id !== id)
            });
            return;
        }

        if (selectedSymbols.length >= 7) return;
        dispatch({
            type: 'setSelected',
            symbols: [...selectedSymbols, { id, name: item.name, type: item.type }],
            clearSearch: true
        });
    }, [selectedSymbols]);

    if (!isLoaded) {
        return (
            <ViewWrapper>
                <ActivityIndicator size="large" color={colors.accentPrimary} />
            </ViewWrapper>
        );
    }

    return (
        <ViewWrapper style={currentStyles.container}>
            <ComparisonHeader
                timeframe={timeframe}
                onTimeframeChange={handleTimeframeChange}
                currentStyles={currentStyles}
            />

            <SelectionArea
                selectedSymbols={selectedSymbols}
                searchQuery={searchQuery}
                searchResults={searchResults}
                exchangePreference={exchangePreference}
                onToggleSymbol={toggleSymbol}
                onSearchChange={handleSearchChange}
                onExchangeChange={handleExchangeChange}
                onOpenInsights={onOpenInsights}
                colors={colors}
                currentStyles={currentStyles}
            />

            <ComparisonChartSection
                loading={loading}
                totalChartSymbols={totalChartSymbols}
                chartData={chartData}
                chartSymbols={chartSymbols}
                symbolNames={symbolNames}
                timeframe={timeframe}
                colors={colors}
                currentStyles={currentStyles}
            />

            <ComparisonFooter colors={colors} currentStyles={currentStyles} />
        </ViewWrapper>
    );
};

const styles = (colors: any, isDark: boolean) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    header: {
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider,
        gap: 16,
    },
    headerText: {
        gap: 4,
    },
    title: {
        fontSize: 18,
        fontWeight: '300',
        color: colors.accentPrimary,
        letterSpacing: 6,
    },
    subtitle: {
        fontSize: 8,
        fontWeight: '700',
        color: colors.accentPrimary,
        letterSpacing: 2,
        opacity: 0.8,
    },
    intervalBar: {
        flexGrow: 0,
        backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)',
        borderRadius: 8,
        padding: 4,
    },
    intervalBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
    },
    intervalBtnActive: {
        backgroundColor: colors.accentPrimary,
    },
    intervalText: {
        fontSize: 8,
        fontWeight: '900',
        color: colors.textMuted,
        letterSpacing: 1,
    },
    intervalTextActive: {
        color: '#000',
    },
    selectionArea: {
        padding: 16,
        gap: 16,
        zIndex: 50,
        elevation: 5,
    },
    selectedList: {
        flexGrow: 0,
        marginBottom: 8,
    },
    symbolChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.glassBg,
        borderWidth: 2,
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 6,
        marginRight: 8,
        gap: 8,
    },
    dot: {
        width: 4,
        height: 4,
        borderRadius: 2,
    },
    chipInfo: {
        maxWidth: 100,
    },
    chipText: {
        color: colors.textMain,
        fontSize: 9,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    chipSubtext: {
        fontSize: 6,
        fontWeight: '900',
        color: colors.accentPrimary,
        letterSpacing: 1,
        marginTop: 1,
    },
    searchAndFilter: {
        flexDirection: 'column',
        gap: 12,
    },
    exchangeBar: {
        flexDirection: 'row',
        backgroundColor: colors.glassBg,
        borderRadius: 20,
        padding: 4,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: colors.uiDivider,
    },
    exchangeBtn: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 16,
    },
    exchangeBtnActive: {
        backgroundColor: colors.accentPrimary,
        shadowColor: colors.accentPrimary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 5,
    },
    exchangeText: {
        fontSize: 7,
        fontWeight: '900',
        color: colors.textMuted,
        letterSpacing: 1,
    },
    exchangeTextActive: {
        color: '#000',
    },
    searchBarContainer: {
        zIndex: 100,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.glassBg,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.uiDivider,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 10,
    },
    searchInput: {
        flex: 1,
        color: colors.textMain,
        fontSize: 9,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    searchResults: {
        position: 'absolute',
        top: 50,
        left: 0,
        right: 0,
        backgroundColor: colors.bgMain,
        borderWidth: 1,
        borderColor: colors.accentPrimary,
        borderRadius: 12,
        maxHeight: 250,
        zIndex: 500,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 15,
        elevation: 15,
        padding: 8,
    },
    searchResultItem: {
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider,
        position: 'relative',
    },
    resHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    resSymbol: {
        color: colors.textMain,
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1,
    },
    indexBadge: {
        backgroundColor: 'rgba(197, 160, 89, 0.2)',
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 2,
    },
    indexBadgeText: {
        fontSize: 6,
        fontWeight: '900',
        color: colors.accentPrimary,
    },
    resName: {
        color: colors.textMuted,
        fontSize: 8,
        fontWeight: '700',
        marginTop: 2,
        maxWidth: '85%',
    },
    resPlus: {
        position: 'absolute',
        right: 8,
        top: 18,
    },
    chartContainer: {
        flex: 1,
        margin: 16,
        backgroundColor: colors.glassBg,
        borderWidth: 1,
        borderColor: colors.uiDivider,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    chartWrapper: {
        width: '100%',
        height: '100%',
        padding: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    chartLoader: {
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        zIndex: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    limitBadge: {
        position: 'absolute',
        top: 10,
        right: 10,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: colors.uiDivider,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    limitText: {
        fontSize: 6,
        fontWeight: '900',
        color: colors.textMuted,
        letterSpacing: 1,
    },
    placeholderChart: {
        alignItems: 'center',
        gap: 16,
        opacity: 0.6,
    },
    placeholderText: {
        color: colors.textMain,
        fontSize: 14,
        fontWeight: '300',
        letterSpacing: 6,
        textAlign: 'center',
    },
    placeholderSubtext: {
        color: colors.textMuted,
        fontSize: 8,
        fontWeight: 'bold',
        textAlign: 'center',
        paddingHorizontal: 40,
        letterSpacing: 1.5,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 24,
        paddingVertical: 24,
        opacity: 0.4,
    },
    footerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    footerText: {
        fontSize: 8,
        fontWeight: '900',
        color: colors.textMuted,
        letterSpacing: 2.5,
    }
});

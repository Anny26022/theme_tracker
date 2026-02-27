import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Pressable,
    TextInput,
    Modal,
    Image,
    ScrollView,
    Animated,
} from 'react-native';
import { Search, X, Layers, Activity } from 'lucide-react-native';
import { ViewWrapper } from '../components/ViewWrapper';
import { useThematicHeatmap } from '../hooks/useThematicHeatmap';
import { THEMATIC_MAP, BlockDefinition, ThemeDefinition } from '@core/market/thematicMap';
import { useTheme } from '../contexts/ThemeContext';
import { cleanSymbol } from '../services/priceService';

const COLUMNS = [
    { label: '1D', key: '1D' },
    { label: '1W', key: '5D' },
    { label: '1M', key: '1M' },
    { label: '6M', key: '6M' },
    { label: 'YTD', key: 'YTD' }
];

const getHeatmapColor = (value: number | null, colors: any) => {
    if (value === null || value === undefined || isNaN(value)) return { bg: colors.uiMuted, text: colors.textMuted, opacity: 0.2 };

    // Positive Scale
    if (value > 10) return { bg: '#10b981', text: '#ffffff', border: '#059669', bold: true };
    if (value > 5) return { bg: '#34d399', text: '#ffffff', border: '#10b981', bold: true };
    if (value > 2) return { bg: '#6ee7b7', text: '#064e3b', border: '#34d399', bold: true };
    if (value > 0.5) return { bg: '#a7f3d0', text: '#064e3b', border: '#6ee7b7', bold: true };
    if (value > 0) return { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0', bold: true };

    // Negative Scale
    if (value < -10) return { bg: '#f43f5e', text: '#ffffff', border: '#e11d48', bold: true };
    if (value < -5) return { bg: '#fb7185', text: '#ffffff', border: '#f43f5e', bold: true };
    if (value < -2) return { bg: '#fda4af', text: '#881337', border: '#fb7185', bold: true };
    if (value < -0.5) return { bg: '#fecdd3', text: '#881337', border: '#fda4af', bold: true };
    if (value < 0) return { bg: '#fff1f2', text: '#e11d48', border: '#fecdd3', bold: true };

    return { bg: colors.uiMuted, text: colors.textMuted, border: colors.uiDivider, opacity: 0.4 };
};

const CompositionCard = ({ theme, companies, stockPerfMap, onClose, colors }: any) => {
    const currentStyles = styles(colors);

    return (
        <View style={currentStyles.compositionContainer}>
            <View style={currentStyles.compositionHeader}>
                <View>
                    <Text style={currentStyles.compositionSubtitle}>Thematic Composition</Text>
                    <Text style={currentStyles.compositionTitle}>{theme.name}</Text>
                </View>
                <Pressable onPress={onClose} style={currentStyles.closeButton}>
                    <X size={20} color={colors.textMuted} />
                </Pressable>
            </View>

            <View style={currentStyles.compositionStats}>
                <Text style={currentStyles.compositionCount}>{companies.length} STOCKS</Text>
                <View style={currentStyles.columnLabels}>
                    {COLUMNS.map(col => (
                        <Text key={col.key} style={currentStyles.columnLabelText}>{col.label}</Text>
                    ))}
                </View>
            </View>

            <ScrollView style={currentStyles.stocksList} showsVerticalScrollIndicator={false}>
                {companies.map((stock: any) => {
                    const cleaned = cleanSymbol(stock.symbol);
                    return (
                        <View key={stock.symbol} style={currentStyles.stockRow}>
                            <View style={currentStyles.stockInfo}>
                                <View style={currentStyles.stockLogoContainer}>
                                    <Image
                                        source={{ uri: `https://images.dhan.co/symbol/${stock.symbol}.png` }}
                                        style={currentStyles.stockLogo}
                                    />
                                </View>
                                <View style={currentStyles.stockNames}>
                                    <Text style={currentStyles.stockNameText} numberOfLines={1}>{stock.name}</Text>
                                    <Text style={currentStyles.stockSymbolText}>{stock.symbol}</Text>
                                </View>
                            </View>
                            <View style={currentStyles.stockPerfGrid}>
                                {COLUMNS.map(col => {
                                    const perfMap = stockPerfMap.get(col.key);
                                    const val = perfMap?.get(cleaned);
                                    const colorStyle = getHeatmapColor(val, colors);
                                    const displayVal = val !== null && val !== undefined ? (val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)) : '-';

                                    return (
                                        <View
                                            key={col.key}
                                            style={[
                                                currentStyles.perfCell,
                                                { backgroundColor: colorStyle.bg, borderColor: colorStyle.border || 'transparent', borderWidth: colorStyle.border ? 1 : 0 }
                                            ]}
                                        >
                                            <Text style={[currentStyles.perfCellText, { color: colorStyle.text }]}>{displayVal}</Text>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
};

const ThemeRow = ({ theme, companies, themePerf, stockPerfMap, colors, isHighlighted }: any) => {
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);
    const currentStyles = styles(colors);

    // Scale animation for highlight
    const scaleAnim = useRef(new Animated.Value(1)).current;

    React.useEffect(() => {
        if (isHighlighted) {
            Animated.sequence([
                Animated.timing(scaleAnim, { toValue: 1.05, duration: 200, useNativeDriver: true }),
                Animated.timing(scaleAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
                Animated.timing(scaleAnim, { toValue: 1.05, duration: 200, useNativeDriver: true }),
                Animated.timing(scaleAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
            ]).start();
        }
    }, [isHighlighted]);

    return (
        <>
            <Pressable
                style={[
                    currentStyles.themeRowContainer,
                    isHighlighted && { backgroundColor: colors.accentPrimary + '15', borderRadius: 4 }
                ]}
                onPress={() => companies.length > 0 && setIsPopoverOpen(true)}
            >
                <Animated.View style={[currentStyles.themeNameContainer, { transform: [{ scale: scaleAnim }] }]}>
                    <Text style={[currentStyles.themeNameText, isHighlighted && { color: colors.accentPrimary }]}>{theme.name}</Text>
                    <Text style={currentStyles.themeCountText}>({companies.length})</Text>
                </Animated.View>
                <View style={currentStyles.themePerfGrid}>
                    {COLUMNS.map(col => {
                        const val = themePerf[col.key];
                        const colorStyle = getHeatmapColor(val, colors);
                        const displayVal = val !== null && val !== undefined ? (val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)) : '-';

                        return (
                            <View
                                key={col.key}
                                style={[
                                    currentStyles.perfCell,
                                    { backgroundColor: colorStyle.bg, borderColor: colorStyle.border || 'transparent', borderWidth: colorStyle.border ? 1 : 0 }
                                ]}
                            >
                                <Text style={[currentStyles.perfCellText, { color: colorStyle.text }]}>
                                    {displayVal}{val !== null && '%'}
                                </Text>
                            </View>
                        );
                    })}
                </View>
            </Pressable>

            <Modal
                visible={isPopoverOpen}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsPopoverOpen(false)}
            >
                <View style={currentStyles.modalOverlay}>
                    <Pressable style={currentStyles.modalBackdrop} onPress={() => setIsPopoverOpen(false)} />
                    <View style={currentStyles.modalContent}>
                        <CompositionCard
                            theme={theme}
                            companies={companies}
                            stockPerfMap={stockPerfMap}
                            onClose={() => setIsPopoverOpen(false)}
                            colors={colors}
                        />
                    </View>
                </View>
            </Modal>
        </>
    );
};

export const MarketMapView = ({ hierarchy, onOpenInsights }: any) => {
    const { colors } = useTheme();
    const [hideBSE, setHideBSE] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [highlightedTheme, setHighlightedTheme] = useState<string | null>(null);
    const listRef = useRef<FlatList>(null);
    const currentStyles = styles(colors);

    const isBSESymbol = (symbol: string) => {
        if (!symbol) return false;
        return /^\d+$/.test(symbol) || symbol.includes(':BSE');
    };

    const filteredHierarchy = useMemo(() => {
        if (!hierarchy) return null;
        if (!hideBSE) return hierarchy;

        const newHierarchy: any = {};
        Object.keys(hierarchy).forEach(sector => {
            newHierarchy[sector] = {};
            Object.keys(hierarchy[sector]).forEach(industry => {
                newHierarchy[sector][industry] = hierarchy[sector][industry].filter((c: any) => !isBSESymbol(c.symbol));
            });
        });
        return newHierarchy;
    }, [hierarchy, hideBSE]);

    const industryMap = useMemo(() => {
        const map: any = {};
        if (!filteredHierarchy) return map;
        Object.keys(filteredHierarchy).forEach(sector => {
            const industries = filteredHierarchy[sector];
            if (industries) {
                Object.keys(industries).forEach(ind => {
                    map[ind] = industries[ind];
                });
            }
        });
        return map;
    }, [filteredHierarchy]);

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
        const next: any = {};

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

    const { heatmapData, stockPerfMap, loading } = useThematicHeatmap(filteredHierarchy);

    const searchIndex = useMemo(() => {
        const index: any[] = [];
        THEMATIC_MAP.forEach((block, blockIdx) => {
            block.themes.forEach(theme => {
                const companies = themeCompaniesMap[theme.name] || [];
                companies.forEach((company: any) => {
                    index.push({
                        ...company,
                        themeName: theme.name,
                        groupTitle: block.title,
                        blockIdx
                    });
                });
            });
        });
        return index;
    }, [themeCompaniesMap]);

    const searchResults = useMemo(() => {
        if (!searchQuery.trim() || searchQuery.length < 2) return [];
        const q = searchQuery.toLowerCase();
        const seen = new Set();
        return searchIndex.filter(item => {
            const matches = item.name.toLowerCase().includes(q) || item.symbol.toLowerCase().includes(q);
            if (matches && !seen.has(item.symbol)) {
                seen.add(item.symbol);
                return true;
            }
            return false;
        }).slice(0, 8);
    }, [searchIndex, searchQuery]);

    const scrollToBlock = (blockIdx: number, themeName: string) => {
        setIsSearchOpen(false);
        setSearchQuery('');
        setHighlightedTheme(themeName);

        listRef.current?.scrollToIndex({
            index: blockIdx,
            animated: true,
            viewPosition: 0
        });

        setTimeout(() => setHighlightedTheme(null), 3500);
    };

    const renderBlock = ({ item: block, index: blockIdx }: { item: BlockDefinition, index: number }) => (
        <View style={currentStyles.blockContainer}>
            <View style={currentStyles.blockHeader}>
                <Text style={currentStyles.blockTitle}>{block.title}</Text>
                <Layers size={14} color={colors.accentPrimary} />
            </View>

            <View style={currentStyles.tableHeader}>
                <Text style={[currentStyles.headerLabel, { flex: 2 }]}>Cluster</Text>
                {COLUMNS.map(col => (
                    <Text key={col.key} style={currentStyles.headerLabelCenter}>{col.label}</Text>
                ))}
            </View>

            {block.themes.map((theme: ThemeDefinition) => (
                <ThemeRow
                    key={theme.name}
                    theme={theme}
                    companies={themeCompaniesMap[theme.name] || []}
                    themePerf={heatmapData[theme.name] || {}}
                    stockPerfMap={stockPerfMap}
                    colors={colors}
                    isHighlighted={highlightedTheme === theme.name}
                />
            ))}
        </View>
    );

    return (
        <ViewWrapper style={currentStyles.container}>
            <View style={currentStyles.header}>
                <View style={{ flex: 1 }}>
                    <Text style={currentStyles.title}>Market <Text style={{ color: colors.accentPrimary }}>Architecture</Text></Text>
                    <Text style={currentStyles.subtitle}>
                        {hideBSE ? 'Institutional Alpha (NSE Focus)' : 'Deep Thematic Mapping (Global)'}
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <Pressable
                        onPress={() => setIsSearchOpen(true)}
                        style={currentStyles.searchIconBtn}
                    >
                        <Search size={18} color={colors.textMuted} />
                    </Pressable>
                    <Pressable
                        onPress={() => setHideBSE(!hideBSE)}
                        style={[currentStyles.toggleBtn, hideBSE && currentStyles.toggleBtnActive]}
                    >
                        <Text style={[currentStyles.toggleBtnText, hideBSE && currentStyles.toggleBtnTextActive]}>
                            {hideBSE ? 'NSE ONLY' : 'ALL'}
                        </Text>
                    </Pressable>
                </View>
            </View>

            <Legend colors={colors} />

            <FlatList
                ref={listRef}
                data={THEMATIC_MAP}
                renderItem={renderBlock}
                keyExtractor={(item, index) => item.title || index.toString()}
                contentContainerStyle={currentStyles.listContent}
                showsVerticalScrollIndicator={false}
                onScrollToIndexFailed={(info) => {
                    listRef.current?.scrollToOffset({
                        offset: info.averageItemLength * info.index,
                        animated: true
                    });
                }}
            />

            <Modal
                visible={isSearchOpen}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsSearchOpen(false)}
            >
                <View style={currentStyles.searchOverlay}>
                    <Pressable style={currentStyles.modalBackdrop} onPress={() => setIsSearchOpen(false)} />
                    <View style={currentStyles.searchContent}>
                        <View style={currentStyles.modalSearchHeader}>
                            <Search size={16} color={colors.accentPrimary} />
                            <TextInput
                                style={currentStyles.modalSearchInput}
                                placeholder="FIND STOCKS..."
                                placeholderTextColor={colors.uiMuted}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoFocus={true}
                                autoCapitalize="characters"
                            />
                            <Pressable onPress={() => setIsSearchOpen(false)}>
                                <X size={20} color={colors.textMuted} />
                            </Pressable>
                        </View>

                        <ScrollView style={currentStyles.resultsList}>
                            {searchResults.map((result, idx) => (
                                <Pressable
                                    key={`${result.symbol}-${idx}`}
                                    style={currentStyles.resultItem}
                                    onPress={() => scrollToBlock(result.blockIdx, result.themeName)}
                                >
                                    <View>
                                        <Text style={currentStyles.resNameText}>{result.name}</Text>
                                        <Text style={currentStyles.resSymbolText}>{result.symbol}</Text>
                                    </View>
                                    <Text style={currentStyles.resThemeBadge}>{result.groupTitle.split(' ')[0]}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </ViewWrapper>
    );
};

const Legend = ({ colors }: any) => {
    const currentStyles = styles(colors);
    const legendItems = [
        { label: '-5%', color: '#f43f5e' },
        { label: 'Neg', color: '#fecdd3' },
        { label: '0%', color: colors.uiMuted },
        { label: 'Pos', color: '#a7f3d0' },
        { label: '+5%', color: '#10b981' }
    ];

    return (
        <View style={currentStyles.legendContainer}>
            <Text style={currentStyles.legendTitle}>Analytics</Text>
            <View style={currentStyles.legendItems}>
                {legendItems.map((item, idx) => (
                    <View key={idx} style={currentStyles.legendItem}>
                        <View style={[currentStyles.legendColor, { backgroundColor: item.color }]} />
                        <Text style={currentStyles.legendText}>{item.label}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
};

const styles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider,
    },
    title: {
        fontSize: 18,
        fontWeight: '300',
        color: colors.textMain,
        letterSpacing: 4,
        textTransform: 'uppercase',
    },
    subtitle: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.accentPrimary,
        letterSpacing: 2,
        textTransform: 'uppercase',
        opacity: 0.6,
        marginTop: 4,
    },
    searchIconBtn: {
        padding: 8,
    },
    toggleBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.uiDivider,
    },
    toggleBtnActive: {
        backgroundColor: colors.accentPrimary + '20',
        borderColor: colors.accentPrimary + '40',
    },
    toggleBtnText: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.textMuted,
        letterSpacing: 1,
    },
    toggleBtnTextActive: {
        color: colors.accentPrimary,
    },
    legendContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingVertical: 12,
        backgroundColor: colors.glassBg,
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: colors.uiDivider,
    },
    legendTitle: {
        fontSize: 7,
        fontWeight: 'bold',
        color: colors.textMuted,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    legendItems: {
        flexDirection: 'row',
        gap: 10,
    },
    legendItem: {
        alignItems: 'center',
        gap: 2,
    },
    legendColor: {
        width: 20,
        height: 3,
        borderRadius: 2,
    },
    legendText: {
        fontSize: 6,
        fontWeight: 'bold',
        color: colors.textMuted,
        letterSpacing: 1,
    },
    listContent: {
        padding: 16,
        paddingBottom: 100,
    },
    blockContainer: {
        marginBottom: 32,
    },
    blockHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider + '40',
        marginBottom: 12,
    },
    blockTitle: {
        fontSize: 11,
        fontWeight: 'bold',
        color: colors.accentPrimary,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    tableHeader: {
        flexDirection: 'row',
        paddingHorizontal: 4,
        marginBottom: 8,
        opacity: 0.4,
    },
    headerLabel: {
        fontSize: 7,
        fontWeight: 'bold',
        color: colors.textMuted,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    headerLabelCenter: {
        flex: 1,
        fontSize: 7,
        fontWeight: 'bold',
        color: colors.textMuted,
        letterSpacing: 1,
        textTransform: 'uppercase',
        textAlign: 'center',
    },
    themeRowContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 4,
        gap: 4,
    },
    themeNameContainer: {
        flex: 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    themeNameText: {
        fontSize: 9,
        fontWeight: 'bold',
        color: colors.textMain,
        textTransform: 'uppercase',
        letterSpacing: -0.5,
    },
    themeCountText: {
        fontSize: 8,
        color: colors.textMuted,
        fontWeight: 'bold',
    },
    themePerfGrid: {
        flex: 4,
        flexDirection: 'row',
        gap: 4,
    },
    perfCell: {
        flex: 1,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
    },
    perfCellText: {
        fontSize: 7,
        fontWeight: 'bold',
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: 20,
    },
    modalBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    modalContent: {
        backgroundColor: colors.bgMain,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.uiDivider,
        maxHeight: '80%',
        overflow: 'hidden',
    },
    compositionContainer: {
        padding: 16,
    },
    compositionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider,
        paddingBottom: 12,
        marginBottom: 12,
    },
    compositionSubtitle: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.accentPrimary,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    compositionTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: colors.textMain,
        textTransform: 'uppercase',
        marginTop: 2,
    },
    closeButton: {
        padding: 4,
    },
    compositionStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    compositionCount: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.textMuted,
        letterSpacing: 1,
    },
    columnLabels: {
        flexDirection: 'row',
        width: 150,
        gap: 4,
    },
    columnLabelText: {
        flex: 1,
        fontSize: 6,
        fontWeight: 'bold',
        color: colors.textMuted,
        textAlign: 'center',
        opacity: 0.5,
    },
    stocksList: {
        maxHeight: 400,
    },
    stockRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider + '20',
    },
    stockInfo: {
        flex: 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    stockLogoContainer: {
        width: 24,
        height: 24,
        borderRadius: 4,
        backgroundColor: colors.glassBg,
        borderWidth: 1,
        borderColor: colors.uiDivider,
        overflow: 'hidden',
    },
    stockLogo: {
        width: '100%',
        height: '100%',
        resizeMode: 'contain',
    },
    stockNames: {
        flex: 1,
    },
    stockNameText: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.textMain,
        textTransform: 'uppercase',
    },
    stockSymbolText: {
        fontSize: 6,
        fontWeight: 'bold',
        color: colors.textMuted,
        opacity: 0.5,
    },
    stockPerfGrid: {
        width: 150,
        flexDirection: 'row',
        gap: 4,
    },
    // Search Styles
    searchOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        paddingTop: 60,
        paddingHorizontal: 20,
    },
    searchContent: {
        backgroundColor: colors.bgMain,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.uiDivider,
        maxHeight: '70%',
    },
    modalSearchHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider,
        gap: 12,
    },
    modalSearchInput: {
        flex: 1,
        fontSize: 14,
        color: colors.textMain,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    resultsList: {
        paddingBottom: 20,
    },
    resultItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider + '20',
    },
    resNameText: {
        fontSize: 11,
        fontWeight: 'bold',
        color: colors.textMain,
    },
    resSymbolText: {
        fontSize: 9,
        color: colors.accentPrimary,
        fontWeight: 'bold',
    },
    resThemeBadge: {
        fontSize: 7,
        fontWeight: 'bold',
        color: colors.textMuted,
        backgroundColor: colors.uiMuted + '40',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        textTransform: 'uppercase',
    }
});

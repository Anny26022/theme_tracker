import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, FlatList } from 'react-native';
import { Search, Plus, ListTree, ChevronRight, LayoutGrid, RotateCw, BarChart2, Map } from 'lucide-react-native';
import { ViewWrapper } from '../components/ViewWrapper';
import { useTheme } from '../contexts/ThemeContext';
import { useMarketData } from '../hooks/useMarketData';
import { cleanSymbol } from '../services/priceService';
import { formatTVWatchlist } from '../lib/watchlistUtils';
import { copyToClipboard } from '../services/clipboardService';

const TABS = {
    SERIALIZED: 'SERIALIZED',
    DISTRIBUTION: 'DISTRIBUTION',
    MAPPING: 'MAPPING'
};

const CompanyLogo = ({ symbol, name, colors, style }: any) => {
    return (
        <View style={[style.logoContainer, { backgroundColor: colors.uiMuted + '20' }]}>
            <Text style={[style.logoText, { color: colors.textMuted }]}>
                {symbol?.substring(0, 2)}
            </Text>
        </View>
    );
};

export const MapperView = () => {
    const { colors, isDark } = useTheme();
    const currentStyles = styles(colors, isDark);
    const { rawData, loading } = useMarketData();
    const [input, setInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState(TABS.SERIALIZED);
    const [processedData, setProcessedData] = useState<any>(null);

    const symbolMap = useMemo(() => {
        const map = new (Map as any)();
        rawData.forEach((item: any) => {
            if (item.symbol) map.set(item.symbol.toUpperCase(), item);
            if (item.name) map.set(item.name.toUpperCase(), item);
        });
        return map;
    }, [rawData]);

    const handleProcess = (overrideInput?: string) => {
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

        const mapped: any[] = [];
        const unmapped: string[] = [];

        tokens.forEach(token => {
            let match = symbolMap.get(token);
            if (match) {
                mapped.push(match);
            } else {
                const fuzzyMatch = rawData.find((item: any) =>
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

        const groups: any = {};
        mapped.forEach(item => {
            const ind = item.industry || 'Uncategorized';
            if (!groups[ind]) groups[ind] = [];
            if (!groups[ind].find((c: any) => c.symbol === item.symbol)) {
                groups[ind].push(item);
            }
        });

        const watchlistData = Object.entries(groups).map(([label, companies]) => ({
            label,
            companies
        })).sort((a: any, b: any) => b.companies.length - a.companies.length);

        setProcessedData({
            tokens,
            mappedCount: mapped.length,
            unmapped,
            groups,
            watchlistData,
            tvFormat: formatTVWatchlist(watchlistData)
        });
    };

    const suggestions = useMemo(() => {
        if (!searchQuery.trim() || searchQuery.length < 2) return [];
        const query = searchQuery.toUpperCase();
        return rawData
            .filter((item: any) =>
                (item.symbol || '').toUpperCase().includes(query) ||
                (item.name || '').toUpperCase().includes(query)
            )
            .slice(0, 5);
    }, [searchQuery, rawData]);

    const handleSelectSuggestion = (suggestion: any) => {
        const symbol = suggestion.symbol;
        setInput(prev => {
            const separator = prev.trim() ? (prev.includes('\n') ? '\n' : ',') : '';
            return prev.trim() + separator + symbol;
        });
        setSearchQuery('');
    };

    const handleCopy = () => {
        if (processedData?.tvFormat) {
            copyToClipboard(processedData.tvFormat);
        }
    };

    return (
        <ViewWrapper style={currentStyles.container}>
            <ScrollView contentContainerStyle={currentStyles.scrollContent} keyboardShouldPersistTaps="handled">
                {/* Header */}
                <View style={currentStyles.header}>
                    <Text style={currentStyles.title}>INDUSTRY MAPPER</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={currentStyles.subtitle}>Translate symbols into industry-aware lists</Text>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <Pressable onPress={() => setInput('')}>
                                <Text style={[currentStyles.subtitle, { color: colors.textMuted }]}>CLEAR</Text>
                            </Pressable>
                            <Pressable onPress={() => {
                                setInput('RELIANCE, TCS, HDFCBANK, INFOSYS, ICICIBANK, BHARTIARTL, SBIN, ADANIENT, AXISBANK, HINDUNILVR');
                                handleProcess('RELIANCE, TCS, HDFCBANK, INFOSYS, ICICIBANK, BHARTIARTL, SBIN, ADANIENT, AXISBANK, HINDUNILVR');
                            }}>
                                <Text style={currentStyles.subtitle}>LOAD EXAMPLE</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>

                {/* Input Area */}
                <View style={[currentStyles.inputCard, { backgroundColor: colors.glassBg, borderColor: colors.uiDivider }]}>
                    <Text style={currentStyles.label}>INPUT TOKENS</Text>

                    <View style={currentStyles.searchBar}>
                        <Search size={14} color={colors.textMuted} style={currentStyles.searchIcon} />
                        <TextInput
                            style={currentStyles.searchInput}
                            placeholder="QUICK APPEND SYMBOLS..."
                            placeholderTextColor={colors.uiMuted}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoCapitalize="characters"
                        />
                    </View>

                    {suggestions.length > 0 && (
                        <View style={currentStyles.suggestions}>
                            {suggestions.map((s: any, idx) => (
                                <Pressable
                                    key={`${s.symbol}-${idx}`}
                                    style={currentStyles.suggestionItem}
                                    onPress={() => handleSelectSuggestion(s)}
                                >
                                    <View style={currentStyles.suggestionRow}>
                                        <Text style={currentStyles.suggestionSymbol}>{s.symbol}</Text>
                                        <Text style={currentStyles.suggestionName} numberOfLines={1}>{s.name}</Text>
                                    </View>
                                    <Plus size={12} color={colors.accentPrimary} />
                                </Pressable>
                            ))}
                        </View>
                    )}

                    <TextInput
                        multiline
                        style={currentStyles.textArea}
                        placeholder="RELIANCE, TCS, HDFCBANK..."
                        placeholderTextColor={colors.uiMuted}
                        value={input}
                        onChangeText={setInput}
                    />

                    <Pressable
                        style={[currentStyles.processBtn, { backgroundColor: colors.accentPrimary }]}
                        onPress={() => handleProcess()}
                    >
                        <Text style={currentStyles.processBtnText}>PROCESS SELECTION</Text>
                        <ChevronRight size={14} color="#000" />
                    </Pressable>
                </View>

                {/* Results Area */}
                {processedData && (
                    <View style={currentStyles.resultsArea}>
                        <View style={currentStyles.tabBar}>
                            {Object.values(TABS).map(tab => (
                                <Pressable
                                    key={tab}
                                    onPress={() => setActiveTab(tab)}
                                    style={[currentStyles.tab, activeTab === tab && currentStyles.activeTab]}
                                >
                                    <Text style={[currentStyles.tabText, activeTab === tab && currentStyles.activeTabText]}>
                                        {tab}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>

                        <View style={[currentStyles.resultsCard, { backgroundColor: colors.glassBg, borderColor: colors.uiDivider }]}>
                            {activeTab === TABS.SERIALIZED && (
                                <View style={currentStyles.serializedContainer}>
                                    <View style={currentStyles.copyHeader}>
                                        <Text style={currentStyles.cardLabel}>SERIALIZED OUTPUT</Text>
                                        <Pressable onPress={handleCopy} style={currentStyles.copyBtn}>
                                            <RotateCw size={12} color={colors.accentPrimary} />
                                            <Text style={currentStyles.copyBtnText}>COPY</Text>
                                        </Pressable>
                                    </View>
                                    <ScrollView style={currentStyles.serializedTextContainer}>
                                        <Text style={currentStyles.serializedText}>{processedData.tvFormat || "No tokens mapped."}</Text>
                                    </ScrollView>
                                </View>
                            )}

                            {activeTab === TABS.DISTRIBUTION && (
                                <View style={currentStyles.gridContainer}>
                                    {processedData.watchlistData.map((group: any, idx: number) => (
                                        <View key={idx} style={[currentStyles.gridItem, { backgroundColor: colors.uiMuted + '10', borderColor: colors.uiDivider }]}>
                                            <View>
                                                <Text style={currentStyles.itemLabel}>INDUSTRY</Text>
                                                <Text style={currentStyles.itemName} numberOfLines={1}>{group.label}</Text>
                                            </View>
                                            <Text style={currentStyles.itemCount}>{group.companies.length}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {activeTab === TABS.MAPPING && (
                                <View style={currentStyles.mappingContainer}>
                                    {processedData.watchlistData.map((group: any, idx: number) => (
                                        <View key={idx} style={currentStyles.mappingGroup}>
                                            <View style={currentStyles.groupHeader}>
                                                <ListTree size={12} color={colors.accentPrimary} />
                                                <Text style={currentStyles.groupTitle}>{group.label}</Text>
                                            </View>
                                            <View style={currentStyles.mappingGrid}>
                                                {group.companies.map((c: any, cIdx: number) => (
                                                    <View key={cIdx} style={[currentStyles.companyChip, { backgroundColor: colors.uiMuted + '05', borderColor: colors.uiDivider }]}>
                                                        <CompanyLogo symbol={c.symbol} colors={colors} style={currentStyles} />
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={currentStyles.companyName} numberOfLines={1}>{c.name}</Text>
                                                            <Text style={currentStyles.companySymbol}>{c.symbol}</Text>
                                                        </View>
                                                    </View>
                                                ))}
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>

                        {processedData.unmapped.length > 0 && (
                            <View style={[currentStyles.unmappedCard, { backgroundColor: 'rgba(244, 63, 94, 0.05)', borderColor: 'rgba(244, 63, 94, 0.2)' }]}>
                                <Text style={currentStyles.unmappedLabel}>UNMAPPED TOKENS ({processedData.unmapped.length})</Text>
                                <View style={currentStyles.unmappedRow}>
                                    {processedData.unmapped.map((token: string, idx: number) => (
                                        <View key={idx} style={currentStyles.unmappedChip}>
                                            <Text style={currentStyles.unmappedText}>{token}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>
        </ViewWrapper>
    );
};

const styles = (colors: any, isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    scrollContent: { paddingBottom: 40 },
    header: { padding: 20, borderBottomWidth: 1, borderBottomColor: colors.uiDivider, marginBottom: 20 },
    title: { fontSize: 18, fontWeight: '300', color: colors.textMain, letterSpacing: 6, textTransform: 'uppercase' },
    subtitle: { fontSize: 8, fontWeight: 'bold', color: colors.accentPrimary, letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 },
    inputCard: { marginHorizontal: 16, padding: 16, borderRadius: 12, borderWidth: 1, gap: 16 },
    label: { fontSize: 9, fontWeight: '900', color: colors.textMuted, letterSpacing: 2 },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgMain, borderRadius: 8, borderWidth: 1, borderColor: colors.uiDivider, paddingHorizontal: 12 },
    searchIcon: { marginRight: 8, opacity: 0.5 },
    searchInput: { flex: 1, height: 40, fontSize: 10, fontWeight: 'bold', color: colors.textMain, letterSpacing: 1 },
    suggestions: { backgroundColor: colors.bgMain, borderRadius: 8, borderWidth: 1, borderColor: colors.accentPrimary + '44', marginTop: -12, overflow: 'hidden' },
    suggestionItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.uiDivider },
    suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    suggestionSymbol: { fontSize: 10, fontWeight: '900', color: colors.accentPrimary },
    suggestionName: { fontSize: 9, color: colors.textMuted, flex: 1 },
    textArea: { height: 120, backgroundColor: colors.bgMain, borderRadius: 8, borderWidth: 1, borderColor: colors.uiDivider, padding: 12, fontSize: 10, color: colors.textMain, textAlignVertical: 'top', letterSpacing: 1 },
    processBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 44, borderRadius: 22, gap: 10 },
    processBtnText: { fontSize: 9, fontWeight: '900', color: '#000', letterSpacing: 2 },
    resultsArea: { marginTop: 20, gap: 16 },
    tabBar: { flexDirection: 'row', marginHorizontal: 16, borderRadius: 8, backgroundColor: colors.uiMuted + '10', padding: 2 },
    tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
    activeTab: { backgroundColor: colors.accentPrimary },
    tabText: { fontSize: 8, fontWeight: '900', color: colors.textMuted, letterSpacing: 1 },
    activeTabText: { color: '#000' },
    resultsCard: { marginHorizontal: 16, borderRadius: 12, borderWidth: 1, minHeight: 300, overflow: 'hidden' },
    serializedContainer: { padding: 16, gap: 12 },
    copyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardLabel: { fontSize: 8, fontWeight: '900', color: colors.accentPrimary, letterSpacing: 2 },
    copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accentPrimary + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
    copyBtnText: { fontSize: 8, fontWeight: '900', color: colors.accentPrimary },
    serializedTextContainer: { height: 200, backgroundColor: colors.bgMain + '80', borderRadius: 8, padding: 12 },
    serializedText: { fontSize: 9, color: colors.textMuted, lineHeight: 16, letterSpacing: 0.5 },
    gridContainer: { padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    gridItem: { width: '48%', padding: 12, borderRadius: 10, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    itemLabel: { fontSize: 6, fontWeight: '900', color: colors.accentPrimary, opacity: 0.5 },
    itemName: { fontSize: 9, fontWeight: 'bold', color: colors.textMain, marginTop: 2, maxWidth: 100 },
    itemCount: { fontSize: 16, fontWeight: '300', color: colors.textMain, opacity: 0.6 },
    mappingContainer: { paddingVertical: 8 },
    mappingGroup: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.uiDivider },
    groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    groupTitle: { fontSize: 9, fontWeight: '900', color: colors.accentPrimary, letterSpacing: 2 },
    mappingGrid: { gap: 8 },
    companyChip: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, borderWidth: 1, gap: 10 },
    logoContainer: { width: 24, height: 24, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
    logoText: { fontSize: 8, fontWeight: 'black' },
    companyName: { fontSize: 9, fontWeight: 'bold', color: colors.textMain },
    companySymbol: { fontSize: 8, color: colors.accentPrimary, opacity: 0.5 },
    unmappedCard: { marginHorizontal: 16, padding: 16, borderRadius: 12, borderWidth: 1, gap: 12 },
    unmappedLabel: { fontSize: 8, fontWeight: '900', color: '#fb7185', letterSpacing: 2 },
    unmappedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    unmappedChip: { backgroundColor: 'rgba(244, 63, 94, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    unmappedText: { fontSize: 8, fontWeight: 'bold', color: '#fb7185' }
});

MapperView.displayName = 'MapperView';

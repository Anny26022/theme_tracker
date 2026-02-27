import React, { useState, useMemo, useCallback, memo } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Search, ArrowUpRight } from 'lucide-react-native';
import { useMarketData } from '../hooks/useMarketData';
import { ViewWrapper } from '../components/ViewWrapper';
import { IndustryNode } from '../components/IndustryNode';
import { useTheme } from '../contexts/ThemeContext';
import { cleanSymbol } from '../services/priceService';
import { WatchlistCopyButton } from '../components/WatchlistCopyButton';
import { formatTVWatchlist } from '../lib/watchlistUtils';
import { copyToClipboard } from '../services/clipboardService';

interface DomainViewProps {
    onIndustryClick: (sector: string, industry: string) => void;
    onOpenInsights: (company: any) => void;
}

const IndustryItem = memo(({ item, index, onIndustryClick, onCopy }: any) => (
    <View style={viewStyles.column}>
        <IndustryNode
            name={item.name}
            count={item.count}
            index={index}
            onClick={() => onIndustryClick(item.sector, item.name)}
            onCopy={() => onCopy(item)}
        />
    </View>
));

const SearchResultItem = memo(({ c, onPress, colors }: any) => (
    <Pressable
        style={viewStyles.searchResultItem}
        onPress={() => onPress(c)}
    >
        <View style={viewStyles.resContent}>
            <View style={viewStyles.resRowTop}>
                <Text style={[viewStyles.resSymbol, { color: colors.accentPrimary }]}>{c.symbol}</Text>
                <Text style={[viewStyles.resName, { color: colors.textMain }]} numberOfLines={1}>{c.name}</Text>
                <ArrowUpRight size={14} color={colors.textMain} style={viewStyles.resArrow} />
            </View>
            <View style={viewStyles.resRowBottom}>
                <Text style={[viewStyles.resSector, { color: colors.textMuted }]}>{c.sector}</Text>
                <View style={[viewStyles.resSeparator, { backgroundColor: colors.uiDivider }]} />
                <Text style={[viewStyles.resIndustry, { color: colors.textMuted }]}>{c.industry}</Text>
            </View>
        </View>
    </Pressable>
));

export const DomainView = ({ onIndustryClick, onOpenInsights }: DomainViewProps) => {
    const { colors, isDark } = useTheme();
    const { hierarchy, sectors, loading } = useMarketData();
    const [filter, setFilter] = useState('');
    const [showResults, setShowResults] = useState(false);

    const { allIndustries, companiesIndex } = useMemo(() => {
        const seen = new Set();
        const industries: any[] = [];
        const companies: any[] = [];

        sectors.forEach(s => {
            const indDict = hierarchy[s] || {};
            Object.keys(indDict).forEach(indName => {
                if (!seen.has(indName)) {
                    seen.add(indName);
                    industries.push({
                        name: indName,
                        sector: s,
                        count: indDict[indName].length
                    });
                }

                indDict[indName].forEach((c: any) => {
                    companies.push({
                        ...c,
                        industry: indName,
                        sector: s,
                        clean: cleanSymbol(c.symbol)
                    });
                });
            });
        });

        return {
            allIndustries: industries.sort((a, b) => a.name.localeCompare(b.name)),
            companiesIndex: companies
        };
    }, [sectors, hierarchy]);

    const filteredIndustries = useMemo(() => {
        if (!filter) return allIndustries;
        const search = filter.toLowerCase();
        const matches = allIndustries.filter(ind => ind.name.toLowerCase().includes(search));
        const companyMatches = companiesIndex.filter(c =>
            c.symbol.toLowerCase().includes(search) ||
            (c.name && c.name.toLowerCase().includes(search))
        );
        const relatedIndustryNames = new Set(companyMatches.map(c => c.industry));
        const finalResults = [...matches];
        allIndustries.forEach(ind => {
            if (relatedIndustryNames.has(ind.name) && !matches.find(m => m.name === ind.name)) {
                finalResults.push(ind);
            }
        });
        return finalResults.sort((a, b) => a.name.localeCompare(b.name));
    }, [allIndustries, companiesIndex, filter]);

    const handleCopyAll = useCallback(() => {
        const data = filteredIndustries.map(ind => ({
            label: ind.name,
            companies: hierarchy[ind.sector][ind.name] || []
        }));
        const text = formatTVWatchlist(data);
        if (text) {
            copyToClipboard(text);
            return true;
        }
        return false;
    }, [filteredIndustries, hierarchy]);

    const handleCopyIndustry = useCallback((ind: any) => {
        const text = formatTVWatchlist([{
            label: ind.name,
            companies: hierarchy[ind.sector][ind.name] || []
        }]);
        if (text) {
            copyToClipboard(text);
            return true;
        }
        return false;
    }, [hierarchy]);

    const matchingCompanies = useMemo(() => {
        if (!filter || filter.length < 1) return [];
        const search = filter.toLowerCase();
        return companiesIndex
            .filter(c =>
                c.symbol.toLowerCase().includes(search) ||
                (c.name && c.name.toLowerCase().includes(search))
            )
            .slice(0, 10);
    }, [filter, companiesIndex]);

    const handleResultSelect = useCallback((c: any) => {
        onIndustryClick(c.sector, c.industry);
        onOpenInsights?.({ symbol: c.symbol, name: c.name });
        setShowResults(false);
        setFilter('');
    }, [onIndustryClick, onOpenInsights]);

    const renderItem = useCallback(({ item, index }: any) => (
        <IndustryItem
            item={item}
            index={index}
            onIndustryClick={onIndustryClick}
            onCopy={handleCopyIndustry}
        />
    ), [onIndustryClick, handleCopyIndustry]);

    const keyExtractor = useCallback((item: any) => `${item.sector}-${item.name}`, []);

    if (loading) {
        return (
            <View style={viewStyles.loadingContainer}>
                <ActivityIndicator color={colors.accentPrimary} />
                <Text style={[viewStyles.loadingText, { color: colors.textMuted }]}>Synchronizing Architecture...</Text>
            </View>
        );
    }

    return (
        <ViewWrapper style={viewStyles.container}>
            <View style={[viewStyles.header, { borderBottomColor: colors.uiDivider, backgroundColor: isDark ? 'rgba(5, 5, 8, 0.8)' : 'rgba(248, 249, 250, 0.8)' }]} collapsable={false}>
                <View style={viewStyles.headerText}>
                    <View style={viewStyles.titleRow}>
                        <Text style={[viewStyles.title, { color: colors.textMain }]}>DOMAIN VECTOR</Text>
                        <WatchlistCopyButton
                            onCopy={handleCopyAll}
                            size={14}
                            style={viewStyles.copyMaster}
                        />
                    </View>
                    <Text style={[viewStyles.subtitle, { color: colors.accentPrimary }]}>{allIndustries.length} INDUSTRIES ACROSS {sectors.length} SECTORS</Text>
                </View>

                <View style={viewStyles.searchContainer}>
                    <View style={viewStyles.searchBar}>
                        <TextInput
                            style={[viewStyles.input, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#fff', borderColor: colors.uiDivider, color: colors.textMain }]}
                            placeholder="TA"
                            placeholderTextColor={colors.uiMuted}
                            value={filter}
                            onChangeText={(val) => {
                                setFilter(val);
                                setShowResults(true);
                            }}
                            onFocus={() => setShowResults(true)}
                            autoCapitalize="characters"
                            autoCorrect={false}
                        />
                        <View style={viewStyles.searchIconContainer}>
                            <Search size={12} color="#fff" />
                        </View>
                    </View>

                    {showResults && matchingCompanies.length > 0 && (
                        <View style={[viewStyles.searchResults, { backgroundColor: isDark ? colors.bgMain : '#ffffff', borderColor: colors.accentPrimary }]}>
                            <ScrollView keyboardShouldPersistTaps="always" style={{ flex: 1 }} contentInsetAdjustmentBehavior="automatic">
                                {matchingCompanies.map((c) => (
                                    <SearchResultItem key={`${c.symbol}-${c.sector}-${c.industry}`} c={c} onPress={handleResultSelect} colors={colors} />
                                ))}
                            </ScrollView>
                        </View>
                    )}
                </View>
            </View>

            <FlatList
                data={filteredIndustries}
                contentInsetAdjustmentBehavior="automatic"
                keyExtractor={keyExtractor}
                numColumns={2}
                columnWrapperStyle={viewStyles.row}
                renderItem={renderItem}
                initialNumToRender={10}
                windowSize={5}
                maxToRenderPerBatch={10}
                removeClippedSubviews={true}
                contentContainerStyle={viewStyles.listContent}
                ListEmptyComponent={
                    <View style={viewStyles.empty}>
                        <Text style={[viewStyles.emptyText, { color: colors.textMuted }]}>NO VECTORS IDENTIFIED</Text>
                    </View>
                }
            />
        </ViewWrapper>
    );
};

const viewStyles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    copyMaster: { opacity: 0.5 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loadingText: { fontSize: 10, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase' },
    header: { paddingVertical: 24, paddingHorizontal: 16, borderBottomWidth: 1, marginBottom: 16, gap: 16, zIndex: 1000, elevation: 5 },
    headerText: { gap: 4 },
    title: { fontSize: 18, fontWeight: '300', letterSpacing: 6 },
    subtitle: { fontSize: 8, fontWeight: 'bold', letterSpacing: 2 },
    searchContainer: { position: 'relative', zIndex: 2000, alignItems: 'center' },
    searchBar: { width: 240, position: 'relative', alignItems: 'flex-start', alignSelf: 'center' },
    input: { width: '100%', borderWidth: 1, borderRadius: 4, paddingVertical: 10, paddingLeft: 36, paddingRight: 16, fontSize: 10, fontWeight: 'bold', letterSpacing: 2, textAlign: 'left' },
    searchIconContainer: { position: 'absolute', bottom: -8, left: 14, backgroundColor: '#0085ff', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, zIndex: 2002 },
    searchResults: { position: 'absolute', top: 54, left: 0, right: 0, borderWidth: 1, borderRadius: 4, maxHeight: 350, minHeight: 100, zIndex: 5000, elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 15 }, shadowOpacity: 0.4, shadowRadius: 20, overflow: 'hidden' },
    searchResultItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    resContent: { gap: 6 },
    resRowTop: { flexDirection: 'row', alignItems: 'baseline', gap: 10, position: 'relative' },
    resSymbol: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    resName: { fontSize: 9, fontWeight: '600', opacity: 0.8, flex: 1 },
    resArrow: { position: 'absolute', right: 0, top: 2, opacity: 0.6 },
    resRowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    resSector: { fontSize: 7, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
    resSeparator: { width: 1, height: 6 },
    resIndustry: { fontSize: 7, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
    listContent: { paddingBottom: 40, paddingHorizontal: 16 },
    row: { gap: 8, marginBottom: 8 },
    column: { flex: 1 },
    empty: { padding: 40, alignItems: 'center' },
    emptyText: { fontSize: 10, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase' }
});

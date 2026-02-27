import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList } from 'react-native';
import { Search } from 'lucide-react-native';
import { useMarketData } from '../hooks/useMarketData';
import { ViewWrapper } from '../components/ViewWrapper';
import { SectorNode } from '../components/SectorNode';
import { useTheme } from '../contexts/ThemeContext';
import { WatchlistCopyButton } from '../components/WatchlistCopyButton';
import { formatTVWatchlist } from '../lib/watchlistUtils';
import { copyToClipboard } from '../services/clipboardService';

const SectorItem = React.memo(({ item, index, colors, hierarchy, themeColors, onSectorClick, onCopy }: any) => {
    const colorObj = themeColors[index % themeColors.length];
    const count = Object.keys(hierarchy[item] || {}).length;

    return (
        <View style={viewStyles.column}>
            <SectorNode
                name={item}
                count={count}
                index={index}
                colorObj={colorObj}
                onClick={() => onSectorClick(item)}
                onCopy={() => onCopy(item)}
            />
        </View>
    );
});

export const UniverseView = ({ onSectorClick }: { onSectorClick: (sector: string) => void }) => {
    const { colors } = useTheme();
    const { hierarchy, sectors, loading } = useMarketData();
    const [filter, setFilter] = useState('');

    const themeColors = useMemo(() => [
        colors.blue,
        colors.gold,
        colors.emerald,
        colors.purple,
        colors.rose,
        colors.cyan
    ], [colors]);

    const filteredSectors = useMemo(() => {
        if (!filter) return sectors;
        const search = filter.toLowerCase();

        return sectors.filter(s => {
            const indexStr = `${s} ${JSON.stringify(hierarchy[s])}`.toLowerCase();
            return indexStr.includes(search);
        });
    }, [sectors, filter, hierarchy]);

    const handleCopyAll = useCallback(() => {
        let allData: any[] = [];
        filteredSectors.forEach(s => {
            const sectorData = hierarchy[s] || {};
            Object.entries(sectorData).forEach(([ind, companies]) => {
                allData.push({ label: ind, companies });
            });
        });
        const text = formatTVWatchlist(allData);
        if (text) {
            copyToClipboard(text);
            return true;
        }
        return false;
    }, [filteredSectors, hierarchy]);

    const handleCopySector = useCallback((sectorName: string) => {
        const sectorData = hierarchy[sectorName] || {};
        const grouped = Object.entries(sectorData).map(([industryName, companies]) => ({
            label: industryName,
            companies
        }));
        const text = formatTVWatchlist(grouped);
        if (text) {
            copyToClipboard(text);
            return true;
        }
        return false;
    }, [hierarchy]);

    const renderItem = useCallback(({ item, index }: any) => (
        <SectorItem
            item={item}
            index={index}
            colors={colors}
            hierarchy={hierarchy}
            themeColors={themeColors}
            onSectorClick={onSectorClick}
            onCopy={handleCopySector}
        />
    ), [colors, hierarchy, themeColors, onSectorClick, handleCopySector]);

    const keyExtractor = useCallback((item: string) => item, []);

    if (loading) {
        return (
            <View style={viewStyles.center}>
                <Text style={viewStyles.loadingText}>Initializing Universe...</Text>
            </View>
        );
    }

    return (
        <ViewWrapper style={viewStyles.container}>
            <View style={[viewStyles.header, { borderBottomColor: colors.uiDivider }]}>
                <View style={viewStyles.headerLeft}>
                    <View style={viewStyles.titleRow}>
                        <Text style={[viewStyles.title, { color: colors.gold.text }]}>Index</Text>
                        <WatchlistCopyButton
                            onCopy={handleCopyAll}
                            size={14}
                            style={viewStyles.copyMaster}
                        />
                    </View>
                    <Text style={[viewStyles.subtitle, { color: colors.accentPrimary }]}>Market Architecture Overview</Text>
                </View>

                <View style={viewStyles.searchContainer}>
                    <View style={viewStyles.searchBar}>
                        <TextInput
                            style={[viewStyles.input, { backgroundColor: colors.glassBg, borderColor: colors.uiDivider, color: colors.textMain }]}
                            placeholder="FIND SECTORS, STOCKS OR SYMBOLS..."
                            placeholderTextColor={colors.uiMuted}
                            value={filter}
                            onChangeText={setFilter}
                            autoCapitalize="characters"
                        />
                        <View style={viewStyles.searchIconContainer}>
                            <Search size={10} color="#fff" />
                        </View>
                    </View>
                </View>
            </View>

            <FlatList
                data={filteredSectors}
                contentInsetAdjustmentBehavior="automatic"
                keyExtractor={keyExtractor}
                numColumns={2}
                columnWrapperStyle={viewStyles.row}
                renderItem={renderItem}
                contentContainerStyle={viewStyles.listContent}
                initialNumToRender={10}
                windowSize={5}
                maxToRenderPerBatch={10}
                removeClippedSubviews={true}
                ListEmptyComponent={
                    <View style={viewStyles.center}>
                        <Text style={[viewStyles.emptyText, { color: colors.textMuted }]}>NO SECTORS FOUND</Text>
                    </View>
                }
            />
        </ViewWrapper>
    );
};

const viewStyles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    header: { paddingVertical: 24, paddingHorizontal: 16, borderBottomWidth: 1, marginBottom: 16, gap: 16 },
    headerLeft: { gap: 4 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    copyMaster: { opacity: 0.5 },
    title: { fontSize: 20, fontWeight: '300', letterSpacing: 5, textTransform: 'uppercase' },
    subtitle: { fontSize: 9, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase' },
    searchContainer: { alignItems: 'center', marginTop: 8 },
    searchBar: { width: 240, position: 'relative', alignItems: 'flex-start' },
    input: { width: '100%', borderWidth: 1, borderRadius: 4, paddingVertical: 10, paddingLeft: 36, paddingRight: 16, fontSize: 10, fontWeight: 'bold', letterSpacing: 2, textAlign: 'left' },
    searchIconContainer: { position: 'absolute', bottom: -8, left: 14, backgroundColor: '#0085ff', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 2 },
    listContent: { paddingBottom: 40, gap: 8 },
    row: { gap: 8 },
    column: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
    loadingText: { color: '#666', fontSize: 10, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase' },
    emptyText: { fontSize: 10, letterSpacing: 3, textTransform: 'uppercase' }
});

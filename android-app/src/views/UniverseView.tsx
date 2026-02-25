import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList } from 'react-native';
import { Search } from 'lucide-react-native';
import { useMarketData } from '../hooks/useMarketData';
import { ViewWrapper } from '../components/ViewWrapper';
import { SectorNode } from '../components/SectorNode';
import { useTheme } from '../contexts/ThemeContext';
import { WatchlistCopyButton } from '../components/WatchlistCopyButton';
import { formatTVWatchlist } from '../lib/watchlistUtils';
import { copyToClipboard } from '../services/clipboardService';

export const UniverseView = ({ onSectorClick }: { onSectorClick: (sector: string) => void }) => {
    const { colors } = useTheme();
    const { hierarchy, sectors, loading } = useMarketData();
    const [filter, setFilter] = useState('');

    const THEME_COLORS = useMemo(() => [
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

    const handleCopyAll = () => {
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
    };

    const handleCopySector = (sectorName: string) => {
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
    };

    const currentStyles = styles(colors);

    if (loading) {
        return (
            <View style={currentStyles.center}>
                <Text style={currentStyles.loadingText}>Initializing Universe...</Text>
            </View>
        );
    }

    return (
        <ViewWrapper style={currentStyles.container}>
            <View style={currentStyles.header}>
                <View style={currentStyles.headerLeft}>
                    <View style={currentStyles.titleRow}>
                        <Text style={[currentStyles.title, { color: colors.gold.text }]}>Index</Text>
                        <WatchlistCopyButton
                            onCopy={handleCopyAll}
                            size={14}
                            style={currentStyles.copyMaster}
                        />
                    </View>
                    <Text style={currentStyles.subtitle}>Market Architecture Overview</Text>
                </View>

                <View style={currentStyles.searchContainer}>
                    <View style={currentStyles.searchBar}>
                        <TextInput
                            style={currentStyles.input}
                            placeholder="FIND SECTORS, STOCKS OR SYMBOLS..."
                            placeholderTextColor={colors.uiMuted}
                            value={filter}
                            onChangeText={setFilter}
                            autoCapitalize="characters"
                        />
                        <View style={currentStyles.searchIconContainer}>
                            <Search size={10} color="#fff" />
                        </View>
                    </View>
                </View>
            </View>

            <FlatList
                data={filteredSectors}
                keyExtractor={(item) => item}
                numColumns={2}
                columnWrapperStyle={currentStyles.row}
                renderItem={({ item, index }) => {
                    const colorObj = THEME_COLORS[index % THEME_COLORS.length];
                    const count = Object.keys(hierarchy[item] || {}).length;

                    return (
                        <View style={currentStyles.column}>
                            <SectorNode
                                name={item}
                                count={count}
                                index={index}
                                colorObj={colorObj}
                                onClick={() => onSectorClick(item)}
                                onCopy={() => handleCopySector(item)}
                            />
                        </View>
                    );
                }}
                contentContainerStyle={currentStyles.listContent}
                ListEmptyComponent={
                    <View style={currentStyles.center}>
                        <Text style={currentStyles.emptyText}>NO SECTORS FOUND</Text>
                    </View>
                }
            />
        </ViewWrapper>
    );
};

const styles = (colors: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    header: {
        paddingVertical: 24,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider,
        marginBottom: 16,
        gap: 16,
    },
    headerLeft: {
        gap: 4,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    copyMaster: {
        opacity: 0.5,
    },
    title: {
        fontSize: 20,
        fontWeight: '300',
        letterSpacing: 5,
        textTransform: 'uppercase',
    },
    subtitle: {
        fontSize: 9,
        fontWeight: 'bold',
        letterSpacing: 2,
        color: colors.accentPrimary,
        textTransform: 'uppercase',
    },
    searchContainer: {
        alignItems: 'center',
        marginTop: 8,
    },
    searchBar: {
        width: 240,
        position: 'relative',
        alignItems: 'flex-start',
    },
    input: {
        width: '100%',
        backgroundColor: colors.glassBg,
        borderWidth: 1,
        borderColor: colors.uiDivider,
        borderRadius: 4,
        paddingVertical: 10,
        paddingLeft: 36,
        paddingRight: 16,
        fontSize: 10,
        fontWeight: 'bold',
        color: colors.textMain,
        letterSpacing: 2,
        textAlign: 'left',
    },
    searchIconContainer: {
        position: 'absolute',
        bottom: -8,
        left: 14,
        backgroundColor: '#0085ff',
        width: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
    },
    listContent: {
        paddingBottom: 40,
        gap: 8,
    },
    row: {
        gap: 8,
    },
    column: {
        flex: 1,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    loadingText: {
        color: colors.textMuted,
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    emptyText: {
        color: colors.textMuted,
        fontSize: 10,
        letterSpacing: 3,
        textTransform: 'uppercase',
    }
});

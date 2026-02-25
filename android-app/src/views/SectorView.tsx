import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, Pressable } from 'react-native';
import { ArrowLeft, Search } from 'lucide-react-native';
import { ViewWrapper } from '../components/ViewWrapper';
import { IndustryNode } from '../components/IndustryNode';
import { useTheme } from '../contexts/ThemeContext';
import { formatTVWatchlist } from '../lib/watchlistUtils';
import { copyToClipboard } from '../services/clipboardService';

interface SectorViewProps {
    sector: string;
    industries: string[];
    hierarchy: any;
    onBack: () => void;
    onIndustryClick: (industry: string) => void;
}

export const SectorView = ({ sector, industries, hierarchy, onBack, onIndustryClick }: SectorViewProps) => {
    const { colors, isDark } = useTheme();
    const [filter, setFilter] = useState('');

    const filteredIndustries = useMemo(() => {
        if (!filter) return industries;
        const search = filter.toLowerCase();

        return industries.filter(ind => {
            if (ind.toLowerCase().includes(search)) return true;
            const companies = hierarchy[sector][ind] || [];
            return companies.some((c: any) =>
                c.name.toLowerCase().includes(search) ||
                c.symbol.toLowerCase().includes(search)
            );
        });
    }, [industries, filter, sector, hierarchy]);

    const handleCopyIndustry = (industryName: string) => {
        const text = formatTVWatchlist([{
            label: industryName,
            companies: hierarchy[sector]?.[industryName] || []
        }]);
        if (text) {
            copyToClipboard(text);
            return true;
        }
        return false;
    };

    const currentStyles = styles(colors, isDark);

    return (
        <ViewWrapper style={currentStyles.container}>
            <View style={currentStyles.header}>
                <View style={currentStyles.headerTop}>
                    <Pressable onPress={onBack} style={currentStyles.backButton}>
                        <ArrowLeft size={16} color={colors.textMuted} />
                    </Pressable>
                    <View style={currentStyles.headerInfo}>
                        <Text style={currentStyles.vectorText}>Domain Vector</Text>
                        <Text style={currentStyles.title}>{sector}</Text>
                    </View>
                </View>

                <View style={currentStyles.searchContainer}>
                    <View style={currentStyles.searchBar}>
                        <TextInput
                            style={currentStyles.input}
                            placeholder="FILTER INDUSTRIES..."
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
                data={filteredIndustries}
                keyExtractor={(item) => item}
                numColumns={2}
                columnWrapperStyle={currentStyles.row}
                renderItem={({ item, index }) => (
                    <View style={currentStyles.column}>
                        <IndustryNode
                            name={item}
                            count={hierarchy[sector][item].length}
                            index={index}
                            onClick={() => onIndustryClick(item)}
                            onCopy={() => handleCopyIndustry(item)}
                        />
                    </View>
                )}
                contentContainerStyle={currentStyles.listContent}
                ListEmptyComponent={
                    <View style={currentStyles.emptyContainer}>
                        <Text style={currentStyles.emptyText}>No matches found for &quot;{filter}&quot;</Text>
                    </View>
                }
            />
        </ViewWrapper>
    );
};

const styles = (colors: any, isDark: boolean) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
        paddingHorizontal: 16,
    },
    header: {
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider,
        marginBottom: 16,
        gap: 16,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    backButton: {
        padding: 8,
        backgroundColor: colors.glassBg,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    headerInfo: {
        flex: 1,
        gap: 2,
    },
    vectorText: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.accentPrimary,
        opacity: 0.8,
        letterSpacing: 3,
        textTransform: 'uppercase',
    },
    title: {
        fontSize: 18,
        fontWeight: '300',
        letterSpacing: 2,
        color: colors.textMain,
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
    emptyContainer: {
        paddingVertical: 60,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.uiDivider,
        borderStyle: 'dashed',
        borderRadius: 8,
    },
    emptyText: {
        color: colors.textMuted,
        fontSize: 10,
        letterSpacing: 3,
        textTransform: 'uppercase',
    }
});

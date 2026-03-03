import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, Pressable } from 'react-native';
import { ArrowLeft, Search, LayoutGrid, List } from 'lucide-react-native';
import { ViewWrapper } from '../components/ViewWrapper';
import { CompanyCardLite } from '../components/CompanyCardLite';
import { ThematicGridChartView } from './ThematicGridChartView';
import { useTheme } from '../contexts/ThemeContext';

interface IndustryViewProps {
    sector: string;
    industry: string;
    companies: any[];
    onBack: () => void;
    onOpenInsights: (company: any) => void;
}

export const IndustryView = ({ sector, industry, companies, onBack, onOpenInsights }: IndustryViewProps) => {
    const { colors, isDark } = useTheme();
    const [filter, setFilter] = useState('');
    const [isGridView, setIsGridView] = useState(false);

    const filteredCompanies = useMemo(() => {
        if (!filter) return companies;
        const search = filter.toLowerCase();
        return companies.filter(c =>
            c.name.toLowerCase().includes(search) ||
            c.symbol.toLowerCase().includes(search)
        );
    }, [companies, filter]);

    const currentStyles = styles(colors, isDark);

    return (
        <ViewWrapper style={currentStyles.container}>
            <View style={currentStyles.header}>
                <View style={currentStyles.headerTop}>
                    <Pressable onPress={onBack} style={currentStyles.backButton}>
                        <ArrowLeft size={16} color={colors.textMuted} />
                    </Pressable>
                    <View style={currentStyles.headerInfo}>
                        <Text style={currentStyles.sectorText}>{sector}</Text>
                        <Text style={currentStyles.title}>{industry}</Text>
                    </View>
                    <Pressable
                        onPress={() => setIsGridView(!isGridView)}
                        style={currentStyles.toggleButton}
                    >
                        {isGridView ? (
                            <List size={16} color={colors.accentPrimary} />
                        ) : (
                            <LayoutGrid size={16} color={colors.accentPrimary} />
                        )}
                    </Pressable>
                </View>

                <View style={currentStyles.searchContainer}>
                    <View style={currentStyles.searchBar}>
                        <TextInput
                            style={currentStyles.input}
                            placeholder="FILTER COMPANIES..."
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

            {isGridView ? (
                <View style={{ flex: 1, marginTop: -16 }}>
                    <ThematicGridChartView
                        themeName={industry}
                        companies={filteredCompanies}
                        onBack={() => setIsGridView(false)}
                        onOpenInsights={onOpenInsights}
                        onSelectTheme={() => { }}
                    />
                </View>
            ) : (
                <FlatList
                    data={filteredCompanies}
                    contentInsetAdjustmentBehavior="automatic"
                    keyExtractor={(item) => item.symbol}
                    numColumns={2}
                    columnWrapperStyle={currentStyles.row}
                    renderItem={({ item, index }) => (
                        <View style={currentStyles.column}>
                            <CompanyCardLite
                                item={item}
                                index={index}
                                onClick={() => onOpenInsights(item)}
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
            )}
        </ViewWrapper>
    );
};

const styles = (colors: any, isDark: boolean) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    header: {
        paddingVertical: 16,
        paddingHorizontal: 16,
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
    toggleButton: {
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
    sectorText: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.accentPrimary,
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

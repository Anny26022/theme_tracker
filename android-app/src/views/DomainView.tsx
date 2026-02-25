import React, { useState, useMemo } from 'react';
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

export const DomainView = ({ onIndustryClick, onOpenInsights }: DomainViewProps) => {
    const { colors, isDark } = useTheme();
    const { hierarchy, sectors, loading } = useMarketData();
    const [filter, setFilter] = useState('');
    const [showResults, setShowResults] = useState(false);

    // Flatten all industries across all sectors
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

        // Search in industries
        const matches = allIndustries.filter(ind => ind.name.toLowerCase().includes(search));

        // Also check if any companies match the search, then include their industries
        const companyMatches = companiesIndex.filter(c =>
            c.symbol.toLowerCase().includes(search) ||
            (c.name && c.name.toLowerCase().includes(search))
        );

        const relatedIndustryNames = new Set(companyMatches.map(c => c.industry));

        // Merge results
        const finalResults = [...matches];
        allIndustries.forEach(ind => {
            if (relatedIndustryNames.has(ind.name) && !matches.find(m => m.name === ind.name)) {
                finalResults.push(ind);
            }
        });

        return finalResults.sort((a, b) => a.name.localeCompare(b.name));
    }, [allIndustries, companiesIndex, filter]);

    const handleCopyAll = () => {
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
    };

    const handleCopyIndustry = (ind: any) => {
        const text = formatTVWatchlist([{
            label: ind.name,
            companies: hierarchy[ind.sector][ind.name] || []
        }]);
        if (text) {
            copyToClipboard(text);
            return true;
        }
        return false;
    };

    const matchingCompanies = useMemo(() => {
        if (!filter || filter.length < 1) return []; // Lowered threshold to 1 char
        const search = filter.toLowerCase();

        return companiesIndex
            .filter(c =>
                c.symbol.toLowerCase().includes(search) ||
                (c.name && c.name.toLowerCase().includes(search))
            )
            .slice(0, 10);
    }, [filter, companiesIndex]);

    const handleResultSelect = (c: any) => {
        onIndustryClick(c.sector, c.industry);
        onOpenInsights?.({ symbol: c.symbol, name: c.name });
        setShowResults(false);
        setFilter('');
    };

    const currentStyles = styles(colors, isDark);

    if (loading) {
        return (
            <View style={currentStyles.loadingContainer}>
                <ActivityIndicator color={colors.accentPrimary} />
                <Text style={currentStyles.loadingText}>Synchronizing Architecture...</Text>
            </View>
        );
    }

    return (
        <ViewWrapper style={currentStyles.container}>
            {/* Header with Search */}
            <View style={currentStyles.header} collapsable={false}>
                <View style={currentStyles.headerText}>
                    <View style={currentStyles.titleRow}>
                        <Text style={currentStyles.title}>DOMAIN VECTOR</Text>
                        <WatchlistCopyButton
                            onCopy={handleCopyAll}
                            size={14}
                            style={currentStyles.copyMaster}
                        />
                    </View>
                    <Text style={currentStyles.subtitle}>{allIndustries.length} INDUSTRIES ACROSS {sectors.length} SECTORS</Text>
                </View>

                <View style={currentStyles.searchContainer}>
                    <View style={currentStyles.searchBar}>
                        <TextInput
                            style={currentStyles.input}
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
                        <View style={currentStyles.searchIconContainer}>
                            <Search size={12} color="#fff" />
                        </View>
                    </View>

                    {/* Results Overlay */}
                    {showResults && matchingCompanies.length > 0 && (
                        <View style={currentStyles.searchResults}>
                            <ScrollView keyboardShouldPersistTaps="always" style={{ flex: 1 }}>
                                {matchingCompanies.map((c) => (
                                    <Pressable
                                        key={`${c.symbol}-${c.sector}-${c.industry}`}
                                        style={currentStyles.searchResultItem}
                                        onPress={() => handleResultSelect(c)}
                                    >
                                        <View style={currentStyles.resContent}>
                                            <View style={currentStyles.resRowTop}>
                                                <Text style={currentStyles.resSymbol}>{c.symbol}</Text>
                                                <Text style={currentStyles.resName} numberOfLines={1}>{c.name}</Text>
                                                <ArrowUpRight size={14} color={colors.textMain} style={currentStyles.resArrow} />
                                            </View>
                                            <View style={currentStyles.resRowBottom}>
                                                <Text style={currentStyles.resSector}>{c.sector}</Text>
                                                <View style={currentStyles.resSeparator} />
                                                <Text style={currentStyles.resIndustry}>{c.industry}</Text>
                                            </View>
                                        </View>
                                    </Pressable>
                                ))}
                            </ScrollView>
                        </View>
                    )}
                </View>
            </View>

            {/* Industry Grid */}
            <FlatList
                data={filteredIndustries}
                keyExtractor={(item) => `${item.sector}-${item.name}`}
                numColumns={2}
                columnWrapperStyle={currentStyles.row}
                renderItem={({ item, index }) => (
                    <View style={currentStyles.column}>
                        <IndustryNode
                            name={item.name}
                            count={item.count}
                            index={index}
                            onClick={() => onIndustryClick(item.sector, item.name)}
                            onCopy={() => handleCopyIndustry(item)}
                        />
                    </View>
                )}
                contentContainerStyle={currentStyles.listContent}
                ListEmptyComponent={
                    <View style={currentStyles.empty}>
                        <Text style={currentStyles.emptyText}>NO VECTORS IDENTIFIED</Text>
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
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    copyMaster: {
        opacity: 0.5,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: colors.textMuted,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    header: {
        paddingVertical: 24,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider,
        marginBottom: 16,
        gap: 16,
        zIndex: 1000,
        elevation: 5,
        backgroundColor: isDark ? 'rgba(5, 5, 8, 0.8)' : 'rgba(248, 249, 250, 0.8)',
    },
    headerText: {
        gap: 4,
    },
    title: {
        fontSize: 18,
        fontWeight: '300',
        color: colors.textMain,
        letterSpacing: 6,
    },
    subtitle: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.accentPrimary,
        letterSpacing: 2,
    },
    searchContainer: {
        position: 'relative',
        zIndex: 2000,
        alignItems: 'center',
    },
    searchBar: {
        width: 240, // Sleek, compact width
        position: 'relative',
        alignItems: 'flex-start',
        alignSelf: 'center', // Keep the mini-box centered on screen
    },
    input: {
        width: '100%',
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#fff',
        borderWidth: 1,
        borderColor: colors.uiDivider,
        borderRadius: 4,
        paddingVertical: 10, // Slimmer height
        paddingLeft: 36,
        paddingRight: 16,
        fontSize: 10, // Refined font size
        fontWeight: 'bold',
        color: colors.textMain,
        letterSpacing: 2, // Less aggressive letter spacing for small box
        textAlign: 'left',
    },
    searchIconContainer: {
        position: 'absolute',
        bottom: -8,
        left: 14,
        backgroundColor: '#0085ff',
        width: 18, // Mini badge
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        zIndex: 2002,
    },
    searchResults: {
        position: 'absolute',
        top: 54,
        left: 0,
        right: 0,
        backgroundColor: isDark ? colors.bgMain : '#ffffff',
        borderWidth: 1,
        borderColor: colors.accentPrimary,
        borderRadius: 4,
        maxHeight: 350,
        minHeight: 100,
        zIndex: 5000,
        elevation: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 15 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
        overflow: 'hidden',
    },
    searchResultItem: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider,
    },
    resContent: {
        gap: 6,
    },
    resRowTop: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 10,
        position: 'relative',
    },
    resSymbol: {
        fontSize: 12,
        fontWeight: '800',
        color: colors.accentPrimary,
        letterSpacing: 1,
    },
    resName: {
        fontSize: 9,
        fontWeight: '600',
        color: colors.textMain,
        opacity: 0.8,
        flex: 1,
    },
    resArrow: {
        position: 'absolute',
        right: 0,
        top: 2,
        opacity: 0.6,
    },
    resRowBottom: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    resSector: {
        fontSize: 7,
        fontWeight: '900',
        color: colors.textMuted,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    resSeparator: {
        width: 1,
        height: 6,
        backgroundColor: colors.uiDivider,
    },
    resIndustry: {
        fontSize: 7,
        fontWeight: '900',
        color: colors.textMuted,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    listContent: {
        paddingBottom: 40,
        paddingHorizontal: 16,
    },
    row: {
        gap: 8,
        marginBottom: 8,
    },
    column: {
        flex: 1,
    },
    empty: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: colors.textMuted,
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 2,
        textTransform: 'uppercase',
    }
});

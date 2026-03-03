import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, useWindowDimensions, Modal, ScrollView } from 'react-native';
import { ArrowLeft, LayoutGrid, List, Columns, StretchHorizontal as Rows, ChevronDown, Layers, X } from 'lucide-react-native';
import { ViewWrapper } from '../components/ViewWrapper';
import { FinvizChart } from '../components/FinvizChart';
import { useTheme } from '../contexts/ThemeContext';
import { cleanSymbol } from '../services/priceService';
import { THEMATIC_MAP, MACRO_PILLARS } from '@core/market/thematicMap';

interface ThematicGridChartViewProps {
    themeName: string;
    companies: any[];
    onBack: () => void;
    onOpenInsights: (company: any) => void;
    onSelectTheme: (themeName: string) => void;
    viewMode?: 'THEMATIC' | 'MACRO';
    onViewModeChange?: (mode: 'THEMATIC' | 'MACRO') => void;
}

export const ThematicGridChartView = ({
    themeName,
    companies = [],
    onBack,
    onOpenInsights,
    onSelectTheme,
    viewMode = 'THEMATIC',
    onViewModeChange
}: ThematicGridChartViewProps) => {
    const { colors, isDark } = useTheme();
    const { width } = useWindowDimensions();
    const [numColumns, setNumColumns] = useState(1);
    const [displayMode, setDisplayMode] = useState<'LIST' | 'SNAP'>('LIST');
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const currentStyles = styles(colors, isDark);

    const renderItem = useCallback(({ item }: { item: any }) => {
        if (displayMode === 'SNAP') {
            return (
                <View style={[layoutStyles.snapItem, { width: width - 32 }]}>
                    <FinvizChart
                        symbol={item.symbol}
                        name={item.name}
                        height={400}
                        onExpand={() => onOpenInsights(item)}
                    />
                </View>
            );
        }

        return (
            <View style={numColumns === 2 ? layoutStyles.halfWidth : layoutStyles.fullWidth}>
                <FinvizChart
                    symbol={item.symbol}
                    name={item.name}
                    height={220}
                    onExpand={() => onOpenInsights(item)}
                />
            </View>
        );
    }, [numColumns, displayMode, onOpenInsights, width]);

    return (
        <ViewWrapper style={currentStyles.container}>
            <View style={currentStyles.header}>
                <View style={currentStyles.headerTop}>
                    <Pressable onPress={onBack} style={currentStyles.backButton}>
                        <ArrowLeft size={16} color={colors.textMuted} />
                    </Pressable>
                    <View style={currentStyles.headerInfo}>
                        <Pressable onPress={() => setIsMenuOpen(true)} style={currentStyles.titleContainer}>
                            <Text style={currentStyles.title}>{themeName}</Text>
                            <ChevronDown size={12} color={colors.accentPrimary} />
                        </Pressable>
                        <Text style={currentStyles.subtitle}>{companies.length} STOCKS</Text>
                    </View>
                    <View style={currentStyles.headerActions}>
                        <Pressable
                            onPress={() => setDisplayMode(prev => prev === 'LIST' ? 'SNAP' : 'LIST')}
                            style={currentStyles.layoutBtn}
                        >
                            {displayMode === 'LIST' ? <Rows size={16} color={colors.accentPrimary} /> : <Columns size={16} color={colors.accentPrimary} />}
                        </Pressable>
                        {displayMode === 'LIST' && (
                            <Pressable
                                onPress={() => setNumColumns(prev => prev === 1 ? 2 : 1)}
                                style={currentStyles.layoutBtn}
                            >
                                {numColumns === 1 ? <LayoutGrid size={16} color={colors.accentPrimary} /> : <List size={16} color={colors.accentPrimary} />}
                            </Pressable>
                        )}
                    </View>
                </View>

                {/* Theme Selector Modal */}
                <Modal visible={isMenuOpen} transparent animationType="fade" onRequestClose={() => setIsMenuOpen(false)}>
                    <View style={currentStyles.modalOverlay}>
                        <Pressable style={currentStyles.modalBackdrop} onPress={() => setIsMenuOpen(false)} />
                        <View style={[currentStyles.modalContent, { backgroundColor: colors.bgMain, borderColor: colors.uiDivider }]}>
                            <View style={currentStyles.modalHeader}>
                                <View style={currentStyles.viewToggle}>
                                    {['THEMATIC', 'MACRO'].map(mode => (
                                        <Pressable
                                            key={mode}
                                            onPress={() => onViewModeChange?.(mode as any)}
                                            style={[
                                                currentStyles.toggleBtn,
                                                viewMode === mode && { backgroundColor: colors.accentPrimary }
                                            ]}
                                        >
                                            <Text style={[
                                                currentStyles.toggleText,
                                                viewMode === mode ? { color: '#000' } : { color: colors.textMuted }
                                            ]}>{mode}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                                <Pressable onPress={() => setIsMenuOpen(false)}>
                                    <X size={20} color={colors.textMuted} />
                                </Pressable>
                            </View>

                            <ScrollView style={currentStyles.menuList} showsVerticalScrollIndicator={false}>
                                {viewMode === 'THEMATIC' ? (
                                    THEMATIC_MAP.map((block, bi) => (
                                        <View key={bi} style={currentStyles.menuBlock}>
                                            <View style={currentStyles.blockHeader}>
                                                <Text style={currentStyles.blockTitle}>{block.title}</Text>
                                            </View>
                                            <View style={currentStyles.themeGrid}>
                                                {block.themes.map((theme, ti) => (
                                                    <Pressable
                                                        key={ti}
                                                        onPress={() => {
                                                            onSelectTheme(theme.name);
                                                            setIsMenuOpen(false);
                                                        }}
                                                        style={[
                                                            currentStyles.themeChip,
                                                            theme.name === themeName && { backgroundColor: colors.accentPrimary }
                                                        ]}
                                                    >
                                                        <Text style={[
                                                            currentStyles.themeChipText,
                                                            theme.name === themeName ? { color: '#000' } : { color: colors.textMain }
                                                        ]}>{theme.name}</Text>
                                                    </Pressable>
                                                ))}
                                            </View>
                                        </View>
                                    ))
                                ) : (
                                    MACRO_PILLARS.map((pillar, pi) => (
                                        <View key={pi} style={currentStyles.menuBlock}>
                                            <View style={currentStyles.pillarHeader}>
                                                <Layers size={10} color={colors.accentPrimary} />
                                                <Text style={currentStyles.pillarTitle}>{pillar.title}</Text>
                                            </View>
                                            {pillar.blocks.map((blockTitle, bi) => {
                                                const block = THEMATIC_MAP.find(b => b.title === blockTitle);
                                                return (
                                                    <View key={bi} style={currentStyles.pillarInnerBlock}>
                                                        <Text style={currentStyles.innerBlockTitle}>{blockTitle}</Text>
                                                        <View style={currentStyles.themeGrid}>
                                                            {block?.themes.map((theme, ti) => (
                                                                <Pressable
                                                                    key={ti}
                                                                    onPress={() => {
                                                                        onSelectTheme(theme.name);
                                                                        setIsMenuOpen(false);
                                                                    }}
                                                                    style={[
                                                                        currentStyles.themeChip,
                                                                        theme.name === themeName && { backgroundColor: colors.accentPrimary }
                                                                    ]}
                                                                >
                                                                    <Text style={[
                                                                        currentStyles.themeChipText,
                                                                        theme.name === themeName ? { color: '#000' } : { color: colors.textMain }
                                                                    ]}>{theme.name}</Text>
                                                                </Pressable>
                                                            ))}
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    ))
                                )}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            </View>

            <FlatList
                data={companies}
                key={`${displayMode}-${numColumns}`}
                horizontal={displayMode === 'SNAP'}
                pagingEnabled={displayMode === 'SNAP'}
                snapToInterval={displayMode === 'SNAP' ? width - 32 + 16 : undefined}
                decelerationRate="fast"
                numColumns={displayMode === 'SNAP' ? 1 : numColumns}
                keyExtractor={(item) => item.symbol}
                renderItem={renderItem}
                contentContainerStyle={[
                    currentStyles.listContent,
                    displayMode === 'SNAP' && { paddingHorizontal: 16 }
                ]}
                ListHeaderComponent={displayMode === 'LIST' ? <View style={{ height: 16 }} /> : null}
            />
        </ViewWrapper >
    );
};

const layoutStyles = StyleSheet.create({
    fullWidth: {
        width: '100%',
        paddingHorizontal: 16,
    },
    halfWidth: {
        width: '50%',
        paddingHorizontal: 8,
    },
    snapItem: {
        marginRight: 16,
        paddingTop: 16,
    }
});

const genStyles = (colors: any, isDark: boolean) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    header: {
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider,
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
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    title: {
        fontSize: 10,
        fontWeight: '900',
        color: colors.accentPrimary,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    subtitle: {
        fontSize: 8,
        color: colors.textMuted,
        letterSpacing: 2,
        fontWeight: 'bold',
    },
    layoutBtn: {
        padding: 8,
        backgroundColor: colors.glassBg,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: colors.glassBorder,
    },
    headerActions: {
        flexDirection: 'row',
        gap: 8,
    },
    listContent: {
        paddingBottom: 40,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'flex-end',
    },
    modalBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    modalContent: {
        maxHeight: '80%',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderWidth: 1,
        padding: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    viewToggle: {
        flexDirection: 'row',
        backgroundColor: colors.uiMuted + '20',
        borderRadius: 20,
        padding: 2,
    },
    toggleBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 18,
    },
    toggleText: {
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 1,
    },
    menuList: {
        flex: 1,
    },
    menuBlock: {
        marginBottom: 24,
    },
    blockHeader: {
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider,
        paddingBottom: 8,
        marginBottom: 12,
    },
    blockTitle: {
        fontSize: 10,
        fontWeight: '900',
        color: colors.accentPrimary,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    themeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    themeChip: {
        backgroundColor: colors.uiMuted + '15',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 4,
    },
    themeChipText: {
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    pillarHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider,
        paddingBottom: 8,
        marginBottom: 12,
    },
    pillarTitle: {
        fontSize: 10,
        fontWeight: '900',
        color: colors.accentPrimary,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    pillarInnerBlock: {
        marginLeft: 12,
        marginBottom: 16,
    },
    innerBlockTitle: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
    }
});

const styles = (colors: any, isDark: boolean) => genStyles(colors, isDark);

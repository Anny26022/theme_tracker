import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ScrollView } from 'react-native';
import { TrackerRow } from '../components/TrackerRow';
import { useUnifiedTracker } from '../hooks/useUnifiedTracker';
import { useMarketData } from '../hooks/useMarketData';
import { ViewWrapper } from '../components/ViewWrapper';
import { useTheme } from '../contexts/ThemeContext';
import { MACRO_PILLARS, THEMATIC_MAP } from '@core/market/thematicMap';
import { UniverseLoader } from '../components/UniverseLoader';

type TrackerViewProps = {
    onSectorClick: (sector: string) => void;
    onIndustryClick: (sector: string, industry: string) => void;
};

export const TrackerView = ({ onSectorClick, onIndustryClick }: TrackerViewProps) => {
    const { colors } = useTheme();
    const { hierarchy } = useMarketData();
    const sectors = useMemo(() => Object.keys(hierarchy).sort(), [hierarchy]);
    const [timeframe, setTimeframe] = React.useState('1M');
    const [viewMode, setViewMode] = React.useState<'performance' | 'breadth'>('performance');
    const [trackingType, setTrackingType] = React.useState<'INDUSTRY' | 'THEMATIC'>('INDUSTRY');

    const INTERVALS = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX'];
    const RANGE_TO_EMA: any = {
        '1D': 'above10EMA', '5D': 'above10EMA', '1M': 'above21EMA', '3M': 'above50EMA',
        '6M': 'above50EMA', 'YTD': 'above150EMA', '1Y': 'above150EMA', '5Y': 'above200EMA', 'MAX': 'above200EMA'
    };
    const activeEMAKey = RANGE_TO_EMA[timeframe] || 'above200EMA';

    const allIndustries = useMemo(() => {
        const seen = new Set();
        const industries: { name: string, sector: string }[] = [];
        sectors.forEach(sector => {
            const sectorData = hierarchy[sector] || {};
            Object.keys(sectorData).forEach(ind => {
                if (!seen.has(ind)) {
                    seen.add(ind);
                    industries.push({ name: ind, sector });
                }
            });
        });
        return industries.sort((a, b) => a.name.localeCompare(b.name));
    }, [sectors, hierarchy]);

    const industryNames = useMemo(() => allIndustries.map(i => i.name), [allIndustries]);

    const allThemes = useMemo(() => {
        const themes: string[] = [];
        THEMATIC_MAP.forEach(block => {
            block.themes.forEach(theme => themes.push(theme.name));
        });
        return themes;
    }, []);

    const { trackerMap: sectorData, loading: sectorLoading } = useUnifiedTracker(
        sectors, hierarchy, timeframe, 'sector'
    );
    const { trackerMap: industryData, loading: industryLoading } = useUnifiedTracker(
        industryNames, hierarchy, timeframe, 'industry'
    );
    const { trackerMap: thematicData, loading: thematicLoading } = useUnifiedTracker(
        allThemes, hierarchy, timeframe, 'thematic'
    );

    const macroPillarNames = useMemo(() => MACRO_PILLARS.map(p => p.title), []);
    const { trackerMap: macroData, loading: macroLoading } = useUnifiedTracker(
        macroPillarNames, hierarchy, timeframe, 'thematic'
    );

    const sortedSectors = useMemo(() => {
        return [...sectors].sort((a, b) => {
            if (viewMode === 'breadth') {
                return ((sectorData[b]?.breadth as any)?.[activeEMAKey] || 0) - ((sectorData[a]?.breadth as any)?.[activeEMAKey] || 0);
            }
            return (sectorData[b]?.avgPerf || 0) - (sectorData[a]?.avgPerf || 0);
        });
    }, [sectors, sectorData, viewMode, activeEMAKey]);

    const sortedIndustries = useMemo(() => {
        return [...allIndustries].sort((a, b) => {
            if (viewMode === 'breadth') {
                return ((industryData[b.name]?.breadth as any)?.[activeEMAKey] || 0) - ((industryData[a.name]?.breadth as any)?.[activeEMAKey] || 0);
            }
            return (industryData[b.name]?.avgPerf || 0) - (industryData[a.name]?.avgPerf || 0);
        });
    }, [allIndustries, industryData, viewMode, activeEMAKey]);

    const sortedMacros = useMemo(() => {
        return [...macroPillarNames].sort((a, b) => {
            if (viewMode === 'breadth') {
                return ((macroData[b]?.breadth as any)?.[activeEMAKey] || 0) - ((macroData[a]?.breadth as any)?.[activeEMAKey] || 0);
            }
            return (macroData[b]?.avgPerf || 0) - (macroData[a]?.avgPerf || 0);
        });
    }, [macroPillarNames, macroData, viewMode, activeEMAKey]);

    const sortedThemes = useMemo(() => {
        return [...allThemes].sort((a, b) => {
            if (viewMode === 'breadth') {
                return ((thematicData[b]?.breadth as any)?.[activeEMAKey] || 0) - ((thematicData[a]?.breadth as any)?.[activeEMAKey] || 0);
            }
            return (thematicData[b]?.avgPerf || 0) - (thematicData[a]?.avgPerf || 0);
        });
    }, [allThemes, thematicData, viewMode, activeEMAKey]);

    const isGlobalLoading = sectorLoading || industryLoading || macroLoading || thematicLoading;
    const currentStyles = styles(colors);
    const columnData = useMemo(
        () => trackingType === 'INDUSTRY' ? [
            { key: 'sectors', title: 'SECTOR MOMENTUM' },
            { key: 'industries', title: 'INDUSTRY ALPHA' },
        ] : [
            { key: 'macros', title: 'MACRO PILLARS' },
            { key: 'themes', title: 'THEMATIC CLUSTERS' },
        ],
        [trackingType]
    );

    return (
        <ViewWrapper style={currentStyles.container}>
            {isGlobalLoading && <UniverseLoader />}
            <View style={currentStyles.header}>
                <View style={currentStyles.headerTop}>
                    <Text style={currentStyles.title}>TRACKER</Text>
                    <View style={currentStyles.modeToggle}>
                        <Pressable
                            onPress={() => setViewMode('performance')}
                            style={[currentStyles.modeBtn, viewMode === 'performance' && currentStyles.modeBtnActive]}
                        >
                            <Text style={[currentStyles.modeText, viewMode === 'performance' && currentStyles.modeTextActive]}>PERF</Text>
                        </Pressable>
                        <Pressable
                            onPress={() => setViewMode('breadth')}
                            style={[currentStyles.modeBtn, viewMode === 'breadth' && currentStyles.modeBtnActive]}
                        >
                            <Text style={[currentStyles.modeText, viewMode === 'breadth' && currentStyles.modeTextActive]}>BRTH</Text>
                        </Pressable>
                    </View>
                    <View style={[currentStyles.modeToggle, { marginLeft: 8 }]}>
                        <Pressable
                            onPress={() => setTrackingType('INDUSTRY')}
                            style={[currentStyles.modeBtn, trackingType === 'INDUSTRY' && currentStyles.modeBtnActive]}
                        >
                            <Text style={[currentStyles.modeText, trackingType === 'INDUSTRY' && currentStyles.modeTextActive]}>IND</Text>
                        </Pressable>
                        <Pressable
                            onPress={() => setTrackingType('THEMATIC')}
                            style={[currentStyles.modeBtn, trackingType === 'THEMATIC' && currentStyles.modeBtnActive]}
                        >
                            <Text style={[currentStyles.modeText, trackingType === 'THEMATIC' && currentStyles.modeTextActive]}>THEME</Text>
                        </Pressable>
                    </View>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={currentStyles.intervalBar}>
                    {INTERVALS.map(tf => (
                        <Pressable
                            key={tf}
                            onPress={() => setTimeframe(tf)}
                            style={[currentStyles.intervalBtn, timeframe === tf && currentStyles.intervalBtnActive]}
                        >
                            <Text style={[currentStyles.intervalText, timeframe === tf && currentStyles.intervalTextActive]}>{tf}</Text>
                        </Pressable>
                    ))}
                </ScrollView>

                <Text style={currentStyles.subtitle}>
                    {isGlobalLoading ? 'SYNCING METRICS...' : viewMode === 'performance' ? 'Real-time Momentum Metrics' : 'Technical Breadth & Health'}
                </Text>
            </View>

            <FlatList
                horizontal
                data={columnData}
                contentInsetAdjustmentBehavior="automatic"
                keyExtractor={(item) => item.key}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => {
                    const isSectorColumn = item.key === 'sectors';
                    return (
                        <View style={currentStyles.column}>
                            <View style={currentStyles.columnHeader}>
                                <View style={currentStyles.columnIndicator} />
                                <Text style={currentStyles.columnTitle}>{item.title}</Text>
                            </View>
                            <FlatList
                                data={item.key === 'macros' ? sortedMacros : (isSectorColumn ? sortedSectors : sortedIndustries)}
                                contentInsetAdjustmentBehavior="automatic"
                                keyExtractor={(row: any) => (typeof row === 'string' ? row : row.name)}
                                renderItem={({ item: row }: any) => {
                                    if (item.key === 'macros') {
                                        return (
                                            <TrackerRow
                                                name={row}
                                                perf={viewMode === 'breadth' ? ((macroData[row]?.breadth as any)?.[activeEMAKey] ?? null) : (macroData[row]?.avgPerf ?? null)}
                                                leaders={macroData[row]?.leaders}
                                                laggards={macroData[row]?.laggards}
                                                breadth={macroData[row]?.breadth}
                                                onClick={() => { }} // Macro pill click not handled yet
                                                loading={isGlobalLoading && !macroData[row]}
                                            />
                                        );
                                    }
                                    if (item.key === 'themes') {
                                        return (
                                            <TrackerRow
                                                name={row}
                                                perf={viewMode === 'breadth' ? ((thematicData[row]?.breadth as any)?.[activeEMAKey] ?? null) : (thematicData[row]?.avgPerf ?? null)}
                                                leaders={thematicData[row]?.leaders}
                                                laggards={thematicData[row]?.laggards}
                                                breadth={thematicData[row]?.breadth}
                                                onClick={() => { }} // Theme click handled similarly to industry if needed
                                                loading={isGlobalLoading && !thematicData[row]}
                                            />
                                        );
                                    }
                                    return isSectorColumn ? (
                                        <TrackerRow
                                            name={row}
                                            perf={viewMode === 'breadth' ? ((sectorData[row]?.breadth as any)?.[activeEMAKey] ?? null) : (sectorData[row]?.avgPerf ?? null)}
                                            leaders={sectorData[row]?.leaders}
                                            laggards={sectorData[row]?.laggards}
                                            breadth={sectorData[row]?.breadth}
                                            onClick={() => onSectorClick(row)}
                                            loading={isGlobalLoading && !sectorData[row]}
                                        />
                                    ) : (
                                        <TrackerRow
                                            name={row.name}
                                            perf={viewMode === 'breadth' ? ((industryData[row.name]?.breadth as any)?.[activeEMAKey] ?? null) : (industryData[row.name]?.avgPerf ?? null)}
                                            leaders={industryData[row.name]?.leaders}
                                            laggards={industryData[row.name]?.laggards}
                                            breadth={industryData[row.name]?.breadth}
                                            onClick={() => onIndustryClick(row.sector, row.name)}
                                            loading={isGlobalLoading && !industryData[row.name]}
                                        />
                                    );
                                }}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={currentStyles.columnListContent}
                            />
                        </View>
                    );
                }}
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
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider,
    },
    title: {
        fontSize: 20,
        fontWeight: '300',
        color: colors.accentPrimary,
        letterSpacing: 8,
    },
    subtitle: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.accentPrimary,
        letterSpacing: 2,
        marginTop: 12,
        textTransform: 'uppercase',
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    modeToggle: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 8,
        padding: 2,
    },
    modeBtn: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    modeBtnActive: {
        backgroundColor: colors.accentPrimary,
    },
    modeText: {
        fontSize: 7,
        fontWeight: '900',
        color: colors.textMuted,
        letterSpacing: 1,
    },
    modeTextActive: {
        color: '#000',
    },
    intervalBar: {
        flexGrow: 0,
        marginBottom: 4,
    },
    intervalBtn: {
        marginRight: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.uiDivider,
    },
    intervalBtnActive: {
        backgroundColor: colors.accentPrimary + '20',
        borderColor: colors.accentPrimary,
    },
    intervalText: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.textMuted,
    },
    intervalTextActive: {
        color: colors.accentPrimary,
    },
    column: {
        width: 320,
        paddingHorizontal: 4,
    },
    columnListContent: {
        paddingBottom: 24,
    },
    columnHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider,
    },
    columnIndicator: {
        width: 2,
        height: 12,
        backgroundColor: colors.accentPrimary,
    },
    columnTitle: {
        fontSize: 10,
        fontWeight: '700',
        color: colors.textMuted,
        letterSpacing: 2,
    }
});

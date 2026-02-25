import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { TrackerRow } from '../components/TrackerRow';
import { useUnifiedTracker } from '../hooks/useUnifiedTracker';
import { useMarketData } from '../hooks/useMarketData';
import { ViewWrapper } from '../components/ViewWrapper';
import { useTheme } from '../contexts/ThemeContext';

type TrackerViewProps = {
    onSectorClick: (sector: string) => void;
    onIndustryClick: (sector: string, industry: string) => void;
};

export const TrackerView = ({ onSectorClick, onIndustryClick }: TrackerViewProps) => {
    const { colors } = useTheme();
    const { hierarchy } = useMarketData();
    const sectors = useMemo(() => Object.keys(hierarchy).sort(), [hierarchy]);
    const timeframe = '1M';

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

    const { trackerMap: sectorData, loading: sectorLoading } = useUnifiedTracker(
        sectors, hierarchy, timeframe, 'sector'
    );
    const { trackerMap: industryData, loading: industryLoading } = useUnifiedTracker(
        industryNames, hierarchy, timeframe, 'industry'
    );

    const sortedSectors = useMemo(() => {
        return [...sectors].sort((a, b) => (sectorData[b]?.avgPerf || 0) - (sectorData[a]?.avgPerf || 0));
    }, [sectors, sectorData]);

    const sortedIndustries = useMemo(() => {
        return [...allIndustries].sort((a, b) => (industryData[b.name]?.avgPerf || 0) - (industryData[a.name]?.avgPerf || 0));
    }, [allIndustries, industryData]);

    const isGlobalLoading = sectorLoading || industryLoading;
    const currentStyles = styles(colors);
    const columnData = useMemo(
        () => [
            { key: 'sectors', title: 'SECTOR RANKINGS' },
            { key: 'industries', title: 'INDUSTRY ALPHA' },
        ],
        []
    );

    return (
        <ViewWrapper style={currentStyles.container}>
            <View style={currentStyles.header}>
                <Text style={currentStyles.title}>TRACKER</Text>
                <Text style={currentStyles.subtitle}>
                    {isGlobalLoading ? 'LOADING METRICS...' : 'Sector & Industry Momentum'}
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
                                data={isSectorColumn ? sortedSectors : sortedIndustries}
                                contentInsetAdjustmentBehavior="automatic"
                                keyExtractor={(row: any) => (isSectorColumn ? row : row.name)}
                                renderItem={({ item: row }: any) =>
                                    isSectorColumn ? (
                                        <TrackerRow
                                            name={row}
                                            perf={sectorData[row]?.avgPerf ?? null}
                                            leaders={sectorData[row]?.leaders}
                                            laggards={sectorData[row]?.laggards}
                                            breadth={sectorData[row]?.breadth}
                                            onClick={() => onSectorClick(row)}
                                            loading={isGlobalLoading && !sectorData[row]}
                                        />
                                    ) : (
                                        <TrackerRow
                                            name={row.name}
                                            perf={industryData[row.name]?.avgPerf ?? null}
                                            leaders={industryData[row.name]?.leaders}
                                            laggards={industryData[row.name]?.laggards}
                                            breadth={industryData[row.name]?.breadth}
                                            onClick={() => onIndustryClick(row.sector, row.name)}
                                            loading={isGlobalLoading && !industryData[row.name]}
                                        />
                                    )
                                }
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
        fontSize: 9,
        fontWeight: '700',
        color: colors.accentPrimary,
        letterSpacing: 2,
        marginTop: 4,
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

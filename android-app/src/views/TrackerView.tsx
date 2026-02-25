import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { TrackerRow } from '../components/TrackerRow';
import { useUnifiedTracker } from '../hooks/useUnifiedTracker';
import { useMarketData } from '../hooks/useMarketData';
import { ViewWrapper } from '../components/ViewWrapper';

interface TrackerViewProps {
    onSectorClick: (sector: string) => void;
    onIndustryClick: (sector: string, industry: string) => void;
}

import { useTheme } from '../contexts/ThemeContext';

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

    return (
        <ViewWrapper style={currentStyles.container}>
            <View style={currentStyles.header}>
                <Text style={currentStyles.title}>TRACKER</Text>
                <Text style={currentStyles.subtitle}>
                    {isGlobalLoading ? 'LOADING METRICS...' : 'Sector & Industry Momentum'}
                </Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={currentStyles.columnsContainer}>
                    {/* SECTORS COLUMN */}
                    <View style={currentStyles.column}>
                        <View style={currentStyles.columnHeader}>
                            <View style={currentStyles.columnIndicator} />
                            <Text style={currentStyles.columnTitle}>SECTOR RANKINGS</Text>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {sortedSectors.map(sector => (
                                <TrackerRow
                                    key={sector}
                                    name={sector}
                                    perf={sectorData[sector]?.avgPerf ?? null}
                                    leaders={sectorData[sector]?.leaders}
                                    laggards={sectorData[sector]?.laggards}
                                    breadth={sectorData[sector]?.breadth}
                                    onClick={() => onSectorClick(sector)}
                                    loading={isGlobalLoading && !sectorData[sector]}
                                />
                            ))}
                        </ScrollView>
                    </View>

                    {/* INDUSTRIES COLUMN */}
                    <View style={currentStyles.column}>
                        <View style={currentStyles.columnHeader}>
                            <View style={currentStyles.columnIndicator} />
                            <Text style={currentStyles.columnTitle}>INDUSTRY ALPHA</Text>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {sortedIndustries.map(ind => (
                                <TrackerRow
                                    key={ind.name}
                                    name={ind.name}
                                    perf={industryData[ind.name]?.avgPerf ?? null}
                                    leaders={industryData[ind.name]?.leaders}
                                    laggards={industryData[ind.name]?.laggards}
                                    breadth={industryData[ind.name]?.breadth}
                                    onClick={() => onIndustryClick(ind.sector, ind.name)}
                                    loading={isGlobalLoading && !industryData[ind.name]}
                                />
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </ScrollView>
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
    columnsContainer: {
        flexDirection: 'row',
    },
    column: {
        width: 320,
        paddingHorizontal: 4,
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

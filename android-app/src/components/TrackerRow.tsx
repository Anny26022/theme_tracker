import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

type TrackerRowProps = {
    name: string;
    perf: number | null;
    onClick: () => void;
    loading?: boolean;
    leaders?: any[];
    laggards?: any[];
    breadth?: any;
};

const MoverRow = memo(({ item, isPos }: { item: any, isPos: boolean }) => (
    <View style={rowStyles.moverRow}>
        <View style={rowStyles.moverInfo}>
            <Text style={rowStyles.moverName} numberOfLines={1}>{item.name}</Text>
            <Text style={rowStyles.moverSymbol}>{item.symbol}</Text>
        </View>
        <Text style={[rowStyles.moverPerf, { color: isPos ? '#22c55e' : '#ef4444' }]}>
            {isPos ? '+' : ''}{item.perf?.toFixed(1) || '0.0'}%
        </Text>
    </View>
));

const BreadthItem = memo(({ label, value }: { label: string, value: number }) => (
    <View style={rowStyles.breadthItem}>
        <Text style={rowStyles.breadthItemLabel}>{label}</Text>
        <Text style={[
            rowStyles.breadthItemVal,
            { color: value > 70 ? '#22c55e' : value > 40 ? '#f59e0b' : '#ef4444' }
        ]}>
            {Math.round(value)}%
        </Text>
    </View>
));

export const TrackerRow = memo(({ name, perf, onClick, loading, leaders, laggards, breadth }: TrackerRowProps) => {
    const { colors, isDark } = useTheme();
    const [showInsights, setShowInsights] = React.useState(false);

    const hasData = perf !== null && perf !== undefined;
    const isPos = hasData && perf >= 0;
    const barWidth = hasData ? Math.min(Math.abs(perf) * 2, 45) : 0;

    const hasInsights = (leaders && leaders.length > 0) || (laggards && laggards.length > 0) || !!breadth;

    return (
        <View>
            <Pressable
                onPress={onClick}
                onLongPress={() => hasInsights && setShowInsights(true)}
                delayLongPress={350}
                style={({ pressed }) => [
                    rowStyles.row,
                    { borderBottomColor: colors.uiDivider },
                    (pressed || showInsights) && { backgroundColor: isDark ? 'rgba(197, 160, 89, 0.08)' : 'rgba(197, 160, 89, 0.12)' }
                ]}
            >
                <View style={rowStyles.nameContainer}>
                    <View style={[
                        rowStyles.indicator,
                        isPos ? { backgroundColor: colors.accentPrimary, shadowColor: colors.accentPrimary } : { backgroundColor: '#f43f5e' },
                        !hasData && { backgroundColor: colors.uiMuted },
                        isPos && rowStyles.indicatorGlow,
                        showInsights && { transform: [{ scale: 1.5 }], shadowOpacity: 0.8 }
                    ]} />
                    <Text
                        style={[rowStyles.nameText, { color: colors.textMuted }, showInsights && { color: colors.accentPrimary }]}
                        numberOfLines={1}
                    >
                        {name.toUpperCase()}
                    </Text>
                </View>

                <View style={rowStyles.chartArea}>
                    <View style={[rowStyles.centerLine, { backgroundColor: colors.uiDivider }]} />
                    <View style={[rowStyles.barContainer, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.05)' }]}>
                        {hasData && (
                            <View style={[
                                rowStyles.bar,
                                isPos ? { backgroundColor: colors.accentPrimary } : { backgroundColor: '#f43f5e' },
                                { width: `${barWidth}%`, [isPos ? 'left' : 'right']: '50%' },
                                showInsights && { opacity: 1 }
                            ]} />
                        )}
                    </View>
                </View>

                <View style={rowStyles.perfContainer}>
                    {loading ? (
                        <View style={[rowStyles.loadingPulse, { backgroundColor: colors.uiDivider }]} />
                    ) : (
                        <Text style={[
                            rowStyles.perfText,
                            isPos ? { color: colors.accentPrimary } : { color: '#f43f5e' },
                            !hasData && { color: colors.textMuted, opacity: 0.3 },
                            showInsights && { fontSize: 13 }
                        ]}>
                            {hasData ? `${isPos ? '+' : ''}${perf.toFixed(2)}%` : '—'}
                        </Text>
                    )}
                </View>
            </Pressable>

            {showInsights && (
                <View style={rowStyles.insightsOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowInsights(false)} />
                    <View style={[rowStyles.insightsCard, { backgroundColor: colors.bgMain, borderColor: colors.accentPrimary }]}>
                        <View style={[rowStyles.insightsHeader, { borderBottomColor: colors.uiDivider }]}>
                            <Text style={[rowStyles.insightsTitle, { color: colors.accentPrimary }]}>{name} INSIGHTS</Text>
                            <Pressable onPress={() => setShowInsights(false)}>
                                <Text style={{ color: colors.textMuted, fontSize: 10 }}>CLOSE</Text>
                            </Pressable>
                        </View>

                        <View style={rowStyles.moversContainer}>
                            {leaders && leaders.length > 0 && (
                                <View style={rowStyles.moversSection}>
                                    <View style={[rowStyles.moversHeader, { borderBottomColor: 'rgba(34, 197, 94, 0.2)' }]}>
                                        <View style={[rowStyles.moversDot, { backgroundColor: '#22c55e' }]} />
                                        <Text style={[rowStyles.moversHeaderText, { color: '#22c55e' }]}>LEADERS</Text>
                                    </View>
                                    <View style={rowStyles.moversList}>
                                        {leaders.slice(0, 4).map((l: any) => (
                                            <MoverRow key={l.symbol} item={l} isPos={true} />
                                        ))}
                                    </View>
                                </View>
                            )}

                            {laggards && laggards.length > 0 && (
                                <View style={rowStyles.moversSection}>
                                    <View style={[rowStyles.moversHeader, { borderBottomColor: 'rgba(239, 68, 68, 0.2)' }]}>
                                        <View style={[rowStyles.moversDot, { backgroundColor: '#ef4444' }]} />
                                        <Text style={[rowStyles.moversHeaderText, { color: '#ef4444' }]}>LAGGARDS</Text>
                                    </View>
                                    <View style={rowStyles.moversList}>
                                        {laggards.slice(0, 4).map((l: any) => (
                                            <MoverRow key={l.symbol} item={l} isPos={false} />
                                        ))}
                                    </View>
                                </View>
                            )}
                        </View>

                        {breadth && (
                            <View style={[rowStyles.breadthSection, { borderTopColor: colors.uiDivider }]}>
                                <Text style={[rowStyles.breadthLabel, { color: colors.textMuted }]}>TECHNICAL BREADTH (EMA)</Text>
                                <View style={rowStyles.breadthGrid}>
                                    <BreadthItem label="10" value={breadth.above10EMA} />
                                    <BreadthItem label="21" value={breadth.above21EMA} />
                                    <BreadthItem label="50" value={breadth.above50EMA} />
                                    <BreadthItem label="150" value={breadth.above150EMA} />
                                    <BreadthItem label="200" value={breadth.above200EMA} />
                                </View>
                            </View>
                        )}
                    </View>
                </View>
            )}
        </View>
    );
});

const rowStyles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        backgroundColor: 'transparent',
    },
    nameContainer: {
        width: '40%',
        flexDirection: 'row',
        alignItems: 'center',
    },
    indicator: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 10,
    },
    indicatorGlow: {
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
    },
    nameText: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.5,
        flex: 1,
    },
    chartArea: {
        flex: 1,
        height: 20,
        justifyContent: 'center',
        paddingHorizontal: 8,
    },
    centerLine: {
        position: 'absolute',
        left: '50%',
        width: 1,
        height: 12,
        opacity: 0.5,
    },
    barContainer: {
        width: '100%',
        height: 4,
        borderRadius: 2,
        overflow: 'hidden',
        position: 'relative',
    },
    bar: {
        height: '100%',
        position: 'absolute',
        borderRadius: 2,
        opacity: 0.6,
    },
    perfContainer: {
        width: 70,
        alignItems: 'flex-end',
    },
    perfText: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    loadingPulse: {
        width: 40,
        height: 10,
        borderRadius: 2,
    },
    insightsOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    insightsCard: {
        borderRadius: 8,
        padding: 16,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 20,
        gap: 16,
    },
    insightsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        paddingBottom: 8,
    },
    insightsTitle: {
        fontSize: 9,
        fontWeight: 'bold',
        letterSpacing: 3,
    },
    moversContainer: {
        flexDirection: 'row',
        gap: 12,
    },
    moversSection: {
        flex: 1,
        gap: 8,
    },
    moversHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderBottomWidth: 1,
        paddingBottom: 4,
    },
    moversDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
    },
    moversHeaderText: {
        fontSize: 8,
        fontWeight: 'bold',
        letterSpacing: 1.5,
    },
    moversList: {
        gap: 6,
    },
    moverRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    moverInfo: {
        flex: 1,
    },
    moverName: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#fff',
        opacity: 0.9,
    },
    moverSymbol: {
        fontSize: 7,
        color: 'rgba(255,255,255,0.4)',
        opacity: 0.6,
    },
    moverPerf: {
        fontSize: 9,
        fontWeight: 'bold',
        marginLeft: 4,
    },
    breadthSection: {
        borderTopWidth: 1,
        paddingTop: 12,
        gap: 8,
    },
    breadthLabel: {
        fontSize: 8,
        fontWeight: 'bold',
        letterSpacing: 1.5,
        opacity: 0.6,
    },
    breadthGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    breadthItem: {
        alignItems: 'center',
        gap: 2,
    },
    breadthItemLabel: {
        fontSize: 7,
        color: 'rgba(255,255,255,0.4)',
        fontWeight: 'bold',
    },
    breadthItemVal: {
        fontSize: 10,
        fontWeight: 'bold',
    },
});

import React from 'react';
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

export const TrackerRow = ({ name, perf, onClick, loading, leaders, laggards, breadth }: TrackerRowProps) => {
    const { colors, isDark } = useTheme();
    const [showInsights, setShowInsights] = React.useState(false);

    const hasData = perf !== null && perf !== undefined;
    const isPos = hasData && perf >= 0;
    const barWidth = hasData ? Math.min(Math.abs(perf) * 2, 50) : 0;
    const currentStyles = styles(colors, isDark);

    const hasInsights = (leaders && leaders.length > 0) || (laggards && laggards.length > 0) || !!breadth;

    return (
        <View>
            <Pressable
                onPress={onClick}
                onLongPress={() => hasInsights && setShowInsights(true)}
                delayLongPress={300}
                style={({ pressed }) => [
                    currentStyles.row,
                    (pressed || showInsights) && currentStyles.rowPressed
                ]}
            >
                <View style={currentStyles.nameContainer}>
                    <View style={[
                        currentStyles.indicator,
                        isPos ? currentStyles.indicatorPos : currentStyles.indicatorNeg,
                        !hasData && currentStyles.indicatorMuted,
                        showInsights && { transform: [{ scale: 1.5 }], shadowOpacity: 0.8 }
                    ]} />
                    <Text
                        style={[currentStyles.nameText, showInsights && { color: colors.accentPrimary }]}
                        numberOfLines={1}
                    >
                        {name.toUpperCase()}
                    </Text>
                </View>

                <View style={currentStyles.chartArea}>
                    <View style={currentStyles.centerLine} />
                    <View style={currentStyles.barContainer}>
                        {hasData && (
                            <View style={[
                                currentStyles.bar,
                                isPos ? currentStyles.barPos : currentStyles.barNeg,
                                { width: `${barWidth}%`, [isPos ? 'left' : 'right']: '50%' },
                                showInsights && { opacity: 1 }
                            ]} />
                        )}
                    </View>
                </View>

                <View style={currentStyles.perfContainer}>
                    {loading ? (
                        <View style={currentStyles.loadingPulse} />
                    ) : hasData ? (
                        <Text style={[
                            currentStyles.perfText,
                            isPos ? currentStyles.textPos : currentStyles.textNeg,
                            showInsights && { fontSize: 13 }
                        ]}>
                            {isPos ? '+' : ''}{perf.toFixed(2)}%
                        </Text>
                    ) : (
                        <Text style={currentStyles.perfTextMuted}>—</Text>
                    )}
                </View>
            </Pressable>

            {/* INSIGHTS OVERLAY (PARITY WITH WEB HOVER) */}
            {showInsights && (
                <View style={currentStyles.insightsOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowInsights(false)} />
                    <View style={currentStyles.insightsCard}>
                        <View style={currentStyles.insightsHeader}>
                            <Text style={currentStyles.insightsTitle}>{name} INSIGHTS</Text>
                            <Pressable onPress={() => setShowInsights(false)}>
                                <Text style={{ color: colors.textMuted, fontSize: 10 }}>CLOSE</Text>
                            </Pressable>
                        </View>

                        <View style={currentStyles.moversContainer}>
                            {leaders && leaders.length > 0 && (
                                <View style={currentStyles.moversSection}>
                                    <View style={[currentStyles.moversHeader, { borderBottomColor: 'rgba(34, 197, 94, 0.2)' }]}>
                                        <View style={[currentStyles.moversDot, { backgroundColor: '#22c55e' }]} />
                                        <Text style={[currentStyles.moversHeaderText, { color: '#22c55e' }]}>LEADERS</Text>
                                    </View>
                                    <View style={currentStyles.moversList}>
                                        {leaders.slice(0, 4).map((l: any) => (
                                            <View key={l.symbol} style={currentStyles.moverRow}>
                                                <View style={currentStyles.moverInfo}>
                                                    <Text style={currentStyles.moverName} numberOfLines={1}>{l.name}</Text>
                                                    <Text style={currentStyles.moverSymbol}>{l.symbol}</Text>
                                                </View>
                                                <Text style={[currentStyles.moverPerf, { color: '#22c55e' }]}>
                                                    +{l.perf.toFixed(1)}%
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            )}

                            {laggards && laggards.length > 0 && (
                                <View style={currentStyles.moversSection}>
                                    <View style={[currentStyles.moversHeader, { borderBottomColor: 'rgba(239, 68, 68, 0.2)' }]}>
                                        <View style={[currentStyles.moversDot, { backgroundColor: '#ef4444' }]} />
                                        <Text style={[currentStyles.moversHeaderText, { color: '#ef4444' }]}>LAGGARDS</Text>
                                    </View>
                                    <View style={currentStyles.moversList}>
                                        {laggards.slice(0, 4).map((l: any) => (
                                            <View key={l.symbol} style={currentStyles.moverRow}>
                                                <View style={currentStyles.moverInfo}>
                                                    <Text style={currentStyles.moverName} numberOfLines={1}>{l.name}</Text>
                                                    <Text style={currentStyles.moverSymbol}>{l.symbol}</Text>
                                                </View>
                                                <Text style={[currentStyles.moverPerf, { color: '#ef4444' }]}>
                                                    {l.perf.toFixed(1)}%
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            )}
                        </View>

                        {breadth && (
                            <View style={currentStyles.breadthSection}>
                                <Text style={currentStyles.breadthLabel}>TECHNICAL BREADTH (EMA)</Text>
                                <View style={currentStyles.breadthGrid}>
                                    {[
                                        { l: '10', v: breadth.above10EMA },
                                        { l: '21', v: breadth.above21EMA },
                                        { l: '50', v: breadth.above50EMA },
                                        { l: '150', v: breadth.above150EMA },
                                        { l: '200', v: breadth.above200EMA },
                                    ].map(it => (
                                        <View key={it.l} style={currentStyles.breadthItem}>
                                            <Text style={currentStyles.breadthItemLabel}>{it.l}</Text>
                                            <Text style={[
                                                currentStyles.breadthItemVal,
                                                { color: it.v > 70 ? '#22c55e' : it.v > 40 ? '#f59e0b' : '#ef4444' }
                                            ]}>
                                                {Math.round(it.v)}%
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                    </View>
                </View>
            )}
        </View>
    );
};

const styles = (colors: any, isDark: boolean) => StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider,
        backgroundColor: 'transparent',
    },
    rowPressed: {
        backgroundColor: isDark ? 'rgba(197, 160, 89, 0.08)' : 'rgba(197, 160, 89, 0.12)',
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
    indicatorPos: {
        backgroundColor: colors.accentPrimary,
        shadowColor: colors.accentPrimary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
    },
    indicatorNeg: {
        backgroundColor: '#f43f5e',
    },
    indicatorMuted: {
        backgroundColor: colors.uiMuted,
    },
    nameText: {
        color: colors.textMuted,
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
        backgroundColor: colors.uiDivider,
        opacity: 0.5,
    },
    barContainer: {
        width: '100%',
        height: 4,
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.05)',
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
    barPos: {
        backgroundColor: colors.accentPrimary,
    },
    barNeg: {
        backgroundColor: '#f43f5e',
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
    perfTextMuted: {
        color: colors.textMuted,
        fontSize: 10,
        opacity: 0.3,
    },
    textPos: {
        color: colors.accentPrimary,
    },
    textNeg: {
        color: '#f43f5e',
    },
    loadingPulse: {
        width: 40,
        height: 10,
        backgroundColor: colors.uiDivider,
        borderRadius: 2,
    },
    // ─── Insights Overlay Styles ────────────────────────────────
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
        backgroundColor: colors.bgMain,
        borderRadius: 8,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.accentPrimary,
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
        borderBottomColor: colors.uiDivider,
        paddingBottom: 8,
    },
    insightsTitle: {
        fontSize: 9,
        fontWeight: 'bold',
        color: colors.accentPrimary,
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
        color: colors.textMain,
        opacity: 0.9,
    },
    moverSymbol: {
        fontSize: 7,
        color: colors.textMuted,
        opacity: 0.6,
    },
    moverPerf: {
        fontSize: 9,
        fontWeight: 'bold',
        marginLeft: 4,
    },
    breadthSection: {
        borderTopWidth: 1,
        borderTopColor: colors.uiDivider,
        paddingTop: 12,
        gap: 8,
    },
    breadthLabel: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.textMuted,
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
        color: colors.textMuted,
        fontWeight: 'bold',
    },
    breadthItemVal: {
        fontSize: 10,
        fontWeight: 'bold',
    },
});

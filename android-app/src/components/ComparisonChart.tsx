import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import Svg, { Path, Line, Circle, G } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';
const COLORS = [
    '#3b82f6', // blue
    '#f97316', // orange
    '#eab308', // gold
    '#ec4899', // pink
    '#10b981', // green
    '#8b5cf6', // violet
    '#06b6d4', // cyan
];

interface ComparisonChartProps {
    data: Map<string, any[]>;
    symbols: string[];
    labels?: Map<string, string>;
    interval: string;
    height?: number;
}

function findClosestIndex(points: any[], targetX: number) {
    if (!points || points.length === 0) return null;
    let low = 0;
    let high = points.length - 1;

    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (targetX < points[mid].time) {
            high = mid;
        } else {
            low = mid + 1;
        }
    }

    if (low > 0 && Math.abs(points[low].time - targetX) > Math.abs(points[low - 1].time - targetX)) {
        return low - 1;
    }
    return low;
}

export const ComparisonChart = ({ data, symbols, labels = new Map(), interval, height = 300 }: ComparisonChartProps) => {
    const { colors } = useTheme();
    const { width } = useWindowDimensions();
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const chartWidth = width - 32; // Container margin

    // 1. Process series
    const seriesList = useMemo(() => {
        return symbols.map((sym, idx) => {
            const points = data.get(sym) || [];
            return {
                symbol: sym,
                color: COLORS[idx % COLORS.length],
                points
            };
        }).filter(s => s.points.length > 0);
    }, [data, symbols]);

    // 2. Bounds
    const bounds = useMemo(() => {
        if (seriesList.length === 0) return null;

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        seriesList.forEach(s => {
            s.points.forEach(p => {
                if (p.time < minX) minX = p.time;
                if (p.time > maxX) maxX = p.time;
                if (p.value < minY) minY = p.value;
                if (p.value > maxY) maxY = p.value;
            });
        });

        const range = maxY - minY;
        const padding = range === 0 ? 1 : range * 0.15;

        return {
            minX, maxX,
            minY: minY - padding,
            maxY: maxY + padding
        };
    }, [seriesList]);

    const { minX, maxX, minY, maxY } = bounds || { minX: 0, maxX: 0, minY: 0, maxY: 0 };

    const getX = useCallback((time: number) => maxX === minX ? 0 : ((time - minX) / (maxX - minX)) * chartWidth, [minX, maxX, chartWidth]);
    const getY = useCallback((val: number) => maxY === minY ? height / 2 : height - ((val - minY) / (maxY - minY)) * height, [minY, maxY, height]);

    const paths = useMemo(() => {
        return seriesList.map(s => {
            return s.points.map((p, i) =>
                `${i === 0 ? 'M' : 'L'} ${getX(p.time)} ${getY(p.value)}`
            ).join(' ');
        });
    }, [seriesList, getX, getY]);

    const gridY = useMemo(() => ([
        { id: 'min', value: minY },
        { id: 'mid', value: (minY + maxY) / 2 },
        { id: 'max', value: maxY }
    ]), [minY, maxY]);

    const handleTouch = (evt: any) => {
        const x = evt.nativeEvent.locationX;
        const pct = Math.max(0, Math.min(1, x / chartWidth));
        const targetTime = minX + pct * (maxX - minX);
        const closest = findClosestIndex(seriesList[0].points, targetTime);
        if (closest !== hoverIndex) setHoverIndex(closest);
    };

    if (!bounds || seriesList.length === 0) return null;

    const currentPoint = hoverIndex !== null ? seriesList[0].points[hoverIndex] : null;

    return (
        <View style={[styles.container, { height }]}>
            {/* Tooltip Overlay */}
            {hoverIndex !== null && (
                <View style={[styles.tooltip, {
                    left: Math.max(10, Math.min(chartWidth - 190, getX(seriesList[0].points[hoverIndex].time) - 100)),
                    backgroundColor: colors.bgMain + 'F2'
                }]}>
                    <Text style={styles.tooltipTime}>
                        {new Date(seriesList[0].points[hoverIndex].time).toLocaleDateString()} {new Date(seriesList[0].points[hoverIndex].time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <View style={styles.tooltipContent}>
                        {seriesList.map((s, idx) => {
                            const val = s.points[hoverIndex]?.value ?? 0;
                            return (
                                <View key={s.symbol} style={styles.tooltipRow}>
                                    <View style={[styles.dot, { backgroundColor: s.color }]} />
                                    <Text style={[styles.symText, { color: colors.textMain }]}>{labels.get(s.symbol) || s.symbol}</Text>
                                    <Text style={[styles.valText, { color: val >= 0 ? '#10b981' : '#f43f5e' }]}>
                                        {val >= 0 ? '+' : ''}{val.toFixed(2)}%
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                </View>
            )}

            <Pressable
                onPressIn={handleTouch}
                onPressOut={() => setHoverIndex(null)}
                onLongPress={handleTouch}
                style={{ width: chartWidth, height }}
            >
                <Svg width={chartWidth} height={height} style={styles.svg}>
                    {/* Grid Lines */}
                    <Line x1="0" y1={getY(0)} x2={chartWidth} y2={getY(0)} stroke={colors.uiDivider} strokeWidth="1" strokeDasharray="5,5" opacity={0.3} />
                    {gridY.map(l => (
                        <Line key={l.id} x1="0" y1={getY(l.value)} x2={chartWidth} y2={getY(l.value)} stroke={colors.uiDivider} strokeWidth="0.5" opacity={0.1} />
                    ))}

                    {/* Cursor Line */}
                    {hoverIndex !== null && currentPoint && (
                        <Line
                            x1={getX(currentPoint.time)} y1="0"
                            x2={getX(currentPoint.time)} y2={height}
                            stroke={colors.accentPrimary} strokeWidth="1" strokeDasharray="4,4" opacity={0.5}
                        />
                    )}

                    {/* Chart Paths */}
                    {seriesList.map((s, idx) => (
                        <G key={s.symbol}>
                            <Path
                                d={paths[idx]}
                                fill="none"
                                stroke={s.color}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            {/* Terminal Point */}
                            <Circle
                                cx={getX(s.points[s.points.length - 1].time)}
                                cy={getY(s.points[s.points.length - 1].value)}
                                r="3"
                                fill={s.color}
                            />
                            {/* Hover Dot */}
                            {hoverIndex !== null && s.points[hoverIndex] && (
                                <Circle
                                    cx={getX(s.points[hoverIndex].time)}
                                    cy={getY(s.points[hoverIndex].value)}
                                    r="4"
                                    fill={s.color}
                                    stroke="white"
                                    strokeWidth="1"
                                />
                            )}
                        </G>
                    ))}
                </Svg>
            </Pressable>

            {/* Y-Axis Labels */}
            <View style={styles.yAxis}>
                {gridY.map(l => (
                    <Text key={l.id} style={[styles.axisText, { top: getY(l.value) - 6 }]}>
                        {l.value > 0 ? '+' : ''}{l.value.toFixed(1)}%
                    </Text>
                ))}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        position: 'relative',
    },
    svg: {
        overflow: 'visible',
    },
    yAxis: {
        position: 'absolute',
        left: 4,
        top: 0,
        bottom: 0,
        pointerEvents: 'none',
    },
    axisText: {
        position: 'absolute',
        fontSize: 8,
        color: 'rgba(255,255,255,0.4)',
        fontWeight: 'bold',
        fontFamily: 'monospace',
    },
    tooltip: {
        position: 'absolute',
        top: -10,
        width: 200,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        zIndex: 100,
        elevation: 10,
    },
    tooltipTime: {
        fontSize: 8,
        color: 'rgba(255,255,255,0.5)',
        fontWeight: 'bold',
        marginBottom: 8,
    },
    tooltipContent: {
        gap: 4,
    },
    tooltipRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    dot: {
        width: 4,
        height: 4,
        borderRadius: 2,
    },
    symText: {
        flex: 1,
        fontSize: 9,
        fontWeight: 'bold',
    },
    valText: {
        fontSize: 9,
        fontWeight: 'bold',
        fontFamily: 'monospace',
    }
});

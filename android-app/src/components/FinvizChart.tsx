import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, useWindowDimensions, PanResponder } from 'react-native';
import Svg, { Path, Rect, G, LinearGradient, Stop, Defs } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';
import { cleanSymbol, getCachedComparisonSeries } from '../services/priceService';
import { useMarketDataRegistry, useChartVersion } from '../contexts/MarketDataContext';
import { ZoomIn, ZoomOut, Maximize2, ExternalLink } from 'lucide-react-native';
import { ScrollView } from 'react-native-gesture-handler';

interface FinvizChartProps {
    symbol: string;
    name?: string;
    height?: number;
    initialTimeframe?: string;
    chartStyle?: 'candles' | 'heikin' | 'area' | 'line' | 'bars' | 'hollow' | 'white';
    onExpand?: (params: any) => void;
    disabled?: boolean;
}

const buildSmaSeries = (values: number[], period: number) => {
    if (!values?.length) return [];
    const result = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        sum += values[i];
        if (i >= period) sum -= values[i - period];
        if (i >= period - 1) result[i] = sum / period;
    }
    return result;
};

export const FinvizChart = React.memo(({
    symbol,
    name,
    height = 200,
    initialTimeframe = '1M',
    chartStyle = 'candles',
    onExpand,
    disabled = false
}: FinvizChartProps) => {
    const { colors, isDark } = useTheme();
    const { width: windowWidth } = useWindowDimensions();
    const chartWidth = windowWidth - 32; // Default padding
    const [timeframe, setTimeframe] = useState(initialTimeframe);
    const [zoomPoints, setZoomPoints] = useState(100);
    const [panOffset, setPanOffset] = useState(0);
    const [activeStyle, setActiveStyle] = useState(chartStyle);

    const STYLES = ['candles', 'hollow', 'heikin', 'white', 'bars', 'line', 'area'];

    const cleaned = useMemo(() => cleanSymbol(symbol), [symbol]);
    const { subscribeChartSymbols } = useMarketDataRegistry();
    const chartVersion = useChartVersion();

    useEffect(() => {
        if (!cleaned) return;
        // In mobile, we just subscribe to the requested interval or 1Y for metrics
        const interval = timeframe === '1D' ? '1Y' : 'MAX';
        return subscribeChartSymbols(interval, [cleaned]);
    }, [cleaned, timeframe, subscribeChartSymbols]);

    const activeSeries = useMemo(() => {
        const interval = timeframe === '1D' ? '1Y' : 'MAX';
        const cached = getCachedComparisonSeries(cleaned, interval);
        return cached || [];
    }, [cleaned, timeframe, chartVersion]);

    const baseData = useMemo(() => {
        if (!activeSeries || activeSeries.length === 0) return null;
        let ordered = [...activeSeries].sort((a, b) => a.time - b.time);

        // Simple aggregation for weekly/monthly if needed
        if (timeframe !== '1D' && timeframe !== '1M' && timeframe !== '1Y') {
            // High-res aggregation logic can be added here if needed
        }

        const allPoints = ordered.filter(p => p.time > 0 && isFinite(p.close) && p.close > 0);
        if (allPoints.length < 2) return null;

        const allCloses = allPoints.map(p => p.close);
        const sma50Arr = buildSmaSeries(allCloses, 50);
        const sma200Arr = buildSmaSeries(allCloses, 200);

        return { allPoints, sma50Arr, sma200Arr, totalPoints: allPoints.length };
    }, [activeSeries, timeframe]);

    const data = useMemo(() => {
        if (!baseData) return null;
        const sliceCount = Math.min(zoomPoints, baseData.allPoints.length);
        const endIdx = Math.max(sliceCount, baseData.allPoints.length - panOffset);
        const startIdx = Math.max(0, endIdx - sliceCount);

        let points = baseData.allPoints.slice(startIdx, endIdx);
        const sma50 = baseData.sma50Arr.slice(startIdx, endIdx);
        const sma200 = baseData.sma200Arr.slice(startIdx, endIdx);

        // Heikin Ashi transformation
        if (chartStyle === 'heikin') {
            const haPoints: any[] = [];
            points.forEach((p, i) => {
                const close = (p.open + p.high + p.low + p.close) / 4;
                let open;
                if (i === 0) {
                    open = (p.open + p.close) / 2;
                } else {
                    const prev = haPoints[i - 1];
                    open = (prev.open + prev.close) / 2;
                }
                const high = Math.max(p.high, open, close);
                const low = Math.min(p.low, open, close);
                haPoints.push({ ...p, open, high, low, close });
            });
            points = haPoints;
        }

        let minP = Infinity, maxP = -Infinity, maxV = 0;
        points.forEach((p, i) => {
            if (p.low < minP) minP = p.low;
            if (p.high > maxP) maxP = p.high;
            if (p.volume > maxV) maxV = p.volume;
            if (sma50[i] && sma50[i] < minP) minP = sma50[i];
            if (sma50[i] && sma50[i] > maxP) maxP = sma50[i];
            if (sma200[i] && sma200[i] < minP) minP = sma200[i];
            if (sma200[i] && sma200[i] > maxP) maxP = sma200[i];
        });

        const padding = (maxP - minP) * 0.1;
        return {
            points, sma50, sma200, minP: minP - padding, maxP: maxP + padding, maxV,
            pRange: (maxP - minP) + (2 * padding) || 1
        };
    }, [baseData, zoomPoints, panOffset, activeStyle]);

    // Dimensions
    const paddingLeft = 10, paddingRight = 40, paddingTop = 40, paddingBottom = 20;
    const chartH = height - paddingTop - paddingBottom;
    const chartW = chartWidth - paddingLeft - paddingRight;

    const getX = useCallback((idx: number) => data ? paddingLeft + (idx / (data.points.length - 1 || 1)) * chartW : 0, [data, chartW]);
    const getY = useCallback((p: number) => data ? paddingTop + (chartH - ((p - data.minP) / data.pRange) * chartH) : 0, [data, chartH]);

    const candleWidth = useMemo(() => data ? Math.max(2, (chartW / data.points.length) * 0.8) : 0, [data, chartW]);

    const renderCandles = () => {
        if (!data) return null;
        const upColor = activeStyle === 'white' ? '#fff' : (activeStyle === 'area' ? '#3b82f6' : '#00c805');
        const downColor = activeStyle === 'white' ? '#fff' : '#ff2e2e';

        return data.points.map((p, i) => {
            const x = getX(i);
            const isUp = p.close >= p.open;
            const color = isUp ? upColor : downColor;
            const bodyTop = getY(Math.max(p.open, p.close));
            const bodyBottom = getY(Math.min(p.open, p.close));
            const bodyH = Math.max(1, bodyBottom - bodyTop);

            if (activeStyle === 'bars') {
                const highY = getY(p.high), lowY = getY(p.low), openY = getY(p.open), closeY = getY(p.close);
                const hw = candleWidth / 2;
                return (
                    <Path
                        key={i}
                        d={`M${x} ${highY} V${lowY} M${x - hw} ${openY} H${x} M${x} ${closeY} H${x + hw}`}
                        stroke={color}
                        strokeWidth="1.2"
                    />
                );
            }

            return (
                <G key={i}>
                    <Path d={`M${x} ${getY(p.high)} L${x} ${getY(p.low)}`} stroke={color} strokeWidth="1" />
                    {(activeStyle === 'hollow' || activeStyle === 'white') && isUp ? (
                        <Rect
                            x={x - candleWidth / 2}
                            y={bodyTop}
                            width={candleWidth}
                            height={bodyH}
                            fill="transparent"
                            stroke={color}
                            strokeWidth="1"
                        />
                    ) : (
                        <Rect
                            x={x - candleWidth / 2}
                            y={bodyTop}
                            width={candleWidth}
                            height={bodyH}
                            fill={color}
                        />
                    )}
                </G>
            );
        });
    };

    const renderSma = () => {
        if (!data) return null;
        const buildPath = (arr: (number | null)[], color: string) => {
            const d = arr.map((v, i) => v ? `${i === 0 ? 'M' : 'L'}${getX(i)} ${getY(v)}` : '').join(' ');
            return d ? <Path d={d} stroke={color} strokeWidth="1" fill="none" opacity={0.6} /> : null;
        };
        return (
            <>
                {buildPath(data.sma50, '#f8d347')}
                {buildPath(data.sma200, '#9d27b0')}
            </>
        );
    };

    if (!baseData || !data) {
        return (
            <View style={[styles.container, { height, backgroundColor: colors.bgMain }]}>
                <ActivityIndicator color={colors.accentPrimary} />
            </View>
        );
    }

    const lastPoint = data.points[data.points.length - 1];
    const prevPoint = data.points[data.points.length - 2] || lastPoint;
    const change = lastPoint.close - prevPoint.close;
    const changePct = (change / prevPoint.close) * 100;

    return (
        <View style={[styles.container, { height, backgroundColor: colors.bgMain }]}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.symbolText}>{cleaned}</Text>
                    <Text style={styles.nameText} numberOfLines={1}>{name}</Text>
                </View>
                <View style={styles.priceInfo}>
                    <Text style={styles.priceText}>{lastPoint.close.toFixed(2)}</Text>
                    <Text style={[styles.changeText, { color: change >= 0 ? '#00c805' : '#ff2e2e' }]}>
                        {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePct.toFixed(2)}%)
                    </Text>
                </View>
            </View>

            <Svg width={chartWidth} height={height}>
                {/* Horizontal Grid */}
                {[0, 0.25, 0.5, 0.75, 1].map(v => (
                    <Path
                        key={v}
                        d={`M${paddingLeft} ${paddingTop + v * chartH} L${chartWidth - paddingRight} ${paddingTop + v * chartH}`}
                        stroke={colors.uiDivider}
                        strokeWidth="0.5"
                        opacity={0.1}
                    />
                ))}

                {renderSma()}
                {(activeStyle === 'area' || activeStyle === 'line') ? (
                    <G>
                        <Defs>
                            <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                                <Stop offset="0" stopColor="#3b82f6" stopOpacity="0.3" />
                                <Stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
                            </LinearGradient>
                        </Defs>
                        {activeStyle === 'area' && (
                            <Path
                                d={data.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${getX(i)} ${getY(p.close)}`).join(' ') + ` L${getX(data.points.length - 1)} ${paddingTop + chartH} L${getX(0)} ${paddingTop + chartH} Z`}
                                fill="url(#grad)"
                            />
                        )}
                        <Path
                            d={data.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${getX(i)} ${getY(p.close)}`).join(' ')}
                            stroke="#3b82f6"
                            strokeWidth="1.5"
                            fill="none"
                        />
                    </G>
                ) : renderCandles()}
            </Svg>

            {/* Price Y-Axis Labels */}
            <View style={styles.yAxis}>
                {[data.maxP, (data.maxP + data.minP) / 2, data.minP].map((v, i) => (
                    <Text key={i} style={[styles.axisText, { top: getY(v) - 6 }]}>{v.toFixed(1)}</Text>
                ))}
            </View>

            <View style={styles.footer}>
                <View style={[styles.timeframes, { flex: 1 }]}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                        {['1D', '1W', '1M', '3M', '1Y'].map(tf => (
                            <Pressable key={tf} onPress={() => setTimeframe(tf)} style={[styles.tfBtn, timeframe === tf && styles.tfBtnActive]}>
                                <Text style={[styles.tfText, timeframe === tf && styles.tfTextActive]}>{tf}</Text>
                            </Pressable>
                        ))}
                        <View style={{ width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 4 }} />
                        {STYLES.map(st => (
                            <Pressable key={st} onPress={() => setActiveStyle(st as any)} style={[styles.tfBtn, activeStyle === st && styles.tfBtnActive]}>
                                <Text style={[styles.tfText, activeStyle === st && styles.tfTextActive]}>{st.substring(0, 3).toUpperCase()}</Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                </View>
                <View style={styles.actions}>
                    <Pressable style={styles.iconBtn}><ZoomIn size={12} color={colors.textMuted} /></Pressable>
                    <Pressable style={styles.iconBtn}><ZoomOut size={12} color={colors.textMuted} /></Pressable>
                    {onExpand && (
                        <Pressable onPress={() => onExpand({ symbol, name, timeframe })} style={styles.iconBtn}>
                            <ExternalLink size={12} color={colors.textMuted} />
                        </Pressable>
                    )}
                </View>
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        width: '100%',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
        marginBottom: 12,
    },
    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 8,
        zIndex: 10,
    },
    symbolText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#fff',
        letterSpacing: 1,
    },
    nameText: {
        fontSize: 8,
        color: 'rgba(255,255,255,0.4)',
        width: 120,
    },
    priceInfo: {
        alignItems: 'flex-end',
    },
    priceText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#fff',
    },
    changeText: {
        fontSize: 8,
        fontWeight: 'bold',
    },
    yAxis: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 40,
        paddingTop: 10,
    },
    axisText: {
        position: 'absolute',
        right: 4,
        fontSize: 7,
        color: 'rgba(255,255,255,0.3)',
        fontWeight: 'bold',
        fontFamily: 'monospace',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 24,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 8,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    timeframes: {
        flexDirection: 'row',
        gap: 4,
    },
    tfBtn: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 2,
    },
    tfBtnActive: {
        backgroundColor: '#c5a059',
    },
    tfText: {
        fontSize: 7,
        fontWeight: 'bold',
        color: 'rgba(255,255,255,0.5)',
    },
    tfTextActive: {
        color: '#000',
    },
    actions: {
        flexDirection: 'row',
        gap: 8,
    },
    iconBtn: {
        padding: 2,
    }
});

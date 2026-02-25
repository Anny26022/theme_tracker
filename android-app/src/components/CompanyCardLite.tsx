import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { ArrowUpRight, MoreHorizontal } from 'lucide-react-native';
import { useLivePrice } from '../contexts/PriceContext';
import { useTheme } from '../contexts/ThemeContext';

type CompanyCardLiteProps = {
    item: {
        symbol: string;
        name: string;
    };
    index: number;
    onClick: () => void;
};

export const CompanyCardLite = ({ item, index, onClick }: CompanyCardLiteProps) => {
    const { colors } = useTheme();
    const [imgError, setImgError] = React.useState(false);
    const { price, changePct, loading } = useLivePrice(item.symbol);
    const currentStyles = styles(colors);

    const isPositive = (changePct ?? 0) >= 0;
    const changeColor = isPositive ? '#22c55e' : '#ef4444';

    return (
        <Pressable style={currentStyles.card} onPress={onClick}>
            <View style={currentStyles.leftContainer}>
                <View style={currentStyles.iconContainer}>
                    {!imgError ? (
                        <Image
                            source={{ uri: `https://images.dhan.co/symbol/${item.symbol}.png` }}
                            style={currentStyles.logo}
                            contentFit="contain"
                            onError={() => setImgError(true)}
                        />
                    ) : (
                        <View style={currentStyles.placeholderLogo}>
                            <Text style={currentStyles.placeholderText}>
                                {item.symbol.substring(0, 1)}
                            </Text>
                        </View>
                    )}
                </View>
                <View style={currentStyles.textContainer}>
                    <Text style={currentStyles.name}>{item.name}</Text>
                    <Text style={currentStyles.symbol}>{item.symbol}</Text>
                </View>
            </View>

            <View style={currentStyles.rightContainer}>
                {/* Live CMP */}
                <View style={currentStyles.priceContainer}>
                    {loading && !price ? (
                        <>
                            <View style={currentStyles.shimmer} />
                            <View style={[currentStyles.shimmer, { width: 30, marginTop: 3 }]} />
                        </>
                    ) : price ? (
                        <>
                            <Text style={currentStyles.price}>
                                ₹{price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </Text>
                            <Text style={[currentStyles.change, { color: changeColor }]}>
                                {changePct != null ? `${isPositive ? '+' : ''}${changePct.toFixed(2)}%` : ''}
                            </Text>
                        </>
                    ) : null}
                </View>

                <View style={currentStyles.actionIcons}>
                    <MoreHorizontal size={14} color={colors.textMuted} />
                    <ArrowUpRight size={14} color={colors.textMuted} />
                </View>
            </View>
        </Pressable>
    );
};

const styles = (colors: any) => StyleSheet.create({
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        backgroundColor: colors.glassBg,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        borderRadius: 4,
    },
    leftContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    iconContainer: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logo: {
        width: '100%',
        height: '100%',
        opacity: 0.9,
    },
    placeholderLogo: {
        width: '100%',
        height: '100%',
        borderRadius: 4,
        backgroundColor: colors.uiMuted,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.uiDivider,
    },
    placeholderText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: colors.textMuted,
    },
    textContainer: {
        flex: 1,
    },
    name: {
        fontSize: 10,
        fontWeight: 'bold',
        color: colors.textMain,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    symbol: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.textMuted,
        letterSpacing: 2,
    },
    rightContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    priceContainer: {
        alignItems: 'flex-end',
        minWidth: 60,
    },
    price: {
        fontSize: 11,
        fontWeight: 'bold',
        color: colors.textMain,
        letterSpacing: 0.5,
    },
    change: {
        fontSize: 8,
        fontWeight: 'bold',
        letterSpacing: 0.5,
        marginTop: 2,
    },
    shimmer: {
        height: 10,
        width: 48,
        backgroundColor: colors.uiDivider,
        borderRadius: 3,
        opacity: 0.4,
    },
    actionIcons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
});

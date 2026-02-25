import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface BaseNodeProps {
    label: string;
    value: string | number;
    title?: string;
    onClick?: () => void;
    index?: number;
    accentColor?: string;
    children?: React.ReactNode;
}

export const BaseNode = ({
    label,
    value,
    title,
    onClick,
    index = 0,
    accentColor,
    children
}: BaseNodeProps) => {
    const { colors } = useTheme();
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const finalAccentColor = accentColor || colors.accentPrimary;
    const currentStyles = styles(colors);

    const handlePressIn = () => {
        Animated.spring(scaleAnim, { toValue: 0.98, useNativeDriver: true }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
    };

    return (
        <Pressable
            onPress={onClick}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
        >
            <Animated.View
                style={[
                    currentStyles.card,
                    { borderColor: colors.uiDivider, transform: [{ scale: scaleAnim }] }
                ]}
            >
                {/* Header info */}
                <View style={currentStyles.header}>
                    <Text style={[currentStyles.label, { color: finalAccentColor }]}>{label}</Text>
                    <Text style={currentStyles.value}>{value}</Text>
                </View>

                {/* Title */}
                {title && (
                    <Text style={currentStyles.title} numberOfLines={1}>
                        {title}
                    </Text>
                )}

                {children}
            </Animated.View>
        </Pressable>
    );
};

const styles = (colors: any) => StyleSheet.create({
    card: {
        padding: 16,
        borderWidth: 1,
        backgroundColor: colors.glassBg,
        borderRadius: 4,
        overflow: 'hidden',
        flexDirection: 'column',
        gap: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    label: {
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 4,
        textTransform: 'uppercase',
    },
    value: {
        fontSize: 10,
        fontWeight: 'bold',
        color: colors.textMain,
        letterSpacing: 3,
        textTransform: 'uppercase',
    },
    title: {
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 2,
        textTransform: 'uppercase',
        color: colors.textMain,
        opacity: 0.9,
    }
});

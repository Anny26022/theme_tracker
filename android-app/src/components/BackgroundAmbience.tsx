import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';

const { width, height } = Dimensions.get('window');

export const BackgroundAmbience = () => {
    const { colors, theme } = useTheme();
    const isDark = theme === 'dark';

    return (
        <View style={styles.container} pointerEvents="none">
            <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
                <Defs>
                    <RadialGradient
                        id="topGlow"
                        cx="25%"
                        cy="20%"
                        rx="40%"
                        ry="30%"
                        fx="25%"
                        fy="5%"
                        gradientUnits="userSpaceOnUse"
                    >
                        <Stop offset="0%" stopColor={colors.accentPrimary} stopOpacity={isDark ? "0.12" : "0.08"} />
                        <Stop offset="100%" stopColor={colors.bgMain} stopOpacity="0" />
                    </RadialGradient>

                    <RadialGradient
                        id="bottomGlow"
                        cx="75%"
                        cy="80%"
                        rx="40%"
                        ry="30%"
                        fx="75%"
                        fy="95%"
                        gradientUnits="userSpaceOnUse"
                    >
                        <Stop offset="0%" stopColor={colors.accentSecondary} stopOpacity={isDark ? "0.12" : "0.08"} />
                        <Stop offset="100%" stopColor={colors.bgMain} stopOpacity="0" />
                    </RadialGradient>
                </Defs>

                {/* Background Base */}
                <Rect x="0" y="0" width="100%" height="100%" fill={colors.bgMain} />

                {/* Actual Glows */}
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#topGlow)" />
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#bottomGlow)" />
            </Svg>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: -1,
    }
});

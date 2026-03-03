import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Modal } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface UniverseLoaderProps {
    title?: string;
    subtitle?: string;
    highlight?: string;
}

export const UniverseLoader = ({
    title = "Synchronizing Universe",
    subtitle = "Hang on, we are fetching the entire universe for you,",
    highlight = "so be patient..."
}: UniverseLoaderProps) => {
    const { colors, isDark } = useTheme();
    const spinAnim = useRef(new Animated.Value(0)).current;
    const revSpinAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(0.8)).current;

    useEffect(() => {
        const createLoop = (val: Animated.Value, duration: number, isRev = false) => {
            return Animated.loop(
                Animated.timing(val, {
                    toValue: isRev ? -1 : 1,
                    duration,
                    easing: Easing.linear,
                    useNativeDriver: true,
                })
            );
        };

        const spin = createLoop(spinAnim, 2000);
        const revSpin = createLoop(revSpinAnim, 1500, true);
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 0.8, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])
        );

        spin.start();
        revSpin.start();
        pulse.start();

        return () => {
            spin.stop();
            revSpin.stop();
            pulse.stop();
        };
    }, []);

    const spin = spinAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const revSpin = revSpinAnim.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: ['-360deg', '0deg', '360deg'],
    });

    return (
        <Modal transparent animationType="fade" visible>
            <View style={[styles.overlay, { backgroundColor: isDark ? 'rgba(5, 5, 8, 0.85)' : 'rgba(248, 249, 250, 0.85)' }]}>
                <View style={styles.content}>
                    <View style={styles.orbitContainer}>
                        {/* Outer Orbit */}
                        <View style={[styles.orbit, { borderColor: colors.accentPrimary + '15' }]} />
                        <Animated.View style={[styles.orbit, { borderTopColor: colors.accentPrimary, borderTopWidth: 2, transform: [{ rotate: spin }] }]} />

                        {/* Middle Orbit */}
                        <View style={[styles.orbit, styles.orbitMid, { borderColor: colors.accentPrimary + '10' }]} />
                        <Animated.View style={[styles.orbit, styles.orbitMid, { borderBottomColor: colors.accentPrimary + '66', borderBottomWidth: 2, transform: [{ rotate: revSpin }] }]} />

                        {/* Inner Pulse */}
                        <Animated.View style={[styles.pulse, { backgroundColor: colors.accentPrimary + '15', borderColor: colors.accentPrimary + '33', transform: [{ scale: pulseAnim }] }]} />
                    </View>

                    <View style={styles.textContainer}>
                        <View style={styles.titleWrap}>
                            <Text style={[styles.title, { color: colors.accentPrimary }]}>{title.toUpperCase()}</Text>
                            <View style={[styles.divider, { backgroundColor: colors.accentPrimary + '44' }]} />
                        </View>
                        <Text style={[styles.subtitle, { color: colors.textMain }]}>
                            {subtitle} <Text style={{ color: colors.accentPrimary }}>{highlight}</Text>
                        </Text>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        alignItems: 'center',
        gap: 40,
        width: '80%',
    },
    orbitContainer: {
        width: 100,
        height: 100,
        justifyContent: 'center',
        alignItems: 'center',
    },
    orbit: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: 50,
        borderWidth: 1,
    },
    orbitMid: {
        width: '70%',
        height: '70%',
    },
    pulse: {
        width: '30%',
        height: '30%',
        borderRadius: 15,
        borderWidth: 1,
    },
    textContainer: {
        alignItems: 'center',
        gap: 12,
    },
    titleWrap: {
        alignItems: 'center',
        gap: 6,
    },
    title: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 4,
        textAlign: 'center',
    },
    divider: {
        width: 30,
        height: 1,
    },
    subtitle: {
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 1,
        textAlign: 'center',
        lineHeight: 14,
        textTransform: 'uppercase',
        fontStyle: 'italic',
        opacity: 0.7,
    },
});

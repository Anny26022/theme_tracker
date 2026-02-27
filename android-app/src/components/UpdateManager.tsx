import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Animated, Modal, AppState } from 'react-native';
import * as Updates from 'expo-updates';
import { RefreshCw, Zap, Cpu } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';

const CHANGELOG_ITEMS = [
    'Price polling lifecycle optimized with background pause and zero-subscriber stop',
    'Live price subscription moved to useSyncExternalStore for lower render churn',
    'Market map and filings timelines virtualized for smoother interaction',
    'Logo-heavy composition views now use disk-cached expo-image rendering',
];

export const UpdateManager = () => {
    const { colors } = useTheme();
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const opacityAnim = useRef(new Animated.Value(0)).current;

    const checkUpdates = useCallback(async () => {
        if (__DEV__) return;
        try {
            const update = await Updates.checkForUpdateAsync();
            if (update.isAvailable) {
                setUpdateAvailable(true);
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 800,
                    useNativeDriver: true,
                }).start();
            }
        } catch (error) {
            console.log('[Updates] Check failed:', error);
        }
    }, [opacityAnim]);

    useEffect(() => {
        checkUpdates();

        // 1. Re-check when app comes to foreground
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (nextAppState === 'active') {
                checkUpdates();
            }
        });

        // 2. Periodic re-check every 10 minutes
        const interval = setInterval(checkUpdates, 1000 * 60 * 10);

        return () => {
            subscription.remove();
            clearInterval(interval);
        };
    }, [checkUpdates]);

    const onUpdate = async () => {
        setIsProcessing(true);
        try {
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync();
        } catch (error) {
            console.log('[Updates] Fetch/Reload failed:', error);
            setIsProcessing(false);
        }
    };

    if (!updateAvailable) return null;

    const currentStyles = styles(colors);

    return (
        <Modal transparent visible={updateAvailable} animationType="none">
            <Animated.View style={[currentStyles.overlay, { opacity: opacityAnim }]}>
                <View style={currentStyles.container}>
                    <View style={currentStyles.header}>
                        <View style={currentStyles.iconCircle}>
                            <Zap size={24} color={colors.accentPrimary} />
                        </View>
                        <Text style={currentStyles.headerText}>System Evolution</Text>
                    </View>

                    <View style={currentStyles.content}>
                        <View style={currentStyles.row}>
                            <Cpu size={14} color={colors.accentPrimary} />
                            <Text style={currentStyles.title}>OTA SYNCHRONIZATION</Text>
                        </View>
                        <Text style={currentStyles.description}>
                            A mandatory performance release is ready with optimized live pricing, virtualized lists, and faster thematic rendering.
                        </Text>
                        <View style={currentStyles.changelogBox}>
                            <Text style={currentStyles.changelogTitle}>WHAT&apos;S NEW</Text>
                            {CHANGELOG_ITEMS.map((item) => (
                                <Text key={item} style={currentStyles.changelogItem}>• {item}</Text>
                            ))}
                        </View>
                    </View>

                    <TouchableOpacity
                        activeOpacity={0.8}
                        disabled={isProcessing}
                        style={currentStyles.btn}
                        onPress={onUpdate}
                    >
                        {isProcessing ? (
                            <ActivityIndicator color={colors.bgMain} size="small" />
                        ) : (
                            <>
                                <RefreshCw size={14} color={colors.bgMain} />
                                <Text style={currentStyles.btnText}>INITIALIZE UPDATE</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <Text style={currentStyles.footer}>MANDATORY ARCHITECTURE UPGRADE</Text>
                </View>
            </Animated.View>
        </Modal>
    );
};

const styles = (colors: any) => StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(5, 5, 8, 0.98)', // Near-black for total focus
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
    },
    container: {
        width: '100%',
        backgroundColor: 'transparent',
        alignItems: 'center',
        gap: 40,
    },
    header: {
        alignItems: 'center',
        gap: 16,
    },
    iconCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: colors.accentPrimary + '10',
        borderWidth: 1,
        borderColor: colors.accentPrimary + '30',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerText: {
        fontSize: 22,
        fontWeight: '300',
        color: colors.textMain,
        letterSpacing: 8,
        textTransform: 'uppercase',
    },
    content: {
        alignItems: 'center',
        gap: 12,
        maxWidth: 280,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        fontSize: 10,
        fontWeight: 'bold',
        color: colors.accentPrimary,
        letterSpacing: 4,
    },
    description: {
        fontSize: 12,
        color: colors.textMuted,
        textAlign: 'center',
        lineHeight: 22,
        fontWeight: '400',
    },
    changelogBox: {
        width: '100%',
        borderWidth: 1,
        borderColor: colors.uiDivider,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 5,
        backgroundColor: colors.bgMain + '66',
    },
    changelogTitle: {
        fontSize: 9,
        color: colors.accentPrimary,
        letterSpacing: 2,
        fontWeight: '800',
    },
    changelogItem: {
        fontSize: 10,
        color: colors.textMain,
        lineHeight: 14,
        opacity: 0.85,
    },
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.accentPrimary,
        paddingHorizontal: 32,
        paddingVertical: 18,
        borderRadius: 4,
        gap: 12,
        width: '100%',
        justifyContent: 'center',
        elevation: 10,
        shadowColor: colors.accentPrimary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    btnText: {
        color: colors.bgMain,
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 2,
    },
    footer: {
        fontSize: 8,
        color: colors.textMuted,
        fontWeight: 'bold',
        letterSpacing: 3,
        opacity: 0.4,
    }
});

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import * as Updates from 'expo-updates';
import { RefreshCw, X } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';

export const UpdateManager = () => {
    const { colors } = useTheme();
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    const slideAnim = useRef(new Animated.Value(-100)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (__DEV__) return;

        const checkUpdates = async () => {
            try {
                const update = await Updates.checkForUpdateAsync();
                if (update.isAvailable) {
                    setUpdateAvailable(true);
                    triggerEntrance();
                }
            } catch (error) {
                console.log('[Updates] Check failed:', error);
            }
        };

        checkUpdates();
    }, []);

    const triggerEntrance = () => {
        Animated.parallel([
            Animated.spring(slideAnim, {
                toValue: 20,
                friction: 8,
                tension: 40,
                useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
            })
        ]).start();
    };

    const triggerExit = () => {
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: -100,
                duration: 400,
                useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            })
        ]).start(() => setDismissed(true));
    };

    const onUpdate = async () => {
        setIsProcessing(true);
        try {
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync();
        } catch (error) {
            console.log('[Updates] Fetch/Reload failed:', error);
            triggerExit();
        } finally {
            setIsProcessing(false);
        }
    };

    if (!updateAvailable || dismissed) return null;

    const currentStyles = styles(colors);

    return (
        <Animated.View style={[
            currentStyles.pillContainer,
            {
                transform: [{ translateY: slideAnim }],
                opacity: opacityAnim
            }
        ]}>
            <View style={currentStyles.pill}>
                <View style={currentStyles.statusDot} />
                <Text style={currentStyles.label}>Update Ready</Text>

                <View style={currentStyles.divider} />

                <TouchableOpacity
                    activeOpacity={0.7}
                    disabled={isProcessing}
                    style={currentStyles.actionBtn}
                    onPress={onUpdate}
                >
                    {isProcessing ? (
                        <ActivityIndicator color={colors.bgMain} size="small" />
                    ) : (
                        <>
                            <RefreshCw size={10} color={colors.bgMain} />
                            <Text style={currentStyles.actionText}>SYNCC</Text>
                        </>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={triggerExit}
                    style={currentStyles.closeBtn}
                >
                    <X size={12} color={colors.textMuted} />
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
};

const styles = (colors: any) => StyleSheet.create({
    pillContainer: {
        position: 'absolute',
        top: 40,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 9999,
        elevation: 100,
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.bgMain,
        paddingLeft: 12,
        paddingRight: 8,
        paddingVertical: 6,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: colors.uiDivider,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    statusDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.accentPrimary,
        marginRight: 8,
    },
    label: {
        fontSize: 9,
        fontWeight: 'bold',
        color: colors.textMain,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
    },
    divider: {
        width: 1,
        height: 12,
        backgroundColor: colors.uiDivider,
        marginHorizontal: 10,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.accentPrimary,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        gap: 6,
    },
    actionText: {
        color: colors.bgMain,
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 1,
    },
    closeBtn: {
        marginLeft: 8,
        padding: 4,
    },
    actionTextDisabled: {
        opacity: 0.5,
    }
});

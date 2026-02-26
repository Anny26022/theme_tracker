import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Dimensions, ActivityIndicator } from 'react-native';
import * as Updates from 'expo-updates';
import { useTheme } from '../contexts/ThemeContext';
import { TYPOGRAPHY } from '../theme/constants';

const { width } = Dimensions.get('window');

export const UpdateManager = () => {
    const { colors } = useTheme();
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        // Only run check in production environment
        if (__DEV__) return;

        const checkUpdates = async () => {
            try {
                const update = await Updates.checkForUpdateAsync();
                if (update.isAvailable) {
                    setUpdateAvailable(true);
                }
            } catch (error) {
                // Silently fail to not interrupt user experience
                console.log('[Updates] Check failed:', error);
            }
        };

        checkUpdates();
    }, []);

    const onUpdate = async () => {
        setIsProcessing(true);
        try {
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync();
        } catch (error) {
            console.log('[Updates] Fetch/Reload failed:', error);
            setUpdateAvailable(false);
        } finally {
            setIsProcessing(false);
        }
    };

    if (!updateAvailable) return null;

    return (
        <Modal transparent animationType="fade" visible={updateAvailable}>
            <View style={styles.overlay}>
                <View style={[
                    styles.card,
                    {
                        backgroundColor: '#0A0A0F', // Absolute dark for luxury feel
                        borderColor: colors.glassBorder,
                        borderWidth: 1.5,
                        shadowColor: colors.accentPrimary,
                        shadowOffset: { width: 0, height: 10 },
                        shadowOpacity: 0.2,
                        shadowRadius: 20,
                        elevation: 10,
                    }
                ]}>
                    <View style={styles.header}>
                        <View style={[styles.dot, { backgroundColor: colors.accentPrimary }]} />
                        <Text style={[
                            styles.title,
                            { color: colors.textMain },
                            TYPOGRAPHY.textLuxury as any // Bypass strict TS check for custom luxury font object
                        ]}>
                            Update Ready
                        </Text>
                    </View>

                    <Text style={[styles.description, { color: colors.textMuted }]}>
                        A refined version with critical performance optimizations and batching enhancements is available.
                    </Text>

                    <TouchableOpacity
                        activeOpacity={0.9}
                        disabled={isProcessing}
                        style={[
                            styles.button,
                            { backgroundColor: colors.accentPrimary }
                        ]}
                        onPress={onUpdate}
                    >
                        {isProcessing ? (
                            <ActivityIndicator color="#000" size="small" />
                        ) : (
                            <Text style={styles.buttonText}>Refine Experience</Text>
                        )}
                    </TouchableOpacity>

                    {!isProcessing && (
                        <TouchableOpacity
                            onPress={() => setUpdateAvailable(false)}
                            style={styles.laterButton}
                        >
                            <Text style={[styles.laterText, { color: colors.textMuted }]}>Later</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    card: {
        width: width * 0.85,
        padding: 32,
        borderRadius: 32,
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 8,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    title: {
        fontSize: 16,
    },
    description: {
        fontSize: 13,
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 22,
        fontWeight: '400',
        paddingHorizontal: 10,
    },
    button: {
        paddingVertical: 18,
        borderRadius: 16,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonText: {
        color: '#000',
        fontWeight: '700',
        fontSize: 11,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    laterButton: {
        marginTop: 20,
        padding: 10,
    },
    laterText: {
        fontSize: 10,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        fontWeight: '500',
    }
});

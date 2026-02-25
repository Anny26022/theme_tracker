import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Copy, Check } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';

interface WatchlistCopyButtonProps {
    onCopy: () => boolean;
    size?: number;
    style?: any;
}

export const WatchlistCopyButton = ({ onCopy, size = 16, style }: WatchlistCopyButtonProps) => {
    const { colors } = useTheme();
    const [copied, setCopied] = useState(false);

    const handlePress = () => {
        const success = onCopy();
        if (success) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <Pressable
            onPress={handlePress}
            style={({ pressed }) => [
                styles.button,
                { opacity: pressed ? 0.6 : 1 },
                style
            ]}
        >
            {copied ? (
                <Check size={size} color={colors.accentPrimary} />
            ) : (
                <Copy size={size} color={colors.textMuted} />
            )}
        </Pressable>
    );
};

const styles = StyleSheet.create({
    button: {
        padding: 4,
        justifyContent: 'center',
        alignItems: 'center',
    }
});

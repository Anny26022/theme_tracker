import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { BaseNode } from './BaseNode';
import { WatchlistCopyButton } from './WatchlistCopyButton';

interface SectorNodeProps {
    name: string;
    count: number;
    onClick: () => void;
    onCopy: () => boolean;
    index: number;
    colorObj: { border: string, text: string };
}

export const SectorNode = ({ name, count, onClick, onCopy, index, colorObj }: SectorNodeProps) => {
    return (
        <BaseNode
            label={`Node_0${index + 1}`}
            value={count}
            title={name.replace(' Companies', '')}
            onClick={onClick}
            index={index}
            accentColor={colorObj.text}
        >
            <View style={[styles.hairline, { backgroundColor: colorObj.text }]} />

            <View style={styles.footer}>
                <View style={styles.leftIcons}>
                    <WatchlistCopyButton
                        onCopy={onCopy}
                        size={12}
                    />
                </View>
                <Text style={[styles.arrow, { color: colorObj.text }]}>→</Text>
            </View>
        </BaseNode>
    );
};

const styles = StyleSheet.create({
    hairline: {
        height: 1,
        width: '100%',
        opacity: 0.15,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    leftIcons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    arrow: {
        fontSize: 16,
    }
});

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BaseNode } from './BaseNode';
import { WatchlistCopyButton } from './WatchlistCopyButton';

interface IndustryNodeProps {
    name: string;
    count: number;
    onClick: () => void;
    onCopy: () => boolean;
    index: number;
}

export const IndustryNode = ({ name, count, onClick, onCopy, index }: IndustryNodeProps) => {
    return (
        <BaseNode
            label="Industry"
            value={count}
            title={name}
            onClick={onClick}
            index={index}
        >
            <View style={styles.footer}>
                <WatchlistCopyButton
                    onCopy={onCopy}
                    size={11}
                />
            </View>
        </BaseNode>
    );
};

const styles = StyleSheet.create({
    footer: {
        marginTop: 4,
        flexDirection: 'row',
        justifyContent: 'flex-start',
    }
});

import React from 'react';
import { WatchlistCopyButton } from './WatchlistCopyButton';
import { BaseNode } from './BaseNode';

export const IndustryNode = ({ name, count, onClick, onCopy, index }) => {
    return (
        <BaseNode
            label="Industry"
            value={count}
            title={name}
            onClick={onClick}
            index={index}
        >
            <div className="flex items-center justify-end mt-auto">
                {onCopy && (
                    <WatchlistCopyButton
                        onCopy={onCopy}
                        className="opacity-0 group-hover:opacity-100"
                        iconSize={2.5}
                    />
                )}
            </div>
        </BaseNode>
    );
};

import React from 'react';
import { WatchlistCopyButton } from './WatchlistCopyButton';
import { BaseNode } from './BaseNode';

export const IndustryNode = ({ name, count, onClick, onCopy, index, disableEnterAnimation = false, disableContentVisibility = false }) => {
    return (
        <BaseNode
            label="Industry"
            value={count}
            title={name}
            onClick={onClick}
            index={index}
            disableEnterAnimation={disableEnterAnimation}
            disableContentVisibility={disableContentVisibility}
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

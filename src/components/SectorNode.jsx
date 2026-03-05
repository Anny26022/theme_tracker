import React from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { WatchlistCopyButton } from './WatchlistCopyButton';
import { BaseNode } from './BaseNode';

export const SectorNode = React.memo(({
    name,
    count,
    onClick,
    onCopy,
    index,
    accentClass,
    disableEnterAnimation = false,
    disableContentVisibility = false
}) => {
    return (
        <BaseNode
            label={`Node_0${index + 1}`}
            value={count}
            title={name.replace(' Companies', '')}
            onClick={onClick}
            index={index}
            accentClass={accentClass}
            disableEnterAnimation={disableEnterAnimation}
            disableContentVisibility={disableContentVisibility}
        >
            <div className={cn(
                "h-[1px] w-full transition-all duration-700 opacity-20 group-hover:opacity-60",
                accentClass?.split(' ').find(c => c.startsWith('text-'))?.replace('text-', 'bg-') || "bg-[var(--glass-border)]"
            )} />

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <WatchlistCopyButton
                        onCopy={onCopy}
                        className="opacity-0 group-hover:opacity-100"
                        iconSize={2.5}
                    />
                </div>
                <ArrowRight className={cn("w-3 h-3 group-hover:translate-x-1 transition-transform",
                    accentClass?.split(' ').find(c => c.startsWith('text-')) || "text-[var(--text-muted)]"
                )} />
            </div>
        </BaseNode>
    );
}, (prevProps, nextProps) => (
    prevProps.name === nextProps.name &&
    prevProps.count === nextProps.count &&
    prevProps.onClick === nextProps.onClick &&
    prevProps.onCopy === nextProps.onCopy &&
    prevProps.index === nextProps.index &&
    prevProps.accentClass === nextProps.accentClass &&
    prevProps.disableEnterAnimation === nextProps.disableEnterAnimation &&
    prevProps.disableContentVisibility === nextProps.disableContentVisibility
));


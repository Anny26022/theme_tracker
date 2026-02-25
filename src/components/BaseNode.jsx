import React from 'react';
import { m } from 'framer-motion';
import { cn } from '../lib/utils';

/**
 * The core UI building block for all Intel Suite cards.
 * Enforces consistent glassmorphism, hover effects, and layout.
 */
export const BaseNode = ({
    label,
    value,
    title,
    onClick,
    index = 0,
    accentClass = "",
    children,
    className = ""
}) => {
    return (
        <m.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            whileHover={{ scale: 1.01 }}
            onClick={onClick}
            className={cn(
                "gpu-accel cv-auto p-4 md:p-5 border glass-card cursor-pointer group transition-colors duration-300 relative overflow-hidden flex flex-col gap-4 hover:bg-[var(--glass-bg)] hover:border-[var(--accent-primary)]",
                accentClass?.split(' ').find(c => c.startsWith('border-')) || "border-[var(--ui-divider)]",
                className
            )}
        >
            {/* Header info */}
            <div className="flex items-center justify-between">
                <span className={cn(
                    "text-[8px] font-bold tracking-[0.4em] uppercase transition-colors text-[var(--text-muted)] group-hover:text-[var(--accent-primary)]",
                    accentClass?.includes('text-') && accentClass.split(' ').find(c => c.startsWith('text-'))
                )}>
                    {label}
                </span>
                <span className="text-[8px] font-bold text-[var(--text-main)] uppercase tracking-[0.3em]">
                    {value}
                </span>
            </div>

            {/* Title / Main Content */}
            {title && (
                <h3 className={cn(
                    "text-[10px] font-bold tracking-[0.2em] uppercase opacity-80 transition-colors truncate leading-relaxed group-hover:text-[var(--accent-primary)]",
                    accentClass?.includes('text-') && accentClass.split(' ').find(c => c.startsWith('text-'))
                )}>
                    {title}
                </h3>
            )}

            {children}
        </m.div>
    );
};

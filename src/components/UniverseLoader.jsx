import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Premium full-screen loading overlay for data intensive operations.
 * Reuses the "Universe Synchronizer" design language.
 */
export const UniverseLoader = ({
    title = "Synchronizing Universe",
    subtitle = "Hang on, we are fetching the entire universe for you,",
    highlight = "so be patient..."
}) => {
    return createPortal(
        <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-start pt-[20vh] bg-[var(--bg-main)]/80 backdrop-blur-md">
            <div className="flex flex-col items-center gap-8 max-w-sm text-center px-6">
                <div className="relative w-24 h-24">
                    {/* Outer Orbit */}
                    <div className="absolute inset-0 rounded-full border-2 border-[var(--accent-primary)]/10" />
                    <div className="absolute inset-0 rounded-full border-t-2 border-[var(--accent-primary)] animate-spin shadow-[0_0_15px_var(--accent-primary)]" />

                    {/* Inner Reversed Orbit */}
                    <div className="absolute inset-4 rounded-full border-2 border-[var(--accent-primary)]/5" />
                    <div className="absolute inset-4 rounded-full border-b-2 border-[var(--accent-primary)]/40 animate-spin-reverse" />

                    {/* Inner Most Pulse */}
                    <div className="absolute inset-10 rounded-full bg-[var(--accent-primary)]/10 animate-pulse border border-[var(--accent-primary)]/20 shadow-[0_0_25px_var(--accent-primary)]/10" />
                </div>

                <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                        <h3 className="text-[11px] font-black tracking-[0.4em] uppercase text-[var(--accent-primary)] animate-pulse">
                            {title}
                        </h3>
                        <div className="h-[1px] w-12 bg-[var(--accent-primary)]/30 mx-auto" />
                    </div>
                    <p className="text-[9px] font-black tracking-[0.1em] leading-relaxed text-[var(--text-main)] opacity-70 uppercase italic">
                        {subtitle} <br />
                        <span className="text-[var(--accent-primary)]">{highlight}</span>
                    </p>
                </div>
            </div>
        </div>,
        document.body
    );
};

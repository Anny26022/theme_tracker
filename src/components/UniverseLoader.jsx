import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Minimalist high-speed loader for data operations.
 */
export const UniverseLoader = ({
    title = "Syncing Universe",
    subtitle = "Fetching market telemetry",
    highlight = "Real-time"
}) => {
    return createPortal(
        <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#050508]/60 backdrop-blur-sm">
            <div className="flex flex-col items-center">
                <div
                    style={{ animation: 's 0.6s linear infinite' }}
                    className="w-6 h-6 border border-[var(--accent-primary)]/10 border-t-[var(--accent-primary)] rounded-full will-change-transform"
                />
                <div className="mt-6 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold tracking-[0.4em] uppercase text-[var(--accent-primary)] opacity-80">
                        {title}
                    </span>
                    <span className="text-[7px] font-medium tracking-[0.1em] text-white/40 uppercase">
                        {subtitle} <span className="text-[var(--accent-primary)]/40">{highlight}</span>
                    </span>
                </div>
            </div>
            <style>{`@keyframes s { to { transform: rotate(360deg); } }`}</style>
        </div>,
        document.body
    );
};

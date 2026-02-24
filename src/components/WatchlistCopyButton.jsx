import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * Standardized Watchlist Copy Button
 * Handles clipboard logic and "Copied" feedback state.
 */
export const WatchlistCopyButton = ({
    onCopy,
    className = "",
    iconSize = 3,
    title = "Copy TV Watchlist"
}) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = (e) => {
        if (e) e.stopPropagation();

        const success = onCopy();
        if (success !== false) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <button
            onClick={handleCopy}
            className={`transition-all duration-300 ${copied
                    ? 'text-[var(--accent-primary)] scale-110'
                    : `text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:scale-110 ${className}`
                }`}
            title={copied ? "Copied!" : title}
        >
            {copied ? (
                <Check style={{ width: `${iconSize * 4}px`, height: `${iconSize * 4}px` }} />
            ) : (
                <Copy style={{ width: `${iconSize * 4}px`, height: `${iconSize * 4}px` }} />
            )}
        </button>
    );
};

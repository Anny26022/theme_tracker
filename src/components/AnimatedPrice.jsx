import React, { useEffect, useRef, useState } from 'react';

/**
 * AnimatedPrice — Smooth price ticker like broker terminals.
 * 
 * Features:
 *   - Numbers smoothly count up/down on change (requestAnimationFrame)
 *   - Brief green/red flash on price update
 *   - No flicker — CSS transitions handle everything
 */
export const AnimatedPrice = ({ value, decimals = 2, prefix = '₹', className = '' }) => {
    const displayRef = useRef(null);
    const prevValueRef = useRef(value);
    const animFrameRef = useRef(null);
    const [flash, setFlash] = useState(null); // 'up' | 'down' | null

    useEffect(() => {
        if (value === null || value === undefined) return;

        const prevValue = prevValueRef.current;
        prevValueRef.current = value;

        // First render — just set immediately
        if (prevValue === null || prevValue === undefined) {
            if (displayRef.current) {
                displayRef.current.textContent = `${prefix}${value.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
            }
            return;
        }

        // Same value — no animation
        if (prevValue === value) return;

        // Flash direction
        const direction = value > prevValue ? 'up' : 'down';
        setFlash(direction);

        // Clear flash after 600ms
        const flashTimer = setTimeout(() => setFlash(null), 600);

        // Smooth count animation
        const startValue = prevValue;
        const endValue = value;
        const duration = 400; // 400ms animation
        const startTime = performance.now();

        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

        const animate = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease-out cubic for smooth deceleration
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = startValue + (endValue - startValue) * eased;

            if (displayRef.current) {
                displayRef.current.textContent = `${prefix}${current.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
            }

            if (progress < 1) {
                animFrameRef.current = requestAnimationFrame(animate);
            }
        };

        animFrameRef.current = requestAnimationFrame(animate);

        return () => {
            clearTimeout(flashTimer);
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [value, decimals, prefix]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, []);

    return (
        <span
            ref={displayRef}
            className={`tabular-nums transition-colors duration-500 ${flash === 'up' ? 'text-emerald-400' :
                    flash === 'down' ? 'text-rose-400' :
                        ''
                } ${className}`}
        >
            {value !== null && value !== undefined
                ? `${prefix}${value.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
                : '—'
            }
        </span>
    );
};

/**
 * AnimatedChange — Smooth change % ticker.
 */
export const AnimatedChange = ({ value, decimals = 2, className = '' }) => {
    const displayRef = useRef(null);
    const prevValueRef = useRef(value);
    const animFrameRef = useRef(null);

    useEffect(() => {
        if (value === null || value === undefined) return;

        const prevValue = prevValueRef.current;
        prevValueRef.current = value;

        if (prevValue === null || prevValue === undefined) {
            if (displayRef.current) {
                displayRef.current.textContent = `${value > 0 ? '+' : ''}${value.toFixed(decimals)}%`;
            }
            return;
        }

        if (prevValue === value) return;

        const startValue = prevValue;
        const endValue = value;
        const duration = 400;
        const startTime = performance.now();

        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

        const animate = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = startValue + (endValue - startValue) * eased;

            if (displayRef.current) {
                displayRef.current.textContent = `${current > 0 ? '+' : ''}${current.toFixed(decimals)}%`;
            }

            if (progress < 1) {
                animFrameRef.current = requestAnimationFrame(animate);
            }
        };

        animFrameRef.current = requestAnimationFrame(animate);

        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [value, decimals]);

    useEffect(() => {
        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, []);

    const isPositive = value > 0;
    const isNegative = value < 0;

    return (
        <span
            ref={displayRef}
            className={`tabular-nums ${isPositive ? 'text-emerald-500' : isNegative ? 'text-rose-500' : 'text-[var(--text-muted)]'
                } ${className}`}
        >
            {value !== null && value !== undefined
                ? `${isPositive ? '+' : ''}${value.toFixed(decimals)}%`
                : '—'
            }
        </span>
    );
};

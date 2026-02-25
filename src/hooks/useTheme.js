import { useCallback, useLayoutEffect, useRef, useState } from 'react';

const THEME_STORAGE_KEY = 'nexus-theme:v1';
const LEGACY_THEME_STORAGE_KEY = 'nexus-theme';
const THEME_SWITCHING_CLASS = 'theme-switching';

function persistTheme(theme) {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
        localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    } catch {
        // Ignore storage errors (private mode/quota/disabled storage)
    }
}

function withTransitionGuard(onApply) {
    const root = document.documentElement;
    root.classList.add(THEME_SWITCHING_CLASS);
    onApply();

    let rafA = 0;
    let rafB = 0;
    rafA = window.requestAnimationFrame(() => {
        rafB = window.requestAnimationFrame(() => {
            root.classList.remove(THEME_SWITCHING_CLASS);
        });
    });

    return () => {
        window.cancelAnimationFrame(rafA);
        window.cancelAnimationFrame(rafB);
        root.classList.remove(THEME_SWITCHING_CLASS);
    };
}

export const useTheme = () => {
    const [theme, setTheme] = useState(() => {
        try {
            return localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem(LEGACY_THEME_STORAGE_KEY) || 'dark';
        } catch {
            return 'dark';
        }
    });
    const transitionCleanupRef = useRef(null);

    useLayoutEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        persistTheme(theme);
    }, [theme]);

    useLayoutEffect(() => {
        return () => {
            if (transitionCleanupRef.current) {
                transitionCleanupRef.current();
                transitionCleanupRef.current = null;
            }
        };
    }, []);

    const toggleTheme = useCallback(() => {
        setTheme((prev) => {
            const next = prev === 'dark' ? 'light' : 'dark';
            if (typeof document !== 'undefined' && typeof window !== 'undefined') {
                if (transitionCleanupRef.current) {
                    transitionCleanupRef.current();
                }
                transitionCleanupRef.current = withTransitionGuard(() => {
                    document.documentElement.setAttribute('data-theme', next);
                });
            } else {
                persistTheme(next);
            }
            return next;
        });
    }, []);

    return { theme, toggleTheme };
};

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export const ThemeToggleButton = React.memo(() => {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-2 rounded-full hover:bg-[var(--glass-border)] transition-colors text-[var(--text-muted)] hover:text-[var(--accent-primary)]"
        >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
    );
});

ThemeToggleButton.displayName = 'ThemeToggleButton';

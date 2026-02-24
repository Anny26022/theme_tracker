import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { VIEWS } from '../hooks/useUrlState';
import { cn } from '../lib/utils';

export const Navbar = ({ view, navigate, theme, toggleTheme, sectors, currentSector }) => (
    <nav className="fixed top-0 inset-x-0 z-50 px-8 py-3 border-b bg-[var(--nav-bg)] backdrop-blur-xl transition-colors duration-400">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-6">
                <h1
                    className="text-[10px] font-bold tracking-[0.4em] uppercase cursor-pointer"
                    onClick={() => navigate(VIEWS.UNIVERSE)}
                >
                    Nexus<span className="text-[#c5a059]">Map</span>
                </h1>
                <div className="flex items-center gap-4 text-[8px] uppercase tracking-[0.3em] font-bold ml-4 border-l pl-6 border-[var(--ui-divider)]">
                    <span
                        className={cn(
                            "cursor-pointer hover:text-[var(--accent-primary)] transition-colors uppercase py-1 px-2 rounded",
                            view === VIEWS.UNIVERSE ? "text-[var(--accent-primary)] bg-[var(--accent-primary)]/5" : "text-[var(--text-muted)]"
                        )}
                        onClick={() => navigate(VIEWS.UNIVERSE)}
                    >Universe</span>

                    <span
                        className={cn(
                            "cursor-pointer hover:text-[var(--accent-primary)] transition-colors uppercase py-1 px-2 rounded",
                            view === VIEWS.DOMAIN || view === VIEWS.SECTOR || view === VIEWS.INDUSTRY ? "text-[var(--accent-primary)] bg-[var(--accent-primary)]/5" : "text-[var(--text-muted)]"
                        )}
                        onClick={() => navigate(VIEWS.DOMAIN)}
                    >Domain Vector</span>

                    <span
                        className={cn(
                            "cursor-pointer hover:text-[var(--accent-primary)] transition-colors uppercase py-1 px-2 rounded",
                            view === VIEWS.TRACKER ? "text-[var(--accent-primary)] bg-[var(--accent-primary)]/5" : "text-[var(--text-muted)]"
                        )}
                        onClick={() => navigate(VIEWS.TRACKER)}
                    >Tracker</span>

                    <span
                        className={cn(
                            "cursor-pointer hover:text-[var(--accent-primary)] transition-colors uppercase py-1 px-2 rounded",
                            view === VIEWS.COMPARE ? "text-[var(--accent-primary)] bg-[var(--accent-primary)]/5" : "text-[var(--text-muted)]"
                        )}
                        onClick={() => navigate(VIEWS.COMPARE)}
                    >Comparison</span>
                </div>
            </div>

            <div className="flex items-center gap-8">
                <div className="flex items-center gap-6">
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-full hover:bg-[var(--glass-border)] transition-colors text-[var(--text-muted)] hover:text-[var(--accent-primary)]"
                    >
                        {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-[4px] h-[4px] rounded-full bg-[#af8a44] dark:bg-[#c5a059] shadow-[0_0_8px_rgba(197,160,89,0.5)] animate-pulse" />
                        <span className="text-[8px] font-bold text-[var(--accent-primary)] uppercase tracking-[0.4em]">Live</span>
                    </div>
                </div>
            </div>
        </div>
    </nav>
);

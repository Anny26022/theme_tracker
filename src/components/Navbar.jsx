import React from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { VIEWS } from '../hooks/useUrlState';
import { ThemeToggleButton } from './ThemeToggleButton';
import { cn } from '../lib/utils';
import { Menu, X } from 'lucide-react';

export const Navbar = React.memo(({ view, navigate }) => {
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);

    const navLinks = [
        { label: 'Universe', view: VIEWS.UNIVERSE },
        { label: 'Domain Vector', view: VIEWS.DOMAIN, match: [VIEWS.DOMAIN, VIEWS.SECTOR, VIEWS.INDUSTRY] },
        { label: 'Tracker', view: VIEWS.TRACKER },
        { label: 'Comparison', view: VIEWS.COMPARE },
    ];

    const isActive = (item) => {
        if (item.match) return item.match.includes(view);
        return view === item.view;
    };

    const handleNavigate = (v) => {
        navigate(v);
        setIsMenuOpen(false);
    };

    return (
        <nav className="fixed top-0 inset-x-0 z-50 px-4 md:px-8 py-3 border-b border-[var(--ui-divider)] bg-[var(--nav-bg)] backdrop-blur-xl transition-colors duration-200">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-4 md:gap-6">
                    <button
                        type="button"
                        className="text-[10px] font-bold tracking-[0.4em] uppercase cursor-pointer z-50"
                        onClick={() => handleNavigate(VIEWS.UNIVERSE)}
                    >
                        Nexus<span className="text-[#c5a059]">Map</span>
                    </button>

                    {/* Desktop Links */}
                    <div className="hidden md:flex items-center gap-4 text-[8px] uppercase tracking-[0.3em] font-bold ml-4 border-l pl-6 border-[var(--ui-divider)]">
                        {navLinks.map((item) => (
                            <button
                                key={item.label}
                                type="button"
                                className={cn(
                                    "cursor-pointer hover:text-[var(--accent-primary)] transition-colors uppercase py-1 px-2 rounded",
                                    isActive(item) ? "text-[var(--accent-primary)] bg-[var(--accent-primary)]/5" : "text-[var(--text-muted)]"
                                )}
                                onClick={() => navigate(item.view)}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-4 md:gap-8">
                    <div className="flex items-center gap-4 md:gap-6">
                        <ThemeToggleButton />
                        <div className="flex items-center gap-2">
                            <div className="w-[4px] h-[4px] rounded-full bg-[#af8a44] dark:bg-[#c5a059] shadow-[0_0_8px_rgba(197,160,89,0.5)] animate-pulse" />
                            <span className="text-[8px] font-bold text-[var(--accent-primary)] uppercase tracking-[0.4em]">Live</span>
                        </div>
                    </div>

                    {/* Mobile Menu Toggle */}
                    <button
                        className="md:hidden text-[var(--text-main)] p-2 -mr-2"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                    >
                        {isMenuOpen ? <X size={18} /> : <Menu size={18} />}
                    </button>
                </div>
            </div>

            {/* Mobile Menu Overlay */}
            <AnimatePresence>
                {isMenuOpen && (
                    <m.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden border-t border-[var(--ui-divider)] bg-[var(--bg-main)]/95 backdrop-blur-2xl overflow-hidden"
                    >
                        <div className="flex flex-col p-6 gap-4">
                            {navLinks.map((item) => (
                                <button
                                    key={item.label}
                                    type="button"
                                    className={cn(
                                        "text-left text-[10px] font-bold tracking-[0.3em] uppercase py-3 px-4 rounded transition-all",
                                        isActive(item)
                                            ? "text-[var(--accent-primary)] bg-[var(--accent-primary)]/10 border-l-2 border-[var(--accent-primary)]"
                                            : "text-[var(--text-muted)]"
                                    )}
                                    onClick={() => handleNavigate(item.view)}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </m.div>
                )}
            </AnimatePresence>
        </nav>
    );
});

Navbar.displayName = 'Navbar';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DARK_THEME, LIGHT_THEME } from '../theme/constants';

type ThemeType = 'dark' | 'light';

interface ThemeContextType {
    theme: ThemeType;
    isDark: boolean;
    colors: typeof DARK_THEME;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'nexus_app_theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useState<ThemeType>('dark');

    useEffect(() => {
        const loadTheme = async () => {
            const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
            if (savedTheme) {
                setTheme(savedTheme as ThemeType);
            } else {
                const colorScheme = Appearance.getColorScheme();
                if (colorScheme === 'light' || colorScheme === 'dark') {
                    setTheme(colorScheme);
                }
            }
        };
        loadTheme();
    }, []);

    const toggleTheme = async () => {
        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
        await AsyncStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    };

    const colors = theme === 'dark' ? DARK_THEME : LIGHT_THEME;

    return (
        <ThemeContext.Provider value={{ theme, isDark: theme === 'dark', colors, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

import React from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Menu, X, Sun, Moon } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';

interface NavbarProps {
    view: string;
    navigate: (view: string) => void;
}

export const Navbar = ({ view, navigate }: NavbarProps) => {
    const { isDark, toggleTheme, colors } = useTheme();
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);
    const menuAnim = React.useRef(new Animated.Value(0)).current;

    const navLinks = [
        { label: 'Universe', view: 'UNIVERSE' },
        { label: 'Domain Vector', view: 'DOMAIN', matches: ['DOMAIN', 'SECTOR', 'INDUSTRY'] },
        { label: 'Tracker', view: 'TRACKER' },
        { label: 'Comparison', view: 'COMPARE' },
    ];

    const isActive = (item: any) => {
        if (item.matches) return item.matches.includes(view);
        return view === item.view;
    };

    const toggleMenu = () => {
        if (isMenuOpen) {
            Animated.timing(menuAnim, { toValue: 0, duration: 300, useNativeDriver: false }).start(() => setIsMenuOpen(false));
        } else {
            setIsMenuOpen(true);
            Animated.timing(menuAnim, { toValue: 1, duration: 300, useNativeDriver: false }).start();
        }
    };

    const handleNavigate = (v: string) => {
        navigate(v);
        if (isMenuOpen) toggleMenu();
    };

    const currentStyles = styles(colors, isDark);

    return (
        <View style={currentStyles.container}>
            <View style={currentStyles.content}>
                <Pressable onPress={() => handleNavigate('UNIVERSE')}>
                    <Text style={currentStyles.brand}>
                        Nexus<Text style={{ color: colors.accentPrimary }}>Map</Text>
                    </Text>
                </Pressable>

                <View style={currentStyles.rightActions}>
                    <Pressable
                        onPress={toggleTheme}
                        style={currentStyles.themeToggle}
                        hitSlop={10}
                    >
                        {isDark ?
                            <Sun size={18} color={colors.textMuted} /> :
                            <Moon size={18} color={colors.textMuted} />
                        }
                    </Pressable>
                    <View style={currentStyles.liveIndicator}>
                        <View style={currentStyles.pulse} />
                        <Text style={currentStyles.liveText}>Live</Text>
                    </View>
                    <Pressable onPress={toggleMenu} style={currentStyles.menuToggle}>
                        {isMenuOpen ? <X size={20} color={colors.textMain} /> : <Menu size={20} color={colors.textMain} />}
                    </Pressable>
                </View>
            </View>

            {isMenuOpen && (
                <Animated.View style={[currentStyles.mobileMenu, { opacity: menuAnim, maxHeight: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 300] }) }]}>
                    {navLinks.map((item) => (
                        <Pressable
                            key={item.label}
                            onPress={() => handleNavigate(item.view)}
                            style={[currentStyles.menuItem, isActive(item) && currentStyles.activeMenuItem]}
                        >
                            <Text style={[currentStyles.menuItemText, isActive(item) && currentStyles.activeMenuItemText]}>
                                {item.label}
                            </Text>
                        </Pressable>
                    ))}
                </Animated.View>
            )}
        </View>
    );
};

const styles = (colors: any, isDark: boolean) => StyleSheet.create({
    container: {
        backgroundColor: colors.navBg,
        borderBottomWidth: 1,
        borderBottomColor: colors.uiDivider,
        zIndex: 100,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        height: 60,
    },
    brand: {
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 4,
        textTransform: 'uppercase',
        color: colors.textMain,
    },
    rightActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    themeToggle: {
        padding: 4,
        marginRight: -4,
    },
    liveIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    pulse: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.accentPrimary,
    },
    liveText: {
        fontSize: 8,
        fontWeight: 'bold',
        color: colors.accentPrimary,
        letterSpacing: 3,
        textTransform: 'uppercase',
    },
    menuToggle: {
        padding: 4,
    },
    mobileMenu: {
        backgroundColor: isDark ? 'rgba(5, 5, 8, 0.95)' : 'rgba(248, 249, 250, 0.95)',
        borderTopWidth: 1,
        borderTopColor: colors.uiDivider,
        padding: 12,
        gap: 8,
        overflow: 'hidden',
    },
    menuItem: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 4,
    },
    activeMenuItem: {
        backgroundColor: isDark ? 'rgba(197, 160, 89, 0.1)' : 'rgba(139, 110, 63, 0.1)',
        borderLeftWidth: 2,
        borderLeftColor: colors.accentPrimary,
    },
    menuItemText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: colors.textMuted,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    activeMenuItemText: {
        color: colors.accentPrimary,
    }
});

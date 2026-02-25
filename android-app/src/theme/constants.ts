export const DARK_THEME = {
    bgMain: "#050508",
    textMain: "#ffffff",
    textMuted: "rgba(255, 255, 255, 0.4)",
    accentPrimary: "#c5a059",
    accentSecondary: "#4f46e5",
    glassBg: "rgba(255, 255, 255, 0.03)",
    glassBorder: "rgba(255, 255, 255, 0.08)",
    navBg: "rgba(0, 0, 0, 0.6)",
    uiDivider: "rgba(255, 255, 255, 0.05)",
    uiMuted: "rgba(255, 255, 255, 0.1)",
    // Specific glow/accent colors
    blue: { border: "rgba(59, 130, 246, 0.4)", text: "rgba(147, 197, 253, 1)", glow: "rgba(59, 130, 246, 0.5)" },
    gold: { border: "rgba(245, 158, 11, 0.4)", text: "rgba(252, 211, 77, 1)", glow: "rgba(234, 179, 8, 0.5)" },
    emerald: { border: "rgba(16, 185, 129, 0.4)", text: "rgba(110, 231, 183, 1)" },
    purple: { border: "rgba(168, 85, 247, 0.2)", text: "rgba(192, 132, 252, 1)" },
    rose: { border: "rgba(244, 63, 94, 0.2)", text: "rgba(251, 113, 133, 1)" },
    cyan: { border: "rgba(6, 182, 212, 0.2)", text: "rgba(34, 211, 238, 1)" },
};

export const LIGHT_THEME = {
    bgMain: "#f8f9fa",
    textMain: "#1a1a1a",
    textMuted: "rgba(0, 0, 0, 0.5)",
    accentPrimary: "#8b6e3f",
    accentSecondary: "#3b3491",
    glassBg: "rgba(0, 0, 0, 0.02)",
    glassBorder: "rgba(0, 0, 0, 0.06)",
    navBg: "rgba(255, 255, 255, 0.8)",
    uiDivider: "rgba(0, 0, 0, 0.04)",
    uiMuted: "rgba(0, 0, 0, 0.08)",
    // Specific glow/accent colors
    blue: { border: "rgba(59, 130, 246, 0.3)", text: "#2563eb", glow: "rgba(59, 130, 246, 0.2)" },
    gold: { border: "rgba(245, 158, 11, 0.3)", text: "#d97706", glow: "rgba(234, 179, 8, 0.2)" },
    emerald: { border: "rgba(16, 185, 129, 0.3)", text: "#059669" },
    purple: { border: "rgba(168, 85, 247, 0.15)", text: "#7c3aed" },
    rose: { border: "rgba(244, 63, 94, 0.15)", text: "#e11d48" },
    cyan: { border: "rgba(6, 182, 212, 0.15)", text: "#0891b2" },
};

export const COLORS = DARK_THEME;

export const TYPOGRAPHY = {
    fontFamily: "Outfit", // You may need to import Outfit in RN
    textLuxury: {
        fontWeight: "500",
        letterSpacing: 2,
        textTransform: "uppercase",
        color: "#ffffff",
    },
    smallBold: {
        fontSize: 9,
        fontWeight: "bold",
        letterSpacing: 2,
        textTransform: "uppercase",
    }
};

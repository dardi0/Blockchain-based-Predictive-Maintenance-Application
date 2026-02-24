export interface ThemeColors {
    id: string;
    name: string;
    description: string;
    accentPrimary: string;      // Main accent (buttons, active states)
    accentHover: string;        // Hover state for primary accent
    accentHighlight: string;    // Secondary accent (badges, highlights)
    darkBg: string;             // Dark mode background
    darkBgSecondary: string;    // Dark mode secondary background
    darkBgDeep: string;         // Dark mode deepest background (for page bg)
    lightBg: string;            // Light mode background
    lightBgSecondary: string;   // Light mode secondary tint
    lightBgTertiary: string;    // Light mode tertiary tint
    accentGlow: string;         // Glow effect rgba
    highlightGlow: string;      // Highlight glow rgba
    scrollbarThumb: string;     // Scrollbar gradient start
    scrollbarThumbEnd: string;  // Scrollbar gradient end
    // RGB variants for rgba() usage in CSS
    accentPrimaryRgb: string;
    accentHighlightRgb: string;
    lightBgRgb: string;
    darkBgRgb: string;
    darkBgDeepRgb: string;
}

function hexToRgb(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r}, ${g}, ${b}`;
}

function darken(hex: string, amount: number): string {
    const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
    const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
    const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function lighten(hex: string, amount: number): string {
    const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
    const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
    const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function buildTheme(
    id: string,
    name: string,
    description: string,
    accent: string,
    highlight: string,
    darkBase: string,
    lightBase: string
): ThemeColors {
    const darkDeep = darken(darkBase, 15);
    return {
        id,
        name,
        description,
        accentPrimary: accent,
        accentHover: darken(accent, 22),
        accentHighlight: highlight,
        darkBg: darkBase,
        darkBgSecondary: lighten(darkBase, 12),
        darkBgDeep: darkDeep,
        lightBg: lightBase,
        lightBgSecondary: darken(lightBase, 20),
        lightBgTertiary: darken(lightBase, 10),
        accentGlow: `rgba(${hexToRgb(accent)}, 0.35)`,
        highlightGlow: `rgba(${hexToRgb(highlight)}, 0.25)`,
        scrollbarThumb: accent,
        scrollbarThumbEnd: darken(accent, 30),
        accentPrimaryRgb: hexToRgb(accent),
        accentHighlightRgb: hexToRgb(highlight),
        lightBgRgb: hexToRgb(lightBase),
        darkBgRgb: hexToRgb(darkBase),
        darkBgDeepRgb: hexToRgb(darkDeep),
    };
}

export const THEMES: ThemeColors[] = [
    buildTheme('ocean-depths', 'Ocean Depths', 'Derin deniz tonları, profesyonel ve sakin', '#2d8b8b', '#a8dadc', '#1a2332', '#f1faee'),
    buildTheme('arctic-frost', 'Arctic Frost', 'Buz mavisi, temiz ve keskin', '#4a6fa5', '#d4e4f7', '#2a3a4e', '#fafafa'),
    buildTheme('botanical-garden', 'Botanical Garden', 'Doğal yeşil ve çiçek tonları', '#4a7c59', '#f9a620', '#2a3a2b', '#f5f3ed'),
    buildTheme('desert-rose', 'Desert Rose', 'Yumuşak pembe ve toprak tonları', '#b87d6d', '#d4a5a5', '#5d2e46', '#e8d5c4'),
    buildTheme('forest-canopy', 'Forest Canopy', 'Orman yeşili ve doğa tonları', '#2d4a2b', '#a4ac86', '#1a2e1a', '#faf9f6'),
    buildTheme('golden-hour', 'Golden Hour', 'Sıcak altın ve sonbahar tonları', '#f4a900', '#c1666b', '#4a403a', '#d4b896'),
    buildTheme('midnight-galaxy', 'Midnight Galaxy', 'Kozmik mor ve mistik tonlar', '#4a4e8f', '#a490c2', '#2b1e3e', '#e6e6fa'),
    buildTheme('modern-minimalist', 'Modern Minimalist', 'Sade gri ve sofistike tonlar', '#708090', '#d3d3d3', '#36454f', '#ffffff'),
    buildTheme('sunset-boulevard', 'Sunset Boulevard', 'Turuncu ve sıcak gün batımı', '#e76f51', '#f4a261', '#264653', '#e9c46a'),
    buildTheme('tech-innovation', 'Tech Innovation', 'Elektrik mavisi ve neon', '#0066ff', '#00e5ff', '#1e1e1e', '#ffffff'),
];

export const DEFAULT_THEME_ID = 'ocean-depths';

export function getThemeById(id: string): ThemeColors {
    return THEMES.find(t => t.id === id) || THEMES[0];
}

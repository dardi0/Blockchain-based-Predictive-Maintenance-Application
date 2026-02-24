'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserSettings, defaultUserSettings } from '../types';
import { getThemeById, ThemeColors } from '../config/themes';

const SETTINGS_STORAGE_KEY = 'pdm_user_settings';

interface SettingsContextType {
    settings: UserSettings;
    currentTheme: ThemeColors;
    updateSettings: (newSettings: Partial<UserSettings>) => void;
    updateProfileSettings: (profile: Partial<UserSettings['profile']>) => void;
    updateNotificationSettings: (notifications: Partial<UserSettings['notifications']>) => void;
    updateDisplaySettings: (display: Partial<UserSettings['display']>) => void;
    updateBlockchainSettings: (blockchain: Partial<UserSettings['blockchain']>) => void;
    updateMachinePreferences: (preferences: Partial<UserSettings['machinePreferences']>) => void;
    updateDataPrivacySettings: (privacy: Partial<UserSettings['dataPrivacy']>) => void;
    resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};

interface SettingsProviderProps {
    children: ReactNode;
}

function applyThemeColors(theme: ThemeColors) {
    const root = document.documentElement;
    // Core accent colors
    root.style.setProperty('--accent-primary', theme.accentPrimary);
    root.style.setProperty('--accent-hover', theme.accentHover);
    root.style.setProperty('--accent-highlight', theme.accentHighlight);
    // Background colors
    root.style.setProperty('--dark-bg', theme.darkBg);
    root.style.setProperty('--dark-bg-secondary', theme.darkBgSecondary);
    root.style.setProperty('--dark-bg-deep', theme.darkBgDeep);
    root.style.setProperty('--light-bg', theme.lightBg);
    root.style.setProperty('--light-bg-secondary', theme.lightBgSecondary);
    root.style.setProperty('--light-bg-tertiary', theme.lightBgTertiary);
    // Effects
    root.style.setProperty('--accent-glow', theme.accentGlow);
    root.style.setProperty('--accent-highlight-glow', theme.highlightGlow);
    root.style.setProperty('--scrollbar-thumb', theme.scrollbarThumb);
    root.style.setProperty('--scrollbar-thumb-end', theme.scrollbarThumbEnd);
    // RGB variants for rgba() usage
    root.style.setProperty('--accent-primary-rgb', theme.accentPrimaryRgb);
    root.style.setProperty('--accent-highlight-rgb', theme.accentHighlightRgb);
    root.style.setProperty('--light-bg-rgb', theme.lightBgRgb);
    root.style.setProperty('--dark-bg-rgb', theme.darkBgRgb);
    root.style.setProperty('--dark-bg-deep-rgb', theme.darkBgDeepRgb);
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
    const [settings, setSettings] = useState<UserSettings>(defaultUserSettings);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load settings from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                setSettings({ ...defaultUserSettings, ...parsed });
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
        setIsLoaded(true);
    }, []);

    // Save settings to localStorage whenever they change
    useEffect(() => {
        if (isLoaded) {
            try {
                localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
            } catch (error) {
                console.error('Failed to save settings:', error);
            }
        }
    }, [settings, isLoaded]);

    // Apply light/dark theme
    useEffect(() => {
        if (isLoaded) {
            const root = document.documentElement;
            if (settings.display.theme === 'dark') {
                root.classList.add('dark');
            } else if (settings.display.theme === 'light') {
                root.classList.remove('dark');
            } else {
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (prefersDark) {
                    root.classList.add('dark');
                } else {
                    root.classList.remove('dark');
                }
            }
        }
    }, [settings.display.theme, isLoaded]);

    // Apply color theme
    const currentTheme = getThemeById(settings.display.colorTheme || 'ocean-depths');

    useEffect(() => {
        if (isLoaded) {
            applyThemeColors(currentTheme);
        }
    }, [currentTheme, isLoaded]);

    const updateSettings = (newSettings: Partial<UserSettings>) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    };

    const updateProfileSettings = (profile: Partial<UserSettings['profile']>) => {
        setSettings(prev => ({
            ...prev,
            profile: { ...prev.profile, ...profile }
        }));
    };

    const updateNotificationSettings = (notifications: Partial<UserSettings['notifications']>) => {
        setSettings(prev => ({
            ...prev,
            notifications: { ...prev.notifications, ...notifications }
        }));
    };

    const updateDisplaySettings = (display: Partial<UserSettings['display']>) => {
        setSettings(prev => ({
            ...prev,
            display: { ...prev.display, ...display }
        }));
    };

    const updateBlockchainSettings = (blockchain: Partial<UserSettings['blockchain']>) => {
        setSettings(prev => ({
            ...prev,
            blockchain: { ...prev.blockchain, ...blockchain }
        }));
    };

    const updateMachinePreferences = (preferences: Partial<UserSettings['machinePreferences']>) => {
        setSettings(prev => ({
            ...prev,
            machinePreferences: { ...prev.machinePreferences, ...preferences }
        }));
    };

    const updateDataPrivacySettings = (privacy: Partial<UserSettings['dataPrivacy']>) => {
        setSettings(prev => ({
            ...prev,
            dataPrivacy: { ...prev.dataPrivacy, ...privacy }
        }));
    };

    const resetSettings = () => {
        setSettings(defaultUserSettings);
        localStorage.removeItem(SETTINGS_STORAGE_KEY);
    };

    return (
        <SettingsContext.Provider
            value={{
                settings,
                currentTheme,
                updateSettings,
                updateProfileSettings,
                updateNotificationSettings,
                updateDisplaySettings,
                updateBlockchainSettings,
                updateMachinePreferences,
                updateDataPrivacySettings,
                resetSettings,
            }}
        >
            {children}
        </SettingsContext.Provider>
    );
};

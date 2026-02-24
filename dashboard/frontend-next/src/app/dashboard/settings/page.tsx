'use client';

import React, { useState } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { useDashboard } from '@/components/DashboardShell';
import { THEMES } from '@/config/themes';
import {
    User, Bell, Monitor, Wallet, Cpu, Shield, Save, RotateCcw,
    Sun, Moon, Globe, Mail, Volume2, Clock, Database, FileDown
} from 'lucide-react';

type SettingsTab = 'profile' | 'notifications' | 'display' | 'blockchain' | 'machines' | 'privacy';

export default function SettingsPage() {
    const { settings, updateProfileSettings, updateNotificationSettings, updateDisplaySettings,
        updateBlockchainSettings, updateMachinePreferences, updateDataPrivacySettings, resetSettings } = useSettings();
    const { user } = useDashboard();
    const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
    const [saveMessage, setSaveMessage] = useState('');

    const showSaveMessage = () => {
        setSaveMessage('Settings saved successfully!');
        setTimeout(() => setSaveMessage(''), 3000);
    };

    const tabs = [
        { id: 'profile' as SettingsTab, label: 'Profile', icon: User },
        { id: 'notifications' as SettingsTab, label: 'Notifications', icon: Bell },
        { id: 'display' as SettingsTab, label: 'Display', icon: Monitor },
        { id: 'blockchain' as SettingsTab, label: 'Blockchain', icon: Wallet },
        { id: 'machines' as SettingsTab, label: 'Machines', icon: Cpu },
        { id: 'privacy' as SettingsTab, label: 'Data & Privacy', icon: Shield },
    ];

    const renderProfileSettings = () => (
        <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white">Profile Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">Display Name</label>
                    <input
                        type="text"
                        value={settings.profile.displayName}
                        onChange={(e) => updateProfileSettings({ displayName: e.target.value })}
                        placeholder="Enter your name"
                        className="w-full px-4 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] text-white placeholder:text-white/20 focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">Email Address</label>
                    <input
                        type="email"
                        value={settings.profile.email}
                        onChange={(e) => updateProfileSettings({ email: e.target.value })}
                        placeholder="your@email.com"
                        className="w-full px-4 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] text-white placeholder:text-white/20 focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">
                        <Globe className="inline w-4 h-4 mr-1" /> Language
                    </label>
                    <select
                        value={settings.profile.language}
                        onChange={(e) => updateProfileSettings({ language: e.target.value as 'en' | 'tr' })}
                        className="w-full px-4 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                    >
                        <option value="en" className="bg-[#0a1020]">English</option>
                        <option value="tr" className="bg-[#0a1020]">Türkçe</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">Connected Wallet</label>
                    <div className="px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/40 font-mono text-sm">
                        {user?.address || 'Not connected'}
                    </div>
                </div>
            </div>
        </div>
    );

    const renderNotificationSettings = () => (
        <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white">Notification Settings</h3>
            <div className="space-y-4">
                {[
                    { key: 'criticalFailureAlerts', label: 'Critical Failure Alerts', desc: 'Get notified when critical failures are detected' },
                    { key: 'highWearAlerts', label: 'High Wear Alerts', desc: 'Alert when tool wear exceeds threshold' },
                    { key: 'maintenanceReminders', label: 'Maintenance Reminders', desc: 'Receive scheduled maintenance reminders' },
                    { key: 'emailNotifications', label: 'Email Notifications', desc: 'Send alerts to your email', icon: Mail },
                    { key: 'pushNotifications', label: 'Push Notifications', desc: 'Browser push notifications', icon: Volume2 },
                ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/[0.07] rounded-xl">
                        <div>
                            <p className="font-medium text-white">
                                {item.icon && <item.icon className="inline w-4 h-4 mr-1" />}
                                {item.label}
                            </p>
                            <p className="text-sm text-white/40">{item.desc}</p>
                        </div>
                        <ToggleSwitch
                            checked={(settings.notifications as any)[item.key]}
                            onChange={(val) => updateNotificationSettings({ [item.key]: val })}
                        />
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">Tool Wear Alert Threshold (minutes)</label>
                    <input
                        type="number"
                        value={settings.notifications.toolWearThreshold}
                        onChange={(e) => updateNotificationSettings({ toolWearThreshold: parseInt(e.target.value) || 200 })}
                        min="50" max="300"
                        className="w-full px-4 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">Failure Probability Threshold (%)</label>
                    <input
                        type="number"
                        value={settings.notifications.failureProbabilityThreshold}
                        onChange={(e) => updateNotificationSettings({ failureProbabilityThreshold: parseInt(e.target.value) || 70 })}
                        min="10" max="100"
                        className="w-full px-4 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                    />
                </div>
            </div>
        </div>
    );

    const renderDisplaySettings = () => (
        <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white">Display Settings</h3>
            <div>
                <label className="block text-sm font-medium text-white/60 mb-3">Color Theme</label>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {THEMES.map((theme) => {
                        const isSelected = settings.display.colorTheme === theme.id;
                        return (
                            <button
                                key={theme.id}
                                onClick={() => updateDisplaySettings({ colorTheme: theme.id })}
                                className={`relative group p-3 rounded-xl border-2 transition-all duration-300 text-left hover:-translate-y-0.5 hover:shadow-lg ${isSelected
                                    ? 'border-current ring-2 ring-offset-2 ring-offset-[#060b14] shadow-lg scale-[1.02]'
                                    : 'border-white/[0.07] hover:border-white/[0.14]'
                                    }`}
                                style={isSelected ? { borderColor: theme.accentPrimary, ['--tw-ring-color' as string]: theme.accentPrimary } : {}}
                            >
                                <div className="flex gap-1 mb-2">
                                    <div className="w-6 h-6 rounded-full border border-white/30 shadow-sm" style={{ backgroundColor: theme.accentPrimary }} title="Primary" />
                                    <div className="w-6 h-6 rounded-full border border-white/30 shadow-sm" style={{ backgroundColor: theme.accentHighlight }} title="Highlight" />
                                    <div className="w-6 h-6 rounded-full border border-white/30 shadow-sm" style={{ backgroundColor: theme.darkBg }} title="Dark BG" />
                                    <div className="w-6 h-6 rounded-full border border-white/30 shadow-sm" style={{ backgroundColor: theme.lightBg }} title="Light BG" />
                                </div>
                                <p className="text-xs font-bold text-white truncate">{theme.name}</p>
                                <p className="text-[10px] text-white/40 truncate">{theme.description}</p>
                                {isSelected && (
                                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: theme.accentPrimary }}>
                                        ✓
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <hr className="border-white/[0.07]" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">Light / Dark Mode</label>
                    <div className="flex gap-2">
                        {[
                            { value: 'light', icon: Sun, label: 'Light' },
                            { value: 'dark', icon: Moon, label: 'Dark' },
                            { value: 'system', icon: Monitor, label: 'System' },
                        ].map((theme) => (
                            <button
                                key={theme.value}
                                onClick={() => updateDisplaySettings({ theme: theme.value as 'light' | 'dark' | 'system' })}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border ${
                                    settings.display.theme === theme.value
                                        ? 'border-[var(--accent-primary)] text-[var(--accent-highlight)]'
                                        : 'border-white/[0.07] text-white/40'
                                }`}
                                style={settings.display.theme === theme.value ? {
                                    borderColor: 'var(--accent-primary)',
                                    color: 'var(--accent-highlight)',
                                    backgroundColor: 'color-mix(in srgb, var(--accent-highlight) 10%, transparent)'
                                } : {}}
                            >
                                <theme.icon className="w-4 h-4" />
                                {theme.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">
                        <Clock className="inline w-4 h-4 mr-1" /> Dashboard Refresh Interval
                    </label>
                    <select
                        value={settings.display.refreshInterval}
                        onChange={(e) => updateDisplaySettings({ refreshInterval: parseInt(e.target.value) as 5 | 10 | 30 | 60 })}
                        className="w-full px-4 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                    >
                        <option value={5} className="bg-[#0a1020]">5 seconds</option>
                        <option value={10} className="bg-[#0a1020]">10 seconds</option>
                        <option value={30} className="bg-[#0a1020]">30 seconds</option>
                        <option value={60} className="bg-[#0a1020]">1 minute</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">Date Format</label>
                    <select
                        value={settings.display.dateFormat}
                        onChange={(e) => updateDisplaySettings({ dateFormat: e.target.value as 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' })}
                        className="w-full px-4 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                    >
                        <option value="DD.MM.YYYY" className="bg-[#0a1020]">DD.MM.YYYY (29.01.2026)</option>
                        <option value="MM/DD/YYYY" className="bg-[#0a1020]">MM/DD/YYYY (01/29/2026)</option>
                        <option value="YYYY-MM-DD" className="bg-[#0a1020]">YYYY-MM-DD (2026-01-29)</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">Temperature Unit</label>
                    <select
                        value={settings.display.temperatureUnit}
                        onChange={(e) => updateDisplaySettings({ temperatureUnit: e.target.value as 'K' | 'C' | 'F' })}
                        className="w-full px-4 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                    >
                        <option value="K" className="bg-[#0a1020]">Kelvin (K)</option>
                        <option value="C" className="bg-[#0a1020]">Celsius (°C)</option>
                        <option value="F" className="bg-[#0a1020]">Fahrenheit (°F)</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">Chart Color Scheme</label>
                    <select
                        value={settings.display.chartColorScheme}
                        onChange={(e) => updateDisplaySettings({ chartColorScheme: e.target.value as 'default' | 'colorblind' | 'monochrome' })}
                        className="w-full px-4 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                    >
                        <option value="default" className="bg-[#0a1020]">Default</option>
                        <option value="colorblind" className="bg-[#0a1020]">Colorblind Friendly</option>
                        <option value="monochrome" className="bg-[#0a1020]">Monochrome</option>
                    </select>
                </div>
            </div>
        </div>
    );

    const renderBlockchainSettings = () => (
        <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white">Blockchain & Wallet Settings</h3>
            <div className="p-4 bg-white/[0.03] border border-white/[0.07] rounded-xl">
                <p className="text-sm font-medium text-white/60 mb-2">Connected Wallet</p>
                <p className="font-mono text-sm text-white break-all">
                    {user?.address || 'No wallet connected'}
                </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">Network</label>
                    <select
                        value={settings.blockchain.network}
                        onChange={(e) => updateBlockchainSettings({ network: e.target.value as 'zksync-sepolia' | 'zksync-mainnet' })}
                        className="w-full px-4 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                    >
                        <option value="zksync-sepolia" className="bg-[#0a1020]">zkSync Sepolia (Testnet)</option>
                        <option value="zksync-mainnet" className="bg-[#0a1020]">zkSync Era (Mainnet)</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">Gas Limit Preference</label>
                    <select
                        value={settings.blockchain.gasLimitPreference}
                        onChange={(e) => updateBlockchainSettings({ gasLimitPreference: e.target.value as 'low' | 'medium' | 'high' })}
                        className="w-full px-4 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                    >
                        <option value="low" className="bg-[#0a1020]">Low (Slower, Cheaper)</option>
                        <option value="medium" className="bg-[#0a1020]">Medium (Balanced)</option>
                        <option value="high" className="bg-[#0a1020]">High (Faster, Expensive)</option>
                    </select>
                </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/[0.07] rounded-xl">
                <div>
                    <p className="font-medium text-white">Auto-Sign Transactions</p>
                    <p className="text-sm text-white/40">Automatically sign blockchain transactions (not recommended)</p>
                </div>
                <ToggleSwitch
                    checked={settings.blockchain.autoSignTransactions}
                    onChange={(val) => updateBlockchainSettings({ autoSignTransactions: val })}
                />
            </div>
        </div>
    );

    const renderMachinePreferences = () => (
        <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white">Machine Preferences</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">Default Machine</label>
                    <select
                        value={settings.machinePreferences.defaultMachineId || ''}
                        onChange={(e) => updateMachinePreferences({ defaultMachineId: e.target.value ? parseInt(e.target.value) : null })}
                        className="w-full px-4 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                    >
                        <option value="" className="bg-[#0a1020]">No default</option>
                        <option value="1001" className="bg-[#0a1020]">L (ID: 1001)</option>
                        <option value="2001" className="bg-[#0a1020]">M (ID: 2001)</option>
                        <option value="3001" className="bg-[#0a1020]">H (ID: 3001)</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">Favorite Machines</label>
                    <div className="flex gap-2">
                        {[1001, 2001, 3001].map((id) => (
                            <button
                                key={id}
                                onClick={() => {
                                    const favs = settings.machinePreferences.favoriteMachines;
                                    if (favs.includes(id)) {
                                        updateMachinePreferences({ favoriteMachines: favs.filter(f => f !== id) });
                                    } else {
                                        updateMachinePreferences({ favoriteMachines: [...favs, id] });
                                    }
                                }}
                                className={`px-4 py-2 rounded-lg border transition-colors ${
                                    settings.machinePreferences.favoriteMachines.includes(id)
                                        ? 'border-amber-500/50 bg-amber-500/15 text-amber-400'
                                        : 'border-white/[0.07] text-white/40'
                                }`}
                            >
                                {id === 1001 ? 'L' : id === 2001 ? 'M' : 'H'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div className="p-4 bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 rounded-xl">
                <p className="text-sm text-[var(--accent-highlight)]">
                    <Cpu className="inline w-4 h-4 mr-1" />
                    Custom alert thresholds per machine can be configured here. Select a machine above to set custom thresholds.
                </p>
            </div>
        </div>
    );

    const renderPrivacySettings = () => (
        <div className="space-y-6">
            <h3 className="text-lg font-semibold text-white">Data & Privacy Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">
                        <Database className="inline w-4 h-4 mr-1" /> Data Retention Period
                    </label>
                    <select
                        value={settings.dataPrivacy.dataRetentionDays}
                        onChange={(e) => updateDataPrivacySettings({ dataRetentionDays: parseInt(e.target.value) as 30 | 90 | 180 | 365 })}
                        className="w-full px-4 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                    >
                        <option value={30} className="bg-[#0a1020]">30 days</option>
                        <option value={90} className="bg-[#0a1020]">90 days</option>
                        <option value={180} className="bg-[#0a1020]">180 days</option>
                        <option value={365} className="bg-[#0a1020]">1 year</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">
                        <FileDown className="inline w-4 h-4 mr-1" /> Export Format
                    </label>
                    <select
                        value={settings.dataPrivacy.exportFormat}
                        onChange={(e) => updateDataPrivacySettings({ exportFormat: e.target.value as 'csv' | 'json' | 'pdf' })}
                        className="w-full px-4 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                    >
                        <option value="csv" className="bg-[#0a1020]">CSV</option>
                        <option value="json" className="bg-[#0a1020]">JSON</option>
                        <option value="pdf" className="bg-[#0a1020]">PDF</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-white/60 mb-2">
                        <Clock className="inline w-4 h-4 mr-1" /> Session Timeout
                    </label>
                    <select
                        value={settings.dataPrivacy.sessionTimeoutMinutes}
                        onChange={(e) => updateDataPrivacySettings({ sessionTimeoutMinutes: parseInt(e.target.value) as 15 | 30 | 60 | 120 })}
                        className="w-full px-4 py-2 rounded-lg border border-white/[0.07] bg-white/[0.03] text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                    >
                        <option value={15} className="bg-[#0a1020]">15 minutes</option>
                        <option value={30} className="bg-[#0a1020]">30 minutes</option>
                        <option value={60} className="bg-[#0a1020]">1 hour</option>
                        <option value={120} className="bg-[#0a1020]">2 hours</option>
                    </select>
                </div>
            </div>
            <div className="mt-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                <h4 className="font-medium text-red-400 mb-2">Danger Zone</h4>
                <p className="text-sm text-red-300 mb-4">
                    Reset all settings to their default values. This action cannot be undone.
                </p>
                <button
                    onClick={() => {
                        if (confirm('Are you sure you want to reset all settings?')) {
                            resetSettings();
                            showSaveMessage();
                        }
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                    <RotateCcw className="w-4 h-4" />
                    Reset All Settings
                </button>
            </div>
        </div>
    );

    const renderContent = () => {
        switch (activeTab) {
            case 'profile': return renderProfileSettings();
            case 'notifications': return renderNotificationSettings();
            case 'display': return renderDisplaySettings();
            case 'blockchain': return renderBlockchainSettings();
            case 'machines': return renderMachinePreferences();
            case 'privacy': return renderPrivacySettings();
            default: return null;
        }
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">Settings</h1>
                {saveMessage && (
                    <div className="px-4 py-2 bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 rounded-lg flex items-center gap-2">
                        <Save className="w-4 h-4" />
                        {saveMessage}
                    </div>
                )}
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Sidebar Tabs */}
                <div className="lg:w-64 flex-shrink-0">
                    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left ${
                                    activeTab === tab.id
                                        ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-highlight)] border-l-2 border-[var(--accent-primary)]'
                                        : 'text-white/40 hover:bg-white/[0.04] hover:text-white/70'
                                }`}
                            >
                                <tab.icon className="w-5 h-5" />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
}

const ToggleSwitch: React.FC<{ checked: boolean; onChange: (val: boolean) => void }> = ({ checked, onChange }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`
            relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
            transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2 focus:ring-offset-[#060b14]
            ${checked ? 'bg-[var(--accent-primary)]' : 'bg-white/[0.15]'}
        `}
    >
        <span
            className={`
                pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                transition duration-200 ease-in-out
                ${checked ? 'translate-x-5' : 'translate-x-0'}
            `}
        />
    </button>
);

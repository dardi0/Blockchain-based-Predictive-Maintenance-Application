'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Database, Link as LinkIcon, Activity, Settings, Menu, LogOut, UserCircle, ClipboardPen, Layers, BarChart3, Calendar, Wrench, Home, Radio, X } from 'lucide-react';
import { User, UserRole } from '../types';
import NotificationCenter from './NotificationCenter';

interface LayoutProps {
    children: React.ReactNode;
    user: User;
    onLogout: () => void;
}

const SidebarItem = ({ to, icon: Icon, label, active }: { to: string; icon: any; label: string; active: boolean }) => (
    <Link
        href={to}
        className={`group relative flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 ${active
            ? 'text-white'
            : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
            }`}
    >
        {/* Active indicator - corner accents */}
        {active && (
            <>
                <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
                <div className="absolute inset-0 rounded-xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20" />
            </>
        )}

        <div className={`relative p-1.5 rounded-lg transition-all duration-300 ${active
            ? 'bg-[var(--accent-primary)]/20'
            : 'bg-white/[0.04] group-hover:bg-white/[0.08]'
            }`}>
            <Icon size={16} className={active ? 'text-[var(--accent-highlight)]' : 'text-white/50 group-hover:text-white/70'} />
        </div>
        <span className="relative text-sm font-medium">{label}</span>
        {active && (
            <div className="relative ml-auto w-1.5 h-1.5 rounded-full bg-[var(--accent-highlight)] animate-pulse" />
        )}
    </Link>
);

const Layout: React.FC<LayoutProps> = ({ children, user, onLogout }) => {
    const pathname = usePathname();
    const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
    const DASHBOARD_BASE = '/dashboard';

    const isOwnerOrManager = [UserRole.MANAGER, UserRole.OWNER].includes(user.role);
    const isEngineer = user.role === UserRole.ENGINEER;
    const isOperator = user.role === UserRole.OPERATOR;

    const canViewDashboard = isOwnerOrManager;
    const canViewEngineerDashboard = isEngineer;
    const canViewMachines = [UserRole.MANAGER, UserRole.ENGINEER, UserRole.OWNER].includes(user.role);
    const canViewLedger = [UserRole.MANAGER, UserRole.ENGINEER, UserRole.OWNER].includes(user.role);
    const canViewReports = true;
    const canEnterSensors = [UserRole.OPERATOR, UserRole.OWNER].includes(user.role);
    const canViewAnalytics = [UserRole.MANAGER, UserRole.ENGINEER, UserRole.OWNER].includes(user.role);
    const canViewMaintenance = [UserRole.MANAGER, UserRole.ENGINEER, UserRole.OWNER].includes(user.role);
    const canViewAutomation = [UserRole.MANAGER, UserRole.ENGINEER, UserRole.OWNER].includes(user.role);
    const canViewSettings = true;
    const canViewAdmin = [UserRole.OWNER].includes(user.role);

    const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);

    const handleLogoutClick = () => {
        setShowLogoutConfirm(true);
    };

    const confirmLogout = () => {
        setShowLogoutConfirm(false);
        onLogout();
    };

    return (
        <div className="flex h-screen w-full overflow-hidden bg-[var(--dark-bg-deep)]">
            {/* Logout Confirmation Modal */}
            {showLogoutConfirm && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[60] flex items-center justify-center p-4">
                    <div className="relative w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#0c1322]/95 backdrop-blur-xl p-8 animate-zoom-in shadow-2xl shadow-black/50">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-5 border border-red-500/20 bg-red-500/10">
                                <LogOut size={26} className="text-red-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Disconnect Wallet?</h3>
                            <p className="text-white/60 text-sm mb-6">
                                Are you sure you want to disconnect your wallet and sign out?
                            </p>
                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => setShowLogoutConfirm(false)}
                                    className="flex-1 py-2.5 rounded-lg font-semibold text-white/70 border border-white/[0.08] hover:border-white/[0.15] bg-white/[0.03] hover:bg-white/[0.06] transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmLogout}
                                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold transition-colors"
                                    style={{ boxShadow: '0 0 20px rgba(239,68,68,0.2)' }}
                                >
                                    Disconnect
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Sidebar */}
            <div className={`
                fixed inset-y-0 left-0 z-50 w-64 bg-[#0a1020]/95 backdrop-blur-xl border-r border-white/[0.06] transform transition-transform duration-300 ease-in-out
                ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
                md:relative md:translate-x-0 flex flex-col
            `}>
                {/* Logo */}
                <Link href="/dashboard" className="relative p-5 flex items-center gap-3 border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors">
                    <div className="relative">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center border border-[var(--accent-primary)]/30"
                            style={{ background: 'linear-gradient(135deg, rgba(45,139,139,0.2), rgba(45,139,139,0.05))' }}>
                            <Activity size={20} className="text-[var(--accent-highlight)]" />
                        </div>
                        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--accent-highlight)] animate-pulse" />
                    </div>
                    <span className="text-lg font-bold tracking-tight">
                        <span className="text-white">Zero</span>
                        <span className="text-[var(--accent-highlight)]">PdM</span>
                        <span className="text-white/70 font-light ml-1">AI</span>
                    </span>
                </Link>

                {/* User Card */}
                <div className="px-4 py-4">
                    <div className="p-3 rounded-xl border border-white/[0.07] bg-white/[0.02]">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="relative">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                                    style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-highlight))' }}>
                                    <UserCircle size={18} />
                                </div>
                                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[var(--accent-highlight)] border-2 border-[#0a1020] rounded-full" />
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-xs font-bold text-white truncate">{user.name}</p>
                                <p className="text-[10px] font-bold text-[var(--accent-highlight)]/70 uppercase tracking-widest">{user.role}</p>
                            </div>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[9px] font-bold text-white/30 uppercase tracking-tighter">Wallet Address</p>
                            <a
                                href={`https://sepolia.explorer.zksync.io/address/${user.address}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-mono text-white/40 truncate hover:text-[var(--accent-highlight)] transition-all block bg-white/[0.03] p-1 rounded border border-white/[0.05]"
                            >
                                {user.address.slice(0, 8)}...{user.address.slice(-6)}
                            </a>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="px-3 space-y-0.5 mt-1 flex-1 overflow-y-auto">
                    {canViewDashboard && (
                        <SidebarItem
                            to={`${DASHBOARD_BASE}/overview`}
                            icon={LayoutDashboard}
                            label="Dashboard"
                            active={pathname === `${DASHBOARD_BASE}/overview` || pathname === DASHBOARD_BASE}
                        />
                    )}
                    {canViewEngineerDashboard && (
                        <SidebarItem
                            to={`${DASHBOARD_BASE}/engineer`}
                            icon={Home}
                            label="Command Center"
                            active={pathname === `${DASHBOARD_BASE}/engineer`}
                        />
                    )}
                    {isOperator && (
                        <SidebarItem
                            to={`${DASHBOARD_BASE}/sensor-entry`}
                            icon={Home}
                            label="Sensor Entry"
                            active={pathname === `${DASHBOARD_BASE}/sensor-entry`}
                        />
                    )}
                    {canViewAdmin && (
                        <SidebarItem
                            to={`${DASHBOARD_BASE}/admin`}
                            icon={Settings}
                            label="Admin Panel"
                            active={pathname === `${DASHBOARD_BASE}/admin`}
                        />
                    )}
                    {canViewMachines && (
                        <SidebarItem
                            to={`${DASHBOARD_BASE}/machines`}
                            icon={Database}
                            label="Machine Manager"
                            active={pathname === `${DASHBOARD_BASE}/machines` || pathname?.startsWith(`${DASHBOARD_BASE}/machines/`)}
                        />
                    )}
                    {canViewLedger && (
                        <SidebarItem
                            to={`${DASHBOARD_BASE}/ledger`}
                            icon={LinkIcon}
                            label="Blockchain Ledger"
                            active={pathname === `${DASHBOARD_BASE}/ledger`}
                        />
                    )}
                    {canViewReports && (
                        <SidebarItem
                            to={`${DASHBOARD_BASE}/reports`}
                            icon={Layers}
                            label="Reports"
                            active={pathname === `${DASHBOARD_BASE}/reports`}
                        />
                    )}
                    {canViewAnalytics && (
                        <SidebarItem
                            to={`${DASHBOARD_BASE}/analytics`}
                            icon={BarChart3}
                            label="Analytics"
                            active={pathname === `${DASHBOARD_BASE}/analytics`}
                        />
                    )}
                    {canViewMaintenance && (
                        <SidebarItem
                            to={`${DASHBOARD_BASE}/maintenance`}
                            icon={Wrench}
                            label="Maintenance"
                            active={pathname === `${DASHBOARD_BASE}/maintenance`}
                        />
                    )}
                    {canViewAutomation && (
                        <SidebarItem
                            to={`${DASHBOARD_BASE}/automation`}
                            icon={Radio}
                            label="Automation"
                            active={pathname === `${DASHBOARD_BASE}/automation`}
                        />
                    )}
                </nav>

                {/* Bottom Actions */}
                <div className="p-4 border-t border-white/[0.06]">
                    {canViewSettings && (
                        <Link href={`${DASHBOARD_BASE}/settings`} className="block mb-2">
                            <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.04] rounded-xl transition-all">
                                <Settings size={16} />
                                <span>Settings</span>
                            </button>
                        </Link>
                    )}
                    <button
                        onClick={handleLogoutClick}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl transition-all text-red-400/80 hover:text-red-400 border border-red-500/10 hover:border-red-500/20 bg-red-500/5 hover:bg-red-500/10"
                    >
                        <LogOut size={14} />
                        <span className="text-xs font-semibold">Disconnect Wallet</span>
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                {/* Mobile Header */}
                <header className="md:hidden h-14 bg-[#0a1020]/95 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between px-4 z-40">
                    <span className="font-bold text-lg">
                        <span className="text-white">Zero</span>
                        <span className="text-[var(--accent-highlight)]">PdM</span>
                    </span>
                    <div className="flex items-center gap-4">
                        <NotificationCenter walletAddress={user.address} />
                        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-white/60 hover:text-white/90 transition-colors">
                            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
                        </button>
                    </div>
                </header>

                {/* Desktop Header Bar */}
                <header className="hidden md:flex h-12 bg-[#0a1020]/80 backdrop-blur-xl border-b border-white/[0.06] items-center justify-between px-6 relative z-40">
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">zkSync Era Sepolia</span>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--accent-primary)]/15 bg-[var(--accent-primary)]/5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-emerald-400 text-[10px] font-medium">Active</span>
                        </div>
                    </div>
                    <NotificationCenter walletAddress={user.address} />
                </header>

                {/* Scrollable Area */}
                <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-[var(--dark-bg-deep)]">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>

            {/* Overlay for mobile */}
            {mobileMenuOpen && (
                <div
                    role="presentation"
                    aria-hidden="true"
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
                    onClick={() => setMobileMenuOpen(false)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setMobileMenuOpen(false); }}
                />
            )}
        </div>
    );
};

export default Layout;

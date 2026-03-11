'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard, Database, Link as LinkIcon, Activity, Settings,
    Menu, LogOut, Layers, BarChart3, Wrench, Home, Radio,
    X, ChevronLeft
} from 'lucide-react';
import { User, UserRole } from '../types';
import NotificationCenter from './NotificationCenter';

/* ── Avatar helpers ───────────────────────────────────────────────── */
export function profilePhotoKey(address: string) {
    return `profilePhoto_${address.toLowerCase()}`;
}

function getRoleColor(role: string): { ring: string; badge: string } {
    switch (role) {
        case 'OWNER': return { ring: 'rgba(251,191,36,0.5)', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/25' };
        case 'MANAGER': return { ring: 'rgba(139,92,246,0.5)', badge: 'bg-violet-500/15 text-violet-300 border-violet-500/25' };
        case 'ENGINEER': return { ring: 'rgba(45,139,139,0.6)', badge: 'bg-[var(--accent-primary)]/15 text-[var(--accent-highlight)] border-[var(--accent-primary)]/25' };
        case 'OPERATOR': return { ring: 'rgba(52,211,153,0.5)', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' };
        default: return { ring: 'rgba(100,116,139,0.5)', badge: 'bg-slate-700/50 text-slate-300 border-slate-600/30' };
    }
}

/**
 * Default avatar — person silhouette on dark circle.
 * Matches the UI shown in the screenshot.
 */
function PersonIcon({ dim }: { dim: string }) {
    return (
        <div className={`${dim} rounded-xl flex items-center justify-center flex-shrink-0 relative overflow-hidden`}
            style={{ background: 'linear-gradient(145deg, #c8d3db 0%, #a9b8c2 100%)' }}>
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-[70%] h-[70%]">
                {/* Head */}
                <circle cx="50" cy="35" r="16" fill="#1a2535" />
                {/* Body */}
                <path d="M15 85 C15 60 85 60 85 85" fill="#1a2535" />
            </svg>
        </div>
    );
}

function UserAvatar({ name, role, address, size = 'md' }: { name: string; role: string; address?: string; size?: 'sm' | 'md' }) {
    const color = getRoleColor(role);
    const dim = size === 'sm' ? 'w-9 h-9' : 'w-10 h-10';
    const [photo, setPhoto] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!address) return;
        const key = profilePhotoKey(address);
        const stored = localStorage.getItem(key);
        setPhoto(stored || null);

        // Same-tab updates from Settings page
        const onCustom = (e: Event) => {
            const detail = (e as CustomEvent<{ key: string; value: string | null }>).detail;
            if (detail.key === key) setPhoto(detail.value);
        };
        window.addEventListener('profilePhotoChanged', onCustom);
        return () => window.removeEventListener('profilePhotoChanged', onCustom);
    }, [address]);

    return (
        <div
            className={`${dim} rounded-xl flex-shrink-0 relative overflow-hidden`}
            style={{ boxShadow: `0 0 0 1.5px ${color.ring}, 0 4px 16px rgba(0,0,0,0.4)` }}
        >
            {photo ? (
                <img src={photo} alt={name} className="w-full h-full object-cover" />
            ) : (
                <PersonIcon dim="w-full h-full" />
            )}
        </div>
    );
}

interface LayoutProps {
    children: React.ReactNode;
    user: User;
    onLogout: () => void;
}

const SidebarItem = ({
    to, icon: Icon, label, active, collapsed
}: {
    to: string;
    icon: any;
    label: string;
    active: boolean;
    collapsed: boolean;
}) => (
    <Link
        href={to}
        title={collapsed ? label : undefined}
        className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300
            ${collapsed ? 'justify-center' : ''}
            ${active ? 'text-white' : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'}`}
    >
        {active && (
            <>
                <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
                <div className="absolute inset-0 rounded-xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20" />
            </>
        )}

        <div className={`relative p-1.5 rounded-lg transition-all duration-300 flex-shrink-0
            ${active ? 'bg-[var(--accent-primary)]/20' : 'bg-white/[0.04] group-hover:bg-white/[0.08]'}`}>
            <Icon size={16} className={active ? 'text-[var(--accent-highlight)]' : 'text-white/50 group-hover:text-white/70'} />
        </div>

        <span className={`relative text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-300
            ${collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
            {label}
        </span>

        {active && !collapsed && (
            <div className="relative ml-auto w-1.5 h-1.5 rounded-full bg-[var(--accent-highlight)] animate-pulse flex-shrink-0" />
        )}
    </Link>
);

const Layout: React.FC<LayoutProps> = ({ children, user, onLogout }) => {
    const pathname = usePathname();
    const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
    const [collapsed, setCollapsed] = React.useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('sidebarCollapsed') === 'true';
        }
        return false;
    });
    const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);

    const toggleCollapsed = () => {
        setCollapsed(prev => {
            const next = !prev;
            localStorage.setItem('sidebarCollapsed', String(next));
            return next;
        });
    };

    const DASHBOARD_BASE = '/dashboard';
    const isOwnerOrManager = [UserRole.MANAGER, UserRole.OWNER].includes(user.role);
    const isEngineer = user.role === UserRole.ENGINEER;
    const isOperator = user.role === UserRole.OPERATOR;

    const canViewDashboard = isOwnerOrManager;
    const canViewEngineerDashboard = isEngineer;
    const canViewMachines = [UserRole.MANAGER, UserRole.ENGINEER, UserRole.OWNER].includes(user.role);
    const canViewLedger = [UserRole.MANAGER, UserRole.ENGINEER, UserRole.OWNER].includes(user.role);
    const canViewReports = true;
    const canViewAnalytics = [UserRole.MANAGER, UserRole.ENGINEER, UserRole.OWNER].includes(user.role);
    const canViewMaintenance = [UserRole.MANAGER, UserRole.ENGINEER, UserRole.OWNER].includes(user.role);
    const canViewAutomation = [UserRole.MANAGER, UserRole.ENGINEER, UserRole.OWNER].includes(user.role);
    const canViewSettings = true;
    const canViewAdmin = [UserRole.OWNER].includes(user.role);

    const handleLogoutClick = () => setShowLogoutConfirm(true);
    const confirmLogout = () => { setShowLogoutConfirm(false); onLogout(); };

    return (
        <div className="flex h-screen w-full overflow-hidden bg-[var(--dark-bg-deep)]">

            {/* ── Logout Modal ─────────────────────────────────────── */}
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

            {/* ── Sidebar ───────────────────────────────────────────── */}
            <div className={`
                fixed inset-y-0 left-0 z-50
                bg-[#0a1020]/95 backdrop-blur-xl border-r border-white/[0.06]
                flex flex-col
                transform transition-all duration-300 ease-in-out
                ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
                md:relative md:translate-x-0
                ${collapsed ? 'w-[72px]' : 'w-64'}
            `}>

                {/* Logo + Toggle */}
                <div className="relative flex items-center border-b border-white/[0.06] h-[69px] flex-shrink-0">
                    <Link
                        href="/dashboard"
                        className={`flex items-center gap-3 hover:bg-white/[0.02] transition-colors h-full overflow-hidden
                            ${collapsed ? 'px-0 w-0 opacity-0 pointer-events-none' : 'px-5 flex-1 opacity-100'}`}
                        style={{ transition: 'width 0.3s, opacity 0.2s, padding 0.3s' }}
                    >
                        <div className="relative flex-shrink-0">
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center border border-[var(--accent-primary)]/30"
                                style={{ background: 'linear-gradient(135deg, rgba(45,139,139,0.2), rgba(45,139,139,0.05))' }}>
                                <Activity size={20} className="text-[var(--accent-highlight)]" />
                            </div>
                            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--accent-highlight)] animate-pulse" />
                        </div>
                        <span className="text-lg font-bold tracking-tight whitespace-nowrap">
                            <span className="text-white">Zero</span>
                            <span className="text-[var(--accent-highlight)]">PdM</span>
                            <span className="text-white/70 font-light ml-1">AI</span>
                        </span>
                    </Link>

                    <button
                        onClick={toggleCollapsed}
                        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        className={`flex items-center justify-center w-8 h-8 rounded-lg
                            text-white/40 hover:text-white/80 hover:bg-white/[0.06]
                            transition-all flex-shrink-0
                            ${collapsed ? 'mx-auto' : 'mr-3'}`}
                    >
                        {collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
                    </button>
                </div>

                {/* User Card (expanded) */}
                <div className={`overflow-hidden transition-all duration-300
                    ${collapsed ? 'h-0 opacity-0 py-0 px-0' : 'px-3 py-4 opacity-100'}`}>
                    <div className="relative p-3 rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                        {/* Corner accent */}
                        <div className="absolute top-0 left-0 w-6 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                        <div className="absolute top-0 left-0 h-6 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />

                        {/* Avatar row */}
                        <div className="flex items-center gap-3 mb-3">
                            <div className="relative flex-shrink-0">
                                <UserAvatar name={user.name} role={user.role} address={user.address} size="md" />
                                {/* Online dot */}
                                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-[#0a1020] rounded-full shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                            </div>
                            <div className="overflow-hidden flex-1">
                                <p className="text-sm font-semibold text-white truncate leading-tight">{user.name}</p>
                                <span className={`inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border ${getRoleColor(user.role).badge}`}>
                                    {user.role}
                                </span>
                            </div>
                        </div>

                        {/* Wallet */}
                        <div>
                            <p className="text-[9px] font-medium text-white/25 uppercase tracking-[0.15em] mb-1">Wallet</p>
                            <a
                                href={`https://sepolia.explorer.zksync.io/address/${user.address}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex items-center gap-1.5 font-mono text-[10px] text-white/35 hover:text-[var(--accent-highlight)] transition-all duration-200 bg-white/[0.03] px-2 py-1.5 rounded-lg border border-white/[0.05] hover:border-[var(--accent-primary)]/30 hover:bg-[var(--accent-primary)]/5"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 flex-shrink-0" />
                                <span className="truncate">{user.address.slice(0, 8)}…{user.address.slice(-6)}</span>
                            </a>
                        </div>
                    </div>
                </div>

                {/* Avatar (collapsed) */}
                {collapsed && (
                    <div className="flex justify-center py-4 flex-shrink-0">
                        <div className="relative">
                            <UserAvatar name={user.name} role={user.role} address={user.address} size="sm" />
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-[#0a1020] rounded-full shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                        </div>
                    </div>
                )}

                {/* Navigation */}
                <nav className="px-2 space-y-0.5 mt-1 flex-1 overflow-y-auto overflow-x-hidden">
                    {canViewDashboard && (
                        <SidebarItem to={`${DASHBOARD_BASE}/overview`} icon={LayoutDashboard} label="Dashboard"
                            active={pathname === `${DASHBOARD_BASE}/overview` || pathname === DASHBOARD_BASE}
                            collapsed={collapsed} />
                    )}
                    {canViewEngineerDashboard && (
                        <SidebarItem to={`${DASHBOARD_BASE}/engineer`} icon={Home} label="Command Center"
                            active={pathname === `${DASHBOARD_BASE}/engineer`} collapsed={collapsed} />
                    )}
                    {isOperator && (
                        <SidebarItem to={`${DASHBOARD_BASE}/sensor-entry`} icon={Home} label="Sensor Entry"
                            active={pathname === `${DASHBOARD_BASE}/sensor-entry`} collapsed={collapsed} />
                    )}
                    {canViewAdmin && (
                        <SidebarItem to={`${DASHBOARD_BASE}/admin`} icon={Settings} label="Admin Panel"
                            active={pathname === `${DASHBOARD_BASE}/admin`} collapsed={collapsed} />
                    )}
                    {canViewMachines && (
                        <SidebarItem to={`${DASHBOARD_BASE}/machines`} icon={Database} label="Machine Manager"
                            active={pathname === `${DASHBOARD_BASE}/machines` || pathname?.startsWith(`${DASHBOARD_BASE}/machines/`)}
                            collapsed={collapsed} />
                    )}
                    {canViewLedger && (
                        <SidebarItem to={`${DASHBOARD_BASE}/ledger`} icon={LinkIcon} label="Blockchain Ledger"
                            active={pathname === `${DASHBOARD_BASE}/ledger`} collapsed={collapsed} />
                    )}
                    {canViewReports && (
                        <SidebarItem to={`${DASHBOARD_BASE}/reports`} icon={Layers} label="Reports"
                            active={pathname === `${DASHBOARD_BASE}/reports`} collapsed={collapsed} />
                    )}
                    {canViewAnalytics && (
                        <SidebarItem to={`${DASHBOARD_BASE}/analytics`} icon={BarChart3} label="Analytics"
                            active={pathname === `${DASHBOARD_BASE}/analytics`} collapsed={collapsed} />
                    )}
                    {canViewMaintenance && (
                        <SidebarItem to={`${DASHBOARD_BASE}/maintenance`} icon={Wrench} label="Maintenance"
                            active={pathname === `${DASHBOARD_BASE}/maintenance`} collapsed={collapsed} />
                    )}
                    {canViewAutomation && (
                        <SidebarItem to={`${DASHBOARD_BASE}/automation`} icon={Radio} label="Automation"
                            active={pathname === `${DASHBOARD_BASE}/automation`} collapsed={collapsed} />
                    )}
                </nav>

                {/* Bottom Actions */}
                <div className={`p-3 border-t border-white/[0.06] flex-shrink-0
                    ${collapsed ? 'flex flex-col items-center gap-2' : ''}`}>
                    {canViewSettings && (
                        <Link href={`${DASHBOARD_BASE}/settings`} className={collapsed ? '' : 'block mb-2'}>
                            <button
                                title={collapsed ? 'Settings' : undefined}
                                className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium
                                    text-white/50 hover:text-white/80 hover:bg-white/[0.04] rounded-xl transition-all
                                    ${collapsed ? 'justify-center w-11' : 'w-full'}`}
                            >
                                <Settings size={16} className="flex-shrink-0" />
                                {!collapsed && <span>Settings</span>}
                            </button>
                        </Link>
                    )}
                    <button
                        onClick={handleLogoutClick}
                        title={collapsed ? 'Disconnect Wallet' : undefined}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all
                            text-red-400/80 hover:text-red-400 border border-red-500/10
                            hover:border-red-500/20 bg-red-500/5 hover:bg-red-500/10
                            ${collapsed ? 'w-11 px-0' : 'w-full px-3'}`}
                    >
                        <LogOut size={14} className="flex-shrink-0" />
                        {!collapsed && <span className="text-xs font-semibold">Disconnect Wallet</span>}
                    </button>
                </div>
            </div>

            {/* ── Main Content ──────────────────────────────────────── */}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">

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

                {/* Desktop Header */}
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

                {/* Page content */}
                <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-[var(--dark-bg-deep)]">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>

            {/* Mobile overlay */}
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

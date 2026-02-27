'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { UserRole, User } from '../types';
import { ShieldCheck, Users, Binary, ArrowRight, Activity, Wallet, AlertCircle, LogIn, UserPlus, CheckCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { useLoginLogic } from './hooks/useLoginLogic';

interface LoginScreenProps {
    onLogin: (user: User) => void;
    initialMode?: 'LOGIN' | 'REGISTER' | null;
}

type AuthMode = 'LOGIN' | 'REGISTER';

const roles = [
    {
        role: UserRole.MANAGER,
        title: 'Manager Node',
        tag: 'Admin Access',
        desc: 'Full access to dashboard overview and immutable system records.',
        icon: ShieldCheck,
        accent: '#a78bfa',
    },
    {
        role: UserRole.ENGINEER,
        title: 'Engineer Node',
        tag: 'Analytics Access',
        desc: 'Monitor AI predictions, analyze sensor data, and run diagnostics.',
        icon: Binary,
        accent: 'var(--accent-highlight)',
    },
    {
        role: UserRole.OPERATOR,
        title: 'Operator Node',
        tag: 'Data Entry Access',
        desc: 'Collect sensor data from machines and submit readings to the blockchain.',
        icon: Users,
        accent: '#6ee7b7',
    },
];

const LoginModeSelection: React.FC<{
    mounted: boolean;
    setMode: (mode: AuthMode) => void;
}> = ({ mounted, setMode }) => (
    <div className={`transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
        <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-5 border border-[var(--accent-primary)]/20"
                style={{ background: 'linear-gradient(135deg, rgba(45,139,139,0.15), rgba(45,139,139,0.03))' }}>
                <Activity className="text-[var(--accent-highlight)]" size={26} />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight mb-2">Welcome to ZeroPdM</h1>
            <p className="text-white/60 text-sm">How would you like to proceed?</p>
        </div>

        <div className="space-y-3">
            <button
                onClick={() => setMode('LOGIN')}
                className="group w-full flex items-center gap-4 p-4 rounded-xl border border-white/[0.07] hover:border-[var(--accent-primary)]/30 bg-white/[0.02] hover:bg-[var(--accent-primary)]/5 transition-all duration-300 text-left"
            >
                <div className="w-12 h-12 rounded-lg flex items-center justify-center border border-[var(--accent-primary)]/15 bg-[var(--accent-primary)]/5 group-hover:bg-[var(--accent-primary)]/10 transition-colors shrink-0">
                    <LogIn size={22} className="text-[var(--accent-primary)]" />
                </div>
                <div className="flex-1">
                    <div className="text-sm font-semibold text-white">Sign In</div>
                    <div className="text-xs text-white/60 mt-0.5">Access your existing dashboard</div>
                </div>
                <ArrowRight size={16} className="text-white/30 group-hover:text-[var(--accent-primary)] group-hover:translate-x-1 transition-all duration-300" />
            </button>

            <button
                onClick={() => setMode('REGISTER')}
                className="group w-full flex items-center gap-4 p-4 rounded-xl border border-white/[0.07] hover:border-emerald-500/20 bg-white/[0.02] hover:bg-emerald-500/5 transition-all duration-300 text-left"
            >
                <div className="w-12 h-12 rounded-lg flex items-center justify-center border border-emerald-500/15 bg-emerald-500/5 group-hover:bg-emerald-500/10 transition-colors shrink-0">
                    <UserPlus size={22} className="text-emerald-400" />
                </div>
                <div className="flex-1">
                    <div className="text-sm font-semibold text-white">Register Node</div>
                    <div className="text-xs text-white/60 mt-0.5">Set up a new maintenance identity</div>
                </div>
                <ArrowRight size={16} className="text-white/30 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all duration-300" />
            </button>
        </div>

        <div className="mt-6 flex justify-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] text-white/50 text-[11px] font-mono">
                <Wallet size={12} className="text-orange-400/70" />
                MetaMask Required
            </div>
        </div>
    </div>
);

const LoginLoginForm: React.FC<{
    mounted: boolean;
    connecting: boolean;
    connectWallet: () => void;
    reset: () => void;
}> = ({ mounted, connecting, connectWallet, reset }) => (
    <div className={`transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-sm p-8">
            <div className="text-center mb-8">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 border border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/5">
                    <LogIn size={22} className="text-[var(--accent-primary)]" />
                </div>
                <h2 className="text-xl font-bold text-white mb-1.5">Welcome Back</h2>
                <p className="text-white/60 text-sm">Connect your wallet to access the dashboard</p>
            </div>

            <button
                onClick={() => connectWallet()}
                disabled={connecting}
                className="group w-full flex items-center justify-center gap-3 py-3.5 rounded-lg font-semibold text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, var(--accent-primary), #1a6b6b)' }}
            >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{ background: 'linear-gradient(135deg, var(--accent-highlight), var(--accent-primary))' }} />
                <span className="relative flex items-center gap-2.5">
                    {connecting ? (
                        <><Loader2 size={18} className="animate-spin" /> Connecting...</>
                    ) : (
                        <><Wallet size={18} /> Connect MetaMask</>
                    )}
                </span>
            </button>

            <button onClick={reset}
                className="w-full mt-3 py-2.5 rounded-lg text-white/50 hover:text-white/80 text-sm font-medium transition-colors">
                Cancel
            </button>
        </div>
    </div>
);

const LoginRegisterForm: React.FC<{
    mounted: boolean;
    connecting: boolean;
    selectedRole: string | null;
    handleRoleSelect: (role: UserRole) => void;
    reset: () => void;
}> = ({ mounted, connecting, selectedRole, handleRoleSelect, reset }) => (
    <div className={`w-full transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
        <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-white mb-1">Select Node Identity</h2>
            <p className="text-white/60 text-xs font-mono uppercase tracking-widest">Choose your role & connect wallet</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {roles.map((r) => (
                <button
                    key={r.role}
                    onClick={() => handleRoleSelect(r.role)}
                    disabled={connecting}
                    className={`group relative p-5 rounded-xl border text-left transition-all duration-500 overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-1 ${selectedRole === r.role
                        ? 'border-white/20 bg-white/[0.05]'
                        : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14]'
                        }`}
                >
                    {/* Corner accent */}
                    <div className="absolute top-0 left-0 w-10 h-px transition-all duration-500 group-hover:w-16"
                        style={{ background: `linear-gradient(90deg, ${r.accent}, transparent)` }} />
                    <div className="absolute top-0 left-0 h-10 w-px transition-all duration-500 group-hover:h-16"
                        style={{ background: `linear-gradient(180deg, ${r.accent}, transparent)` }} />

                    <div className="relative z-10 flex flex-col h-full">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 border border-white/[0.07]"
                            style={{ background: `linear-gradient(135deg, ${r.accent}15, transparent)` }}>
                            <r.icon size={18} style={{ color: r.accent }} className="opacity-90" />
                        </div>

                        <h3 className="text-sm font-bold text-white mb-0.5">{r.title}</h3>
                        <p className="text-[10px] font-mono text-white/50 uppercase tracking-wider mb-2">{r.tag}</p>
                        <p className="text-xs text-white/60 leading-relaxed mb-4 flex-grow">{r.desc}</p>

                        <div className="flex items-center gap-2 text-xs font-medium mt-auto" style={{ color: r.accent }}>
                            {connecting && selectedRole === r.role ? (
                                <><Loader2 size={14} className="animate-spin" /> Connecting...</>
                            ) : (
                                <>Select & Connect <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform duration-300" /></>
                            )}
                        </div>
                    </div>

                    {/* Bottom glow */}
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        style={{ background: `linear-gradient(90deg, transparent, ${r.accent}40, transparent)` }} />
                </button>
            ))}
        </div>

        <div className="text-center mt-5">
            <button onClick={reset}
                className="text-white/45 hover:text-white/70 text-sm font-medium transition-colors">
                Cancel Registration
            </button>
        </div>
    </div>
);

const LoginInner: React.FC<LoginScreenProps> = ({ onLogin, initialMode }) => {
    const router = useRouter();
    const {
        mode, connecting, selectedRole, error, successMessage, mounted,
        setMode, connectWallet, handleRoleSelect, reset, clearError,
    } = useLoginLogic(onLogin, initialMode);
    return (
        <div className="relative h-screen w-full flex flex-col overflow-hidden bg-[#060b14]">

            {/* ─── Background: Isometric cubes ─── */}
            <div className="absolute inset-0 z-0 pointer-events-none login-cubes" />
            <div className="absolute inset-0 z-[1] pointer-events-none login-cubes-glow" />

            {/* Pulse cells */}
            <div className="absolute inset-0 z-[2] pointer-events-none overflow-hidden">
                <div className="login-pulse-cell" style={{ top: '20%', left: '8%', animationDelay: '0s' }} />
                <div className="login-pulse-cell" style={{ top: '60%', left: '80%', animationDelay: '3s' }} />
                <div className="login-pulse-cell" style={{ top: '75%', left: '25%', animationDelay: '5.5s' }} />
                <div className="login-pulse-cell" style={{ top: '30%', left: '65%', animationDelay: '1.5s' }} />
                <div className="login-pulse-cell" style={{ top: '85%', left: '55%', animationDelay: '7s' }} />
            </div>

            {/* Scan sweep */}
            <div className="absolute inset-0 z-[2] pointer-events-none overflow-hidden">
                <div className="login-scan-sweep" />
            </div>

            {/* Radial glow */}
            <div className="absolute top-[-5%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] z-[3] pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at center, rgba(45,139,139,0.1) 0%, transparent 65%)' }} />

            {/* Vignette */}
            <div className="absolute inset-0 z-[3] pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at center, transparent 35%, rgba(6,11,20,0.75) 100%)' }} />

            {/* ─── Top bar ─── */}
            <div className={`relative z-20 shrink-0 px-6 md:px-12 py-4 flex items-center justify-between transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                <button onClick={() => router.push('/')} className="flex items-center gap-3 group">
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
                </button>

                {mode && (
                    <button onClick={reset} className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors text-sm">
                        <ArrowLeft size={16} />
                        <span>Back</span>
                    </button>
                )}
            </div>

            {/* ─── Main content ─── */}
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 md:px-12 min-h-0">
                <div className={`w-full transition-all duration-500 ease-in-out ${mode === 'REGISTER' ? 'max-w-4xl' : 'max-w-md'}`}>

                    {/* Alerts */}
                    {error && (
                        <div className="mb-5 p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 backdrop-blur-sm flex flex-col gap-2 animate-fade-in-down">
                            <div className="flex items-center gap-3 text-red-400">
                                <AlertCircle size={18} className="shrink-0" />
                                <span className="text-sm font-medium">{error}</span>
                            </div>
                            {(error.includes('register') || error.includes('Register') || error.includes('aktifle')) && (
                                <button onClick={() => { clearError(); setMode('REGISTER'); }}
                                    className="ml-8 text-sm font-semibold text-red-400 hover:text-red-300 hover:underline text-left transition-colors">
                                    Go to Registration
                                </button>
                            )}
                        </div>
                    )}
                    {successMessage && (
                        <div className="mb-5 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-sm flex items-center gap-3 text-emerald-400 animate-fade-in-down">
                            <CheckCircle size={18} className="shrink-0" />
                            <span className="text-sm font-medium">{successMessage}</span>
                        </div>
                    )}

                    {/* ─── Mode selection ─── */}
                    {!mode ? (
                        <LoginModeSelection mounted={mounted} setMode={setMode} />
                    ) : mode === 'LOGIN' ? (
                        <LoginLoginForm mounted={mounted} connecting={connecting} connectWallet={connectWallet} reset={reset} />
                    ) : (
                        <LoginRegisterForm mounted={mounted} connecting={connecting} selectedRole={selectedRole} handleRoleSelect={handleRoleSelect} reset={reset} />
                    )}
                </div>
            </div>

            {/* ─── Footer ─── */}
            <div className={`relative z-10 px-6 py-3 flex items-center justify-center shrink-0 transition-all duration-700 delay-[400ms] ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                <span className="text-[10px] font-mono text-white/35 tracking-wider">
                    &copy; 2026 ZeroPdM AI
                </span>
            </div>

            {/* ─── Inline styles ─── */}
            <style>{`
                .login-cubes {
                    --s: 80px;
                    --c1: #060b14;
                    --c2: #0a1020;
                    --c3: #0d1528;
                    background:
                        repeating-conic-gradient(from 30deg,
                            #0000 0 120deg,
                            var(--c3) 0 180deg) calc(0.5 * var(--s)) calc(0.5 * var(--s) * 0.577),
                        repeating-conic-gradient(from 30deg,
                            var(--c1) 0 60deg,
                            var(--c2) 0 120deg,
                            var(--c3) 0 180deg);
                    background-size: var(--s) calc(var(--s) * 0.577);
                }
                .login-cubes-glow {
                    --s: 80px;
                    --c1: transparent;
                    --c2: rgba(45,139,139,0.03);
                    --c3: rgba(45,139,139,0.015);
                    background:
                        repeating-conic-gradient(from 30deg,
                            #0000 0 120deg,
                            var(--c3) 0 180deg) calc(0.5 * var(--s)) calc(0.5 * var(--s) * 0.577),
                        repeating-conic-gradient(from 30deg,
                            var(--c1) 0 60deg,
                            var(--c2) 0 120deg,
                            var(--c3) 0 180deg);
                    background-size: var(--s) calc(var(--s) * 0.577);
                }
                .login-pulse-cell {
                    position: absolute;
                    width: 80px; height: 46px;
                    background: radial-gradient(ellipse at center, rgba(45,139,139,0.15) 0%, rgba(45,139,139,0.04) 40%, transparent 70%);
                    border-radius: 50%;
                    animation: loginPulse 8s ease-in-out infinite;
                    filter: blur(2px);
                }
                @keyframes loginPulse {
                    0%, 100% { opacity: 0; transform: scale(0.8); }
                    15% { opacity: 1; transform: scale(1.2); }
                    50% { opacity: 0.3; transform: scale(1); }
                    85% { opacity: 0; transform: scale(0.9); }
                }
                .login-scan-sweep {
                    position: absolute;
                    left: -10%; width: 120%; height: 120px;
                    background: linear-gradient(180deg, transparent, rgba(45,139,139,0.03) 30%, rgba(168,218,220,0.05) 50%, rgba(45,139,139,0.03) 70%, transparent);
                    animation: loginSweep 12s ease-in-out infinite;
                    filter: blur(1px);
                }
                @keyframes loginSweep {
                    0% { top: -15%; }
                    100% { top: 115%; }
                }
                @keyframes fade-in-down {
                    0% { opacity: 0; transform: translateY(-10px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-down {
                    animation: fade-in-down 0.3s ease-out forwards;
                }
            `}</style>
        </div>
    );
};

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, initialMode }) => (
    <LoginInner onLogin={onLogin} initialMode={initialMode} />
);

export default LoginScreen;

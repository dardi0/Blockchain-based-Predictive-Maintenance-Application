'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ShieldCheck, ArrowRight, X, LogIn, UserPlus, Cpu, Lock, ChevronRight, FileText } from 'lucide-react';

/* ───────────────────────────────────────────────────────
   Isometric Cube Background - CSS-only modernized
   ─────────────────────────────────────────────────────── */
const IsometricCubes: React.FC = () => (
    <>
        {/* Base isometric cube pattern */}
        <div className="absolute inset-0 z-0 pointer-events-none hero-cubes" />

        {/* Animated highlight cubes - scattered glowing blocks */}
        <div className="absolute inset-0 z-[1] pointer-events-none overflow-hidden">
            {/* Pulse cells - random glowing cubes */}
            <div className="hero-pulse-cell" style={{ top: '15%', left: '10%', animationDelay: '0s' }} />
            <div className="hero-pulse-cell" style={{ top: '45%', left: '75%', animationDelay: '2.5s' }} />
            <div className="hero-pulse-cell" style={{ top: '70%', left: '30%', animationDelay: '5s' }} />
            <div className="hero-pulse-cell" style={{ top: '25%', left: '55%', animationDelay: '1.2s' }} />
            <div className="hero-pulse-cell" style={{ top: '80%', left: '85%', animationDelay: '3.8s' }} />
            <div className="hero-pulse-cell" style={{ top: '55%', left: '15%', animationDelay: '6.5s' }} />
            <div className="hero-pulse-cell" style={{ top: '35%', left: '90%', animationDelay: '4.2s' }} />
            <div className="hero-pulse-cell" style={{ top: '90%', left: '50%', animationDelay: '7s' }} />
        </div>

        {/* Scan sweep - a horizontal light that sweeps across the cubes */}
        <div className="absolute inset-0 z-[2] pointer-events-none overflow-hidden">
            <div className="hero-scan-sweep" />
        </div>
    </>
);

/* ───────────────────────────────────────────────────────
   Live signal bar
   ─────────────────────────────────────────────────────── */
const SignalBar: React.FC = () => {
    const [values, setValues] = useState([
        { id: 'b0', v: 72 }, { id: 'b1', v: 45 }, { id: 'b2', v: 88 },
        { id: 'b3', v: 34 }, { id: 'b4', v: 91 }, { id: 'b5', v: 56 }, { id: 'b6', v: 67 }
    ]);

    useEffect(() => {
        const interval = setInterval(() => {
            setValues(prev => prev.map(item => {
                const delta = (Math.random() - 0.5) * 8;
                return { ...item, v: Math.max(10, Math.min(95, item.v + delta)) };
            }));
        }, 1500);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex items-end gap-[3px] h-8">
            {values.map(({ id, v }) => (
                <div
                    key={id}
                    className="w-[3px] rounded-full transition-all duration-700 ease-out"
                    style={{
                        height: `${v}%`,
                        background: v > 80 ? '#ef4444' : v > 60 ? 'var(--accent-primary)' : 'var(--accent-highlight)',
                        opacity: 0.8,
                    }}
                />
            ))}
        </div>
    );
};

const HeroFeatures: React.FC<{ mounted: boolean }> = ({ mounted }) => {
    return (
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto transition-all duration-700 delay-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
            {[
                {
                    icon: Activity,
                    title: 'Real-time Monitoring',
                    desc: 'Live sensor data from machines processed with sub-second latency. Continuous health tracking and anomaly detection.',
                    accent: 'var(--accent-primary)',
                    hasSignal: true,
                },
                {
                    icon: Cpu,
                    title: 'AI Failure Prediction',
                    desc: 'Deep learning models detect anomalies before they happen. Prevent downtime with data-driven maintenance scheduling.',
                    accent: 'var(--accent-highlight)',
                    hasSignal: false,
                },
                {
                    icon: Lock,
                    title: 'ZK-SNARK on zkSync',
                    desc: 'Groth16 proofs verify every prediction on-chain. Tamper-proof maintenance records on Layer 2.',
                    accent: '#6ee7b7',
                    hasSignal: false,
                }
            ].map((feature, i) => (
                <div
                    key={feature.title ?? `feature-${i}`}
                    className="group relative p-5 rounded-xl border border-white/[0.07] bg-[#060b14]/80 backdrop-blur-sm hover:bg-white/[0.04] hover:border-white/[0.14] transition-all duration-500 cursor-default overflow-hidden"
                >
                    {/* Corner accent */}
                    <div className="absolute top-0 left-0 w-12 h-px transition-all duration-500 group-hover:w-20"
                        style={{ background: `linear-gradient(90deg, ${feature.accent}, transparent)` }} />
                    <div className="absolute top-0 left-0 h-12 w-px transition-all duration-500 group-hover:h-20"
                        style={{ background: `linear-gradient(180deg, ${feature.accent}, transparent)` }} />

                    <div className="flex items-start justify-between mb-4">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center border border-white/[0.07]"
                            style={{ background: `linear-gradient(135deg, ${feature.accent}15, transparent)` }}>
                            <feature.icon size={18} style={{ color: feature.accent }} className="opacity-90" />
                        </div>
                        {feature.hasSignal && <SignalBar />}
                    </div>

                    <h3 className="text-sm font-bold text-white mb-2 tracking-wide">{feature.title}</h3>
                    <p className="text-xs text-white/60 leading-relaxed">{feature.desc}</p>

                    {/* Bottom glow on hover */}
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        style={{ background: `linear-gradient(90deg, transparent, ${feature.accent}40, transparent)` }} />
                </div>
            ))}
        </div>
    );
};

const HeroAuthModal: React.FC<{ showAuthModal: boolean, setShowAuthModal: (v: boolean) => void, router: any }> = ({ showAuthModal, setShowAuthModal, router }) => {
    if (!showAuthModal) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div role="presentation" aria-hidden="true" className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setShowAuthModal(false)} onKeyDown={(e) => { if (e.key === 'Escape') setShowAuthModal(false); }} />

            <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0c1322]/95 backdrop-blur-xl p-8 animate-zoom-in shadow-2xl shadow-black/50">
                {/* Close */}
                <button
                    onClick={() => setShowAuthModal(false)}
                    className="absolute top-4 right-4 p-2 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-lg transition-all"
                >
                    <X size={18} />
                </button>

                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-5 border border-[var(--accent-primary)]/20"
                        style={{ background: 'linear-gradient(135deg, rgba(45,139,139,0.15), rgba(45,139,139,0.03))' }}>
                        <Activity className="text-[var(--accent-highlight)]" size={26} />
                    </div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Connect to ZeroPdM</h2>
                    <p className="text-white/60 mt-2 text-sm">Authenticate with your wallet to continue</p>
                </div>

                {/* Options */}
                <div className="space-y-3">
                    <button
                        onClick={() => router.push('/login?mode=LOGIN')}
                        className="group w-full flex items-center gap-4 p-4 rounded-xl border border-white/[0.07] hover:border-[var(--accent-primary)]/30 bg-white/[0.02] hover:bg-[var(--accent-primary)]/5 transition-all duration-300 text-left"
                    >
                        <div className="w-11 h-11 rounded-lg flex items-center justify-center border border-[var(--accent-primary)]/15 bg-[var(--accent-primary)]/5 group-hover:bg-[var(--accent-primary)]/10 transition-colors">
                            <LogIn size={20} className="text-[var(--accent-primary)]" />
                        </div>
                        <div className="flex-1">
                            <div className="text-sm font-semibold text-white">Sign In</div>
                            <div className="text-xs text-white/60 mt-0.5">Access your existing dashboard</div>
                        </div>
                        <ArrowRight size={16} className="text-white/30 group-hover:text-[var(--accent-primary)] group-hover:translate-x-1 transition-all duration-300" />
                    </button>

                    <button
                        onClick={() => router.push('/login?mode=REGISTER')}
                        className="group w-full flex items-center gap-4 p-4 rounded-xl border border-white/[0.07] hover:border-emerald-500/20 bg-white/[0.02] hover:bg-emerald-500/5 transition-all duration-300 text-left"
                    >
                        <div className="w-11 h-11 rounded-lg flex items-center justify-center border border-emerald-500/15 bg-emerald-500/5 group-hover:bg-emerald-500/10 transition-colors">
                            <UserPlus size={20} className="text-emerald-400" />
                        </div>
                        <div className="flex-1">
                            <div className="text-sm font-semibold text-white">Register Node</div>
                            <div className="text-xs text-white/60 mt-0.5">Set up a new maintenance identity</div>
                        </div>
                        <ArrowRight size={16} className="text-white/30 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all duration-300" />
                    </button>
                </div>

                <p className="text-center text-[10px] text-white/35 mt-7 font-mono tracking-wider uppercase">
                    MetaMask wallet required to authenticate
                </p>
            </div>
        </div>
    );
};

/* ───────────────────────────────────────────────────────
   HERO
   ─────────────────────────────────────────────────────── */
const Hero: React.FC = () => {
    const router = useRouter();
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setMounted(true), 0);
        return () => clearTimeout(t);
    }, []);

    return (
        <div className="relative h-screen flex flex-col overflow-hidden bg-[#060b14]">

            {/* ─── Background layers ─── */}
            <IsometricCubes />

            {/* Radial glow - center top */}
            <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[1000px] h-[700px] z-[3] pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at center, rgba(45,139,139,0.08) 0%, transparent 65%)' }} />

            {/* Vignette - darkens edges to focus center */}
            <div className="absolute inset-0 z-[3] pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(6,11,20,0.7) 100%)' }} />

            {/* ─── Navigation ─── */}
            <nav suppressHydrationWarning className={`relative z-20 w-full px-6 md:px-12 py-4 flex items-center justify-between transition-all duration-700 shrink-0 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="w-11 h-11 rounded-lg flex items-center justify-center border border-[var(--accent-primary)]/30"
                            style={{ background: 'linear-gradient(135deg, rgba(45,139,139,0.2), rgba(45,139,139,0.05))' }}>
                            <Activity size={22} className="text-[var(--accent-highlight)]" />
                        </div>
                        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--accent-highlight)] animate-pulse" />
                    </div>
                    <span className="text-xl font-bold tracking-tight">
                        <span className="text-white">Zero</span>
                        <span className="text-[var(--accent-highlight)]">PdM</span>
                        <span className="text-white/70 font-light ml-1">AI</span>
                    </span>
                </div>

                <div className="hidden md:flex items-center gap-6 text-sm">
                    <span className="text-white/60 font-mono text-xs tracking-widest uppercase">zkSync Era Sepolia</span>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-emerald-400 text-xs font-medium">Network Active</span>
                    </div>
                </div>
            </nav>

            {/* ─── Main Content ─── */}
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 md:px-12 min-h-0">
                <div className="w-full max-w-6xl mx-auto">

                    {/* Status badge */}
                    <div className={`flex justify-center mb-5 transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                        <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
                            <div className="flex items-center gap-1.5">
                                <Lock size={12} className="text-[var(--accent-primary)]" />
                                <span className="text-[11px] font-mono text-white/70 uppercase tracking-wider">ZK-SNARK Verified</span>
                            </div>
                            <div className="w-px h-3 bg-white/10" />
                            <div className="flex items-center gap-1.5">
                                <ShieldCheck size={12} className="text-[var(--accent-highlight)]" />
                                <span className="text-[11px] font-mono text-white/70 uppercase tracking-wider">On-Chain Proofs</span>
                            </div>
                        </div>
                    </div>

                    {/* Heading */}
                    <div className={`text-center mb-4 transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                        <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-[0.95] tracking-tight">
                            <span className="block text-white">Predictive</span>
                            <span className="block mt-1">
                                <span className="text-transparent bg-clip-text" style={{
                                    backgroundImage: 'linear-gradient(135deg, var(--accent-primary), var(--accent-highlight))',
                                }}>Maintenance</span>
                            </span>
                        </h1>
                    </div>

                    <div className={`text-center mb-8 transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                        <p className="text-sm md:text-base text-white/70 max-w-2xl mx-auto leading-relaxed">
                            AI-powered failure prediction with on-chain ZK proof verification.
                            <br className="hidden md:block" />
                            Every sensor reading, every prediction, every action &mdash; immutably recorded.
                        </p>
                    </div>

                    {/* CTA Buttons */}
                    <div className={`flex flex-col sm:flex-row gap-4 justify-center items-center mb-10 transition-all duration-700 delay-[400ms] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                        <button
                            onClick={() => setShowAuthModal(true)}
                            className="group relative px-8 py-3.5 rounded-lg font-semibold text-white overflow-hidden transition-all duration-300 hover:-translate-y-0.5"
                            style={{ background: 'linear-gradient(135deg, var(--accent-primary), #1a6b6b)' }}
                        >
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                style={{ background: 'linear-gradient(135deg, var(--accent-highlight), var(--accent-primary))' }} />
                            <span className="relative flex items-center gap-2.5">
                                Launch Dashboard
                                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform duration-300" />
                            </span>
                            <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                style={{ boxShadow: '0 0 30px rgba(45,139,139,0.4), 0 0 60px rgba(45,139,139,0.1)' }} />
                        </button>

                        <button
                            className="group px-8 py-3.5 rounded-lg font-medium text-white/75 hover:text-white/95 border border-white/[0.08] hover:border-white/[0.18] bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-300 flex items-center gap-2.5"
                        >
                            <FileText size={16} />
                            View Documentation
                            <ChevronRight size={16} className="opacity-40 group-hover:opacity-80 group-hover:translate-x-0.5 transition-all duration-300" />
                        </button>
                    </div>

                    {/* ─── Feature cards ─── */}
                    <HeroFeatures mounted={mounted} />
                </div>
            </div>

            {/* ─── Footer ─── */}
            <div className={`relative z-10 px-6 py-3 flex items-center justify-center shrink-0 transition-all duration-700 delay-[600ms] ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                <span className="text-[10px] font-mono text-white/35 tracking-wider">
                    &copy; 2026 ZeroPdM AI
                </span>
            </div>

            {/* ─── Auth Modal ─── */}
            <HeroAuthModal showAuthModal={showAuthModal} setShowAuthModal={setShowAuthModal} router={router} />

            {/* ─── Inline styles for cube background ─── */}
            <style>{`
                .hero-cubes {
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
                    opacity: 1;
                }

                /* Glowing edge overlay on cube edges */
                .hero-cubes::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    --s: 80px;
                    --c1: transparent;
                    --c2: rgba(45, 139, 139, 0.03);
                    --c3: rgba(45, 139, 139, 0.015);
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

                /* Pulsing glow cells scattered across the cube grid */
                .hero-pulse-cell {
                    position: absolute;
                    width: 80px;
                    height: 46px;
                    background: radial-gradient(ellipse at center,
                        rgba(45, 139, 139, 0.15) 0%,
                        rgba(45, 139, 139, 0.04) 40%,
                        transparent 70%);
                    border-radius: 50%;
                    animation: cubePulse 8s ease-in-out infinite;
                    filter: blur(2px);
                }

                @keyframes cubePulse {
                    0%, 100% { opacity: 0; transform: scale(0.8); }
                    15% { opacity: 1; transform: scale(1.2); }
                    50% { opacity: 0.3; transform: scale(1); }
                    85% { opacity: 0; transform: scale(0.9); }
                }

                /* Horizontal scan sweep across the cubes */
                .hero-scan-sweep {
                    position: absolute;
                    left: -10%;
                    width: 120%;
                    height: 120px;
                    background: linear-gradient(180deg,
                        transparent 0%,
                        rgba(45, 139, 139, 0.03) 30%,
                        rgba(168, 218, 220, 0.05) 50%,
                        rgba(45, 139, 139, 0.03) 70%,
                        transparent 100%);
                    animation: scanSweep 12s ease-in-out infinite;
                    filter: blur(1px);
                }

                @keyframes scanSweep {
                    0% { top: -15%; }
                    100% { top: 115%; }
                }
            `}</style>
        </div>
    );
};

export default Hero;

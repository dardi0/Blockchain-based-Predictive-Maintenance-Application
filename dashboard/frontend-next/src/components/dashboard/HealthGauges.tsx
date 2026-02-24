'use client';

import React from 'react';
import { Info } from 'lucide-react';

interface HealthGaugesProps {
    avgMLHealth: number;
    avgEngHealth: number;
    onInfoClick: () => void;
}

/**
 * HealthGauges - Dual gauge display comparing AI vs Engineering scores
 */
export const HealthGauges: React.FC<HealthGaugesProps> = ({ avgMLHealth, avgEngHealth, onInfoClick }) => {
    const mlGaugeRotation = (avgMLHealth / 100) * 180 - 90;
    const engGaugeRotation = (avgEngHealth / 100) * 180 - 90;

    return (
        <div className="relative group p-6 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition-all duration-300 flex flex-col h-full">
            {/* Corner accent */}
            <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
            <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />

            {/* Bottom glow */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-[var(--accent-primary)] to-transparent opacity-0 group-hover:opacity-60 transition-opacity duration-500" />

            <h3 className="text-[10px] font-bold text-white/40 mb-6 uppercase tracking-widest text-center">
                System Health Comparison
            </h3>

            <div className="grid grid-cols-2 gap-8 flex-1 items-center justify-center">
                {/* ML-Based Gauge */}
                <div className="flex flex-col items-center">
                    <div className="relative w-40 h-24 overflow-hidden">
                        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 50">
                            <path
                                d="M 10 50 A 40 40 0 0 1 90 50"
                                fill="none"
                                stroke="rgba(255,255,255,0.06)"
                                strokeWidth="8"
                            />
                            <path
                                d="M 10 50 A 40 40 0 0 1 90 50"
                                fill="none"
                                stroke="url(#mlGaugeGradient)"
                                strokeWidth="8"
                                strokeDasharray={`${avgMLHealth * 1.26} 126`}
                                strokeLinecap="round"
                            />
                            <defs>
                                <linearGradient id="mlGaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#ef4444" />
                                    <stop offset="50%" stopColor="#f59e0b" />
                                    <stop offset="100%" stopColor="#8b5cf6" />
                                </linearGradient>
                            </defs>
                        </svg>
                        <div
                            className="absolute bottom-0 left-1/2 w-1 h-20 bg-violet-500 origin-bottom transition-transform duration-700"
                            style={{ transform: `translateX(-50%) rotate(${mlGaugeRotation}deg)` }}
                        />
                    </div>
                    <p className="text-4xl font-bold text-violet-400 mt-4">{avgMLHealth}%</p>
                    <p className="text-sm font-medium text-white/40 flex items-center gap-1 mt-1">
                        AI Prediction
                    </p>
                </div>

                {/* Engineering-Based Gauge */}
                <div className="flex flex-col items-center">
                    <div className="relative w-40 h-24 overflow-hidden">
                        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 50">
                            <path
                                d="M 10 50 A 40 40 0 0 1 90 50"
                                fill="none"
                                stroke="rgba(255,255,255,0.06)"
                                strokeWidth="8"
                            />
                            <path
                                d="M 10 50 A 40 40 0 0 1 90 50"
                                fill="none"
                                stroke="url(#engGaugeGradient)"
                                strokeWidth="8"
                                strokeDasharray={`${avgEngHealth * 1.26} 126`}
                                strokeLinecap="round"
                            />
                            <defs>
                                <linearGradient id="engGaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#ef4444" />
                                    <stop offset="50%" stopColor="#f59e0b" />
                                    <stop offset="100%" stopColor="#10b981" />
                                </linearGradient>
                            </defs>
                        </svg>
                        <div
                            className="absolute bottom-0 left-1/2 w-1 h-20 bg-emerald-500 origin-bottom transition-transform duration-700"
                            style={{ transform: `translateX(-50%) rotate(${engGaugeRotation}deg)` }}
                        />
                    </div>
                    <p className="text-4xl font-bold text-emerald-400 mt-4">{avgEngHealth}%</p>
                    <p className="text-sm font-medium text-white/40 flex items-center gap-1 mt-1">
                        Engineering
                    </p>
                </div>
            </div>

            <button
                onClick={onInfoClick}
                className="w-full mt-6 py-3 px-4 bg-white/[0.03] hover:bg-white/[0.06] text-white/50 hover:text-white/80 rounded-xl transition-all flex items-center justify-center gap-2 text-sm font-medium group/btn border border-white/[0.07] hover:border-white/[0.14]"
            >
                <Info size={18} className="text-[var(--accent-highlight)] group-hover/btn:scale-110 transition-transform" />
                How are these calculated?
            </button>
        </div>
    );
};

export default HealthGauges;

'use client';

import React from 'react';
import { Info, X } from 'lucide-react';

interface CalculationInfoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDownload: (resourceName: string, fileName: string) => void;
}

/**
 * CalculationInfoModal - Modal explaining health score calculation methods
 */
export const CalculationInfoModal: React.FC<CalculationInfoModalProps> = ({ isOpen, onClose, onDownload }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
            <div className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0c1322]/95 backdrop-blur-xl shadow-2xl shadow-black/50 animate-zoom-in">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/80 hover:bg-white/[0.08] transition-all z-10"
                >
                    <X size={20} />
                </button>

                <div className="p-6">
                    <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30">
                            <Info className="text-[var(--accent-highlight)]" size={22} />
                        </div>
                        Health Score Calculation Methods
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                        {/* ML Calculation */}
                        <div className="relative p-5 rounded-xl border border-violet-500/20 bg-violet-500/[0.05]">
                            <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-violet-500 to-transparent" />
                            <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-violet-500 to-transparent" />

                            <h3 className="text-lg font-bold text-violet-300 mb-3 flex items-center gap-2">
                                1. AI Prediction Score
                            </h3>
                            <p className="text-white/60 mb-4">
                                Derived from the machine learning model&apos;s <strong className="text-white/80">Failure Probability</strong>. It represents how likely the machine is to fail based on historical patterns.
                            </p>
                            <div className="p-4 rounded-lg font-mono text-sm text-violet-300 border border-violet-500/20 bg-violet-500/[0.05]">
                                Score = 100 - (Prediction Probability x 100)
                            </div>
                            <p className="text-xs text-white/30 mt-2">
                                Example: If probability is 0.05 (5%), Score = 95%.
                            </p>
                        </div>

                        {/* Engineering Calculation */}
                        <div className="relative p-5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05]">
                            <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-emerald-500 to-transparent" />
                            <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-emerald-500 to-transparent" />

                            <h3 className="text-lg font-bold text-emerald-300 mb-3 flex items-center gap-2">
                                2. Engineering Score
                            </h3>
                            <p className="text-white/60 mb-4">
                                Calculated using a <strong className="text-white/80">Weighted Average</strong> of 5 key sensor parameters against their defined operational limits.
                            </p>
                            <div className="space-y-3 text-sm text-white/60">
                                <div className="flex justify-between items-center border-b border-emerald-500/10 pb-2">
                                    <div>
                                        <span className="font-semibold text-white/80 block">Tool Wear (35%)</span>
                                        <span className="text-xs text-white/30">Critical indicator. High wear leads directly to poor quality and machine damage.</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center border-b border-emerald-500/10 pb-2">
                                    <div>
                                        <span className="font-semibold text-white/80 block">Torque (25%)</span>
                                        <span className="text-xs text-white/30">High torque indicates mechanical strain or jamming risks.</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center border-b border-emerald-500/10 pb-2">
                                    <div>
                                        <span className="font-semibold text-white/80 block">Rotational Speed (15%)</span>
                                        <span className="text-xs text-white/30">Stability of operations. Deviations affect precision.</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center border-b border-emerald-500/10 pb-2">
                                    <div>
                                        <span className="font-semibold text-white/80 block">Temperatures (10% + 15%)</span>
                                        <span className="text-xs text-white/30">Process & Air temps affect cooling efficiency and overheating risks.</span>
                                    </div>
                                </div>
                                <div className="mt-3 p-3 bg-white/[0.02] rounded-lg text-xs border border-white/[0.06]">
                                    <p className="font-semibold text-white/60 mb-1">Why these weights?</p>
                                    <p className="italic text-white/30">
                                        Weights are derived from
                                        <button
                                            type="button"
                                            onClick={() => onDownload('ISO 13381-1', 'ISO_13381_1_Guidelines.txt')}
                                            className="font-bold text-[var(--accent-highlight)] hover:underline mx-1"
                                            title="Click to download ISO guidelines"
                                        >
                                            ISO 13381-1 (Condition Monitoring)
                                        </button>
                                        guidelines and
                                        <button
                                            type="button"
                                            onClick={() => onDownload('FMEA', 'FMEA_Methodology.txt')}
                                            className="font-bold text-[var(--accent-highlight)] hover:underline mx-1"
                                            title="Click to download FMEA methodology"
                                        >
                                            FMEA (Failure Mode and Effects Analysis)
                                        </button>
                                        for CNC machinery.
                                        <br /><br />
                                        In milling operations, <span className="text-emerald-400 font-medium">Tool Wear</span> is statistically the #1 cause of catastrophic failure (35%), followed by <span className="text-emerald-400 font-medium">Torque</span> overload (25%).
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CalculationInfoModal;

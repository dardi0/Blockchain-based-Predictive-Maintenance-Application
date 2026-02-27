'use client';

import React from 'react';
import {
    Brain, Activity, AlertTriangle, CheckCircle, AlertCircle,
    RefreshCw, Wrench, Lock
} from 'lucide-react';
import { MeasurementWithMachine } from './SensorDataPanel';

export interface PredictionResult {
    prediction: number;
    is_failure: boolean;
    prediction_probability: number;
    prediction_reason: string;
    rule_based_analysis: {
        has_definite_failure: boolean;
        failure_risks: string[] | string;
    };
}

interface MLAnalysisPanelProps {
    predictionResult: PredictionResult | null;
    measurement: MeasurementWithMachine;
    analyzing: boolean;
    canAnalyze: boolean;
    onAnalyze: () => void;
}

function getRiskColor(probability: number) {
    if (probability < 0.3) return 'text-green-500';
    if (probability < 0.5) return 'text-yellow-500';
    if (probability < 0.7) return 'text-orange-500';
    return 'text-red-500';
}

function getRiskBgColor(probability: number) {
    if (probability < 0.3) return 'bg-green-500';
    if (probability < 0.5) return 'bg-yellow-500';
    if (probability < 0.7) return 'bg-orange-500';
    return 'bg-red-500';
}

function getRiskLevel(probability: number) {
    if (probability < 0.3) return { level: 'LOW', color: 'text-green-500 bg-green-50 dark:bg-green-900/20', icon: CheckCircle };
    if (probability < 0.5) return { level: 'MEDIUM', color: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20', icon: AlertCircle };
    if (probability < 0.7) return { level: 'HIGH', color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20', icon: AlertTriangle };
    return { level: 'CRITICAL', color: 'text-red-500 bg-red-50 dark:bg-red-900/20', icon: AlertTriangle };
}

export default function MLAnalysisPanel({ predictionResult, measurement, analyzing, canAnalyze, onAnalyze }: MLAnalysisPanelProps) {
    const riskInfo = predictionResult ? getRiskLevel(predictionResult.prediction_probability) : null;

    return (
        <div className="bg-white dark:bg-[var(--dark-bg)] rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <Brain size={20} className="text-purple-500" />
                LSTM-CNN Failure Analysis
            </h2>

            {!predictionResult ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-20 h-20 rounded-full bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center mb-4">
                        <Brain size={40} className="text-purple-400" />
                    </div>

                    {canAnalyze ? (
                        <>
                            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Run ML Analysis</h3>
                            <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
                                Use the LSTM-CNN deep learning model to predict potential machine failures based on sensor data.
                            </p>

                            {measurement.prediction_tx_hash ? (
                                <div className="flex flex-col items-center">
                                    <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl mb-4 text-center">
                                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold mb-1 justify-center">
                                            <Lock size={18} />
                                            <span>Blockchain Verified</span>
                                        </div>
                                        <p className="text-xs text-slate-500 mb-2">Analysis recorded on zkSync</p>
                                        <a
                                            href={`https://sepolia.explorer.zksync.io/tx/${measurement.prediction_tx_hash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-[var(--accent-primary)] hover:underline break-all"
                                        >
                                            {measurement.prediction_tx_hash.substring(0, 16)}...
                                        </a>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={onAnalyze}
                                    disabled={analyzing}
                                    className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-purple-500/25 disabled:opacity-50"
                                >
                                    {analyzing ? (
                                        <>
                                            <RefreshCw size={20} className="animate-spin" />
                                            Analyzing...
                                        </>
                                    ) : (
                                        <>
                                            <Activity size={20} />
                                            Analyze with LSTM-CNN
                                        </>
                                    )}
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Analysis Not Available</h3>
                            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-4">
                                <Lock size={18} />
                                <span className="text-sm font-medium">Engineer Access Required</span>
                            </div>
                            <p className="text-slate-500 dark:text-slate-400 max-w-sm">
                                This measurement has not been analyzed yet. Only Engineers can run failure predictions.
                                Please contact an Engineer to analyze this data.
                            </p>
                        </>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {!canAnalyze && (
                        <div className="p-3 bg-[var(--accent-highlight)]/10 dark:bg-[var(--accent-primary)]/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2 text-[var(--accent-primary)] dark:text-[var(--accent-highlight)] text-sm">
                            <CheckCircle size={18} />
                            <span>Analysis performed by Engineer</span>
                        </div>
                    )}

                    {/* Main Result Card */}
                    <div className={`p-5 rounded-xl border-2 ${predictionResult.is_failure
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800'
                        : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-800'}`}
                    >
                        <div className="flex items-center gap-4">
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${predictionResult.is_failure
                                ? 'bg-red-100 dark:bg-red-900/40'
                                : 'bg-green-100 dark:bg-green-900/40'}`}
                            >
                                {predictionResult.is_failure
                                    ? <AlertTriangle size={28} className="text-red-600 dark:text-red-400" />
                                    : <CheckCircle size={28} className="text-green-600 dark:text-green-400" />
                                }
                            </div>
                            <div>
                                <h3 className={`text-xl font-bold ${predictionResult.is_failure
                                    ? 'text-red-700 dark:text-red-400'
                                    : 'text-green-700 dark:text-green-400'}`}
                                >
                                    {predictionResult.is_failure ? 'FAILURE DETECTED' : 'NORMAL OPERATION'}
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400">{predictionResult.prediction_reason}</p>
                            </div>
                        </div>
                    </div>

                    {/* Probability Meter */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Failure Probability</span>
                            <span className={`text-2xl font-bold ${getRiskColor(predictionResult.prediction_probability)}`}>
                                {(predictionResult.prediction_probability * 100).toFixed(1)}%
                            </span>
                        </div>
                        <div className="h-4 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                            <div
                                className={`h-full ${getRiskBgColor(predictionResult.prediction_probability)} transition-all duration-700 ease-out`}
                                style={{ width: `${predictionResult.prediction_probability * 100}%` }}
                            />
                        </div>
                        <div className="flex justify-between mt-2 text-xs text-slate-500">
                            <span>0% - Safe</span>
                            <span>100% - Critical</span>
                        </div>
                    </div>

                    {/* Risk Level Badge */}
                    {riskInfo && (
                        <div className={`flex items-center gap-3 p-4 rounded-xl ${riskInfo.color}`}>
                            <riskInfo.icon size={24} />
                            <div>
                                <p className="text-sm font-medium">Risk Level</p>
                                <p className="text-lg font-bold">{riskInfo.level}</p>
                            </div>
                        </div>
                    )}

                    {/* Detected Issues */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                            <Wrench size={16} />
                            Detected Issues
                        </h4>
                        {Array.isArray(predictionResult.rule_based_analysis.failure_risks) &&
                            predictionResult.rule_based_analysis.failure_risks.length > 0 ? (
                            <ul className="space-y-2">
                                {predictionResult.rule_based_analysis.failure_risks.map((risk: string) => (
                                    <li key={risk} className="flex items-start gap-2 text-sm">
                                        <AlertCircle size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
                                        <span className="text-slate-600 dark:text-slate-400">{risk}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                                <CheckCircle size={16} />
                                No critical issues detected in rule-based analysis
                            </p>
                        )}
                    </div>

                    {/* Re-analyze Button - Only for Engineers */}
                    {canAnalyze && (
                        <button
                            onClick={onAnalyze}
                            disabled={analyzing}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors disabled:opacity-50"
                        >
                            <RefreshCw size={18} className={analyzing ? 'animate-spin' : ''} />
                            Re-analyze
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

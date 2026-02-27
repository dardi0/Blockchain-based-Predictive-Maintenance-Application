'use client';

import React from 'react';
import { Machine, SensorData } from '@/types';
import { Activity, ThermometerSun, Gauge, Timer, Zap, Lock, RefreshCw } from 'lucide-react';

export interface MeasurementWithMachine extends SensorData {
    machine: Machine;
}

interface SensorDataPanelProps {
    measurement: MeasurementWithMachine;
    verifying: boolean;
    onVerify: () => void;
}

export default function SensorDataPanel({ measurement, verifying, onVerify }: SensorDataPanelProps) {
    return (
        <div className="bg-white dark:bg-[var(--dark-bg)] rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                    <Activity size={20} className="text-[var(--accent-primary)]" />
                    Sensor Readings
                </h2>
                <div className="flex items-center gap-2">
                    {measurement.blockchain_tx_hash ? (
                        <a
                            href={`https://sepolia.explorer.zksync.io/tx/${measurement.blockchain_tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold rounded-full border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                            title="View Sensor Data on Explorer"
                        >
                            <Lock size={12} />
                            <span>Sensor Verified</span>
                        </a>
                    ) : (
                        <button
                            onClick={onVerify}
                            disabled={verifying}
                            className="flex items-center gap-1.5 px-3 py-1 bg-[var(--accent-highlight)]/10 dark:bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] dark:text-[var(--accent-highlight)] text-xs font-semibold rounded-full border border-blue-200 dark:border-blue-800 hover:bg-[var(--accent-highlight)]/20 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50"
                        >
                            {verifying ? <RefreshCw size={12} className="animate-spin" /> : <Lock size={12} />}
                            <span>{verifying ? 'Verifying...' : 'Verify Data'}</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 rounded-xl border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-2 text-[var(--accent-primary)] dark:text-[var(--accent-highlight)] mb-2">
                        <ThermometerSun size={18} />
                        <span className="text-sm font-medium">Air Temperature</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">
                        {measurement.airTemperature} <span className="text-sm font-normal text-slate-500">K</span>
                    </p>
                </div>

                <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-900/20 dark:to-orange-800/10 rounded-xl border border-orange-200 dark:border-orange-800">
                    <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 mb-2">
                        <ThermometerSun size={18} />
                        <span className="text-sm font-medium">Process Temperature</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">
                        {measurement.processTemperature} <span className="text-sm font-normal text-slate-500">K</span>
                    </p>
                </div>

                <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-800/10 rounded-xl border border-purple-200 dark:border-purple-800">
                    <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-2">
                        <Gauge size={18} />
                        <span className="text-sm font-medium">Rotational Speed</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">
                        {measurement.rotationalSpeed} <span className="text-sm font-normal text-slate-500">rpm</span>
                    </p>
                </div>

                <div className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 rounded-xl border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-2">
                        <Zap size={18} />
                        <span className="text-sm font-medium">Torque</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">
                        {measurement.torque} <span className="text-sm font-normal text-slate-500">Nm</span>
                    </p>
                </div>

                <div className="col-span-2 p-4 bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-900/20 dark:to-amber-800/10 rounded-xl border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
                        <Timer size={18} />
                        <span className="text-sm font-medium">Tool Wear</span>
                    </div>
                    <div className="flex items-end justify-between">
                        <p className="text-2xl font-bold text-slate-800 dark:text-white">
                            {measurement.toolWear} <span className="text-sm font-normal text-slate-500">min</span>
                        </p>
                        <div className="text-right">
                            <div className="h-2 w-32 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className={`h-full ${measurement.toolWear > 200 ? 'bg-red-500' : measurement.toolWear > 150 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${Math.min(100, (measurement.toolWear / 240) * 100)}%` }}
                                />
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Limit: 240 min</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Derived Values */}
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">Derived Values</h3>
                <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <p className="text-slate-500 dark:text-slate-400">Temp Diff (ΔT)</p>
                        <p className="font-semibold text-slate-800 dark:text-white">
                            {(measurement.processTemperature - measurement.airTemperature).toFixed(1)} K
                        </p>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <p className="text-slate-500 dark:text-slate-400">Power</p>
                        <p className="font-semibold text-slate-800 dark:text-white">
                            {((2 * Math.PI * measurement.rotationalSpeed * measurement.torque) / 60000).toFixed(2)} kW
                        </p>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <p className="text-slate-500 dark:text-slate-400">Strain Factor</p>
                        <p className="font-semibold text-slate-800 dark:text-white">
                            {(measurement.toolWear * measurement.torque).toFixed(0)}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

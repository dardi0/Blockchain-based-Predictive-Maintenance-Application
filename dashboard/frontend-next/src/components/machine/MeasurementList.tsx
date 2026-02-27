'use client';

import React from 'react';
import { Machine, MachineStatus, SensorData } from '../../types';
import { AlertTriangle, Activity, CheckCircle, Clock } from 'lucide-react';

interface MeasurementWithMachine extends SensorData {
    machine: Machine;
}

interface MeasurementListProps {
    measurements: MeasurementWithMachine[];
    onMeasurementClick: (measurement: MeasurementWithMachine) => void;
    currentType: string | null;
    onClearFilter: () => void;
    onViewMachine: (machineId: number) => void;
    /** Toplam kayıt sayısı (en yüksek numara) */
    totalCount: number;
    /** Bu sayfadaki ilk satırın global offset'i (0-bazlı) */
    globalStartIndex: number;
}

export const MeasurementList: React.FC<MeasurementListProps> = ({
    measurements,
    onMeasurementClick,
    currentType,
    onClearFilter,
    onViewMachine,
    totalCount,
    globalStartIndex,
}) => {
    if (measurements.length === 0) {
        return (
            <div className="p-8 text-center text-white/30">
                No sensor readings available.
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                    {currentType ? `Machine ${currentType} - All Readings` : 'Sensor Readings'}
                </h3>
                {currentType && (
                    <button
                        onClick={onClearFilter}
                        className="text-sm text-[var(--accent-highlight)] hover:underline"
                    >
                        Show All
                    </button>
                )}
            </div>

            {measurements.map((measurement, index) => (
                <div
                    key={`${(measurement as any).id ?? measurement.machine.id}-${measurement.timestamp}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => onMeasurementClick(measurement)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onMeasurementClick(measurement); }}
                    className="group relative p-4 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition-all duration-300 cursor-pointer"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                            {/* Sequential number badge — newest = totalCount */}
                            <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/[0.10] flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-bold text-white/50">{totalCount - globalStartIndex - index}</span>
                            </div>
                            <div className={`
                                w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                                ${measurement.machine.status === MachineStatus.CRITICAL ? 'bg-red-500/15 text-red-400' :
                                    measurement.machine.status === MachineStatus.WARNING ? 'bg-amber-500/15 text-amber-400' :
                                        'bg-emerald-500/15 text-emerald-400'
                                }
                            `}>
                                {measurement.machine.type}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-white">{measurement.machine.name}</span>
                                    <span className="text-xs text-white/30 font-mono">
                                        {new Date(measurement.timestamp).toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex gap-4 mt-1 text-sm text-white/40">
                                    <span>Speed: <span className="font-mono text-white/60">{measurement.rotationalSpeed} rpm</span></span>
                                    <span>Torque: <span className="font-mono text-white/60">{measurement.torque} Nm</span></span>
                                    <span>Tool Wear: <span className="font-mono text-white/60">{measurement.toolWear} min</span></span>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 mr-4 min-w-[140px]">
                                {measurement.prediction !== undefined && measurement.prediction !== null ? (
                                    <>
                                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${measurement.prediction === 1
                                            ? 'bg-red-500/10 border-red-500/20 text-red-400'
                                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                            }`} title="AI Prediction Analysis">
                                            {measurement.prediction === 1 ? <AlertTriangle size={12} /> : <Activity size={12} />}
                                            <span className="text-xs font-semibold">
                                                {measurement.prediction === 1 ? 'Failure' : 'Normal'}
                                                {measurement.prediction_probability !== undefined && ` (${(measurement.prediction_probability * 100).toFixed(1)}%)`}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1.5 text-xs">
                                            <span className="text-white/30">On-Chain:</span>
                                            {measurement.prediction_tx_hash ? (
                                                <span className="font-medium text-emerald-400 flex items-center gap-0.5">
                                                    Verified <CheckCircle size={10} />
                                                </span>
                                            ) : (
                                                <span className="font-medium text-amber-400 flex items-center gap-0.5">
                                                    Pending <Clock size={10} />
                                                </span>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-white/[0.03] rounded-full border border-white/[0.06] text-white/30">
                                        <span className="text-xs">Not Analyzed</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onViewMachine(Number(measurement.machine.id));
                            }}
                            className="p-2 text-[var(--accent-highlight)] hover:bg-[var(--accent-primary)]/10 rounded-lg transition-colors"
                            title="View Machine Health Details"
                        >
                            <Activity size={20} />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

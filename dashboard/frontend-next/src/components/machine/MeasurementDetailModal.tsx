'use client';

import React from 'react';
import { Machine, MachineStatus, SensorData } from '../../types';
import { X, Activity } from 'lucide-react';

interface MeasurementWithMachine extends SensorData {
    machine: Machine;
}

interface MeasurementDetailModalProps {
    measurement: MeasurementWithMachine | null;
    onClose: () => void;
    onViewMachine: (machineId: string) => void;
}

export const MeasurementDetailModal: React.FC<MeasurementDetailModalProps> = ({ measurement, onClose, onViewMachine }) => {
    if (!measurement) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
            <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0c1322]/95 backdrop-blur-xl shadow-2xl shadow-black/50 animate-zoom-in">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/80 hover:bg-white/[0.08] transition-all z-10"
                >
                    <X size={20} />
                </button>

                {/* Modal Content */}
                <div className="p-8">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-4 mb-8 border-b border-white/[0.07] pb-6">
                        <div className="flex items-center gap-4">
                            <div className={`
                                w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold
                                ${measurement.machine.status === MachineStatus.CRITICAL ? 'bg-red-500/15 text-red-400 border border-red-500/20' :
                                    measurement.machine.status === MachineStatus.WARNING ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' :
                                        'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                }
                            `}>
                                {measurement.machine.type}
                            </div>
                            <div>
                                <h2 className="text-3xl font-bold text-white">{measurement.machine.name}</h2>
                                <div className="flex items-center gap-3 text-white/40 mt-1 font-mono text-sm">
                                    <span>{new Date(measurement.timestamp).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => onViewMachine(measurement.machine.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-primary)]/10 hover:bg-[var(--accent-primary)]/20 border border-[var(--accent-primary)]/30 text-[var(--accent-highlight)] rounded-lg transition-colors text-sm font-semibold"
                        >
                            <Activity size={18} />
                            Machine Dashboard
                        </button>
                    </div>

                    {/* Measurement Details */}
                    <div className="space-y-6 mb-8">
                        <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-4">Reading Details</h4>
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { label: 'Rotational Speed', value: measurement.rotationalSpeed, unit: 'rpm' },
                                { label: 'Torque', value: measurement.torque, unit: 'Nm' },
                                { label: 'Air Temperature', value: measurement.airTemperature, unit: 'K' },
                                { label: 'Process Temperature', value: measurement.processTemperature, unit: 'K' },
                            ].map((item) => (
                                <div key={item.label} className="relative p-4 rounded-xl border border-white/[0.07] bg-white/[0.02]">
                                    <div className="absolute top-0 left-0 w-6 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                                    <div className="absolute top-0 left-0 h-6 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
                                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{item.label}</span>
                                    <p className="font-mono font-bold text-xl text-white mt-1">
                                        {item.value} <span className="text-sm font-normal text-white/30">{item.unit}</span>
                                    </p>
                                </div>
                            ))}
                            <div className="relative p-4 rounded-xl border border-white/[0.07] bg-white/[0.02] col-span-2">
                                <div className="absolute top-0 left-0 w-6 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                                <div className="absolute top-0 left-0 h-6 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
                                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Tool Wear</span>
                                <p className="font-mono font-bold text-xl text-white mt-1">
                                    {measurement.toolWear} <span className="text-sm font-normal text-white/30">min</span>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

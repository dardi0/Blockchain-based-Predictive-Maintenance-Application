'use client';

import React from 'react';
import { AlertTriangle, Eye } from 'lucide-react';
import { Machine, MachineStatus } from '../../types';

interface AttentionPanelProps {
    machines: Machine[];
    onMachineClick: (machineId: string) => void;
}

/**
 * AttentionPanel - Shows machines requiring immediate attention
 */
export const AttentionPanel: React.FC<AttentionPanelProps> = ({ machines, onMachineClick }) => {
    if (machines.length === 0) return null;

    return (
        <div className="relative group p-5 rounded-xl border border-red-500/20 bg-red-500/[0.03]">
            {/* Corner accent - red */}
            <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-red-500 to-transparent" />
            <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-red-500 to-transparent" />

            <h3 className="text-[10px] font-bold text-red-400 mb-4 uppercase tracking-widest flex items-center gap-2">
                <AlertTriangle size={14} /> Requires Attention
            </h3>
            <div className="space-y-2">
                {machines.map(machine => (
                    <div
                        key={machine.id}
                        className="flex items-center justify-between p-3 bg-white/[0.02] hover:bg-white/[0.05] rounded-lg border border-white/[0.05] hover:border-white/[0.1] transition-all duration-200"
                    >
                        <div className="flex items-center gap-3">
                            <span className={`w-2 h-2 rounded-full ${
                                machine.status === MachineStatus.CRITICAL
                                    ? 'bg-red-500 animate-pulse'
                                    : 'bg-amber-500'
                            }`}></span>
                            <div>
                                <p className="text-sm font-medium text-white">{machine.name}</p>
                                <p className="text-xs text-white/30">{machine.healthScore}% health</p>
                            </div>
                        </div>
                        <button
                            onClick={() => onMachineClick(machine.id)}
                            className="p-2 text-[var(--accent-highlight)] hover:bg-[var(--accent-primary)]/10 rounded-lg transition-colors"
                            title="View Details"
                        >
                            <Eye size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AttentionPanel;

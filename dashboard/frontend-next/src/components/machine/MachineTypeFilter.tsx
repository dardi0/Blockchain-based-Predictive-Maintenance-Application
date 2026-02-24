'use client';

import React from 'react';
import { Machine, MachineStatus } from '../../types';

interface MachineTypeFilterProps {
    machines: Machine[];
    selectedType: string | null;
    onSelectType: (type: string) => void;
}

export const MachineTypeFilter: React.FC<MachineTypeFilterProps> = ({ machines, selectedType, onSelectType }) => {
    return (
        <div className="flex gap-4 justify-center">
            {['L', 'M', 'H'].map((type) => {
                const machine = machines.find(a => a.type === type);
                if (!machine) return null;

                const isSelected = selectedType === type;

                return (
                    <button
                        key={type}
                        onClick={() => onSelectType(type)}
                        className={`
                            relative h-24 w-40 rounded-xl flex flex-col items-center justify-center gap-2 transition-all duration-300
                            ${isSelected
                                ? 'bg-[var(--accent-primary)]/20 border-2 border-[var(--accent-highlight)] shadow-lg shadow-[var(--accent-primary)]/20 scale-105'
                                : 'border-2 border-white/[0.07] bg-white/[0.02] hover:border-[var(--accent-primary)]/40 hover:bg-white/[0.04]'
                            }
                        `}
                    >
                        {isSelected && (
                            <>
                                <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[var(--accent-highlight)] to-transparent" />
                                <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-[var(--accent-highlight)] to-transparent" />
                            </>
                        )}
                        <div className={`
                            w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold
                            ${isSelected
                                ? 'bg-[var(--accent-primary)]/30 text-[var(--accent-highlight)]'
                                : machine.status === MachineStatus.CRITICAL ? 'bg-red-500/15 text-red-400' :
                                    machine.status === MachineStatus.WARNING ? 'bg-amber-500/15 text-amber-400' :
                                        'bg-emerald-500/15 text-emerald-400'
                            }
                        `}>
                            {type}
                        </div>
                        <div className={`text-sm font-medium ${isSelected ? 'text-[var(--accent-highlight)]' : 'text-white/60'}`}>
                            Machine {type}
                        </div>
                    </button>
                );
            })}
        </div>
    );
};

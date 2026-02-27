'use client';

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { MachineStatus } from '@/types';

interface MeasurementHeaderProps {
    machineName: string;
    timestamp: string;
    machineStatus: MachineStatus;
    onBack: () => void;
}

const MeasurementHeader: React.FC<MeasurementHeaderProps> = ({
    machineName,
    timestamp,
    machineStatus,
    onBack
}) => {
    return (
        <div className="flex items-center gap-4">
            <button
                onClick={onBack}
                className="p-2 rounded-lg bg-slate-100 dark:bg-[var(--dark-bg)] hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                aria-label="Go back"
            >
                <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
            </button>
            <div className="flex-1">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Measurement Analysis</h1>
                <p className="text-slate-500 dark:text-slate-400">
                    {machineName} • {new Date(timestamp).toLocaleString()}
                </p>
            </div>
            <div className={`
                px-4 py-2 rounded-full text-sm font-semibold
                ${machineStatus === MachineStatus.CRITICAL ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                    machineStatus === MachineStatus.WARNING ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}
            `}>
                {machineStatus || 'Unknown Status'}
            </div>
        </div>
    );
};

export default MeasurementHeader;

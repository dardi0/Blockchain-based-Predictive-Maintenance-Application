'use client';

import React from 'react';
import { Clock, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { RULEstimate } from '@/types';

interface RULCardsProps {
    estimates: RULEstimate[];
}

function getStatusConfig(status: RULEstimate['status']) {
    switch (status) {
        case 'CRITICAL':
            return { color: 'text-red-400', bg: 'bg-red-500/15', bar: 'bg-red-500', icon: AlertTriangle };
        case 'WARNING':
            return { color: 'text-amber-400', bg: 'bg-amber-500/15', bar: 'bg-amber-500', icon: Clock };
        case 'EXCEEDED':
            return { color: 'text-red-500', bg: 'bg-red-600/20', bar: 'bg-red-600', icon: XCircle };
        case 'GOOD':
        default:
            return { color: 'text-emerald-400', bg: 'bg-emerald-500/15', bar: 'bg-emerald-500', icon: CheckCircle };
    }
}

const MACHINE_COLORS: Record<string, string> = {
    L: 'text-violet-400 bg-violet-500/15',
    M: 'text-amber-400 bg-amber-500/15',
    H: 'text-red-400 bg-red-500/15',
};

export function RULCards({ estimates }: RULCardsProps) {
    if (!estimates.length) {
        return (
            <div className="col-span-3 text-center py-8 text-white/30 text-sm">
                No RUL data available
            </div>
        );
    }

    return (
        <>
            {estimates.map((est) => {
                const { color, bg, bar, icon: StatusIcon } = getStatusConfig(est.status);
                const pct = Math.min(100, (est.current_wear / est.critical_threshold) * 100);
                const machineColor = MACHINE_COLORS[est.machine_type] || 'text-white/60 bg-white/10';

                return (
                    <div
                        key={est.machine_id}
                        className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-5"
                    >
                        <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                        <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />

                        <div className="flex items-center justify-between mb-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${machineColor}`}>
                                {est.machine_type}
                            </div>
                            <span className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${bg} ${color}`}>
                                <StatusIcon size={12} />
                                {est.status === 'INSUFFICIENT_DATA' ? 'LOW DATA' : est.status}
                            </span>
                        </div>

                        <p className="text-xs text-white/40 mb-1">Machine {est.machine_id} — RUL Estimate</p>

                        <div className="flex items-baseline gap-2 mb-3">
                            {est.estimated_days !== null ? (
                                <>
                                    <span className={`text-3xl font-bold ${color}`}>
                                        {est.estimated_days < 1 ? '<1' : Math.round(est.estimated_days)}
                                    </span>
                                    <span className="text-white/40 text-sm">days remaining</span>
                                </>
                            ) : (
                                <span className="text-xl font-semibold text-white/40">—</span>
                            )}
                        </div>

                        {/* Progress bar */}
                        <div className="mb-3">
                            <div className="flex justify-between text-xs text-white/40 mb-1">
                                <span>Tool Wear</span>
                                <span>{est.current_wear} / {est.critical_threshold} min</span>
                            </div>
                            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                                <div
                                    className={`h-full ${bar} transition-all`}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                        </div>

                        <div className="text-xs text-white/30 space-y-0.5">
                            <div className="flex justify-between">
                                <span>Daily wear rate</span>
                                <span className="font-mono">{est.daily_rate} min/day</span>
                            </div>
                            {est.estimated_date && (
                                <div className="flex justify-between">
                                    <span>Critical date</span>
                                    <span className="font-mono">{est.estimated_date}</span>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </>
    );
}

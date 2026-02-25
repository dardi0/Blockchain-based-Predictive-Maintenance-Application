'use client';

import React, { useState } from 'react';
import { Clock, Wrench, BellOff, Activity, Info } from 'lucide-react';
import { KPIData } from '@/types';

interface KPICardsProps {
    data: KPIData;
}

interface KPICardDef {
    key: keyof KPIData['overall'];
    label: string;
    icon: React.ElementType;
    unit: string;
    description: string;
    formatValue: (v: number) => string;
    colorFn: (v: number) => string;
}

const KPI_CARDS: KPICardDef[] = [
    {
        key: 'mtbf_hours',
        label: 'MTBF',
        icon: Clock,
        unit: 'hrs',
        description: 'Mean Time Between Failures — higher is better. Measures avg operating hours between breakdowns.',
        formatValue: (v) => v.toFixed(1),
        colorFn: (v) => v > 100 ? 'text-emerald-400' : v > 50 ? 'text-amber-400' : 'text-red-400',
    },
    {
        key: 'mttr_hours',
        label: 'MTTR',
        icon: Wrench,
        unit: 'hrs',
        description: 'Mean Time To Repair — lower is better. Avg time to restore equipment after a failure.',
        formatValue: (v) => v.toFixed(1),
        colorFn: (v) => v < 2 ? 'text-emerald-400' : v < 8 ? 'text-amber-400' : 'text-red-400',
    },
    {
        key: 'false_alarm_rate',
        label: 'False Alarm Rate',
        icon: BellOff,
        unit: '%',
        description: 'Percentage of failure predictions immediately followed by normal readings — lower is better.',
        formatValue: (v) => v.toFixed(1),
        colorFn: (v) => v < 10 ? 'text-emerald-400' : v < 25 ? 'text-amber-400' : 'text-red-400',
    },
    {
        key: 'oee_proxy',
        label: 'OEE Proxy',
        icon: Activity,
        unit: '%',
        description: 'Overall Equipment Effectiveness proxy based on ML health scores — higher is better.',
        formatValue: (v) => v.toFixed(1),
        colorFn: (v) => v > 80 ? 'text-emerald-400' : v > 60 ? 'text-amber-400' : 'text-red-400',
    },
];

function KPICard({ def, value }: { def: KPICardDef; value: number }) {
    const [showTooltip, setShowTooltip] = useState(false);
    const Icon = def.icon;
    const colorClass = def.colorFn(value);

    return (
        <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
            <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />

            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]`}>
                        <Icon size={16} className={colorClass} />
                    </div>
                    <span className="text-xs font-bold text-white/40 uppercase tracking-widest">{def.label}</span>
                </div>
                <div className="relative">
                    <button
                        onMouseEnter={() => setShowTooltip(true)}
                        onMouseLeave={() => setShowTooltip(false)}
                        className="p-1 text-white/20 hover:text-white/50 transition-colors"
                    >
                        <Info size={13} />
                    </button>
                    {showTooltip && (
                        <div className="absolute right-0 top-6 z-50 w-56 bg-[#0a1020]/95 border border-white/[0.08] rounded-xl p-3 text-xs text-white/60 shadow-xl">
                            {def.description}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-baseline gap-1.5">
                <span className={`text-3xl font-bold ${colorClass}`}>
                    {def.formatValue(value)}
                </span>
                <span className="text-white/30 text-sm">{def.unit}</span>
            </div>
        </div>
    );
}

export function KPICards({ data }: KPICardsProps) {
    if (!data?.overall) return null;

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {KPI_CARDS.map((def) => (
                <KPICard key={def.key} def={def} value={data.overall[def.key]} />
            ))}
        </div>
    );
}

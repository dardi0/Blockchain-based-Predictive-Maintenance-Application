'use client';

import React from 'react';
import { Activity, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import { AutomationStatusCard } from './AutomationIndicator';

interface StatsCardsProps {
    total: number;
    critical: number;
    warning: number;
    healthy: number;
}

/**
 * StatsCards - Top row of statistics cards
 */
export const StatsCards: React.FC<StatsCardsProps> = ({ total, critical, warning, healthy }) => {
    const cards = [
        {
            label: 'Total',
            value: total,
            icon: Activity,
            color: 'text-[var(--accent-highlight)]',
            valueColor: 'text-white',
            borderAccent: 'from-[var(--accent-primary)]',
            iconBg: 'bg-[var(--accent-primary)]/15',
        },
        {
            label: 'Critical',
            value: critical,
            icon: AlertTriangle,
            color: 'text-red-400',
            valueColor: 'text-red-400',
            borderAccent: 'from-red-500',
            iconBg: 'bg-red-500/15',
        },
        {
            label: 'Warning',
            value: warning,
            icon: Clock,
            color: 'text-amber-400',
            valueColor: 'text-amber-400',
            borderAccent: 'from-amber-500',
            iconBg: 'bg-amber-500/15',
        },
        {
            label: 'Healthy',
            value: healthy,
            icon: CheckCircle,
            color: 'text-emerald-400',
            valueColor: 'text-emerald-400',
            borderAccent: 'from-emerald-500',
            iconBg: 'bg-emerald-500/15',
        },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {cards.map((card) => (
                <div
                    key={card.label}
                    className="group relative p-5 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition-all duration-300"
                >
                    {/* Corner accent */}
                    <div className={`absolute top-0 left-0 w-8 h-px bg-gradient-to-r ${card.borderAccent} to-transparent`} />
                    <div className={`absolute top-0 left-0 h-8 w-px bg-gradient-to-b ${card.borderAccent} to-transparent`} />

                    {/* Bottom glow */}
                    <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-${card.borderAccent.replace('from-', '')} to-transparent opacity-0 group-hover:opacity-60 transition-opacity duration-500`} />

                    <div className="flex items-center justify-between mb-3">
                        <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">{card.label}</span>
                        <div className={`p-1.5 rounded-lg ${card.iconBg}`}>
                            <card.icon size={14} className={card.color} />
                        </div>
                    </div>
                    <p className={`text-3xl font-bold ${card.valueColor}`}>{card.value}</p>
                </div>
            ))}

            {/* Automation Status */}
            <AutomationStatusCard />
        </div>
    );
};

export default StatsCards;

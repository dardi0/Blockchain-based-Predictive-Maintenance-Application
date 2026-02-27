'use client';

import React, { useState } from 'react';
import { Wrench, AlertTriangle, Shield, Calendar, User } from 'lucide-react';
import { MaintenanceEvent } from '@/types';

interface MaintenanceTimelineProps {
    events: MaintenanceEvent[];
}

const TYPE_CONFIG: Record<string, { color: string; bg: string; icon: React.ElementType; label: string }> = {
    PREVENTIVE: { color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30', icon: Shield, label: 'Preventive' },
    CORRECTIVE: { color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30', icon: Wrench, label: 'Corrective' },
    EMERGENCY: { color: 'text-red-400', bg: 'bg-red-500/15 border-red-500/30', icon: AlertTriangle, label: 'Emergency' },
};

function getTypeConfig(type: string) {
    const key = type.toUpperCase();
    return TYPE_CONFIG[key] || { color: 'text-white/50', bg: 'bg-white/[0.05] border-white/10', icon: Wrench, label: type };
}

const MACHINE_LABELS: Record<number, string> = {
    1001: 'Type L',
    2001: 'Type M',
    3001: 'Type H',
};

export function MaintenanceTimeline({ events }: MaintenanceTimelineProps) {
    const [expanded, setExpanded] = useState<number | null>(null);

    if (!events.length) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-white/30">
                <Wrench size={40} className="mb-3 opacity-40" />
                <p className="text-sm">No maintenance events in the selected period</p>
            </div>
        );
    }

    return (
        <div className="relative space-y-3 max-h-96 overflow-y-auto pr-1">
            {/* Vertical line */}
            <div className="absolute left-[18px] top-0 bottom-0 w-px bg-white/[0.06]" />

            {events.map((event, idx) => {
                const cfg = getTypeConfig(event.type);
                const Icon = cfg.icon;
                const isExpanded = expanded === idx;
                const date = new Date(event.timestamp);

                return (
                    <div
                        key={event.id}
                        role="button"
                        tabIndex={0}
                        className="relative flex gap-4 cursor-pointer"
                        onClick={() => setExpanded(isExpanded ? null : idx)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded(isExpanded ? null : idx); }}
                    >
                        {/* Dot */}
                        <div className={`relative z-10 flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center border ${cfg.bg}`}>
                            <Icon size={15} className={cfg.color} />
                        </div>

                        {/* Content */}
                        <div className={`flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 hover:bg-white/[0.04] transition-colors ${isExpanded ? 'border-white/10' : ''}`}>
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                                        {cfg.label}
                                    </span>
                                    <span className="text-xs text-white/40">
                                        Machine {MACHINE_LABELS[event.machine_id] || event.machine_id}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-white/30">
                                    <Calendar size={11} />
                                    {date.toLocaleDateString()}
                                </div>
                            </div>

                            <p className="text-sm text-white/70 truncate">
                                {event.description || '(No description)'}
                            </p>

                            {isExpanded && (
                                <div className="mt-2 pt-2 border-t border-white/[0.06] space-y-1">
                                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                                        <User size={11} />
                                        {event.technician}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-white/30">
                                        <Calendar size={11} />
                                        {date.toLocaleString()}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

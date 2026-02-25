'use client';

import React, { useState } from 'react';
import { AnomalyFrequencyItem } from '@/types';

interface AnomalyHeatmapProps {
    machines: string[];
    metrics: string[];
    data: AnomalyFrequencyItem[];
}

const METRIC_LABELS: Record<string, string> = {
    air_temp: 'Air Temp',
    process_temp: 'Proc Temp',
    rotation_speed: 'RPM',
    torque: 'Torque',
    tool_wear: 'Tool Wear',
};

function getColor(count: number, maxCount: number): string {
    if (count === 0) return 'rgba(255,255,255,0.03)';
    const ratio = count / Math.max(maxCount, 1);
    if (ratio < 0.33) return 'rgba(234,179,8,0.25)';
    if (ratio < 0.66) return 'rgba(249,115,22,0.35)';
    return 'rgba(239,68,68,0.50)';
}

function getBorderColor(count: number, maxCount: number): string {
    if (count === 0) return 'rgba(255,255,255,0.06)';
    const ratio = count / Math.max(maxCount, 1);
    if (ratio < 0.33) return 'rgba(234,179,8,0.4)';
    if (ratio < 0.66) return 'rgba(249,115,22,0.5)';
    return 'rgba(239,68,68,0.6)';
}

export function AnomalyHeatmap({ machines, metrics, data }: AnomalyHeatmapProps) {
    const [tooltip, setTooltip] = useState<{ machine: string; metric: string; count: number; severity: number } | null>(null);

    // Get all weeks
    const weeks = Array.from(new Set(data.map(d => d.week))).sort();
    const latestWeek = weeks[weeks.length - 1] || null;

    // Build lookup: machine -> metric -> count (for latest week or aggregate)
    const lookup: Record<string, Record<string, { count: number; severity: number }>> = {};
    for (const item of data) {
        if (item.week !== latestWeek && weeks.length > 1) continue;
        if (!lookup[item.machine_id]) lookup[item.machine_id] = {};
        if (!lookup[item.machine_id][item.metric]) {
            lookup[item.machine_id][item.metric] = { count: 0, severity: 0 };
        }
        lookup[item.machine_id][item.metric].count += item.count;
        lookup[item.machine_id][item.metric].severity = Math.max(
            lookup[item.machine_id][item.metric].severity,
            item.severity_avg
        );
    }

    const maxCount = Math.max(1, ...Object.values(lookup).flatMap(m => Object.values(m).map(v => v.count)));

    const MACHINE_LABELS: Record<string, string> = {
        '1001': 'Type L',
        '2001': 'Type M',
        '3001': 'Type H',
    };

    if (!data.length) {
        return (
            <div className="flex items-center justify-center py-12 text-white/30 text-sm">
                No anomaly data for the selected period
            </div>
        );
    }

    return (
        <div className="relative">
            {/* Legend */}
            <div className="flex items-center gap-3 mb-4 text-xs text-white/40">
                <span>Anomaly density:</span>
                <div className="flex items-center gap-1">
                    <span className="w-4 h-4 rounded border" style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }} />
                    <span>None</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="w-4 h-4 rounded border" style={{ backgroundColor: 'rgba(234,179,8,0.25)', borderColor: 'rgba(234,179,8,0.4)' }} />
                    <span>Low</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="w-4 h-4 rounded border" style={{ backgroundColor: 'rgba(249,115,22,0.35)', borderColor: 'rgba(249,115,22,0.5)' }} />
                    <span>Medium</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="w-4 h-4 rounded border" style={{ backgroundColor: 'rgba(239,68,68,0.50)', borderColor: 'rgba(239,68,68,0.6)' }} />
                    <span>High</span>
                </div>
            </div>

            {/* Grid */}
            <div className="overflow-x-auto">
                <table className="w-full border-separate" style={{ borderSpacing: '4px' }}>
                    <thead>
                        <tr>
                            <th className="text-left text-xs text-white/30 pb-2 w-24" />
                            {metrics.map(metric => (
                                <th key={metric} className="text-center text-xs text-white/40 pb-2 font-medium">
                                    {METRIC_LABELS[metric] || metric}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {machines.map(machine => (
                            <tr key={machine}>
                                <td className="text-xs text-white/50 pr-2 font-medium">
                                    {MACHINE_LABELS[machine] || `M${machine}`}
                                </td>
                                {metrics.map(metric => {
                                    const cell = lookup[machine]?.[metric] || { count: 0, severity: 0 };
                                    const bg = getColor(cell.count, maxCount);
                                    const border = getBorderColor(cell.count, maxCount);
                                    return (
                                        <td key={metric} className="text-center">
                                            <div
                                                className="relative h-10 rounded cursor-pointer flex items-center justify-center text-xs font-medium transition-all hover:scale-110"
                                                style={{ backgroundColor: bg, border: `1px solid ${border}` }}
                                                onMouseEnter={() => setTooltip({ machine, metric, count: cell.count, severity: cell.severity })}
                                                onMouseLeave={() => setTooltip(null)}
                                            >
                                                {cell.count > 0 && (
                                                    <span className="text-white/80">{cell.count}</span>
                                                )}
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Tooltip */}
            {tooltip && (
                <div className="fixed z-50 pointer-events-none bg-[#0a1020]/95 border border-white/[0.08] rounded-xl p-3 text-xs shadow-xl"
                     style={{ transform: 'translate(-50%, -110%)', left: '50%', top: '50%' }}>
                    <p className="font-semibold text-white mb-1">
                        {MACHINE_LABELS[tooltip.machine] || tooltip.machine} — {METRIC_LABELS[tooltip.metric] || tooltip.metric}
                    </p>
                    <p className="text-white/60">Anomaly count: <span className="text-white font-medium">{tooltip.count}</span></p>
                    {tooltip.severity > 0 && (
                        <p className="text-white/60">Avg severity: <span className="text-white font-medium">{tooltip.severity.toFixed(2)}σ</span></p>
                    )}
                </div>
            )}

            {latestWeek && (
                <p className="text-xs text-white/30 mt-3">Showing data for {latestWeek}</p>
            )}
        </div>
    );
}

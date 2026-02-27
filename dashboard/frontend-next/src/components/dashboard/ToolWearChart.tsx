'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { ToolWearMachine } from '@/types';

interface ToolWearChartProps {
    machines: ToolWearMachine[];
    criticalThreshold?: number;
    days?: number;
}

const MACHINE_COLORS: Record<string, string> = {
    L: '#8b5cf6',
    M: '#f59e0b',
    H: '#ef4444',
};

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-[#0a1020]/95 border border-white/[0.08] rounded-xl p-3 text-xs">
            <p className="font-semibold text-white mb-2">{label}</p>
            {payload.map((p: any) => (
                <div key={p.dataKey} className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.stroke }} />
                    <span className="text-white/60">{p.name}:</span>
                    <span className="text-white font-medium">{p.value} min</span>
                </div>
            ))}
        </div>
    );
};

const LazyImpl = dynamic(() =>
    import('recharts').then(({ LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine }) => {
        return function Impl({ machines, criticalThreshold = 250 }: ToolWearChartProps) {
            const allDays = new Set<string>();
            machines.forEach(m => m.data.forEach(d => allDays.add(d.day)));
            const sortedDays = Array.from(allDays).sort();

            const mergedData = sortedDays.map(day => {
                const point: Record<string, any> = { day };
                machines.forEach(m => {
                    const rec = m.data.find(d => d.day === day);
                    if (rec) {
                        point[`avg_${m.machine_type}`] = rec.avg_wear;
                        point[`max_${m.machine_type}`] = rec.max_wear;
                    }
                });
                return point;
            });

            return (
                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={mergedData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="day" stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => v.slice(5)} />
                            <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} unit=" min" />
                            <Tooltip content={<CustomTooltip />} />
                            <ReferenceLine
                                y={criticalThreshold}
                                stroke="#ef4444"
                                strokeDasharray="5 5"
                                label={{ value: `Critical (${criticalThreshold})`, fill: '#ef4444', fontSize: 10, position: 'right' }}
                            />
                            <Legend formatter={(value) => <span className="text-xs text-white/50">{value}</span>} />
                            {machines.map(m => (
                                <Line
                                    key={m.machine_id}
                                    type="monotone"
                                    dataKey={`avg_${m.machine_type}`}
                                    name={`Type ${m.machine_type} (avg)`}
                                    stroke={MACHINE_COLORS[m.machine_type] || '#6b7280'}
                                    strokeWidth={2}
                                    dot={false}
                                    connectNulls
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            );
        };
    }),
    { ssr: false, loading: () => <div className="h-72 animate-pulse bg-white/[0.02] rounded-xl" /> }
);

export function ToolWearChart({ machines, criticalThreshold = 250, days = 14 }: ToolWearChartProps) {
    if (!machines.length) {
        return (
            <div className="h-64 flex items-center justify-center text-white/30 text-sm">
                No tool wear data available for the last {days} days
            </div>
        );
    }
    return (
        <LazyImpl machines={machines} criticalThreshold={criticalThreshold} days={days} />
    );
}

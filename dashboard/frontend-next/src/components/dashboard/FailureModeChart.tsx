'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { FailureModeData } from '@/types';

interface FailureModeChartProps {
    data: FailureModeData[];
}

const MODE_COLORS = {
    TWF: '#f59e0b',
    HDF: '#ef4444',
    PWF: '#3b82f6',
    OSF: '#f97316',
    RNF: '#6b7280',
};

const MODE_LABELS = {
    TWF: 'Tool Wear',
    HDF: 'Heat Dissipation',
    PWF: 'Power Failure',
    OSF: 'Overstrain',
    RNF: 'Random',
};

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-[#0a1020]/95 border border-white/[0.08] rounded-xl p-3 text-xs">
            <p className="font-semibold text-white mb-2">Machine {label}</p>
            {payload.map((p: any) => (
                <div key={p.dataKey} className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.fill }} />
                    <span className="text-white/60">{MODE_LABELS[p.dataKey as keyof typeof MODE_LABELS]}:</span>
                    <span className="text-white font-medium">{p.value}</span>
                </div>
            ))}
        </div>
    );
};

const LazyImpl = dynamic(() =>
    import('recharts').then(({ BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend }) => {
        return function Impl({ data }: FailureModeChartProps) {
            const chartData = data.map(d => ({
                name: `Type ${d.machine_type}`,
                TWF: d.TWF,
                HDF: d.HDF,
                PWF: d.PWF,
                OSF: d.OSF,
                RNF: d.RNF,
                total: d.total_failures,
            }));

            return (
                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="name" stroke="rgba(255,255,255,0.2)" fontSize={11} tickLine={false} axisLine={false} />
                            <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend
                                formatter={(value) => (
                                    <span className="text-xs text-white/50">
                                        {MODE_LABELS[value as keyof typeof MODE_LABELS] || value}
                                    </span>
                                )}
                            />
                            {(Object.keys(MODE_COLORS) as (keyof typeof MODE_COLORS)[]).map((mode) => (
                                <Bar
                                    key={mode}
                                    dataKey={mode}
                                    stackId="a"
                                    fill={MODE_COLORS[mode]}
                                    radius={mode === 'RNF' ? [4, 4, 0, 0] : undefined}
                                />
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            );
        };
    }),
    { ssr: false, loading: () => <div className="h-72 animate-pulse bg-[#0a1020]/50 rounded-xl border border-white/[0.05]" /> }
);

export function FailureModeChart({ data }: FailureModeChartProps) {
    if (!data.length) {
        return (
            <div className="h-64 flex items-center justify-center text-white/30 text-sm">
                No failure data available
            </div>
        );
    }
    return <LazyImpl data={data} />;
}

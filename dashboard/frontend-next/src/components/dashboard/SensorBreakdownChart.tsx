'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

interface SensorEntry {
    name: string;
    score: number;
    val: number | undefined;
    [key: string]: any;
}

interface SensorBreakdownChartProps {
    data: SensorEntry[];
    getScoreColor: (score: number) => string;
}

const LazyImpl = dynamic(() =>
    import('recharts').then(({ BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine }) => {
        return function Impl({ data, getScoreColor }: SensorBreakdownChartProps) {
            return (
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data as any[]} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#94a3b8" opacity={0.1} />
                            <XAxis type="number" domain={[0, 100]} hide />
                            <YAxis dataKey="name" type="category" width={100} tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} />
                            <Tooltip
                                cursor={{ fill: 'transparent' }}
                                contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: 'none', borderRadius: '8px', color: '#fff' }}
                                formatter={(value: number | undefined) => [value !== undefined ? `${value}%` : '—', 'Health Score']}
                            />
                            <ReferenceLine x={100} stroke="#e2e8f0" strokeOpacity={0.5} />
                            <Bar dataKey="score" radius={[0, 4, 4, 0] as [number, number, number, number]} barSize={24} background={{ fill: '#f1f5f9' }}>
                                {data.map((entry) => (
                                    <Cell key={entry.name} fill={getScoreColor(entry.score)} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            );
        };
    }),
    { ssr: false, loading: () => <div className="h-64 animate-pulse bg-white/[0.02] rounded-xl" /> }
);

export function SensorBreakdownChart(props: SensorBreakdownChartProps) {
    return <LazyImpl {...props} />;
}

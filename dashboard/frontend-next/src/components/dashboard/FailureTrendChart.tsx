'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

interface TrendEntry {
    date: string;
    avg_probability: number;
    [key: string]: any;
}

interface FailureTrendChartProps {
    data: TrendEntry[];
}

const LazyImpl = dynamic(() =>
    import('recharts').then(({ AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer }) => {
        return function Impl({ data }: FailureTrendChartProps) {
            return (
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data as any[]}>
                            <defs>
                                <linearGradient id="colorProb" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.35} />
                                    <stop offset="50%" stopColor="var(--accent-highlight)" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} domain={[0, 1]} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'rgba(10, 16, 32, 0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}
                                labelStyle={{ color: 'rgba(255,255,255,0.4)' }}
                                itemStyle={{ color: '#fff' }}
                                formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, 'Avg Probability']}
                            />
                            <Area type="monotone" dataKey="avg_probability" stroke="var(--accent-primary)" strokeWidth={3} fill="url(#colorProb)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            );
        };
    }),
    { ssr: false, loading: () => <div className="h-64 animate-pulse bg-white/[0.02] rounded-xl" /> }
);

export function FailureTrendChart(props: FailureTrendChartProps) {
    return <LazyImpl {...props} />;
}

'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

interface MachineComparison {
    machine_id: number;
    machine_type: string;
    total_records: number;
    failure_count: number;
    failure_rate: number;
    avg_failure_probability: number;
    avg_tool_wear: number;
    max_tool_wear: number;
    health_score: number;
    status: string;
}

interface HealthScoreComparisonChartProps {
    data: MachineComparison[];
}

const LazyImpl = dynamic(() =>
    import('recharts').then(({ BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer }) => {
        return function Impl({ data }: HealthScoreComparisonChartProps) {
            return (
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="machine_type" stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} domain={[0, 100]} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: 'rgba(10, 16, 32, 0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }} itemStyle={{ color: '#fff' }} />
                            <Bar dataKey="health_score" name="Health Score" fill="var(--accent-primary)" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            );
        };
    }),
    { ssr: false, loading: () => <div className="h-64 animate-pulse bg-white/[0.02] rounded-xl" /> }
);

export default function HealthScoreComparisonChart({ data }: HealthScoreComparisonChartProps) {
    if (!data || data.length === 0) {
        return <div className="h-64 flex items-center justify-center text-white/30">No comparison data available</div>;
    }
    return <LazyImpl data={data} />;
}

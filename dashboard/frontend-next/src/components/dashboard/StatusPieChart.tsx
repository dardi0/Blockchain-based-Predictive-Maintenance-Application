'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

const COLORS = {
    operational: '#10b981',
    warning: '#f59e0b',
    critical: '#ef4444',
};

interface StatusPieChartProps {
    operational: number;
    warning: number;
    critical: number;
}

const LazyImpl = dynamic(() =>
    import('recharts').then(({ PieChart, Pie, Cell, Tooltip, ResponsiveContainer }) => {
        return function Impl({ operational, warning, critical }: StatusPieChartProps) {
            const pieData = [
                { name: 'Operational', value: operational, color: COLORS.operational },
                { name: 'Warning', value: warning, color: COLORS.warning },
                { name: 'Critical', value: critical, color: COLORS.critical },
            ].filter(d => d.value > 0);

            return (
                <>
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={70}
                                    paddingAngle={5}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {pieData.map((entry) => (
                                        <Cell key={entry.name} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'rgba(10, 16, 32, 0.95)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: '10px',
                                        backdropFilter: 'blur(12px)',
                                    }}
                                    itemStyle={{ color: '#fff', fontSize: '12px' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-4 mt-2">
                        {pieData.map(d => (
                            <div key={d.name} className="flex items-center gap-1.5 text-xs">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }}></span>
                                <span className="text-white/50">{d.name}</span>
                            </div>
                        ))}
                    </div>
                </>
            );
        };
    }),
    { ssr: false, loading: () => <div className="h-48 animate-pulse bg-white/[0.02] rounded-xl" /> }
);

export const StatusPieChart: React.FC<StatusPieChartProps> = (props) => {
    return (
        <div className="relative group p-6 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition-all duration-300">
            <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
            <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-[var(--accent-primary)] to-transparent opacity-0 group-hover:opacity-60 transition-opacity duration-500" />
            <h3 className="text-[10px] font-bold text-white/40 mb-4 uppercase tracking-widest">
                Status Distribution
            </h3>
            <LazyImpl {...props} />
        </div>
    );
};

export default StatusPieChart;

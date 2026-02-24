'use client';

import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

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

/**
 * StatusPieChart - Donut chart showing machine status distribution
 */
export const StatusPieChart: React.FC<StatusPieChartProps> = ({ operational, warning, critical }) => {
    const pieData = [
        { name: 'Operational', value: operational, color: COLORS.operational },
        { name: 'Warning', value: warning, color: COLORS.warning },
        { name: 'Critical', value: critical, color: COLORS.critical },
    ].filter(d => d.value > 0);

    return (
        <div className="relative group p-6 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition-all duration-300">
            {/* Corner accent */}
            <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
            <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />

            {/* Bottom glow */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-[var(--accent-primary)] to-transparent opacity-0 group-hover:opacity-60 transition-opacity duration-500" />

            <h3 className="text-[10px] font-bold text-white/40 mb-4 uppercase tracking-widest">
                Status Distribution
            </h3>
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
                            {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
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
        </div>
    );
};

export default StatusPieChart;

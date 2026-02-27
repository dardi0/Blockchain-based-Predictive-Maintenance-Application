'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { BarChart3 } from 'lucide-react';
import { Machine } from '../../types';

interface HealthBarChartProps {
    machines: Machine[];
    onMachineClick: (machineId: string) => void;
}

const LazyImpl = dynamic(() =>
    import('recharts').then(({ BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer }) => {
        return function Impl({ machines, onMachineClick }: HealthBarChartProps) {
            const chartData = machines.map(a => ({
                name: a.name,
                ml: a.mlHealthScore || a.healthScore,
                eng: a.engHealthScore || a.healthScore,
                id: a.id,
            }));

            return (
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                            <defs>
                                <linearGradient id="colorML" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.3} />
                                </linearGradient>
                                <linearGradient id="colorEng" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#059669" stopOpacity={0.3} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="name" stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.25)" fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'rgba(10, 16, 32, 0.95)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: '10px',
                                    backdropFilter: 'blur(12px)',
                                }}
                                itemStyle={{ color: '#f8fafc', fontWeight: 'bold', fontSize: '12px' }}
                                labelStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginBottom: '4px' }}
                                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                            />
                            <Bar
                                dataKey="ml"
                                name="AI Prediction"
                                fill="url(#colorML)"
                                radius={[4, 4, 0, 0]}
                                barSize={16}
                                style={{ cursor: 'pointer' }}
                                onClick={(data: any) => {
                                    const machine = machines.find(m => m.name === data.name);
                                    if (machine) onMachineClick(machine.id);
                                }}
                            />
                            <Bar
                                dataKey="eng"
                                name="Engineering Rule"
                                fill="url(#colorEng)"
                                radius={[4, 4, 0, 0]}
                                barSize={16}
                                style={{ cursor: 'pointer' }}
                                onClick={(data: any) => {
                                    const machine = machines.find(m => m.name === data.name);
                                    if (machine) onMachineClick(machine.id);
                                }}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            );
        };
    }),
    { ssr: false, loading: () => <div className="h-64 animate-pulse bg-white/[0.02] rounded-xl" /> }
);

export const HealthBarChart: React.FC<HealthBarChartProps> = (props) => {
    return (
        <div className="relative group p-6 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition-all duration-300">
            <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
            <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-[var(--accent-primary)] to-transparent opacity-0 group-hover:opacity-60 transition-opacity duration-500" />

            <div className="flex items-center gap-2 mb-4">
                <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                    <BarChart3 size={14} className="text-[var(--accent-highlight)]" /> Machine Health Overview
                </h3>
                <div className="text-[10px] text-white/30 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
                    Click bars for details
                </div>
            </div>

            <p className="text-xs text-white/40 mb-4 px-1">
                Comparing <strong className="text-white/60">AI Prediction</strong> vs <strong className="text-white/60">Engineering Rules</strong>.
                Click on any machine to see the detailed calculation breakdown.
            </p>

            <div className="flex gap-4 mb-2">
                <span className="flex items-center gap-1.5 text-xs text-white/50">
                    <span className="w-2 h-2 rounded-full bg-violet-500"></span> AI Prediction
                </span>
                <span className="flex items-center gap-1.5 text-xs text-white/50">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Engineering
                </span>
            </div>

            <LazyImpl {...props} />
        </div>
    );
};

export default HealthBarChart;

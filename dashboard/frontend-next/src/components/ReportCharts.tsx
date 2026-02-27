'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

interface StatusEntry { name: string; value: number; color: string;[key: string]: any }
interface BarEntry { name: string; health: number;[key: string]: any }

interface ReportChartsProps {
    statusData: StatusEntry[];
    barData: BarEntry[];
}

const LazyImpl = dynamic(() =>
    import('recharts').then(({ PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip }) => {
        return function Impl({ statusData, barData }: ReportChartsProps) {
            return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {statusData.length > 0 && (
                        <div className="p-5 rounded-xl border border-white/[0.07] bg-white/[0.02]">
                            <h4 className="text-[10px] font-bold text-white/30 mb-4 uppercase tracking-widest">Status Distribution</h4>
                            <div className="h-48">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={statusData as any[]} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value" stroke="none">
                                            {statusData.map((entry) => (
                                                <Cell key={entry.name} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'rgba(10, 16, 32, 0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}
                                            itemStyle={{ color: '#fff', fontSize: '12px' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex justify-center gap-4 mt-2">
                                {statusData.map((d) => (
                                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }}></span>
                                        <span className="text-white/40">{d.name} ({d.value})</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {barData.length > 0 && (
                        <div className="p-5 rounded-xl border border-white/[0.07] bg-white/[0.02]">
                            <h4 className="text-[10px] font-bold text-white/30 mb-4 uppercase tracking-widest">Machine Health Scores</h4>
                            <div className="h-48">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={barData as any[]} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                        <XAxis dataKey="name" stroke="rgba(255,255,255,0.2)" fontSize={9} tickLine={false} axisLine={false} />
                                        <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.2)" fontSize={9} tickLine={false} axisLine={false} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: 'rgba(10, 16, 32, 0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}
                                            itemStyle={{ color: '#fff' }}
                                        />
                                        <Bar dataKey="health" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </div>
            );
        };
    }),
    { ssr: false, loading: () => <div className="h-48 animate-pulse bg-white/[0.02] rounded-xl" /> }
);

export function ReportCharts(props: ReportChartsProps) {
    return <LazyImpl {...props} />;
}

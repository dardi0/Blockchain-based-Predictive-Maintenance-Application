'use client';

import React from 'react';
import { X, Download, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { SavedReport } from '../types';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';

interface ReportCompareModalProps {
    reportA: SavedReport;
    reportB: SavedReport;
    onClose: () => void;
}

function getSummary(report: SavedReport) {
    const content = report.content || {};
    const summary = content.summary || {};
    const machines = content.machines || [];
    return { summary, machines };
}

function DiffValue({ a, b, unit = '' }: { a: number; b: number; unit?: string }) {
    const diff = b - a;
    if (Math.abs(diff) < 0.01) {
        return (
            <span className="flex items-center gap-1 text-white/40">
                <Minus size={12} />
                <span>No change</span>
            </span>
        );
    }
    const isPositive = diff > 0;
    return (
        <span className={`flex items-center gap-1 font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {isPositive ? '+' : ''}{diff.toFixed(1)}{unit}
        </span>
    );
}

function SummaryCard({ label, valueA, valueB, unit = '' }: { label: string; valueA: number; valueB: number; unit?: string }) {
    return (
        <div className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <p className="text-xs text-white/40 mb-2">{label}</p>
            <div className="flex items-center justify-between">
                <div className="text-center">
                    <span className="text-xs text-white/30 block mb-0.5">A</span>
                    <span className="text-lg font-bold text-white">{valueA}{unit}</span>
                </div>
                <DiffValue a={valueA} b={valueB} unit={unit} />
                <div className="text-center">
                    <span className="text-xs text-white/30 block mb-0.5">B</span>
                    <span className="text-lg font-bold text-white">{valueB}{unit}</span>
                </div>
            </div>
        </div>
    );
}

export function ReportCompareModal({ reportA, reportB, onClose }: ReportCompareModalProps) {
    const { summary: sumA, machines: machA } = getSummary(reportA);
    const { summary: sumB, machines: machB } = getSummary(reportB);

    // Build bar chart comparison
    const chartData = [
        { name: 'Avg Health', A: sumA.avgHealth || 0, B: sumB.avgHealth || 0 },
        { name: 'Critical', A: sumA.critical || 0, B: sumB.critical || 0 },
        { name: 'Warning', A: sumA.warning || 0, B: sumB.warning || 0 },
        { name: 'Total Machines', A: sumA.total || 0, B: sumB.total || 0 },
    ];

    const handleDownloadComparison = () => {
        const comparison = {
            generatedAt: new Date().toISOString(),
            reportA: { id: reportA.id, title: reportA.title, created_at: reportA.created_at, summary: sumA },
            reportB: { id: reportB.id, title: reportB.title, created_at: reportB.created_at, summary: sumB },
            diff: {
                avgHealth: (sumB.avgHealth || 0) - (sumA.avgHealth || 0),
                critical: (sumB.critical || 0) - (sumA.critical || 0),
                warning: (sumB.warning || 0) - (sumA.warning || 0),
            }
        };
        const blob = new Blob([JSON.stringify(comparison, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report_comparison_${reportA.id}_vs_${reportB.id}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <div className="relative w-full max-w-6xl max-h-[90vh] rounded-2xl border border-white/[0.08] bg-[#0c1322]/95 backdrop-blur-xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden animate-zoom-in">

                {/* Header */}
                <div className="p-5 border-b border-white/[0.07] flex items-center justify-between flex-shrink-0">
                    <h3 className="text-lg font-bold text-white">Report Comparison</h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleDownloadComparison}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] rounded-lg text-white/60 hover:text-white transition-all"
                        >
                            <Download size={14} />
                            Download JSON
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-white/30 hover:text-red-400 hover:bg-red-500/10 border border-white/[0.07] rounded-lg transition-all"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-5 space-y-5">
                    {/* Report titles */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 rounded-xl border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5">
                            <p className="text-xs text-white/40 mb-1">Report A</p>
                            <p className="text-sm font-medium text-white truncate">{reportA.title}</p>
                            <p className="text-xs text-white/30 font-mono mt-0.5">
                                {new Date(reportA.created_at).toLocaleString()}
                            </p>
                        </div>
                        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                            <p className="text-xs text-white/40 mb-1">Report B</p>
                            <p className="text-sm font-medium text-white truncate">{reportB.title}</p>
                            <p className="text-xs text-white/30 font-mono mt-0.5">
                                {new Date(reportB.created_at).toLocaleString()}
                            </p>
                        </div>
                    </div>

                    {/* KPI Diff Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <SummaryCard label="Avg Health Score" valueA={sumA.avgHealth || 0} valueB={sumB.avgHealth || 0} unit="%" />
                        <SummaryCard label="Total Machines" valueA={sumA.total || 0} valueB={sumB.total || 0} />
                        <SummaryCard label="Critical Machines" valueA={sumA.critical || 0} valueB={sumB.critical || 0} />
                        <SummaryCard label="Warning Machines" valueA={sumA.warning || 0} valueB={sumB.warning || 0} />
                    </div>

                    {/* Bar chart comparison */}
                    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                        <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4">
                            Side-by-Side Comparison
                        </h4>
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                    <XAxis dataKey="name" stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} />
                                    <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'rgba(10,16,32,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}
                                        itemStyle={{ color: '#fff', fontSize: 12 }}
                                    />
                                    <Legend formatter={(v) => <span className="text-xs text-white/50">Report {v}</span>} />
                                    <Bar dataKey="A" name="A" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="B" name="B" fill="#10b981" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Machine comparison */}
                    {(machA.length > 0 || machB.length > 0) && (
                        <div className="grid grid-cols-2 gap-4">
                            {[{ label: 'A', machines: machA }, { label: 'B', machines: machB }].map(({ label, machines }) => (
                                <div key={label} className={`rounded-xl border ${label === 'A' ? 'border-[var(--accent-primary)]/20' : 'border-emerald-500/20'} bg-white/[0.01] overflow-hidden`}>
                                    <div className={`px-4 py-2.5 border-b ${label === 'A' ? 'border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/5' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
                                        <p className="text-xs font-bold text-white/50 uppercase tracking-widest">Report {label} — Machines</p>
                                    </div>
                                    <div className="divide-y divide-white/[0.04] max-h-44 overflow-y-auto">
                                        {machines.slice(0, 10).map((m: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between px-4 py-2.5">
                                                <div>
                                                    <p className="text-xs font-medium text-white">{m.name || `M#${m.id}`}</p>
                                                    <p className="text-xs text-white/30">Type: {m.type}</p>
                                                </div>
                                                <span className={`text-sm font-bold ${(m.healthScore || 0) >= 75 ? 'text-emerald-400' : (m.healthScore || 0) >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                                                    {m.healthScore || 0}%
                                                </span>
                                            </div>
                                        ))}
                                        {machines.length === 0 && (
                                            <p className="px-4 py-3 text-xs text-white/30">No machine data</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

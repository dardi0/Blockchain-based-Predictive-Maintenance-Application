'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/services/api';
import { useDashboard } from '@/components/DashboardShell';
import {
    Activity, AlertTriangle, TrendingUp, BarChart3, RefreshCw,
    ArrowUp, ArrowDown, Minus, Calendar, Download, Filter
} from 'lucide-react';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend, AreaChart, Area
} from 'recharts';

interface TrendData {
    date: string;
    avg_probability: number;
    failure_count: number;
    total_predictions: number;
}

interface Anomaly {
    machine_id: number;
    timestamp: string;
    metric: string;
    value: number;
    z_score: number;
    expected_range: string;
    severity: string;
}

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

export default function AnalyticsPage() {
    const { user } = useDashboard();
    const [activeTab, setActiveTab] = useState<'trend' | 'anomalies' | 'comparison'>('trend');
    const [loading, setLoading] = useState(true);
    const [selectedMachine, setSelectedMachine] = useState<number>(1001);
    const [trendDays, setTrendDays] = useState<number>(7);

    const [trendData, setTrendData] = useState<TrendData[]>([]);
    const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
    const [comparison, setComparison] = useState<MachineComparison[]>([]);

    const fetchTrend = async () => {
        try {
            const data = await api.getPredictionTrend(selectedMachine, trendDays);
            setTrendData((data.trend || []) as TrendData[]);
        } catch (error) {
            console.error('Failed to fetch trend:', error);
        }
    };

    const fetchAnomalies = async () => {
        try {
            const data = await api.getAnomalies(24, 2.0);
            setAnomalies((data.anomalies || []) as Anomaly[]);
        } catch (error) {
            console.error('Failed to fetch anomalies:', error);
        }
    };

    const fetchComparison = async () => {
        try {
            const data = await api.getMachineComparison();
            setComparison(((data as { comparison?: unknown[] }).comparison || (data as { machines?: unknown[] }).machines || []) as MachineComparison[]);
        } catch (error) {
            console.error('Failed to fetch comparison:', error);
        }
    };

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            await Promise.all([fetchTrend(), fetchAnomalies(), fetchComparison()]);
            setLoading(false);
        };
        fetchAll();
    }, []);

    useEffect(() => {
        fetchTrend();
    }, [selectedMachine, trendDays]);

    const handleExport = async () => {
        try {
            const data = await api.exportReport('csv', undefined, 7, user?.address);
            const blob = new Blob([data as string], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pdm_analytics_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
        } catch (error) {
            console.error('Export failed:', error);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'CRITICAL': return 'text-red-400 bg-red-500/15';
            case 'WARNING': return 'text-amber-400 bg-amber-500/15';
            default: return 'text-emerald-400 bg-emerald-500/15';
        }
    };

    const getSeverityBadge = (severity: string) => {
        return severity === 'HIGH'
            ? 'bg-red-500/15 text-red-400'
            : 'bg-amber-500/15 text-amber-400';
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30">
                            <BarChart3 className="text-[var(--accent-highlight)]" size={22} />
                        </div>
                        Analytics Dashboard
                    </h1>
                    <p className="text-white/40 mt-1">
                        Prediction trends, anomaly detection, and machine comparison
                    </p>
                </div>
                <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/80 text-white rounded-xl transition-colors"
                >
                    <Download size={18} />
                    Export CSV
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 bg-white/[0.03] border border-white/[0.07] p-1 rounded-xl w-fit">
                {[
                    { id: 'trend', label: 'Prediction Trend', icon: TrendingUp },
                    { id: 'anomalies', label: 'Anomaly Detection', icon: AlertTriangle },
                    { id: 'comparison', label: 'Machine Comparison', icon: BarChart3 }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all text-sm ${
                            activeTab === tab.id
                                ? 'bg-[var(--accent-primary)] text-white shadow-lg shadow-[var(--accent-primary)]/25'
                                : 'text-white/40 hover:text-white/70'
                        }`}
                    >
                        <tab.icon size={18} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <RefreshCw className="animate-spin text-[var(--accent-primary)]" size={32} />
                </div>
            ) : (
                <>
                    {/* Prediction Trend Tab */}
                    {activeTab === 'trend' && (
                        <div className="space-y-6">
                            {/* Controls */}
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-medium text-white/40">Machine:</label>
                                    <select
                                        value={selectedMachine}
                                        onChange={(e) => setSelectedMachine(Number(e.target.value))}
                                        className="px-3 py-2 bg-white/[0.03] border border-white/[0.07] rounded-lg text-sm text-white"
                                    >
                                        <option value={1001} className="bg-[#0a1020]">L (ID: 1001)</option>
                                        <option value={2001} className="bg-[#0a1020]">M (ID: 2001)</option>
                                        <option value={3001} className="bg-[#0a1020]">H (ID: 3001)</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-medium text-white/40">Period:</label>
                                    <select
                                        value={trendDays}
                                        onChange={(e) => setTrendDays(Number(e.target.value))}
                                        className="px-3 py-2 bg-white/[0.03] border border-white/[0.07] rounded-lg text-sm text-white"
                                    >
                                        <option value={7} className="bg-[#0a1020]">Last 7 days</option>
                                        <option value={14} className="bg-[#0a1020]">Last 14 days</option>
                                        <option value={30} className="bg-[#0a1020]">Last 30 days</option>
                                    </select>
                                </div>
                                <button
                                    onClick={fetchTrend}
                                    className="p-2 text-white/30 hover:text-[var(--accent-highlight)] hover:bg-white/[0.04] rounded-lg transition-colors"
                                >
                                    <RefreshCw size={18} />
                                </button>
                            </div>

                            {/* Trend Chart */}
                            <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                                <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                                <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
                                <h3 className="text-lg font-semibold text-white mb-4">
                                    Failure Probability Trend
                                </h3>
                                {trendData.length > 0 ? (
                                    <div className="h-80">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={trendData}>
                                                <defs>
                                                    <linearGradient id="colorProb" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3}/>
                                                        <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                                <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} />
                                                <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} domain={[0, 1]} tickFormatter={(v) => `${(v*100).toFixed(0)}%`} tickLine={false} axisLine={false} />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: 'rgba(10, 16, 32, 0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}
                                                    labelStyle={{ color: 'rgba(255,255,255,0.4)' }}
                                                    itemStyle={{ color: '#fff' }}
                                                    formatter={(value: number) => [`${(value*100).toFixed(1)}%`, 'Avg Probability']}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="avg_probability"
                                                    stroke="var(--accent-primary)"
                                                    strokeWidth={3}
                                                    fill="url(#colorProb)"
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                ) : (
                                    <div className="h-80 flex items-center justify-center text-white/30">
                                        No trend data available
                                    </div>
                                )}
                            </div>

                            {/* Daily Stats */}
                            {trendData.length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {trendData.slice(-3).reverse().map((day) => (
                                        <div key={day.date} className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                                            <div className="absolute top-0 left-0 w-6 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                                            <div className="absolute top-0 left-0 h-6 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
                                            <p className="text-sm text-white/40">{day.date}</p>
                                            <p className="text-2xl font-bold text-white mt-1">
                                                {(day.avg_probability * 100).toFixed(1)}%
                                            </p>
                                            <p className="text-xs text-white/30 mt-1">
                                                {day.failure_count} failures / {day.total_predictions} predictions
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Anomaly Detection Tab */}
                    {activeTab === 'anomalies' && (
                        <div className="space-y-6">
                            <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                                <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-orange-500 to-transparent" />
                                <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-orange-500 to-transparent" />
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                        <AlertTriangle className="text-orange-400" />
                                        Detected Anomalies (Last 24 Hours)
                                    </h3>
                                    <span className="px-3 py-1 bg-orange-500/15 text-orange-400 rounded-full text-sm font-medium">
                                        {anomalies.length} found
                                    </span>
                                </div>

                                {anomalies.length > 0 ? (
                                    <div className="space-y-3 max-h-96 overflow-y-auto">
                                        {anomalies.map((anomaly, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center justify-between p-4 bg-white/[0.03] rounded-xl border border-white/[0.05]"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                                                        anomaly.machine_id === 1001 ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-highlight)]' :
                                                        anomaly.machine_id === 2001 ? 'bg-emerald-500/15 text-emerald-400' :
                                                        'bg-violet-500/15 text-violet-400'
                                                    }`}>
                                                        {anomaly.machine_id === 1001 ? 'L' : anomaly.machine_id === 2001 ? 'M' : 'H'}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-white">
                                                            {anomaly.metric.replace('_', ' ').toUpperCase()}
                                                        </p>
                                                        <p className="text-sm text-white/40">
                                                            Value: <span className="font-mono">{anomaly.value.toFixed(2)}</span>
                                                            <span className="mx-2">•</span>
                                                            Expected: <span className="font-mono">{anomaly.expected_range}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm text-white/40">
                                                        {anomaly.z_score}σ deviation
                                                    </span>
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityBadge(anomaly.severity)}`}>
                                                        {anomaly.severity}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 text-white/30">
                                        <Activity size={48} className="mx-auto mb-4 opacity-50" />
                                        <p>No anomalies detected in the last 24 hours</p>
                                        <p className="text-sm mt-1">All sensor readings are within normal range</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Machine Comparison Tab */}
                    {activeTab === 'comparison' && (
                        <div className="space-y-6">
                            {/* Comparison Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {comparison.map((machine) => (
                                    <div
                                        key={machine.machine_id}
                                        className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6"
                                    >
                                        <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                                        <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
                                        <div className="flex items-center justify-between mb-4">
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold ${
                                                machine.machine_type === 'L' ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-highlight)]' :
                                                machine.machine_type === 'M' ? 'bg-emerald-500/15 text-emerald-400' :
                                                'bg-violet-500/15 text-violet-400'
                                            }`}>
                                                {machine.machine_type}
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(machine.status)}`}>
                                                {machine.status}
                                            </span>
                                        </div>

                                        <h3 className="text-lg font-semibold text-white mb-4">
                                            Machine {machine.machine_type} (ID: {machine.machine_id})
                                        </h3>

                                        <div className="space-y-3">
                                            <div className="flex justify-between">
                                                <span className="text-white/40">Health Score</span>
                                                <span className="font-bold text-white">{machine.health_score}%</span>
                                            </div>
                                            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${machine.health_score > 70 ? 'bg-emerald-500' : machine.health_score > 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                    style={{ width: `${machine.health_score}%` }}
                                                />
                                            </div>

                                            <div className="pt-3 border-t border-white/[0.07] space-y-2 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-white/40">Total Records</span>
                                                    <span className="text-white">{machine.total_records}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-white/40">Failure Rate</span>
                                                    <span className="text-white">{machine.failure_rate}%</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-white/40">Avg Tool Wear</span>
                                                    <span className="text-white">{machine.avg_tool_wear} min</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-white/40">Max Tool Wear</span>
                                                    <span className={`font-medium ${machine.max_tool_wear > 200 ? 'text-red-400' : 'text-white'}`}>
                                                        {machine.max_tool_wear} min
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Comparison Chart */}
                            <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                                <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                                <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
                                <h3 className="text-lg font-semibold text-white mb-4">
                                    Health Score Comparison
                                </h3>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={comparison}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                            <XAxis dataKey="machine_type" stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} />
                                            <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} domain={[0, 100]} tickLine={false} axisLine={false} />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: 'rgba(10, 16, 32, 0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}
                                                itemStyle={{ color: '#fff' }}
                                            />
                                            <Bar dataKey="health_score" name="Health Score" fill="var(--accent-primary)" radius={[6, 6, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

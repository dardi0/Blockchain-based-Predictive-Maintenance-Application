'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useDashboard } from '@/components/DashboardShell';
import { api } from '@/services/api';
import {
    Wrench, AlertTriangle, Activity, TrendingUp, ChevronRight,
    BarChart3, Search, Bell, CheckCircle, AlertCircle,
    Zap, RefreshCw, ArrowRight,
    Brain, Calendar, Download, ExternalLink, Radio
} from 'lucide-react';

const FailureTrendChart = dynamic(
    () => import('@/components/dashboard/FailureTrendChart').then(m => ({ default: m.FailureTrendChart })),
    { ssr: false, loading: () => <div className="h-64 animate-pulse bg-white/[0.03] rounded-xl" /> }
);

// ── Interfaces ──
interface Alert {
    id: string;
    type: 'critical' | 'warning' | 'info';
    machine_id: number;
    message: string;
    timestamp: string;
}

interface MachineHealth {
    machine_id: number;
    machine_type: string;
    health_score: number;
    status: string;
    tool_wear: number;
    last_prediction?: number;
}

interface RecentPrediction {
    machine_id: number;
    machine_type: string;
    probability: number;
    timestamp: string;
    is_failure: boolean;
}

// ── Helpers (module level) ──────────────────────────────────────────
function getHealthColor(score: number) {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-red-400';
}

function getHealthBgColor(score: number) {
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 50) return 'bg-amber-500';
    return 'bg-red-500';
}

function getStatusIcon(status: string) {
    if (status === 'CRITICAL') return <AlertTriangle className="text-red-400" size={16} />;
    if (status === 'WARNING') return <AlertCircle className="text-amber-400" size={16} />;
    return <CheckCircle className="text-emerald-400" size={16} />;
}

function formatTime(timestamp: string) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
}

// ── Custom Hook ─────────────────────────────────────────────────────
interface EngineerState {
    alerts: Alert[];
    machines: MachineHealth[];
    recentPredictions: RecentPrediction[];
    trendData: any[];
    listenerStatus: { running: boolean; poll_interval?: number } | null;
    stats: { criticalAlerts: number; warningAlerts: number; todayPredictions: number; pendingMaintenance: number };
    loading: boolean;
    refreshing: boolean;
    handleRefresh: () => void;
}

type EngineerFlags = { loading: boolean; refreshing: boolean };
type EngineerData = {
    alerts: Alert[];
    machines: MachineHealth[];
    recentPredictions: RecentPrediction[];
    trendData: any[];
    listenerStatus: { running: boolean; poll_interval?: number } | null;
    stats: { criticalAlerts: number; warningAlerts: number; todayPredictions: number; pendingMaintenance: number };
};

const INITIAL_DATA: EngineerData = {
    alerts: [], machines: [], recentPredictions: [], trendData: [],
    listenerStatus: null,
    stats: { criticalAlerts: 0, warningAlerts: 0, todayPredictions: 0, pendingMaintenance: 0 },
};

function useEngineerData(userAddress?: string): EngineerState {
    const [state, setState] = useState<{ flags: EngineerFlags; data: EngineerData }>({
        flags: { loading: true, refreshing: false },
        data: INITIAL_DATA,
    });

    const setFlags = useCallback((action: React.SetStateAction<EngineerFlags>) => {
        setState(prev => ({ ...prev, flags: typeof action === 'function' ? action(prev.flags) : action }));
    }, []);

    const { flags, data } = state;

    const fetchData = useCallback(async () => {
        const result: Partial<EngineerData> = {};
        const stats = { criticalAlerts: 0, warningAlerts: 0, todayPredictions: 0, pendingMaintenance: 0 };
        let machinesList: any[] = [];

        try {
            const comparisonData = await api.getMachineComparison() as { comparison?: any[]; machines?: any[] };
            if (comparisonData.machines) {
                machinesList = comparisonData.machines;
            } else if (comparisonData.comparison) {
                machinesList = comparisonData.comparison;
            } else {
                machinesList = [];
            }
            if (machinesList.length > 0) {
                result.machines = machinesList.map((m: any) => ({
                    machine_id: m.machine_id,
                    machine_type: m.machine_type,
                    health_score: m.health_score,
                    status: m.status,
                    tool_wear: m.avg_tool_wear,
                    last_prediction: m.avg_failure_probability,
                }));
                stats.criticalAlerts = machinesList.filter((m: any) => m.status === 'CRITICAL').length;
                stats.warningAlerts = machinesList.filter((m: any) => m.status === 'WARNING').length;
            }

            const anomaliesData = await api.getAnomalies(24, 2.0) as { anomalies?: any[] };
            if (anomaliesData.anomalies) {
                result.alerts = anomaliesData.anomalies.slice(0, 5).map((a: any) => {
                    const tsMs = a.timestamp > 1e10 ? a.timestamp : a.timestamp * 1000;
                    return {
                        id: `alert-${a.machine_id}-${a.metric}-${a.timestamp}`,
                        type: a.severity === 'HIGH' ? 'critical' : 'warning',
                        machine_id: a.machine_id,
                        message: `${a.metric.replace('_', ' ')}: ${a.value.toFixed(1)} (${a.z_score}σ deviation)`,
                        timestamp: new Date(tsMs).toISOString(),
                    };
                });
            }

            try {
                const liveData = await api.getLiveSensorData(20) as { data?: any[] };
                let records: any[] = [];
                if (liveData) {
                    if (liveData.data) { records = liveData.data; }
                }
                const withPrediction = records
                    .filter((r: any) => r.prediction !== null && r.prediction !== undefined)
                    .slice(0, 5)
                    .map((r: any) => {
                        const mType = r.machine_type ||
                            machinesList.find((m: any) => m.machine_id === r.machine_id)?.machine_type || 'L';
                        const tsMs = r.timestamp > 1e10 ? r.timestamp : r.timestamp * 1000;
                        return {
                            machine_id: r.machine_id,
                            machine_type: mType,
                            probability: (r.prediction_probability ?? 0) * 100,
                            timestamp: new Date(tsMs).toISOString(),
                            is_failure: r.prediction === 1,
                        };
                    });
                if (withPrediction.length > 0) {
                    result.recentPredictions = withPrediction;
                    stats.todayPredictions = records.filter((r: any) => r.prediction === 1).length;
                }
            } catch { /* Live sensor data yoksa boş bırak */ }

            const maintenanceTasks = await api.getMaintenanceSchedule();
            if (maintenanceTasks) {
                if (maintenanceTasks.length > 0) {
                    stats.pendingMaintenance = maintenanceTasks.filter((t: any) => t.status === 'PENDING').length;
                }
            }

            const trendResult = await api.getPredictionTrend(1001, 7) as { trend?: any[] };
            if (trendResult.trend) result.trendData = trendResult.trend;

            try {
                result.listenerStatus = await api.getListenerStatus();
            } catch {
                result.listenerStatus = null;
            }

            result.stats = stats;
        } catch (error) {
            console.error('Failed to fetch engineer dashboard data:', error);
        }

        return result;
    }, []);

    const applyResult = useCallback((result: Partial<EngineerData>) => {
        setState(prev => ({
            ...prev,
            data: { ...prev.data, ...result },
            flags: { loading: false, refreshing: false },
        }));
    }, []);

    useEffect(() => {
        const load = () => fetchData().then(applyResult);
        load();
        const interval = setInterval(load, 30000);
        return () => clearInterval(interval);
    }, [fetchData, applyResult, userAddress]);

    const handleRefresh = () => { setFlags((prev: EngineerFlags) => ({ ...prev, refreshing: true })); fetchData().then(applyResult); };

    return {
        alerts: data.alerts,
        machines: data.machines,
        recentPredictions: data.recentPredictions,
        trendData: data.trendData,
        listenerStatus: data.listenerStatus,
        stats: data.stats,
        loading: flags.loading,
        refreshing: flags.refreshing,
        handleRefresh,
    };
}

// ── Stats Grid ──────────────────────────────────────────────────────
interface StatsGridProps {
    stats: EngineerState['stats'];
    listenerStatus: EngineerState['listenerStatus'];
}

function EngineerStatsGrid({ stats, listenerStatus }: StatsGridProps) {
    const cards = [
        { label: 'Critical Alerts', value: stats.criticalAlerts, valueClass: 'text-red-400', sub: 'Requires immediate action', accent: 'from-red-500', icon: <AlertTriangle size={18} className="text-red-400" />, iconBg: 'bg-red-500/15' },
        { label: 'Warnings', value: stats.warningAlerts, valueClass: 'text-amber-400', sub: 'Monitor closely', accent: 'from-amber-500', icon: <AlertCircle size={18} className="text-amber-400" />, iconBg: 'bg-amber-500/15' },
        { label: 'Predictions', value: stats.todayPredictions, valueClass: 'text-violet-400', sub: 'Failure alerts today', accent: 'from-violet-500', icon: <Brain size={18} className="text-violet-400" />, iconBg: 'bg-violet-500/15' },
        { label: 'Maintenance', value: stats.pendingMaintenance, valueClass: 'text-emerald-400', sub: 'Pending tasks', accent: 'from-emerald-500', icon: <Calendar size={18} className="text-emerald-400" />, iconBg: 'bg-emerald-500/15' },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {cards.map(({ label, value, valueClass, sub, accent, icon, iconBg }) => (
                <div key={label} className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
                    <div className={`absolute top-0 left-0 w-8 h-px bg-gradient-to-r ${accent} to-transparent`} />
                    <div className={`absolute top-0 left-0 h-8 w-px bg-gradient-to-b ${accent} to-transparent`} />
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{label}</span>
                        <div className={`p-2 ${iconBg} rounded-lg`}>{icon}</div>
                    </div>
                    <p className={`text-3xl font-bold ${valueClass}`}>{value}</p>
                    <p className="text-xs text-white/30 mt-1">{sub}</p>
                </div>
            ))}

            {/* Automation card */}
            <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
                <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Automation</span>
                    <div className={`p-2 rounded-lg ${listenerStatus?.running ? 'bg-[var(--accent-primary)]/15' : 'bg-white/[0.06]'}`}>
                        <Radio size={18} className={listenerStatus?.running ? 'text-[var(--accent-highlight)]' : 'text-white/30'} />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {listenerStatus?.running ? (
                        <>
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-highlight)] opacity-75" />
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--accent-highlight)]" />
                            </span>
                            <span className="text-xl font-bold text-[var(--accent-highlight)]">Active</span>
                        </>
                    ) : (
                        <span className="text-xl font-bold text-white/30">Offline</span>
                    )}
                </div>
                <p className="text-xs text-white/30 mt-1">
                    {listenerStatus?.running ? `Poll: ${listenerStatus.poll_interval}s` : 'Chainlink listener'}
                </p>
            </div>
        </div>
    );
}

// ── Machine Health Panel ────────────────────────────────────────────
interface MachineHealthPanelProps {
    machines: MachineHealth[];
    onNavigate: (path: string) => void;
}

function MachineHealthPanel({ machines, onNavigate }: MachineHealthPanelProps) {
    return (
        <div className="lg:col-span-2 relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
            <div className="absolute top-0 left-0 w-10 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
            <div className="absolute top-0 left-0 h-10 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Activity className="text-[var(--accent-highlight)]" size={20} /> Machine Health Overview
                </h2>
                <button onClick={() => onNavigate('/dashboard/machines')} className="text-sm text-[var(--accent-highlight)] hover:underline flex items-center gap-1">
                    View All <ChevronRight size={16} />
                </button>
            </div>
            <div className="space-y-4">
                {machines.map((machine) => (
                    <div
                        key={machine.machine_id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onNavigate(`/dashboard/machines/${machine.machine_id}`)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigate(`/dashboard/machines/${machine.machine_id}`); }}
                        className="p-4 bg-white/[0.03] rounded-xl hover:bg-white/[0.06] cursor-pointer transition-all group border border-white/[0.05] hover:border-white/[0.1]"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold ${machine.machine_type === 'L' ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-highlight)]' :
                                    machine.machine_type === 'M' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-violet-500/15 text-violet-400'
                                    }`}>
                                    {machine.machine_type}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="font-semibold text-white">Machine {machine.machine_type} (ID: {machine.machine_id})</p>
                                        {getStatusIcon(machine.status)}
                                    </div>
                                    <p className="text-sm text-white/40">Tool Wear: {machine.tool_wear?.toFixed(0) || 0} min</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-6">
                                <div className="text-right">
                                    <p className={`text-2xl font-bold ${getHealthColor(machine.health_score)}`}>
                                        {machine.health_score?.toFixed(0) || 0}%
                                    </p>
                                    <p className="text-xs text-white/30">Health Score</p>
                                </div>
                                <div className="w-32">
                                    <div className="h-3 bg-white/[0.06] rounded-full overflow-hidden">
                                        <div className={`h-full ${getHealthBgColor(machine.health_score)} transition-all duration-500`} style={{ width: `${machine.health_score || 0}%` }} />
                                    </div>
                                </div>
                                <ArrowRight size={20} className="text-white/20 group-hover:text-[var(--accent-highlight)] transition-colors" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Recent Predictions Panel ────────────────────────────────────────
function RecentPredictionsPanel({ predictions }: { predictions: RecentPrediction[] }) {
    return (
        <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
            <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-violet-500 to-transparent" />
            <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-violet-500 to-transparent" />
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <TrendingUp className="text-violet-400" size={20} /> Recent Failure Predictions
            </h2>
            {predictions.length > 0 ? (
                <div className="space-y-3">
                    {predictions.map((pred) => (
                        <div key={`pred-${pred.machine_id}-${pred.timestamp}`} className="flex items-center justify-between p-3 bg-white/[0.03] rounded-lg border border-white/[0.05]">
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${pred.machine_type === 'L' ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-highlight)]' :
                                    pred.machine_type === 'M' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-violet-500/15 text-violet-400'
                                    }`}>
                                    {pred.machine_type}
                                </div>
                                <div>
                                    <p className="font-medium text-white text-sm">Machine {pred.machine_type}-{pred.machine_id}</p>
                                    <p className="text-xs text-white/30">{formatTime(pred.timestamp)}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className={`font-bold ${pred.probability > 50 ? 'text-red-400' : 'text-amber-400'}`}>{pred.probability.toFixed(1)}%</p>
                                <p className="text-xs text-white/30">failure risk</p>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-8 text-white/30">
                    <Brain size={40} className="mx-auto mb-2 opacity-50" />
                    <p>No recent failure predictions</p>
                </div>
            )}
        </div>
    );
}

// ── Recent Alerts Panel ─────────────────────────────────────────────
interface RecentAlertsPanelProps {
    alerts: Alert[];
    onViewAll: () => void;
}

function RecentAlertsPanel({ alerts, onViewAll }: RecentAlertsPanelProps) {
    return (
        <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
            <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-orange-500 to-transparent" />
            <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-orange-500 to-transparent" />
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Bell className="text-orange-400" size={20} /> Recent Alerts
                </h2>
                <button onClick={onViewAll} className="text-sm text-[var(--accent-highlight)] hover:underline">View All</button>
            </div>
            {alerts.length > 0 ? (
                <div className="space-y-3">
                    {alerts.map((alert) => (
                        <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${alert.type === 'critical' ? 'bg-red-500/10 border-red-400' : 'bg-amber-500/10 border-amber-400'}`}>
                            {alert.type === 'critical'
                                ? <AlertTriangle size={18} className="text-red-400 mt-0.5" />
                                : <AlertCircle size={18} className="text-amber-400 mt-0.5" />
                            }
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white">Machine {alert.machine_id}</p>
                                <p className="text-xs text-white/40 truncate">{alert.message}</p>
                                <p className="text-xs text-white/30 mt-1">{formatTime(alert.timestamp)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-8 text-white/30">
                    <CheckCircle size={40} className="mx-auto mb-2 opacity-50" />
                    <p>No active alerts</p>
                    <p className="text-sm">All systems operating normally</p>
                </div>
            )}
        </div>
    );
}

// ── Page ────────────────────────────────────────────────────────────
export default function EngineerDashboard() {
    const router = useRouter();
    const { user } = useDashboard();
    const { alerts, machines, recentPredictions, trendData, listenerStatus, stats, loading, refreshing, handleRefresh } = useEngineerData(user?.address);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <RefreshCw className="animate-spin text-[var(--accent-primary)] mx-auto mb-4" size={40} />
                    <p className="text-white/30">Loading Command Center...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30">
                            <Wrench className="text-[var(--accent-highlight)]" size={24} />
                        </div>
                        Engineer Command Center
                    </h1>
                    <p className="text-white/40 mt-1 ml-12">Monitor, analyze, and maintain machine health</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push('/dashboard/engineer/model-training')}
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-primary)] text-white rounded-lg hover:shadow-lg hover:shadow-[var(--accent-primary)]/25 hover:opacity-90 transition-all"
                    >
                        <Brain size={18} /> Train Model
                    </button>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-4 py-2 bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08] rounded-lg transition-colors text-[var(--accent-highlight)]"
                    >
                        <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} /> Refresh
                    </button>
                </div>
            </div>

            <EngineerStatsGrid stats={stats} listenerStatus={listenerStatus} />

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <MachineHealthPanel machines={machines} onNavigate={router.push} />

                {/* Quick Actions */}
                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                    <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-amber-500 to-transparent" />
                    <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-amber-500 to-transparent" />
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-6">
                        <Zap className="text-amber-400" size={20} /> Quick Actions
                    </h2>
                    <div className="space-y-3">
                        {[
                            { path: '/dashboard/machines', icon: Brain, bg: 'bg-[var(--accent-primary)]', label: 'Run ML Analysis', desc: 'Analyze sensor data with LSTM-CNN' },
                            { path: '/dashboard/analytics', icon: Search, bg: 'bg-[var(--accent-primary)]/80', label: 'View Anomalies', desc: 'Check detected anomalies' },
                            { path: '/dashboard/maintenance', icon: Calendar, bg: 'bg-emerald-500/80', label: 'Maintenance Schedule', desc: 'View pending tasks' },
                        ].map(({ path, icon: Icon, bg, label, desc }) => (
                            <button key={path} onClick={() => router.push(path)}
                                className="w-full flex items-center gap-3 p-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-white/[0.14] rounded-xl transition-all group"
                            >
                                <div className={`p-2 ${bg} rounded-lg`}><Icon size={20} className="text-white" /></div>
                                <div className="text-left flex-1">
                                    <p className="font-medium text-white">{label}</p>
                                    <p className="text-xs text-white/40">{desc}</p>
                                </div>
                                <ChevronRight className="text-white/20 group-hover:text-[var(--accent-highlight)]" />
                            </button>
                        ))}
                        <button
                            onClick={async () => {
                                let data: any = null;
                                const userAddr = user?.address ? user.address : undefined;
                                try {
                                    data = await api.exportReport('csv', undefined, 7, userAddr);
                                } catch (error) {
                                    console.error('Export failed:', error);
                                    return;
                                }

                                if (data) {
                                    const blob = new Blob([data as string], { type: 'text/csv' });
                                    const url = window.URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `pdm_report_${new Date().toISOString().split('T')[0]}.csv`;
                                    a.click();
                                }
                            }}
                            className="w-full flex items-center gap-3 p-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-white/[0.14] rounded-xl transition-all group"
                        >
                            <div className="p-2 bg-[var(--accent-primary)]/70 rounded-lg"><Download size={20} className="text-white" /></div>
                            <div className="text-left flex-1">
                                <p className="font-medium text-white">Export Report</p>
                                <p className="text-xs text-white/40">Download CSV data</p>
                            </div>
                            <ChevronRight className="text-white/20 group-hover:text-[var(--accent-highlight)]" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <RecentPredictionsPanel predictions={recentPredictions} />
                <RecentAlertsPanel alerts={alerts} onViewAll={() => router.push('/dashboard/analytics')} />
            </div>

            {/* Trend Chart */}
            {trendData.length > 0 && (
                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                    <div className="absolute top-0 left-0 w-10 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                    <div className="absolute top-0 left-0 h-10 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <BarChart3 className="text-[var(--accent-highlight)]" size={20} /> Failure Probability Trend (Last 7 Days)
                        </h2>
                        <button onClick={() => router.push('/dashboard/analytics')} className="text-sm text-[var(--accent-highlight)] hover:underline flex items-center gap-1">
                            Full Analytics <ExternalLink size={14} />
                        </button>
                    </div>
                    <FailureTrendChart data={trendData} />
                </div>
            )}
        </div>
    );
}

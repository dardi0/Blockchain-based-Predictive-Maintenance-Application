'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '@/components/DashboardShell';
import { api } from '@/services/api';
import {
    Wrench, AlertTriangle, Activity, TrendingUp, Clock, ChevronRight,
    BarChart3, FileText, Search, Bell, CheckCircle, AlertCircle,
    Gauge, ThermometerSun, Timer, Zap, RefreshCw, ArrowRight,
    Brain, Calendar, Download, ExternalLink, Radio
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

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

export default function EngineerDashboard() {
    const router = useRouter();
    const { user } = useDashboard();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [machines, setMachines] = useState<MachineHealth[]>([]);
    const [recentPredictions, setRecentPredictions] = useState<RecentPrediction[]>([]);
    const [trendData, setTrendData] = useState<any[]>([]);
    const [listenerStatus, setListenerStatus] = useState<{ running: boolean; poll_interval?: number } | null>(null);
    const [stats, setStats] = useState({
        criticalAlerts: 0,
        warningAlerts: 0,
        todayPredictions: 0,
        pendingMaintenance: 0
    });

    const fetchData = async () => {
        try {
            const comparisonData = await api.getMachineComparison() as { comparison?: any[]; machines?: any[] };
            const machinesList = comparisonData.machines || comparisonData.comparison || [];
            if (machinesList.length > 0) {
                setMachines(machinesList.map((m: any) => ({
                    machine_id: m.machine_id,
                    machine_type: m.machine_type,
                    health_score: m.health_score,
                    status: m.status,
                    tool_wear: m.avg_tool_wear,
                    last_prediction: m.avg_failure_probability
                })));
                const critical = machinesList.filter((m: any) => m.status === 'CRITICAL').length;
                const warning = machinesList.filter((m: any) => m.status === 'WARNING').length;
                setStats(prev => ({ ...prev, criticalAlerts: critical, warningAlerts: warning }));
            }

            const anomaliesData = await api.getAnomalies(24, 2.0) as { anomalies?: any[] };
            if (anomaliesData.anomalies) {
                setAlerts(anomaliesData.anomalies.slice(0, 5).map((a: any) => ({
                    id: `${a.machine_id}-${a.timestamp}`,
                    type: a.severity === 'HIGH' ? 'critical' : 'warning',
                    machine_id: a.machine_id,
                    message: `${a.metric.replace('_', ' ')}: ${a.value.toFixed(1)} (${a.z_score}σ deviation)`,
                    timestamp: new Date(a.timestamp * 1000).toISOString()
                })));
            }

            if (user?.address) {
                const notifications = await api.getNotifications(user.address, 10);
                if (notifications && notifications.length > 0) {
                    const predictions = notifications
                        .filter((n: any) => n.type === 'FAILURE_PREDICTION')
                        .slice(0, 5)
                        .map((n: any) => ({
                            machine_id: n.machine_id,
                            machine_type: n.machine_id === 1001 ? 'L' : n.machine_id === 2001 ? 'M' : 'H',
                            probability: parseFloat(n.message?.match(/[\d.]+/)?.[0] || '0'),
                            timestamp: new Date(n.timestamp * 1000).toISOString(),
                            is_failure: true
                        }));
                    setRecentPredictions(predictions);
                    setStats(prev => ({ ...prev, todayPredictions: predictions.length }));
                }
            }

            const maintenanceTasks = await api.getMaintenanceSchedule();
            if (maintenanceTasks && maintenanceTasks.length > 0) {
                const pending = maintenanceTasks.filter((t: any) => t.status === 'PENDING').length;
                setStats(prev => ({ ...prev, pendingMaintenance: pending }));
            }

            const trendResult = await api.getPredictionTrend(1001, 7) as { trend?: any[] };
            if (trendResult.trend) {
                setTrendData(trendResult.trend);
            }

            try {
                const listenerData = await api.getListenerStatus();
                setListenerStatus(listenerData);
            } catch {
                setListenerStatus(null);
            }

        } catch (error) {
            console.error('Failed to fetch engineer dashboard data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [user]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    const getHealthColor = (score: number) => {
        if (score >= 80) return 'text-emerald-400';
        if (score >= 50) return 'text-amber-400';
        return 'text-red-400';
    };

    const getHealthBgColor = (score: number) => {
        if (score >= 80) return 'bg-emerald-500';
        if (score >= 50) return 'bg-amber-500';
        return 'bg-red-500';
    };

    const getStatusIcon = (status: string) => {
        if (status === 'CRITICAL') return <AlertTriangle className="text-red-400" size={16} />;
        if (status === 'WARNING') return <AlertCircle className="text-amber-400" size={16} />;
        return <CheckCircle className="text-emerald-400" size={16} />;
    };

    const formatTime = (timestamp: string) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return date.toLocaleDateString();
    };

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
                    <p className="text-white/40 mt-1 ml-12">
                        Monitor, analyze, and maintain machine health
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push('/dashboard/engineer/model-training')}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-highlight)] text-white rounded-lg hover:shadow-lg hover:shadow-[var(--accent-primary)]/25 transition-all"
                    >
                        <Brain size={18} />
                        Train Model
                    </button>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-4 py-2 bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08] rounded-lg transition-colors text-[var(--accent-highlight)]"
                    >
                        <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
                    <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-red-500 to-transparent" />
                    <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-red-500 to-transparent" />
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Critical Alerts</span>
                        <div className="p-2 bg-red-500/15 rounded-lg">
                            <AlertTriangle size={18} className="text-red-400" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-red-400">{stats.criticalAlerts}</p>
                    <p className="text-xs text-white/30 mt-1">Requires immediate action</p>
                </div>

                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
                    <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-amber-500 to-transparent" />
                    <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-amber-500 to-transparent" />
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Warnings</span>
                        <div className="p-2 bg-amber-500/15 rounded-lg">
                            <AlertCircle size={18} className="text-amber-400" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-amber-400">{stats.warningAlerts}</p>
                    <p className="text-xs text-white/30 mt-1">Monitor closely</p>
                </div>

                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
                    <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-violet-500 to-transparent" />
                    <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-violet-500 to-transparent" />
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Predictions</span>
                        <div className="p-2 bg-violet-500/15 rounded-lg">
                            <Brain size={18} className="text-violet-400" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-violet-400">{stats.todayPredictions}</p>
                    <p className="text-xs text-white/30 mt-1">Failure alerts today</p>
                </div>

                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
                    <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-emerald-500 to-transparent" />
                    <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-emerald-500 to-transparent" />
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Maintenance</span>
                        <div className="p-2 bg-emerald-500/15 rounded-lg">
                            <Calendar size={18} className="text-emerald-400" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-emerald-400">{stats.pendingMaintenance}</p>
                    <p className="text-xs text-white/30 mt-1">Pending tasks</p>
                </div>

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
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-highlight)] opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--accent-highlight)]"></span>
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

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Machine Health Overview */}
                <div className="lg:col-span-2 relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                    <div className="absolute top-0 left-0 w-10 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                    <div className="absolute top-0 left-0 h-10 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <Activity className="text-[var(--accent-highlight)]" size={20} />
                            Machine Health Overview
                        </h2>
                        <button
                            onClick={() => router.push('/dashboard/machines')}
                            className="text-sm text-[var(--accent-highlight)] hover:underline flex items-center gap-1"
                        >
                            View All <ChevronRight size={16} />
                        </button>
                    </div>

                    <div className="space-y-4">
                        {machines.map((machine) => (
                            <div
                                key={machine.machine_id}
                                onClick={() => router.push(`/dashboard/machines/${machine.machine_id}`)}
                                className="p-4 bg-white/[0.03] rounded-xl hover:bg-white/[0.06] cursor-pointer transition-all group border border-white/[0.05] hover:border-white/[0.1]"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold ${machine.machine_type === 'L' ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-highlight)]' :
                                            machine.machine_type === 'M' ? 'bg-emerald-500/15 text-emerald-400' :
                                                'bg-violet-500/15 text-violet-400'
                                            }`}>
                                            {machine.machine_type}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-semibold text-white">
                                                    Machine {machine.machine_type} (ID: {machine.machine_id})
                                                </p>
                                                {getStatusIcon(machine.status)}
                                            </div>
                                            <p className="text-sm text-white/40">
                                                Tool Wear: {machine.tool_wear?.toFixed(0) || 0} min
                                            </p>
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
                                                <div
                                                    className={`h-full ${getHealthBgColor(machine.health_score)} transition-all duration-500`}
                                                    style={{ width: `${machine.health_score || 0}%` }}
                                                />
                                            </div>
                                        </div>
                                        <ArrowRight size={20} className="text-white/20 group-hover:text-[var(--accent-highlight)] transition-colors" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                    <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-amber-500 to-transparent" />
                    <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-amber-500 to-transparent" />
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-6">
                        <Zap className="text-amber-400" size={20} />
                        Quick Actions
                    </h2>

                    <div className="space-y-3">
                        <button
                            onClick={() => router.push('/dashboard/machines')}
                            className="w-full flex items-center gap-3 p-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-white/[0.14] rounded-xl transition-all group"
                        >
                            <div className="p-2 bg-[var(--accent-primary)] rounded-lg">
                                <Brain size={20} className="text-white" />
                            </div>
                            <div className="text-left flex-1">
                                <p className="font-medium text-white">Run ML Analysis</p>
                                <p className="text-xs text-white/40">Analyze sensor data with LSTM-CNN</p>
                            </div>
                            <ChevronRight className="text-white/20 group-hover:text-[var(--accent-highlight)]" />
                        </button>

                        <button
                            onClick={() => router.push('/dashboard/analytics')}
                            className="w-full flex items-center gap-3 p-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-white/[0.14] rounded-xl transition-all group"
                        >
                            <div className="p-2 bg-[var(--accent-primary)]/80 rounded-lg">
                                <Search size={20} className="text-white" />
                            </div>
                            <div className="text-left flex-1">
                                <p className="font-medium text-white">View Anomalies</p>
                                <p className="text-xs text-white/40">Check detected anomalies</p>
                            </div>
                            <ChevronRight className="text-white/20 group-hover:text-[var(--accent-highlight)]" />
                        </button>

                        <button
                            onClick={() => router.push('/dashboard/maintenance')}
                            className="w-full flex items-center gap-3 p-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-white/[0.14] rounded-xl transition-all group"
                        >
                            <div className="p-2 bg-emerald-500/80 rounded-lg">
                                <Calendar size={20} className="text-white" />
                            </div>
                            <div className="text-left flex-1">
                                <p className="font-medium text-white">Maintenance Schedule</p>
                                <p className="text-xs text-white/40">View pending tasks</p>
                            </div>
                            <ChevronRight className="text-white/20 group-hover:text-[var(--accent-highlight)]" />
                        </button>

                        <button
                            onClick={async () => {
                                try {
                                    const data = await api.exportReport('csv', undefined, 7, user?.address);
                                    const blob = new Blob([data as string], { type: 'text/csv' });
                                    const url = window.URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `pdm_report_${new Date().toISOString().split('T')[0]}.csv`;
                                    a.click();
                                } catch (error) {
                                    console.error('Export failed:', error);
                                }
                            }}
                            className="w-full flex items-center gap-3 p-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-white/[0.14] rounded-xl transition-all group"
                        >
                            <div className="p-2 bg-[var(--accent-primary)]/70 rounded-lg">
                                <Download size={20} className="text-white" />
                            </div>
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
                {/* Recent Predictions */}
                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                    <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-violet-500 to-transparent" />
                    <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-violet-500 to-transparent" />
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <TrendingUp className="text-violet-400" size={20} />
                            Recent Failure Predictions
                        </h2>
                    </div>

                    {recentPredictions.length > 0 ? (
                        <div className="space-y-3">
                            {recentPredictions.map((pred, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between p-3 bg-white/[0.03] rounded-lg border border-white/[0.05]"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${pred.machine_type === 'L' ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-highlight)]' :
                                            pred.machine_type === 'M' ? 'bg-emerald-500/15 text-emerald-400' :
                                                'bg-violet-500/15 text-violet-400'
                                            }`}>
                                            {pred.machine_type}
                                        </div>
                                        <div>
                                            <p className="font-medium text-white text-sm">
                                                Machine {pred.machine_type}-{pred.machine_id}
                                            </p>
                                            <p className="text-xs text-white/30">{formatTime(pred.timestamp)}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-bold ${pred.probability > 50 ? 'text-red-400' : 'text-amber-400'}`}>
                                            {pred.probability.toFixed(1)}%
                                        </p>
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

                {/* Recent Alerts */}
                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                    <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-orange-500 to-transparent" />
                    <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-orange-500 to-transparent" />
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <Bell className="text-orange-400" size={20} />
                            Recent Alerts
                        </h2>
                        <button
                            onClick={() => router.push('/dashboard/analytics')}
                            className="text-sm text-[var(--accent-highlight)] hover:underline"
                        >
                            View All
                        </button>
                    </div>

                    {alerts.length > 0 ? (
                        <div className="space-y-3">
                            {alerts.map((alert) => (
                                <div
                                    key={alert.id}
                                    className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${alert.type === 'critical'
                                        ? 'bg-red-500/10 border-red-400'
                                        : 'bg-amber-500/10 border-amber-400'
                                        }`}
                                >
                                    {alert.type === 'critical' ? (
                                        <AlertTriangle size={18} className="text-red-400 mt-0.5" />
                                    ) : (
                                        <AlertCircle size={18} className="text-amber-400 mt-0.5" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-white">
                                            Machine {alert.machine_id}
                                        </p>
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
            </div>

            {/* Trend Chart */}
            {trendData.length > 0 && (
                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                    <div className="absolute top-0 left-0 w-10 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                    <div className="absolute top-0 left-0 h-10 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <BarChart3 className="text-[var(--accent-highlight)]" size={20} />
                            Failure Probability Trend (Last 7 Days)
                        </h2>
                        <button
                            onClick={() => router.push('/dashboard/analytics')}
                            className="text-sm text-[var(--accent-highlight)] hover:underline flex items-center gap-1"
                        >
                            Full Analytics <ExternalLink size={14} />
                        </button>
                    </div>

                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trendData}>
                                <defs>
                                    <linearGradient id="colorProb" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.35} />
                                        <stop offset="50%" stopColor="var(--accent-highlight)" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'rgba(10, 16, 32, 0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}
                                    labelStyle={{ color: 'rgba(255,255,255,0.4)' }}
                                    itemStyle={{ color: '#fff' }}
                                    formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, 'Avg Probability']}
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
                </div>
            )}
        </div>
    );
}

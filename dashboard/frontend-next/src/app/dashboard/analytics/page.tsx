'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { api } from '@/services/api';
import { useDashboard } from '@/components/DashboardShell';
import {
    Activity, AlertTriangle, TrendingUp, BarChart3, RefreshCw,
    Download, Wrench, Gauge, GitCompare, Map
} from 'lucide-react';
import {
    MaintenanceTimeline, DateRangePicker, AnomalyHeatmap
} from '@/components/dashboard/index';
import { FailureModeData, ToolWearMachine, MaintenanceEvent, AnomalyFrequencyItem } from '@/types';

import PredictionTrendChart from '@/components/dashboard/PredictionTrendChart';
import HealthScoreComparisonChart from '@/components/dashboard/HealthScoreComparisonChart';
import { FailureModeChart } from '@/components/dashboard/FailureModeChart';
import { ToolWearChart } from '@/components/dashboard/ToolWearChart';

// ── Types ──────────────────────────────────────────────────────────
interface TrendData { date: string; avg_probability: number; failure_count: number; total_predictions: number; }
interface Anomaly { machine_id: number; timestamp: string; metric: string; value: number; z_score: number; expected_range: string; severity: string; }
interface MachineComparison { machine_id: number; machine_type: string; total_records: number; failure_count: number; failure_rate: number; avg_failure_probability: number; avg_tool_wear: number; max_tool_wear: number; health_score: number; status: string; }

type TabId = 'trend' | 'anomalies' | 'comparison' | 'failure-modes' | 'tool-wear' | 'maintenance' | 'anomaly-map';
type Filters = { activeTab: TabId; selectedMachine: number; trendDays: number; toolWearDays: number; maintenanceDays: number; anomalyFreqDays: number; dateRange: { start: string; end: string } | null; };
type AnalyticsData = { trendData: TrendData[]; anomalies: Anomaly[]; comparison: MachineComparison[]; failureModes: FailureModeData[]; toolWearMachines: ToolWearMachine[]; toolWearThreshold: number; maintenanceEvents: MaintenanceEvent[]; anomalyFreqMachines: string[]; anomalyFreqMetrics: string[]; anomalyFreqData: AnomalyFrequencyItem[]; };

// ── Constants ──────────────────────────────────────────────────────
const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'trend', label: 'Prediction Trend', icon: TrendingUp },
    { id: 'anomalies', label: 'Anomaly Detection', icon: AlertTriangle },
    { id: 'comparison', label: 'Machine Comparison', icon: BarChart3 },
    { id: 'failure-modes', label: 'Failure Modes', icon: GitCompare },
    { id: 'tool-wear', label: 'Tool Wear Trend', icon: Gauge },
    { id: 'maintenance', label: 'Maintenance Timeline', icon: Wrench },
    { id: 'anomaly-map', label: 'Anomaly Frequency', icon: Map },
];

const getStatusColor = (status: string) => {
    switch (status) {
        case 'CRITICAL': return 'text-red-400 bg-red-500/15';
        case 'WARNING': return 'text-amber-400 bg-amber-500/15';
        default: return 'text-emerald-400 bg-emerald-500/15';
    }
};
const getSeverityBadge = (severity: string) =>
    severity === 'HIGH' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400';

// ── Custom hook ────────────────────────────────────────────────────
function useAnalyticsData() {
    const [state, setState] = useState<{ filters: Filters; data: AnalyticsData; loading: boolean }>({
        filters: {
            activeTab: 'trend',
            selectedMachine: 1001,
            trendDays: 7,
            toolWearDays: 14,
            maintenanceDays: 30,
            anomalyFreqDays: 30,
            dateRange: null,
        },
        data: {
            trendData: [], anomalies: [], comparison: [], failureModes: [],
            toolWearMachines: [], toolWearThreshold: 250, maintenanceEvents: [],
            anomalyFreqMachines: [], anomalyFreqMetrics: [], anomalyFreqData: [],
        },
        loading: true,
    });

    const setFilters = useCallback((action: React.SetStateAction<Filters>) => {
        setState(prev => ({ ...prev, filters: typeof action === 'function' ? action(prev.filters) : action }));
    }, []);

    const setData = useCallback((action: React.SetStateAction<AnalyticsData>) => {
        setState(prev => ({ ...prev, data: typeof action === 'function' ? action(prev.data) : action }));
    }, []);

    const setLoading = useCallback((loading: boolean) => {
        setState(prev => ({ ...prev, loading }));
    }, []);

    const { filters, data, loading } = state;

    const fetchTrend = useCallback(async () => {
        try {
            const res = await api.getPredictionTrend(filters.selectedMachine, filters.trendDays);
            let nextTrend = res.trend;
            if (!nextTrend) nextTrend = [];
            setData(prev => ({ ...prev, trendData: nextTrend as TrendData[] }));
        } catch (err) { console.error('Failed to fetch trend:', err); }
    }, [filters.selectedMachine, filters.trendDays]);

    const fetchAnomalies = useCallback(async () => {
        try {
            const res = await api.getAnomalies(24, 2.0);
            let nextAnoms = res.anomalies;
            if (!nextAnoms) nextAnoms = [];
            setData(prev => ({ ...prev, anomalies: nextAnoms as Anomaly[] }));
        } catch (err) { console.error('Failed to fetch anomalies:', err); }
    }, []);

    const fetchComparison = useCallback(async () => {
        try {
            const res = await api.getMachineComparison();
            let comp = (res as any).comparison;
            if (!comp) comp = (res as any).machines;
            if (!comp) comp = [];
            setData(prev => ({ ...prev, comparison: comp as MachineComparison[] }));
        } catch (err) { console.error('Failed to fetch comparison:', err); }
    }, []);

    const fetchFailureModes = useCallback(async () => {
        try {
            const res = await api.getFailureModes();
            let fm = res.failure_modes;
            if (!fm) fm = [];
            setData(prev => ({ ...prev, failureModes: fm as FailureModeData[] }));
        } catch (err) { console.error('Failed to fetch failure modes:', err); }
    }, []);

    const fetchToolWear = useCallback(async () => {
        try {
            const res = await api.getToolWearTrend(filters.toolWearDays);
            let m = res.machines;
            if (!m) m = [];
            let t = res.critical_threshold;
            if (!t) t = 250;
            setData(prev => ({ ...prev, toolWearMachines: m as ToolWearMachine[], toolWearThreshold: t }));
        } catch (err) { console.error('Failed to fetch tool wear:', err); }
    }, [filters.toolWearDays]);

    const fetchMaintenance = useCallback(async () => {
        try {
            const res = await api.getMaintenanceTimeline(filters.maintenanceDays);
            let ev = res.events;
            if (!ev) ev = [];
            setData(prev => ({ ...prev, maintenanceEvents: ev as MaintenanceEvent[] }));
        } catch (err) { console.error('Failed to fetch maintenance timeline:', err); }
    }, [filters.maintenanceDays]);

    const fetchAnomalyFreq = useCallback(async () => {
        try {
            const res = await api.getAnomalyFrequency(filters.anomalyFreqDays);
            let mac = res.machines;
            if (!mac) mac = [];
            let met = res.metrics;
            if (!met) met = [];
            let dat = res.data;
            if (!dat) dat = [];
            setData(prev => ({ ...prev, anomalyFreqMachines: mac, anomalyFreqMetrics: met, anomalyFreqData: dat as AnomalyFrequencyItem[] }));
        } catch (err) { console.error('Failed to fetch anomaly frequency:', err); }
    }, [filters.anomalyFreqDays]);

    useEffect(() => {
        const init = async () => {
            await Promise.all([fetchTrend(), fetchAnomalies(), fetchComparison(), fetchFailureModes(), fetchToolWear(), fetchMaintenance(), fetchAnomalyFreq()]);
            setLoading(false);
        };
        const t = setTimeout(() => { init(); }, 0);
        return () => clearTimeout(t);
    }, [fetchTrend, fetchAnomalies, fetchComparison, fetchFailureModes, fetchToolWear, fetchMaintenance, fetchAnomalyFreq]);

    useEffect(() => { const t = setTimeout(() => { fetchTrend(); }, 0); return () => clearTimeout(t); }, [fetchTrend]);
    useEffect(() => { const t = setTimeout(() => { fetchToolWear(); }, 0); return () => clearTimeout(t); }, [fetchToolWear]);
    useEffect(() => { const t = setTimeout(() => { fetchMaintenance(); }, 0); return () => clearTimeout(t); }, [fetchMaintenance]);
    useEffect(() => { const t = setTimeout(() => { fetchAnomalyFreq(); }, 0); return () => clearTimeout(t); }, [fetchAnomalyFreq]);

    return { filters, setFilters, data, loading, fetchTrend, fetchAnomalies, fetchFailureModes, fetchToolWear, fetchMaintenance, fetchAnomalyFreq };
}

// ── Tab components ─────────────────────────────────────────────────
const PredictionTrendTab: React.FC<{ filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>>; fetchTrend: () => void; data: AnalyticsData }> = ({ filters, setFilters, fetchTrend, data }) => (
    <div className="space-y-6">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <label htmlFor="trend-machine-select" className="text-sm font-medium text-white/40">Machine:</label>
                <select id="trend-machine-select" aria-label="Machine" value={filters.selectedMachine} onChange={(e) => setFilters(prev => ({ ...prev, selectedMachine: Number(e.target.value) }))} className="px-3 py-2 bg-white/[0.03] border border-white/[0.07] rounded-lg text-sm text-white">
                    <option value={1001} className="bg-[#0a1020]">L (ID: 1001)</option>
                    <option value={2001} className="bg-[#0a1020]">M (ID: 2001)</option>
                    <option value={3001} className="bg-[#0a1020]">H (ID: 3001)</option>
                </select>
            </div>
            <div className="flex items-center gap-2">
                <label htmlFor="trend-period-select" className="text-sm font-medium text-white/40">Period:</label>
                <select id="trend-period-select" aria-label="Period" value={filters.trendDays} onChange={(e) => setFilters(prev => ({ ...prev, trendDays: Number(e.target.value) }))} className="px-3 py-2 bg-white/[0.03] border border-white/[0.07] rounded-lg text-sm text-white">
                    <option value={7} className="bg-[#0a1020]">Last 7 days</option>
                    <option value={14} className="bg-[#0a1020]">Last 14 days</option>
                    <option value={30} className="bg-[#0a1020]">Last 30 days</option>
                </select>
            </div>
            <button onClick={fetchTrend} className="p-2 text-white/30 hover:text-[var(--accent-highlight)] hover:bg-white/[0.04] rounded-lg transition-colors">
                <RefreshCw size={18} />
            </button>
        </div>
        <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
            <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
            <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
            <h3 className="text-lg font-semibold text-white mb-4">Failure Probability Trend</h3>
            <PredictionTrendChart data={data.trendData} />
        </div>
        {data.trendData.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {data.trendData.slice(-3).reverse().map((day: any) => (
                    <div key={day.date} className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                        <div className="absolute top-0 left-0 w-6 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                        <div className="absolute top-0 left-0 h-6 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
                        <p className="text-sm text-white/40">{day.date}</p>
                        <p className="text-2xl font-bold text-white mt-1">{(day.avg_probability * 100).toFixed(1)}%</p>
                        <p className="text-xs text-white/30 mt-1">{day.failure_count} failures / {day.total_predictions} predictions</p>
                    </div>
                ))}
            </div>
        )}
    </div>
);

const AnomalyDetectionTab: React.FC<{ data: AnalyticsData }> = ({ data }) => (
    <div className="space-y-6">
        <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
            <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-orange-500 to-transparent" />
            <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-orange-500 to-transparent" />
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <AlertTriangle className="text-orange-400" /> Detected Anomalies (Last 24 Hours)
                </h3>
                <span className="px-3 py-1 bg-orange-500/15 text-orange-400 rounded-full text-sm font-medium">{data.anomalies.length} found</span>
            </div>
            {data.anomalies.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                    {data.anomalies.map((anomaly: any) => (
                        <div key={`anomaly-${anomaly.machine_id}-${anomaly.metric}-${anomaly.timestamp}`} className="flex items-center justify-between p-4 bg-white/[0.03] rounded-xl border border-white/[0.05]">
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${anomaly.machine_id === 1001 ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-highlight)]' : anomaly.machine_id === 2001 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-violet-500/15 text-violet-400'}`}>
                                    {anomaly.machine_id === 1001 ? 'L' : anomaly.machine_id === 2001 ? 'M' : 'H'}
                                </div>
                                <div>
                                    <p className="font-medium text-white">{anomaly.metric.replace('_', ' ').toUpperCase()}</p>
                                    <p className="text-sm text-white/40">Value: <span className="font-mono">{anomaly.value.toFixed(2)}</span><span className="mx-2">•</span>Expected: <span className="font-mono">{anomaly.expected_range}</span></p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-white/40">{anomaly.z_score}σ deviation</span>
                                <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityBadge(anomaly.severity)}`}>{anomaly.severity}</span>
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
);

const MachineComparisonTab: React.FC<{ data: AnalyticsData }> = ({ data }) => (
    <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {data.comparison.map((machine: any) => (
                <div key={machine.machine_id} className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                    <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                    <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
                    <div className="flex items-center justify-between mb-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold ${machine.machine_type === 'L' ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-highlight)]' : machine.machine_type === 'M' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-violet-500/15 text-violet-400'}`}>{machine.machine_type}</div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(machine.status)}`}>{machine.status}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-4">Machine {machine.machine_type} (ID: {machine.machine_id})</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between"><span className="text-white/40">Health Score</span><span className="font-bold text-white">{machine.health_score}%</span></div>
                        <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                            <div className={`h-full ${machine.health_score > 70 ? 'bg-emerald-500' : machine.health_score > 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${machine.health_score}%` }} />
                        </div>
                        <div className="pt-3 border-t border-white/[0.07] space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-white/40">Total Records</span><span className="text-white">{machine.total_records}</span></div>
                            <div className="flex justify-between"><span className="text-white/40">Failure Rate</span><span className="text-white">{machine.failure_rate}%</span></div>
                            <div className="flex justify-between"><span className="text-white/40">Avg Tool Wear</span><span className="text-white">{machine.avg_tool_wear} min</span></div>
                            <div className="flex justify-between"><span className="text-white/40">Max Tool Wear</span><span className={`font-medium ${machine.max_tool_wear > 200 ? 'text-red-400' : 'text-white'}`}>{machine.max_tool_wear} min</span></div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
        <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
            <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
            <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
            <h3 className="text-lg font-semibold text-white mb-4">Health Score Comparison</h3>
            <HealthScoreComparisonChart data={data.comparison} />
        </div>
    </div>
);

const FailureModesTab: React.FC<{ data: AnalyticsData; fetchFailureModes: () => void }> = ({ data, fetchFailureModes }) => (
    <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
        <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-amber-500 to-transparent" />
        <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-amber-500 to-transparent" />
        <div className="flex items-center justify-between mb-6">
            <div>
                <h3 className="text-lg font-semibold text-white">Failure Mode Breakdown</h3>
                <p className="text-sm text-white/40 mt-1">Distribution of failure types per machine (stacked)</p>
            </div>
            <button onClick={fetchFailureModes} className="p-2 text-white/30 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors"><RefreshCw size={16} /></button>
        </div>
        <FailureModeChart data={data.failureModes} />
        {data.failureModes.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-3">
                {data.failureModes.map(m => (
                    <div key={m.machine_id} className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] text-xs">
                        <p className="font-semibold text-white mb-1.5">Type {m.machine_type} — {m.total_failures} failures</p>
                        <div className="space-y-0.5 text-white/50">
                            <div className="flex justify-between"><span>Tool Wear (TWF)</span><span className="text-amber-400">{m.TWF}</span></div>
                            <div className="flex justify-between"><span>Heat (HDF)</span><span className="text-red-400">{m.HDF}</span></div>
                            <div className="flex justify-between"><span>Power (PWF)</span><span className="text-blue-400">{m.PWF}</span></div>
                            <div className="flex justify-between"><span>Overstrain (OSF)</span><span className="text-orange-400">{m.OSF}</span></div>
                            <div className="flex justify-between"><span>Random (RNF)</span><span className="text-gray-400">{m.RNF}</span></div>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
);

const ToolWearTab: React.FC<{ data: AnalyticsData; filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>>; fetchToolWear: () => void }> = ({ data, filters, setFilters, fetchToolWear }) => (
    <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
        <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-violet-500 to-transparent" />
        <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-violet-500 to-transparent" />
        <div className="flex items-center justify-between mb-4">
            <div>
                <h3 className="text-lg font-semibold text-white">Tool Wear Progression</h3>
                <p className="text-sm text-white/40 mt-1">Average daily tool wear per machine type</p>
            </div>
            <div className="flex items-center gap-3">
                <select aria-label="Tool Wear Period" value={filters.toolWearDays} onChange={(e) => setFilters(prev => ({ ...prev, toolWearDays: Number(e.target.value) }))} className="px-3 py-2 bg-white/[0.03] border border-white/[0.07] rounded-lg text-sm text-white">
                    <option value={7} className="bg-[#0a1020]">Last 7 days</option>
                    <option value={14} className="bg-[#0a1020]">Last 14 days</option>
                    <option value={30} className="bg-[#0a1020]">Last 30 days</option>
                </select>
                <button onClick={fetchToolWear} className="p-2 text-white/30 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors"><RefreshCw size={16} /></button>
            </div>
        </div>
        <ToolWearChart machines={data.toolWearMachines} criticalThreshold={data.toolWearThreshold} days={filters.toolWearDays} />
    </div>
);

const MaintenanceTab: React.FC<{ data: AnalyticsData; filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>>; fetchMaintenance: () => void }> = ({ data, filters, setFilters, fetchMaintenance }) => (
    <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
        <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-emerald-500 to-transparent" />
        <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-emerald-500 to-transparent" />
        <div className="flex items-center justify-between mb-6">
            <div>
                <h3 className="text-lg font-semibold text-white">Maintenance Timeline</h3>
                <p className="text-sm text-white/40 mt-1">{data.maintenanceEvents.length} events in the last {filters.maintenanceDays} days</p>
            </div>
            <div className="flex items-center gap-3">
                <select aria-label="Maintenance Period" value={filters.maintenanceDays} onChange={(e) => setFilters(prev => ({ ...prev, maintenanceDays: Number(e.target.value) }))} className="px-3 py-2 bg-white/[0.03] border border-white/[0.07] rounded-lg text-sm text-white">
                    <option value={30} className="bg-[#0a1020]">Last 30 days</option>
                    <option value={90} className="bg-[#0a1020]">Last 90 days</option>
                    <option value={180} className="bg-[#0a1020]">Last 180 days</option>
                </select>
                <button onClick={fetchMaintenance} className="p-2 text-white/30 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors"><RefreshCw size={16} /></button>
            </div>
        </div>
        <MaintenanceTimeline events={data.maintenanceEvents} />
    </div>
);

const AnomalyMapTab: React.FC<{ data: AnalyticsData; filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters>>; fetchAnomalyFreq: () => void }> = ({ data, filters, setFilters, fetchAnomalyFreq }) => (
    <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
        <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-orange-500 to-transparent" />
        <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-orange-500 to-transparent" />
        <div className="flex items-center justify-between mb-6">
            <div>
                <h3 className="text-lg font-semibold text-white">Anomaly Frequency Map</h3>
                <p className="text-sm text-white/40 mt-1">Machine × metric anomaly density (Z-score &gt; 2σ)</p>
            </div>
            <div className="flex items-center gap-3">
                <select aria-label="Anomaly Frequency Period" value={filters.anomalyFreqDays} onChange={(e) => setFilters(prev => ({ ...prev, anomalyFreqDays: Number(e.target.value) }))} className="px-3 py-2 bg-white/[0.03] border border-white/[0.07] rounded-lg text-sm text-white">
                    <option value={14} className="bg-[#0a1020]">Last 14 days</option>
                    <option value={30} className="bg-[#0a1020]">Last 30 days</option>
                    <option value={60} className="bg-[#0a1020]">Last 60 days</option>
                </select>
                <button onClick={fetchAnomalyFreq} className="p-2 text-white/30 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors"><RefreshCw size={16} /></button>
            </div>
        </div>
        <AnomalyHeatmap machines={data.anomalyFreqMachines} metrics={data.anomalyFreqMetrics} data={data.anomalyFreqData} />
    </div>
);

// ── Page component ─────────────────────────────────────────────────
export default function AnalyticsPage() {
    const { user } = useDashboard();
    const { filters, setFilters, data, loading, fetchTrend, fetchFailureModes, fetchToolWear, fetchMaintenance, fetchAnomalyFreq } = useAnalyticsData();

    const handleExport = async () => {
        let csv: any = null;
        const userAddr = user ? user.address : undefined;
        try {
            csv = await api.exportReport('csv', undefined, 7, userAddr);
        } catch (err) {
            console.error('Export failed:', err);
            return;
        }

        if (csv) {
            const blob = new Blob([csv as string], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pdm_analytics_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
        }
    };

    const handleExportPDF = async () => {
        let blob: Blob | null = null;
        let pdfUserAddr: string | undefined;
        if (user) { pdfUserAddr = user.address; }
        try {
            blob = await api.exportReportPDF(7, undefined, pdfUserAddr);
        } catch (err) {
            console.error('PDF export failed:', err);
            return;
        }

        if (blob) {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pdm_report_${new Date().toISOString().split('T')[0]}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30">
                            <BarChart3 className="text-[var(--accent-highlight)]" size={22} />
                        </div>
                        Analytics Dashboard
                    </h1>
                    <p className="text-white/40 mt-1">Prediction trends, anomaly detection, tool wear, and maintenance insights</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] text-white/60 hover:text-white rounded-xl transition-colors text-sm">
                        <Download size={16} /> CSV
                    </button>
                    <button onClick={handleExportPDF} className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/80 text-white rounded-xl transition-colors text-sm">
                        <Download size={16} /> PDF Report
                    </button>
                </div>
            </div>

            <div className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <DateRangePicker onChange={(start, end) => setFilters(prev => ({ ...prev, dateRange: { start, end } }))} />
            </div>

            <div className="flex flex-wrap gap-1.5 bg-white/[0.03] border border-white/[0.07] p-1 rounded-xl w-fit">
                {TABS.map((tab) => (
                    <button key={tab.id} onClick={() => setFilters(prev => ({ ...prev, activeTab: tab.id }))}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all text-xs ${filters.activeTab === tab.id ? 'bg-[var(--accent-primary)] text-white shadow-lg shadow-[var(--accent-primary)]/25' : 'text-white/40 hover:text-white/70'}`}>
                        <tab.icon size={15} />
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
                    {filters.activeTab === 'trend' && <PredictionTrendTab filters={filters} setFilters={setFilters} fetchTrend={fetchTrend} data={data} />}
                    {filters.activeTab === 'anomalies' && <AnomalyDetectionTab data={data} />}
                    {filters.activeTab === 'comparison' && <MachineComparisonTab data={data} />}
                    {filters.activeTab === 'failure-modes' && <FailureModesTab data={data} fetchFailureModes={fetchFailureModes} />}
                    {filters.activeTab === 'tool-wear' && <ToolWearTab data={data} filters={filters} setFilters={setFilters} fetchToolWear={fetchToolWear} />}
                    {filters.activeTab === 'maintenance' && <MaintenanceTab data={data} filters={filters} setFilters={setFilters} fetchMaintenance={fetchMaintenance} />}
                    {filters.activeTab === 'anomaly-map' && <AnomalyMapTab data={data} filters={filters} setFilters={setFilters} fetchAnomalyFreq={fetchAnomalyFreq} />}
                </>
            )}
        </div>
    );
}

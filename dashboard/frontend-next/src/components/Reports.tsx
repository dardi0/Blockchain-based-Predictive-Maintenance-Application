'use client';

import React, { useEffect, useState, memo } from 'react';
import { api } from '../services/api';
import { useDashboard } from './DashboardShell';
import { SavedReport, MachineStatus } from '../types';
import { FileText, Calendar, User, ChevronRight, X, Download, Activity, AlertTriangle, CheckCircle, Clock, Code, Plus, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

const COLORS = {
    operational: '#10b981',
    warning: '#f59e0b',
    critical: '#ef4444',
};

function Reports() {
    const { user, data } = useDashboard();
    const [reports, setReports] = useState<SavedReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedReport, setSelectedReport] = useState<SavedReport | null>(null);
    const [showRawJson, setShowRawJson] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showNotification = (message: string, type: 'success' | 'error') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };

    const handleGenerateReport = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const machines = data.machines;
            const title = `System Snapshot — ${new Date().toLocaleString()}`;
            const content = {
                generatedAt: new Date().toISOString(),
                summary: {
                    total: machines.length,
                    critical: machines.filter(m => m.status === MachineStatus.CRITICAL).length,
                    warning: machines.filter(m => m.status === MachineStatus.WARNING).length,
                    avgHealth: machines.length > 0
                        ? Math.round(machines.reduce((acc, m) => acc + m.healthScore, 0) / machines.length)
                        : 0,
                },
                machines,
            };
            await api.saveReport(title, content, user.address);
            showNotification('Report generated and saved successfully.', 'success');
            await fetchReports();
        } catch (error) {
            console.error('Failed to generate report', error);
            showNotification('Failed to generate report. Please try again.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const fetchReports = async () => {
        if (!user) return;
        try {
            const data = await api.getReportsHistory(user.address);
            setReports(Array.isArray(data) ? data : (data as any).reports || []);
        } catch (error) {
            console.error('Failed to fetch reports', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, [user]);

    const handleViewReport = async (report: SavedReport) => {
        if (!user) return;
        try {
            if (!report.content) {
                const fullReport = await api.getReportDetails(report.id, user.address);
                setSelectedReport(fullReport as SavedReport);
            } else {
                setSelectedReport(report);
            }
            setShowRawJson(false);
        } catch (error) {
            console.error('Failed to open report', error);
        }
    };

    const handleDownload = () => {
        if (!selectedReport) return;
        const blob = new Blob([JSON.stringify(selectedReport.content, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report-${selectedReport.id}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const getReportData = () => {
        if (!selectedReport?.content) return null;
        const content = selectedReport.content;

        const summary = content.summary || {};
        const machines = content.machines || [];

        const statusData = [
            { name: 'Operational', value: summary.total - summary.critical - summary.warning || 0, color: COLORS.operational },
            { name: 'Warning', value: summary.warning || 0, color: COLORS.warning },
            { name: 'Critical', value: summary.critical || 0, color: COLORS.critical },
        ].filter(d => d.value > 0);

        const barData = machines.slice(0, 10).map((m: any) => ({
            name: m.name || `Machine #${m.id}`,
            health: m.healthScore || 0
        }));

        return { summary, machines, statusData, barData, generatedAt: content.generatedAt };
    };

    if (loading) return <div className="p-8 text-center text-white/30">Loading history...</div>;

    const reportData = selectedReport ? getReportData() : null;

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Notification toast */}
            {notification && (
                <div className={`fixed top-20 right-4 z-50 max-w-sm w-full p-4 rounded-xl shadow-2xl shadow-black/40 border-l-4 animate-fade-in-up bg-[#0c1322]/95 backdrop-blur-xl border border-white/[0.08] ${notification.type === 'success' ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${notification.type === 'success' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                            {notification.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                        </div>
                        <p className="text-sm text-white/80">{notification.message}</p>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30">
                            <FileText size={20} className="text-[var(--accent-highlight)]" />
                        </div>
                        Report History
                    </h2>
                    <p className="text-white/40 mt-1 text-sm">Archive of system snapshots and generated reports.</p>
                </div>
                <button
                    onClick={handleGenerateReport}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-primary)]/20 hover:bg-[var(--accent-primary)]/30 border border-[var(--accent-primary)]/40 text-[var(--accent-highlight)] text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    {saving ? 'Generating...' : 'Generate Report'}
                </button>
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-white/[0.07] bg-white/[0.02]">
                        <tr>
                            <th className="px-6 py-4 text-[10px] font-bold text-white/30 uppercase tracking-widest">Title</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-white/30 uppercase tracking-widest">Created By</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-white/30 uppercase tracking-widest">Date</th>
                            <th className="px-6 py-4 text-[10px] font-bold text-white/30 uppercase tracking-widest text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                        {reports.length > 0 ? (
                            reports.map((report) => (
                                <tr key={report.id} className="hover:bg-white/[0.03] transition-colors">
                                    <td className="px-6 py-4 font-medium text-white">
                                        {report.title}
                                    </td>
                                    <td className="px-6 py-4 text-white/40 flex items-center gap-2">
                                        <User size={14} />
                                        {report.created_by || 'System'}
                                    </td>
                                    <td className="px-6 py-4 text-white/40">
                                        <div className="flex items-center gap-2 font-mono text-xs">
                                            <Calendar size={14} />
                                            {new Date(report.created_at).toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => handleViewReport(report)}
                                            className="inline-flex items-center gap-1 text-[var(--accent-highlight)] hover:underline"
                                        >
                                            View <ChevronRight size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-white/30">
                                    No reports archived yet.{' '}
                                    <button
                                        onClick={handleGenerateReport}
                                        disabled={saving}
                                        className="text-[var(--accent-highlight)] hover:underline disabled:opacity-50"
                                    >
                                        Generate your first report.
                                    </button>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal for Report Details */}
            {selectedReport && reportData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
                    <div className="relative w-full max-w-5xl max-h-[90vh] rounded-2xl border border-white/[0.08] bg-[#0c1322]/95 backdrop-blur-xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden animate-zoom-in">

                        {/* Header */}
                        <div className="p-6 border-b border-white/[0.07] flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-white">{selectedReport.title}</h3>
                                <p className="text-sm text-white/40 font-mono">
                                    {new Date(selectedReport.created_at).toLocaleString()} &bull; by {selectedReport.created_by}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowRawJson(!showRawJson)}
                                    className={`p-2 rounded-lg transition-all ${showRawJson ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-highlight)] border border-[var(--accent-primary)]/30' : 'text-white/30 hover:bg-white/[0.04] border border-white/[0.07]'}`}
                                    title="Toggle JSON View"
                                >
                                    <Code size={20} />
                                </button>
                                <button
                                    onClick={handleDownload}
                                    className="p-2 text-white/30 hover:text-[var(--accent-highlight)] hover:bg-white/[0.04] border border-white/[0.07] rounded-lg transition-all"
                                    title="Download JSON"
                                >
                                    <Download size={20} />
                                </button>
                                <button
                                    onClick={() => setSelectedReport(null)}
                                    className="p-2 text-white/30 hover:text-red-400 hover:bg-red-500/10 border border-white/[0.07] rounded-lg transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-auto p-6">
                            {showRawJson ? (
                                <pre className="text-xs font-mono text-white/60 whitespace-pre-wrap bg-white/[0.02] p-4 rounded-xl border border-white/[0.06]">
                                    {JSON.stringify(selectedReport.content, null, 2)}
                                </pre>
                            ) : (
                                <div className="space-y-6">
                                    {/* Summary Cards */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {[
                                            { label: 'Total Machines', value: reportData.summary.total || 0, icon: Activity, color: 'text-[var(--accent-highlight)]' },
                                            { label: 'Critical', value: reportData.summary.critical || 0, icon: AlertTriangle, color: 'text-red-400' },
                                            { label: 'Warning', value: reportData.summary.warning || 0, icon: Clock, color: 'text-amber-400' },
                                            { label: 'Avg Health', value: `${reportData.summary.avgHealth || 0}%`, icon: CheckCircle, color: 'text-emerald-400' },
                                        ].map((card) => (
                                            <div key={card.label} className="relative p-4 rounded-xl border border-white/[0.07] bg-white/[0.02]">
                                                <div className="absolute top-0 left-0 w-6 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                                                <div className="absolute top-0 left-0 h-6 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">{card.label}</span>
                                                    <card.icon size={16} className={card.color} />
                                                </div>
                                                <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Charts Row */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {reportData.statusData.length > 0 && (
                                            <div className="p-5 rounded-xl border border-white/[0.07] bg-white/[0.02]">
                                                <h4 className="text-[10px] font-bold text-white/30 mb-4 uppercase tracking-widest">Status Distribution</h4>
                                                <div className="h-48">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <PieChart>
                                                            <Pie
                                                                data={reportData.statusData}
                                                                cx="50%"
                                                                cy="50%"
                                                                innerRadius={40}
                                                                outerRadius={60}
                                                                paddingAngle={5}
                                                                dataKey="value"
                                                                stroke="none"
                                                            >
                                                                {reportData.statusData.map((entry: any, index: number) => (
                                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                                ))}
                                                            </Pie>
                                                            <Tooltip
                                                                contentStyle={{
                                                                    backgroundColor: 'rgba(10, 16, 32, 0.95)',
                                                                    border: '1px solid rgba(255,255,255,0.08)',
                                                                    borderRadius: '10px',
                                                                }}
                                                                itemStyle={{ color: '#fff', fontSize: '12px' }}
                                                            />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                </div>
                                                <div className="flex justify-center gap-4 mt-2">
                                                    {reportData.statusData.map((d: any) => (
                                                        <div key={d.name} className="flex items-center gap-1.5 text-xs">
                                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }}></span>
                                                            <span className="text-white/40">{d.name} ({d.value})</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {reportData.barData.length > 0 && (
                                            <div className="p-5 rounded-xl border border-white/[0.07] bg-white/[0.02]">
                                                <h4 className="text-[10px] font-bold text-white/30 mb-4 uppercase tracking-widest">Machine Health Scores</h4>
                                                <div className="h-48">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <BarChart data={reportData.barData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                                            <XAxis dataKey="name" stroke="rgba(255,255,255,0.2)" fontSize={9} tickLine={false} axisLine={false} />
                                                            <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.2)" fontSize={9} tickLine={false} axisLine={false} />
                                                            <Tooltip
                                                                contentStyle={{
                                                                    backgroundColor: 'rgba(10, 16, 32, 0.95)',
                                                                    border: '1px solid rgba(255,255,255,0.08)',
                                                                    borderRadius: '10px',
                                                                }}
                                                                itemStyle={{ color: '#fff' }}
                                                            />
                                                            <Bar dataKey="health" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Machine List */}
                                    {reportData.machines.length > 0 && (
                                        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                                            <div className="px-5 py-4 border-b border-white/[0.07]">
                                                <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Machine Details</h4>
                                            </div>
                                            <div className="divide-y divide-white/[0.04] max-h-60 overflow-y-auto">
                                                {reportData.machines.map((machine: any, index: number) => (
                                                    <div key={index} className="px-5 py-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors">
                                                        <div className="flex items-center gap-3">
                                                            <span className={`w-2 h-2 rounded-full ${machine.status === MachineStatus.CRITICAL ? 'bg-red-500' :
                                                                    machine.status === MachineStatus.WARNING ? 'bg-amber-500' : 'bg-emerald-500'
                                                                }`}></span>
                                                            <div>
                                                                <p className="text-sm font-medium text-white">{machine.name}</p>
                                                                <p className="text-xs text-white/30">Type: {machine.type}</p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className={`text-sm font-bold ${machine.healthScore >= 80 ? 'text-emerald-400' :
                                                                    machine.healthScore >= 50 ? 'text-amber-400' : 'text-red-400'
                                                                }`}>{machine.healthScore}%</p>
                                                            <p className="text-xs text-white/30">{machine.status}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {reportData.generatedAt && (
                                        <p className="text-xs text-white/20 text-center font-mono">
                                            Snapshot generated at: {new Date(reportData.generatedAt).toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default memo(Reports);

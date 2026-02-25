'use client';

import React, { useEffect, useState } from 'react';
import { Machine, MachineStatus } from '../types';
import { Zap, Save } from 'lucide-react';
import { useDashboard } from './DashboardShell';
import { api } from '../services/api';
import { useRouter } from 'next/navigation';

// Import modular components
import {
    AutomationIndicator,
    StatsCards,
    StatusPieChart,
    HealthGauges,
    HealthBarChart,
    AttentionPanel,
    ActivityFeed,
    CalculationInfoModal,
    NotificationToast,
    KPICards,
    RULCards,
} from './dashboard/index';
import { KPIData, RULEstimate } from '../types';

interface DashboardProps {
    machines: Machine[];
}

interface ActivityItem {
    id: string;
    type: string;
    message: string;
    timestamp: string;
    machine_id?: number;
}

const Dashboard: React.FC<DashboardProps> = ({ machines }) => {
    const { user } = useDashboard();
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [kpiData, setKpiData] = useState<KPIData | null>(null);
    const [rulEstimates, setRulEstimates] = useState<RULEstimate[]>([]);

    // Show notification helper
    const showNotification = (message: string, type: 'success' | 'error') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };

    // Fetch activity feed
    useEffect(() => {
        const fetchActivity = async () => {
            if (!user) return;
            try {
                const data = await api.getRecentActivity(user.address, 8);
                setActivities(Array.isArray(data) ? data : (data as any).activities || []);
            } catch (error) {
                console.error('Failed to fetch activity', error);
            }
        };
        fetchActivity();
        const interval = setInterval(fetchActivity, 30000);
        return () => clearInterval(interval);
    }, [user]);

    // Fetch KPI and RUL data
    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const [kpi, rul] = await Promise.all([
                    api.getKPIMetrics(),
                    api.getRULEstimates(),
                ]);
                setKpiData(kpi as KPIData);
                setRulEstimates(((rul as any).rul_estimates || []) as RULEstimate[]);
            } catch (err) {
                console.error('Failed to fetch KPI/RUL data:', err);
            }
        };
        fetchAnalytics();
    }, []);

    // Save report handler
    const handleSaveReport = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const title = `System Snapshot - ${new Date().toLocaleString()}`;
            const content = {
                generatedAt: new Date().toISOString(),
                summary: {
                    total: machines.length,
                    critical: machines.filter(m => m.status === MachineStatus.CRITICAL).length,
                    warning: machines.filter(m => m.status === MachineStatus.WARNING).length,
                    avgHealth: machines.length > 0
                        ? Math.round(machines.reduce((acc, curr) => acc + curr.healthScore, 0) / machines.length)
                        : 0
                },
                machines: machines
            };

            await api.saveReport(title, content, user.address);
            showNotification('Report saved to history successfully!', 'success');
        } catch (error) {
            console.error('Failed to save report', error);
            showNotification('Failed to save report. Please try again.', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Resource download handler
    const handleResourceDownload = (resourceName: string, fileName: string) => {
        if (window.confirm(`Do you want to download the ${resourceName} reference document?`)) {
            const content = `OFFICIAL REFERENCE DOCUMENT\n\nResource: ${resourceName}\nDate: ${new Date().toLocaleDateString()}\n\nThis document contains the standard guidelines and parameters used for the calculation logic in the Predictive Maintenance Dashboard.\n\nTYPE: ${resourceName === 'ISO 13381-1' ? 'International Standard' : 'Methodology'}\nCONTEXT: CNC Milling Operations`;
            const blob = new Blob([content], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showNotification(`${resourceName} downloaded successfully`, 'success');
        }
    };

    // Navigate to machine detail
    const handleMachineClick = (machineId: string) => {
        router.push(`/dashboard/machines/${machineId}`);
    };

    // === Stats Calculations ===
    const totalMachines = machines.length;
    const criticalMachines = machines.filter(a => a.status === MachineStatus.CRITICAL);
    const warningMachines = machines.filter(a => a.status === MachineStatus.WARNING);
    const operationalMachines = machines.filter(a => a.status === MachineStatus.OPERATIONAL);

    // Dual health scores
    const avgMLHealth = totalMachines > 0
        ? Math.round(machines.reduce((acc, curr) => acc + (curr.mlHealthScore || curr.healthScore), 0) / totalMachines)
        : 0;

    const avgEngHealth = totalMachines > 0
        ? Math.round(machines.reduce((acc, curr) => acc + (curr.engHealthScore || curr.healthScore), 0) / totalMachines)
        : 0;

    // Machines needing attention
    const attentionMachines = [...criticalMachines, ...warningMachines].slice(0, 5);

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30">
                                <Zap size={20} className="text-[var(--accent-highlight)]" />
                            </div>
                            Command Center
                        </h2>
                        <AutomationIndicator />
                    </div>
                    <p className="text-sm text-white/40">Real-time system monitoring and control</p>
                </div>
                <button
                    onClick={handleSaveReport}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 disabled:opacity-50 border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/10 text-[var(--accent-highlight)] hover:bg-[var(--accent-primary)]/20 hover:border-[var(--accent-primary)]/50"
                >
                    <Save size={16} />
                    {saving ? 'Saving...' : 'Save Report'}
                </button>
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - Stats + Charts */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Stats Cards */}
                    <StatsCards
                        total={totalMachines}
                        critical={criticalMachines.length}
                        warning={warningMachines.length}
                        healthy={operationalMachines.length}
                    />

                    {/* KPI Cards */}
                    {kpiData && <KPICards data={kpiData} />}

                    {/* Pie + Gauge Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <StatusPieChart
                            operational={operationalMachines.length}
                            warning={warningMachines.length}
                            critical={criticalMachines.length}
                        />
                        <HealthGauges
                            avgMLHealth={avgMLHealth}
                            avgEngHealth={avgEngHealth}
                            onInfoClick={() => setIsInfoModalOpen(true)}
                        />
                    </div>

                    {/* Bar Chart */}
                    <HealthBarChart
                        machines={machines}
                        onMachineClick={handleMachineClick}
                    />
                </div>

                {/* Right Column - Attention + Activity */}
                <div className="space-y-6">
                    <AttentionPanel
                        machines={attentionMachines}
                        onMachineClick={handleMachineClick}
                    />
                    <ActivityFeed activities={activities} />
                </div>
            </div>

            {/* RUL Cards */}
            {rulEstimates.length > 0 && (
                <div>
                    <h3 className="text-sm font-semibold text-white/50 uppercase tracking-widest mb-3">
                        Remaining Useful Life — Tool Wear Estimates
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <RULCards estimates={rulEstimates} />
                    </div>
                </div>
            )}

            {/* Notification Toast */}
            {notification && (
                <NotificationToast
                    message={notification.message}
                    type={notification.type}
                />
            )}

            {/* Calculation Info Modal */}
            <CalculationInfoModal
                isOpen={isInfoModalOpen}
                onClose={() => setIsInfoModalOpen(false)}
                onDownload={handleResourceDownload}
            />
        </div>
    );
};

export default Dashboard;

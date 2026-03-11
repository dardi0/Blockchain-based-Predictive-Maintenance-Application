'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Machine } from '../types';
import { Zap, Save } from 'lucide-react';
import { AutomationIndicator } from './dashboard/AutomationIndicator';
import { StatsCards } from './dashboard/StatsCards';
import { HealthGauges } from './dashboard/HealthGauges';
import { AttentionPanel } from './dashboard/AttentionPanel';
import { ActivityFeed } from './dashboard/ActivityFeed';
import { CalculationInfoModal } from './dashboard/CalculationInfoModal';
import { NotificationToast } from './dashboard/NotificationToast';
import { KPICards } from './dashboard/KPICards';
import { RULCards } from './dashboard/RULCards';
import { BatchStatusWidget } from './dashboard/BatchStatusWidget';
import { useDashboardLogic } from './hooks/useDashboardLogic';

// Lazy-load heavy chart components (recharts)
const StatusPieChart = dynamic(
    () => import('./dashboard/StatusPieChart').then(m => ({ default: m.StatusPieChart })),
    { ssr: false, loading: () => <div className="h-64 animate-pulse bg-white/[0.03] rounded-xl" /> }
);
const HealthBarChart = dynamic(
    () => import('./dashboard/HealthBarChart').then(m => ({ default: m.HealthBarChart })),
    { ssr: false, loading: () => <div className="h-64 animate-pulse bg-white/[0.03] rounded-xl" /> }
);

interface DashboardProps {
    machines: Machine[];
}

/* ─── Sub-components ─── */

function DashboardHeader({ saving, onSaveReport }: { saving: boolean; onSaveReport: () => void }) {
    return (
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
                onClick={onSaveReport}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 disabled:opacity-50 border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/10 text-[var(--accent-highlight)] hover:bg-[var(--accent-primary)]/20 hover:border-[var(--accent-primary)]/50"
            >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Report'}
            </button>
        </div>
    );
}

/* ─── Main Component ─── */

const Dashboard: React.FC<DashboardProps> = ({ machines }) => {
    const {
        saving, notification, activities, isInfoModalOpen, kpiData, rulEstimates,
        handleSaveReport, handleResourceDownload, handleMachineClick, setIsInfoModalOpen,
        totalMachines, criticalMachines, warningMachines, operationalMachines,
        avgMLHealth, avgEngHealth, attentionMachines,
    } = useDashboardLogic(machines);

    return (
        <div className="space-y-6 animate-fade-in-up">
            <DashboardHeader saving={saving} onSaveReport={handleSaveReport} />

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - Stats + Charts */}
                <div className="lg:col-span-2 space-y-6">
                    <StatsCards
                        total={totalMachines}
                        critical={criticalMachines.length}
                        warning={warningMachines.length}
                        healthy={operationalMachines.length}
                    />

                    {kpiData && <KPICards data={kpiData} />}

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

                    <HealthBarChart
                        machines={machines}
                        onMachineClick={handleMachineClick}
                    />
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                    <AttentionPanel machines={attentionMachines} onMachineClick={handleMachineClick} />
                    <BatchStatusWidget />
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

            {notification && (
                <NotificationToast message={notification.message} type={notification.type} />
            )}

            <CalculationInfoModal
                isOpen={isInfoModalOpen}
                onClose={() => setIsInfoModalOpen(false)}
                onDownload={handleResourceDownload}
            />
        </div>
    );
};

export default Dashboard;

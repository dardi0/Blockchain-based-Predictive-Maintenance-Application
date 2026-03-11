import { useState, useEffect, useCallback, useRef } from 'react';
import { Machine, MachineStatus, KPIData, RULEstimate } from '../../types';
import { useDashboard } from '../DashboardShell';
import { api } from '../../services/api';
import { useRouter } from 'next/navigation';

interface ActivityItem {
    id: string;
    type: string;
    message: string;
    timestamp: string;
    machine_id?: number;
}

interface DashboardState {
    saving: boolean;
    notification: { message: string; type: 'success' | 'error' } | null;
    activities: ActivityItem[];
    isInfoModalOpen: boolean;
    kpiData: KPIData | null;
    rulEstimates: RULEstimate[];
}

const INITIAL_STATE: DashboardState = {
    saving: false,
    notification: null,
    activities: [],
    isInfoModalOpen: false,
    kpiData: null,
    rulEstimates: [],
};

export function useDashboardLogic(machines: Machine[]) {
    const { user } = useDashboard();
    const router = useRouter();
    const [state, setState] = useState<DashboardState>(INITIAL_STATE);

    const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showNotification = useCallback((message: string, type: 'success' | 'error') => {
        if (notifTimerRef.current !== null) {
            clearTimeout(notifTimerRef.current);
        }
        setState(prev => ({ ...prev, notification: { message, type } }));
        notifTimerRef.current = setTimeout(() => {
            notifTimerRef.current = null;
            setState(prev => ({ ...prev, notification: null }));
        }, 3000);
    }, []);

    useEffect(() => {
        return () => {
            if (notifTimerRef.current !== null) {
                clearTimeout(notifTimerRef.current);
            }
        };
    }, []);

    // Fetch activity feed
    useEffect(() => {
        const fetchActivity = async () => {
            if (!user) return;
            try {
                const data = await api.getRecentActivity(user.address, 8);
                const activities = Array.isArray(data) ? data : (data as any).activities || [];
                setState(prev => ({ ...prev, activities }));
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
                setState(prev => ({
                    ...prev,
                    kpiData: kpi as KPIData,
                    rulEstimates: ((rul as any).rul_estimates || []) as RULEstimate[],
                }));
            } catch (err) {
                console.error('Failed to fetch KPI/RUL data:', err);
            }
        };
        fetchAnalytics();
    }, []);

    const handleSaveReport = useCallback(async () => {
        if (!user) return;
        setState(prev => ({ ...prev, saving: true }));
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
                machines,
            };
            await api.saveReport(title, content, user.address);
            showNotification('Report saved to history successfully!', 'success');
        } catch (error) {
            console.error('Failed to save report', error);
            showNotification('Failed to save report. Please try again.', 'error');
        } finally {
            setState(prev => ({ ...prev, saving: false }));
        }
    }, [user, machines, showNotification]);

    const handleResourceDownload = useCallback((resourceName: string, fileName: string) => {
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
    }, [showNotification]);

    const handleMachineClick = useCallback((machineId: string) => {
        router.push(`/dashboard/machines/${machineId}`);
    }, [router]);

    const setIsInfoModalOpen = useCallback((open: boolean) => {
        setState(prev => ({ ...prev, isInfoModalOpen: open }));
    }, []);

    // Stats calculations
    const totalMachines = machines.length;
    const criticalMachines = machines.filter(a => a.status === MachineStatus.CRITICAL);
    const warningMachines = machines.filter(a => a.status === MachineStatus.WARNING);
    const operationalMachines = machines.filter(a => a.status === MachineStatus.OPERATIONAL);

    const avgMLHealth = totalMachines > 0
        ? Math.round(machines.reduce((acc, curr) => acc + (curr.mlHealthScore || curr.healthScore), 0) / totalMachines)
        : 0;

    const avgEngHealth = totalMachines > 0
        ? Math.round(machines.reduce((acc, curr) => acc + (curr.engHealthScore || curr.healthScore), 0) / totalMachines)
        : 0;

    const attentionMachines = [...criticalMachines, ...warningMachines].slice(0, 5);

    return {
        ...state,
        showNotification,
        handleSaveReport,
        handleResourceDownload,
        handleMachineClick,
        setIsInfoModalOpen,
        totalMachines,
        criticalMachines,
        warningMachines,
        operationalMachines,
        avgMLHealth,
        avgEngHealth,
        attentionMachines,
    };
}

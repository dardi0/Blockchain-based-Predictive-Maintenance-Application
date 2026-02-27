import { useState, useEffect, useCallback } from 'react';
import { SavedReport, MachineStatus } from '../../types';
import { useDashboard } from '../DashboardShell';
import { api } from '../../services/api';

const COLORS = {
    operational: '#10b981',
    warning: '#f59e0b',
    critical: '#ef4444',
};

interface ReportsState {
    reports: SavedReport[];
    loading: boolean;
    saving: boolean;
    exportingPdf: boolean;
    selectedReport: SavedReport | null;
    showRawJson: boolean;
    notification: { message: string; type: 'success' | 'error' } | null;
    selectedForCompare: Set<number>;
    compareReports: [SavedReport, SavedReport] | null;
}

const INITIAL_STATE: ReportsState = {
    reports: [],
    loading: true,
    saving: false,
    exportingPdf: false,
    selectedReport: null,
    showRawJson: false,
    notification: null,
    selectedForCompare: new Set(),
    compareReports: null,
};

export function useReportsLogic() {
    const { user, data } = useDashboard();
    const [state, setState] = useState<ReportsState>(INITIAL_STATE);

    const showNotification = useCallback((message: string, type: 'success' | 'error') => {
        setState(prev => ({ ...prev, notification: { message, type } }));
        setTimeout(() => setState(prev => ({ ...prev, notification: null })), 3000);
    }, []);

    const fetchReports = useCallback(async () => {
        if (!user) return;
        try {
            const result = await api.getReportsHistory(user.address);
            const reports = Array.isArray(result) ? result : (result as any).reports || [];
            setState(prev => ({ ...prev, reports, loading: false }));
        } catch (error) {
            console.error('Failed to fetch reports', error);
            setState(prev => ({ ...prev, loading: false }));
        }
    }, [user]);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    const handleGenerateReport = useCallback(async () => {
        if (!user) return;
        setState(prev => ({ ...prev, saving: true }));
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
            setState(prev => ({ ...prev, saving: false }));
        }
    }, [user, data.machines, showNotification, fetchReports]);

    const handleViewReport = useCallback(async (report: SavedReport) => {
        if (!user) return;
        try {
            let fullReport: SavedReport;
            if (!report.content) {
                fullReport = await api.getReportDetails(report.id, user.address) as SavedReport;
            } else {
                fullReport = report;
            }
            setState(prev => ({ ...prev, selectedReport: fullReport, showRawJson: false }));
        } catch (error) {
            console.error('Failed to open report', error);
        }
    }, [user]);

    const handleDownload = useCallback(() => {
        if (!state.selectedReport) return;
        const blob = new Blob([JSON.stringify(state.selectedReport.content, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report-${state.selectedReport.id}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [state.selectedReport]);

    const handleExportPDF = useCallback(async () => {
        if (!user) return;
        setState(prev => ({ ...prev, exportingPdf: true }));
        try {
            const blob = await api.exportReportPDF(7, undefined, user.address);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pdm_report_${new Date().toISOString().split('T')[0]}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showNotification('PDF report downloaded successfully.', 'success');
        } catch (err) {
            console.error('PDF export failed:', err);
            showNotification('Failed to export PDF. Check if reportlab is installed on backend.', 'error');
        } finally {
            setState(prev => ({ ...prev, exportingPdf: false }));
        }
    }, [user, showNotification]);

    const toggleCompareSelection = useCallback((report: SavedReport) => {
        setState(prev => {
            const next = new Set(prev.selectedForCompare);
            if (next.has(report.id)) {
                next.delete(report.id);
            } else if (next.size < 2) {
                next.add(report.id);
            }
            return { ...prev, selectedForCompare: next };
        });
    }, []);

    const handleCompare = useCallback(() => {
        const ids = Array.from(state.selectedForCompare);
        if (ids.length !== 2) return;
        const rA = state.reports.find(r => r.id === ids[0]);
        const rB = state.reports.find(r => r.id === ids[1]);
        if (rA && rB) setState(prev => ({ ...prev, compareReports: [rA, rB] }));
    }, [state.selectedForCompare, state.reports]);

    const getReportData = useCallback(() => {
        if (!state.selectedReport?.content) return null;
        const content = state.selectedReport.content;
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
    }, [state.selectedReport]);

    const setSelectedReport = useCallback((report: SavedReport | null) => {
        setState(prev => ({ ...prev, selectedReport: report }));
    }, []);

    const setShowRawJson = useCallback((show: boolean) => {
        setState(prev => ({ ...prev, showRawJson: show }));
    }, []);

    const setCompareReports = useCallback((reports: [SavedReport, SavedReport] | null) => {
        setState(prev => ({ ...prev, compareReports: reports }));
    }, []);

    const setSelectedForCompare = useCallback((value: Set<number>) => {
        setState(prev => ({ ...prev, selectedForCompare: value }));
    }, []);

    return {
        ...state,
        handleGenerateReport,
        handleViewReport,
        handleDownload,
        handleExportPDF,
        toggleCompareSelection,
        handleCompare,
        getReportData,
        setSelectedReport,
        setShowRawJson,
        setCompareReports,
        setSelectedForCompare,
    };
}

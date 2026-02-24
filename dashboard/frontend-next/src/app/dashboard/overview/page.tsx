'use client';

import Dashboard from '@/components/Dashboard';
import { useDashboard } from '@/components/DashboardShell';

export default function OverviewPage() {
    const { data } = useDashboard();
    return <Dashboard machines={data.machines} />;
}

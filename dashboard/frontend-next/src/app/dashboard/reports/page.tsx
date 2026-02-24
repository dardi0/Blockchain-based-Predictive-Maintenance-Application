'use client';

import Reports from '@/components/Reports';
import { useDashboard } from '@/components/DashboardShell';

export default function ReportsPage() {
    const { data } = useDashboard();
    return <Reports />;
}

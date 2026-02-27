'use client';

import dynamic from 'next/dynamic';
import { useDashboard } from '@/components/DashboardShell';

const Reports = dynamic(() => import('@/components/Reports'), {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse bg-white/[0.03] rounded-xl" />,
});

export default function ReportsPage() {
    const { data } = useDashboard();
    return <Reports />;
}

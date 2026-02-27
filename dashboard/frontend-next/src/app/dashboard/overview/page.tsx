'use client';

import dynamic from 'next/dynamic';
import { useDashboard } from '@/components/DashboardShell';

const Dashboard = dynamic(() => import('@/components/Dashboard'), {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse bg-white/[0.03] rounded-xl" />,
});

export default function OverviewPage() {
    const { data } = useDashboard();
    return <Dashboard machines={data.machines} />;
}

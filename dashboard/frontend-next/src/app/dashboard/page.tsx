'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '@/components/DashboardShell';
import { UserRole } from '@/types';

export default function DashboardPage() {
    const { user } = useDashboard();
    const router = useRouter();

    useEffect(() => {
        if (!user) return;

        if (user.role === UserRole.OPERATOR) {
            router.replace('/dashboard/sensor-entry');
        } else {
            // Manager, Engineer, Owner -> Command Center
            router.replace('/dashboard/engineer');
        }
    }, [user, router]);

    return (
        <div className="flex items-center justify-center h-full text-slate-400">
            Redirecting...
        </div>
    );
}

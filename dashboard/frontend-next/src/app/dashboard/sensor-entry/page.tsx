'use client';

import SensorInput from '@/components/SensorInput';
import { useDashboard } from '@/components/DashboardShell';

export default function SensorEntryPage() {
    const { data, user, refreshData } = useDashboard();

    const handleSave = async () => {
        await refreshData();
    };

    if (!user) return null;

    return (
        <SensorInput
            machines={data.machines}
            onSave={handleSave}
            walletAddress={user.address}
        />
    );
}

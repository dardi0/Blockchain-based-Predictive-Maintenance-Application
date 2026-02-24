'use client';

import MachineManager from '@/components/MachineManager';
import { useDashboard } from '@/components/DashboardShell';

export default function MachinesPage() {
    const { data } = useDashboard();
    return <MachineManager machines={data.machines} />;
}

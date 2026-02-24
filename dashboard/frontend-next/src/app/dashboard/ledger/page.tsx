'use client';

import BlockchainLedger from '@/components/BlockchainLedger';
import { useDashboard } from '@/components/DashboardShell';

export default function LedgerPage() {
    const { data } = useDashboard();
    return <BlockchainLedger records={data.records} />;
}

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { MachineStatus } from '@/types';
import { useDashboard } from '@/components/DashboardShell';
import SensorDataPanel from '@/components/machine/SensorDataPanel';
import MLAnalysisPanel from '@/components/machine/MLAnalysisPanel';
import MeasurementHeader from '@/components/machine/MeasurementHeader';
import ErrorModal from '@/components/ui/ErrorModal';
import LoadingState from '@/components/ui/LoadingState';
import { useMeasurementLogic } from '@/components/hooks/useMeasurementLogic';

export default function MeasurementDetailsPage() {
    const router = useRouter();
    const { user } = useDashboard();
    const {
        state,
        canAnalyze,
        handleVerify,
        handleAnalyze,
        dispatch
    } = useMeasurementLogic(user);

    const { measurement, predictionResult, analyzing, error, verifying } = state;

    if (!measurement) return <LoadingState />;

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            {error && <ErrorModal message={error} onClose={() => dispatch({ error: null })} />}

            <MeasurementHeader
                machineName={measurement.machine?.name || 'Unknown Machine'}
                timestamp={measurement.timestamp}
                machineStatus={measurement.machine?.status || MachineStatus.OPERATIONAL}
                onBack={() => router.push('/dashboard/machines')}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SensorDataPanel
                    measurement={measurement}
                    verifying={verifying}
                    onVerify={handleVerify}
                />
                <MLAnalysisPanel
                    predictionResult={predictionResult}
                    measurement={measurement}
                    analyzing={analyzing}
                    canAnalyze={canAnalyze}
                    onAnalyze={handleAnalyze}
                />
            </div>
        </div>
    );
}

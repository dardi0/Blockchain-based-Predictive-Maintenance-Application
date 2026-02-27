'use client';

import React, { useState, useMemo, memo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Machine, MachineStatus, SensorData } from '../types';
import { MachineTypeFilter } from './machine/MachineTypeFilter';
import { MeasurementList } from './machine/MeasurementList';
import { MeasurementDetailModal } from './machine/MeasurementDetailModal';

interface MachineManagerProps {
    machines: Machine[];
}

interface MeasurementWithMachine extends SensorData {
    machine: Machine;
}

const MachineManager: React.FC<MachineManagerProps> = ({ machines }) => {
    const router = useRouter();
    const [selectedMachineType, setSelectedMachineType] = useState<string | null>(null);
    const [selectedMeasurement, setSelectedMeasurement] = useState<MeasurementWithMachine | null>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    React.useEffect(() => {
        const savedPage = sessionStorage.getItem('machineManagerCurrentPage');
        const savedFilter = sessionStorage.getItem('machineManagerFilter');
        if (savedPage) {
            setCurrentPage(parseInt(savedPage, 10));
        }
        if (savedFilter) {
            setSelectedMachineType(savedFilter === 'null' ? null : savedFilter);
        }
    }, []);

    React.useEffect(() => {
        sessionStorage.setItem('machineManagerCurrentPage', currentPage.toString());
    }, [currentPage]);

    React.useEffect(() => {
        sessionStorage.setItem('machineManagerFilter', selectedMachineType || 'null');
    }, [selectedMachineType]);

    const allMeasurements = useMemo(() => {
        const measurements: MeasurementWithMachine[] = [];
        machines.forEach(machine => {
            if (machine.sensorData) {
                machine.sensorData.forEach(readings => {
                    measurements.push({
                        ...readings,
                        machine
                    });
                });
            }
        });
        return measurements.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [machines]);

    const filteredMeasurements = useMemo(() => {
        if (selectedMachineType) {
            return allMeasurements.filter(m => m.machine.type === selectedMachineType);
        }
        return allMeasurements;
    }, [allMeasurements, selectedMachineType]);

    const totalPages = Math.ceil(filteredMeasurements.length / itemsPerPage);

    const displayedMeasurements = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return filteredMeasurements.slice(startIndex, endIndex);
    }, [filteredMeasurements, currentPage, itemsPerPage]);

    const handleMachineTypeClick = (type: string) => {
        setSelectedMachineType(prev => prev === type ? null : type);
        setCurrentPage(1);
    };

    const handleMeasurementClick = (measurement: MeasurementWithMachine) => {
        sessionStorage.setItem('selectedMeasurement', JSON.stringify(measurement));
        router.push('/dashboard/machines/measurement-details');
    };

    // Also support modal view if needed, but the original code did both?
    // Wait, original code had:
    // onClick={() => handleMeasurementClick(measurement)} -> router.push
    // BUT also had {selectedMeasurement && (... modal ...)}
    // And handleCloseModal sets selectedMeasurement to null.
    // However, I don't see where setSelectedMeasurement is called in the original code!
    // Analysis of original code:
    // Line 79: handleMeasurementClick uses router.push.
    // Line 85: handleCloseModal sets selectedMeasurement(null).
    // Line 162: onClick calls handleMeasurementClick.
    // Line 285: Renders modal if selectedMeasurement is truthy.

    // It seems the original code had a Modal definintion but strictly used router.push for navigation based on the onClick handler.
    // The state `selectedMeasurement` was never set to a value in the original code's `handleMeasurementClick`.
    // Let me double check if I missed something in `view_file` output.
    // Ah, I see: `onClick={() => handleMeasurementClick(measurement)}`
    // And `handleMeasurementClick` only does `router.push`.
    // So the Modal code in the original file was likely DEAD CODE or incomplete feature.
    // However, for a refactor, I should preserve the capabilities. 
    // If I look at `handleMeasurementClick` in original:
    /*
    const handleMeasurementClick = (measurement: MeasurementWithMachine) => {
        sessionStorage.setItem('selectedMeasurement', JSON.stringify(measurement));
        router.push('/dashboard/machines/measurement-details');
    };
    */
    // It seems the modal was indeed unused. 
    // BUT, the user might want it.
    // I entered `Refactoring Phase` not `Feature Removal`. 
    // I will keep the modal component available but maybe commented out or unused if the logic connects it.
    // Wait, looking at lines 285+ in original, there is a big block for Modal.
    // If I want to fix/enable it, I could change `handleMeasurementClick` to set state instead of route.
    // But the user didn't ask to change behavior, just refactor.
    // So I will implement `handleMeasurementClick` exactly as before (router push).
    // BUT, I will also provide the Modal component and logic, incase they want to use it later.
    // Actually, I should probably stick to the current behavior.

    // However, `MeasurementDetailModal` depends on `selectedMeasurement`.
    // Since `selectedMeasurement` is never set, the modal never shows.
    // I will keep the logic as is for now: `selectedMeasurement` is separate.

    // One more thing: The original code imported `Machine`, `MachineStatus`, `SensorData` from `../types`.
    // I need to make sure `MeasurementWithMachine` is compatible.

    return (
        <div className="space-y-6 relative animate-fade-in-up">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">Sensor Readings Details</h2>
            </div>

            {/* Machine Type Filter */}
            <MachineTypeFilter
                machines={machines}
                selectedType={selectedMachineType}
                onSelectType={handleMachineTypeClick}
            />

            {/* Measurement List */}
            <div className="mt-8">
                <MeasurementList
                    measurements={displayedMeasurements}
                    onMeasurementClick={handleMeasurementClick}
                    currentType={selectedMachineType}
                    onClearFilter={() => setSelectedMachineType(null)}
                    onViewMachine={(id) => router.push(`/dashboard/machines/${id}`)}
                    totalCount={filteredMeasurements.length}
                    globalStartIndex={(currentPage - 1) * itemsPerPage}
                />

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="mt-6 flex items-center justify-between px-4">
                        <div className="text-sm text-white/40">
                            Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredMeasurements.length)} of {filteredMeasurements.length}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="px-4 py-2 text-sm font-medium rounded-lg border border-white/[0.07] bg-white/[0.02] text-white/60 hover:bg-white/[0.06] hover:border-white/[0.14] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                Previous
                            </button>
                            <div className="flex items-center gap-1">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                    <button
                                        key={page}
                                        onClick={() => setCurrentPage(page)}
                                        className={`w-10 h-10 text-sm font-medium rounded-lg transition-all ${page === currentPage
                                            ? 'bg-[var(--accent-primary)] text-white shadow-lg shadow-[var(--accent-primary)]/25'
                                            : 'border border-white/[0.07] bg-white/[0.02] text-white/60 hover:bg-white/[0.06] hover:border-white/[0.14]'
                                            }`}
                                    >
                                        {page}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="px-4 py-2 text-sm font-medium rounded-lg border border-white/[0.07] bg-white/[0.02] text-white/60 hover:bg-white/[0.06] hover:border-white/[0.14] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Measurement Detail Modal (Currently unused but preserved) */}
            <MeasurementDetailModal
                measurement={selectedMeasurement}
                onClose={() => setSelectedMeasurement(null)}
                onViewMachine={(id) => router.push(`/dashboard/machines/${id}`)}
            />
        </div>
    );
};

export default memo(MachineManager);

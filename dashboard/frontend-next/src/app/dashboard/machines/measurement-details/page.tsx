'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Machine, MachineStatus, SensorData, UserRole } from '@/types';
import { api } from '@/services/api';
import { blockchainService } from '@/services/blockchain';
import { useDashboard } from '@/components/DashboardShell';
import {
    ArrowLeft, Activity, ThermometerSun, Gauge, Timer, Wrench,
    AlertTriangle, CheckCircle, AlertCircle, RefreshCw, Brain,
    Zap, Lock
} from 'lucide-react';

interface MeasurementWithMachine extends SensorData {
    machine: Machine;
}

interface PredictionResult {
    prediction: number;
    is_failure: boolean;
    prediction_probability: number;
    prediction_reason: string;
    rule_based_analysis: {
        has_definite_failure: boolean;
        failure_risks: string[] | string;
    };
}

export default function MeasurementDetailsPage() {
    const router = useRouter();
    const { user } = useDashboard();
    const [measurement, setMeasurement] = useState<MeasurementWithMachine | null>(null);
    const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Role-based permissions - Only Engineer can analyze
    const canAnalyze = user?.role === UserRole.ENGINEER;
    const canViewResults = [UserRole.ENGINEER, UserRole.MANAGER, UserRole.OWNER].includes(user?.role as UserRole);

    useEffect(() => {
        const stored = sessionStorage.getItem('selectedMeasurement');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                setMeasurement(parsed);

                // If measurement already has prediction data (and it's not null), load it
                if (parsed.prediction !== undefined && parsed.prediction !== null &&
                    parsed.prediction_probability !== undefined && parsed.prediction_probability !== null) {
                    setPredictionResult({
                        prediction: parsed.prediction,
                        is_failure: parsed.prediction === 1,
                        prediction_probability: parsed.prediction_probability,
                        prediction_reason: parsed.prediction === 1 ? 'ML Model predicted failure' : 'ML Model predicted normal operation',
                        rule_based_analysis: {
                            has_definite_failure: parsed.prediction === 1,
                            failure_risks: []
                        }
                    });
                }
            } catch {
                router.push('/dashboard/machines');
            }
        } else {
            router.push('/dashboard/machines');
        }
    }, [router]);

    const [verifying, setVerifying] = useState(false);

    // Fetch fresh data to ensure blockchain status is up-to-date
    useEffect(() => {
        const fetchFreshData = async () => {
            if (!measurement || !measurement.machine?.id) return;
            try {
                // Fetch latest history for this machine
                const sensorHistory = await api.getSensorHistory(Number(measurement.machine.id));
                if (sensorHistory && sensorHistory.length > 0) {
                    const recordId = measurement.id || measurement.recordId;
                    const freshRecord = sensorHistory.find((r: any) => r.id === recordId);

                    if (freshRecord) {
                        setMeasurement(prev => prev ? ({
                            ...prev,
                            blockchain_tx_hash: freshRecord.blockchain_tx_hash,
                            blockchain_success: freshRecord.blockchain_success,
                            proof_id: freshRecord.proof_id,
                            prediction: freshRecord.prediction,
                            prediction_probability: freshRecord.prediction_probability,
                            prediction_tx_hash: freshRecord.prediction_tx_hash,
                        }) : null);

                        // Also update prediction result view if available
                        if (freshRecord.prediction !== undefined && freshRecord.prediction !== null) {
                            setPredictionResult({
                                prediction: freshRecord.prediction,
                                is_failure: freshRecord.prediction === 1,
                                prediction_probability: freshRecord.prediction_probability ?? 0,
                                prediction_reason: freshRecord.prediction === 1 ? 'ML Model predicted failure' : 'ML Model predicted normal operation',
                                rule_based_analysis: {
                                    has_definite_failure: freshRecord.prediction === 1,
                                    failure_risks: []
                                }
                            });
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to refresh verification status", e);
            }
        };

        if (measurement) {
            fetchFreshData();
        }
    }, [measurement?.id, measurement?.recordId, measurement?.machine?.id, verifying]); // Added verifying dependency

    const handleVerify = async () => {
        if (!measurement) return;
        setVerifying(true);
        setError(null);
        try {
            const ethereum = (window as any).ethereum;
            if (!ethereum) throw new Error("MetaMask is not installed!");
            const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
            const account = accounts[0];

            // Verify MetaMask account matches logged-in user
            const sessionUser = JSON.parse(sessionStorage.getItem('pdmSessionUser') || '{}');
            if (sessionUser.address && account.toLowerCase() !== sessionUser.address.toLowerCase()) {
                throw new Error(
                    'MetaMask aktif hesabi oturumdaki cuzdaninizla eslesmiyor. ' +
                    'Lutfen MetaMask\'ta ' + sessionUser.address.slice(0, 10) + '... adresine gecin ' +
                    'veya cikis yapip dogru cuzdanla giris yapin.'
                );
            }

            const recordId = measurement.id || measurement.recordId;
            if (!recordId) throw new Error("Record ID missing");

            // 1. Prepare Proof for EXISTING record
            const payload = {
                id: recordId,
                air_temp_k: measurement.airTemperature,
                process_temp_k: measurement.processTemperature,
                rotational_speed_rpm: measurement.rotationalSpeed,
                torque_nm: measurement.torque,
                tool_wear_min: measurement.toolWear,
                machine_type: measurement.machine.type
            };

            // Pass recordId to ensure we verify THIS record, not a new one
            const proofRes = await api.prepareBlockchainProof(measurement.machine.id, payload as any, account, recordId);

            // 2. Submit to Blockchain
            const txResult = await blockchainService.submitSensorDataProof(
                process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "",
                (proofRes as any).proof_args || proofRes.tx_data
            );

            if (!txResult.success) throw new Error(txResult.error || "Submission failed");

            // 3. Confirm in Backend
            await api.confirmBlockchainTx(recordId, txResult.txHash!, account, txResult.proofId);

            // Success! Refresh data happens via effect dependency
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Verification failed");
        } finally {
            setVerifying(false);
        }
    };

    const handleAnalyze = async () => {
        if (!measurement || !canAnalyze) return;

        setAnalyzing(true);
        setError(null);

        try {
            // 1. Prepare data payload
            const payload = {
                id: measurement.id || measurement.recordId, // For updating existing record
                air_temp_k: measurement.airTemperature,
                process_temp_k: measurement.processTemperature,
                rotational_speed_rpm: measurement.rotationalSpeed,
                torque_nm: measurement.torque,
                tool_wear_min: measurement.toolWear,
                machine_type: measurement.machine.type
            };

            // 2. Request Engineer Signature for Login/Auth (Optional check)
            const ethereum = (window as any).ethereum;
            if (!ethereum) {
                throw new Error("MetaMask is not installed!");
            }

            const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
            const account = accounts[0];

            // Verify MetaMask account matches logged-in user
            const sessionUser2 = JSON.parse(sessionStorage.getItem('pdmSessionUser') || '{}');
            if (sessionUser2.address && account.toLowerCase() !== sessionUser2.address.toLowerCase()) {
                throw new Error(
                    'MetaMask aktif hesabi oturumdaki cuzdaninizla eslesmiyor. ' +
                    'Lutfen MetaMask\'ta ' + sessionUser2.address.slice(0, 10) + '... adresine gecin ' +
                    'veya cikis yapip dogru cuzdanla giris yapin.'
                );
            }

            /*
               We first do the off-chain prediction to get the result.
               Then we submit this result to the blockchain.
            */

            // 3. API Prediction (Off-chain analysis)
            // Just use simple auth signature here if needed, or skip if session is enough.
            // For now, let's assume we proceed without re-signing for the API call itself, 
            // or we use a simple signature.
            const message = `Authorize Failure Analysis\nMachine Type: ${measurement.machine.type}\nTimestamp: ${new Date().getTime()}`;
            const signature = await ethereum.request({
                method: 'personal_sign',
                params: [message, account],
            });

            // Send to API with Signature
            const result = await api.predict(payload, signature, message);

            // 4. Submit to Blockchain (Pay Gas)
            const recordId = measurement.id || measurement.recordId;
            if (!recordId) throw new Error("Measurement ID is missing");

            // a. Prepare Proof Args from Backend
            const proofArgs = await api.preparePredictionProof(recordId, account);

            // b. Submit to Smart Contract
            const txResult = await blockchainService.submitPredictionProof(
                process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0xYourContractAddress",
                (proofArgs as any).proof_args || proofArgs.tx_data
            );

            if (!txResult.success) {
                throw new Error(txResult.error || "Blockchain submission failed");
            }

            // c. Confirm Transaction in Backend
            await api.confirmBlockchainTx(
                recordId!,
                txResult.txHash!,
                account,
                txResult.proofId || null,
                true // isPrediction
            );

            console.log("Prediction stored on blockchain:", txResult.txHash);

            // Convert API result to PredictionResult type
            const predResult = {
                prediction: result.prediction,
                is_failure: result.prediction === 1,
                prediction_probability: (result as any).prediction_probability ?? (result as any).probability ?? 0,
                prediction_reason: result.prediction === 1 ? 'ML Model predicted failure' : 'ML Model predicted normal operation',
                rule_based_analysis: {
                    has_definite_failure: result.prediction === 1,
                    failure_risks: (result as any).failure_risks || []
                }
            };
            setPredictionResult(predResult);

            // Update sessionStorage with prediction result
            const updatedMeasurement = {
                ...measurement,
                prediction: result.prediction,
                prediction_probability: predResult.prediction_probability
            };
            sessionStorage.setItem('selectedMeasurement', JSON.stringify(updatedMeasurement));

        } catch (err: any) {
            console.error(err);
            if (err.code === 4001) {
                setError('User rejected the signature request.');
            } else {
                setError(err.message || 'Analysis failed');
            }
        } finally {
            setAnalyzing(false);
        }
    };

    const getRiskColor = (probability: number) => {
        if (probability < 0.3) return 'text-green-500';
        if (probability < 0.5) return 'text-yellow-500';
        if (probability < 0.7) return 'text-orange-500';
        return 'text-red-500';
    };

    const getRiskBgColor = (probability: number) => {
        if (probability < 0.3) return 'bg-green-500';
        if (probability < 0.5) return 'bg-yellow-500';
        if (probability < 0.7) return 'bg-orange-500';
        return 'bg-red-500';
    };

    const getRiskLevel = (probability: number) => {
        if (probability < 0.3) return { level: 'LOW', color: 'text-green-500 bg-green-50 dark:bg-green-900/20', icon: CheckCircle };
        if (probability < 0.5) return { level: 'MEDIUM', color: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20', icon: AlertCircle };
        if (probability < 0.7) return { level: 'HIGH', color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20', icon: AlertTriangle };
        return { level: 'CRITICAL', color: 'text-red-500 bg-red-50 dark:bg-red-900/20', icon: AlertTriangle };
    };

    const ErrorModal = ({ message, onClose }: { message: string, onClose: () => void }) => (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-[var(--dark-bg)] rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200 border border-slate-200 dark:border-slate-700">
                <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-400">
                        <AlertTriangle size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Analysis Failed</h3>
                    <p className="text-slate-600 dark:text-slate-400 mb-6">
                        {message.replace(/^\d+:\s*/, '')}
                    </p>
                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors shadow-lg shadow-red-500/30"
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </div>
    );

    if (!measurement) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="animate-spin text-[var(--accent-primary)]" size={32} />
            </div>
        );
    }

    const riskInfo = predictionResult ? getRiskLevel(predictionResult.prediction_probability) : null;

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            {error && <ErrorModal message={error} onClose={() => setError(null)} />}

            {/* Header */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => router.push('/dashboard/machines')}
                    className="p-2 rounded-lg bg-slate-100 dark:bg-[var(--dark-bg)] hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                    <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Measurement Analysis</h1>
                    <p className="text-slate-500 dark:text-slate-400">
                        {measurement.machine.name} • {new Date(measurement.timestamp).toLocaleString()}
                    </p>
                </div>
                <div className={`
                    px-4 py-2 rounded-full text-sm font-semibold
                    ${measurement.machine.status === MachineStatus.CRITICAL ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        measurement.machine.status === MachineStatus.WARNING ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                            'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}
                `}>
                    {measurement.machine.status}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Sensor Data */}
                <div className="bg-white dark:bg-[var(--dark-bg)] rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                            <Activity size={20} className="text-[var(--accent-primary)]" />
                            Sensor Readings
                        </h2>
                        <div className="flex items-center gap-2">
                            {measurement.blockchain_tx_hash ? (
                                <a
                                    href={`https://sepolia.explorer.zksync.io/tx/${measurement.blockchain_tx_hash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold rounded-full border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                                    title="View Sensor Data on Explorer"
                                >
                                    <Lock size={12} />
                                    <span>Sensor Verified</span>
                                </a>
                            ) : (
                                <button
                                    onClick={handleVerify}
                                    disabled={verifying}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-[var(--accent-highlight)]/10 dark:bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] dark:text-[var(--accent-highlight)] text-xs font-semibold rounded-full border border-blue-200 dark:border-blue-800 hover:bg-[var(--accent-highlight)]/20 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50"
                                >
                                    {verifying ? <RefreshCw size={12} className="animate-spin" /> : <Lock size={12} />}
                                    <span>{verifying ? 'Verifying...' : 'Verify Data'}</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 rounded-xl border border-blue-200 dark:border-blue-800">
                            <div className="flex items-center gap-2 text-[var(--accent-primary)] dark:text-[var(--accent-highlight)] mb-2">
                                <ThermometerSun size={18} />
                                <span className="text-sm font-medium">Air Temperature</span>
                            </div>
                            <p className="text-2xl font-bold text-slate-800 dark:text-white">
                                {measurement.airTemperature} <span className="text-sm font-normal text-slate-500">K</span>
                            </p>
                        </div>

                        <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-900/20 dark:to-orange-800/10 rounded-xl border border-orange-200 dark:border-orange-800">
                            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 mb-2">
                                <ThermometerSun size={18} />
                                <span className="text-sm font-medium">Process Temperature</span>
                            </div>
                            <p className="text-2xl font-bold text-slate-800 dark:text-white">
                                {measurement.processTemperature} <span className="text-sm font-normal text-slate-500">K</span>
                            </p>
                        </div>

                        <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-800/10 rounded-xl border border-purple-200 dark:border-purple-800">
                            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-2">
                                <Gauge size={18} />
                                <span className="text-sm font-medium">Rotational Speed</span>
                            </div>
                            <p className="text-2xl font-bold text-slate-800 dark:text-white">
                                {measurement.rotationalSpeed} <span className="text-sm font-normal text-slate-500">rpm</span>
                            </p>
                        </div>

                        <div className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 rounded-xl border border-emerald-200 dark:border-emerald-800">
                            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-2">
                                <Zap size={18} />
                                <span className="text-sm font-medium">Torque</span>
                            </div>
                            <p className="text-2xl font-bold text-slate-800 dark:text-white">
                                {measurement.torque} <span className="text-sm font-normal text-slate-500">Nm</span>
                            </p>
                        </div>

                        <div className="col-span-2 p-4 bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-900/20 dark:to-amber-800/10 rounded-xl border border-amber-200 dark:border-amber-800">
                            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
                                <Timer size={18} />
                                <span className="text-sm font-medium">Tool Wear</span>
                            </div>
                            <div className="flex items-end justify-between">
                                <p className="text-2xl font-bold text-slate-800 dark:text-white">
                                    {measurement.toolWear} <span className="text-sm font-normal text-slate-500">min</span>
                                </p>
                                <div className="text-right">
                                    <div className="h-2 w-32 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${measurement.toolWear > 200 ? 'bg-red-500' : measurement.toolWear > 150 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                            style={{ width: `${Math.min(100, (measurement.toolWear / 240) * 100)}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">Limit: 240 min</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Derived Values */}
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">Derived Values</h3>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                            <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                                <p className="text-slate-500 dark:text-slate-400">Temp Diff (ΔT)</p>
                                <p className="font-semibold text-slate-800 dark:text-white">
                                    {(measurement.processTemperature - measurement.airTemperature).toFixed(1)} K
                                </p>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                                <p className="text-slate-500 dark:text-slate-400">Power</p>
                                <p className="font-semibold text-slate-800 dark:text-white">
                                    {((2 * Math.PI * measurement.rotationalSpeed * measurement.torque) / 60000).toFixed(2)} kW
                                </p>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                                <p className="text-slate-500 dark:text-slate-400">Strain Factor</p>
                                <p className="font-semibold text-slate-800 dark:text-white">
                                    {(measurement.toolWear * measurement.torque).toFixed(0)}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: ML Analysis */}
                <div className="bg-white dark:bg-[var(--dark-bg)] rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                        <Brain size={20} className="text-purple-500" />
                        LSTM-CNN Failure Analysis
                    </h2>

                    {!predictionResult ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="w-20 h-20 rounded-full bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center mb-4">
                                <Brain size={40} className="text-purple-400" />
                            </div>

                            {canAnalyze && !predictionResult ? (
                                <>
                                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Run ML Analysis</h3>
                                    <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
                                        Use the LSTM-CNN deep learning model to predict potential machine failures based on sensor data.
                                    </p>

                                    {measurement.prediction_tx_hash ? (
                                        <div className="flex flex-col items-center">
                                            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl mb-4 text-center">
                                                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold mb-1 justify-center">
                                                    <Lock size={18} />
                                                    <span>Blockchain Verified</span>
                                                </div>
                                                <p className="text-xs text-slate-500 mb-2">Analysis recorded on zkSync</p>
                                                <a
                                                    href={`https://sepolia.explorer.zksync.io/tx/${measurement.prediction_tx_hash}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-[var(--accent-primary)] hover:underline break-all"
                                                >
                                                    {measurement.prediction_tx_hash.substring(0, 16)}...
                                                </a>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleAnalyze}
                                            disabled={analyzing}
                                            className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-purple-500/25 disabled:opacity-50"
                                        >
                                            {analyzing ? (
                                                <>
                                                    <RefreshCw size={20} className="animate-spin" />
                                                    Analyzing...
                                                </>
                                            ) : (
                                                <>
                                                    <Activity size={20} />
                                                    Analyze with LSTM-CNN
                                                </>
                                            )}
                                        </button>
                                    )}
                                </>
                            ) : predictionResult ? (
                                <div className="text-center">
                                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Analysis Complete</h3>
                                    <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                                        This measurement has already been analyzed. See the results below.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Analysis Not Available</h3>
                                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-4">
                                        <Lock size={18} />
                                        <span className="text-sm font-medium">Engineer Access Required</span>
                                    </div>
                                    <p className="text-slate-500 dark:text-slate-400 max-w-sm">
                                        This measurement has not been analyzed yet. Only Engineers can run failure predictions.
                                        Please contact an Engineer to analyze this data.
                                    </p>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Analysis performed by Engineer notice */}
                            {!canAnalyze && (
                                <div className="p-3 bg-[var(--accent-highlight)]/10 dark:bg-[var(--accent-primary)]/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2 text-[var(--accent-primary)] dark:text-[var(--accent-highlight)] text-sm">
                                    <CheckCircle size={18} />
                                    <span>Analysis performed by Engineer</span>
                                </div>
                            )}

                            {/* Main Result Card */}
                            <div className={`p-5 rounded-xl border-2 ${predictionResult.is_failure
                                ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800'
                                : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-800'}`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-14 h-14 rounded-full flex items-center justify-center ${predictionResult.is_failure
                                        ? 'bg-red-100 dark:bg-red-900/40'
                                        : 'bg-green-100 dark:bg-green-900/40'}`}
                                    >
                                        {predictionResult.is_failure
                                            ? <AlertTriangle size={28} className="text-red-600 dark:text-red-400" />
                                            : <CheckCircle size={28} className="text-green-600 dark:text-green-400" />
                                        }
                                    </div>
                                    <div>
                                        <h3 className={`text-xl font-bold ${predictionResult.is_failure
                                            ? 'text-red-700 dark:text-red-400'
                                            : 'text-green-700 dark:text-green-400'}`}
                                        >
                                            {predictionResult.is_failure ? 'FAILURE DETECTED' : 'NORMAL OPERATION'}
                                        </h3>
                                        <p className="text-sm text-slate-600 dark:text-slate-400">{predictionResult.prediction_reason}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Probability Meter */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Failure Probability</span>
                                    <span className={`text-2xl font-bold ${getRiskColor(predictionResult.prediction_probability)}`}>
                                        {(predictionResult.prediction_probability * 100).toFixed(1)}%
                                    </span>
                                </div>
                                <div className="h-4 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full ${getRiskBgColor(predictionResult.prediction_probability)} transition-all duration-700 ease-out`}
                                        style={{ width: `${predictionResult.prediction_probability * 100}%` }}
                                    />
                                </div>
                                <div className="flex justify-between mt-2 text-xs text-slate-500">
                                    <span>0% - Safe</span>
                                    <span>100% - Critical</span>
                                </div>
                            </div>

                            {/* Risk Level Badge */}
                            {riskInfo && (
                                <div className={`flex items-center gap-3 p-4 rounded-xl ${riskInfo.color}`}>
                                    <riskInfo.icon size={24} />
                                    <div>
                                        <p className="text-sm font-medium">Risk Level</p>
                                        <p className="text-lg font-bold">{riskInfo.level}</p>
                                    </div>
                                </div>
                            )}

                            {/* Detected Issues */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                                    <Wrench size={16} />
                                    Detected Issues
                                </h4>
                                {Array.isArray(predictionResult.rule_based_analysis.failure_risks) &&
                                    predictionResult.rule_based_analysis.failure_risks.length > 0 ? (
                                    <ul className="space-y-2">
                                        {predictionResult.rule_based_analysis.failure_risks.map((risk, idx) => (
                                            <li key={idx} className="flex items-start gap-2 text-sm">
                                                <AlertCircle size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
                                                <span className="text-slate-600 dark:text-slate-400">{risk}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                                        <CheckCircle size={16} />
                                        No critical issues detected in rule-based analysis
                                    </p>
                                )}
                            </div>

                            {/* Re-analyze Button - Only for Engineers */}
                            {canAnalyze && (
                                <button
                                    onClick={handleAnalyze}
                                    disabled={analyzing}
                                    className="w-full flex items-center justify-center gap-2 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors disabled:opacity-50"
                                >
                                    <RefreshCw size={18} className={analyzing ? 'animate-spin' : ''} />
                                    Re-analyze
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

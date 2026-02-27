'use client';

import React, { useEffect } from 'react';
import { api } from '@/services/api';
import { blockchainService } from '@/services/blockchain';
import { MachineStatus, UserRole, User } from '@/types';
import { MeasurementWithMachine } from '@/components/machine/SensorDataPanel';
import { PredictionResult } from '@/components/machine/MLAnalysisPanel';

export interface MeasurementState {
    measurement: MeasurementWithMachine | null;
    predictionResult: PredictionResult | null;
    analyzing: boolean;
    error: string | null;
    verifying: boolean;
}

export function useMeasurementLogic(user: User | null) {
    const [state, dispatch] = React.useReducer((prev: MeasurementState, next: any) => {
        if (typeof next === 'function') return { ...prev, ...next(prev) };
        return { ...prev, ...next };
    }, {
        measurement: null,
        predictionResult: null,
        analyzing: false,
        error: null,
        verifying: false
    });

    const { measurement, verifying } = state;
    const canAnalyze = user?.role === UserRole.ENGINEER;

    // Load initial measurement from session storage
    useEffect(() => {
        const stored = sessionStorage.getItem('selectedMeasurement');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                dispatch({ measurement: parsed });
                if (parsed.prediction !== undefined && parsed.prediction !== null &&
                    parsed.prediction_probability !== undefined && parsed.prediction_probability !== null) {
                    dispatch({
                        predictionResult: {
                            prediction: parsed.prediction,
                            is_failure: parsed.prediction === 1,
                            prediction_probability: parsed.prediction_probability,
                            prediction_reason: parsed.prediction === 1 ? 'ML Model predicted failure' : 'ML Model predicted normal operation',
                            rule_based_analysis: { has_definite_failure: parsed.prediction === 1, failure_risks: [] }
                        }
                    });
                }
            } catch {
                window.location.href = '/dashboard/machines';
            }
        } else {
            window.location.href = '/dashboard/machines';
        }
    }, []);

    // Refresh data periodically or when verification status changes
    useEffect(() => {
        const fetchFreshData = async () => {
            if (!measurement || !measurement.machine?.id) return;
            try {
                const sensorHistory = await api.getSensorHistory(Number(measurement.machine.id));
                if (sensorHistory && sensorHistory.length > 0) {
                    const recordId = measurement.id || measurement.recordId;
                    const freshRecord = sensorHistory.find((r: any) => r.id === recordId);
                    if (freshRecord) {
                        dispatch((prev: MeasurementState) => ({
                            measurement: prev.measurement ? ({
                                ...prev.measurement,
                                blockchain_tx_hash: freshRecord.blockchain_tx_hash,
                                blockchain_success: freshRecord.blockchain_success,
                                proof_id: freshRecord.proof_id,
                                prediction: freshRecord.prediction,
                                prediction_probability: freshRecord.prediction_probability,
                                prediction_tx_hash: freshRecord.prediction_tx_hash,
                            }) : null
                        }));
                        if (freshRecord.prediction !== undefined && freshRecord.prediction !== null) {
                            dispatch({
                                predictionResult: {
                                    prediction: freshRecord.prediction,
                                    is_failure: freshRecord.prediction === 1,
                                    prediction_probability: freshRecord.prediction_probability ?? 0,
                                    prediction_reason: freshRecord.prediction === 1 ? 'ML Model predicted failure' : 'ML Model predicted normal operation',
                                    rule_based_analysis: { has_definite_failure: freshRecord.prediction === 1, failure_risks: [] }
                                }
                            });
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to refresh verification status", e);
            }
        };
        if (measurement) fetchFreshData();
    }, [measurement?.id, measurement?.recordId, measurement?.machine?.id, verifying]);

    const handleVerify = () => {
        if (!measurement) return;
        dispatch({ verifying: true, error: null });

        let verifyRecordId = measurement.id || measurement.recordId;
        let verifyContractAddr = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '';
        let verifyRawSession = sessionStorage.getItem('pdmSessionUser') || '{}';

        if (!verifyRecordId) {
            dispatch({ error: 'Record ID missing', verifying: false });
            return;
        }

        const ethereum = (window as any).ethereum;
        if (!ethereum) {
            dispatch({ error: 'MetaMask is not installed!', verifying: false });
            return;
        }

        const verifySessionUser = JSON.parse(verifyRawSession);
        let verifyAddrMismatchMsg = 'MetaMask wallet mismatch';
        if (verifySessionUser.address) {
            verifyAddrMismatchMsg = `MetaMask aktif hesabi oturumdaki cuzdaninizla eslesmiyor. Lutfen MetaMask'ta ${verifySessionUser.address.slice(0, 10)}... adresine gecin veya cikis yapip dogru cuzdanla giris yapin.`;
        }

        const doVerify = async (): Promise<string | null> => {
            const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
            const account = accounts[0];

            if (verifySessionUser.address) {
                const sessionAddr = verifySessionUser.address.toLowerCase();
                const currentAddr = account.toLowerCase();
                if (currentAddr !== sessionAddr) {
                    return verifyAddrMismatchMsg;
                }
            }

            const payload = {
                id: verifyRecordId,
                air_temp_k: measurement.airTemperature,
                process_temp_k: measurement.processTemperature,
                rotational_speed_rpm: measurement.rotationalSpeed,
                torque_nm: measurement.torque,
                tool_wear_min: measurement.toolWear,
                machine_type: measurement.machine.type
            };

            const proofRes = await api.prepareBlockchainProof(measurement.machine.id, payload as any, account, verifyRecordId!);
            const proofData = (proofRes as any).proof_args || (proofRes as any).tx_data;

            const txResult = await blockchainService.submitSensorDataProof(verifyContractAddr!, proofData);
            if (txResult.success) {
                await api.confirmBlockchainTx(verifyRecordId!, txResult.txHash!, account, txResult.proofId);
                return null;
            }
            return 'Submission failed';
        };

        doVerify().then((errMsg) => {
            if (errMsg) { dispatch({ error: errMsg, verifying: false }); }
        }).catch((err: any) => {
            console.error(err);
            dispatch({ error: err.message || 'Verification failed', verifying: false });
        });
    };

    const handleAnalyze = () => {
        if (!measurement || !canAnalyze) return;
        dispatch({ analyzing: true, error: null });

        let analyzeRecordId = measurement.id || measurement.recordId;
        let analyzeContractAddr = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0xYourContractAddress';
        let analyzeRawSession = sessionStorage.getItem('pdmSessionUser') || '{}';

        if (!analyzeRecordId) {
            dispatch({ error: 'Measurement ID is missing', analyzing: false });
            return;
        }

        const ethereum = (window as any).ethereum;
        if (!ethereum) {
            dispatch({ error: 'MetaMask is not installed!', analyzing: false });
            return;
        }

        const analyzeSessionUser = JSON.parse(analyzeRawSession);
        let analyzeAddrMismatchMsg = 'MetaMask wallet mismatch';
        if (analyzeSessionUser.address) {
            analyzeAddrMismatchMsg = `MetaMask aktif hesabi oturumdaki cuzdaninizla eslesmiyor. Lutfen MetaMask'ta ${analyzeSessionUser.address.slice(0, 10)}... adresine gecin veya cikis yapip dogru cuzdanla giris yapin.`;
        }

        const doAnalyze = async (): Promise<{ ok: boolean; predResult?: any; predProb?: number; prediction?: number; error?: string }> => {
            const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
            const account = accounts[0];

            if (analyzeSessionUser.address) {
                const sessionAddr2 = analyzeSessionUser.address.toLowerCase();
                const currentAddr2 = account.toLowerCase();
                if (currentAddr2 !== sessionAddr2) {
                    return { ok: false, error: analyzeAddrMismatchMsg };
                }
            }

            const message = `Authorize Failure Analysis\nMachine Type: ${measurement.machine.type}\nTimestamp: ${new Date().getTime()}`;
            const signature = await ethereum.request({ method: 'personal_sign', params: [message, account] });

            const payload = {
                id: analyzeRecordId,
                air_temp_k: measurement.airTemperature,
                process_temp_k: measurement.processTemperature,
                rotational_speed_rpm: measurement.rotationalSpeed,
                torque_nm: measurement.torque,
                tool_wear_min: measurement.toolWear,
                machine_type: measurement.machine.type
            };

            const result = await api.predict(payload, signature, message);
            const proofArgs = await api.preparePredictionProof(analyzeRecordId!, account);
            const proofInput = (proofArgs as any).proof_args || (proofArgs as any).tx_data;

            const txResult = await blockchainService.submitPredictionProof(analyzeContractAddr!, proofInput);
            if (!txResult.success) {
                return { ok: false, error: 'Blockchain submission failed' };
            }

            const proofId = txResult.proofId || null;
            await api.confirmBlockchainTx(analyzeRecordId!, txResult.txHash!, account, proofId, true);

            const isFail = result.prediction === 1;
            const predProb = (result as any).prediction_probability ?? (result as any).probability ?? 0;
            const predReason = isFail ? 'ML Model predicted failure' : 'ML Model predicted normal operation';
            const failureRisks = (result as any).failure_risks || [];

            const predResult = {
                prediction: result.prediction,
                is_failure: isFail,
                prediction_probability: predProb,
                prediction_reason: predReason,
                rule_based_analysis: { has_definite_failure: isFail, failure_risks: failureRisks }
            };

            return { ok: true, predResult, predProb, prediction: result.prediction };
        };

        doAnalyze().then((res) => {
            if (!res.ok) {
                dispatch({ error: res.error || 'Analysis failed', analyzing: false });
                return;
            }
            dispatch({ predictionResult: res.predResult });
            sessionStorage.setItem('selectedMeasurement', JSON.stringify({
                ...measurement,
                prediction: res.prediction,
                prediction_probability: res.predProb
            }));
        }).catch((err: any) => {
            console.error(err);
            if (err.code === 4001) {
                dispatch({ error: 'User rejected the signature request.', analyzing: false });
            } else {
                dispatch({ error: err.message || 'Analysis failed', analyzing: false });
            }
        });
    };

    return {
        state,
        canAnalyze,
        handleVerify,
        handleAnalyze,
        dispatch
    };
}

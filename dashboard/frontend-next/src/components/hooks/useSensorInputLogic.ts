import { useState, useEffect, useCallback } from 'react';
import { Machine, SensorData, SessionKeyStatus } from '../../types';
import { api } from '../../services/api';
import { blockchainService } from '../../services/blockchain';

interface SensorFormData {
    airTemperature: any;
    processTemperature: any;
    rotationalSpeed: any;
    torque: any;
    toolWear: any;
}

interface SensorInputState {
    selectedMachineId: string;
    loading: boolean;
    success: string | null;
    error: string | null;
    sessionKeyStatus: SessionKeyStatus | null;
    formData: SensorFormData;
}

const INITIAL_FORM: SensorFormData = {
    airTemperature: '',
    processTemperature: '',
    rotationalSpeed: '',
    torque: '',
    toolWear: '',
};

export function useSensorInputLogic(
    machines: Machine[],
    onSave: (machineId: string, data: SensorData) => Promise<void>,
    walletAddress: string,
) {
    const [state, setState] = useState<SensorInputState>({
        selectedMachineId: machines[0]?.id || '',
        loading: false,
        success: null,
        error: null,
        sessionKeyStatus: null,
        formData: { ...INITIAL_FORM },
    });

    // Session key check
    useEffect(() => {
        api.getSessionKeyStatus().then(s => {
            setState(prev => ({ ...prev, sessionKeyStatus: s }));
        }).catch(() => { });
    }, []);

    // Auto-select first machine
    useEffect(() => {
        if (machines.length > 0 && !state.selectedMachineId) {
            setState(prev => ({ ...prev, selectedMachineId: machines[0].id }));
        }
    }, [machines, state.selectedMachineId]);

    // Auto-dismiss success
    useEffect(() => {
        if (state.success) {
            const timer = setTimeout(() => setState(prev => ({ ...prev, success: null })), 5000);
            return () => clearTimeout(timer);
        }
    }, [state.success]);

    const operatorHasSessionKey = state.sessionKeyStatus?.roles?.OPERATOR?.active ?? false;

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'machineId') {
            setState(prev => ({ ...prev, selectedMachineId: value }));
        } else {
            setState(prev => ({
                ...prev,
                formData: { ...prev.formData, [name]: parseFloat(value) },
            }));
        }
    }, []);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setState(prev => ({ ...prev, loading: true, error: null, success: null }));

        const isInvalid = (val: any) => val === '' || val === null || val === undefined || Number.isNaN(Number(val));
        const { airTemperature, processTemperature, rotationalSpeed, torque, toolWear } = state.formData;

        if (
            isInvalid(airTemperature) ||
            isInvalid(processTemperature) ||
            isInvalid(rotationalSpeed) ||
            isInvalid(torque) ||
            isInvalid(toolWear)
        ) {
            setState(prev => ({ ...prev, error: "Please enter all sensor data!", loading: false }));
            return;
        }

        try {
            const machine = machines.find(m => m.id === state.selectedMachineId);
            const machineIdInt = parseInt(state.selectedMachineId);
            if (!machineIdInt || isNaN(machineIdInt)) {
                throw new Error("Invalid Machine ID. Please select a valid machine.");
            }

            const backendPayload = {
                air_temp_k: state.formData.airTemperature,
                process_temp_k: state.formData.processTemperature,
                rotational_speed_rpm: state.formData.rotationalSpeed,
                torque_nm: state.formData.torque,
                tool_wear_min: state.formData.toolWear,
                machine_type: machine?.type || 'M',
                timestamp: Math.floor(Date.now() / 1000),
            };

            if (operatorHasSessionKey) {
                // Smart Account path
                const result = await api.submitSensorViaBackend(machineIdInt, backendPayload, walletAddress);
                if (!result.success) throw new Error('Backend submission failed');

                const localPayload = { ...state.formData, timestamp: new Date().toISOString() };
                await onSave(state.selectedMachineId, localPayload);

                const modeLabel = result.submission_mode === 'smart_account' ? 'Smart Account' : 'EOA';
                setState(prev => ({
                    ...prev,
                    loading: false,
                    success: `Sensor data submitted via ${modeLabel}!`,
                    formData: { ...INITIAL_FORM },
                }));
            } else {
                // EOA fallback: MetaMask
                if (!blockchainService.isMetaMaskInstalled()) {
                    throw new Error("Wallet provider is not installed. Please install a compatible wallet.");
                }

                const connectedAddress = await blockchainService.connectWallet();
                if (connectedAddress?.toLowerCase() !== walletAddress.toLowerCase()) {
                    console.warn("Connected wallet does not match login wallet");
                }

                const prepareResult = await api.prepareBlockchainProof(machineIdInt, backendPayload as any, walletAddress) as any;
                if (prepareResult.success === false) {
                    throw new Error(prepareResult.error || "Failed to prepare proof");
                }

                const record_id = prepareResult.record_id;
                const contract_address = prepareResult.contract_address || process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '';
                const proof_args = prepareResult.proof_args || prepareResult.tx_data;

                const blockchainResult = await blockchainService.submitSensorDataProof(contract_address, proof_args);
                if (!blockchainResult.success) {
                    throw new Error(blockchainResult.error || "Blockchain submission failed");
                }

                await api.confirmBlockchainTx(
                    record_id,
                    blockchainResult.txHash!,
                    walletAddress,
                    blockchainResult.proofId
                );

                const localPayload = { ...state.formData, timestamp: new Date().toISOString() };
                await onSave(state.selectedMachineId, localPayload);

                setState(prev => ({
                    ...prev,
                    loading: false,
                    success: 'Sensor data submitted and confirmed on blockchain!',
                    formData: { ...INITIAL_FORM },
                }));
            }

            setTimeout(() => window.dispatchEvent(new Event('open-notification-center')), 500);

        } catch (err: any) {
            console.error("Sensor input error:", err);
            let errorMessage = 'Failed to save';
            if (err.response?.data?.detail) {
                errorMessage = Array.isArray(err.response.data.detail)
                    ? err.response.data.detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ')
                    : String(err.response.data.detail);
            } else if (err.message) {
                errorMessage = err.message;
            }
            setState(prev => ({ ...prev, loading: false, error: errorMessage }));
        }
    }, [state.formData, state.selectedMachineId, operatorHasSessionKey, machines, onSave, walletAddress]);

    const setFormField = useCallback((name: string, value: any) => {
        setState(prev => ({
            ...prev,
            formData: { ...prev.formData, [name]: value },
        }));
    }, []);

    const setFormData = useCallback((data: SensorFormData) => {
        setState(prev => ({ ...prev, formData: data }));
    }, []);

    return {
        ...state,
        operatorHasSessionKey,
        sessionKeyStatus: state.sessionKeyStatus,
        handleChange,
        handleSubmit,
        setFormField,
        setFormData,
    };
}

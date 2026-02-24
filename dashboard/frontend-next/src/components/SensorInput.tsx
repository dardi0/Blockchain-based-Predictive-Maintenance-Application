'use client';

import React, { useState, useEffect } from 'react';
import { Machine, SensorData, SessionKeyStatus } from '../types';
import { api } from '../services/api';
import { blockchainService } from '../services/blockchain';
import { Skeleton } from './ui/Skeleton';
import SmartAccountBadge from './SmartAccountBadge';
import { Save, RefreshCw, CheckCircle, AlertCircle, Cpu, ThermometerSun, Gauge, Activity, Timer, ChevronUp, ChevronDown } from 'lucide-react';


interface NumberInputProps {
    label: string;
    icon: any;
    name: string;
    value: any;
    onChange: (e: any) => void;
    step?: number;
    placeholder?: string;
}

const NumberInput: React.FC<NumberInputProps> = ({
    label,
    icon: Icon,
    name,
    value,
    onChange,
    step = 1,
    placeholder
}) => {
    const handleStep = (direction: 1 | -1) => {
        const currentVal = parseFloat(value) || 0;
        const isDecimal = step % 1 !== 0;
        const precision = isDecimal ? 1 : 0;
        const newVal = (currentVal + (step * direction)).toFixed(precision);

        onChange({
            target: {
                name,
                value: newVal
            }
        });
    };

    return (
        <div className="space-y-1">
            <label className="flex items-center gap-2 text-[10px] font-bold text-white/30 uppercase tracking-widest ml-1">
                <Icon size={12} className="text-[var(--accent-highlight)]" />
                {label}
            </label>
            <div className="relative group">
                <input
                    type="number"
                    name={name}
                    step={step}
                    placeholder={placeholder}
                    value={value}
                    onChange={onChange}
                    className="w-full p-3 pr-10 border border-white/[0.07] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/50 focus:border-[var(--accent-primary)] bg-white/[0.03] text-white placeholder:text-white/15 transition-all font-mono text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none hover:border-white/[0.14]"
                />
                <div className="absolute right-1 top-1 bottom-1 flex flex-col w-6 border-l border-white/[0.07]">
                    <button
                        type="button"
                        onClick={() => handleStep(1)}
                        className="flex-1 flex items-center justify-center text-white/20 hover:text-[var(--accent-highlight)] hover:bg-white/[0.04] rounded-tr-md transition-colors"
                    >
                        <ChevronUp size={10} strokeWidth={3} />
                    </button>
                    <button
                        type="button"
                        onClick={() => handleStep(-1)}
                        className="flex-1 flex items-center justify-center text-white/20 hover:text-[var(--accent-highlight)] hover:bg-white/[0.04] rounded-br-md transition-colors border-t border-white/[0.07]"
                    >
                        <ChevronDown size={10} strokeWidth={3} />
                    </button>
                </div>
            </div>
        </div>
    );
};

interface SensorInputProps {
    machines: Machine[];
    onSave: (machineId: string, data: SensorData) => Promise<void>;
    walletAddress: string;
}

const SensorInput: React.FC<SensorInputProps> = ({ machines, onSave, walletAddress }) => {
    const [selectedMachineId, setSelectedMachineId] = useState<string>(machines[0]?.id || '');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sessionKeyStatus, setSessionKeyStatus] = useState<SessionKeyStatus | null>(null);

    const [formData, setFormData] = useState({
        airTemperature: '' as any,
        processTemperature: '' as any,
        rotationalSpeed: '' as any,
        torque: '' as any,
        toolWear: '' as any
    });

    // Session key durumunu startup'ta bir kez sorgula
    useEffect(() => {
        api.getSessionKeyStatus().then(setSessionKeyStatus).catch(() => {});
    }, []);

    useEffect(() => {
        if (machines.length > 0 && !selectedMachineId) {
            setSelectedMachineId(machines[0].id);
        }
    }, [machines, selectedMachineId]);

    useEffect(() => {
        if (success) {
            const timer = setTimeout(() => setSuccess(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [success]);

    // Smart Account aktifse backend TX gönderir; MetaMask imzası gerekmez
    const operatorHasSessionKey = sessionKeyStatus?.roles?.OPERATOR?.active ?? false;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'machineId') {
            setSelectedMachineId(value);
        } else {
            setFormData(prev => ({
                ...prev,
                [name]: parseFloat(value)
            }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        const isInvalid = (val: any) => val === '' || val === null || val === undefined || Number.isNaN(Number(val));
        const { airTemperature, processTemperature, rotationalSpeed, torque, toolWear } = formData;

        if (
            isInvalid(airTemperature) ||
            isInvalid(processTemperature) ||
            isInvalid(rotationalSpeed) ||
            isInvalid(torque) ||
            isInvalid(toolWear)
        ) {
            setError("Please enter all sensor data!");
            setLoading(false);
            return;
        }

        try {
            const machine = machines.find(m => m.id === selectedMachineId);
            const machineIdInt = parseInt(selectedMachineId);
            if (!machineIdInt || isNaN(machineIdInt)) {
                throw new Error("Invalid Machine ID. Please select a valid machine.");
            }

            const backendPayload = {
                air_temp_k: formData.airTemperature,
                process_temp_k: formData.processTemperature,
                rotational_speed_rpm: formData.rotationalSpeed,
                torque_nm: formData.torque,
                tool_wear_min: formData.toolWear,
                machine_type: machine?.type || 'M',
                timestamp: Math.floor(Date.now() / 1000),
            };

            if (operatorHasSessionKey) {
                // ── Smart Account yolu: backend TX'i kendisi gönderir ──────────────
                const result = await api.submitSensorViaBackend(machineIdInt, backendPayload, walletAddress);
                if (!result.success) throw new Error('Backend submission failed');

                const localPayload = { ...formData, timestamp: new Date().toISOString() };
                await onSave(selectedMachineId, localPayload);

                const modeLabel = result.submission_mode === 'smart_account' ? 'Smart Account' : 'EOA';
                setSuccess(`Sensor data submitted via ${modeLabel}!`);
            } else {
                // ── EOA fallback: MetaMask ile imzalama ───────────────────────────
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

                const localPayload = { ...formData, timestamp: new Date().toISOString() };
                await onSave(selectedMachineId, localPayload);

                setSuccess('Sensor data submitted and confirmed on blockchain!');
            }

            setTimeout(() => window.dispatchEvent(new Event('open-notification-center')), 500);

            setFormData({
                airTemperature: '',
                processTemperature: '',
                rotationalSpeed: '',
                torque: '',
                toolWear: '',
            });

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
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto h-[calc(100vh-180px)] flex flex-col justify-center animate-fade-in-up">
            {machines.length === 0 ? (
                <div className="p-5 rounded-xl border border-white/[0.07] bg-white/[0.02] space-y-4">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-12 w-12 rounded-lg" />
                        <div className="space-y-2">
                            <Skeleton className="h-5 w-40" />
                            <Skeleton className="h-3 w-56" />
                        </div>
                    </div>
                    <Skeleton className="h-10 w-full rounded-lg" />
                    <div className="grid grid-cols-2 gap-3">
                        <Skeleton className="h-16 rounded-lg" />
                        <Skeleton className="h-16 rounded-lg" />
                        <Skeleton className="h-16 rounded-lg" />
                        <Skeleton className="h-16 rounded-lg" />
                    </div>
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-12 w-full rounded-lg" />
                </div>
            ) : (
                <div className="relative p-5 rounded-xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-xl">
                    {/* Corner accent */}
                    <div className="absolute top-0 left-0 w-10 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                    <div className="absolute top-0 left-0 h-10 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />

                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30">
                                <Cpu size={20} className="text-[var(--accent-highlight)]" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white tracking-tight">Sensor Data Entry</h2>
                                <p className="text-xs text-white/40 font-medium">Submit data to blockchain</p>
                            </div>
                        </div>
                        <SmartAccountBadge status={sessionKeyStatus} role="OPERATOR" />
                    </div>

                    {error && (
                        <div className="mb-4 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-400 animate-fade-in text-xs">
                            <AlertCircle size={16} />
                            <span className="font-semibold">{error}</span>
                        </div>
                    )}

                    {success && (
                        <div className="mb-4 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-3 text-emerald-400 animate-fade-in text-xs">
                            <CheckCircle size={16} />
                            <span className="font-semibold">{success}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setFormData({
                                        airTemperature: Number((295 + Math.random() * 10).toFixed(1)),
                                        processTemperature: Number((305 + Math.random() * 10).toFixed(1)),
                                        rotationalSpeed: Math.floor(1000 + Math.random() * 2000),
                                        torque: Number((3 + Math.random() * 74).toFixed(1)),
                                        toolWear: Math.floor(Math.random() * 300)
                                    });
                                }}
                                className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-highlight)] bg-[var(--accent-primary)]/10 hover:bg-[var(--accent-primary)]/20 border border-[var(--accent-primary)]/20 rounded-md transition-all"
                            >
                                <RefreshCw size={12} />
                                Auto-Fill Random
                            </button>
                        </div>

                        <div className="group">
                            <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1.5 ml-1">Select Machine</label>
                            <div className="relative">
                                <select
                                    name="machineId"
                                    value={selectedMachineId}
                                    onChange={handleChange}
                                    className="w-full p-3 pl-3 pr-8 border border-white/[0.07] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/50 focus:border-[var(--accent-primary)] bg-white/[0.03] text-white appearance-none transition-all font-medium text-sm"
                                >
                                    {machines.map(m => (
                                        <option key={m.id} value={m.id} className="bg-[#0a1020] text-white">{m.name} ({m.type} Type)</option>
                                    ))}
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none">
                                    <Cpu size={16} />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <NumberInput
                                label="Air Temp [K]"
                                icon={ThermometerSun}
                                name="airTemperature"
                                value={formData.airTemperature}
                                onChange={handleChange}
                                step={0.1}
                                placeholder="300.0"
                            />
                            <NumberInput
                                label="Proc Temp [K]"
                                icon={ThermometerSun}
                                name="processTemperature"
                                value={formData.processTemperature}
                                onChange={handleChange}
                                step={0.1}
                                placeholder="308.5"
                            />
                            <NumberInput
                                label="Speed [rpm]"
                                icon={Gauge}
                                name="rotationalSpeed"
                                value={formData.rotationalSpeed}
                                onChange={handleChange}
                                step={10}
                                placeholder="1500"
                            />
                            <NumberInput
                                label="Torque [Nm]"
                                icon={Activity}
                                name="torque"
                                value={formData.torque}
                                onChange={handleChange}
                                step={0.1}
                                placeholder="45.0"
                            />

                            <div className="md:col-span-2">
                                <NumberInput
                                    label="Tool Wear [min]"
                                    icon={Timer}
                                    name="toolWear"
                                    value={formData.toolWear}
                                    onChange={handleChange}
                                    step={1}
                                    placeholder="120"
                                />
                            </div>
                        </div>

                        <div className="pt-4 border-t border-white/[0.07]">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full group relative flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-highlight)] text-white rounded-lg font-bold tracking-wide hover:shadow-lg hover:shadow-[var(--accent-primary)]/25 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 text-sm"
                            >
                                <div className="absolute inset-0 rounded-lg bg-white/20 group-hover:opacity-100 opacity-0 transition-opacity" />
                                {loading ? (
                                    <>
                                        <RefreshCw size={16} className="animate-spin" />
                                        <span>
                                            {operatorHasSessionKey ? 'Submitting via Smart Account...' : 'Processing...'}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <Save size={16} />
                                        <span>
                                            {operatorHasSessionKey ? 'Submit (Smart Account)' : 'Sign & Submit'}
                                        </span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default SensorInput;

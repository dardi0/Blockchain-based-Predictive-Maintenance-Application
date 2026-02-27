'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api } from '@/services/api';
import {
    Brain, Play, RefreshCw, ArrowLeft, Settings2, BarChart3,
    Layers, Cpu, Activity, CheckCircle, AlertCircle, XCircle,
    ChevronDown, ChevronUp, Gauge, TrendingUp, Zap, Timer,
    LayoutGrid, SlidersHorizontal
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ── Module-level helpers & small components ─────────────────────────
function ArrayParamField({ label, value, onChange, hint }: {
    label: string; value: number[]; onChange: (v: number[]) => void; hint?: string;
}) {
    return (
        <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</label>
            <input
                aria-label={label}
                type="text"
                value={value.join(', ')}
                onChange={e => {
                    const arr = e.target.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                    if (arr.length > 0) onChange(arr);
                }}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[var(--accent-primary)]/10 border border-slate-200 dark:border-[var(--accent-primary)]/20 rounded-lg text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent outline-none transition-all"
            />
            {hint && <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
        </div>
    );
}

const STATUS_CONFIGS: Record<string, { bg: string; text: string; icon: any; label: string }> = {
    idle: { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-500', icon: Settings2, label: 'Ready' },
    running: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400', icon: RefreshCw, label: 'Training...' },
    completed: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400', icon: CheckCircle, label: 'Completed' },
    error: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-600 dark:text-red-400', icon: XCircle, label: 'Error' },
};

function StatusBadge({ statusValue }: { statusValue: string }) {
    const c = STATUS_CONFIGS[statusValue] || STATUS_CONFIGS.idle;
    const Icon = c.icon;
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${c.bg} ${c.text}`}>
            <Icon size={14} className={statusValue === 'running' ? 'animate-spin' : ''} />
            {c.label}
        </span>
    );
}

const PHASE_LABELS: Record<string, string> = {
    initializing: 'Initializing...',
    loading_data: 'Loading Dataset',
    cross_validation: 'Cross Validation',
    final_training: 'Final Model Training',
    saving_model: 'Saving Model',
    generating_charts: 'Generating Charts',
    collecting_results: 'Collecting Results',
    done: 'Completed',
};

function ParamField({ label, value, onChange, type = 'number', min, max, step = 1, hint, options }: {
    label: string; value: any; onChange: (v: any) => void;
    type?: string; min?: number; max?: number; step?: number;
    hint?: string; options?: { label: string; value: string }[];
}) {
    const handleIncrement = () => {
        const newValue = (parseFloat(value) || 0) + step;
        if (max !== undefined && newValue > max) return;
        onChange(Number(newValue.toFixed(step < 1 ? 4 : 0)));
    };
    const handleDecrement = () => {
        const newValue = (parseFloat(value) || 0) - step;
        if (min !== undefined && newValue < min) return;
        onChange(Number(newValue.toFixed(step < 1 ? 4 : 0)));
    };
    return (
        <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</label>
            {options ? (
                <select
                    aria-label={label}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-[var(--accent-primary)]/20 rounded-lg text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent outline-none transition-all"
                >
                    {options.map(o => <option key={o.value} value={o.value} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-gray-100">{o.label}</option>)}
                </select>
            ) : type === 'checkbox' ? (
                <div className="flex items-center gap-2 h-[38px]">
                    <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} aria-label={label} className="w-4 h-4 accent-[var(--accent-primary)]" />
                    <span className="text-sm text-slate-600 dark:text-slate-300">{value ? 'Enabled' : 'Disabled'}</span>
                </div>
            ) : (
                <div className="relative flex items-center">
                    <button onClick={handleDecrement} className="absolute left-1 p-1 hover:bg-slate-200 dark:hover:bg-[var(--accent-primary)]/20 rounded text-slate-500 dark:text-slate-400 transition-colors z-10">
                        <ChevronDown size={14} />
                    </button>
                    <input
                        aria-label={label}
                        type={type} value={value}
                        onChange={e => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                        min={min} max={max} step={step}
                        className="w-full pl-8 pr-8 py-2 text-center bg-slate-50 dark:bg-[var(--accent-primary)]/10 border border-slate-200 dark:border-[var(--accent-primary)]/20 rounded-lg text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent outline-none transition-all appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button onClick={handleIncrement} className="absolute right-1 p-1 hover:bg-slate-200 dark:hover:bg-[var(--accent-primary)]/20 rounded text-slate-500 dark:text-slate-400 transition-colors z-10">
                        <ChevronUp size={14} />
                    </button>
                </div>
            )}
            {hint && <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
        </div>
    );
}

function MetricCard({ label, value, icon: Icon, color = 'text-[var(--accent-primary)]' }: {
    label: string; value: string; icon: any; color?: string;
}) {
    return (
        <div className="bg-white dark:bg-[var(--dark-bg)]/90 rounded-xl border border-slate-200 dark:border-[var(--accent-primary)]/10 p-4 shadow-sm dark:shadow-[var(--accent-primary)]/5">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 dark:bg-[var(--accent-primary)]/10 rounded-lg">
                    <Icon size={18} className={color} />
                </div>
                <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
                    <p className="text-xl font-bold text-slate-800 dark:text-white">{value}</p>
                </div>
            </div>
        </div>
    );
}

// ── Type definitions ────────────────────────────────────────────────
interface TrainingStatus {
    status: 'idle' | 'running' | 'completed' | 'error';
    progress: number;
    current_epoch: number;
    total_epochs: number;
    current_phase: string;
    train_loss: number | null;
    val_loss: number | null;
    elapsed_seconds: number | null;
    error: string | null;
}

interface ChartInfo { name: string; filename: string; url: string; }

interface TrainingResults {
    status: string;
    metrics: Record<string, any>;
    charts: ChartInfo[];
    elapsed_seconds: number | null;
}

// ── Custom Hook ─────────────────────────────────────────────────────
type Params = {
    cnn_filters: number[]; cnn_kernel_size: number; cnn_dropout: number;
    lstm_units: number[]; lstm_dropout: number;
    dense_units: number[]; dense_dropout: number;
    learning_rate: number; epochs: number; batch_size: number; cv_splits: number;
    use_smote: boolean; threshold_method: string; early_stopping_patience: number;
};

type TrainingUI = { loading: boolean; paramsOpen: boolean; activeTab: 'params' | 'results'; chartZoom: string | null };
type TrainingData = { params: Params; status: TrainingStatus; results: TrainingResults | null };

const INITIAL_PARAMS: Params = {
    cnn_filters: [128, 256], cnn_kernel_size: 4, cnn_dropout: 0.3,
    lstm_units: [128, 256], lstm_dropout: 0.3,
    dense_units: [32, 64, 16], dense_dropout: 0.4,
    learning_rate: 0.001, epochs: 500, batch_size: 64, cv_splits: 5,
    use_smote: true, threshold_method: 'f1', early_stopping_patience: 80,
};

const INITIAL_STATUS: TrainingStatus = {
    status: 'idle', progress: 0, current_epoch: 0, total_epochs: 0,
    current_phase: '', train_loss: null, val_loss: null, elapsed_seconds: null, error: null,
};

function useTrainingSession() {
    const [state, setState] = useState<{ ui: TrainingUI; training: TrainingData }>({
        ui: { loading: true, paramsOpen: true, activeTab: 'params', chartZoom: null },
        training: { params: INITIAL_PARAMS, status: INITIAL_STATUS, results: null },
    });
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    const setUI = useCallback((updater: React.SetStateAction<TrainingUI>) => {
        setState(prev => ({ ...prev, ui: typeof updater === 'function' ? updater(prev.ui) : updater }));
    }, []);

    const setTraining = useCallback((updater: React.SetStateAction<TrainingData>) => {
        setState(prev => ({ ...prev, training: typeof updater === 'function' ? updater(prev.training) : updater }));
    }, []);

    const { ui, training } = state;

    const setParams = useCallback((updater: React.SetStateAction<Params>) => {
        setTraining(prev => ({
            ...prev,
            params: typeof updater === 'function' ? updater(prev.params) : updater,
        }));
    }, [setTraining]);

    const _loadResults = async () => {
        try {
            const results = await api.getTrainingResults();
            setTraining(prev => ({ ...prev, results }));
        } catch { /* ignore */ }
    };

    const _startPolling = useCallback(() => {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
            try {
                const st = await api.getTrainingStatus();
                setTraining(prev => ({ ...prev, status: st }));
                if (st.status !== 'running') {
                    if (pollingRef.current) clearInterval(pollingRef.current);
                    pollingRef.current = null;
                    if (st.status === 'completed') {
                        setUI(prev => ({ ...prev, activeTab: 'results' }));
                        _loadResults();
                    }
                }
            } catch { /* ignore */ }
        }, 2000);
    }, []);

    useEffect(() => {
        (async () => {
            let config: any = null;
            let st: any = null;

            try {
                config = await api.getTrainingConfig();
                st = await api.getTrainingStatus();
            } catch (e) {
                console.error('Config load error:', e);
            }

            // Tüm güncellemeleri tek bir setState çağrısında birleştir
            setState(prev => ({
                ui: { ...prev.ui, loading: false },
                training: {
                    ...prev.training,
                    ...(st && { status: st }),
                    ...(config && {
                        params: {
                            ...prev.training.params,
                            cnn_filters: config.model.cnn_filters, cnn_kernel_size: config.model.cnn_kernel_size,
                            cnn_dropout: config.model.cnn_dropout, lstm_units: config.model.lstm_units,
                            lstm_dropout: config.model.lstm_dropout, dense_units: config.model.dense_units,
                            dense_dropout: config.model.dense_dropout, learning_rate: config.model.learning_rate,
                            epochs: config.training.epochs, batch_size: config.training.batch_size,
                            cv_splits: config.training.cv_splits, use_smote: config.training.use_smote,
                            threshold_method: config.training.threshold_method,
                            early_stopping_patience: config.training.early_stopping_patience,
                        },
                    }),
                },
            }));

            if (st?.status === 'running') _startPolling();
            if (st?.status === 'completed') _loadResults();
        })();
        return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    }, []);

    const handleStart = async () => {
        try {
            await api.startTraining(training.params);
            const st = await api.getTrainingStatus();
            setTraining(prev => ({ ...prev, status: st, results: null }));
            _startPolling();
        } catch (e: any) {
            let msg = 'Training could not start';
            if (e && e.message) msg = e.message;
            alert(msg);
        }
    };

    const formatDuration = (secs: number | null) => {
        if (secs === null) return '--';
        const m = Math.floor(secs / 60);
        const s = Math.round(secs % 60);
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
    };

    return {
        loading: ui.loading,
        paramsOpen: ui.paramsOpen,
        setParamsOpen: (v: boolean) => setUI(prev => ({ ...prev, paramsOpen: v })),
        activeTab: ui.activeTab,
        setActiveTab: (v: 'params' | 'results') => setUI(prev => ({ ...prev, activeTab: v })),
        params: training.params,
        setParams,
        status: training.status,
        results: training.results,
        chartZoom: ui.chartZoom,
        setChartZoom: (v: string | null) => setUI(prev => ({ ...prev, chartZoom: v })),
        handleStart,
        formatDuration,
    };
}

// ── Parameters Tab ──────────────────────────────────────────────────
interface ParamsTabProps {
    params: Params;
    setParams: React.Dispatch<React.SetStateAction<Params>>;
    paramsOpen: boolean;
    setParamsOpen: (v: boolean) => void;
    status: TrainingStatus;
    handleStart: () => void;
    formatDuration: (s: number | null) => string;
}

function ParametersTab({ params, setParams, paramsOpen, setParamsOpen, status, handleStart, formatDuration }: ParamsTabProps) {
    const p = <T,>(key: keyof Params) => (v: T) => setParams(prev => ({ ...prev, [key]: v }));
    return (
        <div className="space-y-6">
            {/* Parameters Card */}
            <div className="bg-white dark:bg-[var(--dark-bg)]/90 rounded-xl border border-slate-200 dark:border-[var(--accent-primary)]/10 shadow-sm dark:shadow-[var(--accent-primary)]/5 overflow-hidden">
                <button onClick={() => setParamsOpen(!paramsOpen)}
                    className="w-full flex items-center justify-between p-5 hover:bg-slate-50 dark:hover:bg-[var(--accent-primary)]/5 transition-colors">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                        <Settings2 className="text-[var(--accent-primary)] dark:text-[var(--accent-highlight)]" size={20} /> Model & Training Parameters
                    </h2>
                    {paramsOpen ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                </button>
                {paramsOpen && (
                    <div className="px-5 pb-5 space-y-6">
                        <div>
                            <h3 className="text-sm font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-2 mb-3"><Layers size={16} /> CNN Architecture</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <ArrayParamField label="Filters / Layer" value={params.cnn_filters} onChange={p('cnn_filters')} hint="e.g. 128, 256" />
                                <ParamField label="Kernel Size" value={params.cnn_kernel_size} onChange={p('cnn_kernel_size')} min={2} max={8} />
                                <ParamField label="CNN Dropout" value={params.cnn_dropout} onChange={p('cnn_dropout')} min={0} max={0.8} step={0.05} />
                            </div>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-2 mb-3"><Cpu size={16} /> LSTM Architecture</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <ArrayParamField label="Units / Layer" value={params.lstm_units} onChange={p('lstm_units')} hint="e.g. 128, 256" />
                                <ParamField label="LSTM Dropout" value={params.lstm_dropout} onChange={p('lstm_dropout')} min={0} max={0.8} step={0.05} />
                            </div>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-2 mb-3"><LayoutGrid size={16} /> Dense Layers</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <ArrayParamField label="Units / Layer" value={params.dense_units} onChange={p('dense_units')} hint="e.g. 32, 64, 16" />
                                <ParamField label="Dense Dropout" value={params.dense_dropout} onChange={p('dense_dropout')} min={0} max={0.8} step={0.05} />
                            </div>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-2 mb-3"><Zap size={16} /> Optimizer & Training</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <ParamField label="Learning Rate" value={params.learning_rate} onChange={p('learning_rate')} min={0.00001} max={0.1} step={0.0001} />
                                <ParamField label="Epochs" value={params.epochs} onChange={p('epochs')} min={10} max={2000} />
                                <ParamField label="Batch Size" value={params.batch_size} onChange={p('batch_size')} min={8} max={512} />
                                <ParamField label="CV Splits" value={params.cv_splits} onChange={p('cv_splits')} min={2} max={10} />
                                <ParamField label="Early Stop Patience" value={params.early_stopping_patience} onChange={p('early_stopping_patience')} min={5} max={500} />
                                <ParamField label="SMOTE" value={params.use_smote} type="checkbox" onChange={p('use_smote')} />
                                <ParamField label="Threshold Method" value={params.threshold_method} onChange={p('threshold_method')}
                                    options={[
                                        { label: 'F1-Score', value: 'f1' },
                                        { label: 'F-Beta (Recall)', value: 'f_beta' },
                                        { label: 'Recall Focused', value: 'recall_focused' },
                                    ]} />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Training Control Card */}
            <div className="bg-white dark:bg-[var(--dark-bg)]/90 rounded-xl border border-slate-200 dark:border-[var(--accent-primary)]/10 p-6 shadow-sm dark:shadow-[var(--accent-primary)]/5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                        <Activity className="text-[var(--accent-primary)] dark:text-[var(--accent-highlight)]" size={20} /> Training Control
                    </h2>
                    <div className="flex items-center gap-3">
                        {status.elapsed_seconds !== null && (
                            <span className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                <Timer size={14} /> {formatDuration(status.elapsed_seconds)}
                            </span>
                        )}
                        <button
                            onClick={handleStart}
                            disabled={status.status === 'running'}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white transition-all ${status.status === 'running'
                                ? 'bg-slate-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-purple-600 to-[var(--accent-primary)] hover:from-purple-700 hover:to-[var(--accent-primary)]/90 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40'
                                }`}
                        >
                            {status.status === 'running'
                                ? <><RefreshCw size={18} className="animate-spin" /> Training...</>
                                : <><Play size={18} /> Start Training</>
                            }
                        </button>
                    </div>
                </div>

                {(status.status === 'running' || status.status === 'completed') && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600 dark:text-slate-300 font-medium">
                                {PHASE_LABELS[status.current_phase] || status.current_phase}
                            </span>
                            <span className="text-[var(--accent-primary)] dark:text-[var(--accent-highlight)] font-bold">{status.progress}%</span>
                        </div>
                        <div className="h-3 bg-slate-200 dark:bg-[var(--accent-primary)]/10 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-purple-500 to-[var(--accent-highlight)] rounded-full transition-all duration-700 ease-out" style={{ width: `${status.progress}%` }} />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                            {[
                                { label: 'Epoch', value: `${status.current_epoch} / ${status.total_epochs}` },
                                { label: 'Train Loss', value: status.train_loss !== null ? status.train_loss.toFixed(4) : '--', cls: 'text-blue-600 dark:text-blue-400' },
                                { label: 'Val Loss', value: status.val_loss !== null ? status.val_loss.toFixed(4) : '--', cls: 'text-red-500 dark:text-red-400' },
                                { label: 'Elapsed', value: formatDuration(status.elapsed_seconds) },
                            ].map(({ label, value, cls }) => (
                                <div key={label} className="bg-slate-50 dark:bg-[var(--accent-primary)]/5 rounded-lg p-3 text-center">
                                    <p className="text-xs text-slate-400 uppercase">{label}</p>
                                    <p className={`text-lg font-bold ${cls ?? 'text-slate-800 dark:text-white'}`}>{value}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {status.status === 'error' && status.error && (
                    <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-xl">
                        <div className="flex items-start gap-3">
                            <XCircle size={20} className="text-red-500 mt-0.5" />
                            <div>
                                <p className="font-medium text-red-700 dark:text-red-400">Training Error</p>
                                <p className="text-sm text-red-600 dark:text-red-300 mt-1">{status.error}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Results Tab ─────────────────────────────────────────────────────
interface ResultsTabProps {
    results: TrainingResults | null;
    chartZoom: string | null;
    setChartZoom: (v: string | null) => void;
    formatDuration: (s: number | null) => string;
    setActiveTab: (v: 'params' | 'results') => void;
}

function ResultsTab({ results, chartZoom, setChartZoom, formatDuration, setActiveTab }: ResultsTabProps) {
    if (!results) {
        return (
            <div className="bg-white dark:bg-[var(--dark-bg)]/90 rounded-xl border border-slate-200 dark:border-[var(--accent-primary)]/10 p-16 text-center shadow-sm">
                <Brain size={60} className="mx-auto mb-4 text-slate-300 dark:text-slate-600" />
                <h3 className="text-lg font-semibold text-slate-600 dark:text-slate-400">No Training Results Yet</h3>
                <p className="text-sm text-slate-400 dark:text-slate-500 mt-2">Configure parameters and start training to see results here.</p>
                <button onClick={() => setActiveTab('params')}
                    className="mt-6 px-6 py-2 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] dark:text-[var(--accent-highlight)] rounded-lg hover:bg-[var(--accent-primary)]/20 transition-colors font-medium text-sm">
                    Go to Parameters
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <MetricCard label="Test Accuracy" value={`${((results.metrics.test_accuracy || 0) * 100).toFixed(1)}%`} icon={CheckCircle} color="text-emerald-500" />
                <MetricCard label="Test Precision" value={`${((results.metrics.test_precision || 0) * 100).toFixed(1)}%`} icon={Gauge} color="text-blue-500" />
                <MetricCard label="Test Recall" value={`${((results.metrics.test_recall || 0) * 100).toFixed(1)}%`} icon={TrendingUp} color="text-purple-500" />
                <MetricCard label="Test F1" value={`${((results.metrics.test_f1 || 0) * 100).toFixed(1)}%`} icon={Zap} color="text-amber-500" />
                <MetricCard label="Test AUC" value={`${((results.metrics.test_auc || 0) * 100).toFixed(1)}%`} icon={BarChart3} color="text-[var(--accent-primary)]" />
                <MetricCard label="Optimal Threshold" value={`${(results.metrics.optimal_threshold || 0.5).toFixed(3)}`} icon={Activity} color="text-red-500" />
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-[var(--dark-bg)]/90 rounded-xl border border-slate-200 dark:border-[var(--accent-primary)]/10 p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3">Training Summary</h3>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-slate-500">Epochs Run</span><span className="font-medium text-slate-800 dark:text-white">{results.metrics.epochs_run || '--'}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Final Train Loss</span><span className="font-medium text-blue-600">{results.metrics.final_train_loss?.toFixed(4) || '--'}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Final Val Loss</span><span className="font-medium text-red-500">{results.metrics.final_val_loss?.toFixed(4) || '--'}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Duration</span><span className="font-medium text-slate-800 dark:text-white">{formatDuration(results.elapsed_seconds)}</span></div>
                    </div>
                </div>

                {results.metrics.confusion_matrix && (
                    <div className="bg-white dark:bg-[var(--dark-bg)]/90 rounded-xl border border-slate-200 dark:border-[var(--accent-primary)]/10 p-5 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3">Confusion Matrix</h3>
                        <div className="grid grid-cols-2 gap-2 text-center text-sm">
                            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg"><p className="text-xs text-slate-400">TN</p><p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{results.metrics.confusion_matrix.tn.toLocaleString()}</p></div>
                            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg"><p className="text-xs text-slate-400">FP</p><p className="text-xl font-bold text-red-500">{results.metrics.confusion_matrix.fp.toLocaleString()}</p></div>
                            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg"><p className="text-xs text-slate-400">FN</p><p className="text-xl font-bold text-orange-500">{results.metrics.confusion_matrix.fn.toLocaleString()}</p></div>
                            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg"><p className="text-xs text-slate-400">TP</p><p className="text-xl font-bold text-purple-600 dark:text-purple-400">{results.metrics.confusion_matrix.tp.toLocaleString()}</p></div>
                        </div>
                    </div>
                )}

                <div className="bg-white dark:bg-[var(--dark-bg)]/90 rounded-xl border border-slate-200 dark:border-[var(--accent-primary)]/10 p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3">Cross Validation (Mean ± Std)</h3>
                    <div className="space-y-2 text-sm">
                        {['accuracy', 'precision', 'recall', 'f1', 'auc'].map(key => (
                            <div key={key} className="flex justify-between">
                                <span className="text-slate-500 capitalize">{key}</span>
                                <span className="font-medium text-slate-800 dark:text-white">
                                    {results.metrics[`cv_${key}_mean`] !== undefined
                                        ? `${(results.metrics[`cv_${key}_mean`] * 100).toFixed(1)}% ± ${(results.metrics[`cv_${key}_std`] * 100).toFixed(1)}%`
                                        : '--'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {results.charts.length > 0 && (
                <div className="bg-white dark:bg-[var(--dark-bg)]/90 rounded-xl border border-slate-200 dark:border-[var(--accent-primary)]/10 p-6 shadow-sm dark:shadow-[var(--accent-primary)]/5">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2 mb-6">
                        <BarChart3 className="text-[var(--accent-primary)] dark:text-[var(--accent-highlight)]" size={20} /> Training Charts ({results.charts.length})
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {results.charts.map(chart => (
                            <div key={chart.filename}
                                role="button" tabIndex={0}
                                className="border border-slate-200 dark:border-[var(--accent-primary)]/10 rounded-xl overflow-hidden hover:border-[var(--accent-primary)]/30 transition-colors cursor-pointer"
                                onClick={() => setChartZoom(chartZoom === chart.filename ? null : chart.filename)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setChartZoom(chartZoom === chart.filename ? null : chart.filename); }}
                            >
                                <div className="px-4 py-2 bg-slate-50 dark:bg-[var(--accent-primary)]/5 border-b border-slate-200 dark:border-[var(--accent-primary)]/10">
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{chart.name}</p>
                                </div>
                                <div className="p-2 bg-white dark:bg-[var(--dark-bg)]">
                                    <Image src={`${API_URL}${chart.url}`} alt={chart.name} width={800} height={600} unoptimized className="w-full h-auto rounded" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Page ────────────────────────────────────────────────────────────
export default function ModelTrainingPage() {
    const router = useRouter();
    const { loading, paramsOpen, setParamsOpen, activeTab, setActiveTab, params, setParams, status, results, chartZoom, setChartZoom, handleStart, formatDuration } = useTrainingSession();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <RefreshCw className="animate-spin text-[var(--accent-primary)] mx-auto mb-4" size={40} />
                    <p className="text-slate-500 dark:text-slate-400">Loading training configuration...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.push('/dashboard/engineer')}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-[var(--accent-primary)]/10 rounded-lg transition-colors">
                        <ArrowLeft size={20} className="text-slate-500 dark:text-slate-400" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                            <div className="p-2 bg-gradient-to-br from-purple-500/20 to-[var(--accent-primary)]/20 dark:from-purple-500/15 dark:to-[var(--accent-primary)]/15 rounded-xl">
                                <Brain className="text-purple-500 dark:text-[var(--accent-highlight)]" size={24} />
                            </div>
                            LSTM-CNN Model Training
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-1 ml-14">Configure parameters, train model, and analyze results</p>
                    </div>
                </div>
                <StatusBadge statusValue={status.status} />
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-1 p-1 bg-slate-100 dark:bg-[var(--dark-bg)]/80 rounded-xl w-fit">
                {[
                    { id: 'params' as const, icon: SlidersHorizontal, label: 'Parameters & Training' },
                    { id: 'results' as const, icon: BarChart3, label: 'Results & Charts' },
                ].map(({ id, icon: Icon, label }) => (
                    <button key={id} onClick={() => setActiveTab(id)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === id
                            ? 'bg-white dark:bg-[var(--accent-primary)]/20 text-slate-800 dark:text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}>
                        <Icon size={16} /> {label}
                    </button>
                ))}
            </div>

            {activeTab === 'params' && (
                <ParametersTab params={params} setParams={setParams} paramsOpen={paramsOpen} setParamsOpen={setParamsOpen} status={status} handleStart={handleStart} formatDuration={formatDuration} />
            )}
            {activeTab === 'results' && (
                <ResultsTab results={results} chartZoom={chartZoom} setChartZoom={setChartZoom} formatDuration={formatDuration} setActiveTab={setActiveTab} />
            )}

            {/* Chart Zoom Modal */}
            {chartZoom && results?.charts && (
                <div role="presentation" aria-hidden="true"
                    className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
                    onClick={() => setChartZoom(null)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setChartZoom(null); }}>
                    <div role="dialog" aria-modal="true" aria-label="Chart Zoom"
                        className="max-w-5xl w-full bg-white dark:bg-[var(--dark-bg)] rounded-2xl overflow-hidden shadow-2xl"
                        onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                        <div className="px-6 py-4 bg-slate-50 dark:bg-[var(--accent-primary)]/10 flex items-center justify-between border-b border-slate-200 dark:border-[var(--accent-primary)]/10">
                            <p className="font-semibold text-slate-800 dark:text-white">{results.charts.find(c => c.filename === chartZoom)?.name}</p>
                            <button onClick={() => setChartZoom(null)} className="p-1.5 hover:bg-slate-200 dark:hover:bg-[var(--accent-primary)]/20 rounded-lg transition-colors">
                                <XCircle size={20} className="text-slate-500" />
                            </button>
                        </div>
                        <div className="p-4">
                            <Image
                                src={`${API_URL}${results.charts.find(c => c.filename === chartZoom)?.url}`}
                                alt={chartZoom}
                                width={1200} height={800}
                                unoptimized
                                className="w-full h-auto"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

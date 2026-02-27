'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useDashboard } from '@/components/DashboardShell';
import { api } from '@/services/api';
import {
    Radio, RefreshCw, ExternalLink, Clock, Zap, AlertCircle,
    CheckCircle2, XCircle, Play, Link2, Server, Activity, Shield,
    Hash
} from 'lucide-react';

const EXPLORER = 'https://sepolia.explorer.zksync.io';

// ── Module-level helpers ────────────────────────────────────────────
function shortenAddress(addr: string | null | undefined) {
    if (!addr) return '-';
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function formatTimestamp(ts: number) {
    if (!ts) return '-';
    return new Date(ts * 1000).toLocaleString('tr-TR');
}

function getEventBadge(type: string) {
    switch (type) {
        case 'PredictionRequested': return 'bg-[var(--accent-primary)]/15 text-[var(--accent-highlight)]';
        case 'PredictionFulfilled': return 'bg-emerald-500/15 text-emerald-400';
        case 'FailureDetected': return 'bg-red-500/15 text-red-400';
        case 'MaintenanceTaskRequested': return 'bg-amber-500/15 text-amber-400';
        default: return 'bg-white/[0.06] text-white/60';
    }
}

// ── Sub-components (already extracted) ─────────────────────────────
function ContractRow({ name, address, description, icon, extra }: {
    name: string; address: string; description: string; icon: React.ReactNode; extra?: string;
}) {
    return (
        <div className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.03] transition-colors">
            <div className="flex items-center gap-4 min-w-0">
                <div className="p-2 bg-white/[0.04] rounded-lg text-white/40">{icon}</div>
                <div className="min-w-0">
                    <p className="font-medium text-white text-sm">{name}</p>
                    <p className="text-xs text-white/40 mt-0.5">{description}</p>
                    {extra && <p className="text-xs text-white/30 mt-0.5 font-mono">{extra}</p>}
                </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                <code className="text-xs font-mono text-white/40 hidden sm:block">{shortenAddress(address)}</code>
                <a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-[var(--accent-primary)]/15 text-[var(--accent-highlight)] rounded-lg text-xs font-medium hover:bg-[var(--accent-primary)]/25 transition-colors flex items-center gap-1">
                    Explorer <ExternalLink size={12} />
                </a>
            </div>
        </div>
    );
}

function InfoCard({ label, value, sub, highlight }: {
    label: string; value: string | number; sub: string; highlight?: boolean;
}) {
    return (
        <div className={`relative rounded-xl border p-4 ${highlight ? 'bg-amber-500/10 border-amber-500/20' : 'bg-white/[0.02] border-white/[0.07]'}`}>
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{label}</span>
            <p className="font-bold text-white text-xl mt-1">{value}</p>
            <p className={`text-xs mt-1 ${highlight ? 'text-amber-400 font-medium' : 'text-white/30'}`}>{sub}</p>
        </div>
    );
}

const ContractsSection: React.FC<any> = ({ data, activeConsumer, oracleInfo, onChain }) => (
    data.contracts ? (
        <div className="relative rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
            <div className="absolute top-0 left-0 w-10 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
            <div className="absolute top-0 left-0 h-10 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
            <div className="p-6 border-b border-white/[0.07]">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[var(--accent-primary)]/15 rounded-xl">
                        <Link2 className="w-5 h-5 text-[var(--accent-highlight)]" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white">Smart Contracts</h2>
                        <p className="text-sm text-white/40">
                            zkSync Era Sepolia (Chain {data.contracts.chain_id})
                            {activeConsumer === 'BackendOracleConsumer' && (
                                <span className="ml-2 px-2 py-0.5 bg-emerald-500/15 text-emerald-400 rounded-full text-xs font-medium">Backend Oracle Active</span>
                            )}
                        </p>
                    </div>
                </div>
            </div>
            <div className="divide-y divide-white/[0.04]">
                {data.contracts.contracts.BackendOracleConsumer?.address && (
                    <ContractRow name="BackendOracleConsumer" address={data.contracts.contracts.BackendOracleConsumer.address}
                        description="Receives prediction requests and forwards fulfillments" icon={<Server className="w-4 h-4" />}
                        extra={oracleInfo.trusted_oracle ? `Trusted Oracle: ${shortenAddress(oracleInfo.trusted_oracle)}` : undefined} />
                )}
                {data.contracts.contracts.ChainlinkPdMAutomation?.address && (
                    <ContractRow name="ChainlinkPdMAutomation" address={data.contracts.contracts.ChainlinkPdMAutomation.address}
                        description="Orchestrates automated prediction workflows" icon={<Zap className="w-4 h-4" />}
                        extra={onChain.failure_threshold != null ? `Failure Threshold: ${onChain.failure_threshold / 100}%` : undefined} />
                )}
                {data.contracts.linked_contracts?.PdMSystemHybrid && (
                    <ContractRow name="PdMSystemHybrid" address={data.contracts.linked_contracts.PdMSystemHybrid}
                        description="Main PdM system storing ZK proofs" icon={<Shield className="w-4 h-4" />} />
                )}
                {data.contracts.linked_contracts?.AccessControlRegistry && (
                    <ContractRow name="AccessControlRegistry" address={data.contracts.linked_contracts.AccessControlRegistry}
                        description="Role-based access control for nodes" icon={<Shield className="w-4 h-4" />} />
                )}
            </div>
        </div>
    ) : null
);

const EventsTable: React.FC<any> = ({ events }) => (
    <div className="relative rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
        <div className="absolute top-0 left-0 w-10 h-px bg-gradient-to-r from-amber-500 to-transparent" />
        <div className="absolute top-0 left-0 h-10 w-px bg-gradient-to-b from-amber-500 to-transparent" />
        <div className="p-6 border-b border-white/[0.07]">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/15 rounded-xl"><Activity className="w-5 h-5 text-amber-400" /></div>
                    <div><h2 className="text-lg font-bold text-white">Recent Events</h2><p className="text-sm text-white/40">On-chain automation events</p></div>
                </div>
                <span className="text-sm text-white/40">{events.length} events</span>
            </div>
        </div>
        {events.length === 0 ? (
            <div className="p-12 text-center text-white/30">
                <Radio className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">No events found</p>
                <p className="text-sm mt-1">Events will appear here when automation triggers predictions</p>
            </div>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-white/[0.02] border-b border-white/[0.07]">
                        <tr>
                            {['Event', 'Block', 'Details', 'TX'].map(h => (
                                <th key={h} className="px-6 py-3 text-left text-[10px] font-bold text-white/30 uppercase tracking-widest">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                        {events.map((evt: any) => (
                            <tr key={evt.tx_hash} className="hover:bg-white/[0.03] transition-colors">
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getEventBadge(evt.type)}`}>{evt.type}</span>
                                </td>
                                <td className="px-6 py-4"><span className="font-mono text-sm text-white/60">{evt.block?.toLocaleString()}</span></td>
                                <td className="px-6 py-4 text-sm text-white/60">
                                    {evt.machine_id != null && <span className="mr-3">Machine #{evt.machine_id}</span>}
                                    {evt.confidence != null && <span className="text-white/40">Conf: {evt.confidence / 100}%</span>}
                                    {evt.prediction != null && (
                                        <span className={`ml-2 px-1.5 py-0.5 rounded text-xs font-medium ${evt.prediction === 1 ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                                            {evt.prediction === 1 ? 'FAILURE' : 'NORMAL'}
                                        </span>
                                    )}
                                    {evt.request_id && !evt.machine_id && <code className="text-xs font-mono text-white/30">{evt.request_id.slice(0, 16)}...</code>}
                                    {evt.timestamp && <span className="ml-2 text-xs text-white/30">{formatTimestamp(evt.timestamp)}</span>}
                                </td>
                                <td className="px-6 py-4">
                                    <a href={`${EXPLORER}/tx/0x${evt.tx_hash}`} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[var(--accent-highlight)] hover:underline text-xs font-mono">
                                        {evt.tx_hash?.slice(0, 10)}...<ExternalLink size={12} />
                                    </a>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </div>
);

// ── Custom Hook ─────────────────────────────────────────────────────
function useAutomationData() {
    const { user } = useDashboard();
    const [state, setState] = useState({
        flags: {
            loading: true, refreshing: false, triggering: false,
            restarting: false, triggerResult: null as string | null,
        },
        data: {
            contracts: null as any,
            listenerStatus: null as any,
            automationStatus: null as any,
            events: [] as any[],
        }
    });

    const setFlags = useCallback((action: React.SetStateAction<typeof state.flags>) => {
        setState(prev => ({ ...prev, flags: typeof action === 'function' ? action(prev.flags) : action }));
    }, []);

    const { flags, data } = state;

    const fetchAll = useCallback(async () => {
        let contractsData = null;
        let listenerData = null;
        let statusData = null;
        let eventsData: any = { events: [] };

        try {
            [contractsData, listenerData, statusData, eventsData] = await Promise.all([
                api.getChainlinkContracts().catch(() => null),
                api.getListenerStatus().catch(() => null),
                api.getAutomationStatus().catch(() => null),
                api.getChainlinkEvents(20).catch(() => ({ events: [] })),
            ]);
        } catch (e) {
            console.error('Failed to fetch automation data', e);
        }
        return { contractsData, listenerData, statusData, eventsData };
    }, []);

    const applyFetchResult = useCallback(({ contractsData, listenerData, statusData, eventsData }: any) => {
        setState(prev => ({
            ...prev,
            data: { contracts: contractsData, listenerStatus: listenerData, automationStatus: statusData, events: eventsData?.events || [] },
            flags: { ...prev.flags, loading: false, refreshing: false },
        }));
    }, []);

    useEffect(() => {
        const load = () => fetchAll().then(applyFetchResult);
        load();
        const interval = setInterval(load, 15000);
        return () => clearInterval(interval);
    }, [fetchAll, applyFetchResult]);

    const handleRefresh = () => { setFlags(prev => ({ ...prev, refreshing: true })); fetchAll().then(applyFetchResult); };

    const handleTriggerPrediction = async () => {
        if (!user?.address) return;
        setFlags(prev => ({ ...prev, triggering: true, triggerResult: null }));
        try {
            const result = await api.triggerManualPrediction(user.address);
            let msg = 'Trigger failed';
            if (result) {
                if (result.success) { msg = 'Prediction triggered successfully'; }
            }
            setFlags(prev => ({ ...prev, triggerResult: msg }));
            setTimeout(() => fetchAll().then(applyFetchResult), 3000);
        } catch (e: any) {
            let errMsg = 'Failed to trigger prediction';
            if (e) { if (e.message) { errMsg = e.message; } }
            setFlags(prev => ({ ...prev, triggerResult: errMsg }));
        }
        setFlags(prev => ({ ...prev, triggering: false }));
        setTimeout(() => setFlags(prev => ({ ...prev, triggerResult: null })), 5000);
    };

    const handleRestartListener = async () => {
        setFlags(prev => ({ ...prev, restarting: true }));
        try { await api.restartListener(); setTimeout(() => fetchAll().then(applyFetchResult), 2000); }
        catch (e: any) { console.error('Restart failed:', e); }
        setFlags(prev => ({ ...prev, restarting: false }));
    };

    const onChain = data.contracts?.on_chain_status || {};
    const oracleInfo = data.contracts?.oracle_info || {};
    const activeConsumer = data.contracts?.active_consumer || 'Unknown';

    return { flags, data, onChain, oracleInfo, activeConsumer, handleRefresh, handleTriggerPrediction, handleRestartListener };
}

// ── Status Cards ────────────────────────────────────────────────────
interface StatusCardsProps {
    data: any;
    onChain: any;
    oracleInfo: any;
    activeConsumer: string;
}

function AutomationStatusCards({ data, onChain, oracleInfo, activeConsumer }: StatusCardsProps) {
    return (
        <>
            {/* Row 1: overview cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="relative rounded-xl border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 p-5 overflow-hidden">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-[var(--accent-primary)]/10 rounded-full blur-2xl" />
                    <div className="text-white/40 text-sm font-medium mb-1">Listener Node</div>
                    <div className="text-2xl font-bold text-white">{data.listenerStatus?.status === 'running' ? 'Active' : 'Offline'}</div>
                    <div className="mt-3 flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${data.listenerStatus?.status === 'running' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
                        <span className="text-xs text-white/40">
                            {data.listenerStatus?.uptime ? `Uptime: ${(data.listenerStatus.uptime / 3600).toFixed(1)}h` : 'Waiting for connection'}
                        </span>
                    </div>
                </div>
                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-5 overflow-hidden">
                    <div className="text-white/40 text-sm font-medium mb-1">Contract Status</div>
                    <div className="text-2xl font-bold text-white">{onChain.can_exec ? 'Ready' : 'Waiting'}</div>
                    <div className="mt-3 flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${onChain.can_exec ? 'bg-[var(--accent-primary)] shadow-[0_0_8px_var(--accent-primary)]' : 'bg-amber-500'}`} />
                        <span className="text-xs text-white/40">Upkeep check</span>
                    </div>
                </div>
                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-5 overflow-hidden">
                    <div className="text-white/40 text-sm font-medium mb-1">Link Balance</div>
                    <div className="text-2xl font-bold text-white flex items-center gap-1">
                        {oracleInfo.link_balance ? Number(oracleInfo.link_balance).toFixed(2) : '0.00'}
                        <span className="text-sm text-[var(--accent-primary)]">LINK</span>
                    </div>
                    <div className="mt-3 text-xs text-white/40">Registry balance</div>
                </div>
                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-5 overflow-hidden">
                    <div className="text-white/40 text-sm font-medium mb-1">Forwarder</div>
                    <div className="text-sm font-mono text-white pt-1">
                        {activeConsumer !== 'Unknown' ? `${activeConsumer.substring(0, 6)}...${activeConsumer.substring(activeConsumer.length - 4)}` : 'Not deployed'}
                    </div>
                    <div className="mt-4 text-xs text-white/40">Active consumer</div>
                </div>
            </div>

            {/* Row 2: detail cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
                    <div className="absolute top-0 left-0 w-6 h-px bg-gradient-to-r from-emerald-500 to-transparent" />
                    <div className="absolute top-0 left-0 h-6 w-px bg-gradient-to-b from-emerald-500 to-transparent" />
                    <div className="flex items-center gap-2 mb-3">
                        <Radio className={`w-4 h-4 ${data.listenerStatus?.running ? 'text-emerald-400' : 'text-white/30'}`} />
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Listener</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {data.listenerStatus?.running ? (
                            <>
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                                </span>
                                <span className="font-bold text-emerald-400 text-lg">Running</span>
                            </>
                        ) : (
                            <><XCircle className="w-4 h-4 text-red-400" /><span className="font-bold text-red-400 text-lg">Stopped</span></>
                        )}
                    </div>
                    {data.listenerStatus?.poll_interval && (
                        <p className="text-xs text-white/30 mt-2">Poll: every {data.listenerStatus.poll_interval}s</p>
                    )}
                </div>
                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
                    <div className="absolute top-0 left-0 w-6 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                    <div className="absolute top-0 left-0 h-6 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
                    <div className="flex items-center gap-2 mb-3">
                        <Clock className="w-4 h-4 text-white/30" />
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">On-Chain Pending</span>
                    </div>
                    <p className="font-bold text-white text-2xl">{onChain.pending_to_process ?? data.automationStatus?.pending_predictions ?? '-'}</p>
                    <p className="text-xs text-white/30 mt-2">Predictions to process</p>
                </div>
                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
                    <div className="absolute top-0 left-0 w-6 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                    <div className="absolute top-0 left-0 h-6 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
                    <div className="flex items-center gap-2 mb-3">
                        <Activity className="w-4 h-4 text-[var(--accent-highlight)]" />
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Total Requests</span>
                    </div>
                    <p className="font-bold text-white text-2xl">{oracleInfo.request_count ?? '-'}</p>
                    <p className="text-xs text-white/30 mt-2">Oracle prediction requests</p>
                </div>
                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
                    <div className="absolute top-0 left-0 w-6 h-px bg-gradient-to-r from-red-500 to-transparent" />
                    <div className="absolute top-0 left-0 h-6 w-px bg-gradient-to-b from-red-500 to-transparent" />
                    <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className="w-4 h-4 text-red-400" />
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Failures</span>
                    </div>
                    <p className="font-bold text-red-400 text-2xl">{data.automationStatus?.failures_detected ?? '-'}</p>
                    <p className="text-xs text-white/30 mt-2">Total failures detected</p>
                </div>
            </div>
        </>
    );
}

// ── Page ────────────────────────────────────────────────────────────
export default function AutomationPage() {
    const { flags, data, onChain, oracleInfo, activeConsumer, handleRefresh, handleTriggerPrediction, handleRestartListener } = useAutomationData();

    if (flags.loading) {
        return (
            <div className="space-y-6 animate-fade-in-up">
                <div className="animate-pulse space-y-6">
                    <div className="h-8 bg-white/[0.06] rounded w-1/3" />
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {['skel1', 'skel2', 'skel3', 'skel4'].map(id => <div key={id} className="h-28 bg-white/[0.04] rounded-xl" />)}
                    </div>
                    <div className="h-64 bg-white/[0.04] rounded-xl" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in-up">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30">
                            <Link2 className="text-[var(--accent-highlight)]" size={22} />
                        </div>
                        Chainlink Automation
                    </h1>
                    <p className="text-white/40 mt-1">Backend Oracle event listener & on-chain automation status</p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={flags.refreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08] text-white/60 rounded-lg transition-colors"
                >
                    <RefreshCw size={16} className={flags.refreshing ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            <AutomationStatusCards data={data} onChain={onChain} oracleInfo={oracleInfo} activeConsumer={activeConsumer} />

            <ContractsSection data={data} activeConsumer={activeConsumer} oracleInfo={oracleInfo} onChain={onChain} />

            {(onChain.sensor_interval || onChain.report_interval) && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <InfoCard label="Sensor Interval" value={onChain.sensor_interval ? `${onChain.sensor_interval}s` : '-'} sub={onChain.sensor_due ? 'Sensor collection due' : 'Not due yet'} highlight={onChain.sensor_due} />
                    <InfoCard label="Report Interval" value={onChain.report_interval ? `${onChain.report_interval}s` : '-'} sub={onChain.report_due ? 'Report generation due' : 'Not due yet'} highlight={onChain.report_due} />
                    <InfoCard label="Processed" value={onChain.processed_count ?? '-'} sub="Total predictions processed" />
                    <InfoCard label="Last Block" value={data.listenerStatus?.last_processed_block?.toLocaleString() || '-'} sub="Last processed block" />
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
                <button
                    onClick={handleTriggerPrediction}
                    disabled={flags.triggering}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/80 text-white rounded-lg transition-colors font-medium shadow-lg shadow-[var(--accent-primary)]/20 disabled:opacity-50"
                >
                    <Play size={16} /> {flags.triggering ? 'Triggering...' : 'Trigger Prediction'}
                </button>
                <button
                    onClick={handleRestartListener}
                    disabled={flags.restarting}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08] text-white/60 rounded-lg transition-colors font-medium disabled:opacity-50"
                >
                    <RefreshCw size={16} className={flags.restarting ? 'animate-spin' : ''} /> {flags.restarting ? 'Restarting...' : 'Restart Listener'}
                </button>
                {flags.triggerResult && (
                    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ${flags.triggerResult.includes('success') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {flags.triggerResult.includes('success') ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                        {flags.triggerResult}
                    </div>
                )}
            </div>

            <EventsTable events={data.events} />
        </div>
    );
}

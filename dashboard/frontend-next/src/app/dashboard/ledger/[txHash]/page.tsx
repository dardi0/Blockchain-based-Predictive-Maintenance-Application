'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/services/api';
import { ArrowLeft, ExternalLink, Copy, Check, Clock, Fuel, Box, User, FileCode, Layers, Brain, AlertTriangle, Activity, Shield } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────
interface TransactionDetails {
    txHash: string;
    status: string;
    blockNumber: number;
    blockHash: string;
    timestamp: number;
    timestampISO: string;
    from: string;
    to: string;
    value: string;
    gasLimit: number;
    gasUsed: number;
    gasPrice: string;
    effectiveGasPrice: string;
    fee: string;
    nonce: number;
    transactionIndex: number;
    type: number;
    chainId: number;
    inputData: string;
    inputDataLength: number;
    decodedInput: {
        functionName: string;
        functionSignature: string | null;
        parameters: { name: string; type: string; value: any; arrayLength?: number }[];
        raw: boolean;
        error?: string;
    } | null;
    isL1Originated: boolean;
    receivedAt: string;
    gasPerPubdata: number;
    l1CommitTxHash: string | null;
    l1ProveTxHash: string | null;
    l1ExecuteTxHash: string | null;
    l1BatchNumber: number | null;
    l1BatchTxIndex: number | null;
    events: any[];
    eventsCount: number;
    explorerUrl: string;
    predictionInfo?: {
        recordId: number;
        prediction: number;
        probability: number;
        reason: string | null;
        hasPredictionProof: boolean;
        predictionTxHash: string | null;
    } | null;
}

type TxStatus = { loading: boolean; error: string | null; details: TransactionDetails | null };
type TxUI = { activeTab: 'overview' | 'logs' | 'input'; copied: string | null; showRaw: boolean };

// ── Helpers ────────────────────────────────────────────────────────
function getStatusColor(s: string) {
    switch (s.toLowerCase()) {
        case 'verified': case 'included': case 'success':
            return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400';
        case 'pending':
            return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
        case 'failed':
            return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
        default:
            return 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
    }
}

function formatAddress(addr: string) {
    if (!addr) return '-';
    return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
}

// ── Custom Hook ────────────────────────────────────────────────────
function useTransactionDetails(txHash: string) {
    const [ui, setUI] = useState<TxUI>({ activeTab: 'overview', copied: null, showRaw: false });

    const { data: details, isLoading: loading, error: queryError } = useQuery<TransactionDetails>({
        queryKey: ['transaction', txHash],
        queryFn: () => api.getTransactionDetails(txHash) as unknown as Promise<TransactionDetails>,
        enabled: !!txHash,
        staleTime: 60_000,
        retry: 1,
    });

    const error = queryError ? (queryError as Error).message || 'Failed to fetch transaction details' : null;

    const copyToClipboard = (text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setUI(prev => ({ ...prev, copied: key }));
        setTimeout(() => setUI(prev => ({ ...prev, copied: null })), 2000);
    };

    return { loading, error, details: details ?? null, ui, setUI, copyToClipboard };
}


// ── Sub-components ─────────────────────────────────────────────────
function TxPageHeader({ details, onBack, onPredictionClick }: {
    details: TransactionDetails;
    onBack: () => void;
    onPredictionClick: () => void;
}) {
    const hasPredictionTx = !!details.predictionInfo?.predictionTxHash;
    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                <button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                    <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Transaction Details</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-mono mt-1">{formatAddress(details.txHash)}</p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                {hasPredictionTx && (
                    <button onClick={onPredictionClick} className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-sm text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/40 transition-colors">
                        <Brain size={14} /> Prediction Details
                    </button>
                )}
                <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${getStatusColor(details.status)}`}>{details.status}</span>
                <a href={details.explorerUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                    <ExternalLink size={14} /> View on Explorer
                </a>
            </div>
        </div>
    );
}

function PredictionInfoCard({ details, onPredictionClick }: { details: TransactionDetails; onPredictionClick: () => void }) {
    const info = details.predictionInfo!;
    return (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-xl border border-purple-200 dark:border-purple-700/50 p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
                        <Shield size={20} className="text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-800 dark:text-white">AI Prediction Analysis</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Record #{info.recordId}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Status</p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${info.prediction === 1 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'}`}>
                            {info.prediction === 1 ? <><AlertTriangle size={12} /> Failure</> : <><Activity size={12} /> Normal</>}
                        </span>
                    </div>
                    <div className="text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Confidence</p>
                        <p className="font-semibold text-slate-800 dark:text-white">{((info.probability || 0) * 100).toFixed(1)}%</p>
                    </div>
                    <div className="text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400">On-Chain Proof</p>
                        {info.hasPredictionProof ? (
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-sm font-medium"><Check size={14} /> Verified</span>
                        ) : (
                            <span className="text-amber-600 dark:text-amber-400 text-sm">Pending</span>
                        )}
                    </div>
                    {info.predictionTxHash && (
                        <button onClick={onPredictionClick} className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm">
                            <Brain size={14} /> View Prediction TX
                        </button>
                    )}
                </div>
            </div>
            {info.reason && (
                <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-700/50">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Analysis Reason</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{info.reason}</p>
                </div>
            )}
        </div>
    );
}

const CopyBtn = ({ text, id, copied, copyToClipboard }: { text: string; id: string; copied: string | null; copyToClipboard: (text: string, key: string) => void }) => (
    <button onClick={() => copyToClipboard(text, id)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
        {copied === id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-slate-400" />}
    </button>
);

const Row = ({ label, children }: { label: React.ReactNode; children: React.ReactNode }) => (
    <div className="flex items-center justify-between px-6 py-4">
        <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">{label}</span>
        <div className="flex items-center gap-2">{children}</div>
    </div>
);

function OverviewTab({ details, copied, copyToClipboard }: {
    details: TransactionDetails;
    copied: string | null;
    copyToClipboard: (text: string, key: string) => void;
}) {
    return (
        <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            <Row label={<><FileCode size={16} /> Transaction Hash</>}>
                <code className="font-mono text-sm text-slate-800 dark:text-slate-200">{details.txHash}</code>
                <CopyBtn text={details.txHash} id="txHash" copied={copied} copyToClipboard={copyToClipboard} />
            </Row>
            <Row label={<><Box size={16} /> Block</>}>
                <span className="font-medium text-slate-800 dark:text-slate-200">{details.blockNumber?.toLocaleString()}</span>
            </Row>
            <Row label={<><Clock size={16} /> Timestamp</>}>
                <span className="text-slate-800 dark:text-slate-200">{details.timestampISO || details.receivedAt || '-'}</span>
            </Row>
            <Row label={<><User size={16} /> From</>}>
                <code className="font-mono text-sm text-slate-800 dark:text-slate-200">{details.from}</code>
                <CopyBtn text={details.from} id="from" copied={copied} copyToClipboard={copyToClipboard} />
            </Row>
            <Row label={<><User size={16} /> To (Contract)</>}>
                <code className="font-mono text-sm text-slate-800 dark:text-slate-200">{details.to}</code>
                <CopyBtn text={details.to} id="to" copied={copied} copyToClipboard={copyToClipboard} />
            </Row>
            <Row label="Value">
                <span className="font-medium text-slate-800 dark:text-slate-200">{details.value} ETH</span>
            </Row>
            <Row label={<><Fuel size={16} /> Transaction Fee</>}>
                <span className="font-medium text-slate-800 dark:text-slate-200">{details.fee} ETH</span>
            </Row>
            <Row label="Gas Limit / Used">
                <span className="text-slate-800 dark:text-slate-200">
                    {details.gasLimit?.toLocaleString()} / {details.gasUsed?.toLocaleString()}
                    <span className="text-slate-500 ml-1">({((details.gasUsed / details.gasLimit) * 100).toFixed(1)}%)</span>
                </span>
            </Row>
            <Row label="Gas Price"><span className="text-slate-800 dark:text-slate-200">{details.gasPrice} ETH</span></Row>
            <Row label="Nonce"><span className="text-slate-800 dark:text-slate-200">{details.nonce}</span></Row>
            <Row label="Transaction Type"><span className="text-slate-800 dark:text-slate-200">EIP-1559 (Type {details.type})</span></Row>
            <Row label="Chain"><span className="text-slate-800 dark:text-slate-200">zkSync Sepolia (ID: {details.chainId})</span></Row>
            <Row label="L1 Originated"><span className="text-slate-800 dark:text-slate-200">{details.isL1Originated ? 'Yes' : 'No'}</span></Row>
            {details.l1BatchNumber && (
                <Row label="L1 Batch"><span className="text-slate-800 dark:text-slate-200">#{details.l1BatchNumber}</span></Row>
            )}
        </div >
    );
}

function LogsTab({ events }: { events: any[] }) {
    if (events.length === 0) return <p className="text-center text-slate-500 dark:text-slate-400 py-8">No events emitted</p>;
    return (
        <div className="space-y-4">
            {events.map((event, idx) => (
                <div key={`event-${event.logIndex ?? idx}`} className="bg-slate-50 dark:bg-[var(--dark-bg)]/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3 mb-3">
                        <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded text-xs font-medium">Log #{event.logIndex}</span>
                        <code className="text-xs font-mono text-slate-600 dark:text-slate-400">{event.address}</code>
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Topics:</p>
                        {event.topics.map((topic: string, i: number) => (
                            <code key={topic} className="block text-xs font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 p-2 rounded break-all">
                                [{i}] {topic}
                            </code>
                        ))}
                        {event.data && event.data !== '0x' && (
                            <>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-3">Data:</p>
                                <code className="block text-xs font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 p-2 rounded break-all max-h-24 overflow-y-auto">{event.data}</code>
                            </>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

function InputDataTab({ details, showRaw, copied, setShowRaw, copyToClipboard }: {
    details: TransactionDetails;
    showRaw: boolean;
    copied: string | null;
    setShowRaw: (v: boolean) => void;
    copyToClipboard: (text: string, key: string) => void;
}) {
    const decoded = details.decodedInput;
    return (
        <div className="space-y-6">
            {decoded && !decoded.raw && (
                <div className="bg-slate-50 dark:bg-[var(--dark-bg)]/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-slate-500 dark:text-slate-400">Function</span>
                        <button onClick={() => setShowRaw(!showRaw)} className="px-3 py-1 text-xs bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                            {showRaw ? 'View decoded' : 'Show original input'}
                        </button>
                    </div>
                    <code className="block text-sm font-mono text-indigo-600 dark:text-indigo-400 break-all">{decoded.functionSignature}</code>
                </div>
            )}

            {decoded && !decoded.raw && !showRaw && (
                <div className="bg-white dark:bg-[var(--dark-bg)]/50 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-700/50">
                            <tr>
                                {['#', 'NAME', 'TYPE', 'DATA'].map(h => (
                                    <th key={h} className="px-4 py-3 text-left text-slate-600 dark:text-slate-300 font-medium">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {decoded.parameters.map((param, idx) => (
                                <tr key={`param-${param.name ?? idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{idx}</td>
                                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{param.name}</td>
                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{param.type}</td>
                                    <td className="px-4 py-3">
                                        {Array.isArray(param.value) && param.value.length > 0 ? (
                                            <code className="font-mono text-xs text-slate-700 dark:text-slate-300 break-all">
                                                [{param.value.map((v: any) => typeof v === 'string' ? v : v.toString()).join(', ')}]
                                            </code>
                                        ) : Array.isArray(param.value) ? null : (
                                            <code className="font-mono text-xs text-slate-700 dark:text-slate-300 break-all">
                                                {typeof param.value === 'string' ? param.value : param.value?.toString()}
                                            </code>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {(!decoded || decoded.raw || showRaw) && (
                <>
                    <div className="flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Input Data Length</span>
                        <span className="text-slate-800 dark:text-slate-200">{details.inputDataLength} bytes</span>
                    </div>
                    <div className="bg-slate-50 dark:bg-[var(--dark-bg)]/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                        <code className="block text-xs font-mono text-slate-600 dark:text-slate-400 break-all whitespace-pre-wrap max-h-96 overflow-y-auto">{details.inputData}</code>
                    </div>
                </>
            )}

            <button
                onClick={() => copyToClipboard(details.inputData, 'input')}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
                {copied === 'input' ? <Check size={16} /> : <Copy size={16} />}
                {copied === 'input' ? 'Copied!' : 'Copy Input Data'}
            </button>
        </div>
    );
}

// ── Page ───────────────────────────────────────────────────────────
export default function TransactionDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const txHash = params.txHash as string;

    const { loading, error, details, ui, setUI, copyToClipboard } = useTransactionDetails(txHash);
    const { activeTab, copied, showRaw } = ui;

    const handlePredictionClick = () => {
        if (details?.predictionInfo?.predictionTxHash) {
            router.push(`/dashboard/ledger/${details.predictionInfo.predictionTxHash}`);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-500 dark:text-slate-400">Loading transaction details...</p>
                </div>
            </div>
        );
    }

    if (error || !details) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-500 mb-4">{error || 'Transaction not found'}</p>
                    <button onClick={() => router.back()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Go Back</button>
                </div>
            </div>
        );
    }

    const TABS = [
        { id: 'overview' as const, label: 'Overview', icon: Box },
        { id: 'logs' as const, label: `Logs (${details.eventsCount})`, icon: Layers },
        { id: 'input' as const, label: 'Input Data', icon: FileCode },
    ];

    return (
        <div className="space-y-6 p-6">
            <TxPageHeader details={details} onBack={() => router.back()} onPredictionClick={handlePredictionClick} />

            {details.predictionInfo && <PredictionInfoCard details={details} onPredictionClick={handlePredictionClick} />}

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 dark:bg-[var(--dark-bg)] p-1 rounded-lg w-fit">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setUI(prev => ({ ...prev, activeTab: tab.id }))}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab.id
                            ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-md rounded-xl border border-slate-200/50 dark:border-slate-700/50 shadow-sm overflow-hidden">
                {activeTab === 'overview' && (
                    <OverviewTab details={details} copied={copied} copyToClipboard={copyToClipboard} />
                )}
                {activeTab === 'logs' && (
                    <div className="p-6">
                        <LogsTab events={details.events} />
                    </div>
                )}
                {activeTab === 'input' && (
                    <div className="p-6">
                        <InputDataTab
                            details={details}
                            showRaw={showRaw}
                            copied={copied}
                            setShowRaw={(v) => setUI(prev => ({ ...prev, showRaw: v }))}
                            copyToClipboard={copyToClipboard}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

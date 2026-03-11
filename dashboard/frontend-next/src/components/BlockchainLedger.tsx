'use client';

import React, { useState, useMemo, memo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MaintenanceRecord, PredictionInfo, BatchSubmission } from '../types';
import { Link as LinkIcon, CheckCircle, ChevronRight, ChevronLeft, Clock, Database, Shield, Brain, AlertTriangle, Search, Layers, XCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';

interface BlockchainLedgerProps {
    records: MaintenanceRecord[];
}

const ITEMS_PER_PAGE = 15;

// ─── Batch submission sub-table ───────────────────────────────────────────────

function batchStatusBadge(status: BatchSubmission['status']) {
    if (status === 'SUCCESS') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <CheckCircle2 size={11} /> Success
            </span>
        );
    }
    if (status === 'FAILED') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 border border-red-500/20 text-red-400">
                <XCircle size={11} /> Failed
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Clock size={11} /> Pending
        </span>
    );
}

function BatchSubmissionsTable() {
    const [submissions, setSubmissions] = useState<BatchSubmission[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const apply = (data: { count: number; submissions: BatchSubmission[] }) => {
            setSubmissions(data.submissions);
            setLoading(false);
        };
        const applyErr = () => { setLoading(false); };
        api.getBatchSubmissions(50).then(apply).catch(applyErr);
    }, []);

    if (loading) {
        return <div className="p-8 text-center text-white/30 animate-pulse">Loading batch submissions…</div>;
    }

    if (submissions.length === 0) {
        return (
            <div className="p-8 text-center text-white/30">
                Henüz batch submission yok.
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
            <table className="w-full text-left">
                <thead className="border-b border-white/[0.07] bg-white/[0.02]">
                    <tr>
                        {['Batch ID', 'Type', 'Records', 'Merkle Root', 'TX Hash', 'Gas Used', 'Status', 'Created'].map(h => (
                            <th key={h} className="px-5 py-4 text-[10px] font-bold text-white/30 uppercase tracking-widest">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                    {submissions.map(sub => {
                        const rootShort = sub.merkle_root.length > 12
                            ? sub.merkle_root.slice(0, 8) + '…' + sub.merkle_root.slice(-6)
                            : sub.merkle_root;
                        const txShort = sub.tx_hash
                            ? sub.tx_hash.slice(0, 8) + '…' + sub.tx_hash.slice(-6)
                            : '—';
                        const gasLabel = sub.gas_used ? sub.gas_used.toLocaleString() : '—';
                        const createdLabel = new Date(sub.created_at).toLocaleString();
                        return (
                            <tr key={sub.id} className="hover:bg-white/[0.02] transition-all">
                                <td className="px-5 py-3 font-mono text-sm text-white/40">#{sub.id}</td>
                                <td className="px-5 py-3">
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--accent-primary)]/10 text-[var(--accent-highlight)] border border-[var(--accent-primary)]/20">
                                        {sub.batch_type}
                                    </span>
                                </td>
                                <td className="px-5 py-3 text-sm font-mono text-white/60">{sub.record_count}</td>
                                <td className="px-5 py-3 font-mono text-xs text-white/30" title={sub.merkle_root}>{rootShort}</td>
                                <td className="px-5 py-3 font-mono text-xs">
                                    {sub.tx_hash ? (
                                        <a
                                            href={'https://sepolia.explorer.zksync.io/tx/' + sub.tx_hash}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[var(--accent-highlight)] hover:underline"
                                            title={sub.tx_hash}
                                        >
                                            {txShort}
                                        </a>
                                    ) : (
                                        <span className="text-white/20">—</span>
                                    )}
                                </td>
                                <td className="px-5 py-3 text-xs font-mono text-white/30">{gasLabel}</td>
                                <td className="px-5 py-3">{batchStatusBadge(sub.status)}</td>
                                <td className="px-5 py-3 text-xs text-white/30 font-mono">{createdLabel}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

const BlockchainLedger: React.FC<BlockchainLedgerProps> = ({ records }) => {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'records' | 'batches'>('records');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'verified' | 'pending'>('all');
    const [currentPage, setCurrentPage] = useState(1);

    const stats = useMemo(() => ({
        total: records.length,
        verified: records.filter(r => r.verified).length,
        aiAnalyzed: records.filter(r => r.predictionInfo !== null && r.predictionInfo !== undefined).length,
        failures: records.filter(r => r.predictionInfo?.prediction === 1).length,
    }), [records]);

    const filteredRecords = useMemo(() => {
        return records.filter(record => {
            const matchesSearch = searchQuery === '' ||
                record.machineId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                record.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (record.txHashFull && record.txHashFull.toLowerCase().includes(searchQuery.toLowerCase()));

            const matchesStatus = filterStatus === 'all' ||
                (filterStatus === 'verified' && record.verified) ||
                (filterStatus === 'pending' && !record.verified);

            return matchesSearch && matchesStatus;
        });
    }, [records, searchQuery, filterStatus]);

    const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE);
    const paginatedRecords = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredRecords.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredRecords, currentPage]);

    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, filterStatus]);

    const handleRowClick = (record: MaintenanceRecord) => {
        if (record.txHashFull && record.txHashFull.length > 10) {
            const txHash = record.txHashFull.startsWith('0x') ? record.txHashFull : '0x' + record.txHashFull;
            router.push(`/dashboard/ledger/${txHash}`);
        }
    };

    const getActionBadgeColor = (action: string, predictionInfo?: PredictionInfo | null) => {
        if (predictionInfo?.prediction === 1) {
            return 'bg-red-500/10 text-red-400 border border-red-500/20';
        }
        if (action.includes('Failure')) {
            return 'bg-red-500/10 text-red-400 border border-red-500/20';
        }
        if (action.includes('Prediction') || action.includes('Analysis')) {
            return 'bg-violet-500/10 text-violet-400 border border-violet-500/20';
        }
        if (action.includes('Verified')) {
            return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        }
        return 'bg-[var(--accent-primary)]/10 text-[var(--accent-highlight)] border border-[var(--accent-primary)]/20';
    };

    const getPageNumbers = () => {
        const pages: (number | string)[] = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            if (currentPage <= 3) {
                pages.push(1, 2, 3, 4, '...', totalPages);
            } else if (currentPage >= totalPages - 2) {
                pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
            } else {
                pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
            }
        }
        return pages;
    };

    const statCards = [
        { label: 'Total Records', value: stats.total, icon: Database, color: 'text-[var(--accent-highlight)]', iconBg: 'bg-[var(--accent-primary)]/15', borderAccent: 'from-[var(--accent-primary)]' },
        { label: 'Verified', value: stats.verified, icon: Shield, color: 'text-emerald-400', iconBg: 'bg-emerald-500/15', borderAccent: 'from-emerald-500' },
        { label: 'AI Analyzed', value: stats.aiAnalyzed, icon: Brain, color: 'text-violet-400', iconBg: 'bg-violet-500/15', borderAccent: 'from-violet-500' },
        { label: 'Failures Detected', value: stats.failures, icon: AlertTriangle, color: 'text-red-400', iconBg: 'bg-red-500/15', borderAccent: 'from-red-500' },

    ];

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30">
                    <LinkIcon size={22} className="text-[var(--accent-highlight)]" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-white">Blockchain Ledger</h2>
                    <p className="text-sm text-white/40">Immutable maintenance records on zkSync Era</p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {statCards.map((card) => (
                    <div
                        key={card.label}
                        onClick={card.icon === Layers ? () => setActiveTab('batches') : undefined}
                        className={`group relative p-4 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition-all duration-300 ${card.icon === Layers ? 'cursor-pointer' : ''}`}
                    >
                        <div className={`absolute top-0 left-0 w-8 h-px bg-gradient-to-r ${card.borderAccent} to-transparent`} />
                        <div className={`absolute top-0 left-0 h-8 w-px bg-gradient-to-b ${card.borderAccent} to-transparent`} />
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 ${card.iconBg} rounded-lg flex items-center justify-center`}>
                                <card.icon className={`w-5 h-5 ${card.color}`} />
                            </div>
                            <div>
                                <p className={`text-2xl font-bold ${card.color}`}>
                                    {card.value !== null ? card.value : '→'}
                                </p>
                                <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">{card.label}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tab switcher */}
            <div className="flex gap-2">
                {(['records', 'batches'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize ${activeTab === tab
                            ? 'bg-[var(--accent-primary)] text-white shadow-lg shadow-[var(--accent-primary)]/25'
                            : 'bg-white/[0.03] text-white/40 border border-white/[0.07] hover:bg-white/[0.06] hover:text-white/70'
                            }`}
                    >
                        {tab === 'batches' && <Layers size={14} />}
                        {tab === 'records' ? 'Individual Records' : 'Batch Submissions'}
                    </button>
                ))}
            </div>

            {/* Batch tab */}
            {activeTab === 'batches' && <BatchSubmissionsTable />}

            {/* Records tab — Search and Filter Bar */}
            {activeTab === 'records' && (<>
                {/* Search and Filter Bar */}
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between rounded-xl p-4 border border-white/[0.07] bg-white/[0.02]">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                        <input
                            type="text"
                            placeholder="Search by machine ID, action, or transaction hash..."
                            aria-label="Search transactions"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.07] rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/50 focus:border-[var(--accent-primary)] transition-all"
                        />
                    </div>
                    <div className="flex gap-2">
                        {(['all', 'verified', 'pending'] as const).map((status) => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={`px-4 py-2 rounded-xl font-medium text-sm transition-all capitalize ${filterStatus === status
                                    ? 'bg-[var(--accent-primary)] text-white shadow-lg shadow-[var(--accent-primary)]/25'
                                    : 'bg-white/[0.03] text-white/40 border border-white/[0.07] hover:bg-white/[0.06] hover:text-white/70'
                                    }`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Table */}
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="border-b border-white/[0.07] bg-white/[0.02]">
                            <tr>
                                {['Record ID', 'Machine ID', 'Action', 'Operator Address', 'AI Prediction', 'Timestamp', 'Verification', ''].map((header) => (
                                    <th key={header} className="px-6 py-4 text-[10px] font-bold text-white/30 uppercase tracking-widest">{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                            {paginatedRecords.map((record) => {
                                const hasTransaction = record.txHashFull && record.txHashFull.length > 10;
                                const hasPrediction = record.predictionInfo !== undefined && record.predictionInfo !== null;

                                return (
                                    <tr
                                        key={record.id}
                                        onClick={() => handleRowClick(record)}
                                        className={`transition-all ${hasTransaction
                                            ? 'cursor-pointer hover:bg-[var(--accent-primary)]/5'
                                            : 'hover:bg-white/[0.02]'
                                            }`}
                                    >
                                        <td className="px-6 py-4 font-mono text-sm text-white/30">{record.id}</td>
                                        <td className="px-6 py-4 font-medium text-white">{record.machineId}</td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionBadgeColor(record.action, record.predictionInfo)}`}>
                                                {record.action}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs text-white/30">
                                            {record.operatorAddress && record.operatorAddress !== 'Unknown' ? (
                                                <a
                                                    href={`https://sepolia.explorer.zksync.io/address/${record.operatorAddress}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="hover:text-[var(--accent-highlight)] hover:underline transition-colors"
                                                    title={record.operatorAddress}
                                                >
                                                    {record.operatorAddress.slice(0, 6)}...{record.operatorAddress.slice(-4)}
                                                </a>
                                            ) : (
                                                <span className="text-white/20">Unknown</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {hasPrediction ? (
                                                <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20 w-fit">
                                                    <CheckCircle className="text-emerald-400" size={14} />
                                                    <span className="text-xs font-medium text-emerald-400">Analyzed</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 rounded-full border border-amber-500/20 w-fit">
                                                    <Clock className="text-amber-400" size={12} />
                                                    <span className="text-xs font-medium text-amber-400">Pending</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-white/30 font-mono">
                                            {new Date(record.timestamp).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            {record.verified ? (
                                                <span className="flex items-center gap-1 text-emerald-400 text-sm font-medium">
                                                    <CheckCircle size={16} /> Verified
                                                </span>
                                            ) : (
                                                <span className="text-white/20 text-sm">Pending</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {hasTransaction ? (
                                                <ChevronRight size={18} className="text-white/20" />
                                            ) : (
                                                <span className="text-xs text-white/15">No TX</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {paginatedRecords.length === 0 && (
                        <div className="p-8 text-center text-white/30">
                            {searchQuery || filterStatus !== 'all'
                                ? 'No records match your search criteria.'
                                : 'No records found in the ledger.'}
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-white/30">
                            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredRecords.length)} of {filteredRecords.length} records
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.07] text-white/40 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronLeft size={18} />
                            </button>

                            {getPageNumbers().map((page, idx) => (
                                <button
                                    key={`page-${page}-${String(idx)}`}
                                    onClick={() => typeof page === 'number' && setCurrentPage(page)}
                                    disabled={page === '...'}
                                    className={`min-w-[36px] h-9 rounded-lg font-medium text-sm transition-all ${page === currentPage
                                        ? 'bg-[var(--accent-primary)] text-white shadow-lg shadow-[var(--accent-primary)]/25'
                                        : page === '...'
                                            ? 'text-white/20 cursor-default'
                                            : 'bg-white/[0.03] border border-white/[0.07] text-white/40 hover:bg-white/[0.06]'
                                        }`}
                                >
                                    {page}
                                </button>
                            ))}

                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.07] text-white/40 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                )}
            </>)}
        </div>
    );
};

export default memo(BlockchainLedger);

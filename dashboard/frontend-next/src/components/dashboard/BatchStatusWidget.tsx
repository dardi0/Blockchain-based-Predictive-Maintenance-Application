'use client';

import React, { useState, useEffect } from 'react';
import { Layers, RefreshCw, CheckCircle2, XCircle, Clock, Zap, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';
import { BatchStatusResponse, BatchSubmission } from '../../types';

function statusColor(status: BatchSubmission['status']) {
    if (status === 'SUCCESS') return 'text-emerald-400';
    if (status === 'FAILED') return 'text-red-400';
    return 'text-amber-400';
}

function statusIcon(status: BatchSubmission['status']) {
    if (status === 'SUCCESS') return <CheckCircle2 size={12} className="text-emerald-400" />;
    if (status === 'FAILED') return <XCircle size={12} className="text-red-400" />;
    return <Clock size={12} className="text-amber-400" />;
}

function formatRelativeTime(iso: string | null): string {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
}

function formatNextFlush(intervalSec: number, lastFlushIso: string | null): string {
    if (!lastFlushIso) return 'soon';
    const elapsed = (Date.now() - new Date(lastFlushIso).getTime()) / 1000;
    const remaining = Math.max(0, intervalSec - elapsed);
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm';
    return 'soon';
}

export function BatchStatusWidget() {
    const [status, setStatus] = useState<BatchStatusResponse | null>(null);
    const [flushing, setFlushing] = useState(false);
    const [flashMsg, setFlashMsg] = useState<string | null>(null);
    const [flashType, setFlashType] = useState<'success' | 'error'>('success');

    useEffect(() => {
        const apply = (data: BatchStatusResponse) => { setStatus(data); };
        api.getBatchStatus().then(apply).catch(() => {});
        const iv = setInterval(() => {
            api.getBatchStatus().then(apply).catch(() => {});
        }, 30000);
        return () => clearInterval(iv);
    }, []);

    const handleFlush = () => {
        setFlushing(true);
        const applyFlush = () => {
            setFlushing(false);
            setFlashType('success');
            setFlashMsg('Flush tetiklendi');
            const applyStatus = (d: BatchStatusResponse) => { setStatus(d); };
            api.getBatchStatus().then(applyStatus).catch(() => {});
            setTimeout(() => setFlashMsg(null), 3000);
        };
        const applyError = () => {
            setFlushing(false);
            setFlashType('error');
            setFlashMsg('Flush başarısız');
            setTimeout(() => setFlashMsg(null), 3000);
        };
        api.flushBatch().then(applyFlush).catch(applyError);
    };

    // Compute display values outside JSX (React Compiler uyumu)
    const isRunning = status ? status.sender.running : false;
    const pendingCount = status ? status.pending_sensor_count : 0;
    const maxSize = status ? status.batch_max_size : 64;
    const minSize = status ? status.batch_min_size : 2;
    const lastFlush = status ? status.sender.last_flush : null;
    const totalBatches = status ? status.sender.total_batches : 0;
    const totalRecords = status ? status.sender.total_records : 0;
    const batchInterval = status ? status.batch_interval : 3600;
    const recentSubs: BatchSubmission[] = status ? status.recent_submissions.slice(0, 3) : [];
    const progressPct = Math.min(100, (pendingCount / maxSize) * 100);
    const progressColor = progressPct >= 100 ? 'bg-red-500' : progressPct >= 75 ? 'bg-amber-500' : 'bg-[var(--accent-primary)]';
    const hasEnough = pendingCount >= minSize;
    const nextFlushLabel = formatNextFlush(batchInterval, lastFlush);

    return (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30">
                        <Layers size={14} className="text-[var(--accent-highlight)]" />
                    </div>
                    <span className="text-sm font-semibold text-white">Batch Sender</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${isRunning
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-red-500/10 border-red-500/20 text-red-400'
                        }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                        {isRunning ? 'Running' : 'Stopped'}
                    </span>
                </div>
                <button
                    onClick={handleFlush}
                    disabled={flushing || !status}
                    title="Force flush batch"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/10 text-[var(--accent-highlight)] hover:bg-[var(--accent-primary)]/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <RefreshCw size={12} className={flushing ? 'animate-spin' : ''} />
                    {flushing ? 'Flushing…' : 'Flush Now'}
                </button>
            </div>

            {/* Flash message */}
            {flashMsg && (
                <div className={`px-4 py-2 text-xs font-medium flex items-center gap-1.5 ${flashType === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                    {flashType === 'success' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {flashMsg}
                </div>
            )}

            <div className="p-4 space-y-4">
                {/* Pending progress */}
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-white/40">Pending records</span>
                        <span className="text-xs font-mono font-bold text-white/70">
                            {pendingCount} / {maxSize}
                        </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                            style={{ width: progressPct + '%' }}
                        />
                    </div>
                    {!hasEnough && pendingCount > 0 && (
                        <p className="text-[10px] text-white/25 mt-1">
                            Min {minSize} kayıt gerekli — {minSize - pendingCount} daha
                        </p>
                    )}
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5 text-center">
                        <p className="text-base font-bold text-[var(--accent-highlight)]">{totalBatches}</p>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-white/25 mt-0.5">Batches</p>
                    </div>
                    <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5 text-center">
                        <p className="text-base font-bold text-white/70">{totalRecords}</p>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-white/25 mt-0.5">Records</p>
                    </div>
                    <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5 text-center">
                        <p className="text-base font-bold text-white/70">{nextFlushLabel}</p>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-white/25 mt-0.5">Next Auto</p>
                    </div>
                </div>

                {/* Last flush */}
                <div className="flex items-center gap-1.5 text-xs text-white/30">
                    <Clock size={11} />
                    <span>Last flush: <span className="text-white/50">{formatRelativeTime(lastFlush)}</span></span>
                </div>

                {/* Recent submissions */}
                {recentSubs.length > 0 && (
                    <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/25">Recent Submissions</p>
                        {recentSubs.map((sub) => {
                            const subColor = statusColor(sub.status);
                            const subRoot = sub.merkle_root.length > 10
                                ? sub.merkle_root.slice(0, 6) + '…' + sub.merkle_root.slice(-4)
                                : sub.merkle_root;
                            return (
                                <div key={sub.id} className="flex items-center justify-between rounded-lg px-3 py-2 bg-white/[0.02] border border-white/[0.05]">
                                    <div className="flex items-center gap-2">
                                        {statusIcon(sub.status)}
                                        <span className="text-xs text-white/50 font-mono">{subRoot}</span>
                                        <span className="text-[10px] text-white/25">{sub.record_count} rec</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-bold ${subColor}`}>{sub.status}</span>
                                        <span className="text-[10px] text-white/25">{formatRelativeTime(sub.created_at)}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {status && recentSubs.length === 0 && (
                    <div className="flex items-center gap-2 text-xs text-white/25 py-1">
                        <AlertTriangle size={12} />
                        Henüz batch gönderimi yok
                    </div>
                )}
            </div>
        </div>
    );
}

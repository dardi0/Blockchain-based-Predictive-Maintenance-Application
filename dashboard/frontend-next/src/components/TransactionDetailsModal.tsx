'use client';

import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import styles from './TransactionDetailsModal.module.css';

interface TransactionDetailsModalProps {
    txHash: string;
    onClose: () => void;
}

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
}

interface OverviewTabProps {
    details: TransactionDetails;
    copyToClipboard: (text: string) => void;
    formatAddress: (addr: string) => string;
    gasPercent: (gasUsed: number, gasLimit: number) => string;
    formatEth: (val?: string | number) => string;
    formatTimestamp: (iso?: string, unix?: number) => string;
}

function OverviewTab({ details, copyToClipboard, formatAddress, gasPercent, formatEth, formatTimestamp }: OverviewTabProps) {
    return (
        <div className={styles.overview}>
            <div className={styles.statusRow}>
                <span className={`${styles.statusBadge} ${styles[details.status.toLowerCase()]}`}>
                    {details.status}
                </span>
            </div>

            <div className={styles.row}>
                <span className={styles.fieldLabel}>Transaction Hash</span>
                <div className={styles.valueWithCopy}>
                    <code>{details.txHash}</code>
                    <button onClick={() => copyToClipboard(details.txHash)}>📋</button>
                </div>
            </div>

            <div className={styles.row}>
                <span className={styles.fieldLabel}>Block</span>
                <span>{details.blockNumber != null ? `#${details.blockNumber}` : '-'}</span>
            </div>

            <div className={styles.row}>
                <span className={styles.fieldLabel}>Timestamp</span>
                <span>{formatTimestamp(details.timestampISO || details.receivedAt, details.timestamp)}</span>
            </div>

            <hr className={styles.divider} />

            <div className={styles.row}>
                <span className={styles.fieldLabel}>From</span>
                <div className={styles.valueWithCopy}>
                    <code>{details.from}</code>
                    <button onClick={() => copyToClipboard(details.from)}>📋</button>
                </div>
            </div>

            <div className={styles.row}>
                <span className={styles.fieldLabel}>To (Contract)</span>
                <div className={styles.valueWithCopy}>
                    <code>{details.to}</code>
                    <button onClick={() => copyToClipboard(details.to)}>📋</button>
                </div>
            </div>

            <hr className={styles.divider} />

            <div className={styles.row}>
                <span className={styles.fieldLabel}>Value</span>
                <span>{formatEth(details.value)} ETH</span>
            </div>

            <div className={styles.row}>
                <span className={styles.fieldLabel}>Transaction Fee</span>
                <span>{formatEth(details.fee)} ETH</span>
            </div>

            <div className={styles.row}>
                <span className={styles.fieldLabel}>Gas Limit</span>
                <span>{details.gasLimit != null ? details.gasLimit : '-'}</span>
            </div>

            <div className={styles.row}>
                <span className={styles.fieldLabel}>Gas Used</span>
                <span>
                    {details.gasUsed != null ? details.gasUsed : '-'}
                    {details.gasLimit ? ` (${gasPercent(details.gasUsed, details.gasLimit)})` : ''}
                </span>
            </div>

            <div className={styles.row}>
                <span className={styles.fieldLabel}>Gas Price</span>
                <span>{formatEth(details.gasPrice)} ETH</span>
            </div>

            <hr className={styles.divider} />

            <div className={styles.row}>
                <span className={styles.fieldLabel}>Nonce</span>
                <span>{details.nonce}</span>
            </div>

            <div className={styles.row}>
                <span className={styles.fieldLabel}>Transaction Type</span>
                <span>
                    {details.type === 2 ? 'EIP-1559' : details.type === 0 ? 'Legacy' : `Type ${details.type}`}
                </span>
            </div>

            <div className={styles.row}>
                <span className={styles.fieldLabel}>Chain ID</span>
                <span>zkSync Sepolia ({details.chainId})</span>
            </div>

            <div className={styles.row}>
                <span className={styles.fieldLabel}>L1 Originated</span>
                <span>{details.isL1Originated ? 'Yes' : 'No'}</span>
            </div>

            {details.l1BatchNumber && (
                <div className={styles.row}>
                    <span className={styles.fieldLabel}>L1 Batch Number</span>
                    <span>{details.l1BatchNumber}</span>
                </div>
            )}

            {details.l1CommitTxHash && (
                <div className={styles.row}>
                    <span className={styles.fieldLabel}>L1 Commit TX</span>
                    <code>{formatAddress(details.l1CommitTxHash)}</code>
                </div>
            )}

            <div className={styles.row}>
                <span className={styles.fieldLabel}>Explorer</span>
                <a href={details.explorerUrl} target="_blank" rel="noopener noreferrer">
                    View on zkSync Explorer ↗
                </a>
            </div>
        </div>
    );
}

interface LogsTabProps {
    events: TransactionDetails['events'];
    formatAddress: (addr: string) => string;
}

function LogsTab({ events, formatAddress }: LogsTabProps) {
    return (
        <div className={styles.logs}>
            {(!events || events.length === 0) ? (
                <p className={styles.noData}>No events emitted</p>
            ) : (
                events.map((event, idx) => (
                    <div key={`event-${event.logIndex ?? idx}`} className={styles.logEntry}>
                        <div className={styles.logHeader}>
                            <span className={styles.logIndex}>#{event.logIndex}</span>
                            <code className={styles.logAddress}>{formatAddress(event.address)}</code>
                        </div>
                        <div className={styles.logTopics}>
                            <span className={styles.fieldLabel}>Topics:</span>
                            {event.topics.map((topic: string, i: number) => (
                                <code key={topic} className={styles.topic}>[{i}] {topic}</code>
                            ))}
                        </div>
                        {event.data && event.data !== '0x' && (
                            <div className={styles.logData}>
                                <span className={styles.fieldLabel}>Data:</span>
                                <code>{event.data}</code>
                            </div>
                        )}
                    </div>
                ))
            )}
        </div>
    );
}

interface RawDataTabProps {
    inputData: string;
    inputDataLength: number;
    copyToClipboard: (text: string) => void;
}

function RawDataTab({ inputData, inputDataLength, copyToClipboard }: RawDataTabProps) {
    return (
        <div className={styles.rawData}>
            <div className={styles.row}>
                <span className={styles.fieldLabel}>Input Data Length</span>
                <span>{inputDataLength} bytes</span>
            </div>
            <div className={styles.inputDataBox}>
                <code>{inputData}</code>
            </div>
            <button
                className={styles.copyBtn}
                onClick={() => copyToClipboard(inputData)}
            >
                Copy Input Data
            </button>
        </div>
    );
}

export default function TransactionDetailsModal({ txHash, onClose }: TransactionDetailsModalProps) {
    const [state, setState] = useState({
        details: null as TransactionDetails | null,
        loading: true,
        error: null as string | null,
        activeTab: 'overview' as 'overview' | 'logs' | 'raw'
    });

    useEffect(() => {
        const fetchDetails = async () => {
            setState(prev => ({ ...prev, loading: true, error: null }));
            let data: any = null;
            let errString: string | null = null;
            try {
                data = await api.getTransactionDetails(txHash);
            } catch (err: any) {
                console.error("Failed to fetch transaction details:", err);
                errString = err.message || "Failed to load details";
            }
            setState(prev => ({
                ...prev,
                loading: false,
                error: errString ? errString : prev.error,
                details: data && !errString ? data as unknown as TransactionDetails : prev.details
            }));
        };
        fetchDetails();
    }, [txHash]);

    const { activeTab, details, loading, error } = state;

    const formatAddress = (addr: string) => {
        if (!addr) return '-';
        return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
    };

    const copyToClipboard = (text: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
    };

    const formatTimestamp = (iso?: string, unix?: number): string => {
        try {
            let d: Date | null = null;
            if (iso) { d = new Date(iso); } else if (unix) { d = new Date(unix * 1000); }
            if (d === null) return '-';
            if (isNaN(d.getTime())) return '-';
            return d.toLocaleString('tr-TR', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
        } catch { return '-'; }
    };

    const gasPercent = (gasUsed: number, gasLimit: number): string => {
        if (!gasLimit || !gasUsed || isNaN(gasUsed / gasLimit)) return '-';
        return `${((gasUsed / gasLimit) * 100).toFixed(1)}%`;
    };

    const formatEth = (val?: string | number): string => {
        if (val === undefined || val === null || val === '') return '0';
        const n = parseFloat(String(val));
        return isNaN(n) ? String(val) : n.toFixed(6);
    };

    if (loading) {
        return (
            <div role="presentation" className={styles.overlay} onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
                <div role="dialog" aria-modal="true" aria-label="Transaction Details" className={styles.modal} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                    <div className={styles.loading}>
                        <div className={styles.spinner}></div>
                        <p>Loading transaction details...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error || !details) {
        return (
            <div role="presentation" className={styles.overlay} onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
                <div role="dialog" aria-modal="true" aria-label="Transaction Details" className={styles.modal} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                    <div className={styles.error}>
                        <p>❌ {error || 'Transaction not found'}</p>
                        <button onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div role="presentation" className={styles.overlay} onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
            <div role="dialog" aria-modal="true" aria-label="Transaction Details" className={styles.modal} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2>Transaction Details</h2>
                    <button className={styles.closeBtn} onClick={onClose}>×</button>
                </div>

                <div className={styles.tabs}>
                    <button
                        className={activeTab === 'overview' ? styles.activeTab : ''}
                        onClick={() => setState(prev => ({ ...prev, activeTab: 'overview' }))}
                    >
                        Overview
                    </button>
                    <button
                        className={activeTab === 'logs' ? styles.activeTab : ''}
                        onClick={() => setState(prev => ({ ...prev, activeTab: 'logs' }))}
                    >
                        Logs ({details.eventsCount})
                    </button>
                    <button
                        className={activeTab === 'raw' ? styles.activeTab : ''}
                        onClick={() => setState(prev => ({ ...prev, activeTab: 'raw' }))}
                    >
                        Input Data
                    </button>
                </div>

                <div className={styles.content}>
                    {activeTab === 'overview' && (
                        <OverviewTab
                            details={details}
                            copyToClipboard={copyToClipboard}
                            formatAddress={formatAddress}
                            gasPercent={gasPercent}
                            formatEth={formatEth}
                            formatTimestamp={formatTimestamp}
                        />
                    )}
                    {activeTab === 'logs' && (
                        <LogsTab events={details.events} formatAddress={formatAddress} />
                    )}
                    {activeTab === 'raw' && (
                        <RawDataTab
                            inputData={details.inputData}
                            inputDataLength={details.inputDataLength}
                            copyToClipboard={copyToClipboard}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

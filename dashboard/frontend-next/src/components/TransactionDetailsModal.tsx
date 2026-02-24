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

export default function TransactionDetailsModal({ txHash, onClose }: TransactionDetailsModalProps) {
    const [details, setDetails] = useState<TransactionDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'raw'>('overview');

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                setLoading(true);
                const data = await api.getTransactionDetails(txHash);
                setDetails(data as unknown as TransactionDetails);
            } catch (err: any) {
                setError(err.message || 'Failed to fetch transaction details');
            } finally {
                setLoading(false);
            }
        };
        fetchDetails();
    }, [txHash]);

    const formatAddress = (addr: string) => {
        if (!addr) return '-';
        return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    if (loading) {
        return (
            <div className={styles.overlay} onClick={onClose}>
                <div className={styles.modal} onClick={e => e.stopPropagation()}>
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
            <div className={styles.overlay} onClick={onClose}>
                <div className={styles.modal} onClick={e => e.stopPropagation()}>
                    <div className={styles.error}>
                        <p>❌ {error || 'Transaction not found'}</p>
                        <button onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2>Transaction Details</h2>
                    <button className={styles.closeBtn} onClick={onClose}>×</button>
                </div>

                <div className={styles.tabs}>
                    <button
                        className={activeTab === 'overview' ? styles.activeTab : ''}
                        onClick={() => setActiveTab('overview')}
                    >
                        Overview
                    </button>
                    <button
                        className={activeTab === 'logs' ? styles.activeTab : ''}
                        onClick={() => setActiveTab('logs')}
                    >
                        Logs ({details.eventsCount})
                    </button>
                    <button
                        className={activeTab === 'raw' ? styles.activeTab : ''}
                        onClick={() => setActiveTab('raw')}
                    >
                        Input Data
                    </button>
                </div>

                <div className={styles.content}>
                    {activeTab === 'overview' && (
                        <div className={styles.overview}>
                            {/* Status */}
                            <div className={styles.statusRow}>
                                <span className={`${styles.statusBadge} ${styles[details.status.toLowerCase()]}`}>
                                    {details.status}
                                </span>
                            </div>

                            {/* Transaction Hash */}
                            <div className={styles.row}>
                                <label>Transaction Hash</label>
                                <div className={styles.valueWithCopy}>
                                    <code>{details.txHash}</code>
                                    <button onClick={() => copyToClipboard(details.txHash)}>📋</button>
                                </div>
                            </div>

                            {/* Block */}
                            <div className={styles.row}>
                                <label>Block</label>
                                <span>{details.blockNumber?.toLocaleString()}</span>
                            </div>

                            {/* Timestamp */}
                            <div className={styles.row}>
                                <label>Timestamp</label>
                                <span>{details.timestampISO || details.receivedAt || '-'}</span>
                            </div>

                            <hr className={styles.divider} />

                            {/* From / To */}
                            <div className={styles.row}>
                                <label>From</label>
                                <div className={styles.valueWithCopy}>
                                    <code>{details.from}</code>
                                    <button onClick={() => copyToClipboard(details.from)}>📋</button>
                                </div>
                            </div>

                            <div className={styles.row}>
                                <label>To (Contract)</label>
                                <div className={styles.valueWithCopy}>
                                    <code>{details.to}</code>
                                    <button onClick={() => copyToClipboard(details.to)}>📋</button>
                                </div>
                            </div>

                            <hr className={styles.divider} />

                            {/* Value & Gas */}
                            <div className={styles.row}>
                                <label>Value</label>
                                <span>{details.value} ETH</span>
                            </div>

                            <div className={styles.row}>
                                <label>Transaction Fee</label>
                                <span>{details.fee} ETH</span>
                            </div>

                            <div className={styles.row}>
                                <label>Gas Limit</label>
                                <span>{details.gasLimit?.toLocaleString()}</span>
                            </div>

                            <div className={styles.row}>
                                <label>Gas Used</label>
                                <span>{details.gasUsed?.toLocaleString()} ({((details.gasUsed / details.gasLimit) * 100).toFixed(1)}%)</span>
                            </div>

                            <div className={styles.row}>
                                <label>Gas Price</label>
                                <span>{details.gasPrice} ETH</span>
                            </div>

                            <hr className={styles.divider} />

                            {/* zkSync Specific */}
                            <div className={styles.row}>
                                <label>Nonce</label>
                                <span>{details.nonce}</span>
                            </div>

                            <div className={styles.row}>
                                <label>Transaction Type</label>
                                <span>EIP-1559 (Type {details.type})</span>
                            </div>

                            <div className={styles.row}>
                                <label>Chain ID</label>
                                <span>zkSync Sepolia ({details.chainId})</span>
                            </div>

                            <div className={styles.row}>
                                <label>L1 Originated</label>
                                <span>{details.isL1Originated ? 'Yes' : 'No'}</span>
                            </div>

                            {details.l1BatchNumber && (
                                <div className={styles.row}>
                                    <label>L1 Batch Number</label>
                                    <span>{details.l1BatchNumber}</span>
                                </div>
                            )}

                            {/* L1 TX Hashes */}
                            {details.l1CommitTxHash && (
                                <div className={styles.row}>
                                    <label>L1 Commit TX</label>
                                    <code>{formatAddress(details.l1CommitTxHash)}</code>
                                </div>
                            )}

                            {/* Explorer Link */}
                            <div className={styles.row}>
                                <label>Explorer</label>
                                <a href={details.explorerUrl} target="_blank" rel="noopener noreferrer">
                                    View on zkSync Explorer ↗
                                </a>
                            </div>
                        </div>
                    )}

                    {activeTab === 'logs' && (
                        <div className={styles.logs}>
                            {details.events.length === 0 ? (
                                <p className={styles.noData}>No events emitted</p>
                            ) : (
                                details.events.map((event, idx) => (
                                    <div key={idx} className={styles.logEntry}>
                                        <div className={styles.logHeader}>
                                            <span className={styles.logIndex}>#{event.logIndex}</span>
                                            <code className={styles.logAddress}>{formatAddress(event.address)}</code>
                                        </div>
                                        <div className={styles.logTopics}>
                                            <label>Topics:</label>
                                            {event.topics.map((topic: string, i: number) => (
                                                <code key={i} className={styles.topic}>[{i}] {topic}</code>
                                            ))}
                                        </div>
                                        {event.data && event.data !== '0x' && (
                                            <div className={styles.logData}>
                                                <label>Data:</label>
                                                <code>{event.data}</code>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'raw' && (
                        <div className={styles.rawData}>
                            <div className={styles.row}>
                                <label>Input Data Length</label>
                                <span>{details.inputDataLength} bytes</span>
                            </div>
                            <div className={styles.inputDataBox}>
                                <code>{details.inputData}</code>
                            </div>
                            <button
                                className={styles.copyBtn}
                                onClick={() => copyToClipboard(details.inputData)}
                            >
                                Copy Input Data
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

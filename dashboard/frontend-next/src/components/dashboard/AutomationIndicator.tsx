'use client';

import React, { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { api } from '../../services/api';

interface AutomationStatus {
    running: boolean;
    poll_interval?: number;
}

/**
 * AutomationIndicator - Header badge showing automation status
 */
export const AutomationIndicator: React.FC = () => {
    const [status, setStatus] = useState<AutomationStatus | null>(null);

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const data = await api.getListenerStatus();
                setStatus(data);
            } catch {
                setStatus(null);
            }
        };
        fetchStatus();
        const interval = setInterval(fetchStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    if (!status) return null;

    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
            status.running
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-white/[0.03] border-white/[0.07] text-white/40'
        }`}>
            {status.running ? (
                <>
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span>Automation Active</span>
                </>
            ) : (
                <>
                    <Radio size={12} />
                    <span>Automation Off</span>
                </>
            )}
        </div>
    );
};

/**
 * AutomationStatusCard - Stats grid card showing automation status
 */
export const AutomationStatusCard: React.FC = () => {
    const [status, setStatus] = useState<AutomationStatus | null>(null);

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const data = await api.getListenerStatus();
                setStatus(data);
            } catch {
                setStatus(null);
            }
        };
        fetchStatus();
        const interval = setInterval(fetchStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="group relative p-5 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition-all duration-300">
            {/* Corner accent */}
            <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
            <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />

            <div className="flex items-center justify-between mb-3">
                <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Automation</span>
                <div className={`p-1.5 rounded-lg ${status?.running ? 'bg-emerald-500/15' : 'bg-white/[0.04]'}`}>
                    <Radio size={14} className={status?.running ? 'text-emerald-400' : 'text-white/30'} />
                </div>
            </div>
            <div className="flex items-center gap-2">
                {status?.running ? (
                    <>
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                        <span className="text-xl font-bold text-emerald-400">Active</span>
                    </>
                ) : (
                    <span className="text-xl font-bold text-white/30">Offline</span>
                )}
            </div>
        </div>
    );
};

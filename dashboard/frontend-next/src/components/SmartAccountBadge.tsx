'use client';

import React from 'react';
import { Shield, Wallet } from 'lucide-react';
import type { SessionKeyStatus } from '../types';

interface SmartAccountBadgeProps {
    status: SessionKeyStatus | null;
    role: 'OPERATOR' | 'ENGINEER';
    className?: string;
}

/**
 * TX gönderim modunu (Smart Account vs EOA) küçük bir badge ile gösterir.
 * Smart Account aktifse emerald, değilse soluk beyaz renk kullanır.
 */
const SmartAccountBadge: React.FC<SmartAccountBadgeProps> = ({ status, role, className = '' }) => {
    if (!status) return null;

    const roleStatus = status.roles[role];
    const isActive = roleStatus?.active ?? false;

    return (
        <div
            title={
                isActive
                    ? `Smart Account: ${roleStatus.smart_account ?? ''}\nSession Key: ${roleStatus.address ?? ''}`
                    : 'Standard wallet signing (EOA)'
            }
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-semibold tracking-wide transition-colors ${
                isActive
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-white/[0.04] border-white/[0.08] text-white/30'
            } ${className}`}
        >
            {isActive ? (
                <>
                    <Shield size={10} strokeWidth={2.5} />
                    Smart Account
                </>
            ) : (
                <>
                    <Wallet size={10} strokeWidth={2.5} />
                    EOA
                </>
            )}
        </div>
    );
};

export default SmartAccountBadge;

'use client';

import React from 'react';
import { CheckCircle, AlertTriangle } from 'lucide-react';

interface NotificationToastProps {
    message: string;
    type: 'success' | 'error';
}

/**
 * NotificationToast - Toast notification for success/error messages
 */
export const NotificationToast: React.FC<NotificationToastProps> = ({ message, type }) => {
    return (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl shadow-black/50 backdrop-blur-xl border animate-fade-in-up ${
            type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
            {type === 'success' ? <CheckCircle size={22} /> : <AlertTriangle size={22} />}
            <div>
                <h4 className="font-bold text-sm">{type === 'success' ? 'Success' : 'Error'}</h4>
                <p className="text-sm opacity-80">{message}</p>
            </div>
        </div>
    );
};

export default NotificationToast;

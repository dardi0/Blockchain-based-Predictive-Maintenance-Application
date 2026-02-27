'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorModalProps {
    message: string;
    onClose: () => void;
}

const ErrorModal: React.FC<ErrorModalProps> = ({ message, onClose }) => (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white dark:bg-[var(--dark-bg)] rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200 border border-slate-200 dark:border-slate-700">
            <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-400">
                    <AlertTriangle size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Analysis Failed</h3>
                <p className="text-slate-600 dark:text-slate-400 mb-6">
                    {message.replace(/^\d+:\s*/, '')}
                </p>
                <button
                    onClick={onClose}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors shadow-lg shadow-red-500/30"
                >
                    Dismiss
                </button>
            </div>
        </div>
    </div>
);

export default ErrorModal;

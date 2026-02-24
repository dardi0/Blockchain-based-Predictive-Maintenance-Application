'use client';

import React from 'react';
import { AlertTriangle, WifiOff, Lock, Server, RefreshCw, HelpCircle } from 'lucide-react';

export type ApiErrorType =
    | 'network'
    | 'unauthorized'
    | 'forbidden'
    | 'not_found'
    | 'server_error'
    | 'timeout'
    | 'unknown';

interface ApiErrorDisplayProps {
    error: Error | string;
    type?: ApiErrorType;
    onRetry?: () => void;
    compact?: boolean;
}

/**
 * Determines error type from error object or status code
 */
export function getErrorType(error: any): ApiErrorType {
    if (!error) return 'unknown';

    const message = error.message?.toLowerCase() || error.toString().toLowerCase();
    const status = error.status || error.statusCode;

    if (message.includes('network') || message.includes('fetch') || message.includes('failed to fetch')) {
        return 'network';
    }
    if (status === 401 || message.includes('unauthorized')) {
        return 'unauthorized';
    }
    if (status === 403 || message.includes('forbidden')) {
        return 'forbidden';
    }
    if (status === 404 || message.includes('not found')) {
        return 'not_found';
    }
    if (status >= 500 || message.includes('server') || message.includes('internal')) {
        return 'server_error';
    }
    if (message.includes('timeout') || message.includes('timed out')) {
        return 'timeout';
    }

    return 'unknown';
}

const errorConfig: Record<ApiErrorType, {
    icon: React.ElementType;
    title: string;
    description: string;
    color: string;
    bgColor: string;
}> = {
    network: {
        icon: WifiOff,
        title: 'Connection Error',
        description: 'Unable to connect to the server. Please check your internet connection.',
        color: 'text-orange-500',
        bgColor: 'bg-orange-50 dark:bg-orange-900/20'
    },
    unauthorized: {
        icon: Lock,
        title: 'Session Expired',
        description: 'Your session has expired. Please log in again.',
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-50 dark:bg-yellow-900/20'
    },
    forbidden: {
        icon: Lock,
        title: 'Access Denied',
        description: 'You don\'t have permission to access this resource.',
        color: 'text-red-500',
        bgColor: 'bg-red-50 dark:bg-red-900/20'
    },
    not_found: {
        icon: HelpCircle,
        title: 'Not Found',
        description: 'The requested resource could not be found.',
        color: 'text-slate-500',
        bgColor: 'bg-slate-50 dark:bg-[var(--dark-bg)]'
    },
    server_error: {
        icon: Server,
        title: 'Server Error',
        description: 'The server encountered an error. Please try again later.',
        color: 'text-red-500',
        bgColor: 'bg-red-50 dark:bg-red-900/20'
    },
    timeout: {
        icon: RefreshCw,
        title: 'Request Timeout',
        description: 'The request took too long. Please try again.',
        color: 'text-amber-500',
        bgColor: 'bg-amber-50 dark:bg-amber-900/20'
    },
    unknown: {
        icon: AlertTriangle,
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        color: 'text-red-500',
        bgColor: 'bg-red-50 dark:bg-red-900/20'
    }
};

/**
 * ApiErrorDisplay - Displays API errors with appropriate styling
 */
export const ApiErrorDisplay: React.FC<ApiErrorDisplayProps> = ({
    error,
    type,
    onRetry,
    compact = false
}) => {
    const errorType = type || getErrorType(error);
    const config = errorConfig[errorType];
    const Icon = config.icon;
    const errorMessage = typeof error === 'string' ? error : error.message;

    if (compact) {
        return (
            <div className={`flex items-center gap-3 p-3 rounded-lg ${config.bgColor}`}>
                <Icon size={18} className={config.color} />
                <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">
                    {config.title}
                </span>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        className="text-sm text-[var(--accent-primary)] hover:text-blue-700 dark:text-[var(--accent-highlight)] font-medium"
                    >
                        Retry
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className={`p-6 rounded-xl ${config.bgColor} border border-slate-200 dark:border-slate-700`}>
            <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={24} className={config.color} />
                </div>
                <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-1">
                        {config.title}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                        {config.description}
                    </p>
                    {process.env.NODE_ENV === 'development' && errorMessage && (
                        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono bg-slate-100 dark:bg-[var(--dark-bg)] p-2 rounded mt-2">
                            {errorMessage}
                        </p>
                    )}
                    {onRetry && (
                        <button
                            onClick={onRetry}
                            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            <RefreshCw size={16} />
                            Try Again
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ApiErrorDisplay;

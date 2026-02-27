'use client';

import React from 'react';
import { Loader2, AlertCircle, RefreshCw, FileQuestion } from 'lucide-react';

interface LoadingStateProps {
    message?: string;
    size?: 'sm' | 'md' | 'lg';
}

interface ErrorStateProps {
    title?: string;
    message?: string;
    onRetry?: () => void;
}

interface EmptyStateProps {
    icon?: React.ElementType;
    title: string;
    description?: string;
    action?: {
        label: string;
        onClick: () => void;
    };
}

/**
 * LoadingState - Consistent loading spinner with message
 */
export const LoadingState: React.FC<LoadingStateProps> = ({
    message = 'Loading...',
    size = 'md'
}) => {
    const sizes = {
        sm: { spinner: 16, text: 'text-xs' },
        md: { spinner: 24, text: 'text-sm' },
        lg: { spinner: 32, text: 'text-base' }
    };

    const { spinner, text } = sizes[size];

    return (
        <div className="flex flex-col items-center justify-center py-12">
            <Loader2 size={spinner} className="text-indigo-500 animate-spin mb-3" />
            <p className={`${text} text-slate-500 dark:text-slate-400`}>{message}</p>
        </div>
    );
};

/**
 * ErrorState - Generic error display for failed data fetching
 */
export const ErrorState: React.FC<ErrorStateProps> = ({
    title = 'Failed to load',
    message = 'Something went wrong while loading this content.',
    onRetry
}) => {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                <AlertCircle size={28} className="text-red-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">
                {title}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center max-w-sm mb-4">
                {message}
            </p>
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium rounded-lg transition-colors"
                >
                    <RefreshCw size={16} />
                    Try Again
                </button>
            )}
        </div>
    );
};

/**
 * EmptyState - Display when no data is available
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
    icon: Icon = FileQuestion,
    title,
    description,
    action
}) => {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-[var(--dark-bg)] flex items-center justify-center mb-4">
                <Icon size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">
                {title}
            </h3>
            {description && (
                <p className="text-sm text-slate-600 dark:text-slate-400 text-center max-w-sm mb-4">
                    {description}
                </p>
            )}
            {action && (
                <button
                    onClick={action.onClick}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                    {action.label}
                </button>
            )}
        </div>
    );
};

/**
 * InlineError - Small inline error message
 */
export const InlineError: React.FC<{ message: string }> = ({ message }) => {
    return (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
            <AlertCircle size={14} />
            <span>{message}</span>
        </div>
    );
};

/**
 * SkeletonCard - Loading placeholder for cards
 */
export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => {
    return (
        <div className={`glass-card p-5 rounded-2xl animate-pulse ${className}`}>
            <div className="flex items-center justify-between mb-3">
                <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded"></div>
                <div className="h-5 w-5 bg-slate-200 dark:bg-slate-700 rounded"></div>
            </div>
            <div className="h-8 w-20 bg-slate-200 dark:bg-slate-700 rounded"></div>
        </div>
    );
};

/**
 * SkeletonList - Loading placeholder for lists
 */
export const SkeletonList: React.FC<{ rows?: number }> = ({ rows = 3 }) => {
    return (
        <div className="space-y-3">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={`skeleton-row-${i}`} className="flex items-center gap-3 p-3 bg-white/50 dark:bg-[var(--dark-bg)]/50 rounded-xl animate-pulse">
                    <div className="w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700"></div>
                    <div className="flex-1">
                        <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded mb-2"></div>
                        <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-700 rounded"></div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default { LoadingState, ErrorState, EmptyState, InlineError, SkeletonCard, SkeletonList };

'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug, Copy, Check } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    level?: 'page' | 'section' | 'component';
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
    copied: boolean;
}

/**
 * Enhanced Error Boundary with different display modes
 */
class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null,
        copied: false
    };

    public static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({ errorInfo });

        // Call optional error handler
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }

        // Log to console in development
        if (process.env.NODE_ENV === 'development') {
            console.group('🚨 Error Boundary Caught:');
            console.error('Error:', error);
            console.error('Component Stack:', errorInfo.componentStack);
            console.groupEnd();
        }
    }

    private handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    private handleRefresh = () => {
        window.location.reload();
    };

    private handleGoHome = () => {
        window.location.href = '/dashboard';
    };

    private handleCopyError = async () => {
        const errorText = `
Error: ${this.state.error?.toString()}
Stack: ${this.state.error?.stack}
Component Stack: ${this.state.errorInfo?.componentStack}
URL: ${window.location.href}
Time: ${new Date().toISOString()}
        `.trim();

        try {
            await navigator.clipboard.writeText(errorText);
            this.setState({ copied: true });
            setTimeout(() => this.setState({ copied: false }), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    public render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        if (this.props.fallback) {
            return this.props.fallback;
        }

        const level = this.props.level || 'page';

        // Component level - minimal inline error
        if (level === 'component') {
            return (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                        <AlertTriangle size={16} />
                        <span className="text-sm font-medium">Component Error</span>
                    </div>
                    <button
                        onClick={this.handleRetry}
                        className="mt-2 text-xs text-red-600 dark:text-red-400 hover:underline"
                    >
                        Try Again
                    </button>
                </div>
            );
        }

        // Section level - card style error
        if (level === 'section') {
            return (
                <div className="glass-card p-6 rounded-2xl border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="w-6 h-6 text-red-500" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-1">
                                Section Failed to Load
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                                This section encountered an error. Other parts of the page may still work.
                            </p>
                            {process.env.NODE_ENV === 'development' && this.state.error && (
                                <div className="mb-4 p-3 bg-slate-100 dark:bg-[var(--dark-bg)] rounded-lg">
                                    <code className="text-xs text-red-600 dark:text-red-400 break-all">
                                        {this.state.error.message}
                                    </code>
                                </div>
                            )}
                            <div className="flex gap-2">
                                <button
                                    onClick={this.handleRetry}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
                                >
                                    <RefreshCw size={14} />
                                    Retry
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // Page level - full page error
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
                <div className="max-w-lg w-full bg-white dark:bg-[var(--dark-bg)] rounded-2xl shadow-xl overflow-hidden">
                    {/* Header */}
                    <div className="bg-red-500 px-6 py-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                                <Bug className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold text-white">Something went wrong</h1>
                                <p className="text-red-100 text-sm">An unexpected error occurred</p>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        <p className="text-slate-600 dark:text-slate-400 mb-6">
                            We apologize for the inconvenience. Please try again or contact support if the problem persists.
                        </p>

                        {/* Error Details (Development) */}
                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <div className="mb-6">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                        Error Details
                                    </span>
                                    <button
                                        onClick={this.handleCopyError}
                                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                    >
                                        {this.state.copied ? <Check size={12} /> : <Copy size={12} />}
                                        {this.state.copied ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>
                                <div className="p-4 bg-slate-900 rounded-lg overflow-auto max-h-48">
                                    <p className="text-sm font-mono text-red-400 break-all mb-2">
                                        {this.state.error.message}
                                    </p>
                                    {this.state.errorInfo && (
                                        <pre className="text-xs font-mono text-slate-400 whitespace-pre-wrap">
                                            {this.state.errorInfo.componentStack?.slice(0, 500)}
                                        </pre>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={this.handleRetry}
                                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white font-medium rounded-lg transition-colors"
                            >
                                <RefreshCw size={18} />
                                Try Again
                            </button>
                            <button
                                onClick={this.handleRefresh}
                                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-white font-medium rounded-lg transition-colors"
                            >
                                <RefreshCw size={18} />
                                Refresh Page
                            </button>
                            <button
                                onClick={this.handleGoHome}
                                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-white font-medium rounded-lg transition-colors"
                            >
                                <Home size={18} />
                                Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;

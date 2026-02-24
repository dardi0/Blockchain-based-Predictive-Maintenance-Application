'use client';

import React, { useEffect } from 'react';
import { RefreshCw, Home, Bug } from 'lucide-react';

interface ErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
    useEffect(() => {
        console.error('Global Error:', error);
    }, [error]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#060b14] p-4">
            <div className="max-w-md w-full rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                {/* Header */}
                <div className="relative bg-gradient-to-r from-red-600 to-red-500 px-6 py-5">
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTTAgNDBMNDAgMCIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IGZpbGw9InVybCgjZykiIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiLz48L3N2Zz4=')] opacity-30" />
                    <div className="relative flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
                            <Bug className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white">Something went wrong</h1>
                            <p className="text-red-100/70 text-sm">Application error</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    <p className="text-white/50 mb-6">
                        We apologize for the inconvenience. An unexpected error has occurred.
                        Please try again or return to the dashboard.
                    </p>

                    {process.env.NODE_ENV === 'development' && (
                        <div className="mb-6 p-4 bg-white/[0.03] border border-white/[0.07] rounded-lg overflow-auto max-h-32">
                            <p className="text-sm font-mono text-red-400 break-all">
                                {error.message}
                            </p>
                            {error.digest && (
                                <p className="text-xs font-mono text-white/30 mt-2">
                                    Digest: {error.digest}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            onClick={reset}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-highlight)] text-white font-medium rounded-lg hover:shadow-lg hover:shadow-[var(--accent-primary)]/25 transition-all"
                        >
                            <RefreshCw size={18} />
                            Try Again
                        </button>
                        <a
                            href="/dashboard"
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white/[0.05] border border-white/[0.07] hover:bg-white/[0.08] text-white font-medium rounded-lg transition-colors"
                        >
                            <Home size={18} />
                            Dashboard
                        </a>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-white/[0.07]">
                    <p className="text-xs text-white/30 text-center">
                        If this problem persists, please contact support.
                    </p>
                </div>
            </div>
        </div>
    );
}

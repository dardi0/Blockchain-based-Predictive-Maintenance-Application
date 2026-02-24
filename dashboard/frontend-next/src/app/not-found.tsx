'use client';

import React from 'react';
import { FileQuestion, Home, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function NotFound() {
    const router = useRouter();

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#060b14] p-4">
            <div className="max-w-md w-full text-center">
                {/* Icon */}
                <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center">
                    <FileQuestion className="w-12 h-12 text-[var(--accent-highlight)]" />
                </div>

                {/* 404 Badge */}
                <div className="inline-block px-4 py-1.5 bg-[var(--accent-primary)]/15 text-[var(--accent-highlight)] border border-[var(--accent-primary)]/20 rounded-full text-sm font-medium mb-4">
                    404 Error
                </div>

                {/* Title */}
                <h1 className="text-3xl font-bold text-white mb-3">
                    Page Not Found
                </h1>

                {/* Description */}
                <p className="text-white/40 mb-8 max-w-sm mx-auto">
                    The page you're looking for doesn't exist or has been moved.
                    Let's get you back on track.
                </p>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        onClick={() => router.back()}
                        className="inline-flex items-center justify-center gap-2 px-6 py-2.5 border border-white/[0.1] hover:bg-white/[0.05] text-white font-medium rounded-lg transition-colors"
                    >
                        <ArrowLeft size={18} />
                        Go Back
                    </button>
                    <a
                        href="/dashboard"
                        className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-highlight)] text-white font-medium rounded-lg hover:shadow-lg hover:shadow-[var(--accent-primary)]/25 transition-all"
                    >
                        <Home size={18} />
                        Dashboard
                    </a>
                </div>

                {/* Decorative Elements */}
                <div className="mt-16 flex justify-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-white/[0.1]"></div>
                    <div className="w-2 h-2 rounded-full bg-[var(--accent-primary)]/40"></div>
                    <div className="w-2 h-2 rounded-full bg-white/[0.1]"></div>
                </div>
            </div>
        </div>
    );
}

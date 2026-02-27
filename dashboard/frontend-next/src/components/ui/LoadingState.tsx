'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';

const LoadingState: React.FC = () => {
    return (
        <div className="flex items-center justify-center h-64">
            <RefreshCw className="animate-spin text-[var(--accent-primary)]" size={32} />
        </div>
    );
};

export default LoadingState;

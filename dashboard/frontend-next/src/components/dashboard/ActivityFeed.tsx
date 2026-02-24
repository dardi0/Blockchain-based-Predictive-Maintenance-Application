'use client';

import React from 'react';
import { Activity } from 'lucide-react';

interface ActivityItem {
    id: string;
    type: string;
    message: string;
    timestamp: string;
    machine_id?: number;
}

interface ActivityFeedProps {
    activities: ActivityItem[];
}

/**
 * ActivityFeed - Shows recent system activities
 */
export const ActivityFeed: React.FC<ActivityFeedProps> = ({ activities }) => {
    const getActivityColor = (type: string) => {
        switch (type) {
            case 'prediction_alert':
                return 'bg-red-500';
            case 'report_saved':
                return 'bg-[var(--accent-highlight)]';
            default:
                return 'bg-emerald-500';
        }
    };

    return (
        <div className="relative group p-5 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.14] transition-all duration-300">
            {/* Corner accent */}
            <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
            <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />

            {/* Bottom glow */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-[var(--accent-primary)] to-transparent opacity-0 group-hover:opacity-60 transition-opacity duration-500" />

            <h3 className="text-[10px] font-bold text-white/40 mb-4 uppercase tracking-widest flex items-center gap-2">
                <Activity size={14} className="text-[var(--accent-highlight)]" /> Recent Activity
            </h3>
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                {activities.length > 0 ? (
                    activities.map(activity => (
                        <div
                            key={activity.id}
                            className="flex items-start gap-3 p-3 bg-white/[0.02] hover:bg-white/[0.05] rounded-lg border border-white/[0.05] hover:border-white/[0.1] transition-all duration-200"
                        >
                            <span className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${getActivityColor(activity.type)}`}></span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-white/80 truncate">{activity.message}</p>
                                <p className="text-[10px] text-white/30 font-mono mt-0.5">{new Date(activity.timestamp).toLocaleString()}</p>
                            </div>
                        </div>
                    ))
                ) : (
                    <p className="text-sm text-white/30 text-center py-4">No recent activity</p>
                )}
            </div>
        </div>
    );
};

export default ActivityFeed;

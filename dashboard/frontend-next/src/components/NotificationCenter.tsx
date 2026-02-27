'use client';

import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { Bell, AlertTriangle, Activity, CheckCircle, X, ExternalLink, BellOff, Trash2 } from 'lucide-react';
import { api } from '@/services/api';
import { useRouter } from 'next/navigation';
import { useSettings } from '@/context/SettingsContext';

interface Notification {
    id: number;
    type: string; // 'success' | 'error' | 'info'
    message: string;
    created_at?: string;
    is_read: boolean;
    network_tx_hash?: string;
}

interface NotificationCenterProps {
    walletAddress: string;
}

interface NotificationState {
    isOpen: boolean;
    notifications: Notification[];
    unreadCount: number;
    loading: boolean;
}

type NotificationAction =
    | { type: 'SET_OPEN'; payload: boolean }
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'SET_NOTIFICATIONS'; payload: { list: Notification[]; unread: number } }
    | { type: 'MARK_READ'; payload: number }
    | { type: 'DELETE_NOTIFICATION'; payload: number }
    | { type: 'REMOTE_OPEN_START' }
    | { type: 'REMOTE_OPEN_FINISH' };

const initialState: NotificationState = {
    isOpen: false,
    notifications: [],
    unreadCount: 0,
    loading: false,
};

function notificationReducer(state: NotificationState, action: NotificationAction): NotificationState {
    switch (action.type) {
        case 'SET_OPEN':
            return { ...state, isOpen: action.payload };
        case 'SET_LOADING':
            return { ...state, loading: action.payload };
        case 'SET_NOTIFICATIONS':
            return { ...state, notifications: action.payload.list, unreadCount: action.payload.unread };
        case 'MARK_READ': {
            const updated = state.notifications.map(n => n.id === action.payload ? { ...n, is_read: true } : n);
            return { ...state, notifications: updated, unreadCount: Math.max(0, state.unreadCount - 1) };
        }
        case 'DELETE_NOTIFICATION': {
            const remaining = state.notifications.filter(n => n.id !== action.payload);
            const newUnread = remaining.filter(n => !n.is_read).length;
            return { ...state, notifications: remaining, unreadCount: newUnread };
        }
        case 'REMOTE_OPEN_START':
            return { ...state, loading: true };
        case 'REMOTE_OPEN_FINISH':
            return { ...state, loading: false, isOpen: true };
        default:
            return state;
    }
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ walletAddress }) => {
    const router = useRouter();
    const [state, dispatch] = React.useReducer(notificationReducer, initialState);
    const { isOpen, notifications, unreadCount, loading } = state;
    const dropdownRef = useRef<HTMLDivElement>(null);
    const autoCloseTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

    // Fetch notifications
    const fetchNotifications = async () => {
        if (!walletAddress) return;
        try {
            const data = await api.getNotifications(walletAddress, 50);
            let rawList: any[] = [];
            if (Array.isArray(data)) rawList = data;
            const list = rawList.map((n: any) => {
                let t = 'info';
                if (n.type) t = n.type;
                let readStat = false;
                if (n.is_read !== undefined && n.is_read !== null) readStat = n.is_read;
                return {
                    id: n.id,
                    type: t,
                    message: n.message,
                    created_at: n.created_at,
                    is_read: readStat,
                    network_tx_hash: n.network_tx_hash
                };
            });

            const unread = list.filter((n: any) => !n.is_read).length;
            dispatch({ type: 'SET_NOTIFICATIONS', payload: { list, unread } });
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        }
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 10000);
        return () => clearInterval(interval);
    }, [walletAddress]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                dispatch({ type: 'SET_OPEN', payload: false });
            }
        };

        const handleRemoteOpen = async () => {
            dispatch({ type: 'REMOTE_OPEN_START' });
            await fetchNotifications();
            dispatch({ type: 'REMOTE_OPEN_FINISH' });
            autoCloseTimeoutRef.current = setTimeout(() => dispatch({ type: 'SET_OPEN', payload: false }), 7000);
        };

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('open-notification-center', handleRemoteOpen);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('open-notification-center', handleRemoteOpen);
            clearTimeout(autoCloseTimeoutRef.current);
        };
    }, []);

    const getIcon = (type: string) => {
        if (type === 'error' || type === 'FAILURE_PREDICTION') {
            return <AlertTriangle size={16} className="text-red-500" />;
        }
        if (type === 'success') {
            return <CheckCircle size={16} className="text-emerald-500" />;
        }
        return <Activity size={16} className="text-[var(--accent-primary)]" />;
    };

    const getSeverityColor = (type: string, isRead: boolean) => {
        if (isRead) return 'border-l-slate-300 bg-slate-50/50 dark:bg-[var(--dark-bg)]/50 dark:border-l-slate-600 opacity-75';

        switch (type) {
            case 'error':
            case 'FAILURE_PREDICTION':
                return 'border-l-red-500 bg-red-50 dark:bg-red-900/10';
            case 'success':
                return 'border-l-emerald-500 bg-emerald-50 dark:bg-emerald-900/10';
            default:
                return 'border-l-blue-500 bg-[var(--accent-highlight)]/10 dark:bg-[var(--accent-primary)]/10';
        }
    };

    const formatTime = (timestamp?: string) => {
        if (!timestamp) return 'Just now';
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return 'Just now';

        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    };

    const handleNotificationClick = async (notification: Notification) => {
        // Only mark if unread
        if (!notification.is_read) {
            try {
                await api.markNotificationRead(notification.id);
                // Optimistic update
                dispatch({ type: 'MARK_READ', payload: notification.id });
            } catch (e) {
                console.error("Failed to mark read", e);
            }
        }

        if (notification.network_tx_hash) {
            window.open(`https://sepolia.explorer.zksync.io/tx/${notification.network_tx_hash}`, '_blank');
        }
    };

    const handleDeleteNotification = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation(); // Access parent click
        try {
            await api.deleteNotification(id);
            dispatch({ type: 'DELETE_NOTIFICATION', payload: id });
        } catch (error) {
            console.error("Failed to delete notification", error);
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Button */}
            {/* Bell Button */}
            <button
                onClick={() => dispatch({ type: 'SET_OPEN', payload: !isOpen })}
                className="relative p-3 rounded-xl bg-white dark:bg-[var(--dark-bg)] border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-[var(--accent-primary)]/50 dark:hover:border-[var(--accent-primary)]/50 transition-all group"
                title="Notifications"
            >
                <Bell size={24} className="text-slate-600 dark:text-slate-400 group-hover:text-[var(--accent-primary)] dark:group-hover:text-[var(--accent-highlight)] transition-colors" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse ring-2 ring-white dark:ring-slate-900 shadow-sm">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-[var(--dark-bg)] rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden animate-fade-in-down">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700">
                        <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                            <Bell size={18} />
                            Notifications
                            {unreadCount > 0 && (
                                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs rounded-full">
                                    {unreadCount} new
                                </span>
                            )}
                        </h3>
                        <button
                            onClick={() => dispatch({ type: 'SET_OPEN', payload: false })}
                            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                            <X size={18} className="text-slate-400" />
                        </button>
                    </div>

                    {/* Notification List */}
                    <div className="max-h-96 overflow-y-auto">
                        {loading ? (
                            <div className="p-8 text-center">
                                <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin mx-auto"></div>
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="p-8 text-center text-slate-400">
                                <Bell size={32} className="mx-auto mb-2 opacity-50" />
                                <p>No notifications</p>
                            </div>
                        ) : (
                            notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => handleNotificationClick(notification)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleNotificationClick(notification); }}
                                    className={`p-4 border-l-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group/item relative ${getSeverityColor(notification.type, notification.is_read)}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5">
                                            {getIcon(notification.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className={`font-medium text-sm truncate ${notification.is_read ? 'text-slate-500 dark:text-slate-500' : 'text-slate-800 dark:text-white'}`}>
                                                    {notification.type === 'success' ? 'Transaction Confirmed' : (notification.type === 'error' ? 'Error' : 'Notification')}
                                                </p>
                                                <span className="text-xs text-slate-400 whitespace-nowrap">
                                                    {formatTime(notification.created_at)}
                                                </span>
                                            </div>
                                            <p className={`text-xs mt-1 line-clamp-2 ${notification.is_read ? 'text-slate-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                                {notification.message}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {notification.network_tx_hash && (
                                                <ExternalLink size={14} className="text-slate-400 flex-shrink-0 hover:text-[var(--accent-primary)]" />
                                            )}

                                            <button
                                                onClick={(e) => handleDeleteNotification(e, notification.id)}
                                                className="opacity-0 group-hover/item:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-opacity"
                                                title="Delete"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    {notifications.length > 0 && (
                        <div className="p-3 border-t border-slate-100 dark:border-slate-700 text-center">
                            <button
                                onClick={() => {
                                    router.push('/dashboard/notifications');
                                    dispatch({ type: 'SET_OPEN', payload: false });
                                }}
                                className="text-sm text-[var(--accent-primary)] dark:text-[var(--accent-highlight)] hover:underline font-medium"
                            >
                                View All Notifications →
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// Memoize to prevent unnecessary re-renders when parent state changes
export default memo(NotificationCenter);

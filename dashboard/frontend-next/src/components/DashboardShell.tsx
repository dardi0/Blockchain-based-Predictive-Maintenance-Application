'use client';

import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, AlertTriangle, Activity, X } from 'lucide-react';
import Layout from './Layout';
import { Machine, MachineStatus, MaintenanceRecord, SensorData, User, UserRole } from '../types';
import { api } from '../services/api';
import { SettingsProvider, useSettings } from '../context/SettingsContext';
import { calculateHealthScores, getMachineStatus, SensorValues } from '../utils/healthCalculator';

const SESSION_USER_KEY = 'pdmSessionUser';

interface DashboardContextType {
    data: { machines: Machine[], records: MaintenanceRecord[] };
    user: User | null;
    refreshData: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const useDashboard = () => {
    const context = useContext(DashboardContext);
    if (!context) {
        throw new Error('useDashboard must be used within a DashboardShell');
    }
    return context;
};

// --- Notification Component ---
const NotificationToast = ({ id, message, type, onClose }: { id: number, message: string, type: string, onClose: () => void }) => (
    <div className={`
        max-w-sm w-full p-4 rounded-xl shadow-2xl shadow-black/40 border-l-4 transform transition-all duration-300 animate-fade-in-up
        bg-[#0c1322]/95 backdrop-blur-xl border border-white/[0.08]
        ${type === 'success' ? 'border-l-emerald-500' :
            type === 'error' ? 'border-l-red-500' :
                'border-l-[var(--accent-primary)]'}
    `}>
        <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${type === 'success' ? 'bg-emerald-500/15 text-emerald-400' :
                type === 'error' ? 'bg-red-500/15 text-red-400' :
                    'bg-[var(--accent-primary)]/15 text-[var(--accent-highlight)]'
                }`}>
                {type === 'success' ? <CheckCircle size={20} /> :
                    type === 'error' ? <AlertTriangle size={20} /> :
                        <Activity size={20} />}
            </div>
            <div className="flex-1">
                <h4 className="text-sm font-semibold text-white capitalize">{type}</h4>
                <p className="text-sm text-white/50 mt-1">{message}</p>
            </div>
            <button
                onClick={onClose}
                className="text-white/30 hover:text-white/60 transition-colors"
            >
                <div className="sr-only">Close</div>
                <X size={16} />
            </button>
        </div>
    </div>
);

function DashboardContent({ children }: { children: React.ReactNode }) {
    const [data, setData] = useState<{ machines: Machine[], records: MaintenanceRecord[] }>({ machines: [], records: [] });
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [toasts, setToasts] = useState<any[]>([]);
    const seenIds = React.useRef<Set<number>>(new Set());
    const isFirstLoad = React.useRef(true);
    const router = useRouter();

    let refreshInterval = 5000;
    try {
        const { settings } = useSettings();
        refreshInterval = settings.display.refreshInterval * 1000;
    } catch {
        // Settings not yet available
    }

    const fetchData = async () => {
        if (!user) return;
        try {
            const machinesResp = await api.getMachines(user.address);
            const rawMachines = Array.isArray(machinesResp) ? machinesResp : (machinesResp as any).machines || [];

            const machinesWithSensorData = await Promise.all(rawMachines.map(async (ra: any) => {
                try {
                    const historyResp = await api.getSensorHistory(ra.id);
                    const history = Array.isArray(historyResp) ? historyResp : (historyResp as any).data || [];

                    let sensorData: SensorData[] = history.map((h: any) => ({
                        id: h.id,
                        recordId: h.id,
                        timestamp: h.created_at || new Date(h.timestamp * 1000).toISOString(),
                        airTemperature: h.air_temp,
                        processTemperature: h.process_temp,
                        rotationalSpeed: h.rotation_speed,
                        torque: h.torque,
                        toolWear: h.tool_wear,
                        prediction: h.prediction,
                        prediction_probability: h.prediction_probability,
                        blockchain_tx_hash: h.blockchain_tx_hash,
                        blockchain_success: h.blockchain_success,
                        proof_id: h.proof_id
                    })).reverse();

                    if (sensorData.length === 0) {
                        sensorData = [{
                            recordId: 0,
                            timestamp: new Date().toISOString(),
                            airTemperature: 300,
                            processTemperature: 310,
                            rotationalSpeed: 1500,
                            torque: 40,
                            toolWear: 0
                        }];
                    }

                    const last = history[0];
                    let status = MachineStatus.OPERATIONAL;
                    let mlHealthScore = 98;
                    let engHealthScore = 98;
                    let sensorBreakdown = undefined;

                    if (last) {
                        const sensorValues: SensorValues = {
                            airTemperature: last.air_temp || 300,
                            processTemperature: last.process_temp || 310,
                            rotationalSpeed: last.rotation_speed || 1500,
                            torque: last.torque || 40,
                            toolWear: last.tool_wear || 0
                        };

                        const scores = calculateHealthScores(sensorValues, last.prediction_probability);
                        mlHealthScore = scores.mlScore;
                        engHealthScore = scores.engScore;
                        sensorBreakdown = scores.sensorBreakdown;

                        const statusStr = getMachineStatus(mlHealthScore, engHealthScore);
                        status = MachineStatus[statusStr as keyof typeof MachineStatus];
                    }

                    const avgHealthScore = Math.round((mlHealthScore + engHealthScore) / 2);

                    return {
                        id: String(ra.id),
                        name: ra.name || `Machine ${ra.type} (ID: ${ra.id})`,
                        type: ra.type,
                        location: 'Factory Floor',
                        status: status,
                        installDate: ra.first_seen ? new Date(ra.first_seen * 1000).toISOString().split('T')[0] : '2023-01-01',
                        healthScore: avgHealthScore,
                        mlHealthScore: mlHealthScore,
                        engHealthScore: engHealthScore,
                        lastServiceDate: '2023-12-01',
                        sensorData: sensorData,
                        sensorBreakdown: sensorBreakdown
                    };
                } catch (e) {
                    console.error(`Failed to fetch history for ${ra.id}`, e);
                    return null;
                }
            }));

            const validMachines = machinesWithSensorData.filter(a => a !== null) as Machine[];

            const ledgerResp = await api.getBlockchainLedger();
            const ledgerRecords = Array.isArray(ledgerResp) ? ledgerResp : (ledgerResp as any).records || [];

            setData({
                machines: validMachines,
                records: ledgerRecords
            });

        } catch (err) {
            console.error("Failed to fetch data", err);
        }
    };

    const fetchNotifications = async () => {
        if (!user) return;
        try {
            const notifs = await api.getNotifications(user.address, 50);
            if (notifs && notifs.length > 0) {
                setNotifications(notifs);

                if (isFirstLoad.current) {
                    notifs.forEach((n: any) => seenIds.current.add(n.id));
                    isFirstLoad.current = false;
                } else {
                    const newUnread = notifs.filter((n: any) => !n.is_read && !seenIds.current.has(n.id));

                    if (newUnread.length > 0) {
                        newUnread.forEach((n: any) => seenIds.current.add(n.id));
                        setToasts(prev => [...prev, ...newUnread]);

                        newUnread.forEach((n: any) => {
                            setTimeout(() => {
                                setToasts(prev => prev.filter(t => t.id !== n.id));
                            }, 5000);
                        });
                    }
                }
            } else {
                setNotifications([]);
            }
        } catch (e) {
            console.error("Notif fetch error", e);
        }
    };

    const handleToastClose = (id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    useEffect(() => {
        const stored = sessionStorage.getItem(SESSION_USER_KEY);
        if (stored) {
            try {
                const parsed: User = JSON.parse(stored);
                setUser(parsed);
            } catch {
                sessionStorage.removeItem(SESSION_USER_KEY);
                router.push('/login');
            }
        } else {
            router.push('/login');
        }
        setLoading(false);
    }, [router]);

    useEffect(() => {
        if (user) {
            fetchData();
            fetchNotifications();

            const dataInterval = setInterval(fetchData, refreshInterval);
            const notifInterval = setInterval(fetchNotifications, 10000);

            return () => {
                clearInterval(dataInterval);
                clearInterval(notifInterval);
            };
        }
    }, [user, refreshInterval]);

    const handleLogout = useCallback(() => {
        setUser(null);
        sessionStorage.removeItem(SESSION_USER_KEY);
        api.logout().catch(() => {});
        router.push('/login');
    }, [router]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const ethereum = (window as any).ethereum;
        if (!ethereum) return;

        const handleAccountsChanged = (accounts: string[]) => {
            if (!user) return;
            if (accounts.length === 0) {
                handleLogout();
                return;
            }
            const newAccount = accounts[0].toLowerCase();
            const currentAccount = user.address.toLowerCase();
            if (newAccount !== currentAccount) {
                handleLogout();
            }
        };

        ethereum.on('accountsChanged', handleAccountsChanged);
        return () => {
            ethereum.removeListener('accountsChanged', handleAccountsChanged);
        };
    }, [user, handleLogout]);

    if (loading) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-[#060b14]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-2 border-[var(--accent-primary)]/30 border-t-[var(--accent-highlight)] rounded-full animate-spin" />
                    <p className="text-white/40 text-sm font-medium tracking-wide">Loading session...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return null;
    }

    return (
        <DashboardContext.Provider value={{ data, user, refreshData: fetchData }}>
            <Layout user={user} onLogout={handleLogout}>
                {children}

                {/* Notification Container (Toasts) */}
                <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 pointer-events-none">
                    {toasts.map((n) => (
                        <div key={n.id} className="pointer-events-auto">
                            <NotificationToast
                                id={n.id}
                                message={n.message}
                                type={n.type}
                                onClose={() => handleToastClose(n.id)}
                            />
                        </div>
                    ))}
                </div>
            </Layout>
        </DashboardContext.Provider>
    );
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
    return (
        <SettingsProvider>
            <DashboardContent>{children}</DashboardContent>
        </SettingsProvider>
    );
}

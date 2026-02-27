'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { UserRole } from '@/types';
import { api } from '@/services/api';
import { useDashboard } from '@/components/DashboardShell';
import {
    Trash2, UserPlus, Shield, Check, X, AlertCircle,
    Activity, Zap, RefreshCw, Server, Link2, Clock,
    Play, Radio, Cpu, Database, CheckCircle2, XCircle
} from 'lucide-react';
import { useAdminLogic } from '@/components/hooks/useAdminLogic';

function AutomationStatusPanel() {
    const [state, setState] = useState({
        automationStatus: null as any,
        listenerStatus: null as any,
        loading: true,
        restarting: false,
    });

    const { automationStatus, listenerStatus, loading, restarting } = state;

    const fetchStatus = useCallback(async () => {
        let autoStatus = null;
        let listenStatus = null;
        try {
            [autoStatus, listenStatus] = await Promise.all([
                api.getAutomationStatus().catch(() => null),
                api.getListenerStatus().catch(() => null)
            ]);
        } catch (e) {
            console.error('Failed to fetch automation status', e);
        }
        return { autoStatus, listenStatus };
    }, []);

    useEffect(() => {
        const load = () => fetchStatus().then(({ autoStatus, listenStatus }) => {
            setState(prev => ({ ...prev, automationStatus: autoStatus, listenerStatus: listenStatus, loading: false }));
        });
        load();
        const interval = setInterval(load, 10000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    const handleRestartListener = async () => {
        setState(prev => ({ ...prev, restarting: true }));
        try {
            await api.restartListener();
            const { autoStatus, listenStatus } = await fetchStatus();
            setState(prev => ({ ...prev, automationStatus: autoStatus, listenerStatus: listenStatus, restarting: false }));
        } catch (e: any) {
            let msg = 'Failed to restart listener';
            if (e && e.message) msg = e.message;
            alert(msg);
            setState(prev => ({ ...prev, restarting: false }));
        }
    };

    if (loading) {
        return (
            <div className="rounded-xl p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-white/[0.06] rounded w-1/3"></div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {['skel-admin-1', 'skel-admin-2', 'skel-admin-3', 'skel-admin-4'].map(id => (
                            <div key={id} className="h-24 bg-white/[0.04] rounded-xl"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[var(--accent-primary)]/15 rounded-xl">
                        <Link2 className="w-6 h-6 text-[var(--accent-highlight)]" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Chainlink Automation</h2>
                        <p className="text-sm text-white/40">Backend Oracle Event Listener</p>
                    </div>
                </div>
                <button
                    onClick={fetchStatus}
                    className="p-2 text-white/30 hover:text-white/70 hover:bg-white/[0.06] rounded-lg transition-colors"
                    title="Refresh Status"
                >
                    <RefreshCw size={18} />
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Radio className={`w-4 h-4 ${listenerStatus?.running ? 'text-emerald-400' : 'text-white/30'}`} />
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Listener</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {listenerStatus?.running ? (
                            <>
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                </span>
                                <span className="font-semibold text-emerald-400">Running</span>
                            </>
                        ) : (
                            <>
                                <XCircle className="w-4 h-4 text-red-400" />
                                <span className="font-semibold text-red-400">Stopped</span>
                            </>
                        )}
                    </div>
                    {listenerStatus?.poll_interval && (
                        <p className="text-xs text-white/30 mt-2">Poll: {listenerStatus.poll_interval}s</p>
                    )}
                </div>

                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Cpu className="w-4 h-4 text-white/30" />
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Last Block</span>
                    </div>
                    <p className="font-semibold text-white font-mono">
                        {listenerStatus?.last_processed_block?.toLocaleString() || '-'}
                    </p>
                    <p className="text-xs text-white/30 mt-2">zkSync Era Sepolia</p>
                </div>

                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Clock className="w-4 h-4 text-white/30" />
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Pending</span>
                    </div>
                    <p className="font-semibold text-white text-2xl">
                        {automationStatus?.pending_predictions ?? '-'}
                    </p>
                    <p className="text-xs text-white/30 mt-2">Predictions to process</p>
                </div>

                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">24h Auto</span>
                    </div>
                    <p className="font-semibold text-white text-2xl">
                        {automationStatus?.automated_last_24h ?? '-'}
                    </p>
                    <p className="text-xs text-white/30 mt-2">Automated predictions</p>
                </div>
            </div>

            {listenerStatus?.oracle_contract && (
                <div className="bg-white/[0.03] rounded-xl border border-white/[0.07] p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Backend Oracle Contract</p>
                            <code className="text-sm font-mono text-white/60">{listenerStatus.oracle_contract}</code>
                        </div>
                        <a
                            href={`https://sepolia.explorer.zksync.io/address/${listenerStatus.oracle_contract}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 bg-[var(--accent-primary)]/15 text-[var(--accent-highlight)] rounded-lg text-sm font-medium hover:bg-[var(--accent-primary)]/25 transition-colors"
                        >
                            View on Explorer
                        </a>
                    </div>
                </div>
            )}

            {automationStatus?.failures_detected > 0 && (
                <div className="bg-red-500/10 rounded-xl border border-red-500/20 p-4 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <div>
                        <p className="font-semibold text-red-400">{automationStatus.failures_detected} Failures Detected</p>
                        <p className="text-sm text-red-300">Automated predictions detected potential machine failures in last 24 hours</p>
                    </div>
                </div>
            )}

            <div className="flex gap-3">
                <button
                    onClick={handleRestartListener}
                    disabled={restarting}
                    className="flex items-center gap-2 px-4 py-2 bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08] text-white/60 rounded-lg transition-colors font-medium disabled:opacity-50"
                >
                    <RefreshCw size={16} className={restarting ? 'animate-spin' : ''} />
                    {restarting ? 'Restarting...' : 'Restart Listener'}
                </button>
            </div>
        </div>
    );
}

const AddUserModal: React.FC<any> = ({ isAddModalOpen, setIsAddModalOpen, setFormError, handleAddUser, formError, newUser, updateNewUser, submitting }) => {
    if (!isAddModalOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <div className="bg-[#0c1322]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/50 max-w-md w-full overflow-hidden animate-zoom-in">
                <div className="p-6 border-b border-white/[0.07] flex justify-between items-center">
                    <h2 className="text-lg font-bold text-white">Invite New User</h2>
                    <button onClick={() => { setIsAddModalOpen(false); setFormError(null); }} className="text-white/30 hover:text-white/70">
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleAddUser} className="p-6 space-y-4">
                    {formError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm">
                            <AlertCircle size={16} />{formError}
                        </div>
                    )}
                    <div>
                        <label htmlFor="new-user-address" className="block text-sm font-medium text-white/60 mb-1">Wallet Address <span className="text-red-400">*</span></label>
                        <input id="new-user-address" aria-label="Wallet Address" type="text" required value={newUser.address} onChange={(e) => updateNewUser('address', e.target.value)} placeholder="0x..."
                            className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.07] rounded-lg text-white placeholder:text-white/20 focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] outline-none transition-all" />
                    </div>
                    <div>
                        <label htmlFor="new-user-name" className="block text-sm font-medium text-white/60 mb-1">Full Name <span className="text-red-400">*</span></label>
                        <input id="new-user-name" aria-label="Full Name" type="text" required value={newUser.name} onChange={(e) => updateNewUser('name', e.target.value)} placeholder="Ahmet Yılmaz"
                            className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.07] rounded-lg text-white placeholder:text-white/20 focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] outline-none transition-all" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="new-user-email" className="block text-sm font-medium text-white/60 mb-1">Email</label>
                            <input id="new-user-email" aria-label="Email" type="email" value={newUser.email} onChange={(e) => updateNewUser('email', e.target.value)} placeholder="ahmet@firma.com"
                                className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.07] rounded-lg text-white placeholder:text-white/20 focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] outline-none transition-all" />
                        </div>
                        <div>
                            <label htmlFor="new-user-dept" className="block text-sm font-medium text-white/60 mb-1">Department</label>
                            <input id="new-user-dept" aria-label="Department" type="text" value={newUser.department} onChange={(e) => updateNewUser('department', e.target.value)} placeholder="Üretim"
                                className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.07] rounded-lg text-white placeholder:text-white/20 focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] outline-none transition-all" />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="new-user-role" className="block text-sm font-medium text-white/60 mb-1">Role <span className="text-red-400">*</span></label>
                        <select id="new-user-role" aria-label="Role" value={newUser.role} onChange={(e) => updateNewUser('role', e.target.value as UserRole)}
                            className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.07] rounded-lg text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] outline-none transition-all">
                            <option value={UserRole.OPERATOR} className="bg-[#0a1020]">OPERATOR</option>
                            <option value={UserRole.ENGINEER} className="bg-[#0a1020]">ENGINEER</option>
                            <option value={UserRole.MANAGER} className="bg-[#0a1020]">MANAGER</option>
                        </select>
                    </div>
                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={() => setIsAddModalOpen(false)}
                            className="flex-1 px-4 py-2 border border-white/[0.07] text-white/40 rounded-lg hover:bg-white/[0.04] transition-colors">Cancel</button>
                        <button type="submit" disabled={submitting}
                            className="flex-1 px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/80 text-white rounded-lg transition-colors disabled:opacity-50 font-medium">
                            {submitting ? 'Inviting...' : 'Invite User'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const EditUserModal: React.FC<any> = ({ selectedUser, isEditMode, setIsEditMode, setSelectedUser, setFormError, handleUpdateUser, formError, submitting }) => {
    if (!(selectedUser && isEditMode)) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <div className="bg-[#0c1322]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/50 max-w-md w-full overflow-hidden animate-zoom-in">
                <div className="p-6 border-b border-white/[0.07] flex justify-between items-center">
                    <h2 className="text-lg font-bold text-white">Edit User</h2>
                    <button onClick={() => { setIsEditMode(false); setSelectedUser(null); setFormError(null); }} className="text-white/30 hover:text-white/70"><X size={20} /></button>
                </div>
                <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
                    {formError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm">
                            <AlertCircle size={16} />{formError}
                        </div>
                    )}
                    <div>
                        <label htmlFor="edit-user-name" className="block text-sm font-medium text-white/60 mb-1">Full Name <span className="text-red-400">*</span></label>
                        <input id="edit-user-name" aria-label="Full Name" type="text" required defaultValue={selectedUser.name} name="name"
                            className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.07] rounded-lg text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] outline-none transition-all" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="edit-user-email" className="block text-sm font-medium text-white/60 mb-1">Email</label>
                            <input id="edit-user-email" aria-label="Email" type="email" defaultValue={selectedUser.email} name="email"
                                className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.07] rounded-lg text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] outline-none transition-all" />
                        </div>
                        <div>
                            <label htmlFor="edit-user-dept" className="block text-sm font-medium text-white/60 mb-1">Department</label>
                            <input id="edit-user-dept" aria-label="Department" type="text" defaultValue={selectedUser.department} name="department"
                                className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.07] rounded-lg text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] outline-none transition-all" />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="edit-user-role" className="block text-sm font-medium text-white/60 mb-1">Role <span className="text-red-400">*</span></label>
                        <select id="edit-user-role" aria-label="Role" defaultValue={selectedUser.role} name="role"
                            className="w-full px-3 py-2 bg-white/[0.03] border border-white/[0.07] rounded-lg text-white focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] outline-none transition-all">
                            <option value={UserRole.OPERATOR} className="bg-[#0a1020]">OPERATOR</option>
                            <option value={UserRole.ENGINEER} className="bg-[#0a1020]">ENGINEER</option>
                            <option value={UserRole.MANAGER} className="bg-[#0a1020]">MANAGER</option>
                        </select>
                    </div>
                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={() => { setIsEditMode(false); setSelectedUser(null); }}
                            className="flex-1 px-4 py-2 border border-white/[0.07] text-white/40 rounded-lg hover:bg-white/[0.04] transition-colors">Cancel</button>
                        <button type="submit" disabled={submitting}
                            className="flex-1 px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/80 text-white rounded-lg transition-colors disabled:opacity-50 font-medium">
                            {submitting ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const DeleteConfirmationModal: React.FC<any> = ({ userToDelete, setUserToDelete, confirmDeleteUser }) => {
    if (!userToDelete) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <div className="bg-[#0c1322]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/50 max-w-sm w-full p-6 text-center animate-zoom-in">
                <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4 text-red-400">
                    <Trash2 size={24} />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Delete User?</h2>
                <p className="text-white/40 mb-6">Are you sure you want to delete this user? This action cannot be undone.</p>
                <div className="flex gap-3">
                    <button onClick={() => setUserToDelete(null)}
                        className="flex-1 px-4 py-2 border border-white/[0.07] text-white/40 rounded-lg hover:bg-white/[0.04] transition-colors font-medium">Cancel</button>
                    <button onClick={confirmDeleteUser}
                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium">Delete</button>
                </div>
            </div>
        </div>
    );
};

const UserDetailModal: React.FC<any> = ({ selectedUser, isEditMode, getRoleBadgeColor, setSelectedUser, user, setIsEditMode, setUserToDelete }) => {
    if (!(selectedUser && !isEditMode)) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <div className="bg-[#0c1322]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/50 max-w-lg w-full overflow-hidden animate-zoom-in">
                <div className="p-6 border-b border-white/[0.07] flex justify-between items-start">
                    <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold ${getRoleBadgeColor(selectedUser.role)}`}>
                            {selectedUser.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">{selectedUser.name || 'Unnamed User'}</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(selectedUser.role)}`}>{selectedUser.role}</span>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${selectedUser.status === 'active' ? 'bg-emerald-500/15 text-emerald-300' :
                                    selectedUser.status === 'pending' ? 'bg-amber-500/15 text-amber-300' :
                                        'bg-red-500/15 text-red-300'
                                    }`}>{selectedUser.status || 'active'}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={() => setSelectedUser(null)} className="text-white/30 hover:text-white/70 p-1"><X size={20} /></button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
                        <span className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">Wallet Address</span>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 text-sm font-mono text-white/60 break-all">{selectedUser.address}</code>
                            <a href={`https://sepolia.explorer.zksync.io/address/${selectedUser.address}`} target="_blank" rel="noopener noreferrer"
                                className="px-2 py-1 bg-[var(--accent-primary)]/15 text-[var(--accent-highlight)] rounded text-xs font-medium hover:bg-[var(--accent-primary)]/25 transition-colors">Explorer</a>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {selectedUser.email && (
                            <div>
                                <span className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Email</span>
                                <p className="text-sm text-white/60">{selectedUser.email}</p>
                            </div>
                        )}
                        {selectedUser.department && (
                            <div>
                                <span className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Department</span>
                                <p className="text-sm text-white/60">{selectedUser.department}</p>
                            </div>
                        )}
                        <div>
                            <span className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Created</span>
                            <p className="text-sm text-white/60">{selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleString('tr-TR') : '-'}</p>
                        </div>
                        {selectedUser.activated_at && (
                            <div>
                                <span className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Activated</span>
                                <p className="text-sm text-white/60">{new Date(selectedUser.activated_at).toLocaleString('tr-TR')}</p>
                            </div>
                        )}
                    </div>

                    {selectedUser.blockchain_node_id && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Blockchain Registered</span>
                            </div>
                            <code className="text-xs font-mono text-emerald-300 break-all">Node ID: {selectedUser.blockchain_node_id}</code>
                            {selectedUser.blockchain_registered_at && (
                                <p className="text-xs text-emerald-400 mt-1">{new Date(selectedUser.blockchain_registered_at).toLocaleString('tr-TR')}</p>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-white/[0.07] flex justify-between gap-3">
                    <div className="flex gap-3">
                        {user?.role === UserRole.OWNER && (
                            <button onClick={() => setIsEditMode(true)}
                                className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/80 text-white rounded-lg transition-colors font-medium">Edit</button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        {selectedUser.role !== UserRole.OWNER && (
                            <button onClick={() => { setUserToDelete(selectedUser.address); setSelectedUser(null); }}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium flex items-center gap-2">
                                <Trash2 size={16} /> Delete User
                            </button>
                        )}
                        <button onClick={() => setSelectedUser(null)}
                            className="px-4 py-2 border border-white/[0.07] text-white/40 rounded-lg hover:bg-white/[0.04] transition-colors font-medium">Close</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function AdminPage() {
    const {
        user, users, loading, error, isAddModalOpen,
        newUser, submitting, userToDelete, formError,
        selectedUser, isEditMode,
        loadUsers, handleUpdateUser, handleAddUser,
        confirmDeleteUser, getRoleBadgeColor,
        setIsAddModalOpen, setUserToDelete, setSelectedUser,
        setIsEditMode, setFormError, updateNewUser,
    } = useAdminLogic();

    if (!user) return <div className="p-8 text-center text-white/30">Loading session...</div>;
    if (user.role !== UserRole.OWNER) return <div className="p-8 text-center text-red-400">Access Denied</div>;

    return (
        <div className="space-y-8 animate-fade-in-up">
            <div>
                <h1 className="text-2xl font-bold text-white mb-2">System Administration</h1>
                <p className="text-white/40">Manage users, automation, and system settings.</p>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
                <AutomationStatusPanel />
            </div>

            {/* User Management */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/15 rounded-xl">
                            <Shield className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">User Management</h2>
                            <p className="text-sm text-white/40">Manage system users and roles</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/80 text-white rounded-lg transition-colors font-medium shadow-lg shadow-[var(--accent-primary)]/20"
                    >
                        <UserPlus size={18} />
                        Invite User
                    </button>
                </div>

                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-red-400">
                        <AlertCircle size={20} />
                        {error}
                    </div>
                )}

                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-white/[0.02] border-b border-white/[0.07]">
                                <tr>
                                    {['User', 'Wallet Address', 'Role', 'Status', 'Created', 'Actions'].map((h, i) => (
                                        <th key={h} className={`px-6 py-4 ${i === 5 ? 'text-right' : 'text-left'} text-[10px] font-bold text-white/30 uppercase tracking-widest`}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04]">
                                {users.map((u) => (
                                    <tr
                                        key={u.address}
                                        className="hover:bg-white/[0.04] transition-colors cursor-pointer"
                                        onClick={() => setSelectedUser(u)}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center text-white/40 font-bold text-xs">
                                                    {u.name?.[0]?.toUpperCase() || 'U'}
                                                </div>
                                                <div className="font-medium text-white">{u.name || 'Unnamed User'}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <code className="bg-white/[0.04] px-2 py-1 rounded text-xs font-mono text-white/40">
                                                {u.address.slice(0, 10)}...{u.address.slice(-6)}
                                            </code>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(u.role)}`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${(u as any).status === 'active' ? 'bg-emerald-500/15 text-emerald-300' :
                                                (u as any).status === 'pending' ? 'bg-amber-500/15 text-amber-300' :
                                                    'bg-red-500/15 text-red-300'
                                                }`}>
                                                {(u as any).status || 'active'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-white/40">
                                            {u['created_at'] ? new Date(u['created_at']).toLocaleDateString() : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {u.role !== UserRole.OWNER && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setUserToDelete(u.address); }}
                                                    className="text-white/20 hover:text-red-400 transition-colors p-1"
                                                    title="Delete User"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {users.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-white/30">No users found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Add User Modal */}
            <AddUserModal isAddModalOpen={isAddModalOpen} setIsAddModalOpen={setIsAddModalOpen} setFormError={setFormError} handleAddUser={handleAddUser} formError={formError} newUser={newUser} updateNewUser={updateNewUser} submitting={submitting} />

            {/* Edit User Modal */}
            <EditUserModal selectedUser={selectedUser} isEditMode={isEditMode} setIsEditMode={setIsEditMode} setSelectedUser={setSelectedUser} setFormError={setFormError} handleUpdateUser={handleUpdateUser} formError={formError} submitting={submitting} />

            {/* Delete Confirmation */}
            <DeleteConfirmationModal userToDelete={userToDelete} setUserToDelete={setUserToDelete} confirmDeleteUser={confirmDeleteUser} />

            {/* User Detail Modal */}
            <UserDetailModal selectedUser={selectedUser} isEditMode={isEditMode} getRoleBadgeColor={getRoleBadgeColor} setSelectedUser={setSelectedUser} user={user} setIsEditMode={setIsEditMode} setUserToDelete={setUserToDelete} />
        </div>
    );
}

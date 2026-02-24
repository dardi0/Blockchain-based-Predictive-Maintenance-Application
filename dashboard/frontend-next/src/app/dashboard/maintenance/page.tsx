'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/services/api';
import { useDashboard } from '@/components/DashboardShell';
import {
    Calendar, Wrench, Clock, AlertTriangle, CheckCircle,
    Plus, ChevronLeft, ChevronRight, RefreshCw
} from 'lucide-react';

interface MaintenanceTask {
    id: string;
    machine_id: number;
    machine_type: string;
    task: string;
    due_date: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
    estimated_duration: string;
    notes?: string;
}

export default function MaintenancePage() {
    const { user } = useDashboard();
    const [schedule, setSchedule] = useState<MaintenanceTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [showAddModal, setShowAddModal] = useState(false);
    const [newTask, setNewTask] = useState({
        machine_id: 1001,
        task: '',
        due_date: '',
        priority: 'MEDIUM'
    });

    const fetchSchedule = async () => {
        setLoading(true);
        try {
            const data = await api.getMaintenanceSchedule();
            setSchedule(Array.isArray(data) ? data : (data as any).schedule || []);
        } catch (error) {
            console.error('Failed to fetch schedule:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSchedule();
    }, []);

    const handleAddTask = async () => {
        if (!newTask.task || !newTask.due_date) return;
        try {
            await api.createMaintenanceTask(
                newTask.machine_id,
                newTask.task,
                newTask.due_date,
                newTask.priority,
                user?.address || ''
            );
            setShowAddModal(false);
            setNewTask({ machine_id: 1001, task: '', due_date: '', priority: 'MEDIUM' });
            fetchSchedule();
        } catch (error) {
            console.error('Failed to create task:', error);
        }
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'HIGH': return 'bg-red-500/15 text-red-400 border-red-500/20';
            case 'MEDIUM': return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
            default: return 'bg-[var(--accent-primary)]/15 text-[var(--accent-highlight)] border-[var(--accent-primary)]/20';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'COMPLETED': return <CheckCircle size={16} className="text-emerald-400" />;
            case 'IN_PROGRESS': return <RefreshCw size={16} className="text-[var(--accent-highlight)] animate-spin" />;
            default: return <Clock size={16} className="text-amber-400" />;
        }
    };

    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const getTasksForDate = (day: number) => {
        const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return schedule.filter(task => task.due_date === dateStr);
    };

    const navigateMonth = (direction: number) => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1));
    };

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30">
                            <Calendar className="text-emerald-400" size={22} />
                        </div>
                        Maintenance Calendar
                    </h1>
                    <p className="text-white/40 mt-1">
                        Schedule and track maintenance tasks
                    </p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-highlight)] text-white rounded-lg hover:shadow-lg hover:shadow-[var(--accent-primary)]/25 transition-all"
                >
                    <Plus size={18} />
                    Add Task
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Calendar */}
                <div className="lg:col-span-2 relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                    <div className="absolute top-0 left-0 w-10 h-px bg-gradient-to-r from-[var(--accent-primary)] to-transparent" />
                    <div className="absolute top-0 left-0 h-10 w-px bg-gradient-to-b from-[var(--accent-primary)] to-transparent" />
                    {/* Calendar Header */}
                    <div className="flex items-center justify-between mb-6">
                        <button
                            onClick={() => navigateMonth(-1)}
                            className="p-2 hover:bg-white/[0.06] rounded-lg transition-colors"
                        >
                            <ChevronLeft size={20} className="text-white/40" />
                        </button>
                        <h2 className="text-xl font-bold text-white">
                            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                        </h2>
                        <button
                            onClick={() => navigateMonth(1)}
                            className="p-2 hover:bg-white/[0.06] rounded-lg transition-colors"
                        >
                            <ChevronRight size={20} className="text-white/40" />
                        </button>
                    </div>

                    {/* Day Headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                            <div key={day} className="text-center text-sm font-medium text-white/40 py-2">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
                            <div key={`empty-${idx}`} className="h-24 p-1"></div>
                        ))}

                        {Array.from({ length: daysInMonth }).map((_, idx) => {
                            const day = idx + 1;
                            const tasks = getTasksForDate(day);
                            const isToday = new Date().toDateString() === new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).toDateString();

                            return (
                                <div
                                    key={day}
                                    className={`h-24 p-1 border rounded-lg transition-colors ${
                                        isToday
                                            ? 'border-emerald-500/50 bg-emerald-500/10'
                                            : 'border-white/[0.05] hover:bg-white/[0.04]'
                                    }`}
                                >
                                    <div className={`text-sm font-medium mb-1 ${isToday ? 'text-emerald-400' : 'text-white/40'}`}>
                                        {day}
                                    </div>
                                    <div className="space-y-0.5 overflow-y-auto max-h-16">
                                        {tasks.map(task => (
                                            <div
                                                key={task.id}
                                                className={`text-xs px-1.5 py-0.5 rounded truncate ${
                                                    task.priority === 'HIGH' ? 'bg-red-500/20 text-red-400' :
                                                    task.priority === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                                                    'bg-[var(--accent-primary)]/20 text-[var(--accent-highlight)]'
                                                }`}
                                                title={task.task}
                                            >
                                                {task.machine_type}: {task.task.substring(0, 15)}...
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Upcoming Tasks */}
                <div className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
                    <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-emerald-500 to-transparent" />
                    <div className="absolute top-0 left-0 h-8 w-px bg-gradient-to-b from-emerald-500 to-transparent" />
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Wrench className="text-emerald-400" />
                        Upcoming Tasks
                    </h3>

                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <RefreshCw className="animate-spin text-[var(--accent-primary)]" size={24} />
                        </div>
                    ) : schedule.length > 0 ? (
                        <div className="space-y-3 max-h-[500px] overflow-y-auto">
                            {schedule.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()).map(task => (
                                <div
                                    key={task.id}
                                    className={`p-4 rounded-xl border ${getPriorityColor(task.priority)}`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                                                task.machine_type === 'L' ? 'bg-[var(--accent-primary)] text-white' :
                                                task.machine_type === 'M' ? 'bg-emerald-500 text-white' :
                                                'bg-violet-500 text-white'
                                            }`}>
                                                {task.machine_type}
                                            </span>
                                            <div>
                                                <p className="font-medium text-white text-sm">
                                                    {task.task}
                                                </p>
                                                <p className="text-xs text-white/40">
                                                    Machine {task.machine_id}
                                                </p>
                                            </div>
                                        </div>
                                        {getStatusIcon(task.status)}
                                    </div>

                                    <div className="mt-3 flex items-center justify-between text-xs">
                                        <span className="flex items-center gap-1 text-white/40">
                                            <Calendar size={12} />
                                            {new Date(task.due_date).toLocaleDateString()}
                                        </span>
                                        <span className="flex items-center gap-1 text-white/40">
                                            <Clock size={12} />
                                            {task.estimated_duration}
                                        </span>
                                    </div>

                                    {task.notes && (
                                        <p className="mt-2 text-xs text-white/30 italic">
                                            {task.notes}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-white/30">
                            <Wrench size={48} className="mx-auto mb-4 opacity-50" />
                            <p>No maintenance tasks scheduled</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Add Task Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
                    <div className="bg-[#0c1322]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/50 w-full max-w-md p-6 animate-zoom-in">
                        <h3 className="text-lg font-semibold text-white mb-4">
                            Add Maintenance Task
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-white/60 mb-1">
                                    Machine
                                </label>
                                <select
                                    value={newTask.machine_id}
                                    onChange={(e) => setNewTask({ ...newTask, machine_id: Number(e.target.value) })}
                                    className="w-full p-2 border border-white/[0.07] rounded-lg bg-white/[0.03] text-white"
                                >
                                    <option value={1001} className="bg-[#0a1020]">L (ID: 1001)</option>
                                    <option value={2001} className="bg-[#0a1020]">M (ID: 2001)</option>
                                    <option value={3001} className="bg-[#0a1020]">H (ID: 3001)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-white/60 mb-1">
                                    Task Description
                                </label>
                                <input
                                    type="text"
                                    value={newTask.task}
                                    onChange={(e) => setNewTask({ ...newTask, task: e.target.value })}
                                    placeholder="e.g., Tool Replacement"
                                    className="w-full p-2 border border-white/[0.07] rounded-lg bg-white/[0.03] text-white placeholder:text-white/20"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-white/60 mb-1">
                                    Due Date
                                </label>
                                <input
                                    type="date"
                                    value={newTask.due_date}
                                    onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                                    className="w-full p-2 border border-white/[0.07] rounded-lg bg-white/[0.03] text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-white/60 mb-1">
                                    Priority
                                </label>
                                <select
                                    value={newTask.priority}
                                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                                    className="w-full p-2 border border-white/[0.07] rounded-lg bg-white/[0.03] text-white"
                                >
                                    <option value="LOW" className="bg-[#0a1020]">Low</option>
                                    <option value="MEDIUM" className="bg-[#0a1020]">Medium</option>
                                    <option value="HIGH" className="bg-[#0a1020]">High</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="flex-1 py-2 border border-white/[0.07] rounded-lg text-white/40 hover:bg-white/[0.04] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddTask}
                                className="flex-1 py-2 bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-highlight)] text-white rounded-lg hover:shadow-lg hover:shadow-[var(--accent-primary)]/25 transition-all"
                            >
                                Add Task
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

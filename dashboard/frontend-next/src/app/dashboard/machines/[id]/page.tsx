'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useDashboard } from '@/components/DashboardShell';
import { Machine, MachineStatus } from '@/types';
import {
    ArrowLeft, Activity, Brain, Wrench, ThermometerSun,
    Gauge, Timer, Zap, AlertTriangle, CheckCircle
} from 'lucide-react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, Cell, ReferenceLine
} from 'recharts';

export default function MachineDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const id = params?.id as string;
    const { data } = useDashboard();
    const [machine, setMachine] = useState<Machine | null>(null);

    useEffect(() => {
        if (data.machines.length > 0) {
            const found = data.machines.find(m => m.id === id);
            if (found) {
                setMachine(found);
            }
        }
    }, [data.machines, id]);

    if (!machine) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    // Gauge rotation calculations
    const mlScore = machine.mlHealthScore ?? machine.healthScore;
    const engScore = machine.engHealthScore ?? machine.healthScore;

    const mlRotation = (mlScore / 100) * 180 - 90;
    const engRotation = (engScore / 100) * 180 - 90;

    // Sensor Breakdown Data for Chart
    const sensorBreakdownData = [
        { name: 'Air Temp', score: machine.sensorBreakdown?.airTemp ?? 100, val: machine.sensorData[0]?.airTemperature },
        { name: 'Process Temp', score: machine.sensorBreakdown?.processTemp ?? 100, val: machine.sensorData[0]?.processTemperature },
        { name: 'Rotational', score: machine.sensorBreakdown?.rotationalSpeed ?? 100, val: machine.sensorData[0]?.rotationalSpeed },
        { name: 'Torque', score: machine.sensorBreakdown?.torque ?? 100, val: machine.sensorData[0]?.torque },
        { name: 'Tool Wear', score: machine.sensorBreakdown?.toolWear ?? 100, val: machine.sensorData[0]?.toolWear },
    ];

    const getScoreColor = (score: number) => {
        if (score < 50) return '#ef4444'; // Red
        if (score < 80) return '#f59e0b'; // Amber
        return '#10b981'; // Emerald
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => router.back()}
                    className="p-2 rounded-lg bg-white dark:bg-[var(--dark-bg)] hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700"
                >
                    <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        {machine.name}
                        <span className="text-sm px-3 py-1 rounded-full bg-slate-100 dark:bg-[var(--dark-bg)] text-slate-500 font-normal">
                            ID: {machine.id}
                        </span>
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        Type {machine.type} • {machine.location} • Installed {new Date(machine.installDate).toLocaleDateString()}
                    </p>
                </div>
                <div className={`px-4 py-2 rounded-lg flex items-center gap-2 font-semibold ${machine.status === MachineStatus.CRITICAL ? 'bg-red-100 text-red-700 dark:bg-red-900/30' :
                    machine.status === MachineStatus.WARNING ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30' :
                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30'
                    }`}>
                    {machine.status === MachineStatus.CRITICAL ? <AlertTriangle size={20} /> :
                        machine.status === MachineStatus.WARNING ? <Activity size={20} /> :
                            <CheckCircle size={20} />}
                    {machine.status}
                </div>
            </div>

            {/* Top Row: Dual Health Scores */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* ML Health Score */}
                <div className="bg-white dark:bg-[var(--dark-bg)] rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Brain size={120} />
                    </div>
                    <div className="relative z-10 flex flex-col items-center">
                        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                            <Brain className="text-violet-500" size={20} />
                            AI Prediction Health Score
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 text-center max-w-xs">
                            Predicted failure probability based on AI model analysis.
                        </p>

                        <div className="relative w-64 h-32 overflow-hidden">
                            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 50">
                                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-100 dark:text-slate-700" />
                                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="url(#mlGradient)" strokeWidth="8" strokeDasharray={`${mlScore * 1.26} 126`} strokeLinecap="round" />
                                <defs>
                                    <linearGradient id="mlGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#ef4444" />
                                        <stop offset="50%" stopColor="#f59e0b" />
                                        <stop offset="100%" stopColor="#8b5cf6" />
                                    </linearGradient>
                                </defs>
                            </svg>
                            <div className="absolute bottom-0 left-1/2 w-1 h-20 bg-violet-600 origin-bottom transition-transform duration-1000" style={{ transform: `translateX(-50%) rotate(${mlRotation}deg)` }} />
                        </div>
                        <div className="mt-4 text-center">
                            <span className="text-5xl font-bold text-slate-900 dark:text-white">{mlScore}%</span>
                            <div className="text-sm text-slate-500 mt-1">Health Confidence</div>
                        </div>
                    </div>
                </div>

                {/* Engineering Health Score */}
                <div className="bg-white dark:bg-[var(--dark-bg)] rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Wrench size={120} />
                    </div>
                    <div className="relative z-10 flex flex-col items-center">
                        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                            <Wrench className="text-emerald-500" size={20} />
                            Engineering Health Score
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 text-center max-w-xs">
                            Weighted average of sensor health based on operational limits.
                        </p>

                        <div className="relative w-64 h-32 overflow-hidden">
                            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 50">
                                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-100 dark:text-slate-700" />
                                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="url(#engGradient)" strokeWidth="8" strokeDasharray={`${engScore * 1.26} 126`} strokeLinecap="round" />
                                <defs>
                                    <linearGradient id="engGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#ef4444" />
                                        <stop offset="50%" stopColor="#f59e0b" />
                                        <stop offset="100%" stopColor="#10b981" />
                                    </linearGradient>
                                </defs>
                            </svg>
                            <div className="absolute bottom-0 left-1/2 w-1 h-20 bg-emerald-600 origin-bottom transition-transform duration-1000" style={{ transform: `translateX(-50%) rotate(${engRotation}deg)` }} />
                        </div>
                        <div className="mt-4 text-center">
                            <span className="text-5xl font-bold text-slate-900 dark:text-white">{engScore}%</span>
                            <div className="text-sm text-slate-500 mt-1">Operational Health</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Middle Row: Engineering Breakdown & Sensor Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Engineering Breakdown Chart */}
                <div className="lg:col-span-2 bg-white dark:bg-[var(--dark-bg)] rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                        <Activity size={20} className="text-[var(--accent-primary)]" />
                        Component Health Breakdown
                    </h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={sensorBreakdownData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#94a3b8" opacity={0.1} />
                                <XAxis type="number" domain={[0, 100]} hide />
                                <YAxis dataKey="name" type="category" width={100} tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    formatter={(value: number) => [`${value}%`, 'Health Score']}
                                />
                                <ReferenceLine x={100} stroke="#e2e8f0" strokeOpacity={0.5} />
                                <Bar dataKey="score" radius={[0, 4, 4, 0] as [number, number, number, number]} barSize={24} background={{ fill: '#f1f5f9' }}>
                                    {sensorBreakdownData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={getScoreColor(entry.score)} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-4 text-center text-xs text-slate-500">
                        <div className="flex items-center justify-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-emerald-500"></span> Healthy (80-100%)
                        </div>
                        <div className="flex items-center justify-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-amber-500"></span> Warning (50-79%)
                        </div>
                        <div className="flex items-center justify-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-red-500"></span> Critical (0-49%)
                        </div>
                    </div>
                </div>

                {/* Latest Sensor Value Cards */}
                <div className="space-y-4">
                    {sensorBreakdownData.map((item, idx) => (
                        <div key={idx} className="bg-white dark:bg-[var(--dark-bg)] p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${item.name === 'Air Temp' || item.name === 'Process Temp' ? 'bg-orange-100 text-orange-600' :
                                    item.name === 'Torque' ? 'bg-[var(--accent-highlight)]/20 text-[var(--accent-primary)]' :
                                        item.name === 'Rotational' ? 'bg-purple-100 text-purple-600' :
                                            'bg-amber-100 text-amber-600'
                                    }`}>
                                    {item.name.includes('Temp') ? <ThermometerSun size={18} /> :
                                        item.name === 'Torque' ? <Zap size={18} /> :
                                            item.name === 'Rotational' ? <Gauge size={18} /> :
                                                <Timer size={18} />}
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.name}</p>
                                    <p className="font-bold text-slate-800 dark:text-white">
                                        {typeof item.val === 'number' ? item.val.toFixed(1) : 'N/A'}
                                        <span className="text-xs font-normal text-slate-400 ml-1">
                                            {item.name.includes('Temp') ? 'K' : item.name === 'Rotational' ? 'rpm' : item.name === 'Torque' ? 'Nm' : 'min'}
                                        </span>
                                    </p>
                                </div>
                            </div>
                            <div className={`text-xs font-bold px-2 py-1 rounded ${item.score >= 80 ? 'bg-emerald-100 text-emerald-700' :
                                item.score >= 50 ? 'bg-amber-100 text-amber-700' :
                                    'bg-red-100 text-red-700'
                                }`}>
                                {item.score}%
                            </div>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
}

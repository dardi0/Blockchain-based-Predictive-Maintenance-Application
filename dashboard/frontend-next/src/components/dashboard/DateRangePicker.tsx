'use client';

import React, { useState } from 'react';
import { Calendar } from 'lucide-react';

interface DateRangePickerProps {
    onChange: (startDate: string, endDate: string) => void;
    startDate?: string;
    endDate?: string;
}

function toInputDate(d: Date): string {
    return d.toISOString().split('T')[0];
}

const PRESETS = [
    {
        label: 'This Week',
        getRange: () => {
            const now = new Date();
            const start = new Date(now);
            start.setDate(now.getDate() - now.getDay());
            return { start: toInputDate(start), end: toInputDate(now) };
        },
    },
    {
        label: 'This Month',
        getRange: () => {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            return { start: toInputDate(start), end: toInputDate(now) };
        },
    },
    {
        label: 'Last 3 Months',
        getRange: () => {
            const now = new Date();
            const start = new Date(now);
            start.setMonth(now.getMonth() - 3);
            return { start: toInputDate(start), end: toInputDate(now) };
        },
    },
    {
        label: 'Last 7 Days',
        getRange: () => {
            const now = new Date();
            const start = new Date(now);
            start.setDate(now.getDate() - 7);
            return { start: toInputDate(start), end: toInputDate(now) };
        },
    },
];

export function DateRangePicker({ onChange, startDate, endDate }: DateRangePickerProps) {
    const [start, setStart] = useState(() => startDate || toInputDate(new Date(Date.now() - 7 * 86400000)));
    const [end, setEnd] = useState(() => endDate || toInputDate(new Date()));
    const today = toInputDate(new Date());
    const [activePreset, setActivePreset] = useState<string | null>('Last 7 Days');

    const handlePreset = (preset: typeof PRESETS[0]) => {
        const { start: s, end: e } = preset.getRange();
        setStart(s);
        setEnd(e);
        setActivePreset(preset.label);
        onChange(s, e);
    };

    const handleManualChange = (newStart: string, newEnd: string) => {
        setStart(newStart);
        setEnd(newEnd);
        setActivePreset(null);
        if (newStart && newEnd && newStart <= newEnd) {
            onChange(newStart, newEnd);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* Presets */}
            <div className="flex gap-1">
                {PRESETS.map((preset) => (
                    <button
                        key={preset.label}
                        onClick={() => handlePreset(preset)}
                        className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                            activePreset === preset.label
                                ? 'bg-[var(--accent-primary)] text-white'
                                : 'bg-white/[0.04] text-white/50 hover:text-white/80 hover:bg-white/[0.07] border border-white/[0.06]'
                        }`}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>

            {/* Separator */}
            <span className="text-white/20 text-xs">|</span>

            {/* Custom range */}
            <div className="flex items-center gap-2">
                <Calendar size={14} className="text-white/30" />
                <input
                    type="date"
                    value={start}
                    max={end || today}
                    aria-label="Start date"
                    onChange={(e) => handleManualChange(e.target.value, end)}
                    className="px-2 py-1.5 bg-white/[0.03] border border-white/[0.07] rounded-lg text-xs text-white/70 focus:outline-none focus:border-[var(--accent-primary)]/50"
                />
                <span className="text-white/30 text-xs">to</span>
                <input
                    type="date"
                    value={end}
                    min={start}
                    max={today}
                    aria-label="End date"
                    onChange={(e) => handleManualChange(start, e.target.value)}
                    className="px-2 py-1.5 bg-white/[0.03] border border-white/[0.07] rounded-lg text-xs text-white/70 focus:outline-none focus:border-[var(--accent-primary)]/50"
                />
            </div>
        </div>
    );
}

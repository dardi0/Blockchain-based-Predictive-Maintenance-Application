/**
 * Shared formatting utilities — reads user settings.
 */

type DateFormat = 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
type TempUnit = 'K' | 'C' | 'F';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Format a timestamp according to the user's dateFormat setting.
 * Accepts ISO string, unix seconds (< 1e12), or unix ms.
 */
export function formatDate(
    timestamp: string | number | Date | null | undefined,
    format: DateFormat = 'DD.MM.YYYY',
    includeTime = true
): string {
    if (!timestamp) return '—';
    let d: Date;
    if (timestamp instanceof Date) {
        d = timestamp;
    } else if (typeof timestamp === 'number') {
        d = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
    } else {
        d = new Date(timestamp);
    }
    if (isNaN(d.getTime())) return '—';

    const day   = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year  = d.getFullYear();
    const hours = pad(d.getHours());
    const mins  = pad(d.getMinutes());

    let datePart: string;
    switch (format) {
        case 'MM/DD/YYYY': datePart = `${month}/${day}/${year}`; break;
        case 'YYYY-MM-DD': datePart = `${year}-${month}-${day}`; break;
        default:           datePart = `${day}.${month}.${year}`;
    }

    return includeTime ? `${datePart} ${hours}:${mins}` : datePart;
}

/**
 * Convert a Kelvin temperature to the user's preferred unit.
 */
export function formatTemp(kelvin: number | null | undefined, unit: TempUnit = 'K'): string {
    if (kelvin == null || isNaN(kelvin)) return '—';
    if (unit === 'C') return `${(kelvin - 273.15).toFixed(1)} °C`;
    if (unit === 'F') return `${((kelvin - 273.15) * 9 / 5 + 32).toFixed(1)} °F`;
    return `${kelvin.toFixed(1)} K`;
}

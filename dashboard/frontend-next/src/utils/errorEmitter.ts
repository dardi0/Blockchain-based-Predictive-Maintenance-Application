/**
 * Global hata yayıcısı — herhangi bir bileşen/hook'tan çağrılabilir.
 * DashboardShell bu olayı dinler ve toast olarak gösterir.
 */
export function emitError(message: string): void {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pdm:error', { detail: { message } }));
    }
}

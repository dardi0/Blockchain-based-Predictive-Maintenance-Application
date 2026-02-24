/**
 * Secure API Client
 * Handles authentication tokens and secure request management
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Session storage keys
const AUTH_TOKEN_KEY = 'pdm_auth_token';
const AUTH_EXPIRY_KEY = 'pdm_auth_expiry';
const WALLET_ADDRESS_KEY = 'pdm_wallet_address';

interface AuthToken {
    token: string;
    expiresAt: number;
    walletAddress: string;
}

class ApiClient {
    private authToken: AuthToken | null = null;

    constructor() {
        // Restore token from session storage on init
        if (typeof window !== 'undefined') {
            this.restoreSession();
        }
    }

    /**
     * Restore session from storage
     */
    private restoreSession(): void {
        try {
            const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
            const expiry = sessionStorage.getItem(AUTH_EXPIRY_KEY);
            const wallet = sessionStorage.getItem(WALLET_ADDRESS_KEY);

            if (token && expiry && wallet) {
                const expiresAt = parseInt(expiry, 10);
                if (Date.now() < expiresAt) {
                    this.authToken = {
                        token,
                        expiresAt,
                        walletAddress: wallet
                    };
                } else {
                    // Token expired, clear storage
                    this.clearSession();
                }
            }
        } catch (e) {
            console.warn('Failed to restore session:', e);
        }
    }

    /**
     * Save session to storage
     */
    private saveSession(token: AuthToken): void {
        try {
            sessionStorage.setItem(AUTH_TOKEN_KEY, token.token);
            sessionStorage.setItem(AUTH_EXPIRY_KEY, token.expiresAt.toString());
            sessionStorage.setItem(WALLET_ADDRESS_KEY, token.walletAddress);
        } catch (e) {
            console.warn('Failed to save session:', e);
        }
    }

    /**
     * Clear session
     */
    public clearSession(): void {
        this.authToken = null;
        try {
            sessionStorage.removeItem(AUTH_TOKEN_KEY);
            sessionStorage.removeItem(AUTH_EXPIRY_KEY);
            sessionStorage.removeItem(WALLET_ADDRESS_KEY);
        } catch (e) {
            console.warn('Failed to clear session:', e);
        }
    }

    /**
     * Set authentication from login
     * In a real implementation, this would be a JWT from the server
     */
    public setAuth(walletAddress: string, signature: string): void {
        // Create a simple session token (hash of wallet + timestamp)
        // In production, this should be a proper JWT from the server
        const token = btoa(`${walletAddress}:${Date.now()}:${signature.slice(0, 20)}`);
        const expiresAt = Date.now() + (60 * 60 * 1000); // 1 hour

        this.authToken = {
            token,
            expiresAt,
            walletAddress
        };

        this.saveSession(this.authToken);
    }

    /**
     * Check if authenticated
     */
    public isAuthenticated(): boolean {
        if (!this.authToken) return false;
        return Date.now() < this.authToken.expiresAt;
    }

    /**
     * Get current wallet address
     */
    public getWalletAddress(): string | null {
        return this.authToken?.walletAddress || null;
    }

    /**
     * Build headers for API requests
     */
    private buildHeaders(additionalHeaders?: Record<string, string>): HeadersInit {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...additionalHeaders
        };

        // Add auth header if authenticated
        if (this.authToken && this.isAuthenticated()) {
            // Use Authorization header instead of exposing wallet address directly
            headers['Authorization'] = `Bearer ${this.authToken.token}`;
            // Still include wallet address for backward compatibility but in a safer way
            headers['X-Wallet-Address'] = this.authToken.walletAddress;
        }

        return headers;
    }

    /**
     * Generic GET request
     */
    public async get<T>(endpoint: string, options?: {
        headers?: Record<string, string>;
        requireAuth?: boolean;
    }): Promise<T> {
        if (options?.requireAuth && !this.isAuthenticated()) {
            throw new Error('Authentication required');
        }

        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'GET',
            headers: this.buildHeaders(options?.headers),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Request failed' }));
            throw new Error(error.detail || `HTTP ${response.status}`);
        }

        return response.json();
    }

    /**
     * Generic POST request
     */
    public async post<T>(endpoint: string, body?: unknown, options?: {
        headers?: Record<string, string>;
        requireAuth?: boolean;
    }): Promise<T> {
        if (options?.requireAuth && !this.isAuthenticated()) {
            throw new Error('Authentication required');
        }

        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: this.buildHeaders(options?.headers),
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Request failed' }));
            throw new Error(error.detail || `HTTP ${response.status}`);
        }

        return response.json();
    }

    /**
     * Generic PUT request
     */
    public async put<T>(endpoint: string, body?: unknown, options?: {
        headers?: Record<string, string>;
        requireAuth?: boolean;
    }): Promise<T> {
        if (options?.requireAuth && !this.isAuthenticated()) {
            throw new Error('Authentication required');
        }

        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'PUT',
            headers: this.buildHeaders(options?.headers),
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Request failed' }));
            throw new Error(error.detail || `HTTP ${response.status}`);
        }

        return response.json();
    }

    /**
     * Generic DELETE request
     */
    public async delete<T>(endpoint: string, options?: {
        headers?: Record<string, string>;
        requireAuth?: boolean;
    }): Promise<T> {
        if (options?.requireAuth && !this.isAuthenticated()) {
            throw new Error('Authentication required');
        }

        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'DELETE',
            headers: this.buildHeaders(options?.headers),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Request failed' }));
            throw new Error(error.detail || `HTTP ${response.status}`);
        }

        return response.json();
    }
}

// Singleton instance
export const apiClient = new ApiClient();
export default apiClient;

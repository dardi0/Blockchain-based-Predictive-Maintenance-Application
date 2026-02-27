import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { UserRole, User } from '../../types';
import { api } from '../../services/api';

type AuthMode = 'LOGIN' | 'REGISTER';

interface LoginState {
    mode: AuthMode | null;
    connecting: boolean;
    selectedRole: UserRole | null;
    error: string | null;
    successMessage: string | null;
    mounted: boolean;
}

export function useLoginLogic(onLogin: (user: User) => void, initialMode: AuthMode | null = null) {
    const router = useRouter();

    const [state, setState] = useState<LoginState>({
        mode: initialMode,
        connecting: false,
        selectedRole: null,
        error: null,
        successMessage: null,
        mounted: false,
    });

    const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setState(prev => ({ ...prev, mounted: true }));
        return () => {
            if (redirectTimer.current) clearTimeout(redirectTimer.current);
        };
    }, []);

    const setMode = useCallback((mode: AuthMode | null) => {
        setState(prev => ({ ...prev, mode }));
    }, []);

    const connectWallet = useCallback(async (role?: UserRole) => {
        setState(prev => ({
            ...prev,
            connecting: true,
            error: null,
            successMessage: null,
        }));
        if (redirectTimer.current) {
            clearTimeout(redirectTimer.current);
            redirectTimer.current = null;
        }

        const targetRole = role || state.selectedRole;

        if (typeof (window as any).ethereum !== 'undefined') {
            try {
                let account: string;
                try {
                    await (window as any).ethereum.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
                    const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
                    if (!accounts || accounts.length === 0) {
                        setState(prev => ({ ...prev, error: 'No account selected.', connecting: false }));
                        return;
                    }
                    account = accounts[0];
                } catch (permError: any) {
                    if (permError.code === 4200 || permError.code === -32601) {
                        const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
                        account = accounts[0];
                    } else { throw permError; }
                }

                const message = `Login to ZeroPdM AI\nTimestamp: ${new Date().getTime()}`;
                const signature = await (window as any).ethereum.request({ method: 'personal_sign', params: [message, account] });

                if (state.mode === 'LOGIN') {
                    try {
                        const response = await api.login(account, signature, message);
                        onLogin(response.user);
                        setState(prev => ({ ...prev, connecting: false }));
                    } catch (err: any) {
                        setState(prev => ({ ...prev, error: err.message || "Login failed. Please register first.", connecting: false }));
                    }
                } else if (state.mode === 'REGISTER') {
                    if (!targetRole) {
                        setState(prev => ({ ...prev, error: "Please select a role first.", connecting: false }));
                        return;
                    }
                    try {
                        await api.register(account, targetRole, signature, message);
                        setState(prev => ({
                            ...prev,
                            successMessage: "Registration successful! Redirecting to login...",
                            mode: null,
                            selectedRole: null,
                            connecting: false,
                        }));
                        redirectTimer.current = setTimeout(() => router.replace('/'), 2000);
                        return;
                    } catch (err: any) {
                        setState(prev => ({ ...prev, error: err.message || "Registration failed.", connecting: false }));
                    }
                }
            } catch (err: any) {
                setState(prev => ({ ...prev, error: err.message || 'User rejected the request.', connecting: false }));
            }
        } else {
            setState(prev => ({ ...prev, error: 'MetaMask is not installed. Please install it to continue.', connecting: false }));
        }
    }, [state.mode, state.selectedRole, onLogin, router]);

    const handleRoleSelect = useCallback((role: UserRole) => {
        setState(prev => ({ ...prev, selectedRole: role }));
        connectWallet(role);
    }, [connectWallet]);

    const reset = useCallback(() => {
        setState(prev => ({
            ...prev,
            mode: null,
            error: null,
            successMessage: null,
            selectedRole: null,
            connecting: false,
        }));
        if (redirectTimer.current) {
            clearTimeout(redirectTimer.current);
            redirectTimer.current = null;
        }
    }, []);

    const clearError = useCallback(() => {
        setState(prev => ({ ...prev, error: null }));
    }, []);

    return {
        ...state,
        setMode,
        connectWallet,
        handleRoleSelect,
        reset,
        clearError,
    };
}

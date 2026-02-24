'use client';

import LoginScreen from '@/components/LoginScreen';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types';

export default function LoginPage() {
    const router = useRouter();

    // Clear session on login page load to prevent loops
    useEffect(() => {
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem('pdmSessionUser');
            sessionStorage.removeItem('pdm_auth_token');
            sessionStorage.removeItem('pdm_token_expiry');
        }
    }, []);

    const handleLogin = (user: User) => {
        sessionStorage.setItem('pdmSessionUser', JSON.stringify(user));
        router.push('/dashboard');
    };

    return <LoginScreen onLogin={handleLogin} />;
}

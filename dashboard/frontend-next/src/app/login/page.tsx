'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LoginScreen from '@/components/LoginScreen';
import { User } from '@/types';

export default function LoginPage() {
    const router = useRouter();
    const [initialMode] = useState<'LOGIN' | 'REGISTER' | null>(() => {
        if (typeof window === 'undefined') return null;
        return new URLSearchParams(window.location.search).get('mode') as 'LOGIN' | 'REGISTER' | null;
    });

    useEffect(() => {
        sessionStorage.removeItem('pdmSessionUser');
        sessionStorage.removeItem('pdm_auth_token');
        sessionStorage.removeItem('pdm_token_expiry');
    }, []);

    const handleLogin = (user: User) => {
        sessionStorage.setItem('pdmSessionUser', JSON.stringify(user));
        router.push('/dashboard');
    };

    return <LoginScreen onLogin={handleLogin} initialMode={initialMode} />;
}

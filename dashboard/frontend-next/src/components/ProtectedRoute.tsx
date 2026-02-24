'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useDashboard } from '@/components/DashboardShell';
import { useAccessControl, UserRole, Resource, AccessLevel } from '@/hooks/useAccessControl';
import { AlertTriangle, Shield, Lock } from 'lucide-react';

interface ProtectedRouteProps {
    children: React.ReactNode;
    /** Required roles (user must have at least one) */
    requiredRoles?: UserRole[];
    /** Required resource access */
    requiredResource?: Resource;
    /** Minimum access level for resource */
    requiredAccessLevel?: AccessLevel;
    /** Custom fallback component when access denied */
    fallback?: React.ReactNode;
    /** Redirect to login if not authenticated */
    redirectToLogin?: boolean;
}

/**
 * Component that protects routes based on user role and permissions.
 * Integrates with the AccessControl system.
 */
export function ProtectedRoute({
    children,
    requiredRoles,
    requiredResource,
    requiredAccessLevel = AccessLevel.READ_ONLY,
    fallback,
    redirectToLogin = true,
}: ProtectedRouteProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { user } = useDashboard();
    const {
        role,
        hasAnyRole,
        hasResourceAccess,
        canAccessPage,
    } = useAccessControl();

    const [accessDenied, setAccessDenied] = useState(false);
    const [reason, setReason] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Give context time to initialize
        const timer = setTimeout(() => setIsLoading(false), 100);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (isLoading) return;

        // Check authentication
        if (!user) {
            if (redirectToLogin) {
                router.push('/login');
            }
            return;
        }

        // Check page access
        if (!canAccessPage(pathname)) {
            setAccessDenied(true);
            setReason('Bu sayfaya erişim yetkiniz yok.');
            return;
        }

        // Check role requirements
        if (requiredRoles && requiredRoles.length > 0) {
            if (!hasAnyRole(...requiredRoles)) {
                setAccessDenied(true);
                setReason(`Bu sayfa için ${requiredRoles.join(' veya ')} rolü gereklidir.`);
                return;
            }
        }

        // Check resource access
        if (requiredResource) {
            if (!hasResourceAccess(requiredResource, requiredAccessLevel)) {
                setAccessDenied(true);
                setReason(`${requiredResource} kaynağına yeterli erişim yetkiniz yok.`);
                return;
            }
        }

        setAccessDenied(false);
        setReason('');
    }, [
        user,
        isLoading,
        pathname,
        role,
        requiredRoles,
        requiredResource,
        requiredAccessLevel,
        canAccessPage,
        hasAnyRole,
        hasResourceAccess,
        redirectToLogin,
        router,
    ]);

    // Show loading state
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
                <div className="animate-pulse flex flex-col items-center gap-4">
                    <Shield className="w-16 h-16 text-[var(--accent-primary)]" />
                    <p className="text-gray-600 dark:text-gray-400">Yetkilendirme kontrol ediliyor...</p>
                </div>
            </div>
        );
    }

    // Show access denied
    if (accessDenied) {
        if (fallback) {
            return <>{fallback}</>;
        }

        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
                <div className="bg-white dark:bg-[var(--dark-bg)] rounded-2xl shadow-xl p-8 max-w-md mx-4">
                    <div className="flex flex-col items-center text-center gap-4">
                        <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                            <Lock className="w-10 h-10 text-red-500" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Erişim Engellendi
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400">
                            {reason || 'Bu sayfaya erişim yetkiniz bulunmuyor.'}
                        </p>
                        <div className="flex gap-3 mt-4">
                            <button
                                onClick={() => router.back()}
                                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                Geri Dön
                            </button>
                            <button
                                onClick={() => router.push('/dashboard')}
                                className="px-4 py-2 bg-[var(--accent-primary)] text-white rounded-lg hover:bg-[var(--accent-primary)] transition-colors"
                            >
                                Ana Sayfaya Git
                            </button>
                        </div>
                        {role && (
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-4">
                                Mevcut rol: <span className="font-medium">{role}</span>
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Show unauthorized if not authenticated
    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
                <div className="bg-white dark:bg-[var(--dark-bg)] rounded-2xl shadow-xl p-8 max-w-md mx-4">
                    <div className="flex flex-col items-center text-center gap-4">
                        <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                            <AlertTriangle className="w-10 h-10 text-amber-500" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Oturum Gerekli
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400">
                            Bu sayfayı görüntülemek için giriş yapmanız gerekmektedir.
                        </p>
                        <button
                            onClick={() => router.push('/login')}
                            className="px-6 py-2 bg-[var(--accent-primary)] text-white rounded-lg hover:bg-[var(--accent-primary)] transition-colors mt-4"
                        >
                            Giriş Yap
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}

/**
 * HOC wrapper for protecting pages
 */
export function withProtection<P extends object>(
    Component: React.ComponentType<P>,
    options?: Omit<ProtectedRouteProps, 'children'>
) {
    return function ProtectedComponent(props: P) {
        return (
            <ProtectedRoute {...options}>
                <Component {...props} />
            </ProtectedRoute>
        );
    };
}

export default ProtectedRoute;

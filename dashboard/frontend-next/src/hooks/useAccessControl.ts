'use client';

import { useCallback, useMemo } from 'react';
import { useDashboard } from '@/components/DashboardShell';

/**
 * Role definitions matching backend and smart contract
 */
export enum UserRole {
    OWNER = 'OWNER',
    MANAGER = 'MANAGER',
    ENGINEER = 'ENGINEER',
    OPERATOR = 'OPERATOR',
}

/**
 * Resource definitions matching smart contract AccessControlRegistry
 */
export enum Resource {
    SENSOR_DATA = 'SENSOR_DATA',
    PREDICTION = 'PREDICTION',
    MAINTENANCE = 'MAINTENANCE',
    CONFIG = 'CONFIG',
    AUDIT_LOGS = 'AUDIT_LOGS',
}

/**
 * Access level definitions matching smart contract
 */
export enum AccessLevel {
    NO_ACCESS = 0,
    READ_ONLY = 1,
    WRITE_LIMITED = 2,
    FULL_ACCESS = 3,
    ADMIN_ACCESS = 4,
}

/**
 * Permission matrix defining what each role can do
 */
const PERMISSION_MATRIX: Record<UserRole, {
    resources: Record<Resource, AccessLevel>;
    pages: string[];
    actions: string[];
}> = {
    [UserRole.OWNER]: {
        resources: {
            [Resource.SENSOR_DATA]: AccessLevel.ADMIN_ACCESS,
            [Resource.PREDICTION]: AccessLevel.ADMIN_ACCESS,
            [Resource.MAINTENANCE]: AccessLevel.ADMIN_ACCESS,
            [Resource.CONFIG]: AccessLevel.ADMIN_ACCESS,
            [Resource.AUDIT_LOGS]: AccessLevel.ADMIN_ACCESS,
        },
        pages: ['*'], // All pages
        actions: ['*'], // All actions
    },
    [UserRole.MANAGER]: {
        resources: {
            [Resource.SENSOR_DATA]: AccessLevel.FULL_ACCESS,
            [Resource.PREDICTION]: AccessLevel.FULL_ACCESS,
            [Resource.MAINTENANCE]: AccessLevel.FULL_ACCESS,
            [Resource.CONFIG]: AccessLevel.READ_ONLY,
            [Resource.AUDIT_LOGS]: AccessLevel.READ_ONLY,
        },
        pages: ['/dashboard', '/dashboard/overview', '/dashboard/machines', '/dashboard/analytics', '/dashboard/ledger', '/dashboard/maintenance', '/dashboard/reports', '/dashboard/settings'],
        actions: ['view', 'create', 'update', 'export', 'schedule'],
    },
    [UserRole.ENGINEER]: {
        resources: {
            [Resource.SENSOR_DATA]: AccessLevel.READ_ONLY,
            [Resource.PREDICTION]: AccessLevel.WRITE_LIMITED,
            [Resource.MAINTENANCE]: AccessLevel.WRITE_LIMITED,
            [Resource.CONFIG]: AccessLevel.NO_ACCESS,
            [Resource.AUDIT_LOGS]: AccessLevel.READ_ONLY,
        },
        pages: ['/dashboard', '/dashboard/overview', '/dashboard/machines', '/dashboard/analytics', '/dashboard/ledger', '/dashboard/maintenance', '/dashboard/engineer', '/dashboard/settings'],
        actions: ['view', 'analyze', 'predict', 'schedule'],
    },
    [UserRole.OPERATOR]: {
        resources: {
            [Resource.SENSOR_DATA]: AccessLevel.WRITE_LIMITED,
            [Resource.PREDICTION]: AccessLevel.READ_ONLY,
            [Resource.MAINTENANCE]: AccessLevel.READ_ONLY,
            [Resource.CONFIG]: AccessLevel.NO_ACCESS,
            [Resource.AUDIT_LOGS]: AccessLevel.NO_ACCESS,
        },
        pages: ['/dashboard', '/dashboard/overview', '/dashboard/sensor-entry', '/dashboard/settings'],
        actions: ['view', 'input', 'submit'],
    },
};

export interface AccessControlHook {
    /** Current user role */
    role: UserRole | null;

    /** Check if user has a specific role */
    hasRole: (role: UserRole) => boolean;

    /** Check if user has at least one of the specified roles */
    hasAnyRole: (...roles: UserRole[]) => boolean;

    /** Check if user can access a specific page */
    canAccessPage: (page: string) => boolean;

    /** Check if user can perform a specific action */
    canPerformAction: (action: string) => boolean;

    /** Check if user has required access level for a resource */
    hasResourceAccess: (resource: Resource, requiredLevel?: AccessLevel) => boolean;

    /** Get user's access level for a resource */
    getResourceAccessLevel: (resource: Resource) => AccessLevel;

    /** Check if user is an admin (OWNER) */
    isAdmin: boolean;

    /** Check if user can manage other users */
    canManageUsers: boolean;

    /** Check if user can view analytics */
    canViewAnalytics: boolean;

    /** Check if user can perform predictions */
    canPerformPredictions: boolean;

    /** Check if user can input sensor data */
    canInputSensorData: boolean;

    /** Check if user can schedule maintenance */
    canScheduleMaintenance: boolean;

    /** Get all allowed pages for current user */
    allowedPages: string[];

    /** Get all allowed actions for current user */
    allowedActions: string[];
}

/**
 * Hook for centralized access control in the frontend.
 * Uses role-based permissions matching the smart contract AccessControlRegistry.
 */
export function useAccessControl(): AccessControlHook {
    const { user } = useDashboard();

    const role = useMemo(() => {
        if (!user?.role) return null;
        return user.role as UserRole;
    }, [user?.role]);

    const permissions = useMemo(() => {
        if (!role) return null;
        return PERMISSION_MATRIX[role];
    }, [role]);

    const hasRole = useCallback((targetRole: UserRole): boolean => {
        return role === targetRole;
    }, [role]);

    const hasAnyRole = useCallback((...targetRoles: UserRole[]): boolean => {
        if (!role) return false;
        return targetRoles.includes(role);
    }, [role]);

    const canAccessPage = useCallback((page: string): boolean => {
        if (!permissions) return false;
        if (permissions.pages.includes('*')) return true;
        return permissions.pages.some(allowedPage =>
            page === allowedPage || page.startsWith(allowedPage + '/')
        );
    }, [permissions]);

    const canPerformAction = useCallback((action: string): boolean => {
        if (!permissions) return false;
        if (permissions.actions.includes('*')) return true;
        return permissions.actions.includes(action);
    }, [permissions]);

    const hasResourceAccess = useCallback((resource: Resource, requiredLevel: AccessLevel = AccessLevel.READ_ONLY): boolean => {
        if (!permissions) return false;
        const userLevel = permissions.resources[resource] ?? AccessLevel.NO_ACCESS;
        return userLevel >= requiredLevel;
    }, [permissions]);

    const getResourceAccessLevel = useCallback((resource: Resource): AccessLevel => {
        if (!permissions) return AccessLevel.NO_ACCESS;
        return permissions.resources[resource] ?? AccessLevel.NO_ACCESS;
    }, [permissions]);

    const isAdmin = useMemo(() => role === UserRole.OWNER, [role]);

    const canManageUsers = useMemo(() =>
        hasRole(UserRole.OWNER),
        [hasRole]
    );

    const canViewAnalytics = useMemo(() =>
        hasAnyRole(UserRole.OWNER, UserRole.MANAGER, UserRole.ENGINEER),
        [hasAnyRole]
    );

    const canPerformPredictions = useMemo(() =>
        hasResourceAccess(Resource.PREDICTION, AccessLevel.WRITE_LIMITED),
        [hasResourceAccess]
    );

    const canInputSensorData = useMemo(() =>
        hasResourceAccess(Resource.SENSOR_DATA, AccessLevel.WRITE_LIMITED),
        [hasResourceAccess]
    );

    const canScheduleMaintenance = useMemo(() =>
        hasResourceAccess(Resource.MAINTENANCE, AccessLevel.WRITE_LIMITED),
        [hasResourceAccess]
    );

    const allowedPages = useMemo(() =>
        permissions?.pages ?? [],
        [permissions]
    );

    const allowedActions = useMemo(() =>
        permissions?.actions ?? [],
        [permissions]
    );

    return {
        role,
        hasRole,
        hasAnyRole,
        canAccessPage,
        canPerformAction,
        hasResourceAccess,
        getResourceAccessLevel,
        isAdmin,
        canManageUsers,
        canViewAnalytics,
        canPerformPredictions,
        canInputSensorData,
        canScheduleMaintenance,
        allowedPages,
        allowedActions,
    };
}

export default useAccessControl;

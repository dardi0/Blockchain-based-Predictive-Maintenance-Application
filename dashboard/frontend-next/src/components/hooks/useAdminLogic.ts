import { useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '@/types';
import { useDashboard } from '@/components/DashboardShell';
import { api } from '@/services/api';

interface NewUserForm {
    address: string;
    role: UserRole;
    name: string;
    email: string;
    department: string;
}

interface AdminState {
    users: User[];
    loading: boolean;
    error: string | null;
    isAddModalOpen: boolean;
    newUser: NewUserForm;
    submitting: boolean;
    userToDelete: string | null;
    formError: string | null;
    selectedUser: any | null;
    isEditMode: boolean;
}

const INITIAL_NEW_USER: NewUserForm = {
    address: '',
    role: UserRole.OPERATOR,
    name: '',
    email: '',
    department: '',
};

const INITIAL_STATE: AdminState = {
    users: [],
    loading: true,
    error: null,
    isAddModalOpen: false,
    newUser: { ...INITIAL_NEW_USER },
    submitting: false,
    userToDelete: null,
    formError: null,
    selectedUser: null,
    isEditMode: false,
};

export function useAdminLogic() {
    const { user } = useDashboard();
    const [state, setState] = useState<AdminState>(INITIAL_STATE);

    const loadUsers = useCallback(async () => {
        if (!user?.address) return;
        setState(prev => ({ ...prev, loading: true }));
        try {
            const response = await api.adminGetUsers(user.address);
            const usersData = Array.isArray(response) ? response : (response.users || []);
            setState(prev => ({ ...prev, users: usersData, error: null, loading: false }));
        } catch (e: any) {
            setState(prev => ({ ...prev, error: e.message || "Failed to load users", loading: false }));
        }
    }, [user?.address]);

    useEffect(() => {
        if (user?.role === UserRole.OWNER) {
            loadUsers();
        } else if (user) {
            setState(prev => ({ ...prev, error: "Unauthorized access", loading: false }));
        }
    }, [user, loadUsers]);

    const handleUpdateUser = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.address || !state.selectedUser) return;
        setState(prev => ({ ...prev, submitting: true, formError: null }));
        const formData = new FormData(e.target as HTMLFormElement);
        const data = {
            name: formData.get('name') as string,
            email: formData.get('email') as string,
            department: formData.get('department') as string,
            role: formData.get('role') as string,
        };
        try {
            const result = await api.adminUpdateUser(state.selectedUser.address, data, user.address);
            setState(prev => ({
                ...prev,
                users: prev.users.map(u => u.address === prev.selectedUser.address ? { ...u, ...result.user } : u),
                selectedUser: { ...prev.selectedUser, ...result.user },
                isEditMode: false,
                submitting: false,
            }));
        } catch (e: any) {
            setState(prev => ({ ...prev, formError: e.message || "Failed to update user", submitting: false }));
        }
    }, [user?.address, state.selectedUser]);

    const handleAddUser = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.address) return;
        setState(prev => ({ ...prev, submitting: true, formError: null }));
        try {
            await api.adminAddUser({
                address: state.newUser.address,
                role: state.newUser.role,
                name: state.newUser.name,
                email: state.newUser.email || undefined,
                department: state.newUser.department || undefined,
            }, user.address);
            setState(prev => ({
                ...prev,
                isAddModalOpen: false,
                newUser: { ...INITIAL_NEW_USER },
                submitting: false,
            }));
            loadUsers();
        } catch (e: any) {
            setState(prev => ({ ...prev, formError: e.message || "Failed to invite user", submitting: false }));
        }
    }, [user?.address, state.newUser, loadUsers]);

    const confirmDeleteUser = useCallback(async () => {
        if (!user?.address || !state.userToDelete) return;
        try {
            await api.adminDeleteUser(state.userToDelete, user.address);
            loadUsers();
            setState(prev => ({ ...prev, userToDelete: null }));
        } catch (e: any) {
            setState(prev => ({ ...prev, formError: e.message || "Failed to delete user", userToDelete: null }));
        }
    }, [user?.address, state.userToDelete, loadUsers]);

    const getRoleBadgeColor = useCallback((role: string) => {
        switch (role) {
            case UserRole.OWNER: return 'bg-purple-500/15 text-purple-300';
            case UserRole.MANAGER: return 'bg-[var(--accent-primary)]/15 text-[var(--accent-highlight)]';
            case UserRole.ENGINEER: return 'bg-amber-500/15 text-amber-300';
            case UserRole.OPERATOR: return 'bg-emerald-500/15 text-emerald-300';
            default: return 'bg-white/[0.06] text-white/60';
        }
    }, []);

    // Setters
    const setIsAddModalOpen = useCallback((v: boolean) => setState(prev => ({ ...prev, isAddModalOpen: v })), []);
    const setUserToDelete = useCallback((v: string | null) => setState(prev => ({ ...prev, userToDelete: v })), []);
    const setSelectedUser = useCallback((v: any | null) => setState(prev => ({ ...prev, selectedUser: v, isEditMode: false })), []);
    const setIsEditMode = useCallback((v: boolean) => setState(prev => ({ ...prev, isEditMode: v })), []);
    const setFormError = useCallback((v: string | null) => setState(prev => ({ ...prev, formError: v })), []);

    const updateNewUser = useCallback((field: keyof NewUserForm, value: any) => {
        setState(prev => ({ ...prev, newUser: { ...prev.newUser, [field]: value } }));
    }, []);

    return {
        user,
        ...state,
        loadUsers,
        handleUpdateUser,
        handleAddUser,
        confirmDeleteUser,
        getRoleBadgeColor,
        setIsAddModalOpen,
        setUserToDelete,
        setSelectedUser,
        setIsEditMode,
        setFormError,
        updateNewUser,
    };
}

import {
    User,
    UserRole,
    PredictionRequest,
    PredictionResponse,
    Machine,
    SensorData,
    LedgerEntry,
    AutomationStatus,
    MaintenanceTask,
    NotificationItem,
    AnalyticsData,
    SessionKeyStatus,
    BackendSubmitResult,
} from '../types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// --- Token Management ---
const TOKEN_KEY = 'pdm_auth_token';
const TOKEN_EXPIRY_KEY = 'pdm_token_expiry';

function getStoredToken(): string | null {
    if (typeof window === 'undefined') return null;
    const token = sessionStorage.getItem(TOKEN_KEY);
    const expiry = sessionStorage.getItem(TOKEN_EXPIRY_KEY);

    if (token && expiry) {
        if (Date.now() < parseInt(expiry, 10)) {
            return token;
        }
        // Token expired, clear it
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
    }
    return null;
}

function storeToken(token: string, expiresIn: number): void {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(TOKEN_EXPIRY_KEY, (Date.now() + expiresIn * 1000).toString());
}

function clearToken(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
}

// --- Headers Builder ---
function buildHeaders(walletAddress?: string): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    const token = getStoredToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // Include wallet address for backward compatibility
    if (walletAddress) {
        headers['x-wallet-address'] = walletAddress;
    }

    return headers;
}

export interface LoginResponse {
    user: User;
    token: string;
    expires_in: number;
}

export const api = {
    // Token management exports
    getToken: getStoredToken,
    clearToken,
    isAuthenticated: () => !!getStoredToken(),

    async login(address: string, signature: string, message: string): Promise<LoginResponse> {
        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ address, signature, message }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Login failed');
            }

            const data = await response.json();

            // Store the token
            if (data.token && data.expires_in) {
                storeToken(data.token, data.expires_in);
            }

            return data;
        } catch (error) {
            throw error;
        }
    },

    async register(address: string, role: UserRole, signature: string, message: string): Promise<LoginResponse> {
        try {
            const response = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ address, role, signature, message }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Registration failed');
            }

            const data = await response.json();

            // Store the token
            if (data.token && data.expires_in) {
                storeToken(data.token, data.expires_in);
            }

            return data;
        } catch (error) {
            throw error;
        }
    },

    async logout(): Promise<void> {
        try {
            const token = getStoredToken();
            if (token) {
                await fetch(`${API_URL}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });
            }
        } finally {
            clearToken();
        }
    },

    async verifyToken(): Promise<{ valid: boolean; user: User }> {
        const token = getStoredToken();
        if (!token) {
            throw new Error('No token available');
        }

        const response = await fetch(`${API_URL}/auth/verify`, {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            clearToken();
            throw new Error('Token verification failed');
        }

        return response.json();
    },

    async getCurrentUser(): Promise<User> {
        const response = await fetch(`${API_URL}/auth/me`, {
            headers: buildHeaders(),
        });

        if (!response.ok) {
            throw new Error('Failed to get current user');
        }

        const data = await response.json();
        return data.user;
    },

    async predict(data: PredictionRequest, signature?: string, message?: string): Promise<PredictionResponse> {
        try {
            const headers = buildHeaders();

            if (signature && message) {
                // Encode message to Base64 to handle newlines correctly in headers
                headers['x-signature'] = signature;
                headers['x-message'] = btoa(message);
            }

            const response = await fetch(`${API_URL}/predict`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Prediction failed');
            }

            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async getMachines(walletAddress?: string): Promise<Machine[]> {
        try {
            const response = await fetch(`${API_URL}/machines`, {
                headers: buildHeaders(walletAddress),
            });
            if (!response.ok) throw new Error('Failed to fetch machines');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async getSensorHistory(machineId: string | number, limit: number = 100): Promise<SensorData[]> {
        try {
            const response = await fetch(`${API_URL}/sensor-data/${machineId}?limit=${limit}`, {
                headers: buildHeaders(),
            });
            if (!response.ok) throw new Error('Failed to fetch sensor history');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async saveSensorData(machineId: string | number, payload: SensorData, walletAddress?: string): Promise<{ record_id: number }> {
        try {
            const response = await fetch(`${API_URL}/sensor-data?machine_id=${machineId}`, {
                method: 'POST',
                headers: buildHeaders(walletAddress),
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || 'Failed to save sensor data');
            }
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async prepareBlockchainProof(machineId: string | number, payload: SensorData, walletAddress?: string, recordId?: number): Promise<{ tx_data: unknown; proof_id: string }> {
        try {
            let url = `${API_URL}/blockchain/prepare?machine_id=${machineId}`;
            if (recordId) {
                url += `&record_id=${recordId}`;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: buildHeaders(walletAddress),
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to prepare proof');
            }
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async preparePredictionProof(recordId: number, walletAddress?: string): Promise<{ tx_data: unknown; proof_id: string }> {
        try {
            const response = await fetch(`${API_URL}/blockchain/prepare-prediction`, {
                method: 'POST',
                headers: buildHeaders(walletAddress),
                body: JSON.stringify({ record_id: recordId }),
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to prepare prediction proof');
            }
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async confirmBlockchainTx(recordId: number, txHash: string, walletAddress?: string, proofId: string | null = null, isPrediction: boolean = false): Promise<{ success: boolean }> {
        try {
            const response = await fetch(`${API_URL}/blockchain/confirm`, {
                method: 'POST',
                headers: buildHeaders(walletAddress),
                body: JSON.stringify({ record_id: recordId, tx_hash: txHash, proof_id: proofId, is_prediction: isPrediction }),
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to confirm transaction');
            }
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async getSessionKeyStatus(): Promise<SessionKeyStatus> {
        try {
            const response = await fetch(`${API_URL}/blockchain/session-key-status`, {
                headers: buildHeaders(),
            });
            if (!response.ok) throw new Error('session-key-status unavailable');
            return await response.json();
        } catch {
            return {
                available: false,
                roles: {
                    OPERATOR: { active: false, address: null, smart_account: null },
                    ENGINEER: { active: false, address: null, smart_account: null },
                },
            };
        }
    },

    async submitSensorViaBackend(
        machineId: number,
        payload: object,
        walletAddress?: string
    ): Promise<BackendSubmitResult> {
        const response = await fetch(
            `${API_URL}/blockchain/submit-sensor?machine_id=${machineId}`,
            {
                method: 'POST',
                headers: buildHeaders(walletAddress),
                body: JSON.stringify(payload),
            }
        );
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Backend sensor submission failed');
        }
        return await response.json();
    },

    async getBlockchainLedger(limit: number = 500): Promise<LedgerEntry[]> {
        try {
            const response = await fetch(`${API_URL}/blockchain/ledger?limit=${limit}`, {
                headers: buildHeaders(),
            });
            if (!response.ok) throw new Error('Failed to fetch ledger');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async getTransactionDetails(txHash: string): Promise<LedgerEntry> {
        try {
            const response = await fetch(`${API_URL}/blockchain/tx/${txHash}`, {
                headers: buildHeaders(),
            });
            if (!response.ok) throw new Error('Failed to fetch transaction details');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    // Reports Endpoints
    async getReportsHistory(walletAddress?: string): Promise<unknown[]> {
        try {
            const response = await fetch(`${API_URL}/reports?limit=50`, {
                headers: buildHeaders(walletAddress),
            });
            if (!response.ok) throw new Error('Failed to fetch reports');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async saveReport(title: string, content: unknown, walletAddress?: string): Promise<{ id: number }> {
        try {
            const response = await fetch(`${API_URL}/reports`, {
                method: 'POST',
                headers: buildHeaders(walletAddress),
                body: JSON.stringify({ title, content }),
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to save report');
            }
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async getReportDetails(reportId: number, walletAddress?: string): Promise<unknown> {
        try {
            const response = await fetch(`${API_URL}/reports/${reportId}`, {
                headers: buildHeaders(walletAddress),
            });
            if (!response.ok) throw new Error('Failed to fetch report details');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    // Activity Feed
    async getRecentActivity(walletAddress?: string, limit: number = 10): Promise<unknown[]> {
        try {
            const response = await fetch(`${API_URL}/activity?limit=${limit}`, {
                headers: buildHeaders(walletAddress),
            });
            if (!response.ok) throw new Error('Failed to fetch activity');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    // Admin Endpoints
    async adminGetUsers(walletAddress?: string): Promise<{ users: User[]; stats: any } | User[]> {
        try {
            const response = await fetch(`${API_URL}/admin/users`, {
                headers: buildHeaders(walletAddress),
            });
            if (!response.ok) throw new Error('Failed to fetch users');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async adminAddUser(user: { address: string; role: string; name: string; email?: string; department?: string }, adminAddress?: string): Promise<any> {
        try {
            // Use invite endpoint for new user creation
            const response = await fetch(`${API_URL}/admin/users/invite`, {
                method: 'POST',
                headers: buildHeaders(adminAddress),
                body: JSON.stringify(user),
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to invite user');
            }
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async adminUpdateUser(address: string, data: { name?: string; email?: string; department?: string; role?: string }, adminAddress?: string): Promise<{ status: string; user: User }> {
        try {
            const response = await fetch(`${API_URL}/admin/users/${address}`, {
                method: 'PUT',
                headers: buildHeaders(adminAddress),
                body: JSON.stringify(data),
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to update user');
            }
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async adminDeleteUser(addressToDelete: string, adminAddress?: string): Promise<{ success: boolean }> {
        try {
            const response = await fetch(`${API_URL}/admin/users/${addressToDelete}`, {
                method: 'DELETE',
                headers: buildHeaders(adminAddress),
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to delete user');
            }
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async adminUpdateUserRole(addressToUpdate: string, newRole: string, adminAddress?: string): Promise<User> {
        try {
            const response = await fetch(`${API_URL}/admin/users/${addressToUpdate}/role`, {
                method: 'PUT',
                headers: buildHeaders(adminAddress),
                body: JSON.stringify({ role: newRole }),
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to update role');
            }
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    // ========== ANALYTICS ==========

    async getPredictionTrend(machineId: number, days: number = 7): Promise<{ trend: unknown[] }> {
        try {
            const response = await fetch(`${API_URL}/predictions/trend/${machineId}?days=${days}`, {
                headers: buildHeaders(),
            });
            if (!response.ok) throw new Error('Failed to fetch prediction trend');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async getAnomalies(hours: number = 24, threshold: number = 2.0): Promise<{ anomalies: unknown[] }> {
        try {
            const response = await fetch(`${API_URL}/analytics/anomalies?hours=${hours}&threshold=${threshold}`, {
                headers: buildHeaders(),
            });
            if (!response.ok) throw new Error('Failed to fetch anomalies');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async getMachineComparison(): Promise<{ comparison: unknown[] }> {
        try {
            const response = await fetch(`${API_URL}/analytics/comparison`, {
                headers: buildHeaders(),
            });
            if (!response.ok) throw new Error('Failed to fetch comparison');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    // ========== MAINTENANCE ==========

    async getMaintenanceSchedule(): Promise<MaintenanceTask[]> {
        try {
            const response = await fetch(`${API_URL}/maintenance/schedule`, {
                headers: buildHeaders(),
            });
            if (!response.ok) throw new Error('Failed to fetch maintenance schedule');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async createMaintenanceTask(machineId: number, task: string, dueDate: string, priority: string, walletAddress?: string): Promise<MaintenanceTask> {
        try {
            const response = await fetch(`${API_URL}/maintenance/schedule?machine_id=${machineId}&task=${encodeURIComponent(task)}&due_date=${dueDate}&priority=${priority}`, {
                method: 'POST',
                headers: buildHeaders(walletAddress),
            });
            if (!response.ok) throw new Error('Failed to create maintenance task');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    // ========== NOTIFICATIONS ==========

    async getNotifications(walletAddress?: string, limit: number = 20): Promise<NotificationItem[]> {
        try {
            const response = await fetch(`${API_URL}/notifications?limit=${limit}`, {
                headers: buildHeaders(walletAddress),
            });
            if (!response.ok) throw new Error('Failed to fetch notifications');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async markNotificationRead(id: number): Promise<{ success: boolean }> {
        try {
            const response = await fetch(`${API_URL}/notifications/${id}/read`, {
                method: 'POST',
                headers: buildHeaders(),
            });
            if (!response.ok) throw new Error('Failed to mark notification as read');
            return await response.json();
        } catch (error) {
            console.error(error);
            return { success: false };
        }
    },

    async deleteNotification(id: number): Promise<{ success: boolean }> {
        try {
            const response = await fetch(`${API_URL}/notifications/${id}`, {
                method: 'DELETE',
                headers: buildHeaders(),
            });
            if (!response.ok) throw new Error('Failed to delete notification');
            return await response.json();
        } catch (error) {
            console.error(error);
            return { success: false };
        }
    },

    // ========== EXPORT ==========

    async exportReport(format: string = 'json', machineId?: number, days: number = 7, walletAddress?: string): Promise<unknown> {
        try {
            let url = `${API_URL}/export/report?format=${format}&days=${days}`;
            if (machineId) url += `&machine_id=${machineId}`;

            const response = await fetch(url, {
                headers: buildHeaders(walletAddress),
            });

            if (format === 'csv') {
                return await response.text();
            }
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    // ========== MODEL INFO ==========

    async getModelInfo(): Promise<any> {
        try {
            const response = await fetch(`${API_URL}/model/info`);
            if (!response.ok) throw new Error('Failed to fetch model info');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    // ========== AUTOMATION ==========

    async getAutomationStatus(): Promise<AutomationStatus> {
        try {
            const response = await fetch(`${API_URL}/automation/status`);
            if (!response.ok) throw new Error('Failed to fetch automation status');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async getListenerStatus(): Promise<AutomationStatus> {
        try {
            const response = await fetch(`${API_URL}/automation/listener-status`);
            if (!response.ok) throw new Error('Failed to fetch listener status');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async restartListener(): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${API_URL}/automation/listener-restart`, {
                method: 'POST'
            });
            if (!response.ok) throw new Error('Failed to restart listener');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async triggerManualPrediction(walletAddress: string): Promise<{ success: boolean; prediction_id?: number }> {
        try {
            const response = await fetch(`${API_URL}/automation/trigger-prediction`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-wallet-address': walletAddress
                }
            });
            if (!response.ok) throw new Error('Failed to trigger prediction');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async getChainlinkContracts(): Promise<any> {
        try {
            const response = await fetch(`${API_URL}/automation/contracts`);
            if (!response.ok) throw new Error('Failed to fetch contract info');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    async getChainlinkEvents(limit: number = 20): Promise<any> {
        try {
            const response = await fetch(`${API_URL}/automation/events?limit=${limit}`);
            if (!response.ok) throw new Error('Failed to fetch events');
            return await response.json();
        } catch (error) {
            throw error;
        }
    },

    // ========== MODEL TRAINING ==========

    async getTrainingConfig(): Promise<any> {
        const response = await fetch(`${API_URL}/api/training/config`);
        if (!response.ok) throw new Error('Failed to fetch training config');
        return await response.json();
    },

    async startTraining(params?: any): Promise<any> {
        const response = await fetch(`${API_URL}/api/training/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: params ? JSON.stringify(params) : '{}',
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to start training');
        }
        return await response.json();
    },

    async getTrainingStatus(): Promise<any> {
        const response = await fetch(`${API_URL}/api/training/status`);
        if (!response.ok) throw new Error('Failed to fetch training status');
        return await response.json();
    },

    async getTrainingResults(): Promise<any> {
        const response = await fetch(`${API_URL}/api/training/results`);
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'No training results');
        }
        return await response.json();
    }
};

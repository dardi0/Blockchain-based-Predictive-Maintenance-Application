export enum MachineStatus {
    OPERATIONAL = 'OPERATIONAL',
    WARNING = 'WARNING',
    CRITICAL = 'CRITICAL',
    MAINTENANCE = 'MAINTENANCE'
}

export enum UserRole {
    OWNER = 'OWNER',
    MANAGER = 'MANAGER',
    ENGINEER = 'ENGINEER',
    OPERATOR = 'OPERATOR'
}

export interface User {
    address: string;
    role: UserRole;
    name: string;
    email?: string;
    department?: string;
    status?: string;
    created_at?: string;
    activated_at?: string;
    blockchain_node_id?: string;
    blockchain_registered_at?: string;
}

export interface SensorData {
    id?: number;
    recordId?: number;
    timestamp: string;
    airTemperature: number; // [K]
    processTemperature: number; // [K]
    rotationalSpeed: number; // [rpm]
    torque: number; // [Nm]
    toolWear: number; // [min]
    blockchain_tx_hash?: string;
    blockchain_success?: boolean;
    proof_id?: string;
    prediction_tx_hash?: string;
    prediction?: number;
    prediction_probability?: number;
}

export interface PredictionInfo {
    prediction: number; // 0 = Normal, 1 = Failure
    probability: number; // 0.0 - 1.0
    reason?: string | null;
    hasBlockchainProof: boolean;
    predictionTxHash?: string | null;
    predictionProofId?: number | null;
}

export interface MaintenanceRecord {
    id: string;
    machineId: string;
    timestamp: string;
    action: string;
    technician: string;
    operatorAddress?: string; // Full wallet address
    txHash: string; // Truncated hash for UI
    txHashFull?: string; // Full hash for explorer link
    verified: boolean;
    sensorProofId?: number | null; // On-chain sensor proof ID
    predictionInfo?: PredictionInfo | null; // Prediction analysis data
}

export interface SavedReport {
    id: number;
    title: string;
    content: any;
    created_by: string;
    created_at: string;
}

export interface Machine {
    id: string; // UDI
    name: string; // Product ID + Variant
    type: 'L' | 'M' | 'H'; // Quality Type
    location: string;
    status: MachineStatus;
    installDate: string;
    healthScore: number; // 0-100 (legacy, average of both)
    mlHealthScore: number; // ML-based score (0-100)
    engHealthScore: number; // Engineering-based score (0-100)
    lastServiceDate: string;
    sensorData: SensorData[]; // Historical data
    sensorBreakdown?: {
        airTemp: number;
        processTemp: number;
        rotationalSpeed: number;
        torque: number;
        toolWear: number;
    };
}

export interface FailureMode {
    name: string;
    detected: boolean;
    description: string;
}

export interface PredictionResult {
    rulEstimate: number; // Remaining Useful Life in hours
    failureProbability: number; // 0-100%
    recommendedAction: string;
    riskAnalysis: string;
    maintenancePriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'IMMEDIATE';
    detectedModes?: FailureMode[]; // Specific AI4I failures
    physicsData?: {
        power: number;
        overstrain: number;
        tempDiff: number;
    };
}

// ============ USER SETTINGS ============

export interface ProfileSettings {
    displayName: string;
    email: string;
    avatarUrl?: string;
    language: 'en' | 'tr';
}

export interface NotificationSettings {
    criticalFailureAlerts: boolean;
    highWearAlerts: boolean;
    maintenanceReminders: boolean;
    emailNotifications: boolean;
    pushNotifications: boolean;
    toolWearThreshold: number;
    failureProbabilityThreshold: number;
}

export interface DisplaySettings {
    theme: 'light' | 'dark' | 'system';
    colorTheme: string;
    refreshInterval: 5 | 10 | 30 | 60;
    dateFormat: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
    temperatureUnit: 'K' | 'C' | 'F';
    chartColorScheme: 'default' | 'colorblind' | 'monochrome';
}

export interface BlockchainSettings {
    connectedWallet: string;
    network: 'zksync-sepolia' | 'zksync-mainnet';
    autoSignTransactions: boolean;
    gasLimitPreference: 'low' | 'medium' | 'high';
}

// ============ SMART ACCOUNT / SESSION KEY ============

export interface SessionKeyRoleStatus {
    active: boolean;
    address: string | null;   // ephemeral signer address
    smart_account: string | null; // Smart Account contract address
}

export interface SessionKeyStatus {
    available: boolean;
    roles: {
        OPERATOR: SessionKeyRoleStatus;
        ENGINEER: SessionKeyRoleStatus;
    };
}

/** POST /blockchain/submit-sensor yanıtı */
export interface BackendSubmitResult {
    success: boolean;
    tx_hash: string | null;
    proof_id: string | null;
    record_id: number | null;
    submission_mode: 'smart_account' | 'eoa';
}

export interface MachinePreferences {
    defaultMachineId: number | null;
    favoriteMachines: number[];
    customAlertThresholds: {
        machineId: number;
        toolWearThreshold: number;
        tempThreshold: number;
    }[];
}

export interface DataPrivacySettings {
    dataRetentionDays: 30 | 90 | 180 | 365;
    exportFormat: 'csv' | 'json' | 'pdf';
    sessionTimeoutMinutes: 15 | 30 | 60 | 120;
}

export interface UserSettings {
    profile: ProfileSettings;
    notifications: NotificationSettings;
    display: DisplaySettings;
    blockchain: BlockchainSettings;
    machinePreferences: MachinePreferences;
    dataPrivacy: DataPrivacySettings;
}

// ============ API TYPES ============

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface PredictionRequest {
    air_temp_k: number;
    process_temp_k: number;
    rotational_speed_rpm: number;
    torque_nm: number;
    tool_wear_min: number;
    machine_type: 'L' | 'M' | 'H';
}

export interface PredictionResponse {
    prediction: number;
    probability: number;
    confidence: number;
    failure_modes?: {
        heat_dissipation: boolean;
        power_failure: boolean;
        overstrain: boolean;
        tool_wear: boolean;
        random: boolean;
    };
    recommendation?: string;
    record_id?: number;
}

export interface MachineListResponse {
    machines: Machine[];
    total: number;
}

export interface SensorHistoryResponse {
    data: SensorData[];
    total: number;
    page: number;
    limit: number;
}

export interface LedgerEntry {
    id: number;
    record_id: number;
    machine_id: number;
    timestamp: string;
    tx_hash: string;
    proof_id: string;
    sensor_data: SensorData;
    prediction?: PredictionInfo;
    verified: boolean;
    submission_mode?: 'smart_account' | 'eoa';  // hangi yolla gönderildi
}

export interface LedgerResponse {
    entries: LedgerEntry[];
    total: number;
    page: number;
    limit: number;
}

export interface AutomationStatus {
    running: boolean;
    last_processed_block?: number;
    poll_interval?: number;
    pending_predictions?: number;
    auto_predictions_24h?: number;
}

export interface MaintenanceTask {
    id: number;
    machine_id: number;
    title: string;
    description: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    assigned_to?: string;
    due_date?: string;
    created_at: string;
    completed_at?: string;
}

export interface AnalyticsData {
    period: string;
    predictions_count: number;
    failures_detected: number;
    maintenance_performed: number;
    avg_health_score: number;
}

export interface NotificationItem {
    id: number;
    type: 'info' | 'warning' | 'error' | 'success';
    title: string;
    message: string;
    created_at: string;
    read: boolean;
    action_url?: string;
}

// ============ ANALYTICS TYPES ============

export interface FailureModeData {
    machine_id: number;
    machine_type: string;
    total_failures: number;
    TWF: number;
    HDF: number;
    PWF: number;
    OSF: number;
    RNF: number;
}

export interface ToolWearDay {
    day: string;
    avg_wear: number;
    max_wear: number;
}

export interface ToolWearMachine {
    machine_id: number;
    machine_type: string;
    data: ToolWearDay[];
}

export interface RULEstimate {
    machine_id: number;
    machine_type: string;
    current_wear: number;
    daily_rate: number;
    estimated_days: number | null;
    estimated_date: string | null;
    status: 'GOOD' | 'WARNING' | 'CRITICAL' | 'EXCEEDED' | 'INSUFFICIENT_DATA';
    critical_threshold: number;
}

export interface MaintenanceEvent {
    id: number;
    machine_id: number;
    type: string;
    description: string;
    technician: string;
    timestamp: string;
}

export interface AnomalyFrequencyItem {
    machine_id: string;
    metric: string;
    week: string;
    count: number;
    severity_avg: number;
}

export interface KPIData {
    overall: {
        mtbf_hours: number;
        mttr_hours: number;
        false_alarm_rate: number;
        oee_proxy: number;
    };
    machines: {
        machine_id: number;
        machine_type: string;
        mtbf_hours: number;
        failure_count: number;
        false_alarm_rate: number;
        oee_proxy: number;
    }[];
}

export const defaultUserSettings: UserSettings = {
    profile: {
        displayName: '',
        email: '',
        language: 'en',
    },
    notifications: {
        criticalFailureAlerts: true,
        highWearAlerts: true,
        maintenanceReminders: true,
        emailNotifications: false,
        pushNotifications: true,
        toolWearThreshold: 200,
        failureProbabilityThreshold: 70,
    },
    display: {
        theme: 'dark',
        colorTheme: 'ocean-depths',
        refreshInterval: 5,
        dateFormat: 'DD.MM.YYYY',
        temperatureUnit: 'K',
        chartColorScheme: 'default',
    },
    blockchain: {
        connectedWallet: '',
        network: 'zksync-sepolia',
        autoSignTransactions: false,
        gasLimitPreference: 'medium',
    },
    machinePreferences: {
        defaultMachineId: null,
        favoriteMachines: [],
        customAlertThresholds: [],
    },
    dataPrivacy: {
        dataRetentionDays: 90,
        exportFormat: 'csv',
        sessionTimeoutMinutes: 60,
    },
};

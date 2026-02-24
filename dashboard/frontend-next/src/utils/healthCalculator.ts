/**
 * Health Score Calculator
 * 
 * Two calculation methods:
 * 1. ML-Based: Uses prediction probability from the AI model
 * 2. Engineering-Based: Uses all 5 sensor values with weighted scoring
 */

export interface SensorValues {
    airTemperature: number;      // Kelvin (normal: 295-305)
    processTemperature: number;  // Kelvin (normal: 305-315)
    rotationalSpeed: number;     // RPM (normal: 1200-1800)
    torque: number;              // Nm (normal: 30-50)
    toolWear: number;            // minutes (normal: 0-150)
}

export interface HealthScores {
    mlScore: number;
    engScore: number;
    mlLabel: string;
    engLabel: string;
    sensorBreakdown?: {
        airTemp: number;
        processTemp: number;
        rotationalSpeed: number;
        torque: number;
        toolWear: number;
    };
}

// Sensor configuration with normal ranges and weights
const SENSOR_CONFIG = {
    airTemperature: {
        min: 295,
        max: 305,
        criticalMin: 290,
        criticalMax: 310,
        weight: 0.10,
        label: 'Air Temperature'
    },
    processTemperature: {
        min: 305,
        max: 315,
        criticalMin: 300,
        criticalMax: 320,
        weight: 0.15, // Temp delta implicitly covered
        label: 'Process Temperature'
    },
    rotationalSpeed: {
        min: 1200,
        max: 1800,
        criticalMin: 1000,
        criticalMax: 2000,
        weight: 0.15,
        label: 'Rotational Speed'
    },
    torque: {
        min: 30,
        max: 50,
        criticalMin: 20,
        criticalMax: 60,
        weight: 0.25,
        label: 'Torque'
    },
    toolWear: {
        min: 0,
        max: 150,
        criticalMin: 0,
        criticalMax: 240,
        weight: 0.35,
        label: 'Tool Wear'
    }
};

/**
 * Calculate ML-Based Health Score
 * Uses the prediction probability directly
 */
export function calculateMLScore(predictionProbability: number | null | undefined): number {
    if (predictionProbability === null || predictionProbability === undefined) {
        return 95; // Default healthy if no prediction
    }
    // prediction_probability is failure probability (0-1)
    // health = 100 - (failure_prob * 100)
    const score = Math.round(100 - (predictionProbability * 100));
    return Math.max(0, Math.min(100, score));
}

/**
 * Calculate individual sensor health score
 * Returns 100 if in normal range, decreases as it approaches critical
 */
function calculateSensorScore(value: number, config: typeof SENSOR_CONFIG.airTemperature): number {
    const { min, max, criticalMin, criticalMax } = config;

    // In normal range
    if (value >= min && value <= max) {
        return 100;
    }

    // Below normal range
    if (value < min) {
        const deviation = min - value;
        const maxDeviation = min - criticalMin;
        if (maxDeviation <= 0) return 100;
        const penalty = Math.min(1, deviation / maxDeviation);
        return Math.round(100 - (penalty * 100));
    }

    // Above normal range
    if (value > max) {
        const deviation = value - max;
        const maxDeviation = criticalMax - max;
        if (maxDeviation <= 0) return 100;
        const penalty = Math.min(1, deviation / maxDeviation);
        return Math.round(100 - (penalty * 100));
    }

    return 100;
}

/**
 * Calculate Engineering-Based Health Score
 * Uses all 5 sensors with weighted scoring
 */
export function calculateEngineeringScore(sensors: SensorValues): { score: number; breakdown: HealthScores['sensorBreakdown'] } {
    const airTempScore = calculateSensorScore(sensors.airTemperature, SENSOR_CONFIG.airTemperature);
    const processTempScore = calculateSensorScore(sensors.processTemperature, SENSOR_CONFIG.processTemperature);
    const rotationalSpeedScore = calculateSensorScore(sensors.rotationalSpeed, SENSOR_CONFIG.rotationalSpeed);
    const torqueScore = calculateSensorScore(sensors.torque, SENSOR_CONFIG.torque);
    const toolWearScore = calculateSensorScore(sensors.toolWear, SENSOR_CONFIG.toolWear);

    // Weighted average
    const weightedScore =
        (airTempScore * SENSOR_CONFIG.airTemperature.weight) +
        (processTempScore * SENSOR_CONFIG.processTemperature.weight) +
        (rotationalSpeedScore * SENSOR_CONFIG.rotationalSpeed.weight) +
        (torqueScore * SENSOR_CONFIG.torque.weight) +
        (toolWearScore * SENSOR_CONFIG.toolWear.weight);

    return {
        score: Math.round(weightedScore),
        breakdown: {
            airTemp: airTempScore,
            processTemp: processTempScore,
            rotationalSpeed: rotationalSpeedScore,
            torque: torqueScore,
            toolWear: toolWearScore
        }
    };
}

/**
 * Get status label based on score
 */
function getScoreLabel(score: number): string {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 50) return 'Fair';
    if (score >= 25) return 'Poor';
    return 'Critical';
}

/**
 * Calculate both health scores for a machine
 */
export function calculateHealthScores(
    sensors: SensorValues,
    predictionProbability: number | null | undefined
): HealthScores {
    const mlScore = calculateMLScore(predictionProbability);
    const { score: engScore, breakdown } = calculateEngineeringScore(sensors);

    return {
        mlScore,
        engScore,
        mlLabel: getScoreLabel(mlScore),
        engLabel: getScoreLabel(engScore),
        sensorBreakdown: breakdown
    };
}

/**
 * Get machine status based on both scores
 */
export function getMachineStatus(mlScore: number, engScore: number): 'OPERATIONAL' | 'WARNING' | 'CRITICAL' {
    const avgScore = (mlScore + engScore) / 2;

    if (avgScore < 50 || mlScore < 40 || engScore < 40) {
        return 'CRITICAL';
    }
    if (avgScore < 75 || mlScore < 60 || engScore < 60) {
        return 'WARNING';
    }
    return 'OPERATIONAL';
}

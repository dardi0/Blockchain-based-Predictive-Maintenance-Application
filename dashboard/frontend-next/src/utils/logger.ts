/**
 * Production-safe logger utility
 * Prevents console.log leakage in production while keeping debug capability
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
    enabled: boolean;
    level: LogLevel;
    prefix: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

class Logger {
    private config: LoggerConfig;

    constructor() {
        this.config = {
            enabled: process.env.NODE_ENV !== 'production',
            level: (process.env.NEXT_PUBLIC_LOG_LEVEL as LogLevel) || 'info',
            prefix: '[PDM]',
        };
    }

    private shouldLog(level: LogLevel): boolean {
        if (!this.config.enabled) return level === 'error'; // Always log errors
        return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
    }

    private formatMessage(level: LogLevel, message: string): string {
        const timestamp = new Date().toISOString();
        return `${this.config.prefix} [${timestamp}] [${level.toUpperCase()}] ${message}`;
    }

    debug(message: string, ...args: unknown[]): void {
        if (this.shouldLog('debug')) {
            console.debug(this.formatMessage('debug', message), ...args);
        }
    }

    info(message: string, ...args: unknown[]): void {
        if (this.shouldLog('info')) {
            console.info(this.formatMessage('info', message), ...args);
        }
    }

    warn(message: string, ...args: unknown[]): void {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', message), ...args);
        }
    }

    error(message: string, ...args: unknown[]): void {
        // Always log errors
        console.error(this.formatMessage('error', message), ...args);

        // In production, could send to error tracking service
        if (process.env.NODE_ENV === 'production') {
            this.reportError(message, args);
        }
    }

    private reportError(message: string, args: unknown[]): void {
        // Placeholder for error reporting service integration
        // e.g., Sentry, LogRocket, etc.
        // sentry.captureException(new Error(message));
    }

    // Group related logs
    group(label: string): void {
        if (this.config.enabled) {
            console.group(this.formatMessage('info', label));
        }
    }

    groupEnd(): void {
        if (this.config.enabled) {
            console.groupEnd();
        }
    }

    // Performance timing
    time(label: string): void {
        if (this.config.enabled) {
            console.time(`${this.config.prefix} ${label}`);
        }
    }

    timeEnd(label: string): void {
        if (this.config.enabled) {
            console.timeEnd(`${this.config.prefix} ${label}`);
        }
    }

    // Table logging for data
    table(data: unknown): void {
        if (this.config.enabled && this.shouldLog('debug')) {
            console.table(data);
        }
    }

    // API call logging
    api(method: string, url: string, status?: number, duration?: number): void {
        if (this.shouldLog('debug')) {
            const statusColor = status && status >= 400 ? '❌' : '✅';
            const msg = `${statusColor} ${method} ${url}${status ? ` [${status}]` : ''}${duration ? ` (${duration}ms)` : ''}`;
            console.debug(this.formatMessage('debug', msg));
        }
    }
}

// Singleton instance
export const logger = new Logger();

// Convenience exports
export const { debug, info, warn, error } = {
    debug: logger.debug.bind(logger),
    info: logger.info.bind(logger),
    warn: logger.warn.bind(logger),
    error: logger.error.bind(logger),
};

export default logger;

'use client';

import { useState, useEffect, useCallback } from 'react';
import { getErrorType, ApiErrorType } from '../components/errors';

interface AsyncState<T> {
    data: T | null;
    loading: boolean;
    error: Error | null;
    errorType: ApiErrorType | null;
}

interface UseAsyncDataOptions {
    immediate?: boolean;
    onSuccess?: (data: any) => void;
    onError?: (error: Error) => void;
    retryCount?: number;
    retryDelay?: number;
}

interface UseAsyncDataReturn<T> extends AsyncState<T> {
    execute: () => Promise<T | null>;
    reset: () => void;
    retry: () => Promise<T | null>;
}

/**
 * useAsyncData - Hook for managing async data fetching with error handling
 *
 * @param asyncFunction - The async function to execute
 * @param deps - Dependencies array for re-fetching
 * @param options - Configuration options
 */
export function useAsyncData<T>(
    asyncFunction: () => Promise<T>,
    deps: any[] = [],
    options: UseAsyncDataOptions = {}
): UseAsyncDataReturn<T> {
    const {
        immediate = true,
        onSuccess,
        onError,
        retryCount = 0,
        retryDelay = 1000
    } = options;

    const [state, setState] = useState<AsyncState<T>>({
        data: null,
        loading: immediate,
        error: null,
        errorType: null
    });

    const [attemptCount, setAttemptCount] = useState(0);

    const execute = useCallback(async (): Promise<T | null> => {
        setState(prev => ({ ...prev, loading: true, error: null, errorType: null }));

        try {
            const result = await asyncFunction();
            setState({ data: result, loading: false, error: null, errorType: null });
            onSuccess?.(result);
            setAttemptCount(0);
            return result;
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            const errorType = getErrorType(error);

            // Auto-retry logic
            if (attemptCount < retryCount) {
                setAttemptCount(prev => prev + 1);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return execute();
            }

            setState({ data: null, loading: false, error, errorType });
            onError?.(error);
            return null;
        }
    }, [asyncFunction, onSuccess, onError, attemptCount, retryCount, retryDelay]);

    const reset = useCallback(() => {
        setState({ data: null, loading: false, error: null, errorType: null });
        setAttemptCount(0);
    }, []);

    const retry = useCallback(async () => {
        setAttemptCount(0);
        return execute();
    }, [execute]);

    useEffect(() => {
        if (immediate) {
            execute();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return { ...state, execute, reset, retry };
}

/**
 * useApiCall - Simplified hook for one-off API calls (mutations)
 */
export function useApiCall<T, P extends any[]>(
    asyncFunction: (...args: P) => Promise<T>
) {
    const [state, setState] = useState<AsyncState<T>>({
        data: null,
        loading: false,
        error: null,
        errorType: null
    });

    const execute = useCallback(async (...args: P): Promise<T | null> => {
        setState({ data: null, loading: true, error: null, errorType: null });

        try {
            const result = await asyncFunction(...args);
            setState({ data: result, loading: false, error: null, errorType: null });
            return result;
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            const errorType = getErrorType(error);
            setState({ data: null, loading: false, error, errorType });
            return null;
        }
    }, [asyncFunction]);

    const reset = useCallback(() => {
        setState({ data: null, loading: false, error: null, errorType: null });
    }, []);

    return { ...state, execute, reset };
}

export default useAsyncData;

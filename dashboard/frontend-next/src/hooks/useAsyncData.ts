'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getErrorType, ApiErrorType } from '../components/errors';

function normalizeError(err: unknown): Error {
    if (err instanceof Error) return err;
    return new Error(String(err));
}

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

    // useRef instead of useState: prevents stale-closure infinite recursion on retry
    const attemptRef = useRef(0);
    // Store asyncFunction in a ref so its identity doesn't invalidate execute on every render
    const fnRef = useRef(asyncFunction);
    fnRef.current = asyncFunction;

    const execute = useCallback(async (): Promise<T | null> => {
        setState(prev => ({ ...prev, loading: true, error: null, errorType: null }));

        // Keep try block minimal — no ?. ?? || && inside (React Compiler rule)
        let result: T | null = null;
        let caughtError: Error | null = null;
        try {
            result = await fnRef.current();
        } catch (err) {
            caughtError = normalizeError(err);
        }

        if (caughtError !== null) {
            const errorType = getErrorType(caughtError);
            if (attemptRef.current < retryCount) {
                attemptRef.current += 1;
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return execute();
            }
            attemptRef.current = 0;
            setState({ data: null, loading: false, error: caughtError, errorType });
            if (onError) {
                onError(caughtError);
            }
            return null;
        }

        attemptRef.current = 0;
        setState({ data: result, loading: false, error: null, errorType: null });
        if (onSuccess) {
            onSuccess(result);
        }
        return result;
    // asyncFunction is accessed via fnRef — omitting it from deps keeps execute stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onSuccess, onError, retryCount, retryDelay]);

    const reset = useCallback(() => {
        setState({ data: null, loading: false, error: null, errorType: null });
        attemptRef.current = 0;
    }, []);

    const retry = useCallback(async () => {
        attemptRef.current = 0;
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

        let result: T | null = null;
        let caughtError: Error | null = null;
        try {
            result = await asyncFunction(...args);
        } catch (err) {
            caughtError = normalizeError(err);
        }

        if (caughtError !== null) {
            const errorType = getErrorType(caughtError);
            setState({ data: null, loading: false, error: caughtError, errorType });
            return null;
        }
        setState({ data: result, loading: false, error: null, errorType: null });
        return result;
    }, [asyncFunction]);

    const reset = useCallback(() => {
        setState({ data: null, loading: false, error: null, errorType: null });
    }, []);

    return { ...state, execute, reset };
}

export default useAsyncData;

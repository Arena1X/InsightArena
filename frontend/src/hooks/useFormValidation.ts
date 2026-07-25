"use client";

import { useCallback, useState } from "react";

// T must be an object with string-indexable keys so it satisfies Record<string, unknown>
export type ValidationRules<T extends Record<string, unknown>> = {
    [K in keyof T]?: (value: T[K], allValues: T) => string;
};

export interface UseFormValidationReturn<T extends Record<string, unknown>> {
    errors: Partial<Record<keyof T, string>>;
    validateField: (field: keyof T, value: T[keyof T], allValues: T) => boolean;
    validateAll: (values: T) => boolean;
    clearError: (field: keyof T) => void;
    clearAll: () => void;
    setError: (field: keyof T, message: string) => void;
}

export function useFormValidation<T extends Record<string, unknown>>(
    rules: ValidationRules<T>,
): UseFormValidationReturn<T> {
    const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});

    const validateField = useCallback(
        (field: keyof T, value: T[keyof T], allValues: T): boolean => {
            const rule = rules[field];
            if (!rule) return true;
            const msg = rule(value as T[typeof field], allValues);
            setErrors((prev) => ({ ...prev, [field]: msg || undefined }));
            return !msg;
        },
        [rules],
    );

    const validateAll = useCallback(
        (values: T): boolean => {
            const newErrors: Partial<Record<keyof T, string>> = {};
            let valid = true;
            for (const field of Object.keys(rules) as Array<keyof T>) {
                const rule = rules[field];
                if (!rule) continue;
                const msg = rule(values[field] as T[typeof field], values);
                if (msg) {
                    newErrors[field] = msg;
                    valid = false;
                }
            }
            setErrors(newErrors);
            return valid;
        },
        [rules],
    );

    const clearError = useCallback((field: keyof T) => {
        setErrors((prev) => {
            if (!prev[field]) return prev;
            const next = { ...prev };
            delete next[field];
            return next;
        });
    }, []);

    const clearAll = useCallback(() => setErrors({}), []);

    const setError = useCallback((field: keyof T, message: string) => {
        setErrors((prev) => ({ ...prev, [field]: message }));
    }, []);

    return { errors, validateField, validateAll, clearError, clearAll, setError };
}

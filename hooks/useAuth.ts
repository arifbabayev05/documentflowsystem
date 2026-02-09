"use client";

import { useAuthContext } from "@/components/providers/SessionProvider";
import { PermissionID } from "@/lib/permissions";

/**
 * Hook to access the global auth state.
 * Refactored to use AuthContext for stability across the app.
 */
export function useAuth() {
    const context = useAuthContext();

    return {
        ...context,
        // For backwards compatibility with existing components
        isLoading: context.isLoading
    };
}

"use client";

import { useEffect } from "react";
import { logError } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";

/**
 * Global Error Tracker Component
 * Captures unhandled client-side errors and promise rejections
 * and logs them to MySQL for production debugging.
 */
export default function ErrorTracker() {
    const { user } = useAuth();

    useEffect(() => {
        const handleError = (event: ErrorEvent) => {
            // Log global runtime errors
            logError(
                event.error || { message: event.message },
                "GLOBAL_WINDOW_ERROR",
                user?.email || "anonymous"
            );
        };

        const handleRejection = (event: PromiseRejectionEvent) => {
            // Log unhandled promise rejections (e.g. failed fetch calls)
            logError(
                event.reason,
                "GLOBAL_PROMISE_REJECTION",
                user?.email || "anonymous"
            );
        };

        window.addEventListener("error", handleError);
        window.addEventListener("unhandledrejection", handleRejection);

        return () => {
            window.removeEventListener("error", handleError);
            window.removeEventListener("unhandledrejection", handleRejection);
        };
    }, [user]);

    return null;
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { API_ENDPOINTS } from "@/config/api";

/**
 * Hook to monitor local agent status.
 * Polls localhost:3001/api/status every 10 seconds.
 * 
 * Response format:
 *   { agent: "ArifB-PMO", status: "online", relay: "connected", esocialBrowser: bool, imeiBrowser: bool }
 * 
 * If localhost is unreachable (fetch fails) → agent is offline.
 */
export function useBotStatus() {
    const [isBotOnline, setIsBotOnline] = useState(false);
    const [agents, setAgents] = useState<any[]>([]);
    const initialCheckDone = useRef(false);

    const handleLaunchBot = useCallback(() => {
        /* no-op */
    }, []);

    const checkBotStatus = useCallback(async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const res = await fetch(API_ENDPOINTS.botStatus, {
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                setIsBotOnline(false);
                setAgents([]);
                return false;
            }

            const data = await res.json();

            // localhost /api/status returns: { agent, status, relay, ... }
            const online = data.status === "online";

            setIsBotOnline(online);
            setAgents(online ? [{ id: data.agent, label: data.agent, busy: false }] : []);
            return online;
        } catch {
            // localhost unreachable → agent not running
            setIsBotOnline(false);
            setAgents([]);
            return false;
        }
    }, []);

    useEffect(() => {
        if (!initialCheckDone.current) {
            initialCheckDone.current = true;
            //checkBotStatus();
        }
        const interval = setInterval(checkBotStatus, 5000);
        return () => clearInterval(interval);
    }, [checkBotStatus]);

    return {
        isBotOnline,
        agents,
        agentCount: agents.length,
        handleLaunchBot,
        checkBotStatus,
    };
}

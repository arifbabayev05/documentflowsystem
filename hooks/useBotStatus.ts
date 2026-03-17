"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { API_ENDPOINTS } from "@/config/api";

interface AgentInfo {
    id: string;
    label: string;
    busy: boolean;
}

/**
 * Hook to monitor local agent status.
 * Polls localhost:3001/api/status every 15 seconds.
 * If localhost is unreachable → agent is offline.
 */
export function useBotStatus() {
    const [isBotOnline, setIsBotOnline] = useState(false);
    const [agents, setAgents] = useState<AgentInfo[]>([]);
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

            // localhost /api/status returns: { agents: [...], pendingJobs }
            const agentList = Array.isArray(data.agents) ? data.agents : [];
            const online = agentList.length > 0;

            setIsBotOnline(online);
            setAgents(agentList);
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
            checkBotStatus();
        }
        const interval = setInterval(checkBotStatus, 15000);
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

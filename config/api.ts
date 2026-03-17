/**
 * Central API configuration.
 *
 * ARCHITECTURE:
 *  - setup-command, install, status  →  Railway (public, always reachable)
 *  - scrape, check-imei             →  localhost:3001 (local agent on user PC)
 *  - botStatus                      →  Firebase Function → Railway /api/status
 */

const RAILWAY_BASE = "https://scrape-production-5d7a.up.railway.app";
const LOCAL_AGENT  = "http://localhost:3001";

const FIREBASE_PROJECT_ID = "legal12-kontakt";
const FUNCTIONS_REGION = "europe-west1";
export const FUNCTIONS_BASE = `https://${FUNCTIONS_REGION}-${FIREBASE_PROJECT_ID}.cloudfunctions.net`;

export const API_ENDPOINTS = {
    /** E-Social scrape — local agent */
    scrape: `${LOCAL_AGENT}/api/scrape`,
    /** IMEI check — local agent */
    checkImei: `${LOCAL_AGENT}/api/check-imei`,
    /** Agent status — direct from local agent */
    botStatus: `${LOCAL_AGENT}/api/status`,
    /** Setup command — Railway (public, agent not yet installed) */
    setupCommand: `${RAILWAY_BASE}/api/setup-command`,
} as const;

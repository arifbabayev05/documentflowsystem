const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const axios = require("axios");

setGlobalOptions({ maxInstances: 10, region: "europe-west1" });

const RAILWAY_BASE = "https://scrape-production-5d7a.up.railway.app";

// ─────────────────────────────────────────────
// 1. Bot / Agent Status
// ─────────────────────────────────────────────
exports.botStatus = onRequest({ cors: true }, async (req, res) => {
    try {
        const response = await axios.get(`${RAILWAY_BASE}/api/status`, {
            timeout: 8000,
        });
        return res.json({
            online: Array.isArray(response.data.agents) &&
                response.data.agents.length > 0,
            agents: response.data.agents || [],
            pendingJobs: response.data.pendingJobs || 0,
        });
    } catch (err) {
        logger.error("botStatus error:", err.message);
        return res.json({ online: false, agents: [], pendingJobs: 0 });
    }
});

// ─────────────────────────────────────────────
// 2. E-Social Scrape  (FİN + SV → şəxsi məlumat)
// ─────────────────────────────────────────────
exports.scrape = onRequest({ cors: true, timeoutSeconds: 120 }, async (req, res) => {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Yalnız POST metodu dəstəklənir." });
    }

    const { fin, sv, agentLabel } = req.body || {};
    if (!fin || !sv) {
        return res.status(400).json({
            error: "FİN və Seriya nömrəsi daxil edilməlidir.",
        });
    }

    try {
        const payload = { fin, sv };
        if (agentLabel) payload.agentLabel = agentLabel;

        const response = await axios.post(
            `${RAILWAY_BASE}/api/scrape`,
            payload,
            { timeout: 90000, headers: { "Content-Type": "application/json" } },
        );

        const botData = response.data;

        // Railway may wrap in { data: {...} } or return flat
        const d = botData.data || botData;

        if (!d || Object.keys(d).length === 0) {
            return res.status(404).json({ error: "Məlumat tapılmadı." });
        }

        // Check for LOGIN_REQUIRED coming from agent
        if (d.error === "LOGIN_REQUIRED") {
            return res.json({ data: d });
        }

        return res.json({ data: d });
    } catch (err) {
        logger.error("scrape error:", err.message, err.response?.data);
        const status = err.response?.status || 502;
        const message =
            err.response?.data?.error ||
            err.response?.data?.message ||
            "Xidmət cavab vermir.";
        return res.status(status).json({ error: message, details: err.message });
    }
});

// ─────────────────────────────────────────────
// 3. IMEI Yoxlama
// ─────────────────────────────────────────────
exports.checkImei = onRequest({ cors: true, timeoutSeconds: 30 }, async (req, res) => {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Yalnız POST metodu dəstəklənir." });
    }

    const { imei, agentLabel } = req.body || {};
    if (!imei) {
        return res.status(400).json({ error: "IMEI daxil edilməlidir." });
    }

    try {
        const payload = { imei };
        if (agentLabel) payload.agentLabel = agentLabel;

        const response = await axios.post(
            `${RAILWAY_BASE}/api/check-imei`,
            payload,
            { timeout: 20000, headers: { "Content-Type": "application/json" } },
        );
        // Expected: { imeiFee: boolean, message: string }
        return res.json(response.data);
    } catch (err) {
        logger.error("checkImei error:", err.message, err.response?.data);
        const status = err.response?.status || 502;
        const message =
            err.response?.data?.error ||
            err.response?.data?.message ||
            "IMEI xidməti cavab vermir.";
        return res.status(status).json({ error: message, details: err.message });
    }
});

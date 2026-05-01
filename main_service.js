const express = require('express');
const axios = require('axios');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 4000;
const BOT_PATH = 'C:\\bot\\bot_service.exe';
// We assume the bot service will listen on port 5000 once started
// or we can adjust this if it uses another port.
const ACTUAL_BOT_URL = 'http://127.0.0.1:4001';

async function isBotRunning() {
    return new Promise((resolve) => {
        exec('tasklist /FI "IMAGENAME eq bot_service.exe"', (err, stdout) => {
            if (err) return resolve(false);
            resolve(stdout.toLowerCase().includes('bot_service.exe'));
        });
    });
}

async function ensureBotStarted() {
    const running = await isBotRunning();
    if (!running) {
        console.log("Starting bot service...");
        if (fs.existsSync(BOT_PATH)) {
            // Use spawn for long-running process to avoid output buffering issues
            const child = spawn(BOT_PATH, [], {
                detached: true,
                stdio: 'ignore',
                cwd: 'C:\\bot'
            });
            child.unref();
            // Give it some time to boot and start the server
            await new Promise(r => setTimeout(r, 3000));
        } else {
            alert("Bot xidməti tapılmadı")
            throw new Error(`Bot service file not found at ${BOT_PATH}`);
        }
    }
}

app.post('/api/check-imei', async (req, res) => {
    try {
        const { imei } = req.body;
        await ensureBotStarted();

        const response = await axios.post(`${ACTUAL_BOT_URL}/api/check-imei`, { imei }, { timeout: 10000 });
        res.json(response.data);
    } catch (error) {
        console.error("IMEI Error:", error.message);
        res.status(502).json({ error: "Bot xidməti aktiv deyil və ya xəta baş verdi.", details: error.message });
    }
});

app.post('/api/scrape', async (req, res) => {
    try {
        const { fin, sv } = req.body;
        await ensureBotStarted();

        const response = await axios.post(`${ACTUAL_BOT_URL}/api/scrape`, { fin, sv }, { timeout: 65000 });

        if (response.data) {
            const botData = response.data;
            // Map data to match Next.js frontend format
            const mapped = {
                fullName: botData.fullName?.toUpperCase() || "",
                gender: botData.gender || "",
                birthDate: botData.birthDate || "",
                address: botData.address || "",
                actualAddress: botData.actualAddress || "",
                passportSeries: botData.passportSeries || sv.toUpperCase(),
                passportNumber: botData.passportNumber || "",
                issueDate: botData.issueDate || "",
                authority: botData.authority || ""
            };
            res.json({ data: mapped });
        } else {
            res.status(404).json({ error: "Məlumat tapılmadı." });
        }
    } catch (error) {
        console.error("Scrape Error:", error.message);
        res.status(502).json({ error: "Bot xidməti cavab vermir və ya sessiya bitib.", details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Local Bridge Service running at http://localhost:${PORT}`);
    console.log(`Targeting Bot at: ${BOT_PATH}`);
});

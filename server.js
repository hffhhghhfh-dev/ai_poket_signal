"use strict";

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const OTCHARTS_URL = "https://otcharts.com";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// =====================================
// CACHE
// =====================================

const cache = new Map();

async function cached(key, ttl, callback) {
    const old = cache.get(key);

    if (old && Date.now() - old.time < ttl) {
        return old.data;
    }

    const data = await callback();

    cache.set(key, {
        time: Date.now(),
        data
    });

    return data;
}

// =====================================
// OTCHARTS REQUEST
// =====================================

async function otcRequest(endpoint, params = {}) {
    const apiKey = process.env.OTCHARTS_API_KEY;

    if (!apiKey) {
        const error = new Error(
            "OTCHARTS_API_KEY отсутствует в Render Environment"
        );

        error.status = 500;
        throw error;
    }

    const url = new URL(endpoint, OTCHARTS_URL);

    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
            "User-Agent": "PocketAIUltimatePro/2.1"
        },
        signal: AbortSignal.timeout(20000)
    });

    const text = await response.text();

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        data = { error: text.slice(0, 500) };
    }

    if (!response.ok) {
        const error = new Error(
            data.error || `OTCharts HTTP ${response.status}`
        );

        error.status = response.status;
        error.details = data;

        throw error;
    }

    return data;
}

// =====================================
// HOME PAGE
// =====================================

app.get("/", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(__dirname, "index.html"));
});

// =====================================
// HEALTH
// =====================================

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        name: "POCKET AI ULTIMATE PRO",
        version: "2.1.0",
        status: "online",
        time: new Date().toISOString()
    });
});

// =====================================
// OTCHARTS STATUS
// =====================================

app.get("/api/status", async (req, res) => {
    try {
        const data = await otcRequest("/v1/venues");

        res.json({
            success: true,
            status: "connected",
            otcharts: data
        });

    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            status: "disconnected",
            error: error.message,
            details: error.details || null
        });
    }
});

// =====================================
// AVAILABLE MARKETS
// =====================================

app.get("/api/venues", async (req, res) => {
    try {
        const data = await cached(
            "venues",
            60000,
            () => otcRequest("/v1/venues")
        );

        res.json({
            success: true,
            ...data
        });

    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            error: error.message,
            details: error.details || null
        });
    }
});

// =====================================
// SYMBOLS
// =====================================

app.get("/api/symbols", async (req, res) => {
    try {
        const venue = String(
            req.query.venue || "otc"
        ).toLowerCase();

        if (!["otc", "forex"].includes(venue)) {
            return res.status(400).json({
                success: false,
                error: "Допустимые рынки: otc, forex"
            });
        }

        const data = await cached(
            `symbols:${venue}`,
            60000,
            () => otcRequest("/v1/symbols", { venue })
        );

        res.json({
            success: true,
            ...data
        });

    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            error: error.message,
            details: error.details || null
        });
    }
});

// =====================================
// CANDLES
// =====================================

app.get("/api/candles", async (req, res) => {
    try {
        const venue = String(
            req.query.venue || "otc"
        ).toLowerCase();

        const symbol = String(
            req.query.symbol || ""
        ).trim();

        const tf = Number(req.query.tf || 60);
        const limit = Number(req.query.limit || 300);

        if (!["otc", "forex"].includes(venue)) {
            return res.status(400).json({
                success: false,
                error: "Неверный рынок"
            });
        }

        if (!/^[A-Za-z0-9_#/-]+$/.test(symbol)) {
            return res.status(400).json({
                success: false,
                error: "Неверный символ"
            });
        }

        const allowedOTC = [
            5, 15, 30, 60, 120, 180,
            300, 600, 900, 1800, 3600, 14400
        ];

        const allowedForex = [
            60, 120, 180, 300, 600,
            900, 1800, 3600, 14400
        ];

        const allowed = venue === "otc"
            ? allowedOTC
            : allowedForex;

        if (!allowed.includes(tf)) {
            return res.status(400).json({
                success: false,
                error: "Таймфрейм не поддерживается этим рынком",
                available: allowed
            });
        }

        if (
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 1500
        ) {
            return res.status(400).json({
                success: false,
                error: "limit должен быть от 1 до 1500"
            });
        }

        const key = `candles:${venue}:${symbol}:${tf}:${limit}`;

        const data = await cached(
            key,
            10000,
            () => otcRequest("/v1/candles", {
                venue,
                symbol,
                tf,
                limit
            })
        );

        if (!Array.isArray(data.candles)) {
            return res.status(502).json({
                success: false,
                error: "OTCharts не вернул свечи",
                details: data
            });
        }

        res.json({
            success: true,
            ...data,
            source: "OTCharts"
        });

    } catch (error) {
        console.error("CANDLES ERROR:", error);

        res.status(error.status || 500).json({
            success: false,
            error: error.message,
            details: error.details || null
        });
    }
});

// =====================================
// GEMINI CONNECTION TEST
// =====================================

app.get("/api/ai-status", (req, res) => {
    res.json({
        success: true,
        configured: Boolean(process.env.GEMINI_API_KEY),
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash"
    });
});

// =====================================
// 404
// =====================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "API endpoint не найден",
        path: req.originalUrl
    });
});

// =====================================
// ERROR HANDLER
// =====================================

app.use((error, req, res, next) => {
    console.error("SERVER ERROR:", error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        success: false,
        error: "Внутренняя ошибка сервера"
    });
});

// =====================================
// START
// =====================================

app.listen(PORT, "0.0.0.0", () => {
    console.log("--------------------------------");
    console.log("POCKET AI ULTIMATE PRO");
    console.log("VERSION: 2.1.0");
    console.log("SERVER: ONLINE");
    console.log("PORT:", PORT);
    console.log("OTCHARTS:", Boolean(process.env.OTCHARTS_API_KEY));
    console.log("GEMINI:", Boolean(process.env.GEMINI_API_KEY));
    console.log("--------------------------------");
});

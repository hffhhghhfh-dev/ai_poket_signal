const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API = "https://otcharts.com";

const cache = new Map();

async function otcRequest(endpoint, params = {}) {
    const key = process.env.OTCHARTS_API_KEY;

    if (!key) {
        throw new Error("OTCHARTS_API_KEY не найден в Render");
    }

    const url = new URL(API + endpoint);

    Object.entries(params).forEach(([k, v]) => {
        url.searchParams.set(k, String(v));
    });

    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${key}`,
            Accept: "application/json"
        },
        signal: AbortSignal.timeout(20000)
    });

    const data = await response.json();

    if (!response.ok) {
        const error = new Error("OTCharts API error");
        error.status = response.status;
        error.details = data;
        throw error;
    }

    return data;
}

async function cachedRequest(cacheKey, endpoint, params) {
    const old = cache.get(cacheKey);

    if (old && Date.now() - old.time < 60000) {
        return old.data;
    }

    const data = await otcRequest(endpoint, params);

    cache.set(cacheKey, {
        time: Date.now(),
        data
    });

    return data;
}

// Главная страница
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Проверка сервера
app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        name: "AI POCKET OPTION PRO",
        version: "2.0"
    });
});

// Проверка подключения OTCharts
app.get("/api/status", async (req, res) => {
    try {
        const data = await otcRequest("/v1/venues");

        res.json({
            status: "CONNECTED",
            otcharts: data
        });

    } catch (error) {
        res.status(error.status || 500).json({
            status: "ERROR",
            message: error.message,
            details: error.details || null
        });
    }
});

// Список рынков
app.get("/api/venues", async (req, res) => {
    try {
        const data = await cachedRequest(
            "venues",
            "/v1/venues"
        );

        res.json(data);

    } catch (error) {
        res.status(error.status || 500).json({
            error: error.message,
            details: error.details || null
        });
    }
});

// Список валютных пар
app.get("/api/symbols", async (req, res) => {
    try {
        const venue = req.query.venue || "otc";

        if (!["otc", "forex"].includes(venue)) {
            return res.status(400).json({
                error: "Неверный рынок"
            });
        }

        const data = await cachedRequest(
            "symbols_" + venue,
            "/v1/symbols",
            { venue }
        );

        res.json(data);

    } catch (error) {
        res.status(error.status || 500).json({
            error: error.message,
            details: error.details || null
        });
    }
});

// Получение свечей
app.get("/api/candles", async (req, res) => {
    try {
        const venue = req.query.venue || "otc";
        const symbol = req.query.symbol || "EURUSD_otc";
        const tf = Number(req.query.tf || 60);
        const limit = Number(req.query.limit || 300);

        if (!["otc", "forex"].includes(venue)) {
            return res.status(400).json({
                error: "Неверный рынок"
            });
        }

        if (!/^[A-Za-z0-9_#/-]+$/.test(symbol)) {
            return res.status(400).json({
                error: "Неверный инструмент"
            });
        }

        if (!Number.isInteger(tf) || tf < 1 || tf > 86400) {
            return res.status(400).json({
                error: "Неверный таймфрейм"
            });
        }

        if (!Number.isInteger(limit) || limit < 50 || limit > 1500) {
            return res.status(400).json({
                error: "Количество свечей: от 50 до 1500"
            });
        }

        const data = await otcRequest("/v1/candles", {
            venue,
            symbol,
            tf,
            limit
        });

        if (!Array.isArray(data.candles)) {
            return res.status(502).json({
                error: "OTCharts не вернул список свечей",
                details: data
            });
        }

        res.json(data);

    } catch (error) {
        console.error("CANDLES ERROR:", error);

        res.status(error.status || 500).json({
            error: error.message,
            details: error.details || null
        });
    }
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error(err);

    res.status(500).json({
        error: "Внутренняя ошибка сервера"
    });
});

app.listen(PORT, () => {
    console.log("AI POCKET OPTION PRO 2.0");
    console.log("Server started on port " + PORT);
});

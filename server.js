require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const settings = require("./config/settings");
const { getMarketData } = require("./services/market");
const { analyzeMarket } = require("./analysis/analyzer");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Главная страница
const indexPath = path.join(__dirname, "index.html");

app.get("/", (req, res) => {
    if (!fs.existsSync(indexPath)) {
        return res.status(500).send("Файл index.html не найден");
    }

    res.sendFile(indexPath);
});

// Статические файлы
app.use(express.static(__dirname));

// Проверка сервера
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        name: "POCKET AI ULTIMATE PRO",
        version: "2.1.0",
        status: "online",
        time: new Date().toISOString()
    });
});

// Список валютных пар
app.get("/api/symbols", (req, res) => {
    const venue = String(req.query.marketType || "OTC").toUpperCase();
    const market = venue === "FOREX" ? "REGULAR" : venue;
    const symbols = settings.markets[market];

    if (!Array.isArray(symbols)) {
        return res.status(400).json({
            success: false,
            error: "Неизвестный рынок"
        });
    }

    res.json({
        success: true,
        marketType: market,
        symbols
    });
});

// Таймфреймы
app.get("/api/timeframes", (req, res) => {
    res.json({
        success: true,
        timeframes: Object.keys(settings.timeframes)
    });
});

// Получение свечей для Mini App
app.get("/api/candles", async (req, res) => {
    try {
        const symbol = String(req.query.symbol || "").trim();
        const venueInput = String(req.query.venue || "otc").toLowerCase();
        const tf = Number(req.query.tf || 60);

        const marketType =
            venueInput === "forex" || venueInput === "regular"
                ? "REGULAR"
                : "OTC";

        const timeframeEntry = Object.entries(settings.timeframes)
            .find(([name, seconds]) => seconds === tf);

        if (!timeframeEntry) {
            return res.status(400).json({
                success: false,
                error: "Неподдерживаемый таймфрейм"
            });
        }

        if (!settings.markets[marketType].includes(symbol)) {
            return res.status(400).json({
                success: false,
                error: "Валютная пара не найдена",
                symbol
            });
        }

        const data = await getMarketData({
            pair: symbol,
            marketType,
            timeframe: timeframeEntry[0]
        });

        res.json({
            success: true,
            symbol,
            venue: venueInput,
            interval: tf,
            count: data.candles.length,
            candles: data.candles,
            gaps: null,
            source: data.source,
            receivedAt: data.receivedAt
        });

    } catch (error) {
        console.error("CANDLES ERROR:", error.message);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Анализ рынка
app.post("/api/analyze", async (req, res) => {
    try {
        const {
            pair,
            marketType = "OTC",
            timeframe = "1m"
        } = req.body || {};

        if (!pair) {
            return res.status(400).json({
                success: false,
                error: "Выберите валютную пару"
            });
        }

        const typeInput = String(marketType).toUpperCase();
        const type = typeInput === "FOREX" ? "REGULAR" : typeInput;
        const symbol = String(pair).trim();
        const tf = String(timeframe).trim();

        if (!settings.markets[type]) {
            return res.status(400).json({
                success: false,
                error: "Неверный тип рынка"
            });
        }

        if (!settings.markets[type].includes(symbol)) {
            return res.status(400).json({
                success: false,
                error: "Валютная пара не найдена"
            });
        }

        if (!settings.timeframes[tf]) {
            return res.status(400).json({
                success: false,
                error: "Неподдерживаемый таймфрейм"
            });
        }

        const marketData = await getMarketData({
            pair: symbol,
            marketType: type,
            timeframe: tf
        });

        const result = await analyzeMarket(marketData);

        res.json({
            success: true,
            pair: symbol,
            marketType: type,
            timeframe: tf,
            result
        });

    } catch (error) {
        console.error("ANALYSIS ERROR:", error.message);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 404
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "API endpoint не найден",
        path: req.originalUrl
    });
});

// Запуск
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("POCKET AI ULTIMATE PRO ONLINE");
    console.log("PORT:", PORT);
    console.log("INDEX:", indexPath);
});

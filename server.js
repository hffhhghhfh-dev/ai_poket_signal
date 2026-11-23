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

// ======================================
// MINI APP — ГЛАВНАЯ СТРАНИЦА
// ======================================

const indexPath = path.join(__dirname, "index.html");

app.get("/", (req, res) => {
    if (!fs.existsSync(indexPath)) {
        return res.status(500).send(
            "Ошибка: файл index.html не найден в корне проекта."
        );
    }

    res.sendFile(indexPath);
});

// Статические файлы Mini App
app.use(express.static(__dirname));

// ======================================
// HEALTH CHECK
// ======================================

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        name: "POCKET AI ULTIMATE PRO",
        version: "2.0.0",
        status: "online",
        time: new Date().toISOString()
    });
});

// ======================================
// ВАЛЮТНЫЕ ПАРЫ
// ======================================

app.get("/api/symbols", (req, res) => {
    try {
        const marketType = String(
            req.query.marketType || "OTC"
        ).toUpperCase();

        const symbols = settings.markets[marketType];

        if (!Array.isArray(symbols)) {
            return res.status(400).json({
                success: false,
                error: "Неизвестный тип рынка"
            });
        }

        res.json({
            success: true,
            marketType,
            count: symbols.length,
            symbols
        });

    } catch (error) {
        console.error("SYMBOLS ERROR:", error);

        res.status(500).json({
            success: false,
            error: "Не удалось получить список валют"
        });
    }
});

// ======================================
// ТАЙМФРЕЙМЫ
// ======================================

app.get("/api/timeframes", (req, res) => {
    res.json({
        success: true,
        timeframes: Object.keys(settings.timeframes)
    });
});

// ======================================
// АНАЛИЗ РЫНКА
// ======================================

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

        const symbol = String(pair).trim();
        const type = String(marketType).toUpperCase();
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
                error: "Валютная пара не найдена",
                received: symbol,
                available: settings.markets[type]
            });
        }

        if (!settings.timeframes[tf]) {
            return res.status(400).json({
                success: false,
                error: "Неподдерживаемый таймфрейм",
                received: tf,
                available: Object.keys(settings.timeframes)
            });
        }

        console.log("========== NEW ANALYSIS ==========");
        console.log("PAIR:", symbol);
        console.log("MARKET:", type);
        console.log("TIMEFRAME:", tf);

        // Получаем рыночные данные
        const marketData = await getMarketData({
            pair: symbol,
            marketType: type,
            timeframe: tf
        });

        if (!marketData) {
            throw new Error("Рыночные данные не получены");
        }

        // Запускаем анализ
        const result = await analyzeMarket(marketData);

        if (!result) {
            throw new Error("Анализ не вернул результат");
        }

        console.log("ANALYSIS COMPLETED");

        return res.json({
            success: true,
            pair: symbol,
            marketType: type,
            timeframe: tf,
            result
        });

    } catch (error) {
        console.error("ANALYSIS ERROR:", error);

        return res.status(500).json({
            success: false,
            error: error.message || "Ошибка анализа"
        });
    }
});

// ======================================
// 404
// ======================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "API endpoint не найден",
        path: req.originalUrl
    });
});

// ======================================
// ОБРАБОТКА ОШИБОК
// ======================================

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

// ======================================
// ЗАПУСК
// ======================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("==================================");
    console.log("POCKET AI ULTIMATE PRO");
    console.log("SERVER: ONLINE");
    console.log("PORT:", PORT);
    console.log("INDEX:", indexPath);
    console.log("==================================");
});

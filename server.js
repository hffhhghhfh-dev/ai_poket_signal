require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const settings = require("./config/settings");
const { getMarketData } = require("./services/market");
const { analyzeMarket } = require("./analysis/analyzer");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// =====================================
// ГЛАВНАЯ СТРАНИЦА
// =====================================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// =====================================
// ПРОВЕРКА СЕРВЕРА
// =====================================

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        name: "POCKET AI ULTIMATE PRO",
        version: "2.0.0",
        status: "online",
        time: new Date().toISOString()
    });
});

// =====================================
// СПИСОК ВАЛЮТНЫХ ПАР
// =====================================

app.get("/api/symbols", (req, res) => {
    try {
        const marketType = String(
            req.query.marketType || "OTC"
        ).toUpperCase();

        const symbols = settings.markets[marketType];

        if (!symbols) {
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
        console.error("SYMBOLS ERROR:", error.message);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================
// СПИСОК ТАЙМФРЕЙМОВ
// =====================================

app.get("/api/timeframes", (req, res) => {
    res.json({
        success: true,
        timeframes: Object.keys(settings.timeframes)
    });
});

// =====================================
// АНАЛИЗ РЫНКА
// =====================================

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

        const type = String(marketType).toUpperCase();
        const symbol = String(pair).trim();
        const tf = String(timeframe).trim();

        // Проверка типа рынка
        if (!settings.markets[type]) {
            return res.status(400).json({
                success: false,
                error: "Неверный тип рынка"
            });
        }

        // Проверка валютной пары
        if (!settings.markets[type].includes(symbol)) {
            return res.status(400).json({
                success: false,
                error: "Валютная пара отсутствует в списке",
                received: symbol,
                available: settings.markets[type]
            });
        }

        // Проверка таймфрейма
        if (!settings.timeframes[tf]) {
            return res.status(400).json({
                success: false,
                error: "Неподдерживаемый таймфрейм",
                received: tf,
                available: Object.keys(settings.timeframes)
            });
        }

        console.log("--------------------------------");
        console.log("NEW MARKET ANALYSIS");
        console.log("PAIR:", symbol);
        console.log("MARKET:", type);
        console.log("TIMEFRAME:", tf);
        console.log("--------------------------------");

        // Получение рыночных данных
        const marketData = await getMarketData({
            pair: symbol,
            marketType: type,
            timeframe: tf
        });

        if (!marketData) {
            throw new Error("OTCharts не вернул рыночные данные");
        }

        // Анализ технических индикаторов и ИИ
        const result = await analyzeMarket(marketData);

        if (!result) {
            throw new Error("Анализатор не вернул результат");
        }

        console.log("ANALYSIS COMPLETED:", result.signal);

        return res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error("ANALYSIS ERROR:", error);

        return res.status(500).json({
            success: false,
            error: error.message || "Ошибка анализа рынка"
        });
    }
});

// =====================================
// НЕИЗВЕСТНЫЕ АДРЕСА
// =====================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "API endpoint не найден",
        path: req.originalUrl
    });
});

// =====================================
// ГЛОБАЛЬНАЯ ОБРАБОТКА ОШИБОК
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
// ЗАПУСК СЕРВЕРА
// =====================================

const PORT = process.env.PORT || settings.server.port || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("================================");
    console.log("POCKET AI ULTIMATE PRO");
    console.log("SERVER STATUS: RUNNING");
    console.log("PORT:", PORT);
    console.log("================================");
});

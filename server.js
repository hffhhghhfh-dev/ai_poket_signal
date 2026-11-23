require("dotenv").config();

const express = require("express");
const cors = require("cors");

const settings = require("./config/settings");
const { getMarketData } = require("./services/market");
const { analyzeMarket } = require("./analysis/analyzer");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Главная страница
app.get("/", (req, res) => {
  res.json({
    name: "POCKET AI ULTIMATE PRO",
    version: "2.0.0",
    status: "running"
  });
});

// Проверка сервера
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
    time: new Date().toISOString()
  });
});

// Список валютных пар
app.get("/api/symbols", (req, res) => {
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
    symbols
  });
});

// Доступные таймфреймы
app.get("/api/timeframes", (req, res) => {
  res.json({
    success: true,
    timeframes: Object.keys(settings.timeframes)
  });
});

// Основной анализ рынка
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

    if (!settings.markets[type]) {
      return res.status(400).json({
        success: false,
        error: "Неверный тип рынка"
      });
    }

    if (!settings.markets[type].includes(pair)) {
      return res.status(400).json({
        success: false,
        error: "Эта валютная пара отсутствует в списке"
      });
    }

    if (!settings.timeframes[timeframe]) {
      return res.status(400).json({
        success: false,
        error: "Неподдерживаемый таймфрейм"
      });
    }

    // Получаем свечи
    const marketData = await getMarketData({
      pair,
      marketType: type,
      timeframe
    });

    // Выполняем полный анализ
    const result = await analyzeMarket(marketData);

    return res.json(result);

  } catch (error) {
    console.error("ANALYSIS ERROR:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message || "Ошибка анализа рынка"
    });
  }
});

// Обработка неизвестных адресов
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "API endpoint не найден"
  });
});

// Запуск сервера
const PORT = settings.server.port;

app.listen(PORT, () => {
  console.log(
    `POCKET AI ULTIMATE PRO running on port ${PORT}`
  );
});

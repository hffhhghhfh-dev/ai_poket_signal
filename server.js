const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;
const API_KEY = process.env.TWELVE_DATA_API_KEY;

app.use(express.json());
app.use(express.static(__dirname));

const PAIRS = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "AUD/USD",
  "USD/CHF",
  "USD/CAD",
  "NZD/USD",
  "EUR/JPY",
  "GBP/JPY",
  "EUR/GBP",
  "EUR/CHF",
  "AUD/JPY"
];

const INTERVALS = {
  "1": "1min",
  "5": "5min",
  "15": "15min",
  "30": "30min",
  "45": "45min",
  "60": "1h"
};

// Получение свечей от Twelve Data
async function getMarketData(symbol, interval) {
  if (!API_KEY) {
    throw new Error("Twelve Data API key не настроен на Render");
  }

  const params = new URLSearchParams({
    symbol,
    interval,
    outputsize: "100",
    apikey: API_KEY,
    timezone: "UTC",
    order: "ASC"
  });

  const url =
    "https://api.twelvedata.com/time_series?" +
    params.toString();

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.status === "error" || data.code) {
    throw new Error(
      data.message || "Ошибка получения данных Twelve Data"
    );
  }

  if (!Array.isArray(data.values) || data.values.length === 0) {
    throw new Error("Twelve Data не вернул свечи");
  }

  return data.values.map(candle => ({
    time: candle.datetime,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close)
  }));
}

// Экспоненциальная скользящая средняя
function calculateEMA(values, period) {
  if (values.length < period) {
    return null;
  }

  const multiplier = 2 / (period + 1);

  let result = values
    .slice(0, period)
    .reduce((sum, value) => sum + value, 0) / period;

  for (let i = period; i < values.length; i++) {
    result =
      (values[i] - result) * multiplier + result;
  }

  return result;
}

// Индекс относительной силы RSI
function calculateRSI(values, period = 14) {
  if (values.length <= period) {
    return 50;
  }

  let gains = 0;
  let losses = 0;

  for (
    let i = values.length - period;
    i < values.length;
    i++
  ) {
    const change = values[i] - values[i - 1];

    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  const averageGain = gains / period;
  const averageLoss = losses / period;

  if (averageLoss === 0) {
    return averageGain === 0 ? 50 : 100;
  }

  const rs = averageGain / averageLoss;

  return 100 - 100 / (1 + rs);
}

// Расчёт MACD
function calculateMACD(values) {
  const ema12 = calculateEMA(values, 12);
  const ema26 = calculateEMA(values, 26);

  if (ema12 === null || ema26 === null) {
    return 0;
  }

  return ema12 - ema26;
}

// Анализ рынка
function analyzeMarket(candles) {
  if (!Array.isArray(candles) || candles.length < 30) {
    throw new Error("Недостаточно свечей для анализа");
  }

  const closes = candles.map(c => c.close);

  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const rsi = calculateRSI(closes, 14);
  const macd = calculateMACD(closes);

  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  let buy = 0;
  let sell = 0;

  if (ema9 > ema21) buy++;
  if (ema9 < ema21) sell++;

  if (rsi > 50 && rsi < 70) buy++;
  if (rsi < 50 && rsi > 30) sell++;

  if (macd > 0) buy++;
  if (macd < 0) sell++;

  if (last.close > last.open) buy++;
  if (last.close < last.open) sell++;

  if (last.close > previous.close) buy++;
  if (last.close < previous.close) sell++;

  let direction = "WAITING";

  if (buy >= 4 && buy > sell) {
    direction = "BUY";
  } else if (sell >= 4 && sell > buy) {
    direction = "SELL";
  }

  const agreement = Math.round(
    (Math.max(buy, sell) / 5) * 100
  );

  return {
    direction,
    agreement,
    price: last.close,
    candleTime: last.time,

    indicators: {
      ema9: Number(ema9.toFixed(6)),
      ema21: Number(ema21.toFixed(6)),
      rsi: Number(rsi.toFixed(2)),
      macd: Number(macd.toFixed(6))
    },

    scores: {
      buy,
      sell
    },

    explanation:
      direction === "BUY"
        ? "Большинство проверенных условий указывает вверх"
        : direction === "SELL"
        ? "Большинство проверенных условий указывает вниз"
        : "Недостаточно подтверждений для направления"
  };
}

// Проверка сервера
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
    service: "POCKET AI ULTIMATE PRO",
    provider: "Twelve Data",
    apiKeyConfigured: Boolean(API_KEY)
  });
});

// Список валютных пар
app.get("/api/symbols", (req, res) => {
  res.json({
    success: true,
    provider: "Twelve Data",
    market: "Forex",
    symbols: PAIRS
  });
});

// Получение свечей
app.get("/api/candles", async (req, res) => {
  try {
    const symbol = String(req.query.symbol || "").toUpperCase();
    const tf = String(req.query.tf || "1");
    const interval = INTERVALS[tf];

    if (!PAIRS.includes(symbol)) {
      return res.status(400).json({
        success: false,
        error: "Неизвестная валютная пара"
      });
    }

    if (!interval) {
      return res.status(400).json({
        success: false,
        error: "Неподдерживаемый таймфрейм"
      });
    }

    const candles = await getMarketData(symbol, interval);

    res.json({
      success: true,
      provider: "Twelve Data",
      market: "Forex",
      symbol,
      timeframe: interval,
      candles
    });

  } catch (error) {
    console.error("CANDLES ERROR:", error.message);

    res.status(502).json({
      success: false,
      error: error.message
    });
  }
});

// Анализ рынка
app.get("/api/analyze", async (req, res) => {
  try {
    const symbol = String(req.query.symbol || "").toUpperCase();
    const tf = String(req.query.tf || "1");
    const interval = INTERVALS[tf];

    if (!PAIRS.includes(symbol)) {
      return res.status(400).json({
        success: false,
        error: "Выберите валютную пару"
      });
    }

    if (!interval) {
      return res.status(400).json({
        success: false,
        error: "Неподдерживаемый таймфрейм"
      });
    }

    const candles = await getMarketData(symbol, interval);
    const result = analyzeMarket(candles);

    res.json({
      success: true,
      provider: "Twelve Data",
      market: "Forex",
      symbol,
      timeframe: interval,
      candleCount: candles.length,
      ...result
    });

  } catch (error) {
    console.error("ANALYZE ERROR:", error.message);

    res.status(502).json({
      success: false,
      error: error.message
    });
  }
});

// Главная страница
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Обработка остальных адресов
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Маршрут не найден"
  });
});

// Запуск
app.listen(PORT, () => {
  console.log("--------------------------------");
  console.log("POCKET AI ONLINE");
  console.log("PROVIDER: TWELVE DATA");
  console.log("API KEY:", Boolean(API_KEY));
  console.log("PORT:", PORT);
  console.log("--------------------------------");
});

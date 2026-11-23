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

async function getMarketData(symbol, interval) {
  if (!API_KEY) {
    throw new Error("Twelve Data API key не настроен");
  }

  const params = new URLSearchParams({
    symbol,
    interval,
    outputsize: "100",
    apikey: API_KEY,
    timezone: "UTC"
  });

  const response = await fetch(
    "https://api.twelvedata.com/time_series?" + params
  );

  const data = await response.json();

  if (!response.ok || data.status === "error" || data.code) {
    throw new Error(data.message || "Ошибка Twelve Data");
  }

  if (!data.values || !data.values.length) {
    throw new Error("Нет доступных свечей");
  }

  return data.values.reverse().map(c => ({
    time: c.datetime,
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close)
  }));
}

function ema(values, period) {
  const k = 2 / (period + 1);
  let result = values[0];

  for (let i = 1; i < values.length; i++) {
    result = values[i] * k + result * (1 - k);
  }

  return result;
}

function rsi(values, period = 14) {
  if (values.length <= period) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = values.length - period; i < values.length; i++) {
    const change = values[i] - values[i - 1];

    if (change > 0) gains += change;
    else losses -= change;
  }

  if (losses === 0) return 100;

  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function analyze(candles) {
  if (candles.length < 30) {
    throw new Error("Недостаточно данных для анализа");
  }

  const closes = candles.map(c => c.close);

  const ema9 = ema(closes.slice(-40), 9);
  const ema21 = ema(closes.slice(-60), 21);
  const rsiValue = rsi(closes);

  const macd = ema(closes, 12) - ema(closes, 26);

  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  let buy = 0;
  let sell = 0;

  if (ema9 > ema21) buy++;
  if (ema9 < ema21) sell++;

  if (rsiValue > 50 && rsiValue < 70) buy++;
  if (rsiValue < 50 && rsiValue > 30) sell++;

  if (macd > 0) buy++;
  if (macd < 0) sell++;

  if (last.close > last.open) buy++;
  if (last.close < last.open) sell++;

  if (last.close > previous.close) buy++;
  if (last.close < previous.close) sell++;

  let direction = "NO SIGNAL";

  if (buy >= 4 && buy > sell) direction = "BUY";
  if (sell >= 4 && sell > buy) direction = "SELL";

  return {
    direction,
    agreement: Math.round(
      Math.max(buy, sell) / 5 * 100
    ),
    price: last.close,
    candleTime: last.time,
    indicators: {
      ema9: Number(ema9.toFixed(6)),
      ema21: Number(ema21.toFixed(6)),
      rsi: Number(rsiValue.toFixed(2)),
      macd: Number(macd.toFixed(6))
    },
    explanation:
      direction === "BUY"
        ? "Преобладают признаки восходящего движения"
        : direction === "SELL"
        ? "Преобладают признаки нисходящего движения"
        : "Недостаточно подтверждений направления"
  };
}

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
    provider: "Twelve Data",
    apiKeyConfigured: Boolean(API_KEY)
  });
});

app.get("/api/symbols", (req, res) => {
  res.json({
    success: true,
    symbols: PAIRS
  });
});

app.get("/api/candles", async (req, res) => {
  try {
    const { symbol, tf = "1" } = req.query;
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
      symbol,
      candles
    });

  } catch (error) {
    res.status(502).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/api/analyze", async (req, res) => {
  try {
    const { symbol, tf = "1" } = req.query;
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
    const result = analyze(candles);

    res.json({
      success: true,
      provider: "Twelve Data",
      market: "Forex",
      symbol,
      timeframe: interval,
      ...result
    });

  } catch (error) {
    res.status(502).json({
      success: false,
      error: error.message
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log("POCKET AI ONLINE");
  console.log("PROVIDER: TWELVE DATA");
  console.log("API KEY:", Boolean(API_KEY));
});

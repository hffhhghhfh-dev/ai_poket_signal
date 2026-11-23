const axios = require("axios");
const settings = require("../config/settings");

const BASE_URL = "https://otcharts.com";

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    "User-Agent": "Pocket-AI-Ultimate-Pro/2.0",
    "Accept": "application/json"
  }
});

// Проверка API-ключа
function checkApiKey() {
  if (!settings.otcharts.apiKey) {
    throw new Error("OTCHARTS_API_KEY не настроен");
  }
}

// Получение списка доступных рынков
async function getVenues() {
  checkApiKey();

  const response = await client.get("/v1/venues", {
    headers: {
      Authorization: `Bearer ${settings.otcharts.apiKey}`
    }
  });

  return response.data;
}

// Получение списка валютных пар
async function getSymbols(venue = "otc") {
  checkApiKey();

  const response = await client.get("/v1/symbols", {
    params: { venue },
    headers: {
      Authorization: `Bearer ${settings.otcharts.apiKey}`
    }
  });

  return response.data;
}

// Получение свечей
async function getCandles({
  symbol,
  timeframe = 60,
  limit = 250,
  venue = "otc"
}) {
  checkApiKey();

  if (!symbol) {
    throw new Error("Не указана валютная пара");
  }

  const allowedTimeframes = [
    5, 15, 30, 60, 120, 180,
    300, 600, 900, 1800,
    3600, 14400
  ];

  const tf = Number(timeframe);

  if (!allowedTimeframes.includes(tf)) {
    throw new Error(
      `Неподдерживаемый таймфрейм: ${tf} секунд`
    );
  }

  const response = await client.get("/v1/candles", {
    params: {
      venue,
      symbol,
      tf,
      limit: Math.min(Math.max(Number(limit) || 250, 1), 5000)
    },
    headers: {
      Authorization: `Bearer ${settings.otcharts.apiKey}`
    }
  });

  const candles = response.data.candles;

  if (!Array.isArray(candles) || candles.length === 0) {
    throw new Error("OTCharts не вернул свечи");
  }

  return {
    symbol: response.data.symbol,
    venue,
    interval: response.data.interval,
    count: candles.length,
    gaps: response.data.gaps || null,
    open: response.data.open,
    candles: candles.map(candle => ({
      time: Number(candle.time),
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: Number(candle.volume || 0)
    }))
  };
}

module.exports = {
  getVenues,
  getSymbols,
  getCandles
};

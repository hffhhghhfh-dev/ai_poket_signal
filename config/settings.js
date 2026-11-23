require("dotenv").config();

const settings = {
  server: {
    port: Number(process.env.PORT) || 3000,
    environment: process.env.NODE_ENV || "development"
  },

  otcharts: {
    url: process.env.OTCHARTS_URL || "https://otcharts.com",
    apiKey: process.env.OTCHARTS_API_KEY || ""
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini"
  },

  analysis: {
    candleLimit: Number(process.env.CANDLE_LIMIT) || 250,
    minCandles: Number(process.env.MIN_CANDLES) || 200
  },

  timeframes: {
    "5s": 5,
    "15s": 15,
    "30s": 30,
    "1m": 60,
    "3m": 180,
    "5m": 300,
    "10m": 600,
    "15m": 900,
    "20m": 1200,
    "30m": 1800
  },

  markets: {
    OTC: [
      "EURUSD_otc",
      "GBPUSD_otc",
      "USDJPY_otc",
      "AUDUSD_otc",
      "EURGBP_otc",
      "USDCAD_otc",
      "USDCHF_otc",
      "NZDUSD_otc"
    ],

    REGULAR: [
      "EURUSD",
      "GBPUSD",
      "USDJPY",
      "AUDUSD",
      "EURGBP",
      "USDCAD",
      "USDCHF",
      "NZDUSD"
    ]
  }
};

module.exports = settings;

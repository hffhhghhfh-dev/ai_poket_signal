const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.json({
    name: "AI POCKET OPTION PRO",
    status: "Сервер запущен"
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

app.get("/api/candles", async (req, res) => {
  try {
    const key = process.env.OTCHARTS_API_KEY;

    if (!key) {
      return res.status(500).json({
        error: "API ключ не найден"
      });
    }

    const venue = req.query.venue || "otc";
    const symbol = req.query.symbol || "EURUSD_otc";
    const tf = Number(req.query.tf || 60);
    const limit = Number(req.query.limit || 100);

    if (!["otc", "forex"].includes(venue)) {
      return res.status(400).json({
        error: "Неверный тип рынка"
      });
    }

    if (!/^[A-Za-z0-9_#-]+$/.test(symbol)) {
      return res.status(400).json({
        error: "Неверная валютная пара"
      });
    }

    if (!Number.isInteger(tf) || tf < 1 || tf > 86400) {
      return res.status(400).json({
        error: "Неверный таймфрейм"
      });
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 300) {
      return res.status(400).json({
        error: "Неверное количество свечей"
      });
    }

    const url = new URL(
      "https://otcharts.com/v1/candles"
    );

    url.searchParams.set("venue", venue);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("tf", String(tf));
    url.searchParams.set("limit", String(limit));

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);

  } catch (error) {
    res.status(500).json({
      error: "Ошибка получения рыночных данных"
    });
  }
});

app.listen(PORT, () => {
  console.log("AI POCKET OPTION PRO запущен");
});

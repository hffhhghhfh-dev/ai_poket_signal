const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Главная страница
app.get("/", (req, res) => {
  res.json({
    name: "AI POCKET OPTION PRO",
    status: "Сервер запущен",
    version: "1.0.0"
  });
});

// Проверка сервера
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Сервер работает"
  });
});

// Получение рыночных свечей
app.get("/api/candles", async (req, res) => {
  console.log("ЗАПРОС СВЕЧЕЙ ПОЛУЧЕН");

  try {
    const key = process.env.OTCHARTS_API_KEY;

    if (!key) {
      console.error("API ключ не найден");

      return res.status(500).json({
        error: "API ключ не найден в Render"
      });
    }

    const venue = req.query.venue || "otc";
    const symbol = req.query.symbol || "EURUSD_otc";
    const tf = Number(req.query.tf || 60);
    const limit = Number(req.query.limit || 100);

    // Проверка рынка
    if (!["otc", "forex"].includes(venue)) {
      return res.status(400).json({
        error: "Неверный тип рынка"
      });
    }

    // Проверка валютной пары
    if (!/^[A-Za-z0-9_#-]+$/.test(symbol)) {
      return res.status(400).json({
        error: "Неверная валютная пара"
      });
    }

    // Проверка таймфрейма
    if (!Number.isInteger(tf) || tf < 1 || tf > 86400) {
      return res.status(400).json({
        error: "Неверный таймфрейм"
      });
    }

    // Проверка количества свечей
    if (!Number.isInteger(limit) || limit < 1 || limit > 300) {
      return res.status(400).json({
        error: "Количество свечей должно быть от 1 до 300"
      });
    }

    // Адрес API
    const url = new URL("https://otcharts.com/v1/candles");

    url.searchParams.set("venue", venue);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("tf", String(tf));
    url.searchParams.set("limit", String(limit));

    console.log("Запрашиваем данные:", {
      venue,
      symbol,
      tf,
      limit
    });

    // Запрос к OTCharts
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(20000)
    });

    const data = await response.json();

    console.log("Ответ OTCharts:", response.status);

    // Если API вернул ошибку
    if (!response.ok) {
      console.error("Ошибка OTCharts:", response.status, data);

      return res.status(response.status).json({
        error: "Ошибка получения рыночных данных",
        status: response.status,
        details: data
      });
    }

    // Успешный ответ
    console.log("Свечи успешно получены");

    return res.json(data);

  } catch (error) {
    console.error("Ошибка /api/candles:", error);

    return res.status(500).json({
      error: "Ошибка сервера",
      details: error.message
    });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`AI POCKET OPTION PRO запущен на порту ${PORT}`);
});

const axios = require("axios");

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

async function analyzeWithAI(marketData) {
  if (!API_KEY) {
    throw new Error("GEMINI_API_KEY не настроен");
  }

  if (!marketData || !marketData.indicators) {
    throw new Error("Недостаточно рыночных данных");
  }

  const instructions = `
Ты — профессиональный аналитический ИИ.

Проанализируй предоставленные данные рынка.

Учитывай:
1. RSI
2. MACD
3. EMA 20, 50, 200
4. Bollinger Bands
5. Stochastic RSI
6. ADX
7. CCI
8. Williams %R
9. ATR
10. Price Action

Дополнительно анализируй:
- Тренд рынка
- Последние свечи
- Поддержку и сопротивление
- Свечные модели
- Силу покупателей и продавцов

Выбери один сигнал:
BUY, SELL или NO SIGNAL.

Не выдумывай отсутствующие данные.
Если индикаторы противоречат друг другу, выбирай NO SIGNAL.
Не обещай гарантированную прибыль.

Верни только JSON:

{
  "signal": "BUY",
  "confidence": 75,
  "trend": "UPTREND",
  "reason": "Объяснение анализа",
  "support": "Уровень поддержки",
  "resistance": "Уровень сопротивления",
  "risk": "MEDIUM"
}

confidence — оценка согласованности сигналов,
а не вероятность получения прибыли.
`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                instructions +
                "\n\nРЫНОЧНЫЕ ДАННЫЕ:\n" +
                JSON.stringify(marketData)
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    },
    {
      timeout: 30000,
      headers: {
        "x-goog-api-key": API_KEY,
        "Content-Type": "application/json"
      }
    }
  );

  const text =
    response.data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

  if (!text) {
    throw new Error("Gemini не вернул результат");
  }

  let result;

  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("Gemini вернул неправильный JSON");
  }

  const signals = ["BUY", "SELL", "NO SIGNAL"];

  if (!signals.includes(result.signal)) {
    throw new Error("Неизвестный торговый сигнал");
  }

  result.confidence = Math.max(
    0,
    Math.min(100, Number(result.confidence) || 0)
  );

  return result;
}

module.exports = {
  analyzeWithAI
};

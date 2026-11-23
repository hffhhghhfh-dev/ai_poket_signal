const axios = require("axios");
const settings = require("../config/settings");

const OPENAI_URL = "https://api.openai.com/v1/responses";

async function analyzeWithAI(marketData) {
  if (!settings.openai.apiKey) {
    throw new Error("OPENAI_API_KEY не настроен");
  }

  if (!marketData || !marketData.indicators) {
    throw new Error("Недостаточно данных для анализа");
  }

  const instructions = `
Ты — профессиональный аналитический ИИ для финансовых рынков.

Твоя задача:
1. Анализировать предоставленные рыночные данные.
2. Определять направление тренда.
3. Оценивать RSI, MACD, EMA, Bollinger Bands,
   Stochastic RSI, ADX, CCI и Williams %R.
4. Учитывать Price Action и свечные модели.
5. Определять потенциальное направление движения.

Правила:
- Не придумывай отсутствующие данные.
- Не обещай прибыль.
- Не выдавай вероятность за гарантированный результат.
- Если сигналы противоречат друг другу, выбирай NO SIGNAL.
- Не используй ATR как самостоятельный сигнал направления.
- Учитывай, что OTC-рынок может отличаться от обычного рынка.

Верни результат в JSON:
{
  "signal": "BUY или SELL или NO SIGNAL",
  "confidence": 0,
  "trend": "UPTREND или DOWNTREND или SIDEWAYS",
  "reason": "Объяснение анализа",
  "support": "Уровень поддержки или неизвестно",
  "resistance": "Уровень сопротивления или неизвестно",
  "risk": "LOW или MEDIUM или HIGH"
}

confidence — оценка силы совпадения сигналов от 0 до 100,
а не вероятность получения прибыли.
`;

  const response = await axios.post(
    OPENAI_URL,
    {
      model: settings.openai.model,
      instructions,
      input: JSON.stringify(marketData),
      max_output_tokens: 700
    },
    {
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${settings.openai.apiKey}`,
        "Content-Type": "application/json"
      }
    }
  );

  const output = response.data.output || [];

  const text = output
    .filter(item => item.type === "message")
    .flatMap(item => item.content || [])
    .filter(item => item.type === "output_text")
    .map(item => item.text)
    .join("\n");

  if (!text) {
    throw new Error("OpenAI не вернул текст анализа");
  }

  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let result;

  try {
    result = JSON.parse(cleaned);
  } catch {
    throw new Error("ИИ вернул некорректный JSON");
  }

  const allowedSignals = ["BUY", "SELL", "NO SIGNAL"];

  if (!allowedSignals.includes(result.signal)) {
    throw new Error("ИИ вернул неизвестный сигнал");
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

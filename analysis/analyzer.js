const { calculateIndicators } = require("../indicators/technical");
const { analyzePriceAction } = require("../indicators/priceaction");
const { analyzeWithAI } = require("../services/openai");

async function analyzeMarket(marketData) {
  if (!marketData || !Array.isArray(marketData.candles)) {
    throw new Error("Рыночные данные отсутствуют");
  }

  const candles = marketData.candles;

  if (candles.length < 200) {
    throw new Error("Для анализа необходимо минимум 200 свечей");
  }

  // 1. Технические индикаторы
  const indicators = calculateIndicators(candles);

  // 2. Price Action
  const priceAction = analyzePriceAction(candles);

  // 3. Подготовка данных для ИИ
  const aiInput = {
    pair: marketData.pair,
    marketType: marketData.marketType,
    timeframe: marketData.timeframe,
    source: marketData.source,

    currentPrice: candles.at(-1).close,

    indicators,
    priceAction,

    recentCandles: candles.slice(-20)
  };

  // 4. Анализ искусственным интеллектом
  const aiResult = await analyzeWithAI(aiInput);

  // 5. Итоговый результат
  return {
    success: true,

    pair: marketData.pair,
    marketType: marketData.marketType,
    timeframe: marketData.timeframe,

    signal: aiResult.signal,
    confidence: aiResult.confidence,

    trend: aiResult.trend,
    reason: aiResult.reason,

    support: aiResult.support,
    resistance: aiResult.resistance,

    risk: aiResult.risk,

    indicators,
    priceAction,

    analyzedAt: new Date().toISOString(),

    warning: "Аналитический прогноз не гарантирует результат сделки."
  };
}

module.exports = {
  analyzeMarket
};

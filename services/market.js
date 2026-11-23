const settings = require("../config/settings");
const otcharts = require("./otcharts");

function validateCandles(candles) {
  if (!Array.isArray(candles)) {
    throw new Error("Неверный формат свечей");
  }

  if (candles.length < settings.analysis.minCandles) {
    throw new Error(
      `Недостаточно свечей: ${candles.length}. Нужно минимум ${settings.analysis.minCandles}`
    );
  }

  for (const candle of candles) {
    const values = [
      candle.open,
      candle.high,
      candle.low,
      candle.close
    ];

    if (
      values.some(value => !Number.isFinite(value) || value <= 0) ||
      candle.high < candle.low ||
      candle.high < Math.max(candle.open, candle.close) ||
      candle.low > Math.min(candle.open, candle.close)
    ) {
      throw new Error("Обнаружена некорректная свеча");
    }
  }

  return true;
}

async function getMarketData({
  pair,
  marketType = "OTC",
  timeframe = "1m"
}) {
  if (!pair) {
    throw new Error("Выберите валютную пару");
  }

  const venue = marketType.toLowerCase();

  if (!["otc", "regular"].includes(venue)) {
    throw new Error("Неизвестный тип рынка");
  }

  const interval = settings.timeframes[timeframe];

  if (!interval) {
    throw new Error("Неподдерживаемый таймфрейм");
  }

  const result = await otcharts.getCandles({
    symbol: pair,
    timeframe: interval,
    limit: settings.analysis.candleLimit,
    venue
  });

  validateCandles(result.candles);

  return {
    pair,
    marketType,
    timeframe,
    source: "OTCharts",
    receivedAt: new Date().toISOString(),
    candleCount: result.candles.length,
    candles: result.candles
  };
}

module.exports = {
  getMarketData,
  validateCandles
};

function candleType(candle) {
  const body = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;

  if (range === 0) return "DOJI";

  const upperShadow =
    candle.high - Math.max(candle.open, candle.close);

  const lowerShadow =
    Math.min(candle.open, candle.close) - candle.low;

  if (body / range < 0.1) {
    return "DOJI";
  }

  if (lowerShadow > body * 2 && upperShadow < body) {
    return "BULLISH_PIN_BAR";
  }

  if (upperShadow > body * 2 && lowerShadow < body) {
    return "BEARISH_PIN_BAR";
  }

  return candle.close > candle.open
    ? "BULLISH"
    : "BEARISH";
}

function detectEngulfing(previous, current) {
  const previousBull = previous.close > previous.open;
  const currentBull = current.close > current.open;

  const bullish =
    !previousBull &&
    currentBull &&
    current.open <= previous.close &&
    current.close >= previous.open;

  const bearish =
    previousBull &&
    !currentBull &&
    current.open >= previous.close &&
    current.close <= previous.open;

  if (bullish) return "BULLISH_ENGULFING";
  if (bearish) return "BEARISH_ENGULFING";

  return null;
}

function findLevels(candles, period = 50) {
  const data = candles.slice(-period);

  if (!data.length) {
    return {
      support: null,
      resistance: null
    };
  }

  return {
    support: Math.min(...data.map(c => c.low)),
    resistance: Math.max(...data.map(c => c.high))
  };
}

function analyzePriceAction(candles) {
  if (!Array.isArray(candles) || candles.length < 3) {
    throw new Error("Недостаточно свечей для Price Action");
  }

  const current = candles.at(-1);
  const previous = candles.at(-2);

  const lastFive = candles.slice(-5);

  const bullishCount = lastFive.filter(
    c => c.close > c.open
  ).length;

  const bearishCount = lastFive.filter(
    c => c.close < c.open
  ).length;

  let trend = "SIDEWAYS";

  if (bullishCount >= 4) trend = "UPTREND";
  if (bearishCount >= 4) trend = "DOWNTREND";

  const pattern = detectEngulfing(previous, current);
  const type = candleType(current);

  const levels = findLevels(candles);

  let direction = "NEUTRAL";

  if (
    pattern === "BULLISH_ENGULFING" ||
    type === "BULLISH_PIN_BAR"
  ) {
    direction = "BULLISH";
  }

  if (
    pattern === "BEARISH_ENGULFING" ||
    type === "BEARISH_PIN_BAR"
  ) {
    direction = "BEARISH";
  }

  return {
    trend,
    currentCandle: type,
    pattern: pattern || "NONE",
    direction,
    bullishCandles: bullishCount,
    bearishCandles: bearishCount,
    support: levels.support,
    resistance: levels.resistance,
    currentPrice: current.close
  };
}

module.exports = {
  candleType,
  detectEngulfing,
  findLevels,
  analyzePriceAction
};

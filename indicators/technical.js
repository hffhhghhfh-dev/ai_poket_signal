function ema(values, period) {
  if (values.length < period) return [];

  const multiplier = 2 / (period + 1);
  const result = [];

  let previous = values
    .slice(0, period)
    .reduce((a, b) => a + b, 0) / period;

  result.push(previous);

  for (let i = period; i < values.length; i++) {
    previous =
      (values[i] - previous) * multiplier + previous;

    result.push(previous);
  }

  return result;
}

function sma(values, period) {
  if (values.length < period) return [];

  const result = [];

  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);

    result.push(
      slice.reduce((a, b) => a + b, 0) / period
    );
  }

  return result;
}

function rsi(values, period = 14) {
  if (values.length <= period) return [];

  const result = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];

    if (change > 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  result.push(
    avgLoss === 0
      ? 100
      : 100 - 100 / (1 + avgGain / avgLoss)
  );

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];

    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const value = avgLoss === 0
      ? 100
      : 100 - 100 / (1 + avgGain / avgLoss);

    result.push(value);
  }

  return result;
}

function macd(values) {
  const fast = ema(values, 12);
  const slow = ema(values, 26);

  if (!fast.length || !slow.length) {
    return {
      line: null,
      signal: null,
      histogram: null
    };
  }

  const offset = 26 - 12;
  const line = fast.slice(offset).map(
    (value, index) => value - slow[index]
  );

  const signal = ema(line, 9);

  if (!signal.length) {
    return {
      line: line.at(-1),
      signal: null,
      histogram: null
    };
  }

  const macdLine = line.at(-1);
  const signalLine = signal.at(-1);

  return {
    line: macdLine,
    signal: signalLine,
    histogram: macdLine - signalLine
  };
}

function bollinger(values, period = 20, multiplier = 2) {
  if (values.length < period) return null;

  const data = values.slice(-period);

  const middle = data.reduce((a, b) => a + b, 0) / period;

  const variance = data.reduce(
    (sum, value) => sum + Math.pow(value - middle, 2),
    0
  ) / period;

  const deviation = Math.sqrt(variance);

  return {
    upper: middle + multiplier * deviation,
    middle,
    lower: middle - multiplier * deviation
  };
}

function stochasticRsi(values, period = 14) {
  const rsiValues = rsi(values, period);

  if (rsiValues.length < period) return null;

  const data = rsiValues.slice(-period);

  const min = Math.min(...data);
  const max = Math.max(...data);
  const current = data.at(-1);

  if (max === min) return 50;

  return ((current - min) / (max - min)) * 100;
}

function cci(candles, period = 20) {
  if (candles.length < period) return null;

  const typical = candles.map(
    candle => (candle.high + candle.low + candle.close) / 3
  );

  const data = typical.slice(-period);

  const average = data.reduce((a, b) => a + b, 0) / period;

  const deviation = data.reduce(
    (sum, value) => sum + Math.abs(value - average),
    0
  ) / period;

  if (deviation === 0) return 0;

  return (typical.at(-1) - average) / (0.015 * deviation);
}

function williamsR(candles, period = 14) {
  if (candles.length < period) return null;

  const data = candles.slice(-period);

  const highest = Math.max(...data.map(c => c.high));
  const lowest = Math.min(...data.map(c => c.low));
  const close = data.at(-1).close;

  if (highest === lowest) return -50;

  return ((highest - close) / (highest - lowest)) * -100;
}

function atr(candles, period = 14) {
  if (candles.length < period + 1) return null;

  const ranges = [];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];

    ranges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close)
      )
    );
  }

  const data = ranges.slice(-period);

  return data.reduce((a, b) => a + b, 0) / period;
}

function adx(candles, period = 14) {
  if (candles.length < period * 2 + 1) return null;

  const trs = [];
  const plusDM = [];
  const minusDM = [];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];

    const upMove = current.high - previous.high;
    const downMove = previous.low - current.low;

    plusDM.push(
      upMove > downMove && upMove > 0 ? upMove : 0
    );

    minusDM.push(
      downMove > upMove && downMove > 0 ? downMove : 0
    );

    trs.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close)
      )
    );
  }

  let smoothedTR = trs.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedPlus = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedMinus = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  const dxValues = [];

  for (let i = period; i < trs.length; i++) {
    if (i > period) {
      smoothedTR = smoothedTR - smoothedTR / period + trs[i];
      smoothedPlus = smoothedPlus - smoothedPlus / period + plusDM[i];
      smoothedMinus = smoothedMinus - smoothedMinus / period + minusDM[i];
    }

    const plusDI = smoothedTR
      ? 100 * smoothedPlus / smoothedTR
      : 0;

    const minusDI = smoothedTR
      ? 100 * smoothedMinus / smoothedTR
      : 0;

    const denominator = plusDI + minusDI;

    dxValues.push(
      denominator ? 100 * Math.abs(plusDI - minusDI) / denominator : 0
    );
  }

  if (dxValues.length < period) return null;

  let value = dxValues.slice(0, period)
    .reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < dxValues.length; i++) {
    value = ((value * (period - 1)) + dxValues[i]) / period;
  }

  return value;
}

function calculateIndicators(candles) {
  const closes = candles.map(c => c.close);

  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);

  return {
    price: closes.at(-1),

    RSI: rsi(closes).at(-1) ?? null,

    MACD: macd(closes),

    EMA20: ema20.at(-1) ?? null,
    EMA50: ema50.at(-1) ?? null,
    EMA200: ema200.at(-1) ?? null,

    BollingerBands: bollinger(closes),

    StochasticRSI: stochasticRsi(closes),

    ADX: adx(candles),

    CCI: cci(candles),

    WilliamsR: williamsR(candles),

    ATR: atr(candles)
  };
}

module.exports = {
  ema,
  sma,
  rsi,
  macd,
  bollinger,
  stochasticRsi,
  cci,
  williamsR,
  atr,
  adx,
  calculateIndicators
};

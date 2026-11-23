const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const API_KEY = process.env.OTCHARTS_API_KEY;
const API_URL = "https://otcharts.com";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const TIMEFRAMES = [
    5, 15, 30, 60, 120, 180,
    300, 600, 900, 1800, 3600
];

async function otcRequest(endpoint) {
    if (!API_KEY) {
        throw new Error("OTCHARTS_API_KEY не настроен");
    }

    const response = await fetch(API_URL + endpoint, {
        headers: {
            Authorization: `Bearer ${API_KEY}`,
            "User-Agent": "PocketAIUltimate/1.0"
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error || `OTCharts HTTP ${response.status}`
        );
    }

    return data;
}

// SERVER STATUS
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        status: "online",
        service: "POCKET AI ULTIMATE PRO"
    });
});

// AVAILABLE OTC PAIRS ONLY
app.get("/api/symbols", async (req, res) => {
    try {
        const data = await otcRequest(
            "/v1/symbols?venue=otc"
        );

        const symbols = (data.symbols || [])
            .filter(pair =>
                pair.isOtc === true &&
                pair.open === true
            )
            .map(pair => ({
                symbol: pair.symbol,
                name: pair.name,
                payout: pair.payout
            }));

        res.json({
            success: true,
            venue: "otc",
            count: symbols.length,
            symbols
        });

    } catch (error) {
        res.status(502).json({
            success: false,
            error: error.message
        });
    }
});

// AVAILABLE TIMEFRAMES
app.get("/api/timeframes", (req, res) => {
    res.json({
        success: true,
        timeframes: TIMEFRAMES
    });
});

// GET CANDLES
app.get("/api/candles", async (req, res) => {
    try {
        const { symbol, tf = "60", limit = "100" } = req.query;

        if (!symbol) {
            return res.status(400).json({
                success: false,
                error: "Выберите OTC-пару"
            });
        }

        if (!TIMEFRAMES.includes(Number(tf))) {
            return res.status(400).json({
                success: false,
                error: "Неподдерживаемый таймфрейм"
            });
        }

        const symbolsData = await otcRequest(
            "/v1/symbols?venue=otc"
        );

        const allowed = (symbolsData.symbols || []).some(pair =>
            pair.symbol === symbol &&
            pair.isOtc === true &&
            pair.open === true
        );

        if (!allowed) {
            return res.status(400).json({
                success: false,
                error: "Пара закрыта или недоступна"
            });
        }

        const safeLimit = Math.min(
            Math.max(Number(limit) || 100, 30),
            500
        );

        const query = new URLSearchParams({
            venue: "otc",
            symbol,
            tf: String(tf),
            limit: String(safeLimit)
        });

        const data = await otcRequest(
            "/v1/candles?" + query.toString()
        );

        res.json({
            success: true,
            symbol,
            timeframe: Number(tf),
            candles: data.candles || [],
            count: data.count || 0,
            gaps: data.gaps || null
        });

    } catch (error) {
        res.status(502).json({
            success: false,
            error: error.message
        });
    }
});

// EMA
function ema(values, period) {
    const k = 2 / (period + 1);
    let result = values[0];

    for (let i = 1; i < values.length; i++) {
        result = values[i] * k + result * (1 - k);
    }

    return result;
}

// RSI
function calculateRSI(values, period = 14) {
    if (values.length <= period) return 50;

    let gains = 0;
    let losses = 0;

    for (
        let i = values.length - period;
        i < values.length;
        i++
    ) {
        const change = values[i] - values[i - 1];

        if (change > 0) gains += change;
        else losses -= change;
    }

    if (losses === 0) return 100;

    const rs = (gains / period) / (losses / period);

    return 100 - (100 / (1 + rs));
}

// MACD
function calculateMACD(values) {
    const fast = ema(values, 12);
    const slow = ema(values, 26);

    return fast - slow;
}

// MARKET ANALYSIS
function analyze(candles) {
    if (!Array.isArray(candles) || candles.length < 30) {
        throw new Error("Недостаточно свечей для анализа");
    }

    const closes = candles.map(c => Number(c.close));

    if (closes.some(v => !Number.isFinite(v))) {
        throw new Error("Некорректные данные свечей");
    }

    const ema9 = ema(closes.slice(-40), 9);
    const ema21 = ema(closes.slice(-60), 21);
    const rsi = calculateRSI(closes);
    const macd = calculateMACD(closes);

    const last = candles[candles.length - 1];
    const previous = candles[candles.length - 2];

    let buy = 0;
    let sell = 0;

    if (ema9 > ema21) buy++;
    if (ema9 < ema21) sell++;

    if (rsi > 50 && rsi < 70) buy++;
    if (rsi < 50 && rsi > 30) sell++;

    if (macd > 0) buy++;
    if (macd < 0) sell++;

    if (last.close > last.open) buy++;
    if (last.close < last.open) sell++;

    if (last.close > previous.close) buy++;
    if (last.close < previous.close) sell++;

    let direction = "NO SIGNAL";
    let confidence = 0;

    if (buy >= 4 && buy > sell) {
        direction = "BUY";
        confidence = buy * 20;
    } else if (sell >= 4 && sell > buy) {
        direction = "SELL";
        confidence = sell * 20;
    }

    return {
        direction,
        confidence,
        indicators: {
            ema9: Number(ema9.toFixed(6)),
            ema21: Number(ema21.toFixed(6)),
            rsi: Number(rsi.toFixed(2)),
            macd: Number(macd.toFixed(6))
        },
        price: last.close,
        candleTime: last.time,
        explanation:
            direction === "BUY"
                ? "Преобладают признаки восходящего движения"
                : direction === "SELL"
                ? "Преобладают признаки нисходящего движения"
                : "Нет достаточного подтверждения направления"
    };
}

// ANALYZE ENDPOINT
app.get("/api/analyze", async (req, res) => {
    try {
        const { symbol, tf = "60" } = req.query;

        if (!symbol) {
            return res.status(400).json({
                success: false,
                error: "Выберите OTC-пару"
            });
        }

        if (!TIMEFRAMES.includes(Number(tf))) {
            return res.status(400).json({
                success: false,
                error: "Неподдерживаемый таймфрейм"
            });
        }

        const symbolsData = await otcRequest(
            "/v1/symbols?venue=otc"
        );

        const isAvailable = (symbolsData.symbols || []).some(pair =>
            pair.symbol === symbol &&
            pair.isOtc === true &&
            pair.open === true
        );

        if (!isAvailable) {
            return res.status(400).json({
                success: false,
                error: "Эта OTC-пара сейчас недоступна"
            });
        }

        const params = new URLSearchParams({
            venue: "otc",
            symbol,
            tf: String(tf),
            limit: "100"
        });

        const data = await otcRequest(
            "/v1/candles?" + params.toString()
        );

        const result = analyze(data.candles);

        res.json({
            success: true,
            symbol,
            timeframe: Number(tf),
            venue: "Pocket Option OTC",
            ...result
        });

    } catch (error) {
        res.status(502).json({
            success: false,
            error: error.message
        });
    }
});

// START SERVER
app.listen(PORT, () => {
    console.log("POCKET AI ULTIMATE PRO ONLINE");
    console.log("PORT:", PORT);
});

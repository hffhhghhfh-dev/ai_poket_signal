const express = require("express");
const path = require("path");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

// ======================================
// CONFIGURATION
// ======================================

const OTCHARTS_URL = process.env.OTCHARTS_URL || "https://otcharts.com";

const TIMEFRAMES = {
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
};

const API_KEY = process.env.OTCHARTS_API_KEY;

const cache = new Map();

// ======================================
// HELPERS
// ======================================

function normalizeCandles(data) {
const rows = Array.isArray(data)
? data
: data.candles || data.data || [];

return rows.map(c => ({
    time: Number(c.time ?? c.timestamp),
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    volume: Number(c.volume || 0)
})).filter(c =>
    Number.isFinite(c.close) &&
    Number.isFinite(c.open) &&
    Number.isFinite(c.high) &&
    Number.isFinite(c.low)
);

}

function average(values) {
if (!values.length) return 0;
return values.reduce((a,b) => a+b,0)/values.length;
}

function ema(values, period) {
if (values.length < period) return null;

const k = 2/(period+1);
let result = average(values.slice(0,period));

for(let i=period;i<values.length;i++) {
    result = values[i]*k + result*(1-k);
}

return result;

}

function rsi(values, period=14) {
if(values.length <= period) return null;

let gains=0, losses=0;

for(let i=1;i<=period;i++) {
    const diff=values[i]-values[i-1];
    if(diff>0) gains+=diff;
    else losses-=diff;
}

let avgGain=gains/period;
let avgLoss=losses/period;

for(let i=period+1;i<values.length;i++) {
    const diff=values[i]-values[i-1];

    avgGain=(avgGain*(period-1)+Math.max(diff,0))/period;
    avgLoss=(avgLoss*(period-1)+Math.max(-diff,0))/period;
}

if(avgLoss===0) return 100;

return 100-(100/(1+avgGain/avgLoss));

}

function macd(values) {
if(values.length<35) return null;

const fast=ema(values,12);
const slow=ema(values,26);

return {
    macd:fast-slow,
    signal:fast>slow ? "BUY" :
           fast<slow ? "SELL" : "NEUTRAL"
};

}

function bollinger(values, period=20) {
if(values.length<period) return null;

const slice=values.slice(-period);
const middle=average(slice);

const variance=average(
    slice.map(v => Math.pow(v-middle,2))
);

const deviation=Math.sqrt(variance);

return {
    upper:middle+2*deviation,
    middle,
    lower:middle-2*deviation,
    price:values.at(-1)
};

}

function atr(candles, period=14) {
if(candles.length<=period) return null;

const trs=[];

for(let i=1;i<candles.length;i++) {
    const c=candles[i];
    const previous=candles[i-1].close;

    trs.push(Math.max(
        c.high-c.low,
        Math.abs(c.high-previous),
        Math.abs(c.low-previous)
    ));
}

return average(trs.slice(-period));

}

function stochasticRSI(values, period=14) {
if(values.length<period*2) return null;

const recent=[];

for(let i=values.length-period;i<values.length;i++) {
    recent.push(rsi(values.slice(0,i+1),period));
}

if(recent.some(v => v===null)) return null;

const min=Math.min(...recent);
const max=Math.max(...recent);

if(max===min) return 50;

return ((recent.at(-1)-min)/(max-min))*100;

}

function adx(candles, period=14) {
if(candles.length<=period+1) return null;

let plus=0, minus=0;

for(let i=candles.length-period;i<candles.length;i++) {
    const current=candles[i];
    const previous=candles[i-1];

    const up=current.high-previous.high;
    const down=previous.low-current.low;

    if(up>down && up>0) plus+=up;
    if(down>up && down>0) minus+=down;
}

const total=plus+minus;

if(total===0) return 0;

return Math.abs(plus-minus)/total*100;

}

function cci(candles, period=20) {
if(candles.length<period) return null;

const typical=candles.map(c =>
    (c.high+c.low+c.close)/3
);

const values=typical.slice(-period);
const mean=average(values);

const deviation=average(
    values.map(v=>Math.abs(v-mean))
);

if(deviation===0) return 0;

return (values.at(-1)-mean)/(0.015*deviation);

}

function williams(candles, period=14) {
if(candles.length<period) return null;

const recent=candles.slice(-period);
const highest=Math.max(...recent.map(c=>c.high));
const lowest=Math.min(...recent.map(c=>c.low));

if(highest===lowest) return -50;

return ((highest-recent.at(-1).close)/
    (highest-lowest))*-100;

}

// ======================================
// TECHNICAL ANALYSIS
// ======================================

function analyzeIndicators(candles) {
const closes=candles.map(c=>c.close);
const price=closes.at(-1);

const indicators={};

const r=rsi(closes);
const m=macd(closes);

const e9=ema(closes,9);
const e21=ema(closes,21);
const e50=ema(closes,50);
const e200=ema(closes,200);

const bb=bollinger(closes);
const stoch=stochasticRSI(closes);
const adxValue=adx(candles);
const cciValue=cci(candles);
const willr=williams(candles);
const atrValue=atr(candles);

function add(name,value,signal) {
    indicators[name]={
        value:value===null || value===undefined
            ? null
            : Number(value.toFixed(5)),
        signal
    };
}

add("RSI",r,
    r===null ? "NEUTRAL" :
    r<30 ? "BUY" :
    r>70 ? "SELL" : "NEUTRAL"
);

add("MACD",m?.macd ?? null,m?.signal ?? "NEUTRAL");

add("EMA",e9 && e21 ? e9-e21 : null,
    e9===null || e21===null ? "NEUTRAL" :
    e9>e21 ? "BUY" : e9<e21 ? "SELL" : "NEUTRAL"
);

add("EMA200",e50 && e200 ? e50-e200 : null,
    e50===null || e200===null ? "NEUTRAL" :
    e50>e200 ? "BUY" : e50<e200 ? "SELL" : "NEUTRAL"
);

add("BB",bb?.middle ?? null,
    !bb ? "NEUTRAL" :
    price<bb.lower ? "BUY" :
    price>bb.upper ? "SELL" : "NEUTRAL"
);

add("STOCH",stoch,
    stoch===null ? "NEUTRAL" :
    stoch<20 ? "BUY" :
    stoch>80 ? "SELL" : "NEUTRAL"
);

add("ADX",adxValue,
    adxValue===null ? "NEUTRAL" :
    adxValue<20 ? "NEUTRAL" :
    e9>e21 ? "BUY" : e9<e21 ? "SELL" : "NEUTRAL"
);

add("CCI",cciValue,
    cciValue===null ? "NEUTRAL" :
    cciValue<-100 ? "BUY" :
    cciValue>100 ? "SELL" : "NEUTRAL"
);

add("WILLR",willr,
    willr===null ? "NEUTRAL" :
    willr<-80 ? "BUY" :
    willr>-20 ? "SELL" : "NEUTRAL"
);

add("ATR",atrValue,"NEUTRAL");

return indicators;

}

// ======================================
// PRICE ACTION
// ======================================

function analyzePriceAction(candles) {
if(candles.length<3) return "NEUTRAL";

const current=candles.at(-1);
const previous=candles.at(-2);

const bullish =
    current.close>current.open &&
    current.close>previous.close;

const bearish =
    current.close<current.open &&
    current.close<previous.close;

if(bullish) return "BUY";
if(bearish) return "SELL";

return "NEUTRAL";

}

// ======================================
// OTC DATA PROVIDER
// ======================================

async function getCandles(pair,timeframe) {
if(!API_KEY) {
throw new Error("OTCHARTS_API_KEY не настроен на сервере");
}

const seconds=TIMEFRAMES[timeframe];

if(!seconds) {
    throw new Error("Неподдерживаемый таймфрейм");
}

/*
  ВАЖНО:
  Здесь нужно использовать точный endpoint,
  параметры и формат ответа из документации
  твоего тарифа OTCharts.
*/

const response=await axios.get(
    OTCHARTS_URL+"/v1/candles",
    {
        params:{
            symbol:pair,
            interval:seconds,
            limit:250
        },
        headers:{
            Authorization:`Bearer ${API_KEY}`
        },
        timeout:15000
    }
);

return normalizeCandles(response.data);

}

// ======================================
// FINAL ANALYSIS
// ======================================

function generateSignal(candles,pair,timeframe) {
if(candles.length<200) {
throw new Error(
"Недостаточно свечей. Требуется минимум 200."
);
}

const indicators=analyzeIndicators(candles);

const priceAction=analyzePriceAction(candles);

let buy=0;
let sell=0;

for(const item of Object.values(indicators)) {
    if(item.signal==="BUY") buy++;
    if(item.signal==="SELL") sell++;
}

if(priceAction==="BUY") buy++;
if(priceAction==="SELL") sell++;

const total=buy+sell;

const confidence=total
    ? Math.round(Math.max(buy,sell)/total*100)
    : 0;

let signal="NO SIGNAL";

if(buy>=5 && buy-sell>=3) signal="BUY";
if(sell>=5 && sell-buy>=3) signal="SELL";

const last=candles.at(-1);

return {
    success:true,
    pair,
    timeframe,
    signal,
    confidence,
    price:last.close,
    trend:buy>sell ? "BULLISH" :
          sell>buy ? "BEARISH" : "SIDEWAYS",
    buyCount:buy,
    sellCount:sell,
    indicators,
    priceAction,
    signalReason:signal==="NO SIGNAL"
        ? "Недостаточно согласованных подтверждений."
        : `Подтверждено направленных сигналов: ${Math.max(buy,sell)}.`,
    explanation:
        `BUY: ${buy}. SELL: ${sell}. `+
        `Price Action: ${priceAction}. `+
        `Итог: ${signal}.`,
    timestamp:new Date().toISOString()
};

}

// ======================================
// API ROUTES
// ======================================

app.get("/api/health",(req,res)=>{
res.json({
success:true,
status:"online",
provider:API_KEY ? "configured" : "missing",
time:new Date().toISOString()
});
});

app.get("/api/symbols",(req,res)=>{
const marketType=req.query.marketType || "OTC";

const otc=[
    "EUR/USD OTC",
    "GBP/USD OTC",
    "USD/JPY OTC",
    "AUD/USD OTC",
    "EUR/JPY OTC",
    "GBP/JPY OTC",
    "USD/CAD OTC",
    "USD/CHF OTC",
    "EUR/GBP OTC"
];

res.json({
    symbols:otc,
    marketType,
    note:"Это список интерфейса, а не подтверждение доступности пар у провайдера."
});

});

app.post("/api/analyze",async(req,res)=>{
try {
const {pair,timeframe,marketType}=req.body;

    if(!pair || !timeframe) {
        return res.status(400).json({
            error:"Выбери валютную пару и таймфрейм."
        });
    }

    if(!TIMEFRAMES[timeframe]) {
        return res.status(400).json({
            error:"Неверный таймфрейм."
        });
    }

    if(marketType==="OTC" && !pair.includes("OTC")) {
        return res.status(400).json({
            error:"Выбранная пара не отмечена как OTC."
        });
    }

    const candles=await getCandles(pair,timeframe);

    if(candles.length<200) {
        return res.status(422).json({
            error:`Получено ${candles.length} свечей. Нужно минимум 200.`
        });
    }

    const result=generateSignal(
        candles,
        pair,
        timeframe
    );

    res.json(result);

} catch(error) {
    console.error("ANALYSIS ERROR:",error.message);

    res.status(500).json({
        error:error.message || "Ошибка анализа рынка"
    });
}

});

// ======================================
// START SERVER
// ======================================

app.get("/",(req,res)=>{
res.sendFile(path.join(__dirname,"index.html"));
});

app.listen(PORT,()=>{
console.log(
"POCKET AI ULTIMATE PRO running on port ${PORT}"
);
});

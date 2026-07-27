// Real, rule-based signal engine. Every number here comes from actual price
// data and standard technical-indicator math (technicalindicators npm
// package) — there is no hardcoded win rate, no fabricated confidence score,
// and no signal is returned if the underlying data can't be fetched. This is
// a simple, transparent rules model, not a backtested or audited strategy —
// treat its output as a technical-analysis summary, not financial advice.
const { RSI, EMA, MACD, ATR } = require('technicalindicators');

const TWELVE_DATA_KEY = process.env.TWELVE_DATA_API_KEY;
const INTERVAL = '15min';
const CANDLES_NEEDED = 210; // enough for a trailing EMA200 reading

async function fetchCandles(tdSymbol) {
  if (!TWELVE_DATA_KEY) {
    throw new Error('TWELVE_DATA_API_KEY is not set — sign up free at twelvedata.com and add it to server/.env');
  }
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSymbol)}&interval=${INTERVAL}&outputsize=${CANDLES_NEEDED}&apikey=${TWELVE_DATA_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Twelve Data time_series request failed (${res.status})`);
  const data = await res.json();
  if (data.status === 'error' || !Array.isArray(data.values)) {
    throw new Error(`Twelve Data error: ${data.message || 'no candle data returned'}`);
  }
  // API returns newest-first; indicator math needs oldest-first.
  return data.values
    .map((v) => ({
      time: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
    }))
    .reverse();
}

function last(arr) {
  return arr.length ? arr[arr.length - 1] : null;
}

// Each check contributes at most one point to bullish or bearish (or neither,
// if the reading is neutral). Confidence is simply how many of the applicable
// checks agree, out of how many fired an opinion at all.
function scoreDirection({ price, ema20, ema50, ema200, rsi, macd }) {
  const votes = [];

  if (ema20 != null && ema50 != null && ema200 != null) {
    if (ema20 > ema50 && ema50 > ema200) {
      votes.push({ bias: 'bullish', reason: `EMA20 (${ema20.toFixed(2)}) is above EMA50 (${ema50.toFixed(2)}) and EMA200 (${ema200.toFixed(2)}) — bullish trend alignment.` });
    } else if (ema20 < ema50 && ema50 < ema200) {
      votes.push({ bias: 'bearish', reason: `EMA20 (${ema20.toFixed(2)}) is below EMA50 (${ema50.toFixed(2)}) and EMA200 (${ema200.toFixed(2)}) — bearish trend alignment.` });
    } else {
      votes.push({ bias: 'neutral', reason: `EMAs are mixed (EMA20 ${ema20.toFixed(2)}, EMA50 ${ema50.toFixed(2)}, EMA200 ${ema200.toFixed(2)}) — no clear trend alignment.` });
    }
  }

  if (ema20 != null) {
    if (price > ema20) votes.push({ bias: 'bullish', reason: `Price (${price.toFixed(2)}) is trading above EMA20 (${ema20.toFixed(2)}).` });
    else votes.push({ bias: 'bearish', reason: `Price (${price.toFixed(2)}) is trading below EMA20 (${ema20.toFixed(2)}).` });
  }

  if (rsi != null) {
    if (rsi >= 55) votes.push({ bias: 'bullish', reason: `RSI(14) is ${rsi.toFixed(1)} — bullish momentum.` });
    else if (rsi <= 45) votes.push({ bias: 'bearish', reason: `RSI(14) is ${rsi.toFixed(1)} — bearish momentum.` });
    else votes.push({ bias: 'neutral', reason: `RSI(14) is ${rsi.toFixed(1)} — no directional momentum.` });
  }

  if (macd && macd.MACD != null && macd.signal != null) {
    if (macd.MACD > macd.signal) votes.push({ bias: 'bullish', reason: `MACD line (${macd.MACD.toFixed(3)}) is above its signal line (${macd.signal.toFixed(3)}).` });
    else votes.push({ bias: 'bearish', reason: `MACD line (${macd.MACD.toFixed(3)}) is below its signal line (${macd.signal.toFixed(3)}).` });
  }

  const bullish = votes.filter((v) => v.bias === 'bullish').length;
  const bearish = votes.filter((v) => v.bias === 'bearish').length;
  const applicable = votes.length;

  let direction = 'NEUTRAL';
  let confidence = 0;
  if (bullish > bearish) {
    direction = 'BUY';
    confidence = Math.round((bullish / applicable) * 100);
  } else if (bearish > bullish) {
    direction = 'SELL';
    confidence = Math.round((bearish / applicable) * 100);
  } else {
    confidence = Math.round((Math.max(bullish, bearish) / applicable) * 100);
  }

  return { direction, confidence, votes: votes.map((v) => v.reason) };
}

// Pure function: turns a chronological candle array into a signal. No I/O,
// so it's independently testable and reusable across symbols.
function computeSignalFromCandles(candles) {
  if (candles.length < 30) {
    throw new Error(`Not enough candle history returned (${candles.length}) to compute indicators`);
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const price = last(closes);
  const ema20 = last(EMA.calculate({ period: 20, values: closes }));
  const ema50 = last(EMA.calculate({ period: 50, values: closes }));
  const ema200Series = EMA.calculate({ period: 200, values: closes });
  const ema200 = ema200Series.length ? last(ema200Series) : null;
  const rsi = last(RSI.calculate({ period: 14, values: closes }));
  const macd = last(MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  }));
  const atr = last(ATR.calculate({ period: 14, high: highs, low: lows, close: closes }));

  const { direction, confidence, votes } = scoreDirection({ price, ema20, ema50, ema200, rsi, macd });

  let trade = null;
  if (direction !== 'NEUTRAL' && atr) {
    const sign = direction === 'BUY' ? 1 : -1;
    const entryLow = price - sign * atr * 0.15;
    const entryHigh = price + sign * atr * 0.15;
    const stopLoss = price - sign * atr * 1.2;
    const tp1 = price + sign * atr * 1.0;
    const tp2 = price + sign * atr * 2.0;
    const tp3 = price + sign * atr * 3.0;
    trade = {
      entryZone: [Math.min(entryLow, entryHigh), Math.max(entryLow, entryHigh)].map((v) => +v.toFixed(2)),
      stopLoss: +stopLoss.toFixed(2),
      takeProfit1: +tp1.toFixed(2),
      takeProfit2: +tp2.toFixed(2),
      takeProfit3: +tp3.toFixed(2),
      riskRewardToTp2: +(2.0 / 1.2).toFixed(2),
    };
  }

  return {
    timeframe: INTERVAL,
    generatedAt: new Date().toISOString(),
    price: +price.toFixed(2),
    direction,
    confidence,
    indicators: {
      ema20: ema20 != null ? +ema20.toFixed(2) : null,
      ema50: ema50 != null ? +ema50.toFixed(2) : null,
      ema200: ema200 != null ? +ema200.toFixed(2) : null,
      rsi14: rsi != null ? +rsi.toFixed(1) : null,
      macd: macd ? { line: +macd.MACD.toFixed(4), signal: +macd.signal.toFixed(4), histogram: +macd.histogram.toFixed(4) } : null,
      atr14: atr != null ? +atr.toFixed(2) : null,
    },
    trade,
    explanation: votes,
    disclaimer: 'Rule-based technical read from live price data — not a backtested strategy, not financial advice.',
  };
}

async function generateSignal(tdSymbol) {
  const candles = await fetchCandles(tdSymbol);
  return computeSignalFromCandles(candles);
}

module.exports = { generateSignal, computeSignalFromCandles, fetchCandles };

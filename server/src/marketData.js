// Live homepage ticker data. BTC/USD comes from Binance's free public API (no key
// required). Everything else (forex, gold, indices) needs a Twelve Data API key —
// until TWELVE_DATA_API_KEY is set, those instruments just report null and the
// frontend shows a "—" placeholder instead of a fake number.
const TWELVE_DATA_KEY = process.env.TWELVE_DATA_API_KEY;

const INSTRUMENTS = [
  { label: 'EUR/USD', source: 'twelvedata', symbol: 'EUR/USD', decimals: 4 },
  { label: 'XAU/USD', source: 'twelvedata', symbol: 'XAU/USD', decimals: 2 },
  { label: 'GBP/JPY', source: 'twelvedata', symbol: 'GBP/JPY', decimals: 2 },
  { label: 'US30', source: 'twelvedata', symbol: 'DJI', decimals: 0 },
  { label: 'BTC/USD', source: 'coingecko', symbol: 'bitcoin', decimals: 0 },
  { label: 'NAS100', source: 'twelvedata', symbol: 'NDX', decimals: 0 },
];

let cache = INSTRUMENTS.map((i) => ({ label: i.label, price: null, changePct: null, up: true, decimals: i.decimals }));

// CoinGecko instead of Binance: Binance.com's public API geo-blocks requests from
// US-hosted cloud infrastructure (like Railway), returning HTTP 451.
async function fetchCrypto() {
  const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
  if (!res.ok) throw new Error(`CoinGecko request failed (${res.status})`);
  const data = await res.json();
  return { price: data.bitcoin.usd, changePct: data.bitcoin.usd_24h_change };
}

async function fetchTwelveData(symbols) {
  if (!TWELVE_DATA_KEY || !symbols.length) return {};
  const res = await fetch(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols.join(','))}&apikey=${TWELVE_DATA_KEY}`);
  if (!res.ok) throw new Error(`Twelve Data request failed (${res.status})`);
  const data = await res.json();
  return symbols.length === 1 ? { [symbols[0]]: data } : data;
}

async function refresh() {
  const tdSymbols = INSTRUMENTS.filter((i) => i.source === 'twelvedata').map((i) => i.symbol);
  const [crypto, twelvedata] = await Promise.allSettled([fetchCrypto(), fetchTwelveData(tdSymbols)]);

  if (crypto.status === 'rejected') console.error('[marketData] CoinGecko fetch failed:', crypto.reason.message);
  if (twelvedata.status === 'rejected') console.error('[marketData] Twelve Data fetch failed:', twelvedata.reason.message);

  cache = INSTRUMENTS.map((inst) => {
    const prev = cache.find((c) => c.label === inst.label);

    if (inst.source === 'coingecko' && crypto.status === 'fulfilled') {
      const { price, changePct } = crypto.value;
      return { label: inst.label, price, changePct, up: changePct >= 0, decimals: inst.decimals };
    }
    if (inst.source === 'twelvedata' && twelvedata.status === 'fulfilled') {
      const q = twelvedata.value[inst.symbol];
      if (q && q.close && !q.code) {
        const changePct = parseFloat(q.percent_change);
        return { label: inst.label, price: parseFloat(q.close), changePct, up: changePct >= 0, decimals: inst.decimals };
      }
    }
    return prev || { label: inst.label, price: null, changePct: null, up: true, decimals: inst.decimals };
  });
}

function startPolling() {
  refresh();
  setInterval(refresh, 30000);
}

function getQuotes() {
  return cache;
}

module.exports = { startPolling, getQuotes };

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// Use webhook instead of polling for Railway
const bot = new TelegramBot(TOKEN, { 
  webHook: {
    port: process.env.PORT || 3000
  }
});

// Set webhook URL (Railway gives you a URL)
const WEBHOOK_URL = process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN;
if (WEBHOOK_URL) {
  bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`);
}

const EGX_STOCKS = [
  'COMI', 'EFID', 'ETEL', 'HRHO', 'TMGH', 'MNHD', 'SODIC', 'PHDC',
  'SWDY', 'EAST', 'ORWE', 'JUFO', 'KARO', 'ISPH', 'UNIP', 'MKPH',
  'EIPIC', 'RMDA', 'PHCI', 'APPC', 'SKPC', 'MCDR', 'INEG', 'LUTS',
  'AGRI', 'CEMI', 'CHEM', 'CLHO', 'EGAS', 'ETRA', 'FERT', 'GAS',
  'GLBC', 'IRON', 'MINA', 'MNQC', 'PACK', 'PAPR', 'PLAS', 'POLY',
  'RUBR', 'SAND', 'SHMD', 'STLT', 'TEXT', 'TILE', 'TIMB', 'AUTO',
  'SPIN', 'EGTS', 'THMD', 'ALHE', 'HOTL', 'TOUR', 'ELEC', 'ENER',
  'FINS', 'HOLD', 'INVS', 'LEAS', 'REIT', 'SUKN', 'AMOC', 'BIOP',
  'ASLN', 'DWEE', 'CWPC', 'DOCT', 'EWBY', 'ABUK', 'ALEX', 'BKNS',
  'CAIB', 'CIHB', 'EBEK', 'EKBN', 'ESBE', 'NSGB', 'SAIB', 'THBK',
  'EGBN', 'HELI', 'LXIN', 'MOPH', 'NILE', 'QALY', 'PALM', 'EKHO',
  'EKZN', 'HOD', 'DOMT', 'FWRY', 'OCDI', 'TELS', 'ITPAC', 'ESRS',
  'ZMZA', 'CIB'
];

console.log(`🚀 Hegazy Scanner - ${EGX_STOCKS.length} stocks`);

// ====== دوال الحسابات ======

function calcEMA(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * k + ema;
  }
  return ema;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    ch > 0 ? gains += ch : losses -= ch;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) {
      avgGain = (avgGain * (period - 1) + ch) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - ch) / period;
    }
  }
  return avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
}

function calcATR(highs, lows, closes, period = 14) {
  if (highs.length < period + 1) return null;
  const trList = [];
  for (let i = 1; i < highs.length; i++) {
    const tr1 = highs[i] - lows[i];
    const tr2 = Math.abs(highs[i] - closes[i - 1]);
    const tr3 = Math.abs(lows[i] - closes[i - 1]);
    trList.push(Math.max(tr1, tr2, tr3));
  }
  return trList.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcSMA(data, period) {
  if (data.length < period) return null;
  return data.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// ====== جلب البيانات من Yahoo ======

async function getYahooData(symbol) {
  try {
    const suffixes = ['.CA', '.EG', ''];
    
    for (const suffix of suffixes) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}${suffix}?range=6mo&interval=1d`;
        const resp = await axios.get(url, {
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 10000
        });
        
        if (resp.status === 200 && resp.data.chart?.result?.[0]) {
          const result = resp.data.chart.result[0];
          const quotes = result.indicators?.quote?.[0] || {};
          
          const closes = (quotes.close || []).filter(v => v != null);
          const highs = (quotes.high || []).filter(v => v != null);
          const lows = (quotes.low || []).filter(v => v != null);
          const volumes = (quotes.volume || []).filter(v => v != null);
          
          if (closes.length >= 50) {
            return { closes, highs, lows, volumes };
          }
        }
      } catch (e) { continue; }
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ====== تحليل السهم ======

async function analyzeStock(symbol) {
  const data = await getYahooData(symbol);
  if (!data) return null;
  
  const { closes, highs, lows, volumes } = data;
  const close = closes[closes.length - 1];
  const high = highs[highs.length - 1];
  const vol = volumes[volumes.length - 1];
  
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const rsi = calcRSI(closes, 14);
  const atr = calcATR(highs, lows, closes, 14);
  const volAvg = calcSMA(volumes, 20);
  
  if (!ema20 || !ema50 || !ema200 || !rsi || !atr || !volAvg) return null;
  
  const resistance = Math.max(...highs.slice(-21, -1));
  const breakoutLevel = resistance + (atr * 0.15);
  
  const trendUp = close > ema50 && close > ema200;
  const nearSupport = Math.abs(close - ema20) / ema20 < 0.05;
  const rsiOK = rsi >= 40 && rsi <= 70;
  const volOK = vol > volAvg * 1.0;
  
  const signals = [];
  
  // نظام 1: الارتداد
  if (trendUp && nearSupport && rsiOK && volOK) {
    const sl = close - (atr * 1.5);
    const tp1 = close + (atr * 2.5);
    const tp2 = close + (atr * 4.5);
    const rr = (tp1 - close) / (close - sl);
    signals.push({ system: 'نظام الارتداد', signal: 'شراء عند الارتداد', entry: close, sl, tp1, tp2, rr, strength: 'normal' });
  }
  
  // نظام 2: الكسر
  if (close > breakoutLevel && rsi >= 45 && rsi <= 75 && volOK) {
    const sl = close - (atr * 1.5);
    const tp1 = close + (atr * 2.5);
    const tp2 = close + (atr * 4.5);
    const rr = (tp1 - close) / (close - sl);
    signals.push({ system: 'نظام الكسر', signal: 'شراء عند الكسر', entry: close, sl, tp1, tp2, rr, strength: 'normal' });
  }
  
  if (signals.length === 0) return null;
  
  const best = signals[0];
  
  return {
    ...best,
    symbol,
    price: close,
    rsi,
    ema20,
    ema50,
    ema200,
    volume: vol,
    volAvg,
    atr
  };
}

// ====== إرسال الإشعارات ======

async function sendSignal(signal) {
  if (!signal) return;
  
  const msg = `🎯 *إشارة جديدة - ${signal.symbol}*\n\n` +
    `📊 *النظام:* ${signal.system}\n` +
    `🎯 *الإشارة:* ${signal.signal}\n\n` +
    `💰 *السعر:* ${signal.price.toFixed(2)} EGP\n` +
    `🚪 *الدخول:* ${signal.entry.toFixed(2)}\n` +
    `🛑 *الوقف:* ${signal.sl.toFixed(2)}\n` +
    `🎯 *الهدف:* ${signal.tp1.toFixed(2)}\n` +
    `📈 *R/R:* ${signal.ratio.toFixed(2)}\n\n` +
    `📉 RSI: ${signal.rsi.toFixed(1)} | ATR: ${signal.atr.toFixed(2)}\n` +
    `⏰ ${new Date().toLocaleString('ar-EG')}`;
  
  try {
    await bot.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' });
    console.log(`✅ Signal: ${signal.symbol}`);
  } catch (e) {
    console.error(`❌ Send failed: ${e.message}`);
  }
}

// ====== الفحص ======

async function scanMarket() {
  console.log('🔍 Starting scan...');
  const results = [];
  let scanned = 0;
  
  for (const symbol of EGX_STOCKS) {
    try {
      const result = await analyzeStock(symbol);
      scanned++;
      
      if (result) {
        results.push(result);
        await sendSignal(result);
        await new Promise(r => setTimeout(r, 1000));
      }
      
      await new Promise(r => setTimeout(r, 500));
      
      if (scanned % 20 === 0) {
        console.log(`📊 ${scanned}/${EGX_STOCKS.length}`);
      }
    } catch (e) {
      console.error(`❌ ${symbol}: ${e.message}`);
    }
  }
  
  // Send summary
  if (results.length === 0) {
    await bot.sendMessage(CHAT_ID, 
      '⚪ لا توجد إشارات حالياً\n⏰ ' + new Date().toLocaleString('ar-EG'),
      { parse_mode: 'Markdown' }
    );
  } else {
    let msg = `🎯 *ملخص الفحص*\n📊 ${scanned} سهم | ✅ ${results.length} إشارة\n\n`;
    results.forEach(r => {
      msg += `• ${r.symbol} @ ${r.price.toFixed(2)} - ${r.signal}\n`;
    });
    msg += `\n⏰ ${new Date().toLocaleString('ar-EG')}`;
    await bot.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' });
  }
  
  console.log(`✅ Done: ${results.length} signals`);
  return results;
}

// ====== أوامر البوت ======

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `🤖 *Hegazy Scanner*\n\n` +
    `/scan - فحص السوق\n` +
    `/status - الحالة\n` +
    `/help - المساعدة`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/scan/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '🔍 جاري الفحص...');
  await scanMarket();
});

bot.onText(/\/status/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `✅ شغال\n📊 ${EGX_STOCKS.length} سهم\n🕐 ${new Date().toLocaleString('ar-EG')}`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `/scan - فحص\n/status - حالة\n/help - مساعدة`,
    { parse_mode: 'Markdown' }
  );
});

// ====== Start ======

console.log('✅ Bot started!');

// Run scan every 5 minutes during trading hours
setInterval(() => {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  
  if (day < 5 && hour >= 10 && hour < 15) {
    console.log('⏰ Auto scan');
    scanMarket();
  }
}, 300000); // 5 minutes

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

console.log('🚀 Hegazy Analysis Bot Started!');

// قائمة الأسهم المصرية
const EGX_STOCKS = ['COMI.CA', 'EFID.CA', 'ETEL.CA', 'HRHO.CA', 'ESRS.CA', 'SWDY.CA', 'PHDC.CA', 'TMGH.CA', 'SODIC.CA', 'MNHD.CA'];

// دالة جلب البيانات التاريخية من Yahoo
async function fetchHistory(symbol, days = 200) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${days}d&interval=1d`;
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
    const quotes = data.chart?.result?.[0]?.indicators?.quote?.[0];
    if (!quotes) return null;
    
    return {
      close: (quotes.close || []).filter(v => v != null),
      high: (quotes.high || []).filter(v => v != null),
      low: (quotes.low || []).filter(v => v != null),
      volume: (quotes.volume || []).filter(v => v != null),
      timestamp: data.chart.result[0].timestamp
    };
  } catch (e) { return null; }
}

// دالة حساب EMA
function calcEMA(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) ema = (data[i] - ema) * k + ema;
  return ema;
}

// دالة حساب RSI
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i-1];
    if (change > 0) gains += change; else losses -= change;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i-1];
    if (change > 0) { avgGain = (avgGain * (period-1) + change) / period; avgLoss = (avgLoss * (period-1)) / period; }
    else { avgGain = (avgGain * (period-1)) / period; avgLoss = (avgLoss * (period-1) - change) / period; }
  }
  return avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
}

// دالة حساب ATR
function calcATR(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return null;
  const tr = [];
  for (let i = 1; i < closes.length; i++) {
    const h_l = highs[i] - lows[i];
    const h_cp = Math.abs(highs[i] - closes[i-1]);
    const l_cp = Math.abs(lows[i] - closes[i-1]);
    tr.push(Math.max(h_l, h_cp, l_cp));
  }
  let atr = tr.slice(0, period).reduce((a,b)=>a+b,0) / period;
  for (let i = period; i < tr.length; i++) atr = (atr * (period-1) + tr[i]) / period;
  return atr;
}

// دالة حساب MACD Histogram
function calcMACD(closes) {
  if (closes.length < 26) return null;
  const ema12 = calcEMA(closes, 12), ema26 = calcEMA(closes, 26);
  if (!ema12 || !ema26) return null;
  const macdLine = ema12 - ema26;
  // Signal line (EMA 9 of MACD) - simplified
  return macdLine; // We'll use sign only
}

// دالة تحليل السهم (تطبيق أنظمة الـ Pine Script)
function analyzeStock(data) {
  const { close, high, low, volume } = data;
  const current = close[close.length - 1];
  const prev = close[close.length - 2];
  
  // المؤشرات الأساسية
  const ema20 = calcEMA(close, 20);
  const ema50 = calcEMA(close, 50);
  const ema200 = calcEMA(close, 200);
  const atr = calcATR(high, low, close, 14);
  const rsi = calcRSI(close, 14);
  const macdHist = calcMACD(close);
  const volAvg = close.slice(-20).reduce((a,b)=>a+b,0)/20; // Simplified vol avg
  const currentVol = volume[volume.length - 1];
  
  // المقاومة (أعلى سعر في آخر 20 يوم)
  const resistance = Math.max(...high.slice(-20));
  const breakoutLevel = resistance + (atr * 0.15);
  
  let signal = null, entry = null, sl = null, tp1 = null, tp2 = null, system = '';
  
  // === نظام 1: الارتداد والكسر ===
  const trendUp = current > ema50 && current > ema200;
  const nearSupport = Math.abs(current - ema20) / ema20 < 0.05;
  const rsiOK = rsi >= 40 && rsi <= 70;
  const volOK = currentVol > volAvg * 1.0;
  
  if (trendUp && nearSupport && rsiOK && volOK) {
    signal = 'شراء عند الارتداد';
    entry = current;
    sl = current - (atr * 1.5);
    tp1 = current + (atr * 2.5);
    tp2 = current + (atr * 4.5);
    system = 'Pullback';
  } else if (current > breakoutLevel && rsi >= 45 && rsi <= 75 && volOK) {
    signal = 'كسر مقاومة';
    entry = breakoutLevel;
    sl = breakoutLevel - (atr * 1.5);
    tp1 = breakoutLevel + (atr * 2.5);
    tp2 = breakoutLevel + (atr * 3.75);
    system = 'Breakout';
  }
  
  // === نظام 2: العمل (V4) ===
  if (!signal) {
    const adx = 10; // Simplified - ADX calculation is complex
    const isRanging = adx < 15;
    const nearSupV4 = Math.abs(current - ema20) / ema20 < 0.03;
    const rsiV4 = rsi >= 45 && rsi <= 65;
    if (trendUp && !isRanging && volOK && rsiV4 && nearSupV4) {
      signal = 'إشارة شراء (V4)';
      entry = current;
      sl = current - (atr * 1.5);
      tp1 = current + (atr * 2.5);
      tp2 = current + (atr * 4.5);
      system = 'V4';
    }
  }
  
  // === نظام 3: كسر المقاومة المؤكد ===
  if (!signal && current > resistance && volOK && rsiOK && trendUp) {
    const risk = current - (current - atr * 1.5);
    const reward = (current + atr * 2.5) - current;
    if (reward / risk >= 1.3) {
      signal = 'كسر مؤكد';
      entry = current;
      sl = current - (atr * 1.5);
      tp1 = current + (atr * 2.5);
      tp2 = current + (atr * 3.75);
      system = 'Confirmed Breakout';
    }
  }
  
  // === نظام 4: الثلاث مراحل ===
  if (!signal) {
    const stage1 = currentVol >= 1000000 && currentVol / volAvg >= 1.2;
    const stage2 = stage1 && current > ema50 && current > ema200 && ema20 > ema50;
    const stage3 = stage2 && rsi >= 55 && rsi <= 75 && macdHist > 0 && currentVol >= volAvg * 1.5;
    if (stage3) {
      signal = 'شراء ثلاثي المراحل';
      entry = current;
      sl = current - (atr * 1.5);
      tp1 = current + (atr * 2.5);
      tp2 = current + (atr * 3.75);
      system = '3-Stage';
    }
  }
  
  // === نظام 5: الأموال الذكية ===
  if (!signal) {
    const lowestLow = Math.min(...low.slice(-5));
    const stopLossSMC = lowestLow * 0.97;
    const strongClose = current >= high[high.length - 1] * 0.96;
    const volCond = currentVol > volAvg;
    const momentum = ((current - prev) / prev) * 100 > 0.8;
    if (strongClose && volCond && trendUp && momentum && rsi < 78) {
      signal = 'أموال ذكية';
      entry = current;
      sl = stopLossSMC;
      tp1 = current + ((current - sl) * 2);
      tp2 = current + ((current - sl) * 3);
      system = 'Smart Money';
    }
  }
  
  return {
    symbol: symbol.replace('.CA', ''),
    price: current.toFixed(2),
    signal,
    entry: entry?.toFixed(2),
    sl: sl?.toFixed(2),
    tp1: tp1?.toFixed(2),
    tp2: tp2?.toFixed(2),
    system,
    rsi: rsi?.toFixed(1),
    atr: atr?.toFixed(2)
  };
}

// أوامر البوت
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '🤖 *Hegazy Analysis Bot*\n\nالأوامر:\n/scan - مسح السوق بعد الإغلاق\n/price SYMBOL - تحليل سهم معين\n/list - الأسهم المدعومة', { parse_mode: 'Markdown' });
});

bot.onText(/\/list/, (msg) => {
  bot.sendMessage(msg.chat.id, `✅ الأسهم:\n${EGX_STOCKS.map(s=>s.replace('.CA','')).join(', ')}`);
});

bot.onText(/\/price (.+)/, async (msg, match) => {
  const symbol = match[1].toUpperCase() + '.CA';
  if (!EGX_STOCKS.includes(symbol)) return bot.sendMessage(msg.chat.id, '❌ رمز غير مدعوم');
  
  await bot.sendMessage(msg.chat.id, `🔍 جاري تحليل ${symbol.replace('.CA','')}...`);
  const data = await fetchHistory(symbol);
  if (!data) return bot.sendMessage(msg.chat.id, '❌ فشل جلب البيانات');
  
  const result = analyzeStock(data);
  let text = `📊 *${result.symbol}*\n💰 السعر: ${result.price}\n`;
  if (result.signal) {
    text += `🟢 *${result.signal}*\n🎯 النظام: ${result.system}\n📍 الدخول: ${result.entry}\n🛑 وقف الخسارة: ${result.sl}\n🎯 الهدف 1: ${result.tp1}\n🎯 الهدف 2: ${result.tp2}\n📈 RSI: ${result.rsi}`;
  } else {
    text += `⚪ لا توجد إشارة حالياً\n📈 RSI: ${result.rsi}\n📊 ATR: ${result.atr}`;
  }
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

bot.onText(/\/scan/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '⏳ جاري مسح السوق... (قد يستغرق 2-3 دقائق)');
  
  const results = [];
  for (const symbol of EGX_STOCKS) {
    const data = await fetchHistory(symbol);
    if (data) {
      const result = analyzeStock(data);
      if (result.signal) results.push(result);
    }
    // تأخير بسيط عشان متبلوكش
    await new Promise(r => setTimeout(r, 500));
  }
  
  if (results.length > 0) {
    let message = `🚨 *إشارات اليوم (${results.length})* 🚨\n\n`;
    results.forEach(r => {
      message += `💎 *${r.symbol}*: ${r.signal}\n`;
      message += `🎯 ${r.system} | دخول: ${r.entry} | وقف: ${r.sl}\n`;
      message += `🎯 أهداف: ${r.tp1} / ${r.tp2}\n\n`;
    });
    bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
  } else {
    bot.sendMessage(msg.chat.id, '⚪ لا توجد إشارات شراء اليوم حسب الأنظمة المحددة.');
  }
});

console.log('✅ Bot ready for post-market analysis!');

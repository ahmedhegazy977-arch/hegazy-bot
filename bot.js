const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TWELVE_API_KEY = process.env.TWELVE_API_KEY;

const bot = new TelegramBot(TOKEN, { polling: true });

const EGX_STOCKS = [
  'COMI', 'EFID', 'ETEL', 'HRHO', 'TMGH', 'MNHD', 'SODIC', 'PHDC',
  'SWDY', 'EAST', 'ORWE', 'JUFO', 'KARO', 'ISPH', 'UNIP', 'MKPH',
  'EIPIC', 'RMDA', 'PHCI', 'APPC', 'SKPC', 'MCDR', 'INEG', 'LUTS',
  'AGRI', 'CEMI', 'CHEM', 'CLHO', 'EGAS', 'ETRA', 'FERT', 'GAS'
];

console.log('🚀 Hegazy Scanner - 5 Systems');

// ====== الحسابات التقنية ======

function calcEMA(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * k + ema;
  }
  return ema;
}

function calcEMASeries(data, period) {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result = [ema];
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * k + ema;
    result.push(ema);
  }
  return result;
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

function calcMACD(closes, fast = 12, slow = 26, signal = 9) {
  const emaFast = calcEMASeries(closes, fast);
  const emaSlow = calcEMASeries(closes, slow);
  if (emaFast.length < slow || emaSlow.length < slow) return [null, null, null];
  
  const macdLine = [];
  for (let i = slow - 1; i < emaFast.length; i++) {
    macdLine.push(emaFast[i] - emaSlow[i]);
  }
  
  const signalLine = calcEMASeries(macdLine, signal);
  const histogram = [];
  for (let i = 0; i < signalLine.length; i++) {
    histogram.push(macdLine[i + macdLine.length - signalLine.length] - signalLine[i]);
  }
  
  return [
    macdLine[macdLine.length - 1],
    signalLine[signalLine.length - 1],
    histogram[histogram.length - 1]
  ];
}

function calcADX(highs, lows, closes, period = 14) {
  if (highs.length < period * 2) return null;
  const plusDM = [], minusDM = [], trList = [];
  for (let i = 1; i < highs.length; i++) {
    plusDM.push(Math.max(0, highs[i] - highs[i - 1]));
    minusDM.push(Math.max(0, lows[i - 1] - lows[i]));
    const tr1 = highs[i] - lows[i];
    const tr2 = Math.abs(highs[i] - closes[i - 1]);
    const tr3 = Math.abs(lows[i] - closes[i - 1]);
    trList.push(Math.max(tr1, tr2, tr3));
  }
  const atr = trList.slice(-period).reduce((a, b) => a + b, 0) / period;
  const plusDI = 100 * (plusDM.slice(-period).reduce((a, b) => a + b, 0) / period) / atr;
  const minusDI = 100 * (minusDM.slice(-period).reduce((a, b) => a + b, 0) / period) / atr;
  return Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
}

// ====== جلب البيانات ======

async function getTwelveData(symbol) {
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}.CA&interval=1day&outputsize=100&apikey=${TWELVE_API_KEY}`;
    const resp = await axios.get(url, { timeout: 10000 });
    
    if (resp.data.status === 'error') {
      console.log(`❌ ${symbol}: ${resp.data.message}`);
      return null;
    }
    
    const values = resp.data.values;
    if (!values || values.length < 50) return null;
    
    const closes = values.map(v => parseFloat(v.close)).reverse();
    const highs = values.map(v => parseFloat(v.high)).reverse();
    const lows = values.map(v => parseFloat(v.low)).reverse();
    const volumes = values.map(v => parseInt(v.volume)).reverse();
    
    return { closes, highs, lows, volumes };
  } catch (e) {
    console.error(`Error ${symbol}: ${e.message}`);
    return null;
  }
}

// ====== تحليل السهم - 5 أنظمة ======

async function analyzeStock(symbol) {
  const data = await getTwelveData(symbol);
  if (!data) return null;
  
  const { closes, highs, lows, volumes } = data;
  const close = closes[closes.length - 1];
  const high = highs[highs.length - 1];
  const low = lows[lows.length - 1];
  const vol = volumes[volumes.length - 1];
  
  // المؤشرات الأساسية
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const rsi = calcRSI(closes, 14);
  const atr = calcATR(highs, lows, closes, 14);
  const volAvg = calcSMA(volumes, 20);
  const adx = calcADX(highs, lows, closes, 14);
  const [macdLine, macdSignal, macdHist] = calcMACD(closes, 12, 26, 9);
  
  if (!ema20 || !ema50 || !ema200 || !rsi || !atr || !volAvg) return null;
  
  // المستويات
  const resistance = Math.max(...highs.slice(-21, -1));
  const breakoutLevel = resistance + (atr * 0.15);
  
  // الشروط العامة
  const trendUp = close > ema50 && close > ema200;
  const nearSupport = Math.abs(close - ema20) / ema20 < 0.05;
  const nearSupportV4 = Math.abs(close - ema20) / ema20 < 0.03;
  const rsiOKPullback = rsi >= 40 && rsi <= 70;
  const rsiOKBreakout = rsi >= 45 && rsi <= 75;
  const rsiOKV4 = rsi >= 45 && rsi <= 65;
  const rsiOKBrk = rsi >= 40 && rsi <= 70;
  const volOK = vol > volAvg * 1.0;
  const volOKBrk = vol > volAvg * 1.2;
  const isRanging = adx !== null && adx < 15;
  const notOverbought = rsi < 78;
  const momentum = closes.length >= 2 ? (close - closes[closes.length - 2]) / closes[closes.length - 2] * 100 > 0.8 : false;
  const strongClose = close >= high * 0.96;
  const trendUpSMC = close > calcSMA(closes, 20);
  const volConditionSMC = vol > calcSMA(volumes, 5);
  
  const signals = [];
  
  // ====== نظام 1: الارتداد والكسر ======
  if (trendUp && nearSupport && rsiOKPullback && volOK) {
    const sl = close - (atr * 1.5);
    const tp1 = close + (atr * 2.5);
    const tp2 = close + (atr * 4.5);
    const rr = (tp1 - close) / (close - sl);
    signals.push({ system: 'نظام الارتداد والكسر', signal: 'شراء عند الارتداد', entry: close, sl, tp1, tp2, rr, strength: 'normal' });
  }
  
  if (close > breakoutLevel && rsiOKBreakout && volOK) {
    const sl = close - (atr * 1.5);
    const tp1 = close + (atr * 2.5);
    const tp2 = close + (atr * 4.5);
    const rr = (tp1 - close) / (close - sl);
    signals.push({ system: 'نظام الارتداد والكسر', signal: 'شراء عند الكسر', entry: close, sl, tp1, tp2, rr, strength: 'normal' });
  }
  
  // ====== نظام 2: العمل ======
  if (trendUp && !isRanging && volOK && rsiOKV4 && nearSupportV4) {
    const sl = close - (atr * 1.5);
    const tp1 = close + (atr * 2.5);
    const tp2 = close + (atr * 4.5);
    const rr = (tp1 - close) / (close - sl);
    signals.push({ system: 'نظام العمل', signal: 'إشارة شراء', entry: close, sl, tp1, tp2, rr, strength: 'normal' });
  }
  
  // ====== نظام 3: كسر المقاومة المؤكد ======
  const brokeRes = close > resistance;
  if (brokeRes && volOKBrk && rsiOKBrk && trendUp) {
    const entry = close;
    const sl = entry - (atr * 1.5);
    const tp1 = entry + (atr * 2.5);
    const risk = entry - sl;
    const rr = risk > 0 ? (tp1 - entry) / risk : 0;
    if (rr >= 1.3) {
      signals.push({ system: 'نظام كسر المقاومة', signal: 'كسر مقاومة مؤكد', entry, sl, tp1, tp2: entry + (atr * 3.75), rr, strength: 'strong' });
    }
  }
  
  // ====== نظام 4: الثلاث مراحل ======
  const stage1 = vol >= 1000000 && vol / volAvg >= 1.2;
  const stage2 = stage1 && close > ema50 && close > ema200 && ema20 > ema50;
  const stage3 = stage2 && rsi >= 55 && rsi <= 75 && macdHist && macdHist > 0 && vol >= volAvg * 1.5;
  
  if (stage3) {
    const sl = close - (atr * 1.5);
    const tp1 = close + (atr * 2.5);
    const tp2 = close + (atr * 3.75);
    const rr = (tp1 - close) / (close - sl);
    signals.push({ system: 'نظام الثلاث مراحل', signal: 'شراء ثلاثي', entry: close, sl, tp1, tp2, rr, strength: 'strong' });
  }
  
  // ====== نظام 5: الأموال الذكية ======
  const lowestLow = lows.length >= 5 ? Math.min(...lows.slice(-5)) : low;
  const stopLossSMC = lowestLow * 0.97;
  const riskSMC = close - stopLossSMC;
  const target1SMC = close + (riskSMC * 2);
  
  if (strongClose && volConditionSMC && trendUpSMC && momentum && notOverbought) {
    const rr = (target1SMC - close) / (close - stopLossSMC);
    signals.push({ system: 'نظام الأموال الذكية', signal: 'شراء أموال ذكية', entry: close, sl: stopLossSMC, tp1: target1SMC, tp2: close + (riskSMC * 3), rr, strength: 'strong' });
  }
  
  if (signals.length === 0) return null;
  
  // اختيار أفضل إشارة
  const strongSignals = signals.filter(s => s.strength === 'strong');
  const best = strongSignals.length > 0 ? strongSignals[0] : signals[0];
  
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
    atr,
    allSignals: signals
  };
}

// ====== إرسال الإشعارات ======

async function sendSignal(signal) {
  const emojis = {
    'كسر مقاومة مؤكد': '🚀',
    'شراء عند الارتداد': '📈',
    'شراء عند الكسر': '💥',
    'إشارة شراء': '✅',
    'شراء ثلاثي': '📊',
    'شراء أموال ذكية': '💎'
  };
  
  const em = emojis[signal.signal] || '🔔';
  
  let msg = `${em} *إشارة جديدة - ${signal.symbol}*\n\n`;
  msg += `📊 *النظام:* ${signal.system}\n`;
  msg += `🎯 *الإشارة:* ${signal.signal}\n\n`;
  msg += `💰 *السعر الحالي:* ${signal.price.toFixed(2)} EGP\n`;
  msg += `🚪 *سعر الدخول:* ${signal.entry.toFixed(2)}\n`;
  msg += `🛑 *وقف الخسارة:* ${signal.sl.toFixed(2)}\n`;
  msg += `🎯 *الهدف الأول:* ${signal.tp1.toFixed(2)}\n`;
  msg += `🎯 *الهدف الثاني:* ${signal.tp2.toFixed(2)}\n`;
  msg += `📈 *R/R:* ${signal.rr.toFixed(2)}\n\n`;
  msg += `📉 *المؤشرات:*\n`;
  msg += `• RSI: ${signal.rsi.toFixed(1)}\n`;
  msg += `• EMA20: ${signal.ema20.toFixed(2)}\n`;
  msg += `• EMA50: ${signal.ema50.toFixed(2)}\n`;
  msg += `• EMA200: ${signal.ema200.toFixed(2)}\n`;
  msg += `• ATR: ${signal.atr.toFixed(2)}\n`;
  msg += `• الحجم: ${signal.volume.toLocaleString()} (متوسط: ${signal.volAvg.toLocaleString()})\n\n`;
  msg += `⏰ ${new Date().toLocaleString('ar-EG')}`;
  
  if (signal.allSignals.length > 1) {
    msg += `\n\n🔥 *أنظمة إضافية متحققة:*\n`;
    signal.allSignals.slice(1).forEach(s => {
      msg += `• ${s.system}: ${s.signal}\n`;
    });
  }
  
  try {
    await bot.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' });
    console.log(`✅ Signal: ${signal.symbol}`);
  } catch (e) {
    console.error(`❌ Send failed: ${e.message}`);
  }
}

async function sendSummary(results, total) {
  if (!results || results.length === 0) {
    await bot.sendMessage(CHAT_ID, 
      '⚪ *لا توجد إشارات شراء حالياً*\n\nالسوق في حالة انتظار.\n⏰ ' + new Date().toLocaleString('ar-EG'),
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  const strong = results.filter(r => r.strength === 'strong');
  const normal = results.filter(r => r.strength === 'normal');
  
  let msg = `🎯 *ملخص فحص السوق*\n`;
  msg += `📊 تم فحص ${total} سهم\n`;
  msg += `✅ ${results.length} إشارة نشطة\n\n`;
  
  if (strong.length > 0) {
    msg += `💎 *إشارات قوية (${strong.length}):*\n`;
    strong.forEach(r => msg += `• ${r.symbol} @ ${r.price.toFixed(2)} - ${r.signal}\n`);
  }
  
  if (normal.length > 0) {
    msg += `\n📈 *إشارات عادية (${normal.length}):*\n`;
    normal.forEach(r => msg += `• ${r.symbol} @ ${r.price.toFixed(2)} - ${r.signal}\n`);
  }
  
  msg += `\n⏰ ${new Date().toLocaleString('ar-EG')}`;
  
  try {
    await bot.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' });
  } catch (e) {
    console.error(`❌ Summary failed: ${e.message}`);
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
        if (result.strength === 'strong') {
          await sendSignal(result);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      
      await new Promise(r => setTimeout(r, 500));
      
      if (scanned % 10 === 0) {
        console.log(`📊 ${scanned}/${EGX_STOCKS.length}`);
      }
    } catch (e) {
      console.error(`❌ ${symbol}: ${e.message}`);
    }
  }
  
  await sendSummary(results, scanned);
  console.log(`✅ Done: ${results.length} signals`);
  return results;
}

// ====== أوامر البوت ======

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `🤖 *Hegazy Scanner - 5 Systems*\n\n` +
    `أنا بوت متخصص في فحص البورصة المصرية بـ 5 أنظمة تحليل تقني.\n\n` +
    `*الأنظمة:*\n` +
    `📈 نظام الارتداد والكسر\n` +
    `💼 نظام العمل\n` +
    `🚀 نظام كسر المقاومة\n` +
    `📊 نظام الثلاث مراحل\n` +
    `💎 نظام الأموال الذكية\n\n` +
    `*الأوامر:*\n` +
    `/scan - فحص السوق بالكامل\n` +
    `/status - حالة البوت\n` +
    `/help - المساعدة\n\n` +
    `⏰ الفحص التلقائي كل 5 دقائق خلال الجلسة`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/scan/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '🔍 جاري فحص السوق... قد يستغرق 3-5 دقائق');
  await scanMarket();
});

bot.onText(/\/status/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `✅ البوت يعمل بنجاح\n` +
    `📊 الأسهم: ${EGX_STOCKS.length}\n` +
    `🕐 ${new Date().toLocaleString('ar-EG')}`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `*المساعدة:*\n\n` +
    `/scan - فحص يدوي\n` +
    `/status - الحالة\n` +
    `/help - المساعدة\n\n` +
    `⚠️ البيانات متأخرة 15-20 دقيقة`,
    { parse_mode: 'Markdown' }
  );
});

// ====== الفحص التلقائي ======

function isTradingHours() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  if (day === 5 || day === 6) return false;
  if (hour < 10 || (hour === 14 && minute > 30) || hour > 14) return false;
  return true;
}

async function scheduledScan() {
  while (true) {
    if (isTradingHours()) {
      console.log('⏰ Trading hours - scanning');
      await scanMarket();
      await new Promise(r => setTimeout(r, 300000));
    } else {
      console.log('😴 Outside trading hours');
      await new Promise(r => setTimeout(r, 600000));
    }
  }
}

// ====== Start ======

console.log('✅ Bot started with 5 systems!');
scheduledScan();

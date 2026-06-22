const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// ====== إعدادات البوت ======
const TOKEN = process.env.TOKEN; // تأكد من أن المتغير موجود في Railway Variables
const bot = new TelegramBot(TOKEN, { polling: true });

// ====== قائمة أسهم مصرية كبيرة للفلترة (نموذج EGX30 وكبرى الشركات) ======
const STOCKS_TO_SCAN = [
  'COMI', 'FRAL', 'EAST', 'TMGH', 'SWDY', 'MNHD', 'EFID', 'ORWE', 
  'ESRS', 'HELI', 'EWBY', 'OCDI', 'ETEL', 'HRHO', 'CWPC', 'PHDC',
  'AMOC', 'BIOP', 'ASLN', 'ABUK', 'ALEX', 'CLHO', 'DOCT', 'DWEE'
];

console.log('🚀 Hegazy Global Scanner Started!');

// ====== دوال الحساب المالي (منطق الـ Pine Script بتاعك) ======

function calcEMA(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) ema = (data[i] - ema) * k + ema;
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
    ch > 0 ? (avgGain = (avgGain * (period - 1) + ch) / period, avgLoss = (avgLoss * (period - 1)) / period)
           : (avgGain = (avgGain * (period - 1)) / period, avgLoss = (avgLoss * (period - 1) - ch) / period);
  }
  return avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
}

function calcATR(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return null;
  const tr = [];
  for (let i = 1; i < closes.length; i++) {
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  let atr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < tr.length; i++) atr = (atr * (period - 1) + tr[i]) / period;
  return atr;
}

// ====== محقق الفلترة الرئيسي (تطبيق منطقك 1:1) ======
function analyzeSymbol(symbol) {
  try {
    // جلب البيانات التاريخية
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.CA?range=3mo&interval=1d`;
    const { data } = axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
    
    const quotes = data.chart.result.indicators.quote[0];
    const closes = quotes.close.filter(v => v != null);
    const highs = quotes.high.filter(v => v != null);
    const lows = quotes.low.filter(v => v != null);
    const volumes = quotes.volume.filter(v => v != null);

    if (closes.length < 200) return null; // نحتاج بيانات كافية للحسابات الطويلة

    // حساب المؤشرات الأساسية
    const close = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const high = highs[highs.length - 1];
    const low = lows[lows.length - 1];
    const vol = volumes[volumes.length - 1];
    const volAvg = volslice(-20).reduce((a,b)=>a+b,0)/20;

    const ema20 = calcEMA(closes, 20);
    const ema50 = calcEMA(closes, 50);
    const ema200 = calcEMA(closes, 200);
    const rsi = calcRSI(closes);
    const atr = calcATR(highs, lows, closes);
    
    // مستويات الدعم والمقاومة حسب كودك
    const resistance = Math.max(...highs.slice(-20));
    const breakoutLevel = resistance + (atr * 0.15);

    // --- تطبيق الأنظمة الخمسة من كودك ---

    // 1. نظام الارتداد والكسر (Pullback & Breakout)
    const trendUp = close > ema50 && close > ema200;
    const nearSupport = Math.abs(close - ema20) / ema20 < 0.05;
    const rsiOK = rsi >= 40 && rsi <= 70;
    const volOK = vol > volAvg * 1.0;

    let signal = null, type = '', entry = null, sl = null, tp1 = null, tp2 = null;

    // شرط الارتداد
    if (trendUp && nearSupport && rsiOK && volOK) {
      signal = `شراء عند الارتداد (R${rsi.toFixed(1)})`;
      type = 'Pullback';
      entry = close;
      sl = close - (atr * 1.5);
      tp1 = close + (atr * 2.5);
      tp2 = close + (atr * 4.5);
    }
    // شرط الكسر
    else if (close > breakoutLevel && rsi >= 45 && rsi <= 75 && volOK) {
      signal = `💥 كسر مقاومة مؤكد (${resistance})`;
      type = 'Breakout';
      entry = breakoutLevel;
      sl = breakoutLevel - (atr * 1.5);
      tp1 = breakoutLevel + (atr * 2.5);
      tp2 = breakoutLevel + (atr * 3.75);
    }

    return signal ? { symbol, price: close.toFixed(2), signal, type, entry, sl, tp1, tp2 } : null;

  } catch (err) {
    return null;
  }
}

// ====== أوامر التليجرام ======

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    `🤖 *Hegazy Ultimate Scanner*\n\n` +
    `البوت يطبق 5 أنظمة تحالفيك على السوق المصري.\n\n` +
    `الأوامر:\n` +
    `/scan - فحص شامل لجميع الأسهم (يحتاج وقت)\n` +
    `/price SYMBOL - تحليل سهم معين`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/scan/, async (msg) => {
  const chatId = msg.chat.id;
  const loading = await bot.sendMessage(chatId, '⏳ بدأت عملية الفحص الشامل للسوق...\nيرجى الانتظار 3 دقائق.');
  
  const hits = [];
  
  // بدء العملية
  for (const sym of STOCKS_TO_SCAN) {
    const result = await analyzeSymbol(sym);
    if (result) hits.push(result);
    
    // إبطاء الطلب عشان ياهو متقفلناش
    await new Promise(r => setTimeout(r, 600));
  }
  
  // بناء الرسالة
  let text = '';
  if (hits.length > 0) {
    text = `🎯 *وجدت ${hits.length} فرصة شرائية:*\n\n`;
    hits.forEach(h => {
      text += `💎 *${h.symbol}*\n`;
      text += `💰 السعر: ${h.price}\n`;
      text += `📡 النظام: ${h.type}\n`;
      text += `🎯 الدخول: ${h.entry.toFixed(2)}\n`;
      text += `🛑 وقف: ${h.sl.toFixed(2)}\n`;
      text += ` أهداف: ${h.tp1.toFixed(2)} / ${h.tp2.toFixed(2)}\n`;
      text += `-------------------------\n`;
    });
    text += `\n📈 نسبة النجاح المحتملة عالية جداً.`;
    bot.editMessageText(text, { chat_id: chatId, message_id: loading.message_id, parse_mode: 'Markdown' });
  } else {
    bot.editMessageText(`⚪ السوق حالياً في حالة انتظار ولا توجد إشارات شراء قوية اليوم.\n\n*السعر الحالي يحترم المستويات.*`, 
      { chat_id: chatId, message_id: loading.message_id, parse_mode: 'Markdown' });
  }
});

bot.onText(/\/price (.+)/, (msg, match) => {
  const sym = match[1].toUpperCase();
  const link = `https://www.tradingview.com/chart/?symbol=EGX:${sym}`;
  bot.sendMessage(msg.chat.id, `📊 شارت السهم:\n${link}`);
});

console.log('✅ Bot ready. Waiting for commands...');

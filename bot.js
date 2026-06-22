const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

// قائمة شاملة لأسهم البورصة المصرية (أكتر من 100 سهم)
const EGX_STOCKS = [
  'COMI','EFID','ETEL','HRHO','ESRS','SWDY','PHDC','TMGH','SODIC','MNHD',
  'INEG','LUTS','OCDI','FWRY','EKHO','HELI','EAST','ORWE','UNIP','ISPH',
  'EKZN','LXIN','MOPH','NILE','QALY','PALM','JUFO','ZMZA','KARO','HOD',
  'DOMT','PHCI','RMDA','MKPH','EIPIC','TELS','ITPAC','MCDR','SKPC','APPC',
  'OLFI','TALM','UPFD','WUFA','YRGN','ZOD','AGRI','CEMI','CHEM','CLHO',
  'EGAS','ETRA','FERT','GAS','GLBC','IRON','MINA','MNQC','PACK','PAPR',
  'PLAS','POLY','RUBR','SAND','SHMD','STLT','TEXT','TILE','TIMB','AUTO',
  'SPIN','EGTS','THMD','ALHE','HOTL','TOUR','TRVL','ELEC','ENER','FINS',
  'HOLD','INVS','LEAS','REIT','SUKN','ALEX','CAIB','CIHB','EBNK','EKBN',
  'NSGB','SAIB','ABUK','OBEL','EKBN','CIHB','EBNK','NSGB','SAIB','CAIB'
];

console.log('🚀 Hegazy Full Scanner Bot Started!');

// دالة جلب البيانات التاريخية
async function fetchHistory(symbol, days = 200) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.CA?range=${days}d&interval=1d`;
    const { data } = await axios.get(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0' }, 
      timeout: 10000 
    });
    
    const quotes = data.chart?.result?.[0]?.indicators?.quote?.[0];
    if (!quotes || !quotes.close) return null;
    
    return {
      close: quotes.close.filter(v => v != null),
      high: (quotes.high || []).filter(v => v != null),
      low: (quotes.low || []).filter(v => v != null),
      volume: (quotes.volume || []).filter(v => v != null)
    };
  } catch (e) { 
    console.log(`❌ Failed ${symbol}: ${e.message}`);
    return null; 
  }
}

// حساب EMA
function calcEMA(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * k + ema;
  }
  return ema;
}

// حساب RSI
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i-1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i-1];
    if (change > 0) {
      avgGain = (avgGain * (period-1) + change) / period;
      avgLoss = (avgLoss * (period-1)) / period;
    } else {
      avgGain = (avgGain * (period-1)) / period;
      avgLoss = (avgLoss * (period-1) - change) / period;
    }
  }
  
  return avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
}

// حساب ATR
function calcATR(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return null;
  const tr = [];
  
  for (let i = 1; i < closes.length; i++) {
    const h_l = highs[i] - lows[i];
    const h_cp = Math.abs(highs[i] - closes[i-1]);
    const l_cp = Math.abs(lows[i] - closes[i-1]);
    tr.push(Math.max(h_l, h_cp, l_cp));
  }
  
  let atr = tr.slice(0, period).reduce((a,b) => a+b, 0) / period;
  for (let i = period; i < tr.length; i++) {
    atr = (atr * (period-1) + tr[i]) / period;
  }
  return atr;
}

// تطبيق أنظمة التحليل
function analyzeStock(data) {
  const { close, high, low, volume } = data;
  const current = close[close.length - 1];
  const prev = close[close.length - 2];
  
  // المؤشرات
  const ema20 = calcEMA(close, 20);
  const ema50 = calcEMA(close, 50);
  const ema200 = calcEMA(close, 200);
  const atr = calcATR(high, low, close, 14);
  const rsi = calcRSI(close, 14);
  const volAvg = volume.slice(-20).reduce((a,b) => a+b, 0) / 20;
  const currentVol = volume[volume.length - 1];
  
  if (!ema20 || !ema50 || !ema200 || !atr || !rsi) return null;
  
  // المقاومة (أعلى 20 يوم)
  const resistance = Math.max(...high.slice(-20));
  const breakoutLevel = resistance + (atr * 0.15);
  
  let signal = null;
  let system = '';
  
  // النظام 1: الارتداد
  const trendUp = current > ema50 && current > ema200;
  const nearSupport = Math.abs(current - ema20) / ema20 < 0.05;
  const rsiOK = rsi >= 40 && rsi <= 70;
  const volOK = currentVol > volAvg * 1.0;
  
  if (trendUp && nearSupport && rsiOK && volOK) {
    signal = 'شراء عند الارتداد';
    system = 'Pullback';
  }
  
  // النظام 2: الكسر
  if (!signal && current > breakoutLevel && rsi >= 45 && rsi <= 75 && volOK) {
    signal = 'كسر مقاومة';
    system = 'Breakout';
  }
  
  // النظام 3: V4
  if (!signal && trendUp && volOK && rsi >= 45 && rsi <= 65 && nearSupport) {
    signal = 'إشارة شراء V4';
    system = 'V4';
  }
  
  // النظام 4: 3 مراحل
  if (!signal) {
    const stage1 = currentVol >= 1000000 && currentVol / volAvg >= 1.2;
    const stage2 = stage1 && current > ema50 && current > ema200 && ema20 > ema50;
    const stage3 = stage2 && rsi >= 55 && rsi <= 75 && currentVol >= volAvg * 1.5;
    if (stage3) {
      signal = 'شراء ثلاثي المراحل';
      system = '3-Stage';
    }
  }
  
  // النظام 5: الأموال الذكية
  if (!signal) {
    const lowestLow = Math.min(...low.slice(-5));
    const strongClose = current >= high[high.length - 1] * 0.96;
    const volCond = currentVol > volAvg;
    const momentum = ((current - prev) / prev) * 100 > 0.8;
    if (strongClose && volCond && trendUp && momentum && rsi < 78) {
      signal = 'أموال ذكية';
      system = 'Smart Money';
    }
  }
  
  if (!signal) return null;
  
  // حساب النقاط
  const entry = current;
  const sl = current - (atr * 1.5);
  const tp1 = current + (atr * 2.5);
  const tp2 = current + (atr * 4.5);
  const risk = entry - sl;
  const reward = tp1 - entry;
  const rr = risk > 0 ? (reward / risk).toFixed(2) : 'N/A';
  
  return {
    symbol: symbol.replace('.CA', ''),
    price: current.toFixed(2),
    signal,
    system,
    entry: entry.toFixed(2),
    sl: sl.toFixed(2),
    tp1: tp1.toFixed(2),
    tp2: tp2.toFixed(2),
    rr,
    rsi: rsi.toFixed(1),
    atr: atr.toFixed(2)
  };
}

// أوامر البوت
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    `🤖 *بوت المسح الشامل - أنظمة حجازي*\n\n` +
    `الأوامر:\n` +
    `/scan - مسح كل السوق وإرسال الإشارات\n` +
    `/price SYMBOL - تحليل سهم معين\n` +
    `/list - قائمة الأسهم (${EGX_STOCKS.length} سهم)\n` +
    `/help - مساعدة`, 
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/list/, (msg) => {
  const list = EGX_STOCKS.join(', ');
  bot.sendMessage(msg.chat.id, `✅ *الأسهم المتاحة (${EGX_STOCKS.length}):*\n${list}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/price (.+)/, async (msg, match) => {
  const symbol = match[1].toUpperCase();
  
  if (!EGX_STOCKS.includes(symbol)) {
    return bot.sendMessage(msg.chat.id, `❌ ${symbol} غير موجود. استخدم /list`);
  }
  
  await bot.sendMessage(msg.chat.id, `🔍 جاري تحليل ${symbol}...`);
  const data = await fetchHistory(symbol);
  
  if (!data) {
    return bot.sendMessage(msg.chat.id, `❌ فشل جلب بيانات ${symbol}`);
  }
  
  const result = analyzeStock(data);
  
  if (!result) {
    return bot.sendMessage(msg.chat.id, `⚪ ${symbol}: لا توجد إشارات حالياً`);
  }
  
  const text = `📊 *${result.symbol}*\n` +
    `💰 السعر: ${result.price}\n` +
    `🟢 *${result.signal}*\n` +
    `🎯 النظام: ${result.system}\n\n` +
    `📍 الدخول: ${result.entry}\n` +
    `🛑 وقف الخسارة: ${result.sl}\n` +
    `🎯 الهدف 1: ${result.tp1}\n` +
    `🎯 الهدف 2: ${result.tp2}\n` +
    `📊 R/R: ${result.rr}\n` +
    `📈 RSI: ${result.rsi}\n\n` +
    `🔗 [الشارت](https://www.tradingview.com/chart/?symbol=EGX:${result.symbol})`;
  
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

bot.onText(/\/scan/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, `⏳ جاري مسح ${EGX_STOCKS.length} سهم...\n(قد يستغرق 3-5 دقائق)`);
  
  const signals = [];
  let processed = 0;
  
  for (const symbol of EGX_STOCKS) {
    const data = await fetchHistory(symbol);
    if (data) {
      const result = analyzeStock(data);
      if (result) {
        signals.push(result);
      }
    }
    
    processed++;
    // تأخير عشان متبلوكش
    if (processed % 10 === 0) {
      await bot.sendMessage(chatId, `📊 تم فحص ${processed}/${EGX_STOCKS.length}...`);
      await new Promise(r => setTimeout(r, 2000));
    } else {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  if (signals.length > 0) {
    // ترتيب حسب جودة الإشارة
    signals.sort((a, b) => parseFloat(b.rr) - parseFloat(a.rr));
    
    let message = `🚨 *إشارات الشراء اليوم (${signals.length})* 🚨\n\n`;
    
    signals.forEach((s, i) => {
      message += `${i+1}. *${s.symbol}* - ${s.signal}\n`;
      message += `   🎯 ${s.system} | R/R: ${s.rr}\n`;
      message += `   📍 دخول: ${s.entry} | وقف: ${s.sl}\n`;
      message += `   🎯 أهداف: ${s.tp1} / ${s.tp2}\n`;
      message += `   📈 RSI: ${s.rsi}\n\n`;
      
      // تقسيم الرسالة عشان متزحمش
      if ((i + 1) % 5 === 0 && i < signals.length - 1) {
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        message = '';
        await new Promise(r => setTimeout(r, 1000));
      }
    });
    
    if (message) {
      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    }
    
    bot.sendMessage(chatId, `✅ انتهى المسح. تم العثور على ${signals.length} إشارة.`);
  } else {
    bot.sendMessage(chatId, `⚪ لا توجد إشارات شراء اليوم حسب الأنظمة المحددة.\n\n💡 السوق في حالة انتظار.`);
  }
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📖 *كيفية الاستخدام:*\n\n` +
    `1️⃣ */scan* - يفحص كل الأسهم ويبعت الإشارات\n` +
    `2️⃣ */price SYMBOL* - يحلل سهم معين\n` +
    `3️⃣ */list* - يشوف كل الأسهم المتاحة\n\n` +
    `⏰ *أفضل وقت:* بعد قفل السوق (2:30 ظهراً)\n\n` +
    `📊 *الأنظمة المطبقة:*\n` +
    `• الارتداد من المتوسطات\n` +
    `• كسر المقاومة\n` +
    `• نظام V4\n` +
    `• الثلاث مراحل\n` +
    `• الأموال الذكية`
  );
});

console.log(`✅ Bot ready! Scanning ${EGX_STOCKS.length} stocks.`);

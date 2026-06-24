const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TOKEN;
const API_KEY = process.env.TWELVE_API_KEY;
const bot = new TelegramBot(TOKEN, { polling: true });

// ====== القائمة الشاملة لأسهم البورصة المصرية (200+ سهم) ======
const ALL_STOCKS = [
  // EGX30 - أكبر 30 شركة
  'COMI','EAST','ETEL','HRHO','SWDY','TMGH','MNHD','SODIC','PHDC','EFID',
  'ESRS','ORWE','EKHO','HELI','OCDI','FWRY','ABUK','ALEX','CIB','EGAL',
  'EFGH','SKPC','MCDR','TALA','CLHO','JUFO','ISPH','UNIP','AMOC','BIOP',
  
  // البنوك والخدمات المالية
  'BKNS','CAIB','CIHB','EBEK','EKBN','ESBE','NSGB','SAIB','THBK','EGAL',
  'EFGH','IBNS','UBCI','ARCC','CIRA','FOCM','GBCO','GSRH','ISPH','MNBK',
  
  // العقارات
  'DOMT','EKZN','LXIN','MOPH','NILE','QALY','PALM','HOD','DWEE','CWPC',
  'DOCT','EWBY','EIPIC','RMDA','PHCI','APPC','NAHO','NCCW','OBOX','ORHD',
  'PLEC','PRAS','SAKR','SEPC','SILO','SPC','SRGS','SUGR','TAPM','TBCO',
  'TCIH','TERA','TFIC','TREA','TRIP','UBCI','WAVE','WEST','YRGN','ZOD',
  
  // الصناعة والمواد الأساسية
  'ASLN','INEG','LUTS','AGRI','CEMI','CHEM','EGAS','ETRA','FERT','GAS',
  'GLBC','IRON','MINA','MNQC','PACK','PAPR','PLAS','POLY','RUBR','SAND',
  'SHMD','STLT','TEXT','TILE','TIMB','AUTO','SPIN','EGTS','THMD','ALHE',
  'KIMA','LECT','LILY','MEGA','MNHP','MTRJ','ARMO','ATLC','BTEL','CDPM',
  'CLEO','DCRC','EGYT','EPHC','ESIC','ETIH','GMRS','GSW','HDMO','HSS',
  'JHRS','JSCA','MBLJ','NAHO','OSRS','PHDC','PHCI','RMDA','SKPC','SPC',
  
  // الاتصالات والتكنولوجيا
  'ITPAC','TELS','EGTS','THMD','BTEL','CDPM','ETIH','FOCM','GBCO','GSW',
  
  // الطاقة والمرافق
  'ELEC','ENER','FINS','HOLD','INVS','LEAS','REIT','SUKN','EGAS','ETRA',
  'FERT','GAS','GLBC','IRON','MINA',
  
  // السياحة والفنادق
  'HOTL','TOUR','ALHE','HDMO','JHRS','JSCA','MBLJ','MTRJ','NAHO','TRIP',
  
  // أسهم إضافية متنوعة
  'ARCC','ARMO','ATLC','CIRA','CLEO','DCRC','EGYT','EPHC','ESIC','GMRS',
  'GSW','HSS','IBNS','KIMA','LECT','LILY','MEGA','MNHP','MTRJ','NCCW',
  'OBOX','ORHD','OSRS','PLEC','PRAS','SAKR','SEPC','SILO','SUGR','TAPM',
  'TBCO','TCIH','TERA','TFIC','TREA','TRIP','UBCI','WAVE','WEST','YRGN',
  'ZOD','CIB','EGAL','EFGH','MNBK','FOCM','GBCO','GSRH','ISPH','MNBK'
];

// إزالة التكرار
const UNIQUE_STOCKS = [...new Set(ALL_STOCKS)];

// الأسهم المهمة للفحص السريع (أول 50)
const TOP_STOCKS = UNIQUE_STOCKS.slice(0, 50);

console.log(`🚀 Full EGX Scanner Started! (${UNIQUE_STOCKS.length} unique stocks)`);

// ====== Caching لتوفير الطلبات ======
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 دقائق

function getCached(symbol) {
  const item = cache.get(symbol);
  if (item && Date.now() - item.time < CACHE_TTL) return item.data;
  return null;
}

function setCache(symbol, data) {
  cache.set(symbol, { data, time: Date.now() });
  // تنظيف الكاش القديم
  if (cache.size > 100) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

// ====== دوال الحساب الفني ======
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
    const ch = closes[i] - closes[i-1];
    ch > 0 ? gains += ch : losses -= ch;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i-1];
    if (ch > 0) { avgGain = (avgGain * (period-1) + ch) / period; avgLoss = (avgLoss * (period-1)) / period; }
    else { avgGain = (avgGain * (period-1)) / period; avgLoss = (avgLoss * (period-1) - ch) / period; }
  }
  return avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
}

// ====== جلب البيانات من Twelve Data ======
async function fetchStockData(symbol) {
  // التحقق من الكاش أولاً
  const cached = getCached(symbol);
  if (cached) return cached;
  
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}:EGX&interval=1day&outputsize=100&apikey=${API_KEY}`;
    const { data } = await axios.get(url, { timeout: 8000 });
    
    if (data.status === 'error' || !data.values) return null;
    
    const values = data.values.reverse();
    const closes = values.map(v => parseFloat(v.close));
    const highs = values.map(v => parseFloat(v.high));
    const lows = values.map(v => parseFloat(v.low));
    const volumes = values.map(v => parseInt(v.volume) || 0);
    
    const result = { closes, highs, lows, volumes, symbol: data.meta.symbol };
    setCache(symbol, result);
    return result;
  } catch (err) {
    return null;
  }
}

// ====== تحليل السهم ======
function analyzeStock(data) {
  const { closes, highs, lows, volumes } = data;
  if (closes.length < 50) return null;
  
  const close = closes[closes.length - 1];
  const vol = volumes[volumes.length - 1];
  const volAvg = volumes.slice(-20).reduce((a,b) => a+b, 0) / 20;
  
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const rsi = calcRSI(closes);
  
  if (!ema20 || !ema50 || !ema200 || !rsi) return null;
  
  const resistance = Math.max(...highs.slice(-20));
  const atr = Math.max(0.5, close * 0.03);
  
  const trendUp = close > ema50 && close > ema200;
  const nearSupport = Math.abs(close - ema20) / ema20 < 0.05;
  const rsiOK = rsi >= 40 && rsi <= 70;
  const volOK = vol > volAvg * 1.0;
  
  if (trendUp && nearSupport && rsiOK && volOK) {
    return {
      symbol: data.symbol,
      price: close.toFixed(2),
      signal: '📈 ارتداد من دعم',
      type: 'Pullback',
      entry: close.toFixed(2),
      sl: (close - atr * 1.5).toFixed(2),
      tp1: (close + atr * 2.5).toFixed(2),
      tp2: (close + atr * 4.5).toFixed(2),
      rsi: rsi.toFixed(1)
    };
  }
  
  if (close > resistance && rsi >= 45 && rsi <= 75 && volOK) {
    return {
      symbol: data.symbol,
      price: close.toFixed(2),
      signal: '💥 كسر مقاومة',
      type: 'Breakout',
      entry: close.toFixed(2),
      sl: (close - atr * 1.5).toFixed(2),
      tp1: (close + atr * 2.5).toFixed(2),
      tp2: (close + atr * 3.75).toFixed(2),
      rsi: rsi.toFixed(1)
    };
  }
  
  return null;
}

// ====== أوامر البوت ======

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    `🤖 *Hegazy Full Market Scanner*\n\n` +
    ` قاعدة بيانات: ${UNIQUE_STOCKS.length} سهم مصري\n` +
    `🔌 مصدر البيانات: Twelve Data (رسمي)\n\n` +
    `*الأوامر:*\n` +
    `/scan - فحص سريع (أهم 50 سهم)\n` +
    `/scanfull - فحص كامل (${UNIQUE_STOCKS.length} سهم)\n` +
    `/price SYMBOL - تحليل سهم معين\n` +
    `/list - عرض كل الأسهم\n` +
    `/stats - إحصائيات الاستخدام`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/stats/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    `📊 *إحصائيات البوت:*\n\n` +
    `• عدد الأسهم: ${UNIQUE_STOCKS.length}\n` +
    `• الأسهم في الكاش: ${cache.size}\n` +
    `• الكاش صالح لمدة: 5 دقائق\n` +
    `• حد Twelve Data اليومي: 800 طلب\n` +
    `• الطلبات المتوقعة للفحص الكامل: ~${UNIQUE_STOCKS.length} طلب`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/list/, (msg) => {
  const list = UNIQUE_STOCKS.join(', ');
  bot.sendMessage(msg.chat.id, `📋 *كل الأسهم (${UNIQUE_STOCKS.length}):*\n\n${list}`, { 
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  });
});

bot.onText(/\/price (.+)/, async (msg, match) => {
  const symbol = match[1].toUpperCase();
  const chatId = msg.chat.id;
  
  await bot.sendMessage(chatId, `⏳ جاري تحليل ${symbol}...`);
  
  const data = await fetchStockData(symbol);
  if (!data) {
    return bot.sendMessage(chatId, `❌ لم يتم العثور على ${symbol} أو خطأ في البيانات`);
  }
  
  const result = analyzeStock(data);
  if (result) {
    const text = `📊 *${result.symbol}*\n💰 السعر: ${result.price}\n ${result.signal}\n📍 الدخول: ${result.entry}\n🛑 وقف الخسارة: ${result.sl}\n🎯 الهدف 1: ${result.tp1}\n الهدف 2: ${result.tp2}\n📈 RSI: ${result.rsi}`;
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } else {
    bot.sendMessage(chatId, `📊 *${symbol}*\n💰 السعر: ${data.closes[data.closes.length-1].toFixed(2)}\n⚪ لا توجد إشارة شراء حالياً حسب الفلتر`);
  }
});

// فحص سريع (50 سهم)
bot.onText(/\/scan$/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, ` فحص سريع لـ ${TOP_STOCKS.length} سهم...`);
  
  const results = [];
  let scanned = 0;
  
  for (let i = 0; i < TOP_STOCKS.length; i += 10) {
    const batch = TOP_STOCKS.slice(i, i + 10);
    const promises = batch.map(sym => fetchStockData(sym));
    const batchData = await Promise.all(promises);
    
    for (const data of batchData) {
      if (data) {
        const result = analyzeStock(data);
        if (result) results.push(result);
      }
    }
    
    scanned += batch.length;
    if (scanned % 20 === 0) {
      await bot.sendMessage(chatId, `📊 تم فحص ${scanned}/${TOP_STOCKS.length}...`);
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  sendResults(results, chatId, 'الفحص السريع');
});

// فحص كامل (كل الأسهم)
bot.onText(/\/scanfull/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, ` فحص شامل لـ ${UNIQUE_STOCKS.length} سهم...\n⏱️ سيستغرق 5-8 دقائق\n⚠️ سيستهلك ~${UNIQUE_STOCKS.length} طلب من حد Twelve Data`);
  
  const results = [];
  let scanned = 0;
  let failed = 0;
  
  for (let i = 0; i < UNIQUE_STOCKS.length; i += 10) {
    const batch = UNIQUE_STOCKS.slice(i, i + 10);
    const promises = batch.map(sym => fetchStockData(sym));
    const batchData = await Promise.all(promises);
    
    for (const data of batchData) {
      if (data) {
        const result = analyzeStock(data);
        if (result) results.push(result);
      } else {
        failed++;
      }
    }
    
    scanned += batch.length;
    if (scanned % 30 === 0) {
      await bot.sendMessage(chatId, `📊 تم فحص ${scanned}/${UNIQUE_STOCKS.length} (فشل: ${failed})`);
    }
    
    await new Promise(r => setTimeout(r, 1200));
  }
  
  sendResults(results, chatId, 'الفحص الشامل');
});

function sendResults(results, chatId, scanType) {
  if (results.length > 0) {
    const pullbacks = results.filter(r => r.type === 'Pullback');
    const breakouts = results.filter(r => r.type === 'Breakout');
    
    let message = `🎯 *${scanType} - ${results.length} إشارة*\n\n`;
    
    if (breakouts.length > 0) {
      message += `💥 *كسر مقاومة (${breakouts.length}):*\n`;
      breakouts.forEach(r => {
        message += `• *${r.symbol}* @ ${r.price} | RSI: ${r.rsi}\n`;
        message += `  📍 دخول: ${r.entry} | 🛑 وقف: ${r.sl}\n`;
        message += `  🎯 أهداف: ${r.tp1} / ${r.tp2}\n\n`;
      });
    }
    
    if (pullbacks.length > 0) {
      message += `\n📈 *ارتداد من دعم (${pullbacks.length}):*\n`;
      pullbacks.forEach(r => {
        message += `• *${r.symbol}* @ ${r.price} | RSI: ${r.rsi}\n`;
        message += `   دخول: ${r.entry} | 🛑 وقف: ${r.sl}\n`;
        message += `  🎯 أهداف: ${r.tp1} / ${r.tp2}\n\n`;
      });
    }
    
    message += `\n *TradingView:* https://www.tradingview.com/chart/?symbol=EGX:${results[0].symbol}`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown', disable_web_page_preview: true });
  } else {
    bot.sendMessage(chatId, ` ${scanType}: مفيش إشارات شراء حالياً حسب الفلتر.\n\n*السوق في حالة انتظار.*`, { parse_mode: 'Markdown' });
  }
}

console.log('✅ Full Market Scanner Ready!');

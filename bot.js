const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

// ====== القائمة الشاملة لأسهم البورصة المصرية ======
const ALL_EGX_STOCKS = [
  // البنوك والخدمات المالية
  'COMI', 'CIB', 'EGBN', 'ABUK', 'ALEX', 'BKNS', 'CAIB', 'CIHB',
  'EBEK', 'EKBN', 'ESBE', 'NSGB', 'SAIB', 'THBK',
  
  // العقارات
  'TMGH', 'MNHD', 'SODIC', 'PHDC', 'OCDI', 'FWRY', 'HELI', 'LXIN',
  'MOPH', 'NILE', 'QALY', 'PALM', 'EKHO', 'EKZN', 'HOD', 'DOMT',
  
  // الاتصالات والتكنولوجيا
  'ETEL', 'SWDY', 'HRHO', 'ESRS', 'TELS', 'ITPAC',
  
  // الصناعة
  'EFID', 'EAST', 'ORWE', 'JUFO', 'ZMZA', 'KARO', 'ISPH', 'UNIP',
  'MKPH', 'EIPIC', 'RMDA', 'PHCI', 'APPC', 'SKPC', 'MCDR',
  
  // المواد الأساسية
  'INEG', 'LUTS', 'AGRI', 'CEMI', 'CHEM', 'CLHO', 'EGAS', 'ETRA',
  'FERT', 'GAS', 'GLBC', 'IRON', 'MINA', 'MNQC', 'PACK', 'PAPR',
  'PLAS', 'POLY', 'RUBR', 'SAND', 'SHMD', 'STLT', 'TEXT', 'TILE',
  'TIMB', 'AUTO', 'SPIN', 'EGTS', 'THMD', 'ALHE', 'HOTL', 'TOUR',
  
  // الطاقة والمرافق
  'ELEC', 'ENER', 'FINS', 'HOLD', 'INVS', 'LEAS', 'REIT', 'SUKN',
  
  // أسهم إضافية
  'AMOC', 'BIOP', 'ASLN', 'DWEE', 'CWPC', 'DOCT', 'EWBY'
];

console.log(`🚀 Full EGX Scanner Started! (${ALL_EGX_STOCKS.length} stocks)`);

// ====== دوال الحساب ======
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

async function scanSymbol(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.CA?range=3mo&interval=1d`;
    const { data } = await axios.get(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0' }, 
      timeout: 6000
    });
    
    const quotes = data.chart?.result?.[0]?.indicators?.quote?.[0];
    if (!quotes) return null;
    
    const closes = (quotes.close || []).filter(v => v != null);
    const highs = (quotes.high || []).filter(v => v != null);
    const volumes = (quotes.volume || []).filter(v => v != null);
    
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
    const atr = Math.max(0.5, close * 0.03); // ATR تقريبي
    
    const trendUp = close > ema50 && close > ema200;
    const nearSupport = Math.abs(close - ema20) / ema20 < 0.05;
    const rsiOK = rsi >= 40 && rsi <= 70;
    const volOK = vol > volAvg * 1.0;
    
    // نظام الارتداد
    if (trendUp && nearSupport && rsiOK && volOK) {
      return {
        symbol,
        price: close.toFixed(2),
        signal: '📈 ارتداد من دعم',
        type: 'Pullback',
        entry: close.toFixed(2),
        sl: (close - atr * 1.5).toFixed(2),
        tp1: (close + atr * 2.5).toFixed(2),
        rsi: rsi.toFixed(1)
      };
    }
    
    // نظام الكسر
    if (close > resistance && rsi >= 45 && rsi <= 75 && volOK) {
      return {
        symbol,
        price: close.toFixed(2),
        signal: '💥 كسر مقاومة',
        type: 'Breakout',
        entry: close.toFixed(2),
        sl: (close - atr * 1.5).toFixed(2),
        tp1: (close + atr * 2.5).toFixed(2),
        rsi: rsi.toFixed(1)
      };
    }
    
    return null;
    
  } catch (err) {
    return null;
  }
}

// ====== أوامر البوت ======

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    `🤖 *Hegazy Full Market Scanner*\n\n` +
    `📊 بفحص ${ALL_EGX_STOCKS.length} سهم من البورصة المصرية\n\n` +
    `الأوامر:\n` +
    `/scan - فحص السوق بالكامل\n` +
    `/scanfast - فحص سريع (أهم الأسهم)\n` +
    `/price SYMBOL - شارت السهم`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/scanfast/, async (msg) => {
  const chatId = msg.chat.id;
  const fastList = ['COMI', 'EFID', 'ETEL', 'HRHO', 'TMGH', 'MNHD', 'SODIC', 'PHDC', 'SWDY', 'EAST'];
  
  await bot.sendMessage(chatId, `⚡ فحص سريع لـ ${fastList.length} أسهم...`);
  
  const results = [];
  for (const sym of fastList) {
    const result = await scanSymbol(sym);
    if (result) results.push(result);
  }
  
  sendResults(results, chatId);
});

bot.onText(/\/scan/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, `🔍 جاري فحص ${ALL_EGX_STOCKS.length} سهم...\n⏱️ قد يستغرق 5-10 دقائق`);
  
  const results = [];
  let scanned = 0;
  
  // فحص الأسهم في مجموعات
  for (let i = 0; i < ALL_EGX_STOCKS.length; i += 5) {
    const batch = ALL_EGX_STOCKS.slice(i, i + 5);
    const promises = batch.map(sym => scanSymbol(sym));
    const batchResults = await Promise.all(promises);
    
    batchResults.forEach(r => { if (r) results.push(r); });
    scanned += batch.length;
    
    // تحديث كل 20 سهم
    if (scanned % 20 === 0) {
      await bot.sendMessage(chatId, `📊 تم فحص ${scanned}/${ALL_EGX_STOCKS.length}...`);
    }
    
    // تأخير عشان متبلوكش
    await new Promise(r => setTimeout(r, 2000));
  }
  
  sendResults(results, chatId);
});

function sendResults(results, chatId) {
  if (results.length > 0) {
    // تجميع النتائج في رسائل
    const pullbacks = results.filter(r => r.type === 'Pullback');
    const breakouts = results.filter(r => r.type === 'Breakout');
    
    let message = `🎯 *نتائج الفحص - ${results.length} إشارة*\n\n`;
    
    if (breakouts.length > 0) {
      message += `💥 *كسر مقاومة (${breakouts.length}):*\n`;
      breakouts.forEach(r => {
        message += `• *${r.symbol}* @ ${r.price} | RSI: ${r.rsi}\n`;
        message += `  دخول: ${r.entry} | وقف: ${r.sl}\n`;
        message += `  هدف: ${r.tp1}\n\n`;
      });
    }
    
    if (pullbacks.length > 0) {
      message += `\n📈 *ارتداد من دعم (${pullbacks.length}):*\n`;
      pullbacks.forEach(r => {
        message += `• *${r.symbol}* @ ${r.price} | RSI: ${r.rsi}\n`;
        message += `  دخول: ${r.entry} | وقف: ${r.sl}\n`;
        message += `  هدف: ${r.tp1}\n\n`;
      });
    }
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } else {
    bot.sendMessage(chatId, '⚪ مفيش إشارات شراء حالياً حسب الفلتر.\n\n*السوق في حالة انتظار.*', { parse_mode: 'Markdown' });
  }
}

bot.onText(/\/price (.+)/, (msg, match) => {
  const sym = match[1].toUpperCase();
  bot.sendMessage(msg.chat.id, 
    `📊 *${sym}*\n🔗 الشارت:\nhttps://www.tradingview.com/chart/?symbol=EGX:${sym}`,
    { parse_mode: 'Markdown' }
  );
});

console.log('✅ Full Market Scanner Ready!');

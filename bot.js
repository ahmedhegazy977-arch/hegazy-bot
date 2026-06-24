const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TOKEN;
const API_KEY = process.env.TWELVE_API_KEY; // هتضيفه في Railway
const bot = new TelegramBot(TOKEN, { polling: true });

// قائمة أسهم البورصة المصرية
const EGX_STOCKS = [
  'COMI', 'EFID', 'ETEL', 'HRHO', 'ESRS', 'SWDY', 'PHDC', 'TMGH',
  'SODIC', 'MNHD', 'INEG', 'LUTS', 'EAST', 'ORWE', 'EKHO', 'HELI',
  'OCDI', 'FWRY', 'UNIP', 'ISPH', 'AMOC', 'BIOP', 'ASLN', 'ABUK'
];

console.log(`🚀 Twelve Data Bot Started! (${EGX_STOCKS.length} stocks)`);

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
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}:EGX&interval=1day&outputsize=100&apikey=${API_KEY}`;
    const { data } = await axios.get(url, { timeout: 8000 });
    
    if (data.status === 'error' || !data.values) return null;
    
    // Twelve Data بيرجع البيانات من الأحدث للأقدم، لازم نعكسها
    const values = data.values.reverse();
    const closes = values.map(v => parseFloat(v.close));
    const highs = values.map(v => parseFloat(v.high));
    const lows = values.map(v => parseFloat(v.low));
    const volumes = values.map(v => parseInt(v.volume));
    
    return { closes, highs, lows, volumes, symbol: data.meta.symbol };
  } catch (err) {
    console.log(` Error fetching ${symbol}: ${err.message}`);
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
  
  // نظام الارتداد
  if (trendUp && nearSupport && rsiOK && volOK) {
    return {
      symbol: data.symbol,
      price: close.toFixed(2),
      signal: ' ارتداد من دعم',
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
      symbol: data.symbol,
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
}

// ====== أوامر البوت ======

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    `🤖 *Hegazy Scanner (Twelve Data)*\n\n` +
    `✅ بيانات رسمية من البورصة المصرية\n\n` +
    `الأوامر:\n` +
    `/scan - فحص ${EGX_STOCKS.length} سهم\n` +
    `/price SYMBOL - سعر سهم معين\n` +
    `/list - قائمة الأسهم`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/list/, (msg) => {
  bot.sendMessage(msg.chat.id, `📊 الأسهم المتاحة:\n${EGX_STOCKS.join(', ')}`);
});

bot.onText(/\/price (.+)/, async (msg, match) => {
  const symbol = match[1].toUpperCase();
  const chatId = msg.chat.id;
  
  await bot.sendMessage(chatId, `⏳ جاري جلب ${symbol}...`);
  
  const data = await fetchStockData(symbol);
  if (!data) {
    return bot.sendMessage(chatId, `❌ لم يتم العثور على ${symbol}`);
  }
  
  const result = analyzeStock(data);
  if (result) {
    const text = `📊 *${result.symbol}*\n💰 السعر: ${result.price}\n🎯 ${result.signal}\n دخول: ${result.entry}\n وقف: ${result.sl}\n🎯 هدف: ${result.tp1}\n📈 RSI: ${result.rsi}`;
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } else {
    bot.sendMessage(chatId, `📊 *${symbol}*\n💰 السعر: ${data.closes[data.closes.length-1].toFixed(2)}\n⚪ لا توجد إشارة حالياً`);
  }
});

bot.onText(/\/scan/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, ` جاري فحص ${EGX_STOCKS.length} سهم...\n⏱️ 2-3 دقائق`);
  
  const results = [];
  let scanned = 0;
  
  for (let i = 0; i < EGX_STOCKS.length; i += 5) {
    const batch = EGX_STOCKS.slice(i, i + 5);
    const promises = batch.map(sym => fetchStockData(sym));
    const batchData = await Promise.all(promises);
    
    for (const data of batchData) {
      if (data) {
        const result = analyzeStock(data);
        if (result) results.push(result);
      }
    }
    
    scanned += batch.length;
    if (scanned % 10 === 0) {
      await bot.sendMessage(chatId, ` تم فحص ${scanned}/${EGX_STOCKS.length}...`);
    }
    
    await new Promise(r => setTimeout(r, 1500));
  }
  
  if (results.length > 0) {
    let message = ` *وجدت ${results.length} إشارة*\n\n`;
    results.forEach(r => {
      message += `💎 *${r.symbol}*: ${r.signal}\n`;
      message += `💰 ${r.price} | RSI: ${r.rsi}\n`;
      message += `📍 دخول: ${r.entry} | وقف: ${r.sl}\n`;
      message += `🎯 هدف: ${r.tp1}\n\n`;
    });
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } else {
    bot.sendMessage(chatId, '⚪ مفيش إشارات شراء حالياً');
  }
});

console.log('✅ Bot ready!');

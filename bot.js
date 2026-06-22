const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

// قائمة أصغر عشان السرعة
const STOCKS = ['COMI', 'EFID', 'ETEL', 'HRHO', 'ESRS', 'SWDY', 'PHDC', 'TMGH'];

console.log('🚀 Fast Scanner Started!');

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
      timeout: 8000  // مهم جداً
    });
    
    const quotes = data.chart?.result?.[0]?.indicators?.quote?.[0];
    if (!quotes) return null;
    
    const closes = (quotes.close || []).filter(v => v != null);
    const highs = (quotes.high || []).filter(v => v != null);
    const lows = (quotes.low || []).filter(v => v != null);
    const volumes = (quotes.volume || []).filter(v => v != null);
    
    if (closes.length < 50) return null;
    
    const close = closes[closes.length - 1];
    const vol = volumes[volumes.length - 1];
    const volAvg = volumes.slice(-20).reduce((a,b) => a+b, 0) / 20; // ✅ تصحيح الخطأ
    
    const ema20 = calcEMA(closes, 20);
    const ema50 = calcEMA(closes, 50);
    const ema200 = calcEMA(closes, 200);
    const rsi = calcRSI(closes);
    
    if (!ema20 || !ema50 || !ema200 || !rsi) return null;
    
    const resistance = Math.max(...highs.slice(-20));
    const atr = 3; // تبسيط
    
    // الفلاتر البسيطة
    const trendUp = close > ema50 && close > ema200;
    const nearSupport = Math.abs(close - ema20) / ema20 < 0.05;
    const rsiOK = rsi >= 40 && rsi <= 70;
    const volOK = vol > volAvg * 1.0;
    
    if (trendUp && nearSupport && rsiOK && volOK) {
      return {
        symbol,
        price: close.toFixed(2),
        signal: `شراء عند الارتداد (RSI: ${rsi.toFixed(1)})`,
        entry: close.toFixed(2),
        sl: (close - atr * 1.5).toFixed(2),
        tp1: (close + atr * 2.5).toFixed(2)
      };
    }
    
    if (close > resistance && rsi >= 45 && rsi <= 75 && volOK) {
      return {
        symbol,
        price: close.toFixed(2),
        signal: `💥 كسر مقاومة`,
        entry: close.toFixed(2),
        sl: (close - atr * 1.5).toFixed(2),
        tp1: (close + atr * 2.5).toFixed(2)
      };
    }
    
    return null;
    
  } catch (err) {
    console.log(`❌ Error scanning ${symbol}: ${err.message}`);
    return null;
  }
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '🤖 Hegazy Scanner\n\n/scan - فحص السوق\n/price SYMBOL - شارت السهم');
});

bot.onText(/\/scan/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, '⏳ جاري الفحص... (دقيقة واحدة)');
  
  const results = [];
  
  for (let i = 0; i < STOCKS.length; i++) {
    const sym = STOCKS[i];
    await bot.sendMessage(chatId, `🔍 أفحص ${sym}... (${i+1}/${STOCKS.length})`);
    
    const result = await scanSymbol(sym);
    if (result) results.push(result);
    
    // تأخير بسيط
    await new Promise(r => setTimeout(r, 1000));
  }
  
  if (results.length > 0) {
    let text = `🎯 *وجدت ${results.length} إشارة:*\n\n`;
    results.forEach(r => {
      text += `💎 *${r.symbol}*: ${r.signal}\n`;
      text += `💰 السعر: ${r.price}\n`;
      text += `📍 الدخول: ${r.entry} | وقف: ${r.sl}\n`;
      text += `🎯 الهدف: ${r.tp1}\n\n`;
    });
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } else {
    bot.sendMessage(chatId, '⚪ مفيش إشارات شراء حالياً حسب الفلتر.');
  }
});

bot.onText(/\/price (.+)/, (msg, match) => {
  const sym = match[1].toUpperCase();
  bot.sendMessage(msg.chat.id, `📊 ${sym}:\nhttps://www.tradingview.com/chart/?symbol=EGX:${sym}`);
});

console.log('✅ Bot ready!');

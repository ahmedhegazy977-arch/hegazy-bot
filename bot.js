const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// استخدم polling (أبسط من webhook)
const bot = new TelegramBot(TOKEN, { polling: true });

// 10 أسهم بس للتجربة
const TEST_STOCKS = ['COMI', 'EFID', 'ETEL', 'HRHO', 'TMGH'];

console.log('🚀 Bot started!');

// أمر /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '✅ البوت شغال!\n\nجرب: /test');
});

// أمر /test - فحص سهم واحد بس
bot.onText(/\/test/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '🔍 بفحص COMI...');
  
  try {
    const result = await getStockData('COMI');
    if (result) {
      await bot.sendMessage(msg.chat.id, 
        `✅ نجح!\n\nالسعر: ${result.price}\nRSI: ${result.rsi}\nEMA20: ${result.ema20}`
      );
    } else {
      await bot.sendMessage(msg.chat.id, '❌ مفيش بيانات');
    }
  } catch (e) {
    await bot.sendMessage(msg.chat.id, `❌ Error: ${e.message}`);
  }
});

// أمر /scan - فحص 5 أسهم
bot.onText(/\/scan/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '🔍 بفحص 5 أسهم...');
  
  for (const symbol of TEST_STOCKS) {
    try {
      const result = await getStockData(symbol);
      if (result) {
        await bot.sendMessage(msg.chat.id, 
          `🎯 ${symbol}\nالسعر: ${result.price}\nRSI: ${result.rsi.toFixed(1)}`
        );
      }
      await new Promise(r => setTimeout(r, 1000)); // انتظر ثانية
    } catch (e) {
      console.log(`Error ${symbol}: ${e.message}`);
    }
  }
  
  await bot.sendMessage(msg.chat.id, '✅ خلصنا!');
});

// دالة جلب البيانات
async function getStockData(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.CA?range=3mo&interval=1d`;
    const resp = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });
    
    if (!resp.data.chart?.result?.[0]) return null;
    
    const result = resp.data.chart.result[0];
    const quotes = result.indicators.quote[0];
    
    const closes = quotes.close.filter(v => v !== null);
    const highs = quotes.high.filter(v => v !== null);
    const lows = quotes.low.filter(v => v !== null);
    
    if (closes.length < 20) return null;
    
    const close = closes[closes.length - 1];
    const ema20 = calcEMA(closes, 20);
    const rsi = calcRSI(closes);
    
    return { price: close.toFixed(2), rsi, ema20: ema20?.toFixed(2) };
    
  } catch (e) {
    console.error(`Error: ${e.message}`);
    return null;
  }
}

// حساب EMA
function calcEMA(data, period) {
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * k + ema;
  }
  return ema;
}

// حساب RSI
function calcRSI(closes) {
  if (closes.length < 15) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= 14; i++) {
    const ch = closes[i] - closes[i-1];
    ch > 0 ? gains += ch : losses -= ch;
  }
  let avgGain = gains / 14, avgLoss = losses / 14;
  for (let i = 15; i < closes.length; i++) {
    const ch = closes[i] - closes[i-1];
    if (ch > 0) {
      avgGain = (avgGain * 13 + ch) / 14;
      avgLoss = (avgLoss * 13) / 14;
    } else {
      avgGain = (avgGain * 13) / 14;
      avgLoss = (avgLoss * 13 - ch) / 14;
    }
  }
  return avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
}

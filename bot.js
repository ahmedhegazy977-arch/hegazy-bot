const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TWELVE_API_KEY = process.env.TWELVE_API_KEY;

const bot = new TelegramBot(TOKEN, { polling: true });

// 5 أسهم بس للتجربة
const TEST_STOCKS = ['COMI', 'EFID', 'ETEL', 'HRHO', 'TMGH'];

console.log('🚀 Bot started!');

// ====== جلب البيانات ======

async function getStockData(symbol) {
  try {
    console.log(`📡 Fetching ${symbol}...`);
    
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}.CA&interval=1day&outputsize=60&apikey=${TWELVE_API_KEY}`;
    
    const resp = await axios.get(url, { 
      timeout: 15000, // 15 ثانية
      headers: { 'Accept': 'application/json' }
    });
    
    console.log(`✅ ${symbol} response received`);
    
    if (resp.data.status === 'error') {
      console.log(`❌ ${symbol} API error: ${resp.data.message}`);
      return null;
    }
    
    const values = resp.data.values;
    if (!values || values.length < 30) {
      console.log(`❌ ${symbol} not enough data: ${values?.length || 0}`);
      return null;
    }
    
    // values are newest first, reverse them
    const closes = values.map(v => parseFloat(v.close)).reverse();
    const highs = values.map(v => parseFloat(v.high)).reverse();
    const lows = values.map(v => parseFloat(v.low)).reverse();
    const volumes = values.map(v => parseInt(v.volume) || 0).reverse();
    
    console.log(`✅ ${symbol}: ${closes.length} bars`);
    
    return { closes, highs, lows, volumes };
    
  } catch (e) {
    console.error(`❌ ${symbol} error: ${e.message}`);
    return null;
  }
}

// ====== حسابات بسيطة ======

function calcEMA(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * k + ema;
  }
  return ema;
}

function calcRSI(closes) {
  if (closes.length < 15) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= 14; i++) {
    const ch = closes[i] - closes[i - 1];
    ch > 0 ? gains += ch : losses -= ch;
  }
  let avgGain = gains / 14, avgLoss = losses / 14;
  for (let i = 15; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
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

// ====== تحليل بسيط ======

async function analyzeStock(symbol) {
  const data = await getStockData(symbol);
  if (!data) return null;
  
  const { closes, volumes } = data;
  const close = closes[closes.length - 1];
  
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const rsi = calcRSI(closes);
  const volAvg = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  
  if (!ema20 || !ema50 || !rsi) return null;
  
  // نظام بسيط: ارتداد من EMA20
  const nearSupport = Math.abs(close - ema20) / ema20 < 0.05;
  const trendUp = close > ema50;
  const volOK = volumes[volumes.length - 1] > volAvg * 0.8;
  
  if (trendUp && nearSupport && rsi >= 40 && rsi <= 70 && volOK) {
    return {
      symbol,
      price: close,
      signal: 'شراء عند الارتداد',
      rsi: rsi.toFixed(1),
      ema20: ema20.toFixed(2)
    };
  }
  
  return null;
}

// ====== أوامر البوت ======

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '✅ البوت شغال!\n\nجرب: /test');
});

// أمر /test - فحص سهم واحد
bot.onText(/\/test/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '🔍 بفحص COMI...');
  
  const result = await analyzeStock('COMI');
  
  if (result) {
    await bot.sendMessage(msg.chat.id, 
      `✅ نجح!\n\n` +
      `السهم: ${result.symbol}\n` +
      `السعر: ${result.price.toFixed(2)}\n` +
      `الإشارة: ${result.signal}\n` +
      `RSI: ${result.rsi}\n` +
      `EMA20: ${result.ema20}`
    );
  } else {
    await bot.sendMessage(msg.chat.id, '⚪ مفيش إشارة لـ COMI');
  }
});

// أمر /scan - فحص 5 أسهم
bot.onText(/\/scan/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '🔍 بفحص 5 أسهم...');
  
  let found = 0;
  
  for (const symbol of TEST_STOCKS) {
    try {
      const result = await analyzeStock(symbol);
      
      if (result) {
        await bot.sendMessage(msg.chat.id, 
          `🎯 ${result.symbol}\n` +
          `السعر: ${result.price.toFixed(2)}\n` +
          `الإشارة: ${result.signal}\n` +
          `RSI: ${result.rsi}`
        );
        found++;
      }
      
      // انتظر ثانية بين كل سهم
      await new Promise(r => setTimeout(r, 1000));
      
    } catch (e) {
      console.error(`Error ${symbol}: ${e.message}`);
    }
  }
  
  await bot.sendMessage(msg.chat.id, `✅ خلصنا! ${found} إشارة`);
});

// أمر /check - تأكد Twelve Data شغال
bot.onText(/\/check/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '🔍 بفحص الاتصال بـ Twelve Data...');
  
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=COMI.CA&interval=1day&outputsize=5&apikey=${TWELVE_API_KEY}`;
    const resp = await axios.get(url, { timeout: 10000 });
    
    if (resp.data.status === 'error') {
      await bot.sendMessage(msg.chat.id, `❌ خطأ: ${resp.data.message}`);
    } else if (resp.data.values) {
      await bot.sendMessage(msg.chat.id, `✅ Twelve Data شغال!\n\nآخر سعر لـ COMI: ${resp.data.values[0].close}`);
    } else {
      await bot.sendMessage(msg.chat.id, '❌ رد غريب من API');
    }
    
  } catch (e) {
    await bot.sendMessage(msg.chat.id, `❌ مشكلة في الاتصال: ${e.message}`);
  }
});

console.log('✅ Ready! Try /start then /check');

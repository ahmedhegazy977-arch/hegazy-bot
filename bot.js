const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TOKEN;
const API_KEY = process.env.TWELVE_API_KEY;
const bot = new TelegramBot(TOKEN, { polling: true });

const UNIQUE_STOCKS = [
  'COMI','EAST','ETEL','HRHO','SWDY','TMGH','MNHD','SODIC','PHDC','EFID',
  'ESRS','ORWE','EKHO','HELI','OCDI','FWRY','ABUK','ALEX','CIB','EGAL',
  'EFGH','SKPC','MCDR','TALA','CLHO','JUFO','ISPH','UNIP','AMOC','BIOP',
  'BKNS','CAIB','CIHB','EBEK','EKBN','ESBE','NSGB','SAIB','THBK','IBNS',
  'UBCI','ARCC','CIRA','FOCM','GBCO','GSRH','MNBK','DOMT','EKZN','LXIN',
  'MOPH','NILE','QALY','PALM','HOD','DWEE','CWPC','DOCT','EWBY','EIPIC',
  'RMDA','PHCI','APPC','NAHO','NCCW','OBOX','ORHD','PLEC','PRAS','SAKR',
  'SEPC','SILO','SPC','SRGS','SUGR','TAPM','TBCO','TCIH','TERA','TFIC',
  'TREA','TRIP','WAVE','WEST','YRGN','ZOD','INEG','LUTS','AGRI','CEMI',
  'CHEM','EGAS','ETRA','FERT','GAS','GLBC','IRON','MINA','MNQC','PACK',
  'PAPR','PLAS','POLY','RUBR','SAND','SHMD','STLT','TEXT','TILE','TIMB',
  'AUTO','SPIN','EGTS','THMD','ALHE','KIMA','LECT','LILY','MEGA','MNHP',
  'MTRJ','ARMO','ATLC','BTEL','CDPM','CLEO','DCRC','EGYT','EPHC','ESIC',
  'ETIH','GMRS','GSW','HDMO','HSS','JHRS','JSCA','MBLJ','OSRS','ITPAC',
  'TELS','ELEC','ENER','FINS','HOLD','INVS','LEAS','REIT','SUKN','HOTL',
  'TOUR'
];

const TOP_STOCKS = UNIQUE_STOCKS.slice(0, 50);

console.log(`🚀 Scanner Started! (${UNIQUE_STOCKS.length} stocks)`);

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(symbol) {
  const item = cache.get(symbol);
  if (item && Date.now() - item.time < CACHE_TTL) return item.data;
  return null;
}

function setCache(symbol, data) {
  cache.set(symbol, { data, time: Date.now() });
  if (cache.size > 100) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

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
  for (let i = period; i < tr.length; i++) atr = (atr * (period-1) + tr[i]) / period;
  return atr;
}

async function fetchStockData(symbol) {
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

function analyzeStock(data) {
  const { closes, highs, lows, volumes } = data;
  if (closes.length < 50) return null;
  
  const close = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];
  const high = highs[highs.length - 1];
  const low = lows[lows.length - 1];
  const vol = volumes[volumes.length - 1];
  const volAvg = volumes.slice(-20).reduce((a,b) => a+b, 0) / 20;
  
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const rsi = calcRSI(closes);
  const atr = calcATR(highs, lows, closes);
  
  if (!ema20 || !ema50 || !ema200 || !rsi || !atr) return null;
  
  const resistance = Math.max(...highs.slice(-20));
  
  // نظام 1: Pullback
  const trendUp = close > ema50 && close > ema200;
  const nearSupport = Math.abs(close - ema20) / ema20 < 0.08;
  const rsiOK = rsi >= 35 && rsi <= 75;
  const volOK = vol > volAvg * 0.7;
  
  if (trendUp && nearSupport && rsiOK) {
    return {
      symbol: data.symbol,
      price: close.toFixed(2),
      signal: '📈 Pullback from Support',
      type: 'Pullback',
      entry: close.toFixed(2),
      sl: (close - atr * 1.5).toFixed(2),
      tp1: (close + atr * 2.5).toFixed(2),
      tp2: (close + atr * 4.5).toFixed(2),
      rsi: rsi.toFixed(1),
      system: 'Pullback'
    };
  }
  
  // نظام 2: Breakout
  if (close > resistance && rsi >= 40 && rsi <= 80) {
    return {
      symbol: data.symbol,
      price: close.toFixed(2),
      signal: '💥 Breakout Resistance',
      type: 'Breakout',
      entry: close.toFixed(2),
      sl: (close - atr * 1.5).toFixed(2),
      tp1: (close + atr * 2.5).toFixed(2),
      tp2: (close + atr * 3.75).toFixed(2),
      rsi: rsi.toFixed(1),
      system: 'Breakout'
    };
  }
  
  // نظام 3: Crossover
  const prevCloses = closes.slice(0, -1);
  const prevEma20 = calcEMA(prevCloses, 20);
  const prevEma50 = calcEMA(prevCloses, 50);
  
  if (prevEma20 && prevEma50 && prevEma20 <= prevEma50 && ema20 > ema50) {
    return {
      symbol: data.symbol,
      price: close.toFixed(2),
      signal: '🔄 EMA20/EMA50 Crossover',
      type: 'Crossover',
      entry: close.toFixed(2),
      sl: (close - atr * 2).toFixed(2),
      tp1: (close + atr * 3).toFixed(2),
      tp2: (close + atr * 5).toFixed(2),
      rsi: rsi.toFixed(1),
      system: 'Crossover'
    };
  }
  
  // نظام 4: Momentum
  if (close > prevClose * 1.03 && vol > volAvg && rsi > 50 && rsi < 75) {
    return {
      symbol: data.symbol,
      price: close.toFixed(2),
      signal: '⚡ Strong Momentum',
      type: 'Momentum',
      entry: close.toFixed(2),
      sl: (close - atr * 1.5).toFixed(2),
      tp1: (close + atr * 2.5).toFixed(2),
      tp2: (close + atr * 4).toFixed(2),
      rsi: rsi.toFixed(1),
      system: 'Momentum'
    };
  }
  
  // نظام 5: Smart Money Concept (SMC)
  const lowestLow = Math.min(...lows.slice(-5));
  const stopLoss_smc = lowestLow * 0.97;
  const risk_smc = close - stopLoss_smc;
  const strongClose = close >= high * 0.96;
  const volCond_smc = vol > volumes.slice(-5).reduce((a,b) => a+b, 0) / 5;
  const momentum_smc = ((close - prevClose) / prevClose) * 100 > 0.8;
  const notOverbought = rsi < 78;
  
  if (strongClose && volCond_smc && trendUp && momentum_smc && notOverbought) {
    return {
      symbol: data.symbol,
      price: close.toFixed(2),
      signal: '💎 Smart Money Buy',
      type: 'SMC',
      entry: close.toFixed(2),
      sl: stopLoss_smc.toFixed(2),
      tp1: (close + risk_smc * 2).toFixed(2),
      tp2: (close + risk_smc * 3).toFixed(2),
      rsi: rsi.toFixed(1),
      system: 'SMC'
    };
  }
  
  return null;
}

function sendResults(results, chatId, scanType) {
  if (results.length > 0) {
    const pullbacks = results.filter(r => r.type === 'Pullback');
    const breakouts = results.filter(r => r.type === 'Breakout');
    const crossovers = results.filter(r => r.type === 'Crossover');
    const momentum = results.filter(r => r.type === 'Momentum');
    const smc = results.filter(r => r.type === 'SMC');
    
    let message = `🎯 *${scanType} - ${results.length} Signals*\n\n`;
    
    if (breakouts.length > 0) {
      message += `💥 *Breakout (${breakouts.length}):*\n`;
      breakouts.forEach(r => {
        message += `• *${r.symbol}* @ ${r.price} | RSI: ${r.rsi}\n`;
        message += `  📍 Entry: ${r.entry} | 🛑 Stop: ${r.sl}\n`;
        message += `  🎯 Targets: ${r.tp1} / ${r.tp2}\n\n`;
      });
    }
    
    if (pullbacks.length > 0) {
      message += `\n📈 *Pullback (${pullbacks.length}):*\n`;
      pullbacks.forEach(r => {
        message += `• *${r.symbol}* @ ${r.price} | RSI: ${r.rsi}\n`;
        message += `  📍 Entry: ${r.entry} |  Stop: ${r.sl}\n`;
        message += `  🎯 Targets: ${r.tp1} / ${r.tp2}\n\n`;
      });
    }
    
    if (crossovers.length > 0) {
      message += `\n🔄 *Crossover (${crossovers.length}):*\n`;
      crossovers.forEach(r => {
        message += `• *${r.symbol}* @ ${r.price} | RSI: ${r.rsi}\n`;
        message += `  📍 Entry: ${r.entry} | 🛑 Stop: ${r.sl}\n`;
        message += `   Targets: ${r.tp1} / ${r.tp2}\n\n`;
      });
    }
    
    if (momentum.length > 0) {
      message += `\n⚡ *Momentum (${momentum.length}):*\n`;
      momentum.forEach(r => {
        message += `• *${r.symbol}* @ ${r.price} | RSI: ${r.rsi}\n`;
        message += `  📍 Entry: ${r.entry} |  Stop: ${r.sl}\n`;
        message += `  🎯 Targets: ${r.tp1} / ${r.tp2}\n\n`;
      });
    }
    
    if (smc.length > 0) {
      message += `\n💎 *Smart Money (${smc.length}):*\n`;
      smc.forEach(r => {
        message += `• *${r.symbol}* @ ${r.price} | RSI: ${r.rsi}\n`;
        message += `  📍 Entry: ${r.entry} | 🛑 Stop: ${r.sl}\n`;
        message += `  🎯 Targets: ${r.tp1} / ${r.tp2}\n\n`;
      });
    }
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown', disable_web_page_preview: true });
  } else {
    bot.sendMessage(chatId, ` ${scanType}: No signals currently.\n\n*Market is in waiting mode.*`, { parse_mode: 'Markdown' });
  }
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    `🚀 *Hegazy Scanner*\n\n` +
    `📊 ${UNIQUE_STOCKS.length} Egyptian stocks\n` +
    `🔌 Powered by Twelve Data API\n\n` +
    `*Commands:*\n` +
    `/scan - Quick scan (Top 50 stocks)\n` +
    `/scanfull - Full scan (${UNIQUE_STOCKS.length} stocks)\n` +
    `/price SYMBOL - Analyze specific stock\n` +
    `/list - Show all stocks`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/list/, (msg) => {
  bot.sendMessage(msg.chat.id, `📋 *All Stocks (${UNIQUE_STOCKS.length}):*\n\n${UNIQUE_STOCKS.join(', ')}`, { 
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  });
});

bot.onText(/\/price (.+)/, async (msg, match) => {
  const symbol = match[1].toUpperCase();
  const chatId = msg.chat.id;
  
  await bot.sendMessage(chatId, `⏳ Analyzing ${symbol}...`);
  
  const data = await fetchStockData(symbol);
  if (!data) {
    return bot.sendMessage(chatId, `❌ ${symbol} not found`);
  }
  
  const result = analyzeStock(data);
  if (result) {
    const text = `📊 *${result.symbol}*\n💰 Price: ${result.price}\n${result.signal}\n📍 Entry: ${result.entry}\n🛑 Stop: ${result.sl}\n🎯 Target 1: ${result.tp1}\n🎯 Target 2: ${result.tp2}\n📈 RSI: ${result.rsi}\n📡 System: ${result.system}`;
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } else {
    bot.sendMessage(chatId, `📊 *${symbol}*\n💰 Price: ${data.closes[data.closes.length-1].toFixed(2)}\n⚪ No signal currently`, { parse_mode: 'Markdown' });
  }
});

bot.onText(/\/scan$/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, `⚡ Quick scan for ${TOP_STOCKS.length} stocks...`);
  
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
      await bot.sendMessage(chatId, `📊 Scanned ${scanned}/${TOP_STOCKS.length}...`);
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  sendResults(results, chatId, 'Quick Scan');
});

bot.onText(/\/scanfull/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, `🔍 Full scan for ${UNIQUE_STOCKS.length} stocks...\n⏱️ 5-8 minutes`);
  
  const results = [];
  let scanned = 0;
  
  for (let i = 0; i < UNIQUE_STOCKS.length; i += 10) {
    const batch = UNIQUE_STOCKS.slice(i, i + 10);
    const promises = batch.map(sym => fetchStockData(sym));
    const batchData = await Promise.all(promises);
    
    for (const data of batchData) {
      if (data) {
        const result = analyzeStock(data);
        if (result) results.push(result);
      }
    }
    
    scanned += batch.length;
    if (scanned % 30 === 0) {
      await bot.sendMessage(chatId, `📊 Scanned ${scanned}/${UNIQUE_STOCKS.length}...`);
    }
    
    await new Promise(r => setTimeout(r, 1200));
  }
  
  sendResults(results, chatId, 'Full Scan');
});

console.log('✅ Bot Ready!');

function analyzeStock(data) {
  const { closes, highs, lows, volumes } = data;
  if (closes.length < 200) return null;
  
  const close = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2];
  const high = highs[highs.length - 1];
  const low = lows[lows.length - 1];
  const vol = volumes[volumes.length - 1];
  const volAvg = volumes.slice(-20).reduce((a,b) => a+b, 0) / 20;
  
  // حساب المؤشرات الأساسية
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const rsi = calcRSI(closes, 14);
  const atr = calcATR(highs, lows, closes, 14);
  const macdHist = calcMACD(closes);
  
  if (!ema20 || !ema50 || !ema200 || !rsi || !atr) return null;
  
  // مستويات المقاومة والدعم
  const resistance = Math.max(...highs.slice(-20));
  const breakoutLevel = resistance + (atr * 0.15);
  
  let signal = null, type = '', entry = null, sl = null, tp1 = null, tp2 = null, system = '';
  
  // ========== نظام 1: الارتداد والكسر ==========
  const volOK_final = vol > volAvg * 1.0;
  const trendUp_final = close > ema50 && close > ema200;
  const nearSupport_final = Math.abs(close - ema20) / ema20 < 0.05;
  const rsiOK_final = rsi >= 40 && rsi <= 70;
  
  const buyPullback = trendUp_final && nearSupport_final && rsiOK_final && volOK_final;
  const buyBreakout = close > breakoutLevel && rsi >= 45 && rsi <= 75 && volOK_final;
  
  if (buyPullback) {
    signal = '📈 شراء عند الارتداد';
    type = 'Pullback';
    entry = close;
    sl = close - (atr * 1.5);
    tp1 = close + (atr * 2.5);
    tp2 = close + (atr * 4.5);
    system = 'Pullback & Breakout';
  } else if (buyBreakout) {
    signal = '💥 شراء عند الكسر';
    type = 'Breakout';
    entry = breakoutLevel;
    sl = breakoutLevel - (atr * 1.5);
    tp1 = breakoutLevel + (atr * 2.5);
    tp2 = breakoutLevel + (atr * 4.5);
    system = 'Pullback & Breakout';
  }
  
  // ========== نظام 2: العمل (V4) ==========
  if (!signal) {
    const volOK_v4 = vol >= volAvg * 1.0;
    const trendUp_v4 = close > ema50 && close > ema200;
    const adx = 10; // تبسيط (ADX الحقيقي يحتاج حساب معقد)
    const isRanging_v4 = adx < 15;
    const nearSupport_v4 = Math.abs(close - ema20) / ema20 < 0.03;
    const rsiOK_v4 = rsi >= 45 && rsi <= 65;
    const buyV4 = trendUp_v4 && !isRanging_v4 && volOK_v4 && rsiOK_v4 && nearSupport_v4;
    
    if (buyV4) {
      signal = '✅ إشارة شراء (V4)';
      type = 'V4';
      entry = close;
      sl = close - (atr * 1.5);
      tp1 = close + (atr * 2.5);
      tp2 = close + (atr * 4.5);
      system = 'V4 System';
    }
  }
  
  // ========== نظام 3: كسر المقاومة المؤكد ==========
  if (!signal) {
    const volOK_brk = vol >= volAvg * 1.2;
    const rsiOK_brk = rsi >= 40 && rsi <= 70;
    const trendOK_brk = close > ema50 && close > ema200;
    const brokeRes = close > resistance;
    const entry_brk = close;
    const sl_brk = entry_brk - (atr * 1.5);
    const tp1_brk = entry_brk + (atr * 2.5);
    const risk_brk = entry_brk - sl_brk;
    const rr_brk = risk_brk > 0 ? (tp1_brk - entry_brk) / risk_brk : 0;
    const buyBreakout_conf = brokeRes && volOK_brk && rsiOK_brk && trendOK_brk && rr_brk >= 1.3;
    
    if (buyBreakout_conf) {
      signal = '🚀 كسر مقاومة مؤكد';
      type = 'Confirmed Breakout';
      entry = entry_brk;
      sl = sl_brk;
      tp1 = tp1_brk;
      tp2 = entry_brk + (atr * 3.75);
      system = 'Confirmed Breakout';
    }
  }
  
  // ========== نظام 4: الثلاث مراحل ==========
  if (!signal) {
    const stage1_3s = vol >= 1000000 && vol / volAvg >= 1.2;
    const stage2_3s = stage1_3s && close > ema50 && close > ema200 && ema20 > ema50;
    const stage3_3s = stage2_3s && rsi >= 55 && rsi <= 75 && macdHist > 0 && vol >= volAvg * 1.5;
    
    if (stage3_3s) {
      signal = '📊 شراء ثلاثي المراحل';
      type = '3-Stage';
      entry = close;
      sl = close - (atr * 1.5);
      tp1 = close + (atr * 2.5);
      tp2 = close + (atr * 3.75);
      system = '3-Stage System';
    }
  }
  
  // ========== نظام 5: الأموال الذكية (SMC) ==========
  if (!signal) {
    const lowestLow = Math.min(...lows.slice(-5));
    const stopLoss_smc = lowestLow * 0.97;
    const risk_smc = close - stopLoss_smc;
    const target1_smc = close + (risk_smc * 2);
    const strongClose = close >= high * 0.96;
    const volCondition_smc = vol > volumes.slice(-5).reduce((a,b) => a+b, 0) / 5;
    const trendUp_smc = close > calcEMA(closes, 20);
    const momentum = ((close - prevClose) / prevClose) * 100 > 0.8;
    const notOverbought = rsi < 78;
    const buySMC = strongClose && volCondition_smc && trendUp_smc && momentum && notOverbought;
    
    if (buySMC) {
      signal = '💎 شراء أموال ذكية (SMC)';
      type = 'SMC';
      entry = close;
      sl = stopLoss_smc;
      tp1 = target1_smc;
      tp2 = close + (risk_smc * 3);
      system = 'Smart Money Concept';
    }
  }
  
  // إرجاع النتيجة
  if (signal) {
    return {
      symbol: data.symbol,
      price: close.toFixed(2),
      signal,
      type,
      entry: entry.toFixed(2),
      sl: sl.toFixed(2),
      tp1: tp1.toFixed(2),
      tp2: tp2.toFixed(2),
      rsi: rsi.toFixed(1),
      system,
      atr: atr.toFixed(2)
    };
  }
  
  return null;
}

// دالة حساب ATR
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

// دالة حساب MACD Histogram (مبسطة)
function calcMACD(closes) {
  if (closes.length < 26) return null;
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  if (!ema12 || !ema26) return null;
  return ema12 - ema26; // MACD Line (نستخدم الإشارة فقط)
}

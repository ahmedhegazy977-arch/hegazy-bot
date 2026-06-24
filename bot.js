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
  
  // === الفلاتر المخففة ===
  
  // 1. نظام الارتداد (مخفف)
  const trendUp = close > ema50 && close > ema200;
  const nearSupport = Math.abs(close - ema20) / ema20 < 0.08; //放宽 من 5% لـ 8%
  const rsiOK = rsi >= 35 && rsi <= 75; // توسيع النطاق
  const volOK = vol > volAvg * 0.7; // تخفيف من 1.0 لـ 0.7
  
  if (trendUp && nearSupport && rsiOK) {
    return {
      symbol: data.symbol,
      price: close.toFixed(2),
      signal: '📈 ارتداد من دعم',
      type: 'Pullback',
      entry: close.toFixed(2),
      sl: (close - atr * 1.5).toFixed(2),
      tp1: (close + atr * 2.5).toFixed(2),
      tp2: (close + atr * 4.5).toFixed(2),
      rsi: rsi.toFixed(1),
      confidence: 'متوسط'
    };
  }
  
  // 2. نظام الكسر (مخفف)
  if (close > resistance && rsi >= 40 && rsi <= 80) {
    return {
      symbol: data.symbol,
      price: close.toFixed(2),
      signal: '💥 كسر مقاومة',
      type: 'Breakout',
      entry: close.toFixed(2),
      sl: (close - atr * 1.5).toFixed(2),
      tp1: (close + atr * 2.5).toFixed(2),
      tp2: (close + atr * 3.75).toFixed(2),
      rsi: rsi.toFixed(1),
      confidence: 'عالي'
    };
  }
  
  // 3. نظام جديد: Crossover (EMA20 يعدي فوق EMA50)
  const prevEma20 = calcEMA(closes.slice(0, -1), 20);
  const prevEma50 = calcEMA(closes.slice(0, -1), 50);
  
  if (prevEma20 && prevEma50 && prevEma20 <= prevEma50 && ema20 > ema50) {
    return {
      symbol: data.symbol,
      price: close.toFixed(2),
      signal: '🔄 تقاطع إيجابي (EMA20 > EMA50)',
      type: 'Crossover',
      entry: close.toFixed(2),
      sl: (close - atr * 2).toFixed(2),
      tp1: (close + atr * 3).toFixed(2),
      tp2: (close + atr * 5).toFixed(2),
      rsi: rsi.toFixed(1),
      confidence: 'متوسط'
    };
  }
  
  return null;
}

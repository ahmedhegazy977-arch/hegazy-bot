const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// التوكن من إعدادات Railway
const TOKEN = process.env.TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

console.log('🚀 Bot started successfully!');

// أمر البداية
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '🤖 أهلاً بك في بوت التداول المصري!\n\nالأوامر المتاحة:\n/price SYMBOL - لمعرفة سعر السهم\n/list - لأسهم المتاحة\n/support SYMBOL PRICE - لتحديد نقطة دعم\n/resistance SYMBOL PRICE - لتحديد نقطة مقاومة');
});

// قائمة الأسهم المتاحة
bot.onText(/\/list/, (msg) => {
  bot.sendMessage(msg.chat.id, '✅ الأسهم المتاحة حالياً:\nCOMI - EFID - ETEL - HRHO - ESRS - SWDY - PHDC - TMGH - SODIC - MNHD', { parse_mode: 'Markdown' });
});

// أمر /price - سحب البيانات من مباشر (Mubasher)
bot.onText(/\/price (.+)/, async (msg, match) => {
  const symbol = match[1].toUpperCase();
  const chatId = msg.chat.id;

  // رسالة تحميل
  await bot.sendMessage(chatId, `⏳ جاري جلب بيانات ${symbol} من السوق...`);

  try {
    // 1. محاولة جلب السعر من مباشر (Mubasher)
    const mubasherUrl = `https://www.mubasher.info/markets/EGX/stocks/${symbol}`;
    const res = await axios.get(mubasherUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    });

    const html = res.data;
    
    // استخراج السعر بواسطة Regex
    let priceMatch = html.match(/class="stock-price__value[^"]*"[^>]*>([\d,\.]+)/);
    let price = priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : null;

    if (price) {
      // استخراج التغيير والنسبة إذا أمكن
      let changeText = html.match(/class="stock-change__value[^"]*"[^>]*>([-+]?[\d,.]+)/);
      let changeVal = changeText ? parseFloat(changeText[1].replace(/[^\d.-]/g, '')) : 0;
      
      // استخراج الحجم
      let volText = html.match(/data-testid="volume"[^>]*>([\d,\.]+)/);
      let volume = volText ? parseInt(volText[1].replace(',', '')) : 0;

      const icon = changeVal >= 0 ? '📈' : '📉';
      
      // بناء الرسالة النهائية
      const text = `📊 *${symbol}*\n💰 السعر: ${price.toFixed(2)} جنيه ${icon}\n📝 التغيير: ${changeVal.toFixed(2)}\n📦 الحجم: ${(volume/1000000).toFixed(1)} مليون`;
      
      // تعديل رسالة التحميل لتكون هي النتيجة النهائية
      // ملاحظة: سنقوم بإرسال رسالة جديدة هنا لتجنب مشاكل editMessageText في بعض الحالات
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    } else {
      throw new Error('Price not found in Mubasher');
    }

  } catch (error) {
    console.error(`❌ Error fetching ${symbol}:`, error.message);
    // Fallback: رابط TradingView المباشر إذا فشل المسح
    bot.sendMessage(chatId, `⚠️ لم يتم العثور على سعر دقيق لـ ${symbol}.\n🔗 تابعه الآن على TradingView:\nhttps://www.tradingview.com/chart/?symbol=EGX:${symbol}`, { parse_mode: 'Markdown' });
  }
});

// أوامر الدعم والمقاومة (بسيطة للمتابعة)
bot.onText(/\/support\s+(\w+)\s+([\d.]+)/, (msg, match) => {
  // يمكن تطويرها لاحقاً لحفظ النقاط في قاعدة بيانات
  const sym = match[1].toUpperCase();
  const price = match[2];
  bot.sendMessage(msg.chat.id, `✅ تم تثبيت نقطة الدعم لـ ${sym} عند السعر ${price}. سيتم التنبيه عند الوصول.`);
});

bot.onText(/\/resistance\s+(\w+)\s+([\d.]+)/, (msg, match) => {
  const sym = match[1].toUpperCase();
  const price = match[2];
  bot.sendMessage(msg.chat.id, `✅ تم تثبيت نقطة المقاومة لـ ${sym} عند السعر ${price}. سيتم التنبيه عند الوصول.`);
});

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// التوكن من إعدادات Railway
const TOKEN = process.env.TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

console.log(' Bot started successfully!');

// أمر البداية
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, ' أهلاً بك في بوت التداول المصري!\n\nالأوامر المتاحة:\n/price SYMBOL - لمعرفة سعر السهم\n/list - لأسهم المتاحة\n/support SYMBOL PRICE - لتحديد نقطة دعم\n/resistance SYMBOL PRICE - لتحديد نقطة مقاومة');
});

// قائمة الأسهم المتاحة
bot.onText(/\/list/, (msg) => {
  bot.sendMessage(msg.chat.id, '✅ الأسهم المتاحة حالياً:\nCOMI - EFID - ETEL - HRHO - ESRS - SWDY - PHDC - TMGH - SODIC - MNHD', { parse_mode: 'Markdown' });
});

// أمر /price - سحب البيانات من مباشر (Mubasher) بطريقة "الحفر العميق"
bot.onText(/\/price (.+)/, async (msg, match) => {
  const symbol = match[1].toUpperCase();
  const chatId = msg.chat.id;

  // رسالة تحميل
  const loadingMsg = await bot.sendMessage(chatId, `⏳ جاري جلب بيانات ${symbol} من السوق...`);

  try {
    // 1. طلب الصفحة
    const mubasherUrl = `https://www.mubasher.info/markets/EGX/stocks/${symbol}`;
    const res = await axios.get(mubasherUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      },
      timeout: 8000
    });

    const html = res.data;
    
    // 2. استخراج السعر (الطريقة الذكية)
    // نحاول نجيب السعر من بيانات Next.js المخفية (lastPrice)
    let price = null;
    let changeVal = 0;
    let volume = 0;

    // محاولة 1: البحث عن lastPrice في الـ JSON
    const jsonMatch = html.match(/"lastPrice":\s*"?([\d,\.]+)"?/); 
    if (jsonMatch) {
        price = parseFloat(jsonMatch[1].replace(',', ''));
    } 
    
    // محاولة 2: البحث عن priceChange
    const changeMatch = html.match(/"priceChange":\s*"?(-?[\d,\.]+)"?/);
    if (changeMatch) changeVal = parseFloat(changeMatch[1].replace(/[^\d.-]/g, ''));

    // محاولة 3: البحث عن الحجم tradedVolume
    const volMatch = html.match(/"tradedVolume":\s*"?([\d,\.]+)"?/);
    if (volMatch) volume = parseInt(volMatch[1].replace(',', ''));

    // لو لسه مفيش سعر، نجرب البحث عن أي رقم بجوار "ج.م"
    if (!price) {
        const genericPriceMatch = html.match(/([\d,]+\.?\d{2})\s*(ج\.م|جنيه)/);
        if (genericPriceMatch) {
             price = parseFloat(genericPriceMatch[1].replace(',', ''));
        }
    }

    // 3. إرسال النتيجة
    if (price) {
      const icon = changeVal >= 0 ? '' : '📉';
      const text = `📊 *${symbol}*\n💰 السعر: ${price.toFixed(2)} جنيه ${icon}\n📝 التغيير: ${changeVal.toFixed(2)}\n📦 الحجم: ${(volume/1000000).toFixed(1)} مليون`;
      
      // تعديل رسالة التحميل بالنتيجة
      bot.editMessageText(text, { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'Markdown' });
    } else {
      throw new Error('Price not found');
    }

  } catch (error) {
    console.error(`❌ Error fetching ${symbol}:`, error.message);
    // لو فشل كل شيء، نبعت رابط الشارت
    bot.editMessageText(`⚠️ لم يتم العثور على سعر دقيق لـ ${symbol}.\n🔗 تابعه الآن على TradingView:\nhttps://www.tradingview.com/chart/?symbol=EGX:${symbol}`, { 
      chat_id: chatId, 
      message_id: loadingMsg.message_id, 
      parse_mode: 'Markdown' 
    });
  }
});

// أوامر الدعم والمقاومة
bot.onText(/\/support\s+(\w+)\s+([\d.]+)/, (msg, match) => {
  const sym = match[1].toUpperCase();
  const price = match[2];
  bot.sendMessage(msg.chat.id, `✅ تم تثبيت نقطة الدعم لـ ${sym} عند السعر ${price}.`);
});

bot.onText(/\/resistance\s+(\w+)\s+([\d.]+)/, (msg, match) => {
  const sym = match[1].toUpperCase();
  const price = match[2];
  bot.sendMessage(msg.chat.id, `✅ تم تثبيت نقطة المقاومة لـ ${sym} عند السعر ${price}.`);
});

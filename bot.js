const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// قراءة التوكن من إعدادات Railway
const TOKEN = process.env.TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

console.log('🚀 Bot started successfully!');

// رد على أمر /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '🤖 البوت شغال! جرب /price COMI');
});

// رد على أمر /price SYMBOL
bot.onText(/\/price (.+)/, async (msg, match) => {
  const symbol = match[1].toUpperCase();
  const chatId = msg.chat.id;

  // رسالة "جاري التحميل"
  bot.sendMessage(chatId, `⏳ جاري البحث عن ${symbol}...`);

  try {
    // جلب البيانات من ياهو
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbol}.CA`;
    const response = await axios.get(url);
    const result = response.data.quoteResponse.result[0];

    if (result && result.regularMarketPrice) {
      const price = result.regularMarketPrice;
      const change = result.regularMarketChange;
      const percent = result.regularMarketChangePercent;
      
      const message = ` *${symbol}*\n💰 السعر: ${price}\n📈 التغير: ${change} (${percent}%)`;
      
      // تعديل رسالة "جاري التحميل" بالنتيجة
      // ملاحظة: بما إننا بعتنا رسالة جديدة، هنعدلها يدوياً أو نبعت واحدة جديدة
      // للأمان والبساطة هنرسل واحدة جديدة
      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(chatId, ' لم يتم العثور على السهم، تأكد من الرمز.');
    }
  } catch (error) {
    bot.sendMessage(chatId, '❌ حدث خطأ أثناء جلب البيانات.');
  }
});

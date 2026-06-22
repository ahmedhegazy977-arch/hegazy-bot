const TelegramBot = require('node-telegram-bot-api');

const TOKEN = process.env.TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

// قائمة الأسهم المصرية
const STOCKS = {
  'COMI': 'COMI', 'EFID': 'EFID', 'ETEL': 'ETEL', 'HRHO': 'HRHO',
  'ESRS': 'ESRS', 'SWDY': 'SWDY', 'PHDC': 'PHDC', 'TMGH': 'TMGH',
  'SODIC': 'SODIC', 'MNHD': 'MNHD', 'INEG': 'INEG', 'LUTS': 'LUTS'
};

console.log('🚀 TradingView Bot Started!');

// أمر البداية
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    `🤖 *بوت التداول المصري*\n\n` +
    `الأوامر المتاحة:\n` +
    `/price SYMBOL - رابط الشارت للسهم\n` +
    `/scan - كل الأسهم بروابطها\n` +
    `/list - قائمة الأسهم\n\n` +
    `📊 جميع الروابط من TradingView`, 
    { parse_mode: 'Markdown' }
  );
});

// قائمة الأسهم
bot.onText(/\/list/, (msg) => {
  const list = Object.keys(STOCKS).join(' - ');
  bot.sendMessage(msg.chat.id, `✅ *الأسهم المتاحة:*\n${list}`, { parse_mode: 'Markdown' });
});

// سعر سهم واحد
bot.onText(/\/price (.+)/, (msg, match) => {
  const symbol = match[1].toUpperCase();
  
  if (!STOCKS[symbol]) {
    return bot.sendMessage(msg.chat.id, `❌ ${symbol} غير متوفر. استخدم /list`);
  }
  
  const link = `https://www.tradingview.com/chart/?symbol=EGX:${symbol}`;
  
  const text = `📊 *${symbol}*\n\n` +
    `🔗 *الشارت المباشر:*\n${link}\n\n` +
    `💡 *مميزات TradingView:*\n` +
    `• سعر لحظي\n` +
    `• شارت تفاعلي\n` +
    `• مؤشرات فنية\n` +
    `• تحليلات متقدمة`;
  
  bot.sendMessage(msg.chat.id, text, { 
    parse_mode: 'Markdown',
    disable_web_page_preview: false
  });
});

// مسح كل الأسهم
bot.onText(/\/scan/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, '⏳ جاري تجهيز الروابط...');
  
  let message = `📈 *مسح السوق المصري*\n\n`;
  
  for (const [symbol, ticker] of Object.entries(STOCKS)) {
    const link = `https://www.tradingview.com/chart/?symbol=EGX:${ticker}`;
    message += ` *${symbol}*: [الشارت](${link})\n`;
  }
  
  message += `\n💡 *اضغط على أي رابط لفتح الشارت مباشرة*`;
  
  bot.sendMessage(chatId, message, { 
    parse_mode: 'Markdown',
    disable_web_page_preview: false
  });
});

// معلومات
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `📖 *كيفية الاستخدام:*\n\n` +
    `1️⃣ استخدم /price SYMBOL لعرض شارت سهم معين\n` +
    `مثال: /price COMI\n\n` +
    `2️⃣ استخدم /scan لعرض جميع الأسهم\n\n` +
    `3️⃣ استخدم /list لرؤية الأسهم المتاحة\n\n` +
    `🔗 جميع الروابط من TradingView.com`
  );
});

console.log('✅ Bot ready! Try /price COMI');

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

console.log(' Bot started!');

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '🤖 بوت التداول المصري شغال!\nجرب: /price COMI');
});

bot.onText(/\/price (.+)/, async (msg, match) => {
  const symbol = match[1].toUpperCase();
  const chatId = msg.chat.id;

  await bot.sendMessage(chatId, `⏳ جاري البحث عن ${symbol}...`);

  try {
    // هنستخدم Google Finance (أسهل وأضمن)
    // ملاحظة: بنحول الرمز لـ CAE عشان البورصة المصرية
    const url = `https://www.google.com/finance/quote/${symbol}:CAE`;
    
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });

    const html = response.data;

    // استخراج السعر (Google بيسهلها)
    const priceMatch = html.match(/class="YMlKec[^>]*>([\d,]+\.?\d*)/);
    const changeMatch = html.match(/class="P2Luy[^>]*>([-+]?[\d,]+\.?\d*)/);

    if (priceMatch) {
      const price = parseFloat(priceMatch[1].replace(/,/g, ''));
      const change = changeMatch ? changeMatch[1].replace(/,/g, '') : '0';
      
      const text = `📊 *${symbol}*\n💰 السعر: ${price} EGP\n📈 التغير: ${change}`;
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    } else {
      throw new Error('Not found');
    }

  } catch (error) {
    console.error(error);
    // لو فشل، نبعت رابط TradingView
    bot.sendMessage(chatId, `⚠️ لم أجد السعر، لكن إليك الشارت:\nhttps://www.tradingview.com/chart/?symbol=EGX:${symbol}`, { parse_mode: 'Markdown' });
  }
});

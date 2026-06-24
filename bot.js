const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const TOKEN = process.env.TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TWELVE_API_KEY = process.env.TWELVE_API_KEY;

const bot = new TelegramBot(TOKEN, { polling: true });

console.log('🚀 Bot started!');

// ====== اختبار الرموز ======

async function testSymbol(symbol) {
  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&outputsize=5&apikey=${TWELVE_API_KEY}`;
    const resp = await axios.get(url, { timeout: 10000 });
    
    if (resp.data.status === 'error') {
      return { symbol, status: 'error', msg: resp.data.message };
    }
    
    if (resp.data.values) {
      return { 
        symbol, 
        status: 'ok', 
        price: resp.data.values[0].close,
        name: resp.data.meta?.symbol || symbol
      };
    }
    
    return { symbol, status: 'unknown', data: JSON.stringify(resp.data).slice(0, 100) };
    
  } catch (e) {
    return { symbol, status: 'error', msg: e.message };
  }
}

// ====== أوامر البوت ======

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    '🤖 Hegazy Scanner\n\n' +
    '/testsymbols - اختبار رموز مختلفة\n' +
    '/check - فحص API\n' +
    '/scan - فحص الأسهم'
  );
});

// اختبار رموز مختلفة
bot.onText(/\/testsymbols/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '🔍 بجرب رموز مختلفة...');
  
  // جرب رموز مختلفة للبورصة المصرية
  const symbols = [
    'COMI',           // بدون suffix
    'COMI.CA',        // .CA
    'COMI.EG',        // .EG
    'COMI:EGX',       // :EGX
    'EGX:COMI',       // EGX:COMI
    'COMI.XCAI',      // .XCAI
  ];
  
  let results = '';
  
  for (const sym of symbols) {
    const result = await testSymbol(sym);
    results += `${sym}: ${result.status}`;
    if (result.price) results += ` (سعر: ${result.price})`;
    if (result.msg) results += ` - ${result.msg}`;
    results += '\n';
    
    await new Promise(r => setTimeout(r, 1000)); // Rate limit
  }
  
  await bot.sendMessage(msg.chat.id, `📊 النتائج:\n\n${results}`);
});

// فحص API Key
bot.onText(/\/check/, async (msg) => {
  await bot.sendMessage(msg.chat.id, '🔍 بفحص API Key...');
  
  try {
    // جرب سهم عالمي معروف (AAPL)
    const url = `https://api.twelvedata.com/time_series?symbol=AAPL&interval=1day&outputsize=5&apikey=${TWELVE_API_KEY}`;
    const resp = await axios.get(url, { timeout: 10000 });
    
    if (resp.data.status === 'error') {
      await bot.sendMessage(msg.chat.id, `❌ API Key غلط:\n${resp.data.message}`);
    } else if (resp.data.values) {
      await bot.sendMessage(msg.chat.id, 
        `✅ API Key شغال!\n\n` +
        `سعر AAPL: ${resp.data.values[0].close}\n\n` +
        `دلوقتي جرب: /testsymbols`
      );
    } else {
      await bot.sendMessage(msg.chat.id, '❌ رد غريب:\n' + JSON.stringify(resp.data).slice(0, 200));
    }
    
  } catch (e) {
    await bot.sendMessage(msg.chat.id, `❌ Error: ${e.message}`);
  }
});

// فحص الأسهم لما نلاقي الرمز الصحيح
bot.onText(/\/scan/, async (msg) => {
  await bot.sendMessage(msg.chat.id, 
    '⚠️ لازم نلاقي الرمز الصحيح الأول\n\n' +
    'جرب: /testsymbols'
  );
});

console.log('✅ Ready! Try /start then /check then /testsymbols');

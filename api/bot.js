const TelegramBot = require('node-telegram-bot-api');
const nodemailer = require('nodemailer');

const BOT_TOKEN = process.env.BOT_TOKEN;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_PASS;

const bot = new TelegramBot(BOT_TOKEN);
const userPhotos = new Map();

// Gmail setup
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASS
  }
});

// Handle start command
const handleStart = async (msg) => {
  const chatId = msg.chat.id;
  
  await bot.sendMessage(chatId,
    `📸 *Simple Photo Bot*\n\n` +
    `Just send me a photo and I'll give you the file link!\n` +
    `📧 I can also upload it to Gmail if you want!`,
    { parse_mode: 'Markdown' }
  );
};

// Handle photos
const handlePhoto = async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const photo = msg.photo[msg.photo.length - 1];
  
  try {
    // Get file info
    const file = await bot.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    
    // Store photo info
    if (!userPhotos.has(userId)) {
      userPhotos.set(userId, []);
    }
    
    userPhotos.get(userId).push({
      url: fileUrl,
      time: new Date()
    });
    
    // Send file URL to user with Gmail option
    await bot.sendMessage(chatId,
      `✅ *Photo Received!*\n\n` +
      `🔗 *File URL:*\n${fileUrl}\n\n` +
      `📊 *Size:* ${(file.file_size / 1024).toFixed(1)} KB\n\n` +
      `Want to upload this to Gmail?`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📧 Upload to Gmail', callback_data: `gmail_${file.file_id}` }],
            [{ text: '❌ No thanks', callback_data: 'cancel' }]
          ]
        }
      }
    );
    
  } catch (error) {
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
};

// Upload to Gmail function
const uploadToGmail = async (fileUrl, fileName, chatId) => {
  try {
    // Download the image
    const response = await fetch(fileUrl);
    const buffer = await response.buffer();
    
    const mailOptions = {
      from: GMAIL_USER,
      to: GMAIL_USER, // Send to yourself, or you can make it configurable
      subject: `📸 Photo from Telegram Bot - ${fileName}`,
      text: `Photo uploaded from Telegram Bot\n\nFile: ${fileName}\nTime: ${new Date().toLocaleString()}`,
      attachments: [
        {
          filename: fileName,
          content: buffer
        }
      ]
    };
    
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Gmail upload error:', error);
    return false;
  }
};

// Handle callback queries (Gmail upload)
const handleCallbackQuery = async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  
  try {
    if (data.startsWith('gmail_')) {
      const fileId = data.replace('gmail_', '');
      
      // Show uploading message
      await bot.answerCallbackQuery(callbackQuery.id, { text: '📧 Uploading to Gmail...' });
      
      // Get the file
      const file = await bot.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
      const fileName = `telegram_photo_${Date.now()}.jpg`;
      
      // Upload to Gmail
      const success = await uploadToGmail(fileUrl, fileName, chatId);
      
      if (success) {
        await bot.sendMessage(chatId,
          `✅ *Photo uploaded to Gmail!*\n\n` +
          `📧 Sent to: ${GMAIL_USER}\n` +
          `📎 File: ${fileName}\n` +
          `⏰ Time: ${new Date().toLocaleTimeString()}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await bot.sendMessage(chatId, '❌ Failed to upload to Gmail. Please try again.');
      }
    } else if (data === 'cancel') {
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Okay!' });
      await bot.deleteMessage(chatId, callbackQuery.message.message_id);
    }
    
  } catch (error) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Upload failed' });
    await bot.sendMessage(chatId, `Error: ${error.message}`);
  }
};

// Handle messages
const handleMessage = async (msg) => {
  const text = msg.text;
  
  if (text === '/start') {
    await handleStart(msg);
  }
};

// Vercel handler
module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.json({ status: 'Bot is running!' });
  }
  
  if (req.method === 'POST') {
    try {
      const update = req.body;
      
      if (update.message) {
        if (update.message.photo) {
          await handlePhoto(update.message);
        } else if (update.message.text) {
          await handleMessage(update.message);
        }
      } else if (update.callback_query) {
        await handleCallbackQuery(update.callback_query);
      }
      
      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
};

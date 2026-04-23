const router = require('express').Router();
const crypto = require('crypto');
const axios  = require('axios');

function verifyLineSignature(req) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return true;
  const signature = req.headers['x-line-signature'];
  const body = JSON.stringify(req.body);
  const hash = crypto.createHmac('SHA256', secret).update(body).digest('base64');
  return hash === signature;
}

router.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  if (!verifyLineSignature(req)) return;
  const events = req.body.events || [];
  for (const event of events) {
    const lineUserId = event.source && event.source.userId;
    if (!lineUserId) continue;
    if (event.type === 'follow') {
      await sendLineMessage(lineUserId,
        `สวัสดี! 👋\nLINE User ID ของคุณคือ:\n${lineUserId}`
      );
    }
  }
});

async function sendLineMessage(lineUserId, message) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !lineUserId) return;
  try {
    await axios.post('https://api.line.me/v2/bot/message/push', {
      to: lineUserId,
      messages: [{ type: 'text', text: message }],
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    console.error('[LINE] sendMessage failed:', err.response?.data || err.message);
  }
}

module.exports = router;
module.exports.sendLineMessage = sendLineMessage;
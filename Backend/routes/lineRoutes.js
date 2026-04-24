const router = require('express').Router();
const crypto = require('crypto');
const axios  = require('axios');

function verifyLineSignature(req) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  const signature = req.headers['x-line-signature'];
  if (!secret) {
    return !signature;
  }
  if (!signature) return false;
  const body = JSON.stringify(req.body);
  const hash = crypto.createHmac('SHA256', secret).update(body).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch (_) {
    return false;
  }
}

router.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  if (!verifyLineSignature(req)) return;

  const events = Array.isArray(req.body && req.body.events) ? req.body.events : [];
  for (const event of events) {
    const lineUserId = event && event.source && event.source.userId;
    if (!lineUserId) continue;

    if (event.type === 'follow') {
      try {
        await sendLineMessage(lineUserId,
          `สวัสดี! 👋\nLINE User ID ของคุณคือ:\n${lineUserId}`
        );
      } catch (err) {
        console.error('[LINE] follow reply failed:', err.message);
      }
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
      timeout: 10_000,
    });
  } catch (err) {
    const detail = (err.response && err.response.data) || err.message;
    console.error('[LINE] sendMessage failed:', detail);
  }
}

module.exports = router;
module.exports.sendLineMessage = sendLineMessage;

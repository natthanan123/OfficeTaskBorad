const { Attachment } = require('../models');

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

// Strip trailing punctuation that commonly hugs URLs in prose so we don't
// attach "example.com/page." or "example.com/page)." as distinct URLs.
const TRAILING_NOISE = /[.,;:!?)\]}'"]+$/;

const IMAGE_EXT_REGEX = /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?[^#]*)?(#.*)?$/i;

function guessMimetype(url) {
  const cleaned = url.split('?')[0].split('#')[0];
  const match = cleaned.toLowerCase().match(IMAGE_EXT_REGEX);
  if (!match) return 'link/url';
  const ext = match[1];
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'svg') return 'image/svg+xml';
  return `image/${ext}`;
}

// Extract every URL from a blob of text, de-dup against existing task
// attachments, and insert the new ones. Fire-and-forget from the caller's
// point of view: any failure is logged but never rethrown so it can't
// break the surrounding task/comment write.
async function parseUrlsToAttachments(text, taskId, source, userId = null) {
  if (!text || !taskId) return [];

  try {
    const matches = String(text).match(URL_REGEX);
    if (!matches || !matches.length) return [];

    const cleaned = [];
    const seenInThisCall = new Set();
    for (const raw of matches) {
      const url = raw.replace(TRAILING_NOISE, '');
      if (!url) continue;
      if (seenInThisCall.has(url)) continue;
      seenInThisCall.add(url);
      cleaned.push(url);
    }
    if (!cleaned.length) return [];

    // One round-trip: pull every existing URL for this task and skip any
    // match. Cheap compared to N findOne calls and race-safe enough for
    // the "parse once per edit" flow we're in.
    const existing = await Attachment.findAll({
      where: { task_id: taskId, filename_or_url: cleaned },
      attributes: ['filename_or_url'],
    });
    const existingSet = new Set(existing.map(a => a.filename_or_url));

    const toCreate = cleaned
      .filter(u => !existingSet.has(u))
      .map(url => ({
        task_id: taskId,
        user_id: userId,
        filename_or_url: url,
        mimetype: guessMimetype(url),
        size: null,
        is_cover: false,
        source,
      }));

    if (!toCreate.length) return [];
    return await Attachment.bulkCreate(toCreate);
  } catch (err) {
    console.error(`parseUrlsToAttachments (${source}) failed:`, err);
    return [];
  }
}

module.exports = { parseUrlsToAttachments, guessMimetype, URL_REGEX };

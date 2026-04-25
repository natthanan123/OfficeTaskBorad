//Trello color → hex
const TRELLO_COLOR_MAP = {
  green:        '#16a34a',
  green_dark:   '#15803d',
  green_light:  '#86efac',
  yellow:       '#eab308',
  yellow_dark:  '#a16207',
  yellow_light: '#fde047',
  orange:       '#f97316',
  orange_dark:  '#c2410c',
  orange_light: '#fdba74',
  red:          '#dc2626',
  red_dark:     '#991b1b',
  red_light:    '#fca5a5',
  pink:         '#ec4899',
  pink_dark:    '#be185d',
  pink_light:   '#f9a8d4',
  purple:       '#a855f7',
  purple_dark:  '#6b21a8',
  purple_light: '#d8b4fe',
  blue:         '#2563eb',
  blue_dark:    '#1d4ed8',
  blue_light:   '#93c5fd',
  sky:          '#0ea5e9',
  sky_dark:     '#0369a1',
  sky_light:    '#7dd3fc',
  lime:         '#84cc16',
  lime_dark:    '#4d7c0f',
  lime_light:   '#bef264',
  teal:         '#14b8a6',
  magenta:      '#d946ef',
  gray:         '#6b7280',
  black:        '#1f2937',
};

function trelloColorToHex(name) {
  if (!name) return null;
  return TRELLO_COLOR_MAP[String(name).toLowerCase()] || null;
}

//Attachments block
function renderAttachmentsBlock(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) return '';
  const lines = attachments
    .filter(a => a && a.url)
    .map(a => {
      const label = a.name || a.fileName || 'attachment';
      return `- [${label}](${a.url})`;
    });
  if (!lines.length) return '';
  return `\n\n---\n📎 **Attachments (from Trello)**\n${lines.join('\n')}`;
}

//Parser
function parseTrelloExport(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid Trello export: not a JSON object');
  }
  if (!raw.name || !Array.isArray(raw.lists)) {
    throw new Error('Invalid Trello export: missing board name or lists');
  }

  const board = {
    title: String(raw.name).slice(0, 255),
    description: typeof raw.desc === 'string' ? raw.desc : null,
  };

  //Labels
  const labels = (raw.labels || [])
    .filter(l => l && l.id)
    .map(l => ({
      trelloId: String(l.id),
      title: l.name || null,
      color: trelloColorToHex(l.color) || '#6b7280',
    }));

  //Lists → columns
  const lists = (raw.lists || [])
    .filter(l => l && l.id && !l.closed)
    .slice()
    .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));

  //Cards grouped by list
  const cardsByList = new Map();
  for (const card of (raw.cards || [])) {
    if (!card || card.closed) continue;
    if (!cardsByList.has(card.idList)) cardsByList.set(card.idList, []);
    cardsByList.get(card.idList).push(card);
  }
  for (const arr of cardsByList.values()) {
    arr.sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
  }

  const columns = lists.map((list, listIdx) => {
    const cards = (cardsByList.get(list.id) || []).map((card, cardIdx) => {
      const desc = typeof card.desc === 'string' ? card.desc : '';
      const description = (desc + renderAttachmentsBlock(card.attachments)) || null;

      //Due date
      let dueDate = null;
      if (card.due) {
        const d = new Date(card.due);
        if (!isNaN(d.getTime())) dueDate = d.toISOString().slice(0, 10);
      }

      //Label ids
      const labelTrelloIds = Array.isArray(card.idLabels) && card.idLabels.length
        ? card.idLabels.map(String)
        : (card.labels || []).map(l => l && l.id).filter(Boolean).map(String);

      return {
        title: String(card.name || 'Untitled').slice(0, 255),
        description,
        position: cardIdx + 1,
        due_date: dueDate,
        is_completed: !!card.dueComplete,
        labelTrelloIds,
      };
    });

    return {
      title: String(list.name || 'Untitled').slice(0, 255),
      position: listIdx + 1,
      color: trelloColorToHex(list.color),
      cards,
    };
  });

  return { board, columns, labels };
}

module.exports = {
  parseTrelloExport,
  trelloColorToHex,
};

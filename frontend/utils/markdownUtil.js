(function () {
  function htmlToMarkdown(html) {
    if (!html) return '';
    let md = html;
    md = md.replace(/<br\s*\/?>/gi, '\n');
    md = md.replace(/<(strong|b)\b[^>]*>(.*?)<\/\1>/gis, '**$2**');
    md = md.replace(/<(em|i)\b[^>]*>(.*?)<\/\1>/gis, '*$2*');
    md = md.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis, '[$2]($1)');
    md = md.replace(/<img\b[^>]*src=["']([^"']+)["'][^>]*\/?>/gis, '![]($1)');
    md = md.replace(/<h1\b[^>]*>(.*?)<\/h1>/gis, '# $1\n');
    md = md.replace(/<h2\b[^>]*>(.*?)<\/h2>/gis, '## $1\n');
    md = md.replace(/<h3\b[^>]*>(.*?)<\/h3>/gis, '### $1\n');
    md = md.replace(/<blockquote\b[^>]*>(.*?)<\/blockquote>/gis, '> $1\n');
    md = md.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, '```\n$1\n```\n');
    md = md.replace(/<code\b[^>]*>(.*?)<\/code>/gi, '`$1`');
    md = md.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) =>
      inner.replace(/<li\b[^>]*>(.*?)<\/li>/gis, '- $1\n'));
    md = md.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
      let i = 0;
      return inner.replace(/<li\b[^>]*>(.*?)<\/li>/gis, () => `${++i}. $1\n`)
        .replace(/\$1/g, '');
    });
    md = md.replace(/<span\b[^>]*data-mention[^>]*>@?(.*?)<\/span>/gis, '@$1');
    md = md.replace(/<\/p>\s*<p\b[^>]*>/gi, '\n\n');
    md = md.replace(/<p\b[^>]*>/gi, '');
    md = md.replace(/<\/p>/gi, '');
    md = md.replace(/<[^>]+>/g, '');
    md = md.replace(/&nbsp;/g, ' ')
           .replace(/&amp;/g, '&')
           .replace(/&lt;/g, '<')
           .replace(/&gt;/g, '>')
           .replace(/&quot;/g, '"');
    md = md.replace(/\n{3,}/g, '\n\n').trim();
    return md;
  }

  function descToHtml(text) {
    if (!text) return '';
    const t = String(text);
    if (/<\w+[^>]*>/.test(t)) return t;
    const escapeHtml = (window.Dashboard && window.Dashboard.escapeHtml) || ((s) => s);
    return t.split(/\n+/).map(line => `<p>${escapeHtml(line)}</p>`).join('');
  }

  function descPlainFromHtml(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || '').trim();
  }

  window.PawtryUtil = window.PawtryUtil || {};
  window.PawtryUtil.htmlToMarkdown    = htmlToMarkdown;
  window.PawtryUtil.descToHtml        = descToHtml;
  window.PawtryUtil.descPlainFromHtml = descPlainFromHtml;
})();

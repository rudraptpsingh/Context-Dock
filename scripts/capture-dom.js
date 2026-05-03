// Paste this into the DevTools console on a real ChatGPT / Claude / Gemini /
// Perplexity conversation page. It dumps a minimised HTML snapshot of the
// rendered conversation to your clipboard. Save it as
//   tests/fixtures/real/<platform>/<short-slug>.html
// and run `npm run validate:fixtures` to validate the adapter against it.
//
// What's preserved:
//   - <main> (or document.body fallback) with structure intact
//   - class names, role, aria-*, and data-* attributes (adapters key off these)
//   - text content
//   - a <!-- captured … from <url> --> comment so the validator can recover
//     the original URL for parseConversationId()
// What's stripped:
//   - <script>, <link>, <style>, inline style="" attributes
//   - <svg>, <img src="data:…">  (huge, irrelevant)
//   - any input/textarea (avoids accidental in-progress prompt capture)

(function captureDom() {
  function clone(el) {
    const copy = el.cloneNode(true);
    for (const sel of ['script', 'link', 'style', 'img[src^="data:"]', 'svg', 'input', 'textarea']) {
      copy.querySelectorAll(sel).forEach(n => n.remove());
    }
    function scrub(node) {
      if (!(node instanceof Element)) return;
      for (const attr of [...node.attributes]) {
        const keep =
          attr.name === 'class' ||
          attr.name === 'role' ||
          attr.name.startsWith('data-') ||
          attr.name.startsWith('aria-');
        if (!keep) node.removeAttribute(attr.name);
      }
      [...node.children].forEach(scrub);
    }
    scrub(copy);
    return copy;
  }

  const main = document.querySelector('main') || document.body;
  const captured = clone(main);
  const title = (document.title || 'untitled').replace(/[\r\n]+/g, ' ').slice(0, 120);
  const host = location.hostname;
  const platform = host.includes('chatgpt') || host.includes('chat.openai')
    ? 'chatgpt'
    : host.includes('claude')
      ? 'claude'
      : host.includes('gemini')
        ? 'gemini'
        : host.includes('perplexity')
          ? 'perplexity'
          : 'unknown';

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'capture';
  const filename = `tests/fixtures/real/${platform}/${slug}.html`;

  const html = `<!doctype html>
<!-- captured ${new Date().toISOString()} from ${location.href} -->
<!-- platform: ${platform} -->
<!-- save as: ${filename} -->
<html>
  <head><title>${title.replace(/</g, '&lt;')}</title></head>
  <body>
    ${captured.outerHTML}
  </body>
</html>`;

  const summary = `[capture] ${platform} (${html.length} bytes)\n         save as: ${filename}\n         then run: npm run validate:fixtures`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(html).then(
      () => console.log(`${summary}\n         (copied to clipboard)`),
      () => {
        console.log(`${summary}\n         (clipboard denied — full HTML below)`);
        console.log(html);
      },
    );
  } else {
    console.log(summary);
    console.log(html);
  }
})();

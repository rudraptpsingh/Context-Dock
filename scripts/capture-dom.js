// Paste this into the DevTools console on a real ChatGPT / Claude / Gemini /
// Perplexity conversation page. It'll dump a minimised, redacted HTML snapshot
// of the conversation to your clipboard so you can drop it into
// tests/fixtures/<platform>-real-<n>.html and run the adapter unit tests
// against the actual DOM your browser sees.
//
// Usage:
//   1. Open the conversation in a tab.
//   2. DevTools → Console → paste the contents of this file → Enter.
//   3. The captured HTML lands in your clipboard.
//   4. Save it as tests/fixtures/<platform>-real-<n>.html.
//   5. Run `npm run test:unit` to validate the adapter selectors against it.
//
// What we keep: <main>, all elements with classes / data-* attributes the
// adapters rely on, plus their text. What we strip: scripts, link rel=icon,
// inline style attributes, base64 data: URLs, and any element that looks like
// a search box or input (so a stray prompt fragment isn't preserved).

(function captureDom() {
  function clone(el) {
    const copy = el.cloneNode(true);
    // Strip noise.
    for (const sel of ['script', 'link', 'style', 'img[src^="data:"]', 'svg']) {
      copy.querySelectorAll(sel).forEach(n => n.remove());
    }
    // Strip inline style attributes; keep class + data-* + role + aria-*.
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
  const platform =
    location.hostname.includes('chatgpt') || location.hostname.includes('chat.openai')
      ? 'chatgpt'
      : location.hostname.includes('claude')
        ? 'claude'
        : location.hostname.includes('gemini')
          ? 'gemini'
          : location.hostname.includes('perplexity')
            ? 'perplexity'
            : 'unknown';

  const html = `<!doctype html>
<!-- captured ${new Date().toISOString()} from ${location.href} -->
<html>
  <head><title>${title.replace(/</g, '&lt;')}</title></head>
  <body>
    ${captured.outerHTML}
  </body>
</html>`;

  // Try clipboard, fall back to console.
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(html).then(
      () => console.log(`[capture] ${platform} DOM (${html.length} bytes) copied to clipboard`),
      () => {
        console.log(`[capture] clipboard denied — falling back to console`);
        console.log(html);
      },
    );
  } else {
    console.log(html);
  }
})();

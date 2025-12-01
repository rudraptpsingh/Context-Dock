/**
 * Page Clipper - Extracts clean content from web pages
 * Used when the "Clip Page" feature is triggered
 */

interface PageContent {
  title: string;
  content: string;
  url: string;
}

/**
 * Extract the main content from the current page
 * Uses heuristics to find the main article/content area
 */
export function extractPageContent(): PageContent {
  const url = window.location.href;
  const title = document.title;

  // Try to find article content
  let content = '';

  // Priority order for content extraction
  const contentSelectors = [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content',
    '#content',
    '.post',
    '.article',
  ];

  for (const selector of contentSelectors) {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (element) {
      content = cleanText(element.innerText);
      if (content.length > 100) {
        break;
      }
    }
  }

  // Fallback to body if no content found
  if (!content || content.length < 100) {
    content = cleanText(document.body.innerText);
  }

  // Limit content size
  const maxLength = 8000;
  if (content.length > maxLength) {
    content = content.slice(0, maxLength) + '...';
  }

  return { title, content, url };
}

/**
 * Clean extracted text
 */
function cleanText(text: string): string {
  return text
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove common navigation/footer patterns
    .replace(/^(menu|navigation|skip to|search|home|about|contact|privacy|terms|cookie).*$/gim, '')
    // Trim
    .trim();
}

/**
 * Listen for clip requests from the extension
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CLIP_PAGE') {
    try {
      const pageContent = extractPageContent();
      sendResponse({ success: true, ...pageContent });
    } catch (error) {
      console.error('[Context Stash Clipper] Error:', error);
      sendResponse({ success: false, error: String(error) });
    }
  }
  return true; // Will respond asynchronously
});

// Export for use in other scripts
export default extractPageContent;


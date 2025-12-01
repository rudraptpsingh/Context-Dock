/**
 * Icon Generator for Context Dock
 * Run with: node scripts/generate-icons.js
 * 
 * This creates simple placeholder icons. For production,
 * replace these with properly designed icons.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '../public/icons');

// Ensure icons directory exists
if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

// SVG template for the icon
function createSvgIcon(size) {
  const padding = size * 0.1;
  const iconSize = size - padding * 2;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#2563eb;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#grad)"/>
  <g transform="translate(${padding}, ${padding})">
    <path 
      d="M${iconSize * 0.2} ${iconSize * 0.2}
         H${iconSize * 0.8}
         V${iconSize * 0.35}
         H${iconSize * 0.35}
         V${iconSize * 0.8}
         H${iconSize * 0.2}
         Z
         M${iconSize * 0.4} ${iconSize * 0.4}
         H${iconSize * 0.8}
         V${iconSize * 0.55}
         H${iconSize * 0.55}
         V${iconSize * 0.8}
         H${iconSize * 0.4}
         Z"
      fill="white"
      fill-rule="evenodd"
    />
  </g>
</svg>`;
}

// Create PNG from SVG using a canvas-like approach
// For simplicity, we'll just save SVGs that Chrome can use
const sizes = [16, 48, 128];

sizes.forEach(size => {
  const svg = createSvgIcon(size);
  const filename = `icon${size}.svg`;
  writeFileSync(join(iconsDir, filename), svg);
  console.log(`Created ${filename}`);
});

console.log('\nIcons created successfully!');
console.log('Note: These are SVG placeholders. For production, convert to PNG.');


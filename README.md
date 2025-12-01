# Context Stash

A premium Chrome extension for research-focused browsing. Collect snippets into "Project Buckets" and seamlessly inject context into ChatGPT, Claude, Gemini, and Perplexity.

![Context Stash](https://img.shields.io/badge/Chrome-Extension-blue?style=for-the-badge&logo=googlechrome)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript)

## Overview

Context Stash allows you to build "Project Buckets" of knowledge as you browse the web. Save text selections, clip articles, or jot down notes into organized projects. When you're ready to write or research, inject your collected context directly into your favorite AI chat tools like ChatGPT, Claude, Gemini, and Perplexity with a single click.

## ✨ Key Features

- **Project Buckets**: Organize your research snippets into distinct projects.
- **Right-Click to Save**: Select text on any page and save it directly to a project via the context menu.
- **Page Clipping**: Capture clean article content with one click from the side panel or right-click menu.
- **AI Integration**: Inject your collected context (as formatted citations) directly into ChatGPT, Claude, Gemini, and Perplexity using the right-click menu.
- **Premium UI**: Sleek, minimalist design with a native feel.

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/context-stash.git
   cd context-stash
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the extension**
   ```bash
   npm run build
   ```

4. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

## 📖 Usage

### Creating Projects
1. Click the Context Stash icon in Chrome to open the side panel.
2. Use the project switcher at the top to create a new project.
3. Give your project a descriptive name (e.g., "Thesis Research", "Recipe Collection").

### Collecting Snippets
- **Text Selection**: Highlight text on any webpage -> Right-click -> "Save selection to Context Stash" -> Choose your project (or create a new one on the fly!).
- **Page Clipping**: Right-click anywhere on the page -> "Clip Page to Context Stash". Or open the side panel and click the scissors icon.
- **Quick Notes**: Click the sticky note icon in the side panel to jot down thoughts.

### Using Your Context
1. Navigate to ChatGPT, Claude, Gemini, or Perplexity.
2. Right-click in the chat input box.
3. Select **"Paste Context from Context Stash"**.
4. Choose the project you want to inject.
5. Your collected snippets will be pasted as a formatted, numbered list with citations, ready for the AI to use.

## 🔒 Privacy & Permissions

Context Stash runs entirely locally on your device.
- **Storage**: Your projects and snippets are stored in your browser's local storage (`chrome.storage.local`).
- **No Analytics**: We do not track your browsing history or collect personal data.
- **Permissions**:
    - `activeTab`: To clip content from the page you are viewing.
    - `contextMenus`: To provide the right-click save/paste functionality.
    - `scripting`: To insert text into web pages.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License

---

Built with ❤️ for researchers and knowledge workers.

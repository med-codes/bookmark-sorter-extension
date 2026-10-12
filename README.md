# Smart Bookmark Sorter AI 📑✨

> An intelligent Chrome Extension (Manifest V3) that automatically categorizes and organizes browser bookmarks using **Google Gemini AI** (`gemini-3.8-flash`).

![Version](https://img.shields.io/badge/version-2.0-blue.svg)
![Manifest](https://img.shields.io/badge/manifest-v3-green.svg)
![AI Model](https://img.shields.io/badge/model-Gemini%203.8%20Flash-purple.svg)

---

## 🌟 Key Features

- **⚡ Google Gemini AI Engine**: Fast batch analysis using `gemini-3.8-flash` (or `gemini-2.0-flash` / custom models) with structured JSON output.
- **🏷️ Smart Hybrid Categories**: Organizes bookmarks into standard customizable topics (*Coding & Dev*, *AI & Machine Learning*, *Finance*, *Tools*, etc.) and creates new folders when appropriate.
- **🔄 Real-Time Auto-Sorting**: Listens for newly created bookmarks and moves them automatically to `Other bookmarks > Sorted > <Category>` as soon as you save them.
- **🛡️ Respects Manual Organization**: If you intentionally place a bookmark inside your own custom folder, it won't touch it.
- **🔍 Dry Run / Preview Mode**: Inspect AI classifications and rationales before moving any bookmarks.
- **📊 Modern Dashboard**: Sleek dark-mode glassmorphic control center with live statistics, category chips manager, connection tester, and search filter.
- **🌐 Offline Rule Fallback**: Automatically falls back to domain and keyword rules if offline or if no API key is set.

---

## 🚀 Installation

1. Clone or download this repository:
   ```bash
   git clone https://github.com/med-codes/bookmark-sorter-extension.git
   ```
2. Open Google Chrome (or Edge / Brave) and navigate to `chrome://extensions/`.
3. Enable **Developer mode** via the toggle in the top-right corner.
4. Click **Load unpacked** and select this directory.

---

## 🔑 Setup & Usage

1. **Get an API Key**:
   * Create a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey).
2. **Configure Extension**:
   * Click the extension icon in your toolbar to open the settings dashboard.
   * Paste your Gemini API key and click **⚡ Test & Save Connection**.
3. **Sort Bookmarks**:
   * Click **✨ Sort All Bookmarks Now** or test with **🔍 Dry Run / Preview Only**.

---

## 📁 Project Structure

```
├── manifest.json            # Manifest V3 extension configuration
├── background.js            # Service worker handling bookmark events & queue
├── ai-service.js            # Google Gemini API client & batch classification
├── options.html             # Modern settings and organization dashboard
├── options.css              # Glassmorphic dark styling & micro-animations
├── options.js               # Dashboard controller & live progress feed
├── default-categories.json  # Preset standard category list
├── default-rules.json       # Fallback keyword and domain rules
└── icon.png                 # Extension icon
```

---

## 📄 License

MIT License. Feel free to use and customize!

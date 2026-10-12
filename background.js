import { classifyBookmarksBatch, testApiKey } from "./ai-service.js";

const ROOT_NAME = "Sorted";

const FALLBACK_RULES = [
  { folder: "Coding & Development", domains: ["github.com","gitlab.com","stackoverflow.com","developer.mozilla.org","npmjs.com","pypi.org","leetcode.com","geeksforgeeks.org"], keywords: ["tutorial","documentation","api reference","programming","developer","code"] },
  { folder: "AI & Machine Learning", domains: ["claude.ai","chatgpt.com","gemini.google.com","huggingface.co","perplexity.ai","openai.com","anthropic.com"], keywords: ["ai","llm","prompt","gpt","artificial intelligence"] },
  { folder: "Entertainment & Media", domains: ["youtube.com","youtu.be","netflix.com","vimeo.com","twitch.tv","spotify.com","hulu.com"], keywords: ["watch","video","movie","stream","song"] },
  { folder: "Social & Community", domains: ["twitter.com","x.com","facebook.com","instagram.com","linkedin.com","reddit.com","discord.com","threads.net"], keywords: ["community","social"] },
  { folder: "Shopping & Deals", domains: ["amazon.in","amazon.com","flipkart.com","myntra.com","ebay.com","etsy.com","walmart.com","aliexpress.com"], keywords: ["buy","price","deal","cart","shop","discount"] },
  { folder: "News & Reading", domains: ["bbc.com","nytimes.com","theguardian.com","ndtv.com","thehindu.com","cnn.com","washingtonpost.com","medium.com","substack.com"], keywords: ["breaking news","headlines","news","article"] },
  { folder: "Learning & Education", domains: ["coursera.org","udemy.com","khanacademy.org","edx.org","wikipedia.org"], keywords: ["course","learn","lecture","tutorial","study"] },
  { folder: "Finance & Crypto", domains: ["zerodha.com","paypal.com","moneycontrol.com","investopedia.com","coinbase.com","binance.com"], keywords: ["bank","invest","stock","mutual fund","crypto","finance"] },
  { folder: "Travel & Places", domains: ["makemytrip.com","booking.com","airbnb.com","tripadvisor.com","irctc.co.in","google.com/travel"], keywords: ["flight","hotel","trip","vacation"] },
  { folder: "Tools & Productivity", domains: ["notion.so","trello.com","linear.app","figma.com","canva.com","drive.google.com"], keywords: ["tool","app","productivity","workspace"] }
];

let importing = false;
let queue = Promise.resolve();
const enqueue = (fn) => (queue = queue.then(fn).catch(console.error));

// In-memory cache for folder IDs to avoid querying the tree on every bookmark
let folderCache = new Map();

/**
 * Retrieve user configuration
 */
export async function getSettings() {
  const defaults = {
    apiKey: "",
    model: "gemini-3.8-flash",
    standardCategories: [
      "Coding & Development",
      "AI & Machine Learning",
      "Tools & Productivity",
      "Design & Creative",
      "Finance & Crypto",
      "News & Reading",
      "Shopping & Deals",
      "Social & Community",
      "Travel & Places",
      "Learning & Education",
      "Entertainment & Media",
      "Health & Lifestyle"
    ],
    autoSort: true,
    includeNested: false,
    useFallbackRules: true
  };

  const stored = await chrome.storage.sync.get(Object.keys(defaults));
  return { ...defaults, ...stored };
}

/**
 * Rule-based fallback categorization
 */
function categorizeWithRules(bm, rules = FALLBACK_RULES) {
  let host;
  try {
    host = new URL(bm.url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }

  // 1) Domain matching
  for (const r of rules) {
    if ((r.domains || []).some(d => host === d || host.endsWith("." + d))) {
      return { category: r.folder, reason: `Matched domain ${host}` };
    }
  }

  // 2) Keyword matching in title and URL
  const text = `${bm.title || ""} ${bm.url}`.toLowerCase();
  for (const r of rules) {
    if ((r.keywords || []).some(k => k && text.includes(k.toLowerCase()))) {
      return { category: r.folder, reason: `Matched keyword` };
    }
  }

  return null;
}

/**
 * Locate or create the root "Sorted" directory and category folder
 */
async function getFolder(categoryName) {
  const cleanName = (categoryName || "General").trim().replace(/[\/\\:*?"<>|]/g, "-") || "General";

  if (folderCache.has(cleanName)) {
    try {
      const [existing] = await chrome.bookmarks.get(folderCache.get(cleanName));
      if (existing) return existing;
    } catch {
      folderCache.delete(cleanName);
    }
  }

  const [tree] = await chrome.bookmarks.getTree();
  // Find "Other bookmarks" (usually children[1]) or fallback to bookmarks bar
  const other = tree.children.find(c => c.title.toLowerCase().includes("other")) || tree.children[1] || tree.children[0];

  const otherKids = await chrome.bookmarks.getChildren(other.id);
  let root = otherKids.find(c => !c.url && c.title === ROOT_NAME);
  if (!root) {
    root = await chrome.bookmarks.create({ parentId: other.id, title: ROOT_NAME });
  }

  const sortedKids = await chrome.bookmarks.getChildren(root.id);
  let categoryFolder = sortedKids.find(c => !c.url && c.title.toLowerCase() === cleanName.toLowerCase());
  if (!categoryFolder) {
    categoryFolder = await chrome.bookmarks.create({ parentId: root.id, title: cleanName });
  }

  folderCache.set(cleanName, categoryFolder.id);
  return categoryFolder;
}

/**
 * Classify and move a single bookmark
 */
async function sortSingleBookmark(bm, settings) {
  if (!bm || !bm.url) return null;

  let targetCategory = null;
  let reason = "";

  // Try AI classification if key is configured
  if (settings.apiKey && settings.apiKey.trim()) {
    try {
      const results = await classifyBookmarksBatch([bm], settings.standardCategories, settings.apiKey, settings.model);
      if (results && results[0] && results[0].category) {
        targetCategory = results[0].category;
        reason = results[0].reason || "AI categorized";
      }
    } catch (err) {
      console.warn("AI categorization failed, falling back to rules:", err);
    }
  }

  // Fallback to rules if AI unavailable or failed
  if (!targetCategory && settings.useFallbackRules) {
    const fallback = categorizeWithRules(bm);
    if (fallback) {
      targetCategory = fallback.category;
      reason = fallback.reason;
    }
  }

  if (!targetCategory) return null;

  const folder = await getFolder(targetCategory);
  if (bm.parentId === folder.id) {
    return { moved: false, alreadyInFolder: true, category: targetCategory, reason };
  }

  await chrome.bookmarks.move(bm.id, { parentId: folder.id });
  return { moved: true, category: targetCategory, reason, title: bm.title, url: bm.url };
}

/**
 * Sorts all bookmarks across the browser with AI batching
 */
async function sortAllBookmarks({ dryRun = false, includeNested = false, onProgress } = {}) {
  folderCache.clear();
  const settings = await getSettings();
  const [tree] = await chrome.bookmarks.getTree();

  // Find Root "Sorted" folder ID if it exists
  let sortedRootId = null;
  const other = tree.children.find(c => c.title.toLowerCase().includes("other")) || tree.children[1] || tree.children[0];
  if (other) {
    const otherKids = await chrome.bookmarks.getChildren(other.id);
    const root = otherKids.find(c => !c.url && c.title === ROOT_NAME);
    if (root) sortedRootId = root.id;
  }

  // Collect all bookmarks
  const candidateBookmarks = [];

  function walk(node, depth, isInSorted) {
    const isNowInSorted = isInSorted || (sortedRootId && node.id === sortedRootId);

    if (node.url) {
      // Don't re-sort bookmarks that are already inside Sorted
      if (!isNowInSorted) {
        if (includeNested || depth <= 2) {
          candidateBookmarks.push({
            id: node.id,
            title: node.title,
            url: node.url,
            parentId: node.parentId
          });
        }
      }
      return;
    }

    if (node.children) {
      for (const child of node.children) {
        walk(child, depth + 1, isNowInSorted);
      }
    }
  }

  walk(tree, 0, false);

  const total = candidateBookmarks.length;
  if (total === 0) {
    return { ok: true, total: 0, moved: 0, results: [] };
  }

  const BATCH_SIZE = 25;
  const results = [];
  let movedCount = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = candidateBookmarks.slice(i, i + BATCH_SIZE);
    let classifications = [];

    // Attempt AI batch classification
    if (settings.apiKey && settings.apiKey.trim()) {
      try {
        classifications = await classifyBookmarksBatch(
          batch,
          settings.standardCategories,
          settings.apiKey,
          settings.model
        );
      } catch (err) {
        console.warn(`AI batch failed (${i} to ${i + batch.length}), attempting fallback:`, err);
      }
    }

    // Map classifications or fallback
    const classMap = new Map((classifications || []).map(c => [String(c.id), c]));

    for (const bm of batch) {
      let classification = classMap.get(String(bm.id));

      if (!classification && settings.useFallbackRules) {
        const fb = categorizeWithRules(bm);
        if (fb) {
          classification = { id: bm.id, category: fb.category, reason: fb.reason };
        }
      }

      if (!classification) {
        classification = { id: bm.id, category: "Uncategorized", reason: "No matching category" };
      }

      let moved = false;
      if (!dryRun && classification.category !== "Uncategorized") {
        try {
          const folder = await getFolder(classification.category);
          if (bm.parentId !== folder.id) {
            await chrome.bookmarks.move(bm.id, { parentId: folder.id });
            moved = true;
            movedCount++;
          }
        } catch (moveErr) {
          console.error("Failed to move bookmark:", bm, moveErr);
        }
      } else if (dryRun && classification.category !== "Uncategorized") {
        moved = true;
        movedCount++;
      }

      const itemResult = {
        id: bm.id,
        title: bm.title || "Untitled",
        url: bm.url,
        category: classification.category,
        reason: classification.reason,
        moved
      };

      results.push(itemResult);
    }

    // Report batch progress
    if (typeof onProgress === "function") {
      onProgress({
        processed: Math.min(i + BATCH_SIZE, total),
        total,
        currentBatch: results.slice(-batch.length)
      });
    }
  }

  return {
    ok: true,
    total,
    moved: movedCount,
    dryRun,
    results
  };
}

/**
 * Aggregate bookmark statistics
 */
async function getBookmarkStats() {
  const [tree] = await chrome.bookmarks.getTree();
  let totalBookmarks = 0;
  let sortedBookmarks = 0;
  const categories = new Map();

  // Locate Sorted folder
  const other = tree.children.find(c => c.title.toLowerCase().includes("other")) || tree.children[1] || tree.children[0];
  let sortedRootId = null;
  if (other) {
    const otherKids = await chrome.bookmarks.getChildren(other.id);
    const root = otherKids.find(c => !c.url && c.title === ROOT_NAME);
    if (root) sortedRootId = root.id;
  }

  function count(node, inSorted) {
    const isNowSorted = inSorted || (sortedRootId && node.id === sortedRootId);
    if (node.url) {
      totalBookmarks++;
      if (isNowSorted) {
        sortedBookmarks++;
      }
      return;
    }
    if (isNowSorted && node.id !== sortedRootId) {
      const current = categories.get(node.title) || 0;
      const childBookmarks = (node.children || []).filter(c => c.url).length;
      categories.set(node.title, current + childBookmarks);
    }
    if (node.children) {
      for (const child of node.children) count(child, isNowSorted);
    }
  }

  count(tree, false);

  return {
    totalBookmarks,
    sortedBookmarks,
    categoryCount: categories.size,
    categoryDetails: Array.from(categories.entries()).map(([name, count]) => ({ name, count }))
  };
}

// ---- Event Listeners for New Bookmarks ----
chrome.bookmarks.onImportBegan.addListener(() => (importing = true));
chrome.bookmarks.onImportEnded.addListener(() => (importing = false));

chrome.bookmarks.onCreated.addListener((id, bm) => {
  if (!bm.url || importing) return;

  enqueue(async () => {
    const settings = await getSettings();
    if (!settings.autoSort) return;

    // Respect bookmarks manually placed inside custom nested user folders
    const [parent] = await chrome.bookmarks.get(bm.parentId);
    if (parent.parentId !== "0" && parent.parentId !== undefined) {
      const [grand] = await chrome.bookmarks.get(parent.parentId);
      if (grand.parentId !== undefined && grand.parentId !== "0") return;
    }

    await sortSingleBookmark(bm, settings);
  });
});

// ---- Runtime Message Handling ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "testApiKey") {
    testApiKey(msg.apiKey, msg.model)
      .then(res => sendResponse({ ok: true, data: res }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "getSettings") {
    getSettings()
      .then(settings => sendResponse({ ok: true, settings }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "getStats") {
    getBookmarkStats()
      .then(stats => sendResponse({ ok: true, stats }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "sortAll") {
    enqueue(async () => {
      try {
        const res = await sortAllBookmarks({
          dryRun: !!msg.dryRun,
          includeNested: !!msg.includeNested,
          onProgress: (prog) => {
            // Send live progress event
            chrome.runtime.sendMessage({ type: "sortProgress", ...prog }).catch(() => {});
          }
        });
        sendResponse(res);
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    });
    return true;
  }
});

// Open options page on extension icon click
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

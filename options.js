/**
 * Options Dashboard Controller
 * Handles AI settings, category chips, stats, and live batch sorting
 */

const isExtensionEnv = typeof chrome !== "undefined" && !!chrome.runtime?.sendMessage;

let currentCategories = [];
let allResults = [];

// DOM Elements
const $ = (id) => document.getElementById(id);

const apiKeyInput = $("apiKeyInput");
const toggleKeyBtn = $("toggleKeyVisibility");
const modelSelect = $("modelSelect");
const customModelInput = $("customModelInput");
const testKeyBtn = $("testKeyBtn");
const apiStatusBanner = $("apiStatusBanner");
const connectionStatusPill = $("connectionStatusPill");
const connectionStatusText = $("connectionStatusText");

const statTotal = $("statTotal");
const statSorted = $("statSorted");
const statCategories = $("statCategories");
const statModel = $("statModel");

const categoriesContainer = $("categoriesContainer");
const newCategoryInput = $("newCategoryInput");
const addCategoryBtn = $("addCategoryBtn");
const resetCategoriesBtn = $("resetCategoriesBtn");

const autoSortToggle = $("autoSortToggle");
const includeNestedToggle = $("includeNestedToggle");
const useFallbackToggle = $("useFallbackToggle");

const runSortBtn = $("runSortBtn");
const previewSortBtn = $("previewSortBtn");
const progressContainer = $("progressContainer");
const progressLabel = $("progressLabel");
const progressPercentage = $("progressPercentage");
const progressBarFill = $("progressBarFill");
const progressSubMsg = $("progressSubMsg");

const resultsTableWrapper = $("resultsTableWrapper");
const resultsTable = $("resultsTable");
const resultsBody = $("resultsBody");
const emptyResultsState = $("emptyResultsState");
const resultsCount = $("resultsCount");
const resultsSearch = $("resultsSearch");

/**
 * Safe messaging helper that works in both Extension environment and browser preview
 */
async function safeSendMessage(payload) {
  if (isExtensionEnv) {
    return await chrome.runtime.sendMessage(payload);
  }

  // Standalone browser preview mock
  if (payload.type === "getSettings") {
    return {
      ok: true,
      settings: {
        apiKey: localStorage.getItem("gemini_api_key") || "",
        model: localStorage.getItem("gemini_model") || "gemini-3.8-flash",
        standardCategories: JSON.parse(localStorage.getItem("gemini_categories") || "null") || [
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
      }
    };
  }

  if (payload.type === "getStats") {
    return {
      ok: true,
      stats: {
        totalBookmarks: 148,
        sortedBookmarks: 92,
        categoryCount: 12
      }
    };
  }

  if (payload.type === "testApiKey") {
    return { ok: true, data: { model: payload.model } };
  }

  if (payload.type === "sortAll") {
    return {
      ok: true,
      total: 8,
      moved: 8,
      dryRun: !!payload.dryRun,
      results: [
        { id: "1", title: "GitHub: Let's build from here", url: "https://github.com", category: "Coding & Development", reason: "Code hosting & Git platform", moved: true },
        { id: "2", title: "Google Gemini: Generative AI Assistant", url: "https://gemini.google.com", category: "AI & Machine Learning", reason: "Generative AI conversational LLM", moved: true },
        { id: "3", title: "Figma: Collaborative interface design", url: "https://figma.com", category: "Design & Creative", reason: "UI/UX design application", moved: true },
        { id: "4", title: "Coursera: Learn in-demand career skills", url: "https://coursera.org", category: "Learning & Education", reason: "Online accredited university courses", moved: true },
        { id: "5", title: "YouTube: Watch and upload videos", url: "https://youtube.com", category: "Entertainment & Media", reason: "Video streaming platform", moved: true },
        { id: "6", title: "Hacker News: Technology & startup discussions", url: "https://news.ycombinator.com", category: "News & Reading", reason: "Technology news aggregator", moved: true },
        { id: "7", title: "Airbnb: Vacation Rentals & Cabins", url: "https://airbnb.com", category: "Travel & Places", reason: "Travel lodging booking platform", moved: true },
        { id: "8", title: "Amazon: Online shopping for everything", url: "https://amazon.com", category: "Shopping & Deals", reason: "E-commerce online retail marketplace", moved: true }
      ]
    };
  }

  return null;
}

/**
 * Safe storage setter
 */
async function safeStorageSet(obj) {
  if (isExtensionEnv && chrome.storage?.sync) {
    await chrome.storage.sync.set(obj);
  } else {
    for (const [k, v] of Object.entries(obj)) {
      localStorage.setItem(`gemini_${k}`, typeof v === "string" ? v : JSON.stringify(v));
    }
  }
}

/**
 * Initialize Dashboard
 */
async function init() {
  await loadSettings();
  await refreshStats();
  setupEventListeners();
  setupProgressListener();
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  const res = await safeSendMessage({ type: "getSettings" });
  if (res && res.settings) {
    const s = res.settings;
    const currentModel = s.model || "gemini-3.8-flash";
    const standardOptions = ["gemini-3.8-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];
    if (standardOptions.includes(currentModel)) {
      modelSelect.value = currentModel;
      customModelInput.style.display = "none";
    } else {
      modelSelect.value = "custom";
      customModelInput.value = currentModel;
      customModelInput.style.display = "block";
    }
    statModel.textContent = currentModel;

    currentCategories = s.standardCategories || [];
    renderCategoryChips();

    autoSortToggle.checked = !!s.autoSort;
    includeNestedToggle.checked = !!s.includeNested;
    useFallbackToggle.checked = !!s.useFallbackRules;

    updateConnectionStatus(s.apiKey);
  }
}

/**
 * Update the header connection badge
 */
function updateConnectionStatus(apiKey, isValid = null) {
  if (!apiKey || !apiKey.trim()) {
    connectionStatusPill.className = "status-pill warning";
    connectionStatusText.textContent = "API Key Required";
    return;
  }

  if (isValid === false) {
    connectionStatusPill.className = "status-pill warning";
    connectionStatusText.textContent = "Invalid API Key";
    return;
  }

  connectionStatusPill.className = "status-pill connected";
  connectionStatusText.textContent = "Gemini Connected";
}

/**
 * Fetch and display bookmark statistics
 */
async function refreshStats() {
  try {
    const res = await safeSendMessage({ type: "getStats" });
    if (res && res.stats) {
      statTotal.textContent = res.stats.totalBookmarks ?? 0;
      statSorted.textContent = res.stats.sortedBookmarks ?? 0;
      statCategories.textContent = res.stats.categoryCount ?? 0;
    }
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}

/**
 * Render standard category chips
 */
function renderCategoryChips() {
  categoriesContainer.innerHTML = "";
  if (!currentCategories || currentCategories.length === 0) {
    categoriesContainer.innerHTML = `<span style="font-size: 12px; color: var(--text-dim);">No categories configured.</span>`;
    return;
  }

  currentCategories.forEach((cat, idx) => {
    const chip = document.createElement("div");
    chip.className = "category-chip";
    chip.innerHTML = `
      <span>${escapeHtml(cat)}</span>
      <button type="button" class="remove-cat-btn" data-index="${idx}" title="Remove category">&times;</button>
    `;
    categoriesContainer.appendChild(chip);
  });

  // Bind removal buttons
  categoriesContainer.querySelectorAll(".remove-cat-btn").forEach((btn) => {
    btn.onclick = async (e) => {
      const index = parseInt(e.currentTarget.getAttribute("data-index"), 10);
      currentCategories.splice(index, 1);
      await safeStorageSet({ standardCategories: currentCategories });
      renderCategoryChips();
    };
  });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Toggle password visibility
  toggleKeyBtn.onclick = () => {
    if (apiKeyInput.type === "password") {
      apiKeyInput.type = "text";
      toggleKeyBtn.textContent = "🔒";
    } else {
      apiKeyInput.type = "password";
      toggleKeyBtn.textContent = "👁️";
    }
  };

  function getSelectedModel() {
    if (modelSelect.value === "custom") {
      return customModelInput.value.trim() || "gemini-3.8-flash";
    }
    return modelSelect.value || "gemini-3.8-flash";
  }

  // Test and save API key
  testKeyBtn.onclick = async () => {
    const key = apiKeyInput.value.trim();
    const model = getSelectedModel();

    if (!key) {
      showStatusBanner("Please enter a Google Gemini API key.", "error");
      updateConnectionStatus(null);
      return;
    }

    testKeyBtn.disabled = true;
    testKeyBtn.innerHTML = `<span>⏳ Testing connection...</span>`;
    showStatusBanner("Connecting to Google Gemini...", "");

    try {
      const res = await safeSendMessage({
        type: "testApiKey",
        apiKey: key,
        model: model
      });

      if (res && res.ok) {
        await safeStorageSet({ apiKey: key, model: model });
        statModel.textContent = model;
        updateConnectionStatus(key, true);
        showStatusBanner(`✓ Connected successfully to Google Gemini (${model})!`, "success");
      } else {
        updateConnectionStatus(key, false);
        showStatusBanner(`Connection failed: ${res?.error || "Invalid response"}`, "error");
      }
    } catch (err) {
      updateConnectionStatus(key, false);
      showStatusBanner(`Error: ${err.message}`, "error");
    } finally {
      testKeyBtn.disabled = false;
      testKeyBtn.innerHTML = `<span>⚡ Test & Save Connection</span>`;
    }
  };

  // Model change auto-save
  modelSelect.onchange = async () => {
    if (modelSelect.value === "custom") {
      customModelInput.style.display = "block";
      customModelInput.focus();
    } else {
      customModelInput.style.display = "none";
    }
    const model = getSelectedModel();
    statModel.textContent = model;
    await safeStorageSet({ model });
  };

  customModelInput.oninput = async () => {
    const model = getSelectedModel();
    statModel.textContent = model;
    await safeStorageSet({ model });
  };

  // Add category
  addCategoryBtn.onclick = addCategory;
  newCategoryInput.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCategory();
    }
  };

  async function addCategory() {
    const val = newCategoryInput.value.trim();
    if (!val) return;
    if (currentCategories.some((c) => c.toLowerCase() === val.toLowerCase())) {
      newCategoryInput.value = "";
      return;
    }
    currentCategories.push(val);
    await safeStorageSet({ standardCategories: currentCategories });
    newCategoryInput.value = "";
    renderCategoryChips();
  }

  // Reset categories to default
  resetCategoriesBtn.onclick = async () => {
    try {
      currentCategories = [
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
      ];
      await safeStorageSet({ standardCategories: currentCategories });
      renderCategoryChips();
    } catch (e) {
      console.error(e);
    }
  };

  // Preference switches
  autoSortToggle.onchange = () => safeStorageSet({ autoSort: autoSortToggle.checked });
  includeNestedToggle.onchange = () => safeStorageSet({ includeNested: includeNestedToggle.checked });
  useFallbackToggle.onchange = () => safeStorageSet({ useFallbackRules: useFallbackToggle.checked });

  // Sorting actions
  runSortBtn.onclick = () => runSort(false);
  previewSortBtn.onclick = () => runSort(true);

  // Search filter
  resultsSearch.oninput = () => filterResults(resultsSearch.value.trim().toLowerCase());
}

/**
 * Setup listener for live progress messages from background service worker
 */
function setupProgressListener() {
  if (isExtensionEnv && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "sortProgress") {
        const pct = msg.total > 0 ? Math.round((msg.processed / msg.total) * 100) : 100;
        progressBarFill.style.width = pct + "%";
        progressPercentage.textContent = pct + "%";
        progressLabel.textContent = `Organizing bookmarks (${msg.processed} / ${msg.total})...`;
        progressSubMsg.textContent = `Processed ${msg.processed} bookmarks`;

        if (msg.currentBatch && msg.currentBatch.length > 0) {
          msg.currentBatch.forEach((item) => {
            allResults.unshift(item);
          });
          renderResultsTable(allResults);
        }
      }
    });
  }
}

/**
 * Execute Bookmark Sorting (Full or Dry Run)
 */
async function runSort(dryRun = false) {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey && !useFallbackToggle.checked && isExtensionEnv) {
    showStatusBanner("Please enter a Gemini API key or enable Offline Rule Fallback first.", "error");
    return;
  }

  runSortBtn.disabled = true;
  previewSortBtn.disabled = true;
  progressContainer.style.display = "block";
  progressBarFill.style.width = "0%";
  progressPercentage.textContent = "0%";
  progressLabel.textContent = dryRun ? "Previewing AI categorization..." : "Sorting bookmarks with Gemini AI...";
  progressSubMsg.textContent = "Scanning bookmarks...";

  allResults = [];
  emptyResultsState.style.display = "none";
  resultsTable.style.display = "table";
  resultsBody.innerHTML = "";
  resultsCount.textContent = "Starting...";

  try {
    const res = await safeSendMessage({
      type: "sortAll",
      dryRun: dryRun,
      includeNested: includeNestedToggle.checked
    });

    if (res && res.ok) {
      allResults = res.results || [];
      renderResultsTable(allResults);

      const actionWord = dryRun ? "Previewed" : "Organized";
      resultsCount.textContent = `${actionWord} ${res.moved} of ${res.total} bookmarks`;
      progressLabel.textContent = `Completed! ${actionWord} ${res.moved} bookmarks.`;
      progressBarFill.style.width = "100%";
      progressPercentage.textContent = "100%";
      progressSubMsg.textContent = `Finished ${res.total} bookmarks.`;

      await refreshStats();
    } else {
      resultsCount.textContent = `Error occurred`;
      progressLabel.textContent = `Sorting failed: ${res?.error || "Unknown error"}`;
      progressSubMsg.textContent = "Check API key and network connection.";
    }
  } catch (err) {
    resultsCount.textContent = `Error occurred`;
    progressLabel.textContent = `Error: ${err.message}`;
  } finally {
    runSortBtn.disabled = false;
    previewSortBtn.disabled = false;
  }
}

/**
 * Render results in the table
 */
function renderResultsTable(items) {
  if (!items || items.length === 0) {
    emptyResultsState.style.display = "block";
    resultsTable.style.display = "none";
    return;
  }

  emptyResultsState.style.display = "none";
  resultsTable.style.display = "table";
  resultsBody.innerHTML = "";

  items.slice(0, 100).forEach((item) => {
    const tr = document.createElement("tr");

    let statusBadge = "";
    if (item.moved) {
      statusBadge = `<span class="status-tag moved">Moved</span>`;
    } else if (item.category !== "Uncategorized") {
      statusBadge = `<span class="status-tag preview">In Place</span>`;
    } else {
      statusBadge = `<span class="status-tag skipped">Skipped</span>`;
    }

    let domain = "";
    try {
      domain = new URL(item.url).hostname.replace(/^www\./, "");
    } catch {
      domain = item.url || "";
    }

    tr.innerHTML = `
      <td class="bm-title-cell">
        <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="bm-link" title="${escapeHtml(item.title)}">
          ${escapeHtml(item.title || "Untitled")}
        </a>
        <span class="bm-url">${escapeHtml(domain)}</span>
      </td>
      <td>
        <span class="folder-badge">📁 ${escapeHtml(item.category || "Uncategorized")}</span>
      </td>
      <td style="font-size: 12px; color: var(--text-muted);">
        ${escapeHtml(item.reason || "AI categorized")}
      </td>
      <td>
        ${statusBadge}
      </td>
    `;
    resultsBody.appendChild(tr);
  });
}

/**
 * Filter results table
 */
function filterResults(query) {
  if (!query) {
    renderResultsTable(allResults);
    return;
  }

  const filtered = allResults.filter((item) => {
    const title = (item.title || "").toLowerCase();
    const url = (item.url || "").toLowerCase();
    const cat = (item.category || "").toLowerCase();
    const reason = (item.reason || "").toLowerCase();
    return title.includes(query) || url.includes(query) || cat.includes(query) || reason.includes(query);
  });

  renderResultsTable(filtered);
}

/**
 * Show alert banner in UI
 */
function showStatusBanner(msg, type = "success") {
  if (!msg) {
    apiStatusBanner.style.display = "none";
    return;
  }
  apiStatusBanner.className = `feedback-banner ${type}`;
  apiStatusBanner.textContent = msg;
  apiStatusBanner.style.display = "block";
}

/**
 * Escape HTML to prevent injection
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Start
init();

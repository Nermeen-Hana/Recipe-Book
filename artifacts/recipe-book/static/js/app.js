/* ===================== STATE ===================== */
let currentRecipeNumber = null;
let previousTab = "index";
let bookmarks = [];
let allRecipes = [];
let fileUploaded = false;

/* ===================== UTILS ===================== */
const $ = (id) => document.getElementById(id);
const show = (el) => { el.style.display = ""; };
const hide = (el) => { el.style.display = "none"; };

/* ===================== TAB NAVIGATION ===================== */
function switchTab(tabName) {
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));

  const panel = $(`tab-${tabName}`);
  const btn = document.querySelector(`.nav-btn[data-tab="${tabName}"]`);
  if (panel) panel.classList.add("active");
  if (btn) btn.classList.add("active");

  if (tabName !== "recipe") previousTab = tabName;

  if (tabName === "index" && fileUploaded) loadIndex();
  if (tabName === "bookmarks") loadBookmarks();
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

/* ===================== FILE MANAGEMENT ===================== */
async function checkFileStatus() {
  try {
    const r = await fetch("/api/file-status");
    const data = await r.json();
    fileUploaded = data.uploaded;
    if (data.uploaded) {
      showFileInfo(data.filename);
    } else {
      showNoFile();
    }
  } catch (e) {
    showNoFile();
  }
}

function showFileInfo(filename) {
  hide($("noFileArea"));
  const area = $("fileInfoArea");
  show(area);
  area.style.display = "flex";
  $("filenameLabel").textContent = `📄 ${filename}`;
  fileUploaded = true;
  $("searchContent").style.display = "block";
  hide($("searchEmpty"));
  $("bookmarksContent").style.display = "block";
  hide($("bookmarksEmpty"));
  loadIndex();
  loadBookmarks();
}

function showNoFile() {
  show($("noFileArea"));
  $("noFileArea").style.display = "flex";
  hide($("fileInfoArea"));
  fileUploaded = false;
  showEmptyStates();
}

function showEmptyStates() {
  $("indexContent").innerHTML = "";
  show($("indexEmpty"));
  $("searchContent").style.display = "none";
  show($("searchEmpty"));
  $("bookmarksContent").style.display = "none";
  show($("bookmarksEmpty"));
}

$("fileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append("file", file);
  try {
    const r = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await r.json();
    if (data.success) {
      showFileInfo(file.name);
    } else {
      alert(data.error || "Upload failed");
    }
  } catch (err) {
    alert("Upload error: " + err.message);
  }
  e.target.value = "";
});

$("updateBtn").addEventListener("click", async () => {
  try {
    await loadIndex();
    await loadBookmarks();
    $("updateBtn").textContent = "✓";
    setTimeout(() => { $("updateBtn").textContent = "↻ Update"; }, 1500);
  } catch (e) {
    alert("Error updating: " + e.message);
  }
});

$("removeFileBtn").addEventListener("click", async () => {
  if (!confirm("Remove the recipe file? This won't delete bookmarks.")) return;
  await fetch("/api/remove-file", { method: "POST" });
  showNoFile();
  switchTab("index");
});

/* ===================== INDEX ===================== */
const SECTIONS = [
  "Breakfasts: Savory",
  "Breakfasts: Sweet",
  "Breakfasts: Breads, Bases & Baked Snacks",
  "Lunches",
  "Husband Only ⚠️",
];

async function loadIndex() {
  if (!fileUploaded) return;
  hide($("indexEmpty"));
  const container = $("indexContent");
  container.innerHTML = `<div class="loading">Loading recipes…</div>`;

  try {
    const r = await fetch("/api/recipes");
    allRecipes = await r.json();

    if (allRecipes.length === 0) {
      container.innerHTML = `<div class="empty-state">No recipes found in this file.</div>`;
      return;
    }

    let html = "";
    SECTIONS.forEach(sectionName => {
      const matches = allRecipes.filter(rec => rec.section === sectionName);
      if (matches.length === 0) return;
      html += `
        <div class="category-section" data-cat="${escHtml(sectionName)}">
          <div class="category-header">
            <span class="category-title">${escHtml(sectionName)}</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="category-count">${matches.length}</span>
              <span class="chevron">▼</span>
            </div>
          </div>
          <div class="category-body">
            ${matches.map(rec => `
              <div class="recipe-link" data-num="${rec.number}">
                <span class="recipe-num">${rec.number}</span>
                <span class="recipe-title-text">${escHtml(rec.title)}</span>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Toggle accordion
    container.querySelectorAll(".category-header").forEach(header => {
      header.addEventListener("click", () => {
        const section = header.closest(".category-section");
        section.classList.toggle("open");
      });
      // Start open
      header.closest(".category-section").classList.add("open");
    });

    // Recipe links
    container.querySelectorAll(".recipe-link").forEach(link => {
      link.addEventListener("click", () => openRecipe(parseInt(link.dataset.num)));
    });

  } catch (e) {
    container.innerHTML = `<div class="empty-state">Error loading recipes.</div>`;
  }
}

/* ===================== SEARCH ===================== */
function setupSearch() {
  const btn = $("searchBtn");
  const input = $("ingredientInput");
  btn.addEventListener("click", doSearch);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });
}

async function doSearch() {
  if (!fileUploaded) return;
  const query = $("ingredientInput").value.trim();
  if (!query) return;
  const results = $("searchResults");
  results.innerHTML = `<div class="loading">Searching…</div>`;
  try {
    const r = await fetch(`/api/search?ingredient=${encodeURIComponent(query)}`);
    const data = await r.json();
    if (data.length === 0) {
      results.innerHTML = `<div class="no-results">No recipes found with that ingredient.</div>`;
      return;
    }
    results.innerHTML = data.map(rec => {
      const matchedHtml = (rec.matched || []).map(m => {
        const highlighted = escHtml(m).replace(
          new RegExp(`(${escRegex(query)})`, "gi"),
          `<mark>$1</mark>`
        );
        return `<span class="match-line">🔸 ${highlighted}</span>`;
      }).join("");
      return `
        <div class="result-card" data-num="${rec.number}">
          <span class="recipe-num">${rec.number}</span>
          <div class="result-card-info">
            <div class="result-card-title">${escHtml(rec.title)}</div>
            ${matchedHtml ? `<div class="result-card-matched">${matchedHtml}</div>` : ""}
          </div>
        </div>
      `;
    }).join("");
    results.querySelectorAll(".result-card").forEach(card => {
      card.addEventListener("click", () => openRecipe(parseInt(card.dataset.num)));
    });
  } catch (e) {
    results.innerHTML = `<div class="no-results">Search error.</div>`;
  }
}

/* ===================== RECIPE VIEWER ===================== */
async function openRecipe(number) {
  currentRecipeNumber = number;
  switchTab("recipe");

  hide($("recipeEmpty"));
  const content = $("recipeContent");
  show(content);
  content.style.display = "block";
  $("recipeHtml").innerHTML = `<div class="loading">Loading recipe…</div>`;

  try {
    const r = await fetch(`/api/recipe/${number}`);
    const data = await r.json();
    $("recipeHtml").innerHTML = data.html;
    addCopyButtons($("recipeHtml"));

    // Bookmark state
    const isBookmarked = bookmarks.some(b => b.number === number || b.title === data.title);
    updateBookmarkBtn(isBookmarked);

    const bBtn = $("bookmarkBtn");
    bBtn.onclick = () => toggleBookmark(number, data.title);
  } catch (e) {
    $("recipeHtml").innerHTML = `<div class="empty-state">Error loading recipe.</div>`;
  }
}

function updateBookmarkBtn(isBookmarked) {
  const btn = $("bookmarkBtn");
  if (isBookmarked) {
    btn.textContent = "🔖 Bookmarked";
    btn.classList.add("bookmarked");
  } else {
    btn.textContent = "🔖 Bookmark";
    btn.classList.remove("bookmarked");
  }
}

async function toggleBookmark(number, title) {
  try {
    const r = await fetch("/api/bookmark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number, title }),
    });
    const data = await r.json();
    updateBookmarkBtn(data.bookmarked);
    await loadBookmarks();
  } catch (e) {
    alert("Bookmark error: " + e.message);
  }
}

$("backBtn").addEventListener("click", () => {
  switchTab(previousTab || "index");
});

/* ===================== BOOKMARKS ===================== */
async function loadBookmarks() {
  try {
    const r = await fetch("/api/bookmarks");
    bookmarks = await r.json();
  } catch (e) {
    bookmarks = [];
  }

  const list = $("bookmarksList");

  if (!fileUploaded) {
    $("bookmarksContent").style.display = "none";
    show($("bookmarksEmpty"));
    return;
  }

  show($("bookmarksContent"));
  $("bookmarksContent").style.display = "block";
  hide($("bookmarksEmpty"));

  if (bookmarks.length === 0) {
    list.innerHTML = `<div class="no-bookmarks">No bookmarks yet — tap 🔖 on any recipe to save it.</div>`;
    return;
  }

  list.innerHTML = bookmarks.map(b => `
    <div class="bookmark-item" data-num="${b.number}" data-title="${escAttr(b.title)}">
      <span class="recipe-num">${b.number || "?"}</span>
      <span class="bookmark-item-title">${escHtml(b.title)}</span>
      <button class="remove-bookmark" data-title="${escAttr(b.title)}" title="Remove bookmark">×</button>
    </div>
  `).join("");

  list.querySelectorAll(".bookmark-item").forEach(item => {
    item.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-bookmark")) return;
      const num = parseInt(item.dataset.num);
      if (num) openRecipe(num);
    });
  });

  list.querySelectorAll(".remove-bookmark").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const title = btn.dataset.title;
      const matching = bookmarks.find(b => b.title === title);
      if (matching) await toggleBookmark(matching.number, title);
    });
  });
}

/* ===================== COPY BUTTONS ===================== */
function addCopyButtons(container) {
  container.querySelectorAll("h1, h2, h3, h4").forEach(h => {
    const btn = document.createElement("button");
    btn.className = "copy-section-btn";
    btn.textContent = "Copy";
    btn.title = "Copy this section";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      copySection(h, btn);
    });
    h.appendChild(btn);
  });
}

function copySection(headingEl, btn) {
  const level = parseInt(headingEl.tagName[1]);

  const headingText = Array.from(headingEl.childNodes)
    .filter(n => !(n.nodeType === Node.ELEMENT_NODE && n.classList.contains("copy-section-btn")))
    .map(n => n.textContent)
    .join("").trim();

  const parts = [headingText];

  let sibling = headingEl.nextElementSibling;
  while (sibling) {
    const tag = sibling.tagName;
    if (/^H[1-6]$/.test(tag) && parseInt(tag[1]) <= level) break;
    const text = sibling.innerText || sibling.textContent || "";
    if (text.trim()) parts.push(text.trim());
    sibling = sibling.nextElementSibling;
  }

  const text = parts.join("\n\n");
  const finish = () => {
    btn.textContent = "✓ Copied";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 2000);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(finish).catch(() => fallbackCopy(text, finish));
  } else {
    fallbackCopy(text, finish);
  }
}

function fallbackCopy(text, finish) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;top:-999px;left:-999px;opacity:0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand("copy"); } catch (_) {}
  document.body.removeChild(ta);
  finish();
}

/* ===================== HELPERS ===================== */
function escHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escAttr(str) {
  if (!str) return "";
  return str.replace(/"/g, "&quot;");
}
function escRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ===================== INIT ===================== */
async function init() {
  await checkFileStatus();
  if (fileUploaded) {
    $("searchContent").style.display = "block";
    hide($("searchEmpty"));
  }
  setupSearch();
  switchTab("index");
}

init();

const VIDEO_RECORD_PREFIX = "bilibiliTimestampBookmarkVideo:";
let tabId;
let state;
let selected = new Set();
const language = /^zh/i.test(navigator.language) ? "zh" : "en";
const messages = {
  en: {
    title: "Timestamp bookmarks", bookmarks: "Bookmarks", videos: "Saved videos",
    notePlaceholder: "Add a note (optional)", noteLabel: "Bookmark note", save: "+ Save",
    loopHint: "Select 2 timestamps to loop.", loop: "Loop", stop: "Stop",
    selectLoop: "Select loop point", noBookmarks: "No bookmarks yet.", noNote: "No note",
    edit: "Edit note", saveEdit: "Save note", cancelEdit: "Cancel editing",
    remove: "Delete bookmark", search: "Search saved videos",
    noVideos: "No saved videos.", removeVideo: "Delete saved video", noTab: "No active tab.",
    unsupported: "Open a supported Bilibili video first."
  },
  zh: {
    title: "时间戳书签", bookmarks: "书签", videos: "已保存视频",
    notePlaceholder: "添加备注（可选）", noteLabel: "书签备注", save: "+ 保存",
    loopHint: "选择 2 个时间戳进行循环。", loop: "循环", stop: "停止",
    selectLoop: "选择循环时间点", noBookmarks: "暂无书签。", noNote: "无备注",
    edit: "编辑备注", saveEdit: "保存备注", cancelEdit: "取消编辑",
    remove: "删除书签", search: "搜索已保存视频",
    noVideos: "暂无已保存视频。", removeVideo: "删除已保存视频", noTab: "没有活动标签页。",
    unsupported: "请先打开支持的哔哩哔哩视频。"
  }
};
const t = (key) => messages[language][key];

const $ = (selector) => document.querySelector(selector);
function applyLanguage() {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.title = t("title");
  $('.tab[data-view="bookmarks"]').textContent = t("bookmarks");
  $('.tab[data-view="videos"]').textContent = t("videos");
  $("#note").placeholder = t("notePlaceholder");
  $("#note").setAttribute("aria-label", t("noteLabel"));
  $("#save").textContent = t("save");
  $(".loop-hint").textContent = t("loopHint");
  $("#video-search").placeholder = t("search");
  $("#video-search").setAttribute("aria-label", t("search"));
}
const icon = (name) => {
  const paths = {
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
};
const formatTime = (value) => {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

async function send(message) {
  return chrome.tabs.sendMessage(tabId, message);
}

function showStatus(text) {
  $("#status").textContent = text;
  $("#status").hidden = false;
  $("#bookmarks-view").hidden = true;
  $("#videos-view").hidden = true;
}

function renderLoop() {
  const chosen = state.bookmarks.filter((item) => selected.has(item.id)).sort((a, b) => a.time - b.time);
  const active = state.loopRange;
  $("#loop-bar").hidden = chosen.length !== 2 && !active;
  $("#loop-range").textContent = active
    ? `${formatTime(active.start)}–${formatTime(active.end)}`
    : chosen.length === 2 ? `${formatTime(chosen[0].time)}–${formatTime(chosen[1].time)}` : "";
  $("#loop-toggle").textContent = active ? t("stop") : t("loop");
}

function renderBookmarks() {
  const list = $("#bookmark-list");
  list.replaceChildren();
  if (!state.bookmarks.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t("noBookmarks");
    list.append(empty);
    return;
  }
  for (const bookmark of state.bookmarks) {
    const row = document.createElement("div");
    row.className = "row";
    const pick = document.createElement("input");
    pick.className = "pick";
    pick.type = "checkbox";
    pick.title = t("selectLoop");
    pick.checked = selected.has(bookmark.id);
    pick.addEventListener("change", () => {
      if (pick.checked) {
        if (selected.size >= 2) {
          pick.checked = false;
          return;
        }
        selected.add(bookmark.id);
      } else selected.delete(bookmark.id);
      renderLoop();
    });
    const jump = document.createElement("button");
    jump.className = "row-link";
    jump.innerHTML = `<span class="time">${formatTime(bookmark.time)}</span><span class="note"></span>`;
    jump.querySelector(".note").textContent = bookmark.note || "";
    jump.addEventListener("click", () => send({ type: "BTB_SEEK", time: bookmark.time }));
    const edit = document.createElement("button");
    edit.className = "edit";
    edit.innerHTML = icon("edit");
    edit.title = t("edit");
    edit.addEventListener("click", () => {
      const editor = document.createElement("div");
      editor.className = "inline-editor";
      const input = document.createElement("input");
      input.value = bookmark.note || "";
      input.maxLength = 120;
      input.setAttribute("aria-label", t("edit"));
      const save = document.createElement("button");
      save.innerHTML = icon("check");
      save.title = t("saveEdit");
      save.setAttribute("aria-label", t("saveEdit"));
      const cancel = document.createElement("button");
      cancel.innerHTML = icon("close");
      cancel.title = t("cancelEdit");
      cancel.setAttribute("aria-label", t("cancelEdit"));
      const commit = async () => {
        const result = await send({ type: "BTB_EDIT", id: bookmark.id, note: input.value });
        state.bookmarks = result.bookmarks;
        renderBookmarks();
      };
      save.addEventListener("click", commit);
      cancel.addEventListener("click", renderBookmarks);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") renderBookmarks();
      });
      editor.append(input, save, cancel);
      row.replaceChildren(editor);
      input.focus();
      input.select();
    });
    const remove = document.createElement("button");
    remove.className = "delete";
    remove.innerHTML = icon("trash");
    remove.title = t("remove");
    remove.addEventListener("click", async () => {
      const result = await send({ type: "BTB_DELETE", id: bookmark.id });
      state.bookmarks = result.bookmarks;
      selected.delete(bookmark.id);
      renderBookmarks();
      renderLoop();
    });
    row.append(pick, jump, edit, remove);
    list.append(row);
  }
}

async function renderVideos() {
  const stored = await chrome.storage.sync.get(null);
  const query = $("#video-search").value.trim().toLowerCase();
  const entries = Object.entries(stored)
    .filter(([key, value]) => key.startsWith(VIDEO_RECORD_PREFIX) && value?.bookmarks?.length)
    .map(([key, value]) => ({ key: key.slice(VIDEO_RECORD_PREFIX.length), ...value }))
    .filter((entry) => `${entry.meta?.title || ""} ${entry.key}`.toLowerCase().includes(query))
    .sort((a, b) => (b.meta?.updatedAt || 0) - (a.meta?.updatedAt || 0));
  const list = $("#video-list");
  list.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t("noVideos");
    list.append(empty);
  }
  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "video-item";
    const link = document.createElement("a");
    link.className = "video-row";
    link.href = entry.meta?.url || "https://www.bilibili.com/";
    link.target = "_blank";
    const title = document.createElement("span");
    title.className = "video-title";
    title.textContent = entry.meta?.title || entry.key;
    link.append(title);
    const remove = document.createElement("button");
    remove.className = "video-delete";
    remove.innerHTML = icon("trash");
    remove.title = t("removeVideo");
    remove.setAttribute("aria-label", t("removeVideo"));
    remove.addEventListener("click", async () => {
      const result = await send({ type: "BTB_DELETE_VIDEO", videoKey: entry.key });
      if (result.currentCleared) {
        state.bookmarks = result.bookmarks;
        state.loopRange = null;
        selected.clear();
        renderBookmarks();
        renderLoop();
      }
      await renderVideos();
    });
    row.append(link, remove);
    list.append(row);
  }
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  if (!tabId) return showStatus(t("noTab"));
  try {
    state = await send({ type: "BTB_GET_STATE" });
  } catch {
    return showStatus(t("unsupported"));
  }
  if (!state?.ok) return showStatus(t("unsupported"));
  const bookmarksTab = $('.tab[data-view="bookmarks"]');
  const videosTab = $('.tab[data-view="videos"]');
  const videosOnly = !state.videoKey;
  bookmarksTab.hidden = videosOnly;
  $(".tabs").classList.toggle("single-view", videosOnly);
  bookmarksTab.classList.toggle("active", !videosOnly);
  videosTab.classList.toggle("active", videosOnly);
  $("#bookmarks-view").hidden = videosOnly;
  $("#videos-view").hidden = !videosOnly;
  if (videosOnly) await renderVideos();
  else {
    renderBookmarks();
    renderLoop();
  }
}

function reportHeight() {
  if (window.parent === window) return;
  const app = $("#app");
  window.parent.postMessage({
    type: "BTB_POPUP_HEIGHT",
    height: Math.ceil(app.getBoundingClientRect().height)
  }, "*");
}

$("#save").addEventListener("click", async () => {
  const result = await send({ type: "BTB_ADD_BOOKMARK", note: $("#note").value });
  state.bookmarks = result.bookmarks;
  $("#note").value = "";
  renderBookmarks();
});
$("#note").addEventListener("keydown", (event) => { if (event.key === "Enter") $("#save").click(); });
$("#loop-toggle").addEventListener("click", async () => {
  if (state.loopRange) {
    const result = await send({ type: "BTB_SET_LOOP" });
    state.loopRange = result.loopRange;
  } else {
    const chosen = state.bookmarks.filter((item) => selected.has(item.id)).sort((a, b) => a.time - b.time);
    if (chosen.length !== 2) return;
    const result = await send({ type: "BTB_SET_LOOP", start: chosen[0].time, end: chosen[1].time });
    state.loopRange = result.loopRange;
  }
  renderLoop();
});
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
  const videos = tab.dataset.view === "videos";
  $("#bookmarks-view").hidden = videos;
  $("#videos-view").hidden = !videos;
  if (videos) renderVideos().then(reportHeight);
  else requestAnimationFrame(reportHeight);
}));
$("#video-search").addEventListener("input", renderVideos);
applyLanguage();
init();

if (window.parent !== window) {
  new ResizeObserver(reportHeight).observe($("#app"));
  window.addEventListener("message", (event) => {
    if (event.data?.type === "BTB_REFRESH") init();
    if (event.data?.type === "BTB_BOOKMARKS_UPDATED" && state && Array.isArray(event.data.bookmarks)) {
      state.bookmarks = event.data.bookmarks;
      renderBookmarks();
      renderLoop();
      requestAnimationFrame(reportHeight);
    }
  });
  requestAnimationFrame(reportHeight);
}

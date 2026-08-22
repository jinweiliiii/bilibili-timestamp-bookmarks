(() => {
  "use strict";

  const ROOT_ID = "btb-root";
  const FLOATING_PANEL_ID = "btb-floating-panel";
  const STORAGE_KEY = "bilibiliTimestampBookmarks";
  const VIDEO_META_KEY = "bilibiliTimestampBookmarkVideos";
  const VIDEO_RECORD_PREFIX = "bilibiliTimestampBookmarkVideo:";
  const MIGRATION_BACKUP_KEY = "bilibiliTimestampBookmarkMigrationBackup";
  const MAX_NOTE_LENGTH = 120;
  let currentVideoKey = null;
  let currentRouteKey = null;
  let legacyVideoKey = null;
  let resolvingRoute = false;
  let fullscreenFadeTimer = null;
  let toastTimer = null;
  let showAllVideos = false;
  let loopRange = null;
  let bookmarks = [];
  let language = /^zh/i.test(navigator.language) ? "zh" : "en";

  const messages = {
    en: {
      title: "Timestamp bookmarks",
      hide: "Hide bookmark panel",
      show: "Show bookmarks",
      notePlaceholder: "Add a note (optional)",
      noteLabel: "Bookmark note",
      save: "+ Save",
      saveTitle: "Save current timestamp",
      quickSaveTitle: "Save timestamp",
      bookmarksTab: "Bookmarks",
      videosTab: "Saved videos",
      noSavedVideos: "No saved videos yet.",
      noVideoResults: "No videos match your search.",
      searchVideos: "Search saved videos",
      savedVideoCount: "{count} saved videos",
      bookmarkCount: "{count} bookmarks",
      showAllVideos: "Show all {count} videos",
      showFewerVideos: "Show recent videos",
      removeVideo: "Remove saved video",
      videoDeleted: "Saved video removed",
      storageError: "Could not save. Chrome Sync storage may be full.",
      openVideo: "Open video",
      empty: "No bookmarks yet.",
      jump: "Jump to",
      remove: "Delete bookmark",
      editNote: "Edit note",
      saveEdit: "Save note",
      cancelEdit: "Cancel editing",
      noNote: "No note",
      savedAt: "Saved at {time}",
      updatedAt: "Updated bookmark at {time}",
      deleted: "Bookmark deleted",
      undo: "Undo",
      switchLanguage: "切换到中文"
    },
    zh: {
      title: "时间戳书签",
      hide: "隐藏书签面板",
      show: "显示书签",
      notePlaceholder: "添加备注（可选）",
      noteLabel: "书签备注",
      save: "+ 保存",
      saveTitle: "保存当前时间戳",
      quickSaveTitle: "保存时间戳",
      bookmarksTab: "书签",
      videosTab: "已保存视频",
      noSavedVideos: "暂无已保存视频。",
      noVideoResults: "没有匹配的已保存视频。",
      searchVideos: "搜索已保存视频",
      savedVideoCount: "已保存 {count} 个视频",
      bookmarkCount: "{count} 个书签",
      showAllVideos: "显示全部 {count} 个视频",
      showFewerVideos: "仅显示最近视频",
      removeVideo: "移除已保存视频",
      videoDeleted: "已移除保存的视频",
      storageError: "无法保存，Chrome 同步空间可能已满。",
      openVideo: "打开视频",
      empty: "暂无书签。",
      jump: "跳转到",
      remove: "删除书签",
      editNote: "编辑备注",
      saveEdit: "保存备注",
      cancelEdit: "取消编辑",
      noNote: "无备注",
      savedAt: "已保存 {time}",
      updatedAt: "已更新时间点 {time}",
      deleted: "书签已删除",
      undo: "撤销",
      switchLanguage: "Switch to English"
    }
  };

  function t(key) {
    return messages[language][key];
  }

  function icon(name) {
    const paths = {
      minus: '<path d="M5 12h14"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      close: '<path d="m6 6 12 12M18 6 6 18"/>',
      edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
      trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
  }

  function showToast(message, actionLabel, action) {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    clearTimeout(toastTimer);
    root.querySelector(".btb-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "btb-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    const text = document.createElement("span");
    text.textContent = message;
    toast.append(text);
    if (actionLabel && action) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = actionLabel;
      button.addEventListener("click", async () => {
        toast.remove();
        clearTimeout(toastTimer);
        await action();
      });
      toast.append(button);
    }
    root.append(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    toastTimer = setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 180);
    }, 4000);
  }

  function getRouteKey() {
    const params = new URLSearchParams(location.search);
    const pathMatch = location.pathname.match(/\/video\/((?:BV|av)[a-zA-Z0-9]+)/i);
    const bangumiMatch = location.pathname.match(/\/bangumi\/play\/(ep\d+)/i);
    const queryId = params.get("bvid") || (params.get("aid") ? `av${params.get("aid")}` : null);
    const videoId = pathMatch?.[1] || bangumiMatch?.[1] || queryId;
    if (!videoId || !/^(?:(?:BV|av)[a-zA-Z0-9]+|ep\d+)$/i.test(videoId)) return null;
    const page = Math.max(1, Number.parseInt(params.get("p") || "1", 10) || 1);
    return `${videoId.toUpperCase()}:p${page}`;
  }

  function findEpisodeBvid(value, episodeId) {
    if (!value || typeof value !== "object") return null;
    if (Number(value.id) === episodeId && /^BV[a-zA-Z0-9]+$/i.test(value.bvid || "")) {
      return value.bvid;
    }
    for (const child of Object.values(value)) {
      const match = findEpisodeBvid(child, episodeId);
      if (match) return match;
    }
    return null;
  }

  async function resolveVideoKey(routeKey) {
    const bangumi = routeKey?.match(/^EP(\d+):p\d+$/i);
    if (!bangumi) return routeKey;
    try {
      const response = await fetch(`https://api.bilibili.com/pgc/view/web/season?ep_id=${bangumi[1]}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const bvid = findEpisodeBvid(payload.result, Number(bangumi[1]));
      return bvid ? `${bvid.toUpperCase()}:p1` : routeKey;
    } catch (error) {
      console.warn("Bilibili Timestamp Bookmarks: could not resolve Bangumi BV ID", error);
      return routeKey;
    }
  }

  function getVideo() {
    const videos = [...document.querySelectorAll("video")];
    return videos.find((video) => video.duration > 0 && video.offsetParent) || videos[0];
  }

  function formatTime(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  }

  function videoRecordKey(videoKey) {
    return `${VIDEO_RECORD_PREFIX}${videoKey}`;
  }

  function mergeBookmarks(primary = [], secondary = []) {
    const merged = [...primary];
    for (const item of secondary) {
      const alreadyPresent = merged.some((saved) =>
        saved.id === item.id || (saved.time === item.time && saved.note === item.note)
      );
      if (!alreadyPresent) merged.push(item);
    }
    return merged.sort((a, b) => a.time - b.time);
  }

  async function migrateLegacyStorage() {
    const stored = await chrome.storage.sync.get(null);
    const legacyBookmarks = stored[STORAGE_KEY] || {};
    const legacyMetadata = stored[VIDEO_META_KEY] || {};
    const legacyKeys = Object.keys(legacyBookmarks);
    if (!legacyKeys.length && !Object.keys(legacyMetadata).length) return;

    const previous = {};
    const records = {};
    for (const [key, items] of Object.entries(legacyBookmarks)) {
      if (!Array.isArray(items) || !items.length) continue;
      const storageKey = videoRecordKey(key);
      const existing = stored[storageKey] || {};
      previous[storageKey] = stored[storageKey];
      records[storageKey] = {
        bookmarks: mergeBookmarks(existing.bookmarks || [], items),
        meta: (existing.meta?.updatedAt || 0) >= (legacyMetadata[key]?.updatedAt || 0)
          ? (existing.meta || {})
          : legacyMetadata[key]
      };
    }

    await chrome.storage.local.set({
      [MIGRATION_BACKUP_KEY]: { legacyBookmarks, legacyMetadata, previous }
    });
    try {
      await chrome.storage.sync.remove([STORAGE_KEY, VIDEO_META_KEY]);
      if (Object.keys(records).length) await chrome.storage.sync.set(records);
      await chrome.storage.local.remove(MIGRATION_BACKUP_KEY);
    } catch (error) {
      await chrome.storage.sync.remove(Object.keys(records));
      const restore = {
        [STORAGE_KEY]: legacyBookmarks,
        [VIDEO_META_KEY]: legacyMetadata
      };
      for (const [key, value] of Object.entries(previous)) {
        if (value !== undefined) restore[key] = value;
      }
      await chrome.storage.sync.set(restore);
      console.error("Bilibili Timestamp Bookmarks: storage migration failed", error);
    }
  }

  async function readVideoRecord(videoKey) {
    if (!videoKey) return null;
    return (await chrome.storage.sync.get(videoRecordKey(videoKey)))[videoRecordKey(videoKey)] || null;
  }

  async function readAllVideoRecords() {
    const stored = await chrome.storage.sync.get(null);
    return Object.entries(stored)
      .filter(([key, value]) => key.startsWith(VIDEO_RECORD_PREFIX) && Array.isArray(value?.bookmarks) && value.bookmarks.length)
      .map(([storageKey, value]) => ({
        key: storageKey.slice(VIDEO_RECORD_PREFIX.length),
        items: value.bookmarks,
        meta: value.meta || {}
      }));
  }

  async function loadBookmarks() {
    if (!currentVideoKey) return;
    const [canonicalRecord, legacyRecord] = await Promise.all([
      readVideoRecord(currentVideoKey),
      legacyVideoKey ? readVideoRecord(legacyVideoKey) : Promise.resolve(null)
    ]);
    bookmarks = mergeBookmarks(canonicalRecord?.bookmarks || [], legacyRecord?.bookmarks || []);
    if (legacyRecord?.bookmarks?.length) {
      if (await saveBookmarks()) {
        await chrome.storage.sync.remove(videoRecordKey(legacyVideoKey));
      }
    }
    renderList();
  }

  async function saveBookmarks() {
    if (!currentVideoKey) return;
    const key = videoRecordKey(currentVideoKey);
    try {
      if (!bookmarks.length) {
        await chrome.storage.sync.remove(key);
        return true;
      }
      await chrome.storage.sync.set({
        [key]: {
          bookmarks,
          meta: { title: cleanVideoTitle(), url: location.href, updatedAt: Date.now() }
        }
      });
      return true;
    } catch (error) {
      console.error("Bilibili Timestamp Bookmarks: could not save bookmarks", error);
      showToast(t("storageError"));
      return false;
    }
  }

  function cleanVideoTitle() {
    return document.title
      .replace(/[_\-]\s*哔哩哔哩.*$/i, "")
      .replace(/\s*[-_]\s*bilibili.*$/i, "")
      .trim() || currentVideoKey;
  }

  function fallbackVideoUrl(key) {
    const match = key.match(/^((?:BV|AV)[A-Z0-9]+|EP\d+):p(\d+)$/i);
    if (!match) return "https://www.bilibili.com/";
    const page = Number(match[2]);
    if (/^EP/i.test(match[1])) return `https://www.bilibili.com/bangumi/play/${match[1].toLowerCase()}`;
    return `https://www.bilibili.com/video/${match[1]}${page > 1 ? `?p=${page}` : ""}`;
  }

  function seekTo(time) {
    const video = getVideo();
    if (!video) return;
    video.currentTime = time;
    video.play().catch(() => {});
  }

  async function addBookmark() {
    const video = getVideo();
    const input = document.querySelector(`#${ROOT_ID} .btb-note`);
    if (!video || !Number.isFinite(video.currentTime)) {
      return;
    }

    const previous = bookmarks.map((item) => ({ ...item }));
    const time = Math.floor(video.currentTime);
    const note = input.value.trim().slice(0, MAX_NOTE_LENGTH);
    const duplicate = bookmarks.find((item) => Math.abs(item.time - time) < 2);
    if (duplicate) {
      duplicate.note = note || duplicate.note;
      duplicate.updatedAt = Date.now();
    } else {
      bookmarks.push({ id: crypto.randomUUID(), time, note, createdAt: Date.now() });
    }
    bookmarks.sort((a, b) => a.time - b.time);
    if (!await saveBookmarks()) {
      bookmarks = previous;
      return;
    }
    input.value = "";
    renderList();
    document.getElementById(FLOATING_PANEL_ID)?.contentWindow?.postMessage({
      type: "BTB_BOOKMARKS_UPDATED",
      bookmarks
    }, "*");
    showToast(
      t(duplicate ? "updatedAt" : "savedAt").replace("{time}", formatTime(time))
    );
  }

  async function addQuickBookmark() {
    const video = getVideo();
    if (!video || !Number.isFinite(video.currentTime) || !currentVideoKey) return;

    const previous = bookmarks.map((item) => ({ ...item }));
    const time = Math.floor(video.currentTime);
    const duplicate = bookmarks.find((item) => Math.abs(item.time - time) < 2);
    if (duplicate) {
      duplicate.updatedAt = Date.now();
    } else {
      bookmarks.push({ id: crypto.randomUUID(), time, note: "", createdAt: Date.now() });
    }
    bookmarks.sort((a, b) => a.time - b.time);
    if (!await saveBookmarks()) {
      bookmarks = previous;
      return;
    }
    renderList();
    document.getElementById(FLOATING_PANEL_ID)?.contentWindow?.postMessage({
      type: "BTB_BOOKMARKS_UPDATED",
      bookmarks
    }, "*");
    showToast(
      t(duplicate ? "updatedAt" : "savedAt").replace("{time}", formatTime(time))
    );

    const button = document.getElementById("btb-fullscreen-save");
    button?.classList.remove("did-save");
    requestAnimationFrame(() => button?.classList.add("did-save"));
  }

  function updateFullscreenButton() {
    const button = document.getElementById("btb-fullscreen-save");
    if (!button) return;
    const fullscreenHost = document.fullscreenElement;
    const video = getVideo();
    button.classList.toggle("is-visible", Boolean(video && currentVideoKey));
    if (fullscreenHost && !fullscreenHost.contains(button)) fullscreenHost.append(button);
    if (!fullscreenHost && button.parentElement !== document.body) document.body.append(button);
    if (video) {
      positionFullscreenButton();
      setTimeout(positionFullscreenButton, 500);
      wakeFullscreenButton();
    }
    else button.classList.remove("is-awake");
  }

  function positionFullscreenButton() {
    const button = document.getElementById("btb-fullscreen-save");
    const host = document.fullscreenElement;
    const video = getVideo();
    if (!button || !video) return;
    const rect = video.getBoundingClientRect();
    button.style.top = host ? "50%" : `${Math.max(18, rect.top + rect.height / 2)}px`;
    button.style.right = host ? "0" : `${Math.max(0, window.innerWidth - rect.right)}px`;
    button.style.bottom = "auto";
    button.style.left = "auto";
  }

  function wakeFullscreenButton() {
    const button = document.getElementById("btb-fullscreen-save");
    if (!button || !getVideo()) return;
    button.classList.add("is-awake");
    clearTimeout(fullscreenFadeTimer);
    fullscreenFadeTimer = setTimeout(() => button.classList.remove("is-awake"), 1800);
  }

  function mountFullscreenButton() {
    if (document.getElementById("btb-fullscreen-save")) return;
    const button = document.createElement("button");
    button.id = "btb-fullscreen-save";
    button.type = "button";
    button.innerHTML = icon("plus");
    button.addEventListener("click", addQuickBookmark);
    button.addEventListener("animationend", () => button.classList.remove("did-save"));
    document.body.append(button);
    document.addEventListener("fullscreenchange", updateFullscreenButton);
    document.addEventListener("mousemove", wakeFullscreenButton, { passive: true });
    window.addEventListener("resize", positionFullscreenButton, { passive: true });
    updateFullscreenButton();
  }

  function mountFloatingPanel() {
    if (document.getElementById(FLOATING_PANEL_ID)) return;
    const frame = document.createElement("iframe");
    frame.id = FLOATING_PANEL_ID;
    frame.src = chrome.runtime.getURL("popup.html");
    frame.title = t("title");
    frame.setAttribute("aria-label", t("title"));
    document.body.append(frame);
  }

  function toggleFloatingPanel() {
    mountFloatingPanel();
    const frame = document.getElementById(FLOATING_PANEL_ID);
    const visible = frame.classList.toggle("is-visible");
    if (visible) frame.contentWindow?.postMessage({ type: "BTB_REFRESH" }, "*");
  }

  async function deleteBookmark(id) {
    const index = bookmarks.findIndex((item) => item.id === id);
    if (index < 0) return;
    const [removed] = bookmarks.splice(index, 1);
    if (!await saveBookmarks()) {
      bookmarks.splice(Math.min(index, bookmarks.length), 0, removed);
      bookmarks.sort((a, b) => a.time - b.time);
      return;
    }
    renderList();
    showToast(t("deleted"), t("undo"), async () => {
      bookmarks.splice(Math.min(index, bookmarks.length), 0, removed);
      bookmarks.sort((a, b) => a.time - b.time);
      if (!await saveBookmarks()) return;
      renderList();
    });
  }

  function beginNoteEdit(bookmark, row) {
    const editor = document.createElement("div");
    editor.className = "btb-editor";
    const input = document.createElement("input");
    input.className = "btb-edit-input";
    input.type = "text";
    input.maxLength = MAX_NOTE_LENGTH;
    input.value = bookmark.note || "";
    input.setAttribute("aria-label", t("editNote"));

    const save = document.createElement("button");
    save.className = "btb-edit-save";
    save.type = "button";
    save.innerHTML = icon("check");
    save.title = t("saveEdit");
    save.setAttribute("aria-label", t("saveEdit"));
    const cancel = document.createElement("button");
    cancel.className = "btb-edit-cancel";
    cancel.type = "button";
    cancel.innerHTML = icon("close");
    cancel.title = t("cancelEdit");
    cancel.setAttribute("aria-label", t("cancelEdit"));

    const commit = async () => {
      const previousNote = bookmark.note;
      bookmark.note = input.value.trim().slice(0, MAX_NOTE_LENGTH);
      bookmark.updatedAt = Date.now();
      if (!await saveBookmarks()) {
        bookmark.note = previousNote;
        return;
      }
      renderList();
    };
    save.addEventListener("click", commit);
    cancel.addEventListener("click", renderList);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") commit();
      if (event.key === "Escape") renderList();
    });
    editor.append(input, save, cancel);
    row.replaceChildren(editor);
    input.focus();
    input.select();
  }

  function findProgressBar() {
    return document.querySelector([
      ".bpx-player-progress-wrap",
      ".bpx-player-progress-schedule-wrap",
      ".bilibili-player-video-progress"
    ].join(", "));
  }

  function renderTimelineMarkers() {
    const video = getVideo();
    const progress = findProgressBar();
    if (!video || !progress || !Number.isFinite(video.duration) || video.duration <= 0) return;

    document.querySelectorAll(".btb-timeline-markers").forEach((layer) => {
      if (layer.parentElement !== progress) layer.remove();
    });
    let layer = progress.querySelector(":scope > .btb-timeline-markers");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "btb-timeline-markers";
      progress.append(layer);
    }
    const signature = `${video.duration}|${bookmarks.map((item) => `${item.time}:${item.note || ""}`).join("|")}`;
    if (layer.dataset.signature === signature) return;
    layer.dataset.signature = signature;
    document.getElementById("btb-marker-tooltip")?.remove();
    layer.replaceChildren();
    for (const bookmark of bookmarks) {
      const marker = document.createElement("span");
      marker.className = "btb-timeline-marker";
      marker.style.left = `${Math.min(100, Math.max(0, bookmark.time / video.duration * 100))}%`;
      marker.addEventListener("mouseenter", () => showTimelinePreview(bookmark, marker));
      marker.addEventListener("mouseleave", hideTimelinePreview);
      layer.append(marker);
    }
  }

  function showTimelinePreview(bookmark, marker) {
    const note = (bookmark.note || "").trim();
    if (!note) return;
    hideTimelinePreview();
    const tooltip = document.createElement("div");
    tooltip.id = "btb-marker-tooltip";
    tooltip.textContent = note;
    (document.fullscreenElement || document.body).append(tooltip);
    const markerRect = marker.getBoundingClientRect();
    const left = Math.min(
      window.innerWidth - tooltip.offsetWidth - 8,
      Math.max(8, markerRect.left + markerRect.width / 2 - tooltip.offsetWidth / 2)
    );
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(8, markerRect.top - tooltip.offsetHeight - 9)}px`;
  }

  function hideTimelinePreview() {
    document.getElementById("btb-marker-tooltip")?.remove();
  }

  function renderList() {
    const list = document.querySelector(`#${ROOT_ID} .btb-list`);
    if (!list) return;
    list.replaceChildren();

    if (!bookmarks.length) {
      const empty = document.createElement("div");
      empty.className = "btb-empty";
      empty.textContent = t("empty");
      list.append(empty);
      renderTimelineMarkers();
      return;
    }

    bookmarks.forEach((bookmark) => {
      const row = document.createElement("div");
      row.className = "btb-item";

      const jump = document.createElement("button");
      jump.className = "btb-jump";
      jump.type = "button";
      jump.title = `${t("jump")} ${formatTime(bookmark.time)}`;
      jump.addEventListener("click", () => seekTo(bookmark.time));

      const time = document.createElement("span");
      time.className = "btb-time";
      time.textContent = formatTime(bookmark.time);
      const note = document.createElement("span");
      note.className = "btb-item-note";
      note.textContent = bookmark.note || t("noNote");
      note.classList.toggle("is-empty", !bookmark.note);
      jump.append(time, note);

      const remove = document.createElement("button");
      remove.className = "btb-delete";
      remove.type = "button";
      remove.title = t("remove");
      remove.setAttribute("aria-label", t("remove"));
      remove.innerHTML = icon("trash");
      remove.addEventListener("click", () => deleteBookmark(bookmark.id));
      const edit = document.createElement("button");
      edit.className = "btb-edit";
      edit.type = "button";
      edit.title = t("editNote");
      edit.setAttribute("aria-label", t("editNote"));
      edit.innerHTML = icon("edit");
      edit.addEventListener("click", () => beginNoteEdit(bookmark, row));
      row.append(jump, edit, remove);
      list.append(row);
    });
    renderTimelineMarkers();
  }

  async function deleteSavedVideo(entry) {
    await chrome.storage.sync.remove(videoRecordKey(entry.key));
    if (entry.key === currentVideoKey) {
      bookmarks = [];
      renderList();
    }
    await renderSavedVideos();
    showToast(t("videoDeleted"), t("undo"), async () => {
      await chrome.storage.sync.set({
        [videoRecordKey(entry.key)]: { bookmarks: entry.items, meta: entry.meta }
      });
      if (entry.key === currentVideoKey) {
        bookmarks = [...entry.items].sort((a, b) => a.time - b.time);
        renderList();
      }
      await renderSavedVideos();
    });
  }

  async function renderSavedVideos() {
    const list = document.querySelector(`#${ROOT_ID} .btb-video-list`);
    if (!list) return;
    const root = document.getElementById(ROOT_ID);
    const search = root.querySelector(".btb-video-search");
    const query = search.value.trim().toLocaleLowerCase();
    const entries = (await readAllVideoRecords())
      .sort((a, b) => (b.meta.updatedAt || 0) - (a.meta.updatedAt || 0));
    const filtered = query
      ? entries.filter((entry) => `${entry.meta.title || ""} ${entry.key}`.toLocaleLowerCase().includes(query))
      : entries;
    const visible = query || showAllVideos ? filtered : filtered.slice(0, 10);

    root.querySelector(".btb-video-search-wrap").hidden = entries.length <= 10;
    root.querySelector(".btb-video-count").textContent = t("savedVideoCount").replace("{count}", entries.length);
    const showAllButton = root.querySelector(".btb-show-all-videos");
    showAllButton.hidden = Boolean(query) || entries.length <= 10;
    showAllButton.textContent = showAllVideos
      ? t("showFewerVideos")
      : t("showAllVideos").replace("{count}", entries.length);

    list.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "btb-empty";
      empty.textContent = entries.length ? t("noVideoResults") : t("noSavedVideos");
      list.append(empty);
      return;
    }

    for (const entry of visible) {
      const row = document.createElement("div");
      row.className = "btb-video-row";
      const link = document.createElement("a");
      link.className = "btb-video-item";
      link.href = entry.meta.url || fallbackVideoUrl(entry.key);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = t("openVideo");

      const title = document.createElement("span");
      title.className = "btb-video-title";
      title.textContent = entry.meta.title || entry.key;
      const meta = document.createElement("span");
      meta.className = "btb-video-meta";
      meta.textContent = t("bookmarkCount").replace("{count}", entry.items.length);
      link.append(title, meta);
      const remove = document.createElement("button");
      remove.className = "btb-video-delete";
      remove.type = "button";
      remove.innerHTML = icon("trash");
      remove.title = t("removeVideo");
      remove.setAttribute("aria-label", `${t("removeVideo")}: ${title.textContent}`);
      remove.addEventListener("click", () => deleteSavedVideo(entry));
      row.append(link, remove);
      list.append(row);
    }
  }

  function selectTab(tab) {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const videosSelected = tab === "videos";
    root.querySelector(".btb-bookmarks-view").hidden = videosSelected;
    root.querySelector(".btb-videos-view").hidden = !videosSelected;
    root.querySelectorAll(".btb-tab").forEach((button) => {
      const selected = button.dataset.tab === tab;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    if (videosSelected) renderSavedVideos();
  }

  function mount() {
    if (!currentVideoKey || document.getElementById(ROOT_ID)) return;
    const root = document.createElement("section");
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="btb-body">
        <div class="btb-tabs" role="tablist">
          <button id="btb-tab-bookmarks" class="btb-tab is-active" type="button" data-tab="bookmarks" role="tab" aria-controls="btb-panel-bookmarks" aria-selected="true" tabindex="0"></button>
          <button id="btb-tab-videos" class="btb-tab" type="button" data-tab="videos" role="tab" aria-controls="btb-panel-videos" aria-selected="false" tabindex="-1"></button>
        </div>
        <div id="btb-panel-bookmarks" class="btb-bookmarks-view" role="tabpanel" aria-labelledby="btb-tab-bookmarks">
          <div class="btb-add-row">
            <input id="btb-note-input" class="btb-note" type="text" maxlength="${MAX_NOTE_LENGTH}">
            <button class="btb-add" type="button"></button>
          </div>
          <div class="btb-list"></div>
        </div>
        <div id="btb-panel-videos" class="btb-videos-view" role="tabpanel" aria-labelledby="btb-tab-videos" hidden>
          <div class="btb-video-summary">
            <span class="btb-video-count"></span>
          </div>
          <div class="btb-video-search-wrap">
            <label class="btb-note-label" for="btb-video-search"></label>
            <input id="btb-video-search" class="btb-video-search" type="search" autocomplete="off">
          </div>
          <div class="btb-video-list"></div>
          <button class="btb-show-all-videos" type="button" hidden></button>
        </div>
      </div>`;
    document.body.append(root);
    root.classList.add("is-hidden");

    root.querySelector(".btb-add").addEventListener("click", addBookmark);
    root.querySelector(".btb-note").addEventListener("keydown", (event) => {
      if (event.key === "Enter") addBookmark();
    });
    root.querySelectorAll(".btb-tab").forEach((button) => {
      button.addEventListener("click", () => selectTab(button.dataset.tab));
    });
    root.querySelector(".btb-tabs").addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...root.querySelectorAll(".btb-tab")];
      const current = tabs.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0
        : event.key === "End" ? tabs.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      selectTab(tabs[next].dataset.tab);
      tabs[next].focus();
    });
    root.querySelector(".btb-video-search").addEventListener("input", renderSavedVideos);
    root.querySelector(".btb-show-all-videos").addEventListener("click", () => {
      showAllVideos = !showAllVideos;
      renderSavedVideos();
    });
    applyLanguage();
    loadBookmarks();
  }

  function applyLanguage() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.lang = language === "zh" ? "zh-CN" : "en";
    root.querySelector('[data-tab="bookmarks"]').textContent = t("bookmarksTab");
    root.querySelector('[data-tab="videos"]').textContent = t("videosTab");
    const note = root.querySelector(".btb-note");
    note.placeholder = t("notePlaceholder");
    note.setAttribute("aria-label", t("noteLabel"));
    const videoSearch = root.querySelector(".btb-video-search");
    videoSearch.placeholder = t("searchVideos");
    videoSearch.setAttribute("aria-label", t("searchVideos"));
    root.querySelector(".btb-video-search-wrap .btb-note-label").textContent = t("searchVideos");
    const save = root.querySelector(".btb-add");
    save.textContent = t("save");
    save.title = t("saveTitle");
    const fullscreenButton = document.getElementById("btb-fullscreen-save");
    if (fullscreenButton) {
      fullscreenButton.title = t("quickSaveTitle");
      fullscreenButton.setAttribute("aria-label", t("quickSaveTitle"));
    }
  }

  async function handleNavigation() {
    const nextRouteKey = getRouteKey();
    if (nextRouteKey === currentRouteKey && (
      document.getElementById(ROOT_ID) || (!nextRouteKey && document.getElementById(FLOATING_PANEL_ID))
    )) return;
    if (resolvingRoute) return;
    resolvingRoute = true;
    try {
      const nextVideoKey = await resolveVideoKey(nextRouteKey);
      if (nextRouteKey !== getRouteKey()) return;
      document.getElementById(ROOT_ID)?.remove();
      document.querySelectorAll(".btb-timeline-markers").forEach((layer) => layer.remove());
      hideTimelinePreview();
      currentRouteKey = nextRouteKey;
      currentVideoKey = nextVideoKey;
      legacyVideoKey = nextVideoKey !== nextRouteKey ? nextRouteKey : null;
      loopRange = null;
      bookmarks = [];
      if (currentVideoKey) mount();
      updateFullscreenButton();
    } finally {
      resolvingRoute = false;
    }
  }

  async function initialize() {
    await migrateLegacyStorage();
    mountFloatingPanel();
    mountFullscreenButton();
    await handleNavigation();
    setInterval(handleNavigation, 1000);
    setInterval(renderTimelineMarkers, 1000);
    setInterval(positionFullscreenButton, 500);
    setInterval(() => {
      if (!loopRange) return;
      const video = getVideo();
      if (!video) return;
      if (video.currentTime >= loopRange.end || video.currentTime < loopRange.start - 0.5) {
        video.currentTime = loopRange.start;
        video.play().catch(() => {});
      }
    }, 150);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const respond = async () => {
      if (message?.type === "BTB_GET_STATE") {
        const video = getVideo();
        return {
          ok: true,
          language,
          title: cleanVideoTitle(),
          videoKey: currentVideoKey,
          currentTime: video?.currentTime || 0,
          bookmarks,
          loopRange
        };
      }
      if (message?.type === "BTB_TOGGLE_PANEL") {
        toggleFloatingPanel();
        return { ok: true };
      }
      if (message?.type === "BTB_ADD_BOOKMARK") {
        const input = document.querySelector(`#${ROOT_ID} .btb-note`);
        if (input) input.value = String(message.note || "");
        await addBookmark();
        return { ok: true, bookmarks };
      }
      if (message?.type === "BTB_SEEK") {
        seekTo(Number(message.time) || 0);
        return { ok: true };
      }
      if (message?.type === "BTB_DELETE") {
        await deleteBookmark(message.id);
        return { ok: true, bookmarks };
      }
      if (message?.type === "BTB_EDIT") {
        const bookmark = bookmarks.find((item) => item.id === message.id);
        if (bookmark) {
          const previous = bookmark.note;
          bookmark.note = String(message.note || "").trim().slice(0, MAX_NOTE_LENGTH);
          bookmark.updatedAt = Date.now();
          if (!await saveBookmarks()) bookmark.note = previous;
          renderList();
        }
        return { ok: true, bookmarks };
      }
      if (message?.type === "BTB_DELETE_VIDEO") {
        const key = String(message.videoKey || "");
        if (key) await chrome.storage.sync.remove(videoRecordKey(key));
        const currentCleared = key === currentVideoKey;
        if (currentCleared) {
          bookmarks = [];
          loopRange = null;
          renderList();
          renderTimelineMarkers();
        }
        return { ok: true, currentCleared, bookmarks };
      }
      if (message?.type === "BTB_SET_LOOP") {
        const start = Number(message.start);
        const end = Number(message.end);
        loopRange = Number.isFinite(start) && Number.isFinite(end) && end > start
          ? { start, end }
          : null;
        if (loopRange) seekTo(loopRange.start);
        return { ok: true, loopRange };
      }
      return { ok: false };
    };
    respond().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });

  window.addEventListener("message", (event) => {
    const frame = document.getElementById(FLOATING_PANEL_ID);
    if (!frame || event.source !== frame.contentWindow || event.data?.type !== "BTB_POPUP_HEIGHT") return;
    const height = Math.min(560, Math.max(120, Number(event.data.height) || 120));
    frame.style.height = `${height}px`;
  });

  initialize();
})();

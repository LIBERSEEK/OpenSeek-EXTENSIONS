// Adapted from ImageLens 1.1.1 (MIT); initialized by the WXT content entrypoint.
export function initializeImageLens() {
  if (document.getElementById("pg-panel")) return;
const imageCache = new Map();
const RATIO_OPTIONS = ["1:1", "3:4", "4:3", "9:16", "16:9"];

const MIN_SELECTION_SIZE = 16;
const MIN_BACKGROUND_IMAGE_SIZE = 48;
// The entry icon waits for the pointer to rest on an image, so it does not
// flash while the pointer crosses an image-heavy page.
const HOVER_DELAY = 300;
const PANEL_CLOSE_DURATION = 140;
const COPIED_FEEDBACK_DURATION = 1400;
// Same order as SECTION_KEYS in prompt-analysis.js.
const STRUCTURE_KEYS = [
  "subject",
  "environment",
  "style",
  "lighting",
  "color",
  "camera",
  "composition",
  "material",
  "rendering"
];

const state = {
  settings: null,
  hoverImage: null,
  hoverTimer: 0,
  panelSource: null,
  panelOpen: false,
  panelCloseTimer: 0,
  restoreFocus: null,
  contextPoint: null,
  regionSelecting: false,
  toastTimer: null,
  pointer: null,
  hoverFrame: 0,
  currentJob: null,
  panelData: createEmptyPanelData(),
  panelError: "",
  queuedSource: null,
  copied: false,
  copiedTimer: 0,
  settingsRefreshTimer: 0,
  actionState: {
    analyze: false,
    generate: false
  }
};

// Stroke icons drawn with currentColor so they follow the theme.
const ICONS = {
  logo: `<img class="pg-brand-icon" src="${chrome.runtime.getURL("icon/48.png")}" alt="" />`,
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  wand: '<svg viewBox="0 0 24 24"><path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>'
};

// One click opens the panel: the image has only one action, and region
// selection and settings have their own entry points.
const hoverTrigger = document.createElement("button");
hoverTrigger.id = "pg-hover-trigger";
hoverTrigger.type = "button";
hoverTrigger.innerHTML = ICONS.logo;

// Lives outside the panel so the panel's scroll area cannot clip it.
const moreMenu = document.createElement("div");
moreMenu.id = "pg-more-menu";
moreMenu.hidden = true;
moreMenu.setAttribute("role", "menu");
moreMenu.innerHTML = `
  <button type="button" role="menuitem" data-menu="reanalyze" data-result tabindex="-1"><span class="pg-mark"></span><span></span></button>
  <div class="pg-menu-sep" role="separator" data-result></div>
  <button type="button" role="menuitemradio" data-menu="full" data-result tabindex="-1"><span class="pg-mark">${ICONS.check}</span><span></span></button>
  <button type="button" role="menuitemradio" data-menu="short" data-result tabindex="-1"><span class="pg-mark">${ICONS.check}</span><span></span></button>
  <div class="pg-menu-sep" role="separator" data-result></div>
  <button type="button" role="menuitem" data-menu="settings" tabindex="-1"><span class="pg-mark"></span><span></span></button>
`;

// The panel shows one stage at a time (data-stage): setup, idle, analyzing,
// ready or error. Controls that do nothing in a stage are not shown.
const panel = document.createElement("aside");
panel.id = "pg-panel";
panel.tabIndex = -1;
panel.dataset.stage = "idle";
panel.innerHTML = `
  <div class="pg-shell">
    <header class="pg-header">
      <img class="pg-thumb" id="pg-preview-image" alt="" />
      <div class="pg-source-meta">
        <strong id="pg-image-title"></strong>
        <span id="pg-image-url"></span>
      </div>
      <div class="pg-header-actions">
        <button class="pg-icon-button" id="pg-more" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="pg-more-menu">${ICONS.more}</button>
        <button class="pg-icon-button" id="pg-close" type="button">${ICONS.close}</button>
      </div>
    </header>

    <div class="pg-empty">
      <p id="pg-empty-text"></p>
      <button class="pg-btn pg-btn-primary" id="pg-empty-action" type="button"></button>
    </div>

    <div class="pg-result">
      <div class="pg-prompt-box">
        <textarea class="pg-textarea" id="pg-prompt-input" spellcheck="false"></textarea>
        <div class="pg-skeleton" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div class="pg-meta">
          <span class="pg-status" id="pg-status" role="status" aria-live="polite"></span>
          <div class="pg-seg" id="pg-lang-seg">
            <button id="pg-lang-zh" type="button">中</button>
            <button id="pg-lang-en" type="button">EN</button>
          </div>
        </div>
      </div>

      <details class="pg-structure" id="pg-structure">
        <summary><span class="pg-chevron">${ICONS.chevron}</span><span id="pg-structure-label"></span></summary>
        <div class="pg-structure-list" id="pg-structure-list"></div>
      </details>

      <button class="pg-btn pg-btn-primary pg-copy" id="pg-copy" type="button"><span class="pg-copy-icon">${ICONS.copy}</span><span class="pg-copied-icon">${ICONS.check}</span><span id="pg-copy-label"></span></button>

      <section class="pg-generate" id="pg-generate-section">
        <div class="pg-generate-row">
          <select class="pg-ratio-select" id="pg-ratio"></select>
          <button class="pg-btn pg-btn-secondary" id="pg-generate" type="button">${ICONS.wand}<span id="pg-generate-label"></span></button>
        </div>
        <div class="pg-inline-grid" id="pg-inline-grid"></div>
      </section>
    </div>
  </div>
`;

const toast = document.createElement("div");
toast.id = "pg-toast";
toast.setAttribute("role", "status");

document.documentElement.append(hoverTrigger, moreMenu, panel, toast);

const els = {
  previewImage: panel.querySelector("#pg-preview-image"),
  imageTitle: panel.querySelector("#pg-image-title"),
  imageUrl: panel.querySelector("#pg-image-url"),
  more: panel.querySelector("#pg-more"),
  close: panel.querySelector("#pg-close"),
  emptyText: panel.querySelector("#pg-empty-text"),
  emptyAction: panel.querySelector("#pg-empty-action"),
  input: panel.querySelector("#pg-prompt-input"),
  status: panel.querySelector("#pg-status"),
  langSeg: panel.querySelector("#pg-lang-seg"),
  langZh: panel.querySelector("#pg-lang-zh"),
  langEn: panel.querySelector("#pg-lang-en"),
  structure: panel.querySelector("#pg-structure"),
  structureLabel: panel.querySelector("#pg-structure-label"),
  structureList: panel.querySelector("#pg-structure-list"),
  copy: panel.querySelector("#pg-copy"),
  copyLabel: panel.querySelector("#pg-copy-label"),
  generateSection: panel.querySelector("#pg-generate-section"),
  ratio: panel.querySelector("#pg-ratio"),
  generate: panel.querySelector("#pg-generate"),
  generateLabel: panel.querySelector("#pg-generate-label"),
  inlineGrid: panel.querySelector("#pg-inline-grid")
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "context-analyze-image") {
    handleContextAnalyze(message.payload || {}).catch((error) => {
      showToast(error.message || t("contextAnalyzeFailed"));
    });
  } else if (message?.type === "start-region-selection") {
    startRegionSelection().catch((error) => showToast(error.message || t("regionCaptureFailed")));
  } else {
    // Do not consume responses intended for the social-data content scripts.
    return false;
  }
  sendResponse({ ok: true });
});

init().catch((error) => showToast(error.message || "Image Lens failed to initialize."));

async function init() {
  const response = await sendMessage({ type: "get-settings" });
  state.settings = response;
  state.panelData.detail = "full";
  state.panelData.language = getDefaultPromptLanguage();
  state.panelData.aspectRatio = state.settings.aspectRatio || "1:1";
  renderRatioOptions();
  bindEvents();
  applyStaticTranslations();
  syncGenerationVisibility();
  syncPromptControls();
}

function createEmptyPanelData() {
  return {
    title: "",
    detail: "full",
    language: "en",
    aspectRatio: "1:1",
    prompts: {
      short: {
        en: "",
        zh: ""
      },
      full: {
        en: "",
        zh: ""
      }
    },
    ratioChosen: false,
    sections: {},
    languages: [],
    structureOpen: false
  };
}

function getTranslator() {
  return globalThis.ImageLensI18n.createTranslator(state.settings?.uiLanguage || "auto");
}

function t(key, values) {
  return getTranslator().t(key, values);
}

function applyStaticTranslations() {
  const translator = getTranslator();
  // Tells Chrome which language's glyph shapes to use for Chinese text.
  panel.lang = translator.messages.htmlLang;
  toast.lang = translator.messages.htmlLang;
  moreMenu.lang = translator.messages.htmlLang;
  setIconLabel(hoverTrigger, translator.t("panelHoverTitle"));
  setIconLabel(els.more, translator.t("panelMore"));
  setIconLabel(els.close, translator.t("panelClose"));
  moreMenu.setAttribute("aria-label", translator.t("panelMore"));
  for (const [action, key] of [["reanalyze", "panelReanalyze"], ["full", "panelFull"], ["short", "panelShort"], ["settings", "panelOpenSettings"]]) {
    moreMenu.querySelector(`[data-menu="${action}"] span:last-child`).textContent = translator.t(key);
  }
  els.input.placeholder = translator.t("panelPromptPlaceholder");
  els.structureLabel.textContent = translator.t("panelStructureTab");
  els.ratio.setAttribute("aria-label", translator.t("panelAspectRatio"));
  syncCopyButton();
  syncActionState();
}

function setIconLabel(button, label) {
  button.title = label;
  button.setAttribute("aria-label", label);
}

// Copy confirms on the button itself instead of in a status line.
function syncCopyButton() {
  els.copy.disabled = !getCurrentPrompt().trim();
  els.copy.classList.toggle("is-copied", state.copied);
  els.copyLabel.textContent = t(state.copied ? "panelCopied" : "panelCopy");
}

function showCopied() {
  state.copied = true;
  syncCopyButton();
  clearTimeout(state.copiedTimer);
  state.copiedTimer = setTimeout(() => {
    state.copied = false;
    syncCopyButton();
  }, COPIED_FEEDBACK_DURATION);
}

// Setup, idle and error share one message and one button.
function syncEmptyState() {
  const stage = panel.dataset.stage;
  const awaitingRegion = state.panelSource?.kind === "region";
  let text = "";
  let action = "";
  if (stage === "setup") {
    [text, action] = [t("panelSetupTitle"), t("panelSetupAction")];
  } else if (stage === "error") {
    [text, action] = [state.panelError || t("panelActionError"), t("panelRetry")];
  } else if (awaitingRegion) {
    [text, action] = [t("panelRegionReadyTitle"), t("regionSelectAction")];
  } else {
    [text, action] = [t("panelIdleTitle"), t("panelAnalyzeAction")];
  }
  els.emptyText.textContent = text;
  els.emptyText.classList.toggle("is-error", stage === "error");
  els.emptyAction.textContent = action;
}

function handleEmptyAction() {
  const stage = panel.dataset.stage;
  if (stage === "setup") {
    sendMessage({ type: "open-options" }).catch((error) => showToast(error.message));
  } else if (state.panelSource?.kind === "region") {
    startRegionSelection().catch((error) => showToast(error.message || t("regionCaptureFailed")));
  } else {
    analyzeCurrentImage({ force: true });
  }
}

function setStage(stage) {
  panel.dataset.stage = stage;
  syncEmptyState();
  syncMoreMenu();
}

// Result actions appear in the menu only once there is a result.
function syncMoreMenu() {
  const ready = panel.dataset.stage === "ready";
  moreMenu.querySelectorAll("[data-result]").forEach((item) => {
    item.hidden = !ready;
  });
  for (const detail of ["full", "short"]) {
    moreMenu.querySelector(`[data-menu="${detail}"]`).setAttribute("aria-checked", String(state.panelData.detail === detail));
  }
  moreMenu.querySelector('[data-menu="reanalyze"]').disabled = state.actionState.analyze;
}

function bindEvents() {
  document.addEventListener("pointermove", handlePointerMove, true);
  document.addEventListener("scroll", handleViewportChange, true);
  window.addEventListener("resize", handleViewportChange);
  document.addEventListener(
    "contextmenu",
    (event) => {
      state.contextPoint = { x: event.clientX, y: event.clientY };
    },
    true
  );
  document.addEventListener("pointerdown", (event) => {
    if (!moreMenu.contains(event.target) && !els.more.contains(event.target)) closeMoreMenu();
  }, true);
  // Settings usually change in the options tab; pick them up on return.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleSettingsRefresh();
  });
  window.addEventListener("focus", scheduleSettingsRefresh);

  hoverTrigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const image = state.hoverImage;
    if (!image) return;
    hideHoverButton();
    openPanelForSource(createImageSource(image)).catch((error) => showToast(error.message || t("contextAnalyzeFailed")));
  });

  els.more.addEventListener("click", toggleMoreMenu);
  moreMenu.addEventListener("click", handleMoreMenuClick);
  moreMenu.addEventListener("keydown", handleMoreMenuKeydown);
  els.close.addEventListener("click", closePanel);
  els.emptyAction.addEventListener("click", handleEmptyAction);
  panel.addEventListener("keydown", (event) => {
    // Esc while a Chinese or Japanese input method is composing only cancels
    // the composition.
    if (event.key !== "Escape" || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    closePanel();
  });

  els.input.addEventListener("input", () => {
    state.panelData.prompts[state.panelData.detail][getCurrentLanguage()] = els.input.value;
    syncCopyButton();
    persistPanelImageCache();
  });

  els.langZh.addEventListener("click", () => setPromptLanguage("zh"));
  els.langEn.addEventListener("click", () => setPromptLanguage("en"));
  els.previewImage.addEventListener("load", syncSourceMeta);

  els.ratio.addEventListener("change", () => {
    state.panelData.aspectRatio = els.ratio.value;
    state.panelData.ratioChosen = true;
    persistPanelImageCache();
  });

  els.copy.addEventListener("click", async () => {
    const text = getCurrentPrompt().trim();
    if (text && await copyText(text)) showCopied();
  });

  els.structure.addEventListener("toggle", () => {
    state.panelData.structureOpen = els.structure.open;
    persistPanelImageCache();
  });
  els.structureList.addEventListener("click", handleStructureClick);

  els.generate.addEventListener("click", () => generateFromCurrentPrompt());
  els.inlineGrid.addEventListener("click", handleInlinePreviewClick);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_error) {
    setStatus(t("panelCopyFailed"), "error");
    return false;
  }
}

function handleViewportChange() {
  updateHoverButtonPosition();
  closeMoreMenu();
}

function toggleMoreMenu() {
  if (!moreMenu.hidden) {
    closeMoreMenu(true);
    return;
  }
  syncMoreMenu();
  moreMenu.hidden = false;
  els.more.setAttribute("aria-expanded", "true");
  const rect = els.more.getBoundingClientRect();
  moreMenu.style.left = `${Math.max(8, Math.min(rect.right - moreMenu.offsetWidth, window.innerWidth - moreMenu.offsetWidth - 8))}px`;
  const top = rect.bottom + 6;
  moreMenu.style.top = `${top + moreMenu.offsetHeight < window.innerHeight - 8 ? top : Math.max(8, rect.top - moreMenu.offsetHeight - 6)}px`;
  getMenuItems()[0]?.focus();
}

function closeMoreMenu(restoreFocus = false) {
  if (moreMenu.hidden) return;
  moreMenu.hidden = true;
  els.more.setAttribute("aria-expanded", "false");
  if (restoreFocus) els.more.focus();
}

function getMenuItems() {
  return [...moreMenu.querySelectorAll("button")].filter((item) => !item.hidden && !item.disabled);
}

function handleMoreMenuClick(event) {
  const action = event.target.closest("[data-menu]")?.dataset.menu;
  if (!action) return;
  closeMoreMenu(true);
  if (action === "reanalyze") analyzeCurrentImage({ force: true });
  else if (action === "full" || action === "short") switchDetail(action);
  else if (action === "settings") sendMessage({ type: "open-options" }).catch((error) => showToast(error.message));
}

function handleMoreMenuKeydown(event) {
  const items = getMenuItems();
  const index = items.indexOf(document.activeElement);
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  } else if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeMoreMenu(true);
  } else if (event.key === "Tab") {
    closeMoreMenu(true);
  }
}

function scheduleSettingsRefresh() {
  clearTimeout(state.settingsRefreshTimer);
  state.settingsRefreshTimer = setTimeout(() => {
    refreshSettings().catch(() => {});
  }, 150);
}

async function refreshSettings() {
  state.settings = await sendMessage({ type: "get-settings" });
  applyStaticTranslations();
  syncGenerationVisibility();
  syncPromptControls();
  renderStructureView();
  if (state.settings.hoverButtonEnabled === false) hideHoverButton();
  // Coming back from settings with a connection finishes the setup stage.
  if (state.panelOpen && panel.dataset.stage === "setup" && state.settings.analysisReady) {
    beginForSource();
  }
}

// Decides the first stage for a source that has no cached result.
function beginForSource() {
  if (!state.settings?.analysisReady) {
    setStage("setup");
  } else if (state.panelSource?.kind === "region" || !state.settings?.autoAnalyze) {
    setStage("idle");
  } else {
    analyzeCurrentImage({ force: false });
  }
}

function renderRatioOptions() {
  if (!els.ratio.options.length) {
    els.ratio.innerHTML = RATIO_OPTIONS.map((ratio) => `<option value="${ratio}">${ratio}</option>`).join("");
  }
  els.ratio.value = state.panelData.aspectRatio || "1:1";
}

// Shows "site" under the title, plus "· width × height" once the thumbnail
// has loaded. Until then the image element still reports the previous size.
function syncSourceMeta(event) {
  const source = state.panelSource;
  if (!source) return;

  const parts = [getSourceHost(source)];
  const { naturalWidth, naturalHeight } = els.previewImage;
  if (event?.type === "load" && naturalWidth && naturalHeight) {
    parts.push(`${naturalWidth} × ${naturalHeight}`);
    // Generate in the source's shape unless the user picked a ratio.
    if (!state.panelData.ratioChosen) {
      state.panelData.aspectRatio = getNearestRatio(naturalWidth, naturalHeight);
      renderRatioOptions();
    }
  }
  els.imageUrl.textContent = parts.filter(Boolean).join(" · ");
  els.imageUrl.title = source.imageUrl || "";
}

// Compares on a log scale so 4:3 and 3:4 are equally far from 1:1.
function getNearestRatio(width, height) {
  const target = Math.log(width / height);
  let best = RATIO_OPTIONS[0];
  let bestDistance = Infinity;

  for (const ratio of RATIO_OPTIONS) {
    const [w, h] = ratio.split(":").map(Number);
    const distance = Math.abs(Math.log(w / h) - target);
    if (distance < bestDistance) {
      best = ratio;
      bestDistance = distance;
    }
  }

  return best;
}

function getSourceHost(source) {
  if (source.kind === "region") return location.hostname.replace(/^www\./, "");
  if (!source.imageUrl) return t("panelScreenshotLabel");
  try {
    const url = new URL(source.imageUrl);
    return /^https?:$/.test(url.protocol) ? url.hostname.replace(/^www\./, "") : location.hostname;
  } catch (_error) {
    return location.hostname;
  }
}

function handleInlinePreviewClick(event) {
  const action = event.target.closest("[data-role]");
  if (!action) return;

  const role = action.dataset.role;
  const index = Number(action.dataset.index);
  if (!Number.isFinite(index)) return;

  const src = getImageDataUrl(index);
  if (!src) return;

  if (role === "download") {
    triggerDownload(src, `image-lens-${index + 1}.png`);
    return;
  }

  if (role === "viewer") {
    const image = state.currentJob?.images?.[index];
    sendMessage({
      type: "open-viewer",
      payload: {
        prompt: getCurrentPrompt().trim(),
        images: image ? [image] : []
      }
    }).catch((error) => {
      setStatus(error.message || t("panelOpenViewerFailed"), "error");
    });
  }
}

// Pointer moves fire far more often than the screen repaints, so the lookup
// runs at most once per frame with the latest pointer position.
function handlePointerMove(event) {
  if (state.regionSelecting || !moreMenu.hidden || state.settings?.hoverButtonEnabled === false) return;
  if (isOwnUiElement(event.target) && !hoverTrigger.contains(event.target)) return;

  state.pointer = { x: event.clientX, y: event.clientY, target: event.target };
  if (!state.hoverFrame) {
    state.hoverFrame = requestAnimationFrame(updateHoverTarget);
  }
}

function updateHoverTarget() {
  state.hoverFrame = 0;
  const { x, y, target } = state.pointer || {};
  const elements = Number.isFinite(x) && Number.isFinite(y) ? document.elementsFromPoint(x, y) : [];

  // Player controls and poster overlays may be above the <video>. Do not
  // mistake those overlays, or images behind the player, for a hover image.
  if (elements.some(element => element instanceof HTMLVideoElement)) {
    hideHoverButton();
    return;
  }

  const image =
    (target instanceof Element ? findEligibleImage(target) : null) || findEligibleImageAtPoint(elements);
  if (!image || isPanelSourceImage(image)) {
    if (!hoverTrigger.matches(":hover")) hideHoverButton();
    return;
  }

  if (image !== state.hoverImage) {
    hideHoverButton();
    state.hoverImage = image;
    state.hoverTimer = setTimeout(() => {
      state.hoverTimer = 0;
      updateHoverButtonPosition();
    }, HOVER_DELAY);
    return;
  }
  if (!state.hoverTimer) updateHoverButtonPosition();
}

function findEligibleImage(startNode) {
  const image = startNode.closest("img");
  return image && isEligibleImage(image) ? image : null;
}

// Sites like Pinterest and Instagram lay transparent elements over their
// images, so the pointer is never on the <img> itself. Look through the stack
// at the pointer and use the first image underneath.
function findEligibleImageAtPoint(elements) {
  for (const element of elements) {
    if (isOwnUiElement(element)) continue;
    if (element instanceof HTMLImageElement) {
      return isEligibleImage(element) ? element : null;
    }
  }
  return null;
}

function isEligibleImage(image) {
  const rect = image.getBoundingClientRect();
  const src = image.currentSrc || image.src;
  return !image.closest("video") && Boolean(src) && rect.width >= 96 && rect.height >= 96;
}

function updateHoverButtonPosition() {
  const image = state.hoverImage;
  if (state.hoverTimer) return;
  if (!image || !document.documentElement.contains(image) || isPanelSourceImage(image)) {
    hideHoverButton();
    return;
  }

  const rect = image.getBoundingClientRect();
  if (rect.width < 96 || rect.height < 96 || rect.bottom < 0 || rect.top > window.innerHeight) {
    hideHoverButton();
    return;
  }

  hoverTrigger.style.display = "flex";
  hoverTrigger.style.top = `${Math.max(10, rect.top + 8)}px`;
  hoverTrigger.style.left = `${Math.max(10, rect.left + 8)}px`;
}

// The open panel already shows this image, so its icon is not repeated.
function isPanelSourceImage(image) {
  return state.panelOpen && state.panelSource?.element === image;
}

function hideHoverButton() {
  clearTimeout(state.hoverTimer);
  state.hoverTimer = 0;
  state.hoverImage = null;
  hoverTrigger.style.display = "none";
}

// A source is what the panel analyzes: an <img> element, an image URL found
// some other way (CSS background, image inside an iframe), a screenshot of
// part of the page, or a region the user is about to select. `key`
// identifies it in imageCache.
function createImageSource(image) {
  const url = image.currentSrc || image.src;
  return {
    kind: "image",
    key: url,
    element: image,
    cropElement: image,
    imageUrl: url,
    dataUrl: "",
    previewUrl: url,
    alt: image.alt || "",
    title: image.alt?.trim() || "",
    label: url
  };
}

function createUrlSource(url, cropElement = null) {
  return {
    kind: "url",
    key: url,
    element: null,
    cropElement,
    imageUrl: url,
    dataUrl: "",
    previewUrl: url,
    alt: "",
    title: "",
    label: url
  };
}

function createCapturedSource(dataUrl, title) {
  return {
    kind: "capture",
    key: `capture:${Date.now()}`,
    element: null,
    cropElement: null,
    imageUrl: "",
    dataUrl,
    previewUrl: dataUrl,
    alt: "",
    title,
    label: ""
  };
}

// Opened before a selection exists, so the panel can ask for a connection
// first instead of failing after the user has drawn the area.
function createRegionSource() {
  return {
    kind: "region",
    key: "",
    element: null,
    cropElement: null,
    imageUrl: "",
    dataUrl: "",
    previewUrl: "",
    alt: "",
    title: t("regionSelectAction"),
    label: ""
  };
}

async function openPanelForSource(source) {
  closeMoreMenu();
  hideHoverButton();
  state.settings = await sendMessage({ type: "get-settings" });
  applyStaticTranslations();
  syncGenerationVisibility();
  state.panelSource = source;
  state.panelError = "";
  showPanel();

  setPreviewImage(source.previewUrl);
  els.imageTitle.textContent = source.title || t("panelWebImage");
  syncSourceMeta();
  state.currentJob = null;
  renderInlineImages([]);
  setStatus("");

  const cached = imageCache.get(source.key);
  if (cached) {
    hydratePanelData(cached);
    return;
  }

  state.panelData = createEmptyPanelData();
  state.panelData.detail = "full";
  state.panelData.language = getDefaultPromptLanguage();
  state.panelData.aspectRatio = state.settings?.aspectRatio || "1:1";
  els.structure.open = false;
  renderRatioOptions();
  syncPromptControls();
  renderStructureView();
  beginForSource();
}

function setPreviewImage(url) {
  els.previewImage.hidden = !url;
  if (url) els.previewImage.src = url;
  else els.previewImage.removeAttribute("src");
}

// Focus moves into the panel so Esc closes it, and returns on close.
function showPanel() {
  clearTimeout(state.panelCloseTimer);
  panel.classList.remove("pg-closing");
  if (!state.panelOpen) {
    const active = document.activeElement;
    state.restoreFocus = active instanceof HTMLElement && active !== document.body && !isOwnUiElement(active) ? active : null;
  }
  state.panelOpen = true;
  panel.classList.add("pg-open");
  panel.focus({ preventScroll: true });
}

function closePanel() {
  if (!state.panelOpen) return;
  closeMoreMenu();
  state.panelOpen = false;
  if (panel.contains(document.activeElement)) {
    if (state.restoreFocus?.isConnected) state.restoreFocus.focus({ preventScroll: true });
    else document.activeElement.blur();
  }
  state.restoreFocus = null;
  panel.classList.add("pg-closing");
  state.panelCloseTimer = setTimeout(() => {
    panel.classList.remove("pg-open", "pg-closing");
  }, PANEL_CLOSE_DURATION);
}

async function analyzeCurrentImage({ force }) {
  const targetSource = state.panelSource;
  if (!targetSource?.key) return;

  if (!force && imageCache.has(targetSource.key)) {
    hydratePanelData(imageCache.get(targetSource.key));
    return;
  }

  setStatus(t("panelAnalyzing"), "working");
  setStage("analyzing");
  // One request at a time; a newer image waits for the current one.
  if (state.actionState.analyze) {
    state.queuedSource = targetSource;
    return;
  }

  state.actionState.analyze = true;
  state.queuedSource = null;
  syncActionState();

  try {
    const imageDataUrl = targetSource.dataUrl || (await captureImageDataUrl(targetSource.element));
    const screenshotCrop = getViewportCrop(targetSource.cropElement);
    const result = await sendMessage({
      type: "analyze-image",
      payload: {
        imageUrl: targetSource.imageUrl,
        imageDataUrl,
        screenshotCrop,
        pageUrl: location.href,
        alt: targetSource.alt
      }
    });

    const cached = {
      title: pickByUiLanguage(result.title) || t("panelPromptTitleFallback"),
      detail: state.panelData.detail || "full",
      language: state.panelData.language || getDefaultPromptLanguage(),
      aspectRatio: state.panelData.aspectRatio || state.settings?.aspectRatio || "1:1",
      ratioChosen: state.panelData.ratioChosen,
      sections: result.sections || {},
      languages: Array.isArray(result.languages) ? result.languages : ["en"],
      structureOpen: state.panelData.structureOpen || false,
      prompts: {
        short: normalizePromptPair(result.prompts?.short),
        full: normalizePromptPair(result.prompts?.full)
      }
    };

    imageCache.set(targetSource.key, cached);
    // The user may have opened the panel on another image while this request
    // was in flight; only show the result if it still belongs to the panel.
    if (state.panelSource === targetSource) {
      hydratePanelData(cached);
    }
  } catch (error) {
    if (state.panelSource === targetSource) showAnalyzeError(error.message || t("panelActionError"));
  } finally {
    state.actionState.analyze = false;
    syncActionState();
  }

  const queued = state.queuedSource;
  state.queuedSource = null;
  // Not forced: a queued source with the same key, such as the same image
  // opened again, uses the result just cached instead of a second request.
  if (queued && queued === state.panelSource && state.panelOpen) {
    await analyzeCurrentImage({ force: false });
  }
}

// A failed re-analysis keeps the previous result on screen.
function showAnalyzeError(message) {
  const cached = imageCache.get(state.panelSource?.key);
  if (cached) {
    hydratePanelData(cached);
    setStatus(message, "error");
    return;
  }
  state.panelError = message;
  setStatus("");
  setStage("error");
}

function switchDetail(detail) {
  state.panelData.detail = detail;
  syncPromptControls();
  persistPanelImageCache();
}

function setPromptLanguage(language) {
  state.panelData.language = isPromptLanguageAvailable(language) ? language : "en";
  syncPromptControls();
  renderStructureView();
  persistPanelImageCache();
}

// Chinese is offered when it is turned on in settings and, once an image has
// been analyzed, when the model actually returned it.
function isPromptLanguageAvailable(language) {
  if (language === "en") return true;
  if (!state.settings?.enableChineseRecognition) return false;
  const languages = state.panelData.languages || [];
  return languages.length === 0 || languages.includes(language);
}

function pickByUiLanguage(value) {
  if (typeof value === "string") return value;
  return value?.[getTranslator().language] || value?.en || value?.zh || "";
}

function hydratePanelData(data) {
  state.panelData = {
    title: data.title || t("panelPromptTitleFallback"),
    detail: data.detail || "full",
    language: data.language || "en",
    aspectRatio: data.aspectRatio || state.settings?.aspectRatio || "1:1",
    ratioChosen: Boolean(data.ratioChosen),
    sections: data.sections || {},
    languages: Array.isArray(data.languages) ? data.languages : [],
    structureOpen: Boolean(data.structureOpen),
    prompts: {
      short: normalizePromptPair(data.prompts?.short),
      full: normalizePromptPair(data.prompts?.full)
    }
  };
  if (!isPromptLanguageAvailable(state.panelData.language)) {
    state.panelData.language = "en";
  }

  els.imageTitle.textContent = state.panelData.title || t("panelPromptTitleFallback");
  els.structure.open = state.panelData.structureOpen;
  renderRatioOptions();
  syncGenerationVisibility();
  syncPromptControls();
  renderStructureView();
  setStatus("");
  setStage("ready");
}

function syncPromptControls() {
  els.langSeg.classList.toggle("pg-hidden", !isPromptLanguageAvailable("zh"));
  setPressed(els.langZh, getCurrentLanguage() === "zh");
  setPressed(els.langEn, getCurrentLanguage() === "en");
  els.input.value = getCurrentPrompt();
  syncCopyButton();
  syncMoreMenu();
}

function setPressed(button, active, attribute = "aria-pressed") {
  button.classList.toggle("is-active", active);
  button.setAttribute(attribute, String(active));
}

function getCurrentPrompt() {
  const detail = state.panelData.detail;
  const language = getCurrentLanguage();
  return state.panelData.prompts[detail]?.[language] || "";
}

// Chinese prompts show first when they are generated and the UI is Chinese.
function getDefaultPromptLanguage() {
  return state.settings?.enableChineseRecognition && getTranslator().language === "zh" ? "zh" : "en";
}

function getCurrentLanguage() {
  return state.panelData.language || "en";
}

function normalizePromptPair(value) {
  if (value && typeof value === "object") {
    return {
      en: String(value.en || "").trim(),
      zh: String(value.zh || "").trim()
    };
  }

  return {
    en: "",
    zh: String(value || "").trim()
  };
}

// One row per filled-in section; clicking a row copies that section in the
// prompt language shown.
function renderStructureView() {
  const entries = getStructureEntries();
  els.structure.classList.toggle("pg-hidden", entries.length === 0);
  els.structureList.dataset.uiLanguage = getTranslator().language;
  els.structureList.innerHTML = entries
    .map(
      (entry) => `
        <button class="pg-structure-row" data-section="${entry.label}" type="button">
          <span class="pg-structure-label">${escapeHtml(getStructureLabel(entry.label))}</span>
          <span class="pg-structure-value">${escapeHtml(entry.value)}</span>
          <span class="pg-row-icon">${ICONS.copy}</span>
        </button>
      `
    )
    .join("");
}

async function handleStructureClick(event) {
  const row = event.target.closest("[data-section]");
  if (!row) return;
  const entry = getStructureEntries().find((item) => item.label === row.dataset.section);
  if (!entry || !(await copyText(entry.value))) return;
  row.classList.add("is-copied");
  row.querySelector(".pg-row-icon").innerHTML = ICONS.check;
  setTimeout(() => {
    row.classList.remove("is-copied");
    row.querySelector(".pg-row-icon").innerHTML = ICONS.copy;
  }, COPIED_FEEDBACK_DURATION);
}

function getStructureEntries() {
  const language = getCurrentLanguage();
  const sections = state.panelData.sections || {};
  return STRUCTURE_KEYS.map((key) => ({
    label: key,
    value: sections[key]?.[language] || sections[key]?.en || ""
  })).filter((entry) => entry.value);
}

function getStructureLabel(key) {
  const labelMap = {
    subject: "structureSubject",
    environment: "structureEnvironment",
    style: "structureStyle",
    lighting: "structureLighting",
    color: "structureColor",
    camera: "structureCamera",
    composition: "structureComposition",
    material: "structureMaterial",
    rendering: "structureRendering"
  };

  return t(labelMap[key] || key);
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function generateFromCurrentPrompt() {
  if (!state.settings?.imageGenerationEnabled) {
    setStatus(t("panelGenerationDisabled"), "error");
    return;
  }

  const prompt = getCurrentPrompt().trim();
  if (!prompt) {
    setStatus(t("panelPromptRequired"), "error");
    return;
  }

  setStatus("");
  await runAction("generate", async () => {
    const result = await sendMessage({
      type: "generate-image",
      payload: {
        prompt,
        aspectRatio: state.panelData.aspectRatio || state.settings?.aspectRatio || "1:1",
        count: state.settings?.imageCount || 1,
        openViewer: false
      }
    });

    state.currentJob = {
      images: result.images || []
    };

    // The images appearing under the button are the confirmation.
    renderInlineImages(state.currentJob.images);
  });
}

// Only analyzed results are cached; setup and idle panels have nothing to keep.
function persistPanelImageCache() {
  if (!state.panelSource?.key || panel.dataset.stage !== "ready") return;
  imageCache.set(state.panelSource.key, structuredClone(state.panelData));
}

function renderInlineImages(images) {
  els.inlineGrid.innerHTML = (images || [])
    .map((image, index) => {
      const src = `data:${image.mimeType || "image/png"};base64,${image.base64Data}`;
      return `
        <article class="pg-preview-card">
          <div class="pg-preview-frame">
            <img src="${escapeHtml(src)}" alt="generated preview ${index + 1}" />
            <div class="pg-preview-overlay">
              <button class="pg-preview-action" data-role="download" data-index="${index}" type="button">${escapeHtml(t("panelDownloadImage"))}</button>
              <button class="pg-preview-action" data-role="viewer" data-index="${index}" type="button">${escapeHtml(t("panelOpenViewer"))}</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function getImageDataUrl(index) {
  const image = state.currentJob?.images?.[index];
  if (!image) return "";
  return `data:${image.mimeType || "image/png"};base64,${image.base64Data}`;
}

function triggerDownload(src, filename) {
  const link = document.createElement("a");
  link.href = src;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

async function runAction(actionName, task) {
  if (state.actionState[actionName]) return;

  state.actionState[actionName] = true;
  syncActionState();

  try {
    await task();
  } catch (error) {
    setStatus(error.message || t("panelActionError"), "error");
  } finally {
    state.actionState[actionName] = false;
    syncActionState();
  }
}

function syncActionState() {
  const generating = state.actionState.generate;
  els.generate.classList.toggle("is-busy", generating);
  els.generate.disabled = generating;
  els.generateLabel.textContent = t(generating ? "panelGenerating" : "panelGenerate");
  syncMoreMenu();
}

function syncGenerationVisibility() {
  const enabled = Boolean(state.settings?.imageGenerationEnabled);
  els.generateSection?.classList.toggle("pg-hidden", !enabled);
}

function setStatus(text, tone = "") {
  els.status.textContent = text;
  if (tone) {
    els.status.dataset.tone = tone;
  } else {
    delete els.status.dataset.tone;
  }
}

async function captureImageDataUrl(image) {
  if (!(image instanceof HTMLImageElement)) return "";

  const src = image.currentSrc || image.src || "";
  if (src.startsWith("data:")) return src;

  try {
    if (typeof OffscreenCanvas !== "undefined") {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (width > 0 && height > 0) {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(image, 0, 0, width, height);
          const blob = await canvas.convertToBlob({ type: "image/png" });
          return await blobToDataUrl(blob);
        }
      }
    }
  } catch (_error) {
    // Cross-origin images can taint the canvas. Fallbacks continue below.
  }

  try {
    const response = await fetch(src, {
      credentials: "include"
    });
    if (response.ok) {
      const blob = await response.blob();
      return await blobToDataUrl(blob);
    }
  } catch (_error) {
    // Some sites block content-script fetches. The background worker has a final fallback path.
  }

  return "";
}

function getViewportCrop(element) {
  if (!(element instanceof Element)) return null;

  const rect = element.getBoundingClientRect();
  const x = Math.max(0, rect.left);
  const y = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  const width = Math.max(1, right - x);
  const height = Math.max(1, bottom - y);

  if (width <= 1 || height <= 1) return null;

  return {
    x,
    y,
    width,
    height,
    devicePixelRatio: window.devicePixelRatio || 1
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image blob."));
    reader.readAsDataURL(blob);
  });
}

async function handleContextAnalyze({ srcUrl, inSubframe }) {
  const point = inSubframe ? null : state.contextPoint;
  const target = point ? findTargetAtPoint(point.x, point.y) : null;

  if (target?.image) {
    await openPanelForSource(createImageSource(target.image));
    return;
  }

  if (target?.backgroundUrl) {
    await openPanelForSource(createUrlSource(target.backgroundUrl, target.element));
    return;
  }

  if (target?.element) {
    // Canvas and video pixels are often unreadable (cross-origin, WebGL, DRM),
    // so analyze what is on screen instead.
    const dataUrl = await captureViewportRegion(getViewportCrop(target.element));
    const title = t(target.element instanceof HTMLVideoElement ? "panelVideoFrameTitle" : "panelCanvasTitle");
    await openPanelForSource(createCapturedSource(dataUrl, title));
    return;
  }

  if (srcUrl) {
    await openPanelForSource(createUrlSource(srcUrl));
    return;
  }

  showToast(t("contextNoImageFound"));
  await startRegionSelection();
}

// elementsFromPoint also returns elements underneath transparent overlays,
// which is how sites like Pinterest and Instagram cover their images.
function findTargetAtPoint(x, y) {
  for (const element of document.elementsFromPoint(x, y)) {
    if (isOwnUiElement(element)) continue;
    if (element === document.documentElement || element === document.body) continue;

    if (element instanceof HTMLImageElement && (element.currentSrc || element.src)) {
      return { image: element };
    }
    if (element instanceof HTMLCanvasElement || element instanceof HTMLVideoElement) {
      return { element };
    }

    const backgroundUrl = getBackgroundImageUrl(element);
    if (backgroundUrl) {
      return { element, backgroundUrl };
    }
  }

  // elementsFromPoint skips elements with pointer-events: none.
  const image = findImageContainingPoint(x, y);
  return image ? { image } : null;
}

function findImageContainingPoint(x, y) {
  let best = null;
  let bestArea = Infinity;

  for (const image of document.images) {
    if (!(image.currentSrc || image.src)) continue;
    const rect = image.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;

    const area = rect.width * rect.height;
    if (area > 0 && area < bestArea) {
      best = image;
      bestArea = area;
    }
  }

  return best;
}

function getBackgroundImageUrl(element) {
  const rect = element.getBoundingClientRect();
  // Skips icon sprites, which are small and would analyze the whole sheet.
  if (rect.width < MIN_BACKGROUND_IMAGE_SIZE || rect.height < MIN_BACKGROUND_IMAGE_SIZE) return "";

  const match = getComputedStyle(element).backgroundImage.match(/url\(\s*(["']?)(.*?)\1\s*\)/);
  if (!match?.[2]) return "";

  try {
    return new URL(match[2], document.baseURI).href;
  } catch (_error) {
    return "";
  }
}

function isOwnUiElement(element) {
  return (
    hoverTrigger.contains(element) ||
    moreMenu.contains(element) ||
    element === toast ||
    panel.contains(element) ||
    Boolean(element.closest?.("#pg-region-overlay"))
  );
}

async function startRegionSelection() {
  closeMoreMenu();
  if (state.regionSelecting) return;
  state.regionSelecting = true;
  hideHoverButton();
  try {
    state.settings = await sendMessage({ type: "get-settings" });
  } catch (error) {
    state.regionSelecting = false;
    throw error;
  }
  // Ask for a connection before the user draws an area that cannot be analyzed.
  if (!state.settings.analysisReady) {
    state.regionSelecting = false;
    await openPanelForSource(createRegionSource());
    return;
  }

  // Hide the panel while selecting so the page looks exactly like the
  // screenshot will, instead of the panel covering part of it.
  const restoreUi = hideOwnUiForCapture([panel, hoverTrigger, moreMenu]);

  const overlay = document.createElement("div");
  overlay.id = "pg-region-overlay";
  overlay.lang = getTranslator().messages.htmlLang;
  overlay.innerHTML = `
    <div class="pg-region-hint">${escapeHtml(t("regionSelectHint"))}</div>
    <div class="pg-region-box"><span class="pg-region-size"></span></div>
  `;
  const box = overlay.querySelector(".pg-region-box");
  const sizeLabel = overlay.querySelector(".pg-region-size");
  let start = null;
  let selection = null;

  const updateSelection = (event) => {
    const left = Math.max(0, Math.min(start.x, event.clientX));
    const top = Math.max(0, Math.min(start.y, event.clientY));
    const right = Math.min(window.innerWidth, Math.max(start.x, event.clientX));
    const bottom = Math.min(window.innerHeight, Math.max(start.y, event.clientY));
    selection = { x: left, y: top, width: right - left, height: bottom - top };

    box.style.left = `${selection.x}px`;
    box.style.top = `${selection.y}px`;
    box.style.width = `${selection.width}px`;
    box.style.height = `${selection.height}px`;
    box.classList.add("is-visible");
    // The size label sits above the box, or inside it near the top edge.
    box.classList.toggle("is-label-inside", selection.y < 28);
    const scale = window.devicePixelRatio || 1;
    sizeLabel.textContent = `${Math.round(selection.width * scale)} × ${Math.round(selection.height * scale)}`;
  };

  const onKeyDown = (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    finish(null);
  };

  const finish = async (selected) => {
    overlay.remove();
    document.removeEventListener("keydown", onKeyDown, true);
    state.regionSelecting = false;
    // captureViewportRegion hides the panel again in the same task, so it is
    // not painted in between.
    restoreUi();
    if (!selected) return;

    try {
      const dataUrl = await captureViewportRegion({
        ...selected,
        devicePixelRatio: window.devicePixelRatio || 1
      });
      await openPanelForSource(createCapturedSource(dataUrl, t("panelRegionTitle")));
    } catch (error) {
      showToast(error.message || t("regionCaptureFailed"));
    }
  };

  overlay.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    start = { x: event.clientX, y: event.clientY };
    overlay.setPointerCapture(event.pointerId);
    // Once dragging starts, the box's shadow dims the page outside it.
    overlay.classList.add("is-dragging");
    updateSelection(event);
  });
  overlay.addEventListener("pointermove", (event) => {
    if (start) updateSelection(event);
  });
  overlay.addEventListener("pointerup", (event) => {
    if (!start) return;
    updateSelection(event);
    start = null;
    const isLargeEnough =
      selection.width >= MIN_SELECTION_SIZE && selection.height >= MIN_SELECTION_SIZE;
    finish(isLargeEnough ? selection : null);
  });
  overlay.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    finish(null);
  });

  document.addEventListener("keydown", onKeyDown, true);
  document.documentElement.append(overlay);
}

// The screenshot is taken by the background worker from what is painted on
// screen, so the panel and buttons are hidden until the capture is done.
async function captureViewportRegion(crop) {
  if (!crop) {
    throw new Error(t("regionOutOfView"));
  }

  const restore = hideOwnUiForCapture();
  try {
    await waitForNextPaint();
    const result = await sendMessage({ type: "capture-region", payload: { crop } });
    return result.dataUrl;
  } finally {
    restore();
  }
}

function hideOwnUiForCapture(elements = [panel, hoverTrigger, moreMenu, toast]) {
  const previous = elements.map((element) => element.style.visibility);
  elements.forEach((element) => {
    element.style.visibility = "hidden";
  });

  return () => {
    elements.forEach((element, index) => {
      element.style.visibility = previous[index];
    });
  };
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 30)));
  });
}

function showToast(text) {
  toast.textContent = text;
  toast.classList.add("is-visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 3200);
}

async function sendMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "Extension request failed.");
  }
  return response.data;
}

}

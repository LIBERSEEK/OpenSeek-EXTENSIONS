const form = document.getElementById("settings-form");
const statusEl = document.getElementById("status");
const docButton = document.getElementById("open-doc");
const promptProviderField = document.querySelector('[name="promptProvider"]');
const imageProviderField = document.querySelector('[name="imageProvider"]');
const imageGenerationEnabledField = document.querySelector('[name="imageGenerationEnabled"]');
const imageSettingsGroup = document.getElementById("image-settings-group");
const uiLanguageField = document.querySelector('[name="uiLanguage"]');
const promptModelHelp = document.getElementById("prompt-model-help");
const imageModelHelp = document.getElementById("image-model-help");
const promptBaseUrlHelp = document.getElementById("prompt-base-url-help");
const imageBaseUrlHelp = document.getElementById("image-base-url-help");
const separateImageConnectionField = document.querySelector('[name="separateImageConnection"]');
const analysisInstructionsField = document.querySelector('[name="analysisInstructions"]');

const BOFT_BASE_URL = "https://api-direct.boft.ai/v1";
const PROVIDER_DOCS = {
  boft: "https://supply.boft.ai",
  gemini: "https://ai.google.dev/gemini-api/docs/image-generation",
  "openai-compatible": "https://developers.openai.com/api/docs"
};

const PROVIDER_FIELD_NAMES = ["promptProvider", "imageProvider"];
// Text fields save after typing pauses; switches and selects save right away.
const TYPING_SAVE_DELAY = 600;

let currentSettings = null;
let currentLanguagePreference = uiLanguageField?.value || "auto";
let promptProfileDrafts = {};
let imageProfileDrafts = {};
let independentImageDraft = null;
let saveTimer = null;
let pendingWrite = Promise.resolve();
let boftActionRunning = false;
let defaultAnalysisInstructions = "";

init();

async function init() {
  renderLanguageChoices();
  renderProviderChoices();
  applyLanguage(currentLanguagePreference);
  showVersion();
  // Prevent edits to default fields while stored profiles are still loading.
  const controls = form.querySelectorAll("input, select, textarea, button");
  controls.forEach(control => { control.disabled = true; });
  form.setAttribute("aria-busy", "true");

  uiLanguageField?.addEventListener("change", handleLanguagePreferenceChange);
  imageGenerationEnabledField?.addEventListener("change", syncImageSettingsVisibility);
  promptProviderField?.addEventListener("change", handlePromptProviderChange);
  imageProviderField?.addEventListener("change", handleImageProviderChange);
  separateImageConnectionField.addEventListener("change", handleSeparateImageConnectionChange);
  form.addEventListener("submit", handleSubmit);
  form.addEventListener("input", handleFormInput);
  form.addEventListener("change", handleFormChange);
  form.addEventListener("click", handleFormClick);
  // Already signed in but using another service: switch back without signing in again.
  document.getElementById('boft-connect').addEventListener('click', () => (
    currentSettings?.boftAccount?.connected && promptProviderField.value !== 'boft' ? useBoftProvider() : runBoftAction('boft-connect')
  ));
  document.getElementById('boft-disconnect').addEventListener('click', () => runBoftAction('boft-disconnect'));
  document.getElementById('boft-models').addEventListener('click', () => runBoftAction('boft-models'));
  docButton.addEventListener("click", openDocs);
  document.getElementById("reset-analysis-instructions").addEventListener("click", () => {
    analysisInstructionsField.value = defaultAnalysisInstructions;
    syncAnalysisInstructionsState();
    scheduleSave(0);
  });

  if (!hasExtensionRuntime()) {
    setStandaloneMode();
    return;
  }

  try {
    const settings = await sendMessage({ type: "get-settings" });
    currentSettings = settings;
    currentLanguagePreference = settings.uiLanguage || "auto";
    promptProfileDrafts = cloneProfiles(settings.promptProviderProfiles);
    imageProfileDrafts = cloneProfiles(settings.imageProviderProfiles);
    hydrateForm(settings);
    applyLanguage(currentLanguagePreference);
    controls.forEach(control => { control.disabled = false; });
    form.setAttribute("aria-busy", "false");
    setStatus("");
  } catch (error) {
    setStatus(error.message || t("statusLoadFailed"), "error");
  }
}

function showVersion() {
  const version = globalThis.chrome?.runtime?.getManifest?.()?.version;
  if (version) setText("about-version", version);
}

function handleFormInput(event) {
  if (event.target === analysisInstructionsField) syncAnalysisInstructionsState();
  if (event.target.matches('input[type="text"], input[type="url"], input[type="password"], textarea')) {
    scheduleSave(TYPING_SAVE_DELAY);
  }
}

function handleFormChange(event) {
  // Provider changes save through their own handlers, which first store the
  // previous provider's values.
  if (PROVIDER_FIELD_NAMES.includes(event.target.name)) return;
  scheduleSave(event.target.matches('input[type="checkbox"], select') ? 0 : TYPING_SAVE_DELAY);
}

function handleFormClick(event) {
  const keyToggle = event.target.closest(".key-toggle");
  if (keyToggle) {
    event.preventDefault();
    const input = getField(keyToggle.dataset.keyFor);
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    syncKeyToggles();
  }
}

function scheduleSave(delay) {
  if (!hasExtensionRuntime()) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveSettings();
  }, delay);
}

// Saves right away if a save is waiting, using the given providers instead of
// what the provider fields show now.
async function flushPendingSave(overrides) {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  await saveSettings(overrides);
}

async function handleSubmit(event) {
  event.preventDefault();
  clearTimeout(saveTimer);
  saveTimer = null;
  await saveSettings();
}

async function saveSettings(overrides = {}) {
  if (!hasExtensionRuntime()) {
    setStatus(t("statusOpenExtension"), "error");
    return;
  }

  if (analysisInstructionsField.maxLength > 0 && analysisInstructionsField.value.length > analysisInstructionsField.maxLength) {
    setStatus(t("analysisInstructionsTooLong", { max: analysisInstructionsField.maxLength }), "error");
    return null;
  }

  const promptProvider = overrides.promptProvider || promptProviderField?.value || "gemini";
  const separate = separateImageConnectionField.checked;
  const imageProvider = separate ? (overrides.imageProvider || imageProviderField?.value || "gemini") : promptProvider;
  updatePromptDraftFromForm(promptProvider);
  // Keep the independent draft intact while the saved connection is shared.
  if (separate) updateImageDraftFromForm(imageProvider);

  const formData = new FormData(form);
  const payload = {
    boftApiKey: getField("boftApiKey")?.value || "",
    provider: promptProvider,
    promptProvider,
    imageProvider,
    imageConnectionMode: separate ? "separate" : "shared",
    apiMode: "direct",
    uiLanguage: uiLanguageField?.value || formData.get("uiLanguage") || "auto",
    promptApiKey: String(formData.get("promptApiKey") || ""),
    promptModel: String(formData.get("promptModel") || ""),
    promptBaseUrl: String(formData.get("promptBaseUrl") || ""),
    analysisInstructions: analysisInstructionsField.value.trim() === defaultAnalysisInstructions.trim()
      ? "" : analysisInstructionsField.value.trim(),
    autoAnalyze: getField("autoAnalyze")?.checked || false,
    hoverButtonEnabled: getField("hoverButtonEnabled")?.checked || false,
    enableChineseRecognition: getField("enableChineseRecognition")?.checked || false,
    imageGenerationEnabled: getField("imageGenerationEnabled")?.checked || false,
    imageApiKey: String(formData.get(separate ? "imageApiKey" : "promptApiKey") || ""),
    imageModel: String(formData.get("imageModel") || ""),
    imageBaseUrl: String(formData.get(separate ? "imageBaseUrl" : "promptBaseUrl") || ""),
    customProxyUrl: "",
    customProxyToken: ""
  };
  if (!separate) {
    imageProfileDrafts[imageProvider] = normalizeImageProfile(imageProvider, {
      apiKey: payload.imageApiKey, baseUrl: payload.imageBaseUrl,
      model: payload.imageModel, imageGenerationEnabled: payload.imageGenerationEnabled
    });
  }

  try {
    setStatus(t("statusSaving"));
    const saved = await (pendingWrite = pendingWrite.catch(() => {}).then(() => sendMessage({ type: "save-settings", payload })));
    // Keep the form as typed: re-filling it here would undo keystrokes made
    // while the save was in flight.
    currentSettings = {
      ...saved,
      promptProvider: promptProviderField?.value || saved.promptProvider,
      imageProvider: separateImageConnectionField.checked ? imageProviderField.value : promptProviderField.value
    };
    renderBoftAccount();
    setStatus(t("statusSaved"));
    return saved;
  } catch (error) {
    setStatus(error.message || t("statusSaveFailed"), "error");
    return null;
  }
}

function setStatus(text, tone = "") {
  statusEl.textContent = text;
  if (tone) {
    statusEl.dataset.tone = tone;
  } else {
    delete statusEl.dataset.tone;
  }
}

function handleLanguagePreferenceChange() {
  currentLanguagePreference = uiLanguageField?.value || "auto";
  applyLanguage(currentLanguagePreference);
}

async function handlePromptProviderChange() {
  const previousProvider = currentSettings?.promptProvider || "gemini";
  updatePromptDraftFromForm(previousProvider);
  await flushPendingSave({ promptProvider: previousProvider });
  const provider = promptProviderField?.value || "gemini";
  currentSettings = {
    ...(currentSettings || {}),
    promptProvider: provider,
    provider
  };
  hydratePromptFields(provider, promptProfileDrafts[provider] || {});
  if (!separateImageConnectionField.checked) {
    // Reuse the saved model for this provider; keep generation on/off unchanged.
    const enabled = imageGenerationEnabledField.checked;
    hydrateImageFields(provider, imageProfileDrafts[provider] || {});
    imageGenerationEnabledField.checked = enabled;
    syncImageSettingsVisibility();
  }
  renderProviderChoices();
  syncDocsButton(provider);
  syncConnectionUI();
  scheduleSave(0);
}

async function handleImageProviderChange() {
  const previousProvider = currentSettings?.imageProvider || "gemini";
  updateImageDraftFromForm(previousProvider);
  await flushPendingSave({ imageProvider: previousProvider });
  const provider = imageProviderField?.value || "gemini";
  currentSettings = {
    ...(currentSettings || {}),
    imageProvider: provider
  };
  hydrateImageFields(provider, imageProfileDrafts[provider] || {});
  renderProviderChoices();
  syncConnectionUI();
  scheduleSave(0);
}

function handleSeparateImageConnectionChange() {
  const enabled = imageGenerationEnabledField.checked;
  if (separateImageConnectionField.checked) {
    if (independentImageDraft) {
      hydrateImageFields(independentImageDraft.provider, independentImageDraft.profile);
    }
    currentSettings = { ...(currentSettings || {}), imageProvider: imageProviderField.value };
  } else {
    const provider = imageProviderField.value;
    updateImageDraftFromForm(provider);
    // A shared provider can change without replacing this independent draft.
    independentImageDraft = { provider, profile: { ...imageProfileDrafts[provider] } };
    if (provider !== promptProviderField.value) {
      hydrateImageFields(promptProviderField.value, imageProfileDrafts[promptProviderField.value] || {});
    }
  }
  imageGenerationEnabledField.checked = enabled;
  renderProviderChoices();
  syncImageSettingsVisibility();
  syncConnectionUI();
}

function syncConnectionUI() {
  const separate = separateImageConnectionField.checked;
  const promptProvider = promptProviderField.value;
  const imageProvider = separate ? imageProviderField.value : promptProvider;
  const usesBoft = promptProvider === "boft" || (imageGenerationEnabledField.checked && imageProvider === "boft");
  document.getElementById("image-connection-fields").hidden = !separate;
  // The BOFT.AI row is always shown as the easy path; its manual key only
  // matters while BOFT.AI is in use without a signed-in account.
  document.getElementById("boft-key-row").hidden = !usesBoft || Boolean(currentSettings?.boftAccount?.connected);
  document.getElementById("boft-models").hidden = !usesBoft;
}

function hydrateForm(settings) {
  currentSettings = settings;
  currentLanguagePreference = settings.uiLanguage || currentLanguagePreference || "auto";
  defaultAnalysisInstructions = settings.defaultAnalysisInstructions ?? defaultAnalysisInstructions;
  if (settings.analysisInstructionsMaxLength) analysisInstructionsField.maxLength = settings.analysisInstructionsMaxLength;
  analysisInstructionsField.value = settings.analysisInstructions || defaultAnalysisInstructions;
  syncAnalysisInstructionsState();

  setFieldValue("boftApiKey", settings.boftApiKey || "");
  setFieldValue("uiLanguage", currentLanguagePreference);
  setFieldValue("promptProvider", settings.promptProvider || "gemini");
  setFieldValue("imageProvider", settings.imageProvider || "gemini");
  setCheckboxValue("enableChineseRecognition", settings.enableChineseRecognition);

  hydratePromptFields(
    settings.promptProvider || "gemini",
    settings.promptProviderProfiles?.[settings.promptProvider || "gemini"] || {
      apiKey: settings.promptApiKey,
      model: settings.promptModel,
      baseUrl: settings.promptBaseUrl,
      autoAnalyze: settings.autoAnalyze
    }
  );
  hydrateImageFields(
    settings.imageProvider || "gemini",
    settings.imageProviderProfiles?.[settings.imageProvider || "gemini"] || {
      imageGenerationEnabled: settings.imageGenerationEnabled,
      apiKey: settings.imageApiKey,
      model: settings.imageModel,
      baseUrl: settings.imageBaseUrl
    }
  );

  const sameProvider = settings.promptProvider === settings.imageProvider;
  const sameConnection = sameProvider && (settings.promptProvider === "boft" || (
    getField("promptApiKey").value === getField("imageApiKey").value &&
    getField("promptBaseUrl").value.replace(/\/+$/, "") === getField("imageBaseUrl").value.replace(/\/+$/, "")
  ));
  // Old installs infer sharing without modifying their stored connections.
  separateImageConnectionField.checked = settings.imageConnectionMode === "separate" ||
    (settings.imageConnectionMode !== "shared" && !sameConnection);
  independentImageDraft = null;
  setCheckboxValue("hoverButtonEnabled", settings.hoverButtonEnabled !== false);
  // Show the own-key fields only to people who already use their own key.
  const provider = settings.promptProvider || "gemini";
  document.getElementById("own-key").open = provider === "boft"
    ? Boolean(settings.boftApiKey && !settings.boftAccount?.connected)
    : Boolean(getField("promptApiKey").value);

  renderLanguageChoices();
  renderProviderChoices();
  syncImageSettingsVisibility();
  syncDocsButton(settings.promptProvider || "gemini");
  syncConnectionUI();
}

function hydratePromptFields(provider, source) {
  const merged = normalizePromptProfile(provider, source);
  setFieldValue("promptProvider", provider);
  setFieldValue("promptApiKey", merged.apiKey);
  setFieldValue("promptModel", merged.model);
  setFieldValue("promptBaseUrl", merged.baseUrl);
  setCheckboxValue("autoAnalyze", merged.autoAnalyze);
  syncPromptProviderUI(provider);
}

function hydrateImageFields(provider, source) {
  const merged = normalizeImageProfile(provider, source);
  setFieldValue("imageProvider", provider);
  setCheckboxValue("imageGenerationEnabled", merged.imageGenerationEnabled);
  setFieldValue("imageApiKey", merged.apiKey);
  setFieldValue("imageModel", merged.model);
  setFieldValue("imageBaseUrl", merged.baseUrl);
  syncImageProviderUI(provider);
  syncImageSettingsVisibility();
}

function updatePromptDraftFromForm(provider = promptProviderField?.value || "gemini") {
  promptProfileDrafts[provider] = normalizePromptProfile(provider, {
    apiKey: getField("promptApiKey")?.value || "",
    model: getField("promptModel")?.value || "",
    baseUrl: getField("promptBaseUrl")?.value || "",
    autoAnalyze: getField("autoAnalyze")?.checked || false
  });
}

function updateImageDraftFromForm(provider = imageProviderField?.value || "gemini") {
  imageProfileDrafts[provider] = normalizeImageProfile(provider, {
    imageGenerationEnabled: getField("imageGenerationEnabled")?.checked || false,
    apiKey: getField("imageApiKey")?.value || "",
    model: getField("imageModel")?.value || "",
    baseUrl: getField("imageBaseUrl")?.value || ""
  });
}

function renderLanguageChoices() {
  if (!uiLanguageField) return;

  const current = uiLanguageField.value || currentLanguagePreference || "auto";
  uiLanguageField.innerHTML = [
    { value: "auto", label: t("languageAuto") },
    { value: "zh", label: t("languageZh") },
    { value: "en", label: t("languageEn") }
  ]
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
  uiLanguageField.value = current;
}

function renderProviderChoices() {
  renderProviderSelect(promptProviderField, promptProviderField?.value || currentSettings?.promptProvider || "gemini");
  renderProviderSelect(imageProviderField, imageProviderField?.value || currentSettings?.imageProvider || "gemini");
}

function renderProviderSelect(field, current) {
  if (!field) return;

  const providers = [
    { value: "boft", label: "BOFT.AI", hint: t("providerBoftHint") },
    { value: "gemini", label: t("providerGemini"), hint: t("providerGeminiHint") },
    { value: "openai-compatible", label: t("providerOpenAICompatible"), hint: t("providerOpenAICompatibleHint") }
  ];
  field.innerHTML = providers
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
  field.value = current;

}

function syncKeyToggles() {
  for (const toggle of document.querySelectorAll(".key-toggle")) {
    const input = getField(toggle.dataset.keyFor);
    const visible = input?.type === "text";
    toggle.textContent = visible ? t("hideKey") : t("showKey");
    toggle.setAttribute("aria-pressed", String(visible));
  }
}

function syncAnalysisInstructionsState() {
  const value = analysisInstructionsField.value.trim();
  const isDefault = !value || value === defaultAnalysisInstructions.trim();
  setText("analysis-instructions-state", `${t(isDefault ? "analysisInstructionsDefault" : "analysisInstructionsCustom")} · ${analysisInstructionsField.value.length}/${analysisInstructionsField.maxLength > 0 ? analysisInstructionsField.maxLength : "—"}`);
}

function applyLanguage(preference) {
  const translator = globalThis.ImageLensI18n.createTranslator(preference);
  document.documentElement.lang = translator.messages.htmlLang;
  document.title = translator.t("optionsTitle");

  setText("brand-name", translator.t("appName"));
  for (const [id, key] of Object.entries({
    "settings-title": "settingsTitle", "autosave-note": "autosaveNote",
    "connection-title": "connectionTitle", "models-title": "modelsTitle",
    "preferences-title": "preferencesTitle", "advanced-title": "advancedTitle",
    "interface-title": "interfaceTitle", "about-feedback": "feedbackLink",
    "hover-button-enabled-label": "hoverButtonEnabledLabel", "hover-button-enabled-note": "hoverButtonEnabledNote",
    "image-generation-enabled-note": "imageGenerationEnabledNote",
    "separate-image-connection-label": "separateImageConnectionLabel",
    "separate-image-connection-note": "separateImageConnectionNote"
  })) setText(id, translator.t(key));
  for (const [id, key] of Object.entries({
    "analysis-prompt-title": "analysisPromptTitle", "analysis-instructions-label": "analysisInstructionsLabel",
    "analysis-instructions-note": "analysisInstructionsNote", "analysis-instructions-hint": "analysisInstructionsHint",
    "reset-analysis-instructions": "resetAnalysisInstructions"
  })) setText(id, translator.t(key));
  syncAnalysisInstructionsState();
  setText("about-version-label", translator.t("aboutVersion"));
  setText("about-privacy", translator.t("aboutPrivacy"));
  setText("ui-language-label", translator.t("languageLabel"));
  setText("prompt-provider-label", translator.t("promptProviderLabel"));
  setText("prompt-base-url-label", translator.t("promptBaseUrlLabel"));
  setText("prompt-api-key-label", getPromptApiKeyLabel(promptProviderField?.value || "gemini", translator));
  setText("local-storage-note", translator.t("localStorageNote"));
  setText("prompt-model-label", translator.t("promptModelLabel"));
  setText("auto-analyze-label", translator.t("autoAnalyzeLabel"));
  setText("enable-chinese-recognition-label", translator.t("enableChineseRecognitionLabel"));
  setText("image-generation-enabled-label", translator.t("imageGenerationEnabledLabel"));
  setText("image-provider-label", translator.t("imageProviderLabel"));
  setText("image-base-url-label", translator.t("imageBaseUrlLabel"));
  setText("image-api-key-label", getImageApiKeyLabel(imageProviderField?.value || "gemini", translator));
  setText("image-model-label", translator.t("imageModelLabel"));
  setText("open-doc", translator.t("docsButton"));
  setText("options-note", translator.t("optionsNote"));

  setPlaceholder(
    "promptApiKey",
    translator.language === "zh" ? "请填入对应服务商的 API Key" : "Enter the provider API key"
  );
  setPlaceholder("promptBaseUrl", getProviderBaseUrlPlaceholder(promptProviderField?.value || "gemini"));
  setPlaceholder("promptModel", getPromptModelPlaceholder(promptProviderField?.value || "gemini"));
  setPlaceholder(
    "imageApiKey",
    translator.language === "zh" ? "请填入对应服务商的 API Key" : "Enter the provider API key"
  );
  setPlaceholder("imageBaseUrl", getProviderBaseUrlPlaceholder(imageProviderField?.value || "gemini"));
  setPlaceholder("imageModel", getImageModelPlaceholder(imageProviderField?.value || "gemini"));

  renderLanguageChoices();
  renderProviderChoices();
  syncPromptProviderUI(promptProviderField?.value || "gemini");
  syncImageProviderUI(imageProviderField?.value || "gemini");
  syncKeyToggles();
  renderBoftAccount();
  syncConnectionUI();
}

function syncPromptProviderUI(provider) {
  getField('promptApiKey').closest('.row').hidden = provider === 'boft';
  document.getElementById("prompt-base-url-row").hidden = provider === 'boft';
  getField('promptBaseUrl').readOnly = provider === 'boft';
  const translator = globalThis.ImageLensI18n.createTranslator(currentLanguagePreference);
  setText("prompt-api-key-label", getPromptApiKeyLabel(provider, translator));
  setPlaceholder("promptBaseUrl", getProviderBaseUrlPlaceholder(provider));
  setPlaceholder("promptModel", getPromptModelPlaceholder(provider));
  if (promptBaseUrlHelp) {
    promptBaseUrlHelp.textContent =
      provider === "boft" ? t("boftBaseUrlHelp") : provider === "openai-compatible"
        ? translator.t("promptBaseUrlHelpOpenAICompatible")
        : translator.t("promptBaseUrlHelpGemini");
  }
  if (promptModelHelp) {
    promptModelHelp.textContent =
      provider === "boft" ? t("boftModelHelp") : provider === "openai-compatible"
        ? translator.t("promptModelHelpOpenAICompatible")
        : translator.t("promptModelHelpGemini");
  }
}

function syncImageProviderUI(provider) {
  getField('imageApiKey').closest('.row').hidden = provider === 'boft';
  getField('imageBaseUrl').readOnly = provider === 'boft';
  const translator = globalThis.ImageLensI18n.createTranslator(currentLanguagePreference);
  setText("image-api-key-label", getImageApiKeyLabel(provider, translator));
  setPlaceholder("imageBaseUrl", getProviderBaseUrlPlaceholder(provider));
  setPlaceholder("imageModel", getImageModelPlaceholder(provider));
  if (imageBaseUrlHelp) {
    imageBaseUrlHelp.textContent =
      provider === "boft" ? t("boftBaseUrlHelp") : provider === "openai-compatible"
        ? translator.t("imageBaseUrlHelpOpenAICompatible")
        : translator.t("imageBaseUrlHelpGemini");
  }
  if (imageModelHelp) {
    imageModelHelp.textContent =
      translator.t("imageModelCapabilityNote");
  }
}

function getPromptApiKeyLabel(provider, translator) {
  const providerName =
    provider === "openai-compatible"
      ? translator.t("providerOpenAICompatible")
      : translator.t("providerGemini");
  return `${providerName} API Key`;
}

function getImageApiKeyLabel(provider, translator) {
  const providerName =
    provider === "openai-compatible"
      ? translator.t("providerOpenAICompatible")
      : translator.t("providerGemini");
  return `${providerName} API Key`;
}

function getPromptModelPlaceholder(provider) {
  return provider === "openai-compatible" ? "gpt-5.5" : "gemini-3.8-flash";
}

function getImageModelPlaceholder(provider) {
  return provider === "openai-compatible" ? "gpt-image-2" : "gemini-nano-banana-2.1";
}

function getProviderBaseUrlPlaceholder(provider) {
  if (provider === "boft") return BOFT_BASE_URL;
  return provider === "openai-compatible"
    ? "https://api.openai.com/v1"
    : "https://generativelanguage.googleapis.com/v1beta";
}

function openDocs() {
  const provider = promptProviderField?.value || "gemini";
  const url = PROVIDER_DOCS[provider] || PROVIDER_DOCS.gemini;

  if (chrome?.tabs?.create) {
    chrome.tabs.create({ url });
    return;
  }

  window.open(url, "_blank", "noopener");
}

function syncDocsButton(provider) {
  docButton.dataset.provider = provider;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setPlaceholder(name, value) {
  const field = getField(name);
  if (field) field.placeholder = value;
}

function setFieldValue(name, value) {
  const field = getField(name);
  if (field) field.value = value ?? "";
}

function setCheckboxValue(name, value) {
  const field = getField(name);
  if (field) field.checked = Boolean(value);
}

function getField(name) {
  return document.querySelector(`[name="${CSS.escape(name)}"]`);
}

function syncImageSettingsVisibility() {
  const enabled = Boolean(imageGenerationEnabledField?.checked);
  imageSettingsGroup?.classList.toggle("is-hidden", !enabled);
  syncConnectionUI();
}

function cloneProfiles(value) {
  const source = value && typeof value === "object" ? value : {};
  return JSON.parse(JSON.stringify(source));
}

function getPromptProviderDefaults(provider) {
  if (provider === "boft") return { apiKey: "", model: "gemini-3.8-flash", baseUrl: BOFT_BASE_URL, autoAnalyze: true };
  if (provider === "openai-compatible") {
    return {
      apiKey: "",
      model: "gpt-5.5",
      baseUrl: "https://api.openai.com/v1",
      autoAnalyze: true
    };
  }

  return {
    apiKey: "",
    model: "gemini-3.8-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    autoAnalyze: true
  };
}

function getImageProviderDefaults(provider) {
  if (provider === "boft") return { apiKey: "", model: "gemini-nano-banana-2.1", baseUrl: BOFT_BASE_URL, imageGenerationEnabled: true };
  if (provider === "openai-compatible") {
    return {
      imageGenerationEnabled: true,
      apiKey: "",
      model: "gpt-image-2",
      baseUrl: "https://api.openai.com/v1"
    };
  }

  return {
    imageGenerationEnabled: true,
    apiKey: "",
    model: "gemini-nano-banana-2.1",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta"
  };
}

function normalizePromptProfile(provider, source) {
  const defaults = getPromptProviderDefaults(provider);
  const input = source && typeof source === "object" ? source : {};
  return {
    apiKey: String(input.apiKey || ""),
    model: String(input.model || defaults.model),
    baseUrl: provider === "boft" ? BOFT_BASE_URL : String(input.baseUrl || defaults.baseUrl),
    autoAnalyze: "autoAnalyze" in input ? Boolean(input.autoAnalyze) : defaults.autoAnalyze
  };
}

function normalizeImageProfile(provider, source) {
  const defaults = getImageProviderDefaults(provider);
  const input = source && typeof source === "object" ? source : {};
  return {
    imageGenerationEnabled:
      "imageGenerationEnabled" in input
        ? Boolean(input.imageGenerationEnabled)
        : defaults.imageGenerationEnabled,
    apiKey: String(input.apiKey || ""),
    model: String(input.model || defaults.model),
    baseUrl: provider === "boft" ? BOFT_BASE_URL : String(input.baseUrl || defaults.baseUrl)
  };
}

function hasExtensionRuntime() {
  return Boolean(globalThis.chrome?.runtime?.id && globalThis.chrome?.runtime?.sendMessage);
}

function setStandaloneMode() {
  for (const field of document.querySelectorAll("input, select, textarea, #reset-analysis-instructions, .provider-option, .boft-actions button")) {
    field.disabled = true;
  }
  setStatus(t("statusStandalone"), "error");
}

function t(key, values) {
  return globalThis.ImageLensI18n.createTranslator(currentLanguagePreference).t(key, values);
}

async function sendMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "Options request failed.");
  }
  return response.data;
}


// The BOFT.AI row says what the extension uses now and offers one next step.
function renderBoftAccount() {
  const account = currentSettings?.boftAccount;
  const connected = Boolean(account?.connected);
  const active = promptProviderField?.value === "boft";
  const ownKey = !active && Boolean(getField("promptApiKey")?.value);
  let status;
  if (active && connected) status = t('boftConnected', { email: account.email });
  else if (active && currentSettings?.boftApiKey) status = t('boftManualConfigured');
  else if (ownKey) status = t('boftInactive', { provider: getProviderLabel(promptProviderField.value) });
  else status = t('boftDisconnected');
  setText('boft-account-status', status);
  setText('boft-connect', t(connected ? (active ? 'boftReconnect' : 'boftUse') : 'boftLogin'));
  document.getElementById('boft-connect').classList.toggle('btn-primary', !(connected && active));
  setText('boft-disconnect', t('boftLogout'));
  setText('boft-models', t('boftLoadModels'));
  setText('boft-manual-label', t('boftManual'));
  document.getElementById('boft-disconnect').hidden = !connected || !active;
}

function getProviderLabel(provider) {
  if (provider === "boft") return "BOFT.AI";
  return t(provider === "openai-compatible" ? "providerOpenAICompatible" : "providerGemini");
}

async function useBoftProvider() {
  promptProviderField.value = "boft";
  await handlePromptProviderChange();
  renderBoftAccount();
}

async function runBoftAction(type) {
  if (boftActionRunning) return;
  boftActionRunning = true;
  const feedback = document.getElementById('boft-feedback');
  const controls = document.querySelectorAll('#settings-form input, #settings-form select, #settings-form textarea, #settings-form button, .boft-actions button');
  try {
    clearTimeout(saveTimer);
    saveTimer = null;
    const save = saveSettings();
    controls.forEach(control => { control.disabled = true; });
    if (!await save) throw new Error(t("statusSaveFailed"));
    feedback.textContent = t(type === 'boft-connect' ? 'boftAuthorizing' : 'boftWorking');
    const result = await sendMessage({ type });
    if (type === 'boft-models') {
      const list = document.getElementById('boft-model-list');
      list.replaceChildren(...result.map(id => { const option = document.createElement('option'); option.value = id; return option; }));
      feedback.textContent = t('boftModelsLoaded', { count: result.length });
    } else {
      const settings = await sendMessage({ type: 'get-settings' });
      promptProfileDrafts = cloneProfiles(settings.promptProviderProfiles);
      imageProfileDrafts = cloneProfiles(settings.imageProviderProfiles);
      hydrateForm(settings);
      applyLanguage(currentLanguagePreference);
      feedback.textContent = t(type === 'boft-connect' ? 'boftLoginSuccess' : 'boftLogoutSuccess');
    }
  } catch (error) {
    feedback.textContent = error.message || t('statusSaveFailed');
  } finally {
    boftActionRunning = false;
    controls.forEach(control => { control.disabled = false; });
    renderProviderChoices();
  }
}

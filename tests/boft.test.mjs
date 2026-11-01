import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { connectBoft, disconnectBoft, getBoftStatus, resolveBoftSettings, listBoftModels, BOFT_ISSUER, BOFT_BASE_URL } from '../src/integrations/image-lens/boft.js';
import { registerImageLensBackground } from '../src/integrations/image-lens/background.js';
import { DEFAULT_ANALYSIS_INSTRUCTIONS, MAX_ANALYSIS_INSTRUCTIONS_LENGTH, SECTION_KEYS, buildAnalysisInstructions } from '../src/integrations/image-lens/prompt-analysis.js';

const redirectUri = 'https://extension-test.chromiumapp.org/boft';
const extensionUrl = 'chrome-extension://extension-test/';
let stored, calls, listener, launch, scenario;
const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  stored = {};
  calls = [];
  scenario = {};
  globalThis.chrome = {
    storage: { local: {
      get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in stored).map(key => [key, structuredClone(stored[key])])),
      set: async values => { Object.assign(stored, structuredClone(values)); },
      remove: async key => { delete stored[key]; }
    } },
    runtime: { id: 'extension-test', getURL: path => extensionUrl + path,
      onMessage: { addListener: fn => { listener = fn; } }, onInstalled: { addListener() {} } },
    identity: { getRedirectURL: () => redirectUri, launchWebAuthFlow: input => launch(input) },
    contextMenus: { onClicked: { addListener() {} }, removeAll: async () => {}, create() {} },
    commands: { onCommand: { addListener() {} } }, i18n: { getUILanguage: () => 'zh-CN' }
  };
  launch = async ({ url }) => {
    const authorize = new URL(url);
    assert.equal(authorize.origin, BOFT_ISSUER);
    assert.equal(authorize.searchParams.get('scope'), 'identity:read auto_keys:issue');
    assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
    scenario.challenge = authorize.searchParams.get('code_challenge');
    return redirectUri + '?code=valid-code&state=' + authorize.searchParams.get('state');
  };
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    calls.push({ url, init });
    if (url.endsWith('/.well-known/oauth-authorization-server')) return json({ issuer: BOFT_ISSUER,
      authorization_endpoint: `${BOFT_ISSUER}/oauth/authorize`, token_endpoint: `${BOFT_ISSUER}/api/v1/ee/agent/oauth/token`,
      registration_endpoint: `${BOFT_ISSUER}/api/v1/ee/agent/oauth/register`, code_challenge_methods_supported: ['S256'], ...scenario.metadata });
    if (url.endsWith('/oauth/register')) {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.redirect_uris, [redirectUri]);
      assert.equal(body.token_endpoint_auth_method, 'none');
      assert.equal(body.client_name, 'OpenSeek Extensions');
      return json({ client_id: 'registered-client' });
    }
    if (url.endsWith('/oauth/token')) {
      const body = new URLSearchParams(init.body);
      assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), scenario.challenge);
      assert.equal(body.get('redirect_uri'), redirectUri);
      assert.equal(body.get('resource'), `${BOFT_ISSUER}/mcp`);
      return json({ access_token: 'oauth-secret' });
    }
    if (url.endsWith('/userinfo')) return json({ data: { sub: 'account-1', email: 'test@example.com' } });
    if (url.endsWith('/auto-keys/issue')) {
      assert.equal(init.headers.authorization, 'Bearer oauth-secret');
      assert.equal(JSON.parse(init.body).name, 'OpenSeek Extensions');
      return json({ data: scenario.issue?.(JSON.parse(init.body)) ?? { id: 42, key: 'auto-secret', created: true } });
    }
    if (url.endsWith('/oauth/revoke')) return json({});
    if (url.endsWith('/models')) return json({ data: [{ id: 'gemini-3.8-flash' }, { id: 'gpt-image-2' }, { id: 'gpt-image-2' }] });
    if (url.endsWith('/chat/completions')) return json({ choices: [{ message: { content: JSON.stringify({ title: 'A blue arch', prompt: 'A blue geometric arch' }) } }] });
    if (url.includes(':generateContent')) return json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } }] } }] });
    if (url.endsWith('/images/generations')) return json({ data: scenario.imageUrl ? [{ url: scenario.imageUrl }] : [{ b64_json: 'aW1hZ2U=' }] });
    if (url === 'https://api-direct.boft.ai/files/generated.png' || url === 'https://cdn.example/generated.png') return new Response('image', { headers: { 'content-type': 'image/png' } });
    throw new Error('Unexpected endpoint: ' + url);
  };
});

const send = (type, payload, page = 'image-lens/options.html') => new Promise(resolve => {
  listener({ type, payload }, { id: 'extension-test', url: extensionUrl + page }, resolve);
});

test('OAuth uses PKCE, validates account, stores AUTO Key locally and revokes temporary token', async () => {
  assert.deepEqual(await connectBoft(), { connected: true, email: 'test@example.com' });
  assert.equal(stored.boftAccount.apiKey, 'auto-secret');
  assert.equal(stored.boftOAuthClient.clientId, 'registered-client');
  assert.equal(JSON.stringify(await getBoftStatus()).includes('secret'), false);
  assert.equal(JSON.stringify(stored).includes('oauth-secret'), false);
  assert.equal(calls.at(-1).url.endsWith('/oauth/revoke'), true);
});

test('OAuth rejects forged state and redirect path before token exchange', async () => {
  for (const callback of [redirectUri + '?code=x&state=wrong', 'https://attacker.example/boft?code=x&state=wrong']) {
    launch = async () => callback;
    await assert.rejects(connectBoft(), /校验失败/);
    assert.equal(calls.some(call => call.url.endsWith('/oauth/token')), false);
    assert.equal(stored.boftAccount, undefined);
  }
});

test('OAuth rejects discovery endpoints on other origins', async () => {
  scenario.metadata = { token_endpoint: 'https://attacker.example/token' };
  await assert.rejects(connectBoft(), /不受信任/);
  assert.equal(calls.length, 1);
});

test('cancelled authorization keeps the previous account intact', async () => {
  stored.boftAccount = { apiKey: 'old-secret', email: 'old@example.com', sub: 'old' };
  launch = async () => { throw new Error('user closed window'); };
  await assert.rejects(connectBoft(), /未完成/);
  assert.equal(stored.boftAccount.apiKey, 'old-secret');
});

test('re-login reuses cached client and its matching AUTO Key without rotation', async () => {
  await connectBoft();
  calls = [];
  scenario.issue = () => ({ id: 42, created: false });
  await connectBoft();
  assert.equal(calls.some(call => call.url.endsWith('/register')), false);
  assert.equal(calls.filter(call => call.url.endsWith('/issue')).length, 1);
  assert.equal(stored.boftAccount.apiKey, 'auto-secret');
});

test('lost local key is recovered only through this OAuth client binding', async () => {
  scenario.issue = body => body.rotate ? { id: 43, key: 'recovered-secret', created: true } : { id: 42, created: false };
  await connectBoft();
  assert.equal(stored.boftAccount.apiKey, 'recovered-secret');
  assert.equal(calls.filter(call => call.url.endsWith('/issue')).length, 2);
});

test('failed key issue revokes token and preserves the previous account', async () => {
  stored.boftAccount = { apiKey: 'old-secret' };
  scenario.issue = () => ({ id: 42, created: true });
  await assert.rejects(connectBoft(), /AUTO Key/);
  assert.equal(stored.boftAccount.apiKey, 'old-secret');
  assert.equal(calls.at(-1).url.endsWith('/revoke'), true);
});

test('disconnect clears local OAuth credential and keeps manual configuration', async () => {
  await connectBoft();
  stored.boftApiKey = 'manual-secret';
  await disconnectBoft();
  assert.equal(stored.boftAccount, undefined);
  assert.equal(stored.boftApiKey, 'manual-secret');
  assert.deepEqual(await getBoftStatus(), { connected: false });
});

test('BOFT credentials use a fixed origin and only affect the requested operation', async () => {
  await connectBoft();
  const settings = { promptProvider: 'boft', imageProvider: 'gemini', promptBaseUrl: 'https://attacker.example', imageApiKey: 'gemini-secret' };
  const resolved = await resolveBoftSettings(settings, 'prompt');
  assert.equal(resolved.promptBaseUrl, BOFT_BASE_URL);
  assert.equal(resolved.promptApiKey, 'auto-secret');
  assert.equal(resolved.imageApiKey, 'gemini-secret');
  await disconnectBoft();
  assert.equal(await resolveBoftSettings(settings, 'image'), settings);
  await assert.rejects(resolveBoftSettings(settings, 'prompt'), /请先/);
  assert.equal((await resolveBoftSettings({ ...settings, boftApiKey: 'manual-secret' }, 'prompt')).promptApiKey, 'manual-secret');
});

test('model discovery uses shared credential and returns unique IDs', async () => {
  assert.deepEqual(await listBoftModels({ boftApiKey: 'manual-secret' }), ['gemini-3.8-flash', 'gpt-image-2']);
  assert.equal(calls[0].init.headers.authorization, 'Bearer manual-secret');
});

test('settings changes preserve existing profiles; content scripts cannot access keys or mutate auth', async () => {
  registerImageLensBackground();
  await send('save-settings', { promptProvider: 'openai-compatible', promptApiKey: 'prior-secret', promptModel: 'custom-vision' });
  const connected = await send('boft-connect');
  assert.equal(connected.ok, true);
  assert.equal(connected.data.promptProvider, 'boft');
  assert.equal(connected.data.imageProvider, 'boft');
  assert.equal(connected.data.promptProviderProfiles['openai-compatible'].apiKey, 'prior-secret');
  assert.equal(connected.data.promptProviderProfiles['openai-compatible'].model, 'custom-vision');
  assert.equal(connected.data.promptModel, 'gemini-3.8-flash');
  assert.equal(connected.data.promptBaseUrl, BOFT_BASE_URL);
  assert.equal(connected.data.imageBaseUrl, BOFT_BASE_URL);
  const page = await send('get-settings', undefined, 'content-script');
  assert.equal(JSON.stringify(page).includes('secret'), false);
  assert.equal(page.data.boftAccount, undefined);
  assert.equal((await send('boft-disconnect', undefined, 'content-script')).ok, false);
  assert.equal((await send('save-settings', {}, 'image-lens/options.html.evil')).ok, false);
});

test('BOFT image model routing uses native Gemini and OpenAI image APIs with shared auth', async () => {
  // A minimal IndexedDB adapter lets generation reach its existing viewer store.
  globalThis.indexedDB = { open() {
    const tx = { objectStore: () => ({ put() { const req = {}; queueMicrotask(() => req.onsuccess()); return req; } }) };
    const req = { result: { transaction: () => tx, close() {} } };
    queueMicrotask(() => req.onsuccess());
    return req;
  } };
  registerImageLensBackground();
  await send('save-settings', { promptProvider: 'boft', imageProvider: 'boft', boftApiKey: 'manual-secret', imageGenerationEnabled: true });
  let result = await send('generate-image', { prompt: 'A blue geometric arch', count: 1 });
  assert.equal(result.ok, true, result.error);
  let generated = calls.find(call => call.url.includes(':generateContent'));
  assert.equal(generated.url, 'https://api-direct.boft.ai/v1beta/models/gemini-nano-banana-2.1:generateContent');
  assert.equal(generated.init.headers.Authorization, 'Bearer manual-secret');
  await send('save-settings', { imageModel: 'gpt-image-2' });
  result = await send('generate-image', { prompt: 'A blue geometric arch', count: 1 });
  assert.equal(result.ok, true, result.error);
  generated = calls.find(call => call.url.endsWith('/images/generations'));
  assert.equal(generated.url, BOFT_BASE_URL + '/images/generations');
  assert.equal(generated.init.headers.Authorization, 'Bearer manual-secret');
  assert.equal(JSON.parse(generated.init.body).n, 1);
  for (const imageUrl of ['https://api-direct.boft.ai/files/generated.png', 'https://cdn.example/generated.png']) {
    scenario.imageUrl = imageUrl;
    const downloaded = await send('generate-image', { prompt: 'A blue geometric arch' });
    assert.equal(downloaded.ok, true, downloaded.error);
    const download = calls.findLast(call => call.url === imageUrl);
    assert.equal(download.init.headers?.Authorization, imageUrl.includes('api-direct.boft.ai') ? 'Bearer manual-secret' : undefined);
  }
});


test('BOFT profiles normalize stale inherited endpoints without changing other providers', async () => {
  stored.promptProvider = 'boft';
  stored.imageProvider = 'boft';
  stored.promptProviderProfiles = { boft: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'custom-vision' }, 'openai-compatible': { baseUrl: 'https://gateway.example/v1', apiKey: 'old-secret', model: 'old-model' } };
  stored.imageProviderProfiles = { boft: { baseUrl: 'https://other.example/v1' } };
  registerImageLensBackground();
  const result = await send('get-settings');
  assert.equal(result.data.promptBaseUrl, BOFT_BASE_URL);
  assert.equal(result.data.imageBaseUrl, BOFT_BASE_URL);
  assert.equal(result.data.promptModel, 'custom-vision');
  assert.equal(result.data.promptProviderProfiles['openai-compatible'].baseUrl, 'https://gateway.example/v1');
});


test('legacy OAuth application name is replaced on the next sign-in', async () => {
  stored.boftOAuthClient = { clientId: 'legacy-client', redirectUri };
  stored.boftAccount = { apiKey: 'legacy-secret', email: 'old@example.com', sub: 'old' };
  await connectBoft();
  assert.equal(calls.filter(call => call.url.endsWith('/oauth/register')).length, 1);
  assert.equal(stored.boftOAuthClient.clientName, 'OpenSeek Extensions');
  assert.equal(stored.boftOAuthClient.clientId, 'registered-client');
});

test('connection mode preserves legacy profiles and explicit independent choice', async () => {
  registerImageLensBackground();
  const initial = await send('save-settings', {
    promptProvider: 'openai-compatible', imageProvider: 'openai-compatible',
    promptApiKey: 'analysis-test-key', imageApiKey: 'generation-test-key',
    promptBaseUrl: 'https://analysis.example/v1', imageBaseUrl: 'https://generation.example/v1'
  });
  assert.equal(initial.data.imageConnectionMode, 'auto');
  for (const mode of ['separate', 'shared', 'auto']) {
    const result = await send('save-settings', { imageConnectionMode: mode });
    assert.equal(result.data.imageConnectionMode, mode);
    assert.equal(result.data.promptApiKey, 'analysis-test-key');
    assert.equal(result.data.imageApiKey, 'generation-test-key');
    assert.equal(result.data.imageBaseUrl, 'https://generation.example/v1');
  }
  await send('save-settings', { imageConnectionMode: 'separate' });
  const invalid = await send('save-settings', { imageConnectionMode: 'unknown' });
  assert.equal(invalid.data.imageConnectionMode, 'separate');
  const login = await send('boft-connect');
  assert.equal(login.data.imageConnectionMode, 'shared');
  assert.equal(login.data.promptProviderProfiles['openai-compatible'].apiKey, 'analysis-test-key');
  assert.equal(login.data.imageProviderProfiles['openai-compatible'].apiKey, 'generation-test-key');
});

test('editable analysis instructions keep the output contract and language preference', () => {
  for (const customInstructions of ['', '  ', '只描述商品材质与拍摄布光，使用简洁的电商摄影描述。']) {
    for (const includeChinese of [true, false]) {
      const instructions = buildAnalysisInstructions({ customInstructions, includeChinese });
      assert.equal(instructions.startsWith(customInstructions.trim() || DEFAULT_ANALYSIS_INSTRUCTIONS), true);
      const shape = JSON.parse(instructions.split('\n').at(-1));
      assert.deepEqual(Object.keys(shape.sections), SECTION_KEYS);
      assert.deepEqual(Object.keys(shape.prompt), includeChinese ? ['en', 'zh'] : ['en']);
      assert.deepEqual(Object.keys(shape.prompt.en), ['full', 'short']);
      assert.equal(instructions.includes('Reply with JSON only'), true);
    }
  }
});

test('custom analysis configuration persists, resets, validates length, and stays options-only', async () => {
  registerImageLensBackground();
  const initial = await send('get-settings');
  assert.equal(initial.data.analysisInstructions, '');
  assert.equal(initial.data.defaultAnalysisInstructions, DEFAULT_ANALYSIS_INSTRUCTIONS);
  assert.equal(initial.data.analysisInstructionsMaxLength, MAX_ANALYSIS_INSTRUCTIONS_LENGTH);
  assert.ok(DEFAULT_ANALYSIS_INSTRUCTIONS.length < MAX_ANALYSIS_INSTRUCTIONS_LENGTH);
  const saved = await send('save-settings', { analysisInstructions: '  Focus on fabric and lighting.\nKeep the style minimal.  ' });
  assert.equal(saved.data.analysisInstructions, 'Focus on fabric and lighting.\nKeep the style minimal.');
  await send('save-settings', { uiLanguage: 'en', promptProvider: 'gemini' });
  assert.equal(stored.analysisInstructions, saved.data.analysisInstructions);
  const tooLong = await send('save-settings', { analysisInstructions: 'x'.repeat(MAX_ANALYSIS_INSTRUCTIONS_LENGTH + 1) });
  assert.equal(tooLong.ok, false);
  assert.equal(stored.analysisInstructions, saved.data.analysisInstructions);
  const page = await send('get-settings', undefined, 'content-script');
  assert.equal(page.data.analysisInstructions, undefined);
  assert.equal(page.data.defaultAnalysisInstructions, undefined);
  assert.equal((await send('save-settings', { analysisInstructions: 'overwrite' }, 'content-script')).ok, false);
  const reset = await send('save-settings', { analysisInstructions: '' });
  assert.equal(reset.data.analysisInstructions, '');
});

test('all analysis providers receive the custom instructions and retain the JSON result', async () => {
  registerImageLensBackground();
  const originalFetch = globalThis.fetch;
  const originalBitmap = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
  const result = { prompt: { en: { full: 'A blue geometric arch', short: 'Blue arch' } }, title: { en: 'Blue arch' } };
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).endsWith('/chat/completions') || String(url).includes(':generateContent')) {
      calls.push({ url: String(url), init });
      return String(url).endsWith('/chat/completions')
        ? json({ choices: [{ message: { content: JSON.stringify(result) } }] })
        : json({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] });
    }
    return originalFetch(url, init);
  };
  try {
    for (const provider of ['gemini', 'openai-compatible', 'boft']) {
      await send('save-settings', { promptProvider: provider, promptApiKey: 'test-key', boftApiKey: 'test-key', enableChineseRecognition: false, analysisInstructions: 'Focus on product materials. CUSTOM_ANALYSIS_MARKER' });
      const response = await send('analyze-image', { imageDataUrl: 'data:image/png;base64,aW1hZ2U=' });
      assert.equal(response.ok, true, response.error);
      assert.equal(response.data.prompts.full.en, 'A blue geometric arch');
      const body = JSON.parse(calls.at(-1).init.body);
      const instructions = provider === 'gemini' ? body.systemInstruction.parts[0].text : body.messages[0].content;
      assert.equal(instructions.includes('CUSTOM_ANALYSIS_MARKER'), true);
      assert.equal(instructions.includes('Reply with JSON only'), true);
      assert.equal(instructions.includes('Return English only'), true);
    }
    await send('save-settings', { analysisInstructions: '' });
    await send('analyze-image', { imageDataUrl: 'data:image/png;base64,aW1hZ2U=' });
    const restored = JSON.parse(calls.at(-1).init.body).messages[0].content;
    assert.equal(restored.startsWith(DEFAULT_ANALYSIS_INSTRUCTIONS), true);
    assert.equal(restored.includes('CUSTOM_ANALYSIS_MARKER'), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBitmap === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap = originalBitmap;
  }
});

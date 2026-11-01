// BOFT OAuth is handled in the extension worker; webpage scripts never receive
// the OAuth token or the account's AUTO Key.
export const BOFT_ISSUER = 'https://supply.boft.ai';
export const BOFT_BASE_URL = 'https://api-direct.boft.ai/v1';
export const BOFT_PROMPT_MODEL = 'gemini-3.8-flash';
export const BOFT_IMAGE_MODEL = 'gemini-nano-banana-2.1';
const BOFT_CLIENT_NAME = 'OpenSeek Extensions';
let connecting = false;

async function request(path, init = {}) {
  const response = await fetch(new URL(path, BOFT_ISSUER), {
    ...init, redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { accept: 'application/json', ...init.headers }
  });
  // Never propagate provider response bodies, which can contain credentials.
  if (!response.ok) throw new Error(`BOFT.AI 请求失败（HTTP ${response.status}），请重试。`);
  const body = await response.json();
  return body.data ?? body;
}

function endpoint(value) {
  const url = new URL(value);
  if (url.origin !== BOFT_ISSUER || url.username || url.password || url.hash) {
    throw new Error('BOFT.AI 返回了不受信任的授权地址。');
  }
  return url.href;
}

function randomString(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return encode(bytes);
}

function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function getBoftAccount() {
  const { boftAccount } = await chrome.storage.local.get('boftAccount');
  return boftAccount?.apiKey ? boftAccount : null;
}

export async function getBoftStatus() {
  const account = await getBoftAccount();
  return account ? { connected: true, email: account.email } : { connected: false };
}

export async function disconnectBoft() {
  await chrome.storage.local.remove('boftAccount');
  // Other BOFT apps and manually configured keys are unaffected.
  return { connected: false };
}

export async function connectBoft() {
  if (connecting) throw new Error('BOFT.AI 授权正在进行，请完成或关闭授权窗口。');
  connecting = true;
  let accessToken = '';
  try {
    const metadata = await request('/.well-known/oauth-authorization-server');
    if (metadata.issuer !== BOFT_ISSUER || !metadata.code_challenge_methods_supported?.includes('S256')) {
      throw new Error('BOFT.AI 暂不支持所需的安全授权方式。');
    }
    const authorizationEndpoint = endpoint(metadata.authorization_endpoint);
    const tokenEndpoint = endpoint(metadata.token_endpoint);
    const registrationEndpoint = endpoint(metadata.registration_endpoint);
    const redirectUri = chrome.identity.getRedirectURL('boft');
    let { boftOAuthClient: client } = await chrome.storage.local.get('boftOAuthClient');
    if (!client?.clientId || client.redirectUri !== redirectUri || client.clientName !== BOFT_CLIENT_NAME) {
      const registered = await request(registrationEndpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_name: BOFT_CLIENT_NAME, redirect_uris: [redirectUri],
          grant_types: ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'none' })
      });
      if (typeof registered.client_id !== 'string' || !registered.client_id) throw new Error('BOFT.AI 客户端注册失败。');
      client = { clientId: registered.client_id, redirectUri, clientName: BOFT_CLIENT_NAME };
      await chrome.storage.local.set({ boftOAuthClient: client });
    }
    const state = randomString(32);
    const verifier = randomString(64);
    const challenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const authorize = new URL(authorizationEndpoint);
    authorize.search = new URLSearchParams({ response_type: 'code', client_id: client.clientId,
      redirect_uri: redirectUri, scope: 'identity:read auto_keys:issue', state,
      code_challenge: challenge, code_challenge_method: 'S256', resource: `${BOFT_ISSUER}/mcp` }).toString();
    let redirected;
    try {
      redirected = await chrome.identity.launchWebAuthFlow({ url: authorize.href, interactive: true });
    } catch {
      throw new Error('BOFT.AI 授权未完成。你可以重新登录，或填写 API Key。');
    }
    if (!redirected) throw new Error('BOFT.AI 未返回授权结果。');
    const callback = new URL(redirected);
    const expected = new URL(redirectUri);
    if (callback.origin !== expected.origin || callback.pathname !== expected.pathname || callback.hash || callback.searchParams.get('state') !== state) {
      throw new Error('BOFT.AI 授权校验失败，请重新登录。');
    }
    if (callback.searchParams.has('error')) throw new Error('BOFT.AI 授权已取消。');
    const code = callback.searchParams.get('code');
    if (!code) throw new Error('BOFT.AI 未返回授权码。');
    const token = await request(tokenEndpoint, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: client.clientId,
        code, redirect_uri: redirectUri, code_verifier: verifier, resource: `${BOFT_ISSUER}/mcp` }).toString()
    });
    if (typeof token.access_token !== 'string' || !token.access_token) throw new Error('BOFT.AI 未返回有效授权。');
    accessToken = token.access_token;
    const headers = { authorization: `Bearer ${accessToken}`, 'x-boft-agent-client': 'app' };
    const identity = await request('/api/v1/ee/agent/userinfo', { headers });
    if (typeof identity.sub !== 'string' || !identity.sub.trim() || typeof identity.email !== 'string' || !identity.email.trim()) {
      throw new Error('无法验证 BOFT.AI 账号身份。');
    }
    const previous = await getBoftAccount();
    const issue = (rotate) => request('/api/v1/ee/agent/auto-keys/issue', {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ name: BOFT_CLIENT_NAME, scope: 'user', models: [], strategy: 'balanced',
        include_byok: false, fallback_enabled: true, ...(rotate ? { rotate: true } : {}) })
    });
    let issued = await issue(false);
    let apiKey = issued.key;
    if (!apiKey && issued.created === false && previous?.sub === identity.sub && previous.clientId === client.clientId && previous.keyId === issued.id) {
      apiKey = previous.apiKey;
    }
    if (!apiKey && issued.created === false) {
      // BOFT binds this key to this OAuth client. Recover only this extension's
      // key, matching the desktop integration's lost-local-key flow.
      issued = await issue(true);
      apiKey = issued.key;
    }
    if (typeof apiKey !== 'string' || !apiKey || typeof issued.id !== 'number') throw new Error('BOFT.AI 未返回可用的 AUTO Key。');
    await chrome.storage.local.set({ boftAccount: { apiKey, keyId: issued.id,
      clientId: client.clientId, sub: identity.sub, email: identity.email.trim() } });
    return getBoftStatus();
  } finally {
    if (accessToken) {
      await request('/api/v1/ee/agent/oauth/revoke', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: accessToken }).toString()
      }).catch(() => {});
    }
    connecting = false;
  }
}

export async function resolveBoftSettings(settings, purpose) {
  if (settings[`${purpose}Provider`] !== 'boft') return settings;
  const account = await getBoftAccount();
  const apiKey = account?.apiKey || settings.boftApiKey;
  if (!apiKey) throw new Error('请先在设置中登录 BOFT.AI，或填写 BOFT.AI API Key。');
  return { ...settings,
    ...(settings.promptProvider === 'boft' ? { promptApiKey: apiKey, promptBaseUrl: BOFT_BASE_URL } : {}),
    ...(settings.imageProvider === 'boft' ? { imageApiKey: apiKey, imageBaseUrl: BOFT_BASE_URL } : {})
  };
}

export async function listBoftModels(settings) {
  const account = await getBoftAccount();
  const apiKey = account?.apiKey || settings.boftApiKey;
  if (!apiKey) throw new Error('请先登录 BOFT.AI 或填写 API Key，再读取模型。');
  const response = await fetch(`${BOFT_BASE_URL}/models`, {
    headers: { authorization: `Bearer ${apiKey}` }, redirect: 'error', signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`BOFT.AI 模型读取失败（HTTP ${response.status}）。`);
  const data = await response.json();
  return [...new Set((data.data || []).map(model => model.id).filter(id => typeof id === 'string'))].sort();
}

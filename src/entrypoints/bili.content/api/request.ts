import { md5 } from 'js-md5';

const API_BASE = 'https://api.bilibili.com';
const MIXIN_KEY_INDEX = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52];
type Envelope<T> = { code: number; message?: string; data?: T };
let keyRequest: Promise<string> | undefined;
let keyExpires = 0;

export async function resolveShortUrl(value: string) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'b23.tv' || url.username || url.password) throw new Error('无效的B站短链接');
    const response = await fetch(url.href, { credentials: 'omit', signal: AbortSignal.timeout(15000) });
    const resolved = new URL(response.url);
    if (!response.ok || !['www.bilibili.com', 'm.bilibili.com', 'bilibili.com'].includes(resolved.hostname) || resolved.protocol !== 'https:') throw new Error('无法解析B站短链接，请使用浏览器中展开后的完整视频地址');
    return resolved.href;
}

async function fetchJson<T>(path: string, params: Record<string, string | number>): Promise<Envelope<T>> {
    const url = new URL(path, API_BASE);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    const result = await sendMessage('fetch', { url: url.href, method: 'GET', credentials: 'include' });
    if (!result || typeof result.code !== 'number') throw new Error('B站请求失败，请刷新B站页面后重试');
    return result;
}

async function getMixinKey() {
    if (!keyRequest || Date.now() >= keyExpires) {
        keyExpires = Date.now() + 10 * 60 * 1000;
        keyRequest = fetchJson<{ wbi_img?: { img_url: string; sub_url: string } }>('/x/web-interface/nav', {}).then(result => {
            // Anonymous nav responses use -101 but still provide the public WBI key.
            const image = result.data?.wbi_img;
            if (!image) throw new Error('无法获取B站接口签名，请在B站登录后重试');
            const extract = (url: string) => new URL(url).pathname.split('/').pop()!.split('.')[0];
            const key = extract(image.img_url) + extract(image.sub_url);
            if (key.length !== 64) throw new Error('B站接口签名无效，请刷新页面后重试');
            return MIXIN_KEY_INDEX.map(index => key[index]).join('').slice(0, 32);
        }).catch(error => { keyRequest = undefined; throw error; });
    }
    return keyRequest;
}

export async function request<T>(path: string, params: Record<string, string | number> = {}, signed = false): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
        let query = { ...params };
        if (signed) {
            const key = await getMixinKey();
            query.wts = Math.floor(Date.now() / 1000);
            const encoded = Object.keys(query).sort().map(name => {
                query[name] = String(query[name]).replace(/[!'()*]/g, '');
                return `${encodeURIComponent(name)}=${encodeURIComponent(query[name])}`;
            }).join('&');
            query.w_rid = md5(encoded + key);
        }
        const result = await fetchJson<T>(path, query);
        if (result.code === 0 && result.data != null) return result.data;
        if (signed && result.code === -403 && attempt === 0) { keyRequest = undefined; continue; }
        if ([-101, -111].includes(result.code)) throw new Error('请先登录B站，再重新开始采集');
        if ([-352, -412, -509].includes(result.code)) throw new Error('B站暂时限制了请求，请在网页完成验证，稍后增加请求间隔后重试');
        throw new Error(`B站接口错误 (${result.code})：${result.message || '未返回数据'}`);
    }
    throw new Error('B站接口签名已过期，请刷新页面重试');
}

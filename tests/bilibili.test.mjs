import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'src/entrypoints/bili.content');
const bv = n => 'BV1xx411c7m' + String.fromCharCode(68 + n);
const video = n => ({ aid: n + 2, bvid: bv(n), title: `视频${n}`, desc: '材质与布光', pic: '//i0.hdslb.com/test.jpg', pubdate: 1700000000, duration: 90, owner: { mid: 2, name: '测试UP主', face: '' }, cid: n+100, pages: [{ cid: n+100, page: 1, part: '第一P' }], stat: { view: 100, danmaku: 4, like: 5, coin: 6, favorite: 7, share: 8, reply: 9 } });
const reply = (id, extra = {}) => ({ rpid: id, rpid_str: String(id), root: 0, parent: 0, ctime: 1700000000, like: 2, rcount: 0, member: { mid: '7', uname: '测试用户' }, content: { message: '评论', pictures: [{ img_src: '//i0.hdslb.com/comment.png' }] }, ...extra });

// Run the real TypeScript API and processors with the existing auto-imports
// injected, replacing only network, delays and the Excel file sink.
function environment(handler = () => { throw new Error('Unexpected request'); }) {
    const cache = new Map();
    const calls = [];
    const send = async (type, data) => {
        if (type === 'resolveBilibiliUrl') return 'https://www.bilibili.com/video/' + bv(0);
        assert.equal(type, 'fetch');
        assert.equal(data.credentials, 'include');
        const url = new URL(data.url);
        calls.push(url);
        return handler(url, calls);
    };
    const load = file => {
        file = path.resolve(file);
        if (cache.has(file)) return cache.get(file).exports;
        const module = { exports: {} }; cache.set(file, module);
        const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
        const localRequire = name => {
            if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
            const target = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(file), name);
            return load([target, target + '.ts', path.join(target, 'index.ts')].find(candidate => existsSync(candidate) && candidate.endsWith('.ts')));
        };
        new Function('require', 'exports', 'module', 'sendMessage', 'sleep', 'generateExcelDownloadOption', 'getSafeFilename', code)(localRequire, module.exports, module, send, async () => {}, (rows, name) => ({ rows, name }), value => value.replace(/[^\w\u4e00-\u9fff]/g, '').slice(0,20));
        return module.exports;
    };
    return { load: relative => load(path.join(base, relative)), calls };
}

const collect = async iterable => { const items = []; for await (const item of iterable) items.push(item); return items; };

const ok = data => ({ code: 0, data });
const nav = { code: -101, data: { wbi_img: { img_url: 'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png', sub_url: 'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png' } } };

test('B站链接规范化：BV、av、空间子页、短链接；拒绝外站和错误类型', async () => {
    const { parseVideoUrl, parseAuthorUrl } = environment().load('utils/parse-url.ts');
    assert.deepEqual(await parseVideoUrl(new URL('https://www.bilibili.com/video/'+bv(0)+'/?p=2')), { id: bv(0), href: 'https://www.bilibili.com/video/'+bv(0) });
    assert.equal((await parseVideoUrl(new URL('https://m.bilibili.com/video/av170001'))).id, 'av170001');
    assert.equal((await parseVideoUrl(new URL('https://b23.tv/test'))).id, bv(0));
    assert.equal((await parseAuthorUrl(new URL('https://space.bilibili.com/2/upload/video'))).id, '2');
    for (const url of ['https://evil.example/video/'+bv(0), 'https://space.bilibili.com/2', 'https://www.bilibili.com/video/BVshort', 'https://www.bilibili.com.evil/video/'+bv(0)]) await assert.rejects(parseVideoUrl(new URL(url)));
    await assert.rejects(parseAuthorUrl(new URL('https://www.bilibili.com/video/'+bv(0))));
});

test('WBI签名包含规范化参数；匿名nav可用且签名失效只刷新一次', async () => {
    let searches = 0;
    const env = environment(url => {
        if (url.pathname.endsWith('/nav')) return nav;
        searches++;
        if (searches === 1) return { code: -403, message: 'signature expired' };
        assert.match(url.searchParams.get('w_rid'), /^[a-f0-9]{32}$/);
        assert.match(url.searchParams.get('wts'), /^\d+$/);
        assert.equal(url.searchParams.get('keyword'), 'ab中');
        return ok({ list: { vlist: [] }, page: { count: 0 } });
    });
    await env.load('api/request.ts').request('/x/space/wbi/arc/search', { mid: '2', keyword: "a!b*中" }, true);
    assert.equal(searches, 2);
    assert.equal(env.calls.filter(url => url.pathname.endsWith('/nav')).length, 2);
});

test('平台错误中止采集；风控不会被误当作空结果', async () => {
    for (const code of [-101, -352, -412, -509, -400]) {
        const env = environment(() => ({ code, message: 'test failure' }));
        await assert.rejects(env.load('api/index.ts').videoDetail(bv(0)), /登录|限制|接口错误/);
    }
});

test('UP主和指定视频数据可导出，下载素材仅包括已选头像或封面', async () => {
    const env = environment(url => url.pathname.endsWith('/card') ? ok({ card: { mid: '2', name: 'UP主', sex: '男', sign: '简介', fans: 10, attention: 2, face: '//i0.hdslb.com/face.jpg' }, archive_count: 3 }) : ok(video(0)));
    const Author = env.load('tasks/author/processor.ts').Processor;
    const author = new Author({ urls: [{ id: '2', href: 'https://space.bilibili.com/2' }], requestInterval: 0 });
    await author.execute();
    assert.equal(author.getDataDownloadOption().rows[1][2], 'UP主');
    assert.equal(author.getMediaDownloadOptions([]).length, 0);
    assert.match(author.getMediaDownloadOptions(['image'])[0].url, /^https:/);
    const Post = env.load('tasks/post/processor.ts').Processor;
    const post = new Post({ urls: [{ id: bv(0), href: 'https://www.bilibili.com/video/'+bv(0) }], requestInterval: 0 });
    await post.execute();
    const rows = post.getDataDownloadOption().rows;
    assert.equal(rows[0].length, rows[1].length);
    assert.equal(rows[1][12], 6); // coins are not confused with likes or favorites
    assert.equal((await collect(post.getMediaDownloadOptions(['image']))).length, 1);
});

test('UP主投稿分页去重，严格按数量截断；重试复用已缓存请求', async () => {
    const env = environment(url => {
        if (url.pathname.endsWith('/nav')) return nav;
        if (url.pathname.endsWith('/search')) {
            const pn = Number(url.searchParams.get('pn'));
            return ok({ list: { vlist: (pn === 1 ? [0, 1] : [1, 2, 3]).map(n => ({ bvid: bv(n), aid: n+2 })) }, page: { pn, ps: 2, count: 5 } });
        }
        const index = [0,1,2,3].find(n => bv(n) === url.searchParams.get('bvid'));
        return ok(video(index));
    });
    const Processor = env.load('tasks/author-post/processor.ts').Processor;
    const processor = new Processor({ urls: [{ id: '2', href: 'https://space.bilibili.com/2' }], limitPerId: 3, requestInterval: 0 });
    await processor.execute();
    assert.deepEqual(processor.getVideos().map(item => item.bvid), [0,1,2].map(bv));
    assert.equal(processor.getDataDownloadOption().rows.length, 4);
    const calls = env.calls.length;
    await processor.execute();
    assert.equal(env.calls.length, calls);
});

test('评论分页与楼中楼合并去重，保留长ID字符串且数量精确', async () => {
    const env = environment(url => {
        if (url.pathname.endsWith('/nav')) return nav;
        if (url.pathname.endsWith('/view')) return ok(video(0));
        if (url.pathname.endsWith('/main')) {
            const next = Number(url.searchParams.get('next'));
            return ok({ replies: next ? [reply(3)] : [reply(1, { rcount: 3, replies: [reply(2, { root: 1, parent: 1 })] })], top_replies: [], cursor: { next: next+1, is_end: next > 0, pagination_reply: { next_offset: String(next+1) } } });
        }
        return ok({ replies: [reply(2, { root: 1 }), reply(4, { root: 1, rpid_str: '12345678901234567890' }), reply(5, { root: 1 })], page: { count: 3, size: 20, num: 1 } });
    });
    const Processor = env.load('tasks/post-comment/processor.ts').Processor;
    const processor = new Processor({ urls: [{ id: bv(0), href: 'https://www.bilibili.com/video/'+bv(0) }], limitPerId: 5, includeReplies: true, requestInterval: 0 });
    await processor.execute();
    assert.equal(processor.getComments().length, 5);
    assert.equal(processor.getDataDownloadOption().rows[3][0], '12345678901234567890');
    assert.equal(processor.getMediaDownloadOptions([]).length, 0);
    assert.equal(processor.getMediaDownloadOptions(['image']).length, 5);
    const withoutReplies = new Processor({ urls: [{ id: bv(0) }], limitPerId: 1, includeReplies: false, requestInterval: 0 });
    const before = env.calls.length;
    await withoutReplies.execute();
    assert.equal(withoutReplies.getComments().length, 1);
    assert.equal(env.calls.slice(before).some(url => url.pathname.endsWith('/reply/reply')), false);
});

test('重复游标中止且保留已采集评论供部分导出；取消不发出新请求', async () => {
    const env = environment(url => {
        if (url.pathname.endsWith('/nav')) return nav;
        if (url.pathname.endsWith('/view')) return ok(video(0));
        return ok({ replies: [reply(1)], cursor: { next: 0, is_end: false } });
    });
    const Processor = env.load('tasks/post-comment/processor.ts').Processor;
    const processor = new Processor({ urls: [{ id: bv(0) }], limitPerId: 5, includeReplies: false, requestInterval: 0 });
    await assert.rejects(processor.execute(), /游标重复/);
    assert.equal(processor.getDataDownloadOption().rows.length, 2);
    const stopped = new Processor({ urls: [{ id: bv(0) }], limitPerId: 5, requestInterval: 0 });
    stopped.signal = AbortSignal.abort();
    const before = env.calls.length;
    await assert.rejects(stopped.execute(), /任务终止/);
    assert.equal(env.calls.length, before);
});


test('BV与av别名只导出一条视频与一组评论，重试会重新请求坏页', async () => {
    let broken = true;
    let commentsCalls = 0;
    const env = environment(url => {
        if (url.pathname.endsWith('/nav')) return nav;
        if (url.pathname.endsWith('/view')) return ok(video(0));
        commentsCalls++;
        return ok({ replies: [reply(1)], cursor: { next: broken ? 0 : 1, is_end: !broken } });
    });
    const urls = [{ id: bv(0), href: 'https://www.bilibili.com/video/'+bv(0) }, { id: 'av2', href: 'https://www.bilibili.com/video/av2' }];
    const Post = env.load('tasks/post/processor.ts').Processor;
    const post = new Post({ urls, requestInterval: 0 });
    await post.execute();
    assert.equal(post.getDataDownloadOption().rows.length, 2);
    assert.equal((await collect(post.getMediaDownloadOptions(['image']))).length, 1);
    const Comments = env.load('tasks/post-comment/processor.ts').Processor;
    const comments = new Comments({ urls, limitPerId: 5, includeReplies: false, requestInterval: 0 });
    await assert.rejects(comments.execute(), /游标重复/);
    broken = false;
    await comments.execute();
    assert.equal(commentsCalls, 2);
    assert.equal(comments.getDataDownloadOption().rows.length, 2);
});

test('投稿重复页可在重试后恢复，之前的正常页保持缓存', async () => {
    let broken = true;
    const env = environment(url => {
        if (url.pathname.endsWith('/nav')) return nav;
        if (url.pathname.endsWith('/search')) {
            const pn = Number(url.searchParams.get('pn'));
            return ok({ list: { vlist: [{ bvid: bv(pn === 1 || broken ? 0 : 1) }] }, page: { pn, ps: 1, count: 2 } });
        }
        return ok(video(url.searchParams.get('bvid') === bv(0) ? 0 : 1));
    });
    const Processor = env.load('tasks/author-post/processor.ts').Processor;
    const processor = new Processor({ urls: [{ id: '2' }], limitPerId: 2, requestInterval: 0 });
    await assert.rejects(processor.execute(), /重复/);
    broken = false;
    await processor.execute();
    assert.equal(processor.getVideos().length, 2);
    assert.equal(env.calls.filter(url => url.pathname.endsWith('/search') && url.searchParams.get('pn') === '1').length, 1);
    assert.equal(env.calls.filter(url => url.pathname.endsWith('/search') && url.searchParams.get('pn') === '2').length, 2);
});

test('视频下载按分P即时解析含音频MP4，保留实际清晰度', async () => {
    const env = environment(url => {
        assert.equal(url.pathname, '/x/player/playurl');
        assert.equal(url.searchParams.get('fnval'), '0');
        assert.equal(url.searchParams.get('platform'), 'html5');
        return ok({ quality: 32, format: 'mp4', durl: [{ url: 'https://upos-test.bilivideo.com/'+url.searchParams.get('cid')+'.mp4?deadline=123', size: 99, order: 1 }] });
    });
    const detail = { ...video(0), pages: [{ cid: 1, page: 1, part: 'first' }, { cid: 2, page: 2, part: 'second' }] };
    const { videoDownloadOptions } = env.load('utils/media.ts');
    const part = await videoDownloadOptions(detail, 2, 0);
    assert.equal(part.length, 1);
    assert.match(part[0].filename, /P2-480P\.mp4$/);
    assert.equal((await videoDownloadOptions(detail, undefined, 0)).length, 2);
    await assert.rejects(videoDownloadOptions(detail, 3, 0), /分P/);
});

test('DASH-only、试看与异常下载域名不会导出误导性MP4文件', async () => {
    for (const playback of [
        { quality: 64, format: 'dash', dash: { video: [], audio: [] } },
        { quality: 64, format: 'mp4', is_preview: true, durl: [{ url: 'https://upos-test.bilivideo.com/test.mp4' }] },
        { quality: 64, format: 'mp4', durl: [{ url: 'https://evil.example/test.mp4' }] }
    ]) {
        const env = environment(() => ok(playback));
        await assert.rejects(env.load('utils/media.ts').videoDownloadOptions(video(0), 1, 0), /音视频分离|试看|下载地址/);
    }
});

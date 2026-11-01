export type ParsedUrl = { id: string; href: string };

export async function parseVideoUrl(source: URL): Promise<ParsedUrl> {
    const url = source.hostname === 'b23.tv' ? new URL(await sendMessage('resolveBilibiliUrl', { url: source.href })) : source;
    if (!['www.bilibili.com', 'm.bilibili.com', 'bilibili.com'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)) {
        throw new Error('请输入B站视频链接（支持BV号、av号视频页和b23.tv短链接）');
    }
    const id = url.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10}|av[1-9]\d*)\/?$/i)?.[1];
    if (!id) throw new Error('无效的B站视频链接，请使用 /video/BV… 或 /video/av… 视频页');
    const canonical = /^av/i.test(id) ? 'av' + id.slice(2) : 'BV' + id.slice(2);
    return { id: canonical, href: `https://www.bilibili.com/video/${canonical}` };
}

export async function parseAuthorUrl(url: URL): Promise<ParsedUrl> {
    const id = url.pathname.match(/^\/([1-9]\d*)(?:\/.*)?$/)?.[1];
    if (url.hostname !== 'space.bilibili.com' || !['http:', 'https:'].includes(url.protocol) || !id) {
        throw new Error('请输入B站UP主空间链接，例如 https://space.bilibili.com/2');
    }
    return { id, href: `https://space.bilibili.com/${id}` };
}

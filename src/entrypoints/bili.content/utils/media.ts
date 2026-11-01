import type { Author, Comment, Video } from '../api/types';
import { videoPlayback } from '../api';

export const videoHeaders = ['BV号', 'AV号', '视频链接', '标题', '简介', '分区', 'UP主UID', 'UP主昵称', 'UP主链接', '播放数', '弹幕数', '点赞数', '投币数', '收藏数', '分享数', '评论数', '发布时间', '时长（秒）', '封面链接'];

export function videoRow(video: Video) {
    return [video.bvid, `av${video.aid}`, `https://www.bilibili.com/video/${video.bvid}`, video.title, video.desc, video.tname, String(video.owner.mid), video.owner.name, `https://space.bilibili.com/${video.owner.mid}`, video.stat.view, video.stat.danmaku, video.stat.like, video.stat.coin, video.stat.favorite, video.stat.share, video.stat.reply, new Date(video.pubdate * 1000), video.duration, video.pic];
}

function imageFile(url: string, filename: string): TaskDownloadOption[] {
    try {
        const parsed = new URL(url.startsWith('//') ? 'https:' + url : url);
        if (!['https:', 'http:'].includes(parsed.protocol)) return [];
        const extension = parsed.pathname.match(/\.(png|jpe?g|webp|gif)$/i)?.[1] || 'jpg';
        return [{ url: parsed.href, filename: `B站/${filename}.${extension}` }];
    } catch { return []; }
}

export function videoMedia(video: Video) { return imageFile(video.pic, `${video.bvid}-封面`); }
export function authorMedia(author: Author) { return imageFile(author.card.face, `${author.card.mid}-头像`); }
export function commentMedia(comment: Comment) { return (comment.content.pictures || []).flatMap((picture, index) => imageFile(picture.img_src, `${comment.rpid_str || comment.rpid}-${index + 1}`)); }

export async function videoDownloadOptions(video: Video, selectedPage?: number, requestInterval = 1) {
    const parts = video.pages?.length ? video.pages : video.cid ? [{ cid: video.cid, page: 1, part: video.title }] : [];
    const selected = selectedPage == null ? parts : parts.filter(part => part.page === selectedPage);
    if (!selected.length) throw new Error('未找到对应分P，请刷新视频页面后重试');
    const files: TaskDownloadOption[] = [];
    for (const part of selected) {
        await sleep(requestInterval * 1000);
        const playback = await videoPlayback(video.bvid, part.cid);
        if (playback.is_preview) throw new Error('当前账号只能访问试看内容，未加入下载；请先在B站确认视频访问权限');
        if (!playback.durl?.length || !playback.format?.includes('mp4')) throw new Error('该视频未提供完整MP4下载格式（可能为音视频分离流），本版暂不自动合并；请使用桌面下载工具');
        const quality = ({ 16: '360P', 32: '480P', 64: '720P', 80: '1080P' } as Record<number, string>)[playback.quality] || `Q${playback.quality}`;
        for (const [index, stream] of playback.durl.entries()) {
            const url = new URL(stream.url);
            if (url.protocol !== 'https:' || !(url.hostname === 'bilivideo.com' || url.hostname.endsWith('.bilivideo.com') || url.hostname.endsWith('.bilivideo.cn'))) throw new Error('B站返回了不支持的下载地址');
            const segment = playback.durl.length > 1 ? `-片段${index + 1}` : '';
            const title = getSafeFilename(video.title) || video.bvid;
            files.push({ url: url.href, filename: `B站/${video.bvid}-${title}-P${part.page}-${quality}${segment}.mp4`, size: stream.size });
        }
    }
    return files;
}

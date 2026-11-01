import { request } from './request';
import type { ArchivePage, Author, CommentPage, ReplyPage, Video, Playback } from './types';

export function videoDetail(id: string) {
    return request<Video>('/x/web-interface/view', /^av/i.test(id) ? { aid: id.slice(2) } : { bvid: id });
}

export function authorDetail(mid: string) {
    return request<Author>('/x/web-interface/card', { mid, photo: 1 });
}

export function authorPosts(mid: string, page: number) {
    return request<ArchivePage>('/x/space/wbi/arc/search', { mid, pn: page, ps: 30, order: 'pubdate', platform: 'web' }, true);
}

export function videoComments(aid: number, next: number, offset: string) {
    return request<CommentPage>('/x/v2/reply/wbi/main', { type: 1, oid: aid, mode: 2, next, pagination_str: JSON.stringify({ offset }), plat: 1 }, true);
}

export function commentReplies(aid: number, root: string, page: number) {
    return request<ReplyPage>('/x/v2/reply/reply', { type: 1, oid: aid, root, pn: page, ps: 20 });
}

export function videoPlayback(bvid: string, cid: number) {
    // Request the HTML5 progressive MP4 variant, with audio already muxed.
    return request<Playback>('/x/player/playurl', { bvid, cid, qn: 64, fnval: 0, fnver: 0, fourk: 0, platform: 'html5' });
}

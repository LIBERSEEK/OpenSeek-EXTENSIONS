import { TaskProcessor } from '@/utils/task';
import type { FormSchema } from '.';
import { commentReplies, videoComments, videoDetail } from '../../api';
import type { Comment, CommentPage, ReplyPage, Video } from '../../api/types';
import { commentMedia } from '../../utils/media';

const commentId = (comment: Comment) => comment.rpid_str || String(comment.rpid);

export class Processor extends TaskProcessor<FormSchema, Video | CommentPage | ReplyPage | Comment[]> {
    public mediaOptions = [{ value: 'image', label: '评论图片' }];

    async execute() {
        const { urls, limitPerId, includeReplies } = this.condition;
        let completed = 0;
        const processedVideos = new Set<string>();
        this.actions.setTotal(urls.length * limitPerId);
        for (let index = 0; index < urls.length; index++) {
            const url = urls[index];
            const video = await this.next({ key: `video:${url.id}`, func: videoDetail, args: [url.id] });
            if (processedVideos.has(video.bvid)) continue;
            processedVideos.add(video.bvid);
            const comments: Comment[] = [];
            // Keep partial results exportable when a later page fails or is stopped.
            this.dataCache.set(`result:${url.id}`, comments);
            const seen = new Set<string>();
            const append = (items: Comment[]) => {
                let added = 0;
                for (const comment of items) {
                    if (comments.length >= limitPerId) break;
                    if (!seen.has(commentId(comment))) {
                        seen.add(commentId(comment));
                        comments.push(comment);
                        added++;
                    }
                }
                this.actions.setCompleted(completed + comments.length);
                return added;
            };
            let next = 0;
            let offset = '';
            const cursors = new Set<string>();
            const processedRoots = new Set<string>();
            while (comments.length < limitPerId) {
                const cursor = JSON.stringify([next, offset]);
                if (cursors.has(cursor)) throw new Error('B站评论游标重复，已停止；可导出已采集数据，稍后重试');
                cursors.add(cursor);
                const pageKey = `comments:${url.id}:${cursor}`;
                const result = await this.next({ key: pageKey, func: videoComments, args: [video.aid, next, offset] });
                if (!result.cursor) {
                    this.dataCache.delete(pageKey);
                    throw new Error('B站未返回评论分页信息，请登录并刷新页面后重试');
                }
                const roots = [...(result.upper?.top ? [result.upper.top] : []), ...(result.top_replies || []), ...(result.replies || [])];
                const previousCount = comments.length;
                append(roots);
                if (includeReplies) {
                    for (const root of roots) {
                        if (comments.length >= limitPerId) break;
                        if (processedRoots.has(commentId(root))) continue;
                        processedRoots.add(commentId(root));
                        const embedded = root.replies || [];
                        append(embedded);
                        if (comments.length >= limitPerId || !root.rcount || embedded.length >= root.rcount) continue;
                        let page = 1;
                        const replyPages = new Set<string>();
                        while (comments.length < limitPerId) {
                            const replies = await this.next({ key: `replies:${url.id}:${commentId(root)}:${page}`, func: commentReplies, args: [video.aid, commentId(root), page] });
                            const items = replies.replies || [];
                            const signature = items.map(commentId).join(',');
                            if (items.length && replyPages.has(signature)) {
                                this.dataCache.delete(`replies:${url.id}:${commentId(root)}:${page}`);
                                throw new Error('B站返回了重复的回复分页，已停止；可导出已采集数据');
                            }
                            replyPages.add(signature);
                            append(items);
                            if (!items.length || page * (replies.page?.size || 20) >= replies.page?.count) break;
                            page++;
                        }
                    }
                }
                if (result.cursor.is_end || comments.length >= limitPerId) break;
                if (comments.length === previousCount) {
                    this.dataCache.delete(pageKey);
                    throw new Error('B站未返回新的评论，已停止；可导出已采集数据');
                }
                next = result.cursor.next;
                offset = result.cursor.pagination_reply?.next_offset || '';
                if (cursors.has(JSON.stringify([next, offset]))) {
                    this.dataCache.delete(pageKey);
                    throw new Error('B站评论游标重复，已停止；可导出已采集数据，稍后重试');
                }
            }
            completed += comments.length;
            this.actions.setTotal(completed + (urls.length - index - 1) * limitPerId);
        }
        this.actions.setTotal(completed);
        this.actions.setCompleted(completed);
    }

    getComments() {
        return this.condition.urls.flatMap(url => {
            const video = this.dataCache.get(`video:${url.id}`) as Video | undefined;
            const comments = this.dataCache.get(`result:${url.id}`) as Comment[] | undefined;
            return video && comments ? comments.map(comment => ({ video, comment })) : [];
        });
    }

    getDataDownloadOption() {
        const rows: any[][] = [['评论ID', 'BV号', '视频标题', '视频链接', '用户UID', '用户昵称', '用户空间链接', '评论内容', '发布时间', '点赞数', '回复数', 'IP属地', '根评论ID', '父评论ID', '评论图片链接']];
        for (const { video, comment } of this.getComments()) {
            rows.push([commentId(comment), video.bvid, video.title, `https://www.bilibili.com/video/${video.bvid}`, String(comment.member.mid), comment.member.uname, `https://space.bilibili.com/${comment.member.mid}`, comment.content.message, new Date(comment.ctime * 1000), comment.like, comment.rcount, comment.reply_control?.location, comment.root_str || String(comment.root), comment.parent_str || String(comment.parent), (comment.content.pictures || []).map(item => item.img_src).join('\n')]);
        }
        return generateExcelDownloadOption(rows, 'B站-视频评论及回复');
    }

    getMediaDownloadOptions(types: string[]) {
        return types.includes('image') ? this.getComments().flatMap(({ comment }) => commentMedia(comment)) : [];
    }
}

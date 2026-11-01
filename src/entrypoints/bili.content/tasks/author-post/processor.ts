import { TaskProcessor } from '@/utils/task';
import type { FormSchema } from '.';
import { authorPosts, videoDetail } from '../../api';
import type { ArchivePage, Video } from '../../api/types';
import { videoHeaders, videoMedia, videoRow, videoDownloadOptions } from '../../utils/media';

export class Processor extends TaskProcessor<FormSchema, ArchivePage | Video> {
    public mediaOptions = [{ value: 'image', label: '视频封面' }, { value: 'video', label: '视频MP4（全部分P，最高720P可用格式）' }];

    async execute() {
        const { urls, limitPerId } = this.condition;
        let completed = 0;
        this.actions.setTotal(urls.length * limitPerId);
        for (let index = 0; index < urls.length; index++) {
            const author = urls[index];
            const seen = new Set<string>();
            let page = 1;
            while (seen.size < limitPerId) {
                const result = await this.next({ key: `archive:${author.id}:${page}`, func: authorPosts, args: [author.id, page] });
                const posts = result.list?.vlist;
                if (!posts?.length) break;
                let added = 0;
                for (const post of posts) {
                    if (seen.has(post.bvid)) continue;
                    await this.next({ key: `video:${author.id}:${post.bvid}`, func: videoDetail, args: [post.bvid] });
                    seen.add(post.bvid);
                    added++;
                    this.actions.setCompleted(completed + seen.size);
                    if (seen.size >= limitPerId) break;
                }
                if (!added) {
                    this.dataCache.delete(`archive:${author.id}:${page}`);
                    throw new Error('B站返回了重复的投稿分页，已停止；可导出已采集数据，稍后重试');
                }
                if (page * (result.page?.ps || 30) >= result.page?.count) break;
                page++;
            }
            completed += seen.size;
            this.actions.setTotal(completed + (urls.length - index - 1) * limitPerId);
        }
        this.actions.setTotal(completed);
        this.actions.setCompleted(completed);
    }

    getVideos() {
        const videos = new Map<string, Video>();
        for (const [key, data] of this.dataCache) {
            if (key.startsWith('video:')) {
                const video = data as Video;
                videos.set(video.bvid, video);
            }
        }
        return [...videos.values()];
    }

    getDataDownloadOption() {
        return generateExcelDownloadOption([videoHeaders, ...this.getVideos().map(videoRow)], 'B站-UP主投稿视频数据');
    }

    async *getMediaDownloadOptions(types: string[]) {
        const videos = this.getVideos();
        if (types.includes('image')) yield* videos.flatMap(videoMedia);
        if (types.includes('video')) for (const video of videos) yield* await videoDownloadOptions(video, undefined, this.condition.requestInterval);
    }
}

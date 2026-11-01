import { TaskProcessor } from '@/utils/task';
import type { FormSchema } from '.';
import { videoDetail } from '../../api';
import type { Video } from '../../api/types';
import { videoHeaders, videoMedia, videoRow, videoDownloadOptions } from '../../utils/media';

export class Processor extends TaskProcessor<FormSchema, Video> {
    public mediaOptions = [{ value: 'image', label: '视频封面' }, { value: 'video', label: '视频MP4（全部分P，最高720P可用格式）' }];

    async execute() {
        this.actions.setTotal(this.condition.urls.length);
        for (let index = 0; index < this.condition.urls.length; index++) {
            const url = this.condition.urls[index];
            await this.next({ key: url.id, func: videoDetail, args: [url.id] });
            this.actions.setCompleted(index + 1);
        }
    }

    getDataDownloadOption() {
        const rows: any[][] = [videoHeaders];
        const seen = new Set<string>();
        for (const url of this.condition.urls) {
            const video = this.dataCache.get(url.id);
            if (video && seen.has(video.bvid)) continue;
            if (video) seen.add(video.bvid);
            rows.push(video ? videoRow(video) : [url.id, '', url.href]);
        }
        return generateExcelDownloadOption(rows, 'B站-根据链接导出视频数据');
    }

    async *getMediaDownloadOptions(types: string[]) {
        const videos = [...new Map([...this.dataCache.values()].map(video => [video.bvid, video])).values()];
        if (types.includes('image')) yield* videos.flatMap(videoMedia);
        // Resolve each video's expiring URLs immediately before queuing it.
        if (types.includes('video')) for (const video of videos) yield* await videoDownloadOptions(video, undefined, this.condition.requestInterval);
    }
}

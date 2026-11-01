import { TaskProcessor } from '@/utils/task';
import type { FormSchema } from '.';
import { authorDetail } from '../../api';
import type { Author } from '../../api/types';
import { authorMedia } from '../../utils/media';

export class Processor extends TaskProcessor<FormSchema, Author> {
    public mediaOptions = [{ value: 'image', label: 'UP主头像' }];

    async execute() {
        this.actions.setTotal(this.condition.urls.length);
        for (let index = 0; index < this.condition.urls.length; index++) {
            const url = this.condition.urls[index];
            await this.next({ key: url.id, func: authorDetail, args: [url.id] });
            this.actions.setCompleted(index + 1);
        }
    }

    getDataDownloadOption() {
        const rows: any[][] = [['UP主UID', '空间链接', '昵称', '性别', '简介', '粉丝数', '关注数', '获赞数', '投稿数', '等级', '认证信息', '头像链接']];
        for (const url of this.condition.urls) {
            const author = this.dataCache.get(url.id);
            rows.push(author ? [String(author.card.mid), url.href, author.card.name, author.card.sex, author.card.sign, author.follower ?? author.card.fans, author.card.attention, author.like_num, author.archive_count, author.card.level_info?.current_level, author.card.official_verify?.desc, author.card.face] : [url.id, url.href]);
        }
        return generateExcelDownloadOption(rows, 'B站-批量导出UP主信息');
    }

    getMediaDownloadOptions(types: string[]) {
        return types.includes('image') ? [...this.dataCache.values()].flatMap(authorMedia) : [];
    }
}

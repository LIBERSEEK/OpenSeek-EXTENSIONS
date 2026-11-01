import { ToolMenu } from '@/components/common/tool-menu';
import { CopyButton } from '@/components/copy/copy-button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { defineSocialMediaCopilotUi } from '@/utils/ui';
import { toast } from 'sonner';
import { videoDetail } from '../api';
import type { Video } from '../api/types';
import { videoMedia, videoDownloadOptions } from '../utils/media';
import { parseVideoUrl } from '../utils/parse-url';

const Component = () => {
    const [pageUrl, setPageUrl] = useState(location.href);
    const [video, setVideo] = useState<Video>();
    useEffect(() => {
        const update = () => setPageUrl(location.href);
        window.addEventListener('wxt:locationchange', update);
        return () => window.removeEventListener('wxt:locationchange', update);
    }, []);

    const id = new URL(pageUrl).pathname.match(/^\/video\/(BV[0-9A-Za-z]{10}|av[1-9]\d*)\/?$/i)?.[1];
    if (!id) return null;
    const getVideo = async () => {
        const parsed = await parseVideoUrl(new URL(pageUrl));
        if (video && (video.bvid === parsed.id || `av${video.aid}` === parsed.id)) return video;
        const detail = await videoDetail(parsed.id);
        setVideo(detail);
        return detail;
    };
    const run = (action: () => Promise<unknown>) => { void action().catch(error => toast.error(error.message || '操作失败，请刷新B站页面后重试')); };

    return <ToolMenu>
        <DropdownMenuItem onSelect={() => run(async () => {
            const part = Number(new URL(pageUrl).searchParams.get('p') || 1);
            const files = await videoDownloadOptions(await getVideo(), part);
            for (const file of files) await sendMessage('download', file);
            toast.success('当前分P已加入下载队列，清晰度见文件名');
        })}>下载当前分P视频</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run(async () => {
            const files = await videoDownloadOptions(await getVideo());
            for (const file of files) await sendMessage('download', file);
            toast.success(`${files.length}个MP4文件已加入下载队列`);
        })}>下载全部分P视频</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run(() => sendMessage('openTaskDialog', { name: 'post', urls: [pageUrl] }))}>导出当前视频数据</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run(async () => {
            const detail = await getVideo();
            await sendMessage('openTaskDialog', { name: 'post-comment', post: { postId: detail.bvid, title: detail.title, commentCount: detail.stat.reply, url: `https://www.bilibili.com/video/${detail.bvid}` } });
        })}>导出视频评论</DropdownMenuItem>
        <CopyButton submenu getData={getVideo} options={[{ label: 'BV号', value: 'bvid' }, { label: '视频标题', value: 'title' }, { label: '视频简介', value: 'desc' }, { label: 'UP主昵称', value: 'owner.name' }]}>复制视频信息</CopyButton>
        <DropdownMenuItem onSelect={() => run(async () => {
            const detail = await getVideo();
            for (const file of videoMedia(detail)) await sendMessage('download', file);
            toast.success('封面已加入下载');
        })}>下载视频封面</DropdownMenuItem>
    </ToolMenu>;
};

export default defineSocialMediaCopilotUi({
    name: 'social-media-copilot-bili-video',
    position: 'inline',
    className: 'inline-flex py-2',
    anchor: () => document.querySelector('#viewbox_report, .video-info-container, .video-info-detail'),
    append: 'after',
    matches: ['*://www.bilibili.com/video/*'],
    render: ({ root }) => { root.render(<Component />); }
});

import { ToolMenu } from '@/components/common/tool-menu';
import { CopyButton } from '@/components/copy/copy-button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { defineSocialMediaCopilotUi } from '@/utils/ui';
import { toast } from 'sonner';
import { authorDetail } from '../api';
import type { Author } from '../api/types';

const Component = () => {
    const [pageUrl, setPageUrl] = useState(location.href);
    const [author, setAuthor] = useState<Author>();
    useEffect(() => {
        const update = () => setPageUrl(location.href);
        window.addEventListener('wxt:locationchange', update);
        return () => window.removeEventListener('wxt:locationchange', update);
    }, []);
    const id = new URL(pageUrl).pathname.match(/^\/([1-9]\d*)(?:\/.*)?$/)?.[1];
    if (!id) return null;
    const url = `https://space.bilibili.com/${id}`;
    const getAuthor = async () => {
        if (author?.card.mid.toString() === id) return author;
        const info = await authorDetail(id);
        setAuthor(info);
        return info;
    };
    const run = (action: () => Promise<unknown>) => { void action().catch(error => toast.error(error.message || '操作失败，请刷新B站页面后重试')); };

    return <ToolMenu>
        <DropdownMenuItem onSelect={() => run(() => sendMessage('openTaskDialog', { name: 'author', urls: [url] }))}>导出UP主信息</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run(async () => {
            const info = await getAuthor();
            await sendMessage('openTaskDialog', { name: 'author-post', author: { authorId: id, authorName: info.card.name, postCount: info.archive_count, url } });
        })}>导出UP主投稿</DropdownMenuItem>
        <CopyButton submenu getData={getAuthor} options={[{ label: 'UP主UID', value: 'card.mid' }, { label: 'UP主昵称', value: 'card.name' }, { label: '个人简介', value: 'card.sign' }, { label: '粉丝数', value: 'card.fans' }]}>复制UP主信息</CopyButton>
    </ToolMenu>;
};

export default defineSocialMediaCopilotUi({
    name: 'social-media-copilot-bili-user',
    position: 'inline',
    className: 'inline-flex px-4 py-2',
    anchor: () => document.querySelector('.space-header, .h-inner, #h, .up-info-container'),
    append: 'after',
    matches: ['*://space.bilibili.com/*'],
    render: ({ root }) => { root.render(<Component />); }
});

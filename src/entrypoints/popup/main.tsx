/**
 * Copyright (c) Andy Zhou. (https://github.com/iszhouhua)
 *
 * This source code is licensed under the GPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import dyIcon from "@/assets/icons/dy.png";
import xhsIcon from "@/assets/icons/xhs.png";
import ksIcon from "@/assets/icons/ks.png";
import { OpenseekMark } from "@/components/logo";
import { Separator } from "@/components/ui/separator";
import { Book, BookText, BookUser, Bug, CircleUser, ExternalLink, GitBranch, MessageSquareMore, MonitorCheck, TvMinimal, ScanLine, Settings, Sparkles } from "lucide-react";
import ReactDOM from "react-dom/client";
import { Tabs } from "wxt/browser";
import { CollapsibleItem, CollapsibleItemProp, Item } from './item';

type Platform = {
    code: string;
    hostname: string;
    label: string;
    description: string;
    icon: CollapsibleItemProp["icon"];
    hostnames?: string[];
    getItems: (handleOpenDialog: (name: string) => void) => CollapsibleItemProp[];
};

const platforms: Platform[] = [
    {
        code: 'bili',
        hostname: 'www.bilibili.com',
        hostnames: ['www.bilibili.com', 'space.bilibili.com', 'm.bilibili.com'],
        label: '哔哩哔哩',
        description: '视频与UP主数据',
        icon: TvMinimal,
        getItems: (handleOpenDialog) => [
            { icon: CircleUser, title: '批量导出UP主信息', onClick: () => handleOpenDialog('author') },
            { icon: Book, title: '批量导出视频数据', defaultExpand: true, items: [
                { icon: BookText, title: '根据视频链接导出', onClick: () => handleOpenDialog('post') },
                { icon: BookUser, title: '根据UP主链接导出', onClick: () => handleOpenDialog('author-post') },
            ] },
            { icon: MessageSquareMore, title: '批量导出视频评论', onClick: () => handleOpenDialog('post-comment') },
        ]
    },
    {
        code: 'dy',
        hostname: 'www.douyin.com',
        label: '抖音',
        description: '短视频与达人数据',
        icon: dyIcon,
        getItems: (handleOpenDialog) => {
            return [
                { icon: CircleUser, title: '批量导出达人信息', onClick: () => { handleOpenDialog('author') } },
                {
                    icon: Book, title: '批量导出视频数据', defaultExpand: true, items: [
                        { icon: BookText, title: '根据视频链接导出', onClick: () => { handleOpenDialog('post') } },
                        { icon: BookUser, title: '根据达人链接导出', onClick: () => { handleOpenDialog('author-post') } },
                    ]
                },
                { icon: MessageSquareMore, title: '批量导出视频评论', onClick: () => { handleOpenDialog('post-comment') } },
            ];
        }
    },
    {
        code: 'xhs',
        hostname: 'www.xiaohongshu.com',
        label: '小红书',
        description: '笔记与博主数据',
        icon: xhsIcon,
        getItems: (handleOpenDialog) => {
            return [
                { icon: CircleUser, title: '批量导出博主信息', onClick: () => { handleOpenDialog('author') } },
                {
                    icon: Book, title: '批量导出笔记数据', defaultExpand: true, items: [
                        { icon: BookText, title: '根据笔记链接导出', onClick: () => { handleOpenDialog('post') } },
                        { icon: BookUser, title: '根据博主链接导出', onClick: () => { handleOpenDialog('author-post') } },
                    ]
                },
                { icon: MessageSquareMore, title: '批量导出笔记评论', onClick: () => { handleOpenDialog('post-comment') } },
            ];
        }
    },
    {
        code: 'ks',
        hostname: 'www.kuaishou.com',
        label: '快手',
        description: '视频与达人数据',
        icon: ksIcon,
        getItems: (handleOpenDialog) => {
            return [
                { icon: CircleUser, title: '批量导出达人信息', onClick: () => { handleOpenDialog('author') } },
                {
                    icon: Book, title: '批量导出视频数据', defaultExpand: true, items: [
                        { icon: BookText, title: '根据视频链接导出', onClick: () => { handleOpenDialog('post') } },
                        { icon: BookUser, title: '根据达人链接导出', onClick: () => { handleOpenDialog('author-post') } },
                    ]
                },
                { icon: MessageSquareMore, title: '批量导出视频评论', onClick: () => { handleOpenDialog('post-comment') } },
            ];
        }
    }
];


const App = () => {
    const [tab, setTab] = useState<Tabs.Tab>();
    const [platform, setPlatform] = useState<Platform>();
    const [imageError, setImageError] = useState('');

    useEffect(() => {
        browser.tabs.query({ active: true, currentWindow: true })
            .then(([tab]) => {
                setTab(tab);
                if (tab?.url) {
                    try {
                        const hostname = new URL(tab.url).hostname;
                        setPlatform(platforms.find(p => (p.hostnames || [p.hostname]).includes(hostname)));
                    } catch {
                        setPlatform(undefined);
                    }
                }
            });
    }, []);

    const handleOpenDialog = (name: string) => {
        sendMessage('openTaskDialog', { name }, tab?.id);
    }

    const availableItems = platform?.getItems(handleOpenDialog) ?? [];
    const canAnalyzePage = /^https?:\/\//.test(tab?.url ?? '');

    const handleSelectRegion = async () => {
        if (!canAnalyzePage || tab?.id === undefined) return;
        try {
            await browser.tabs.sendMessage(tab.id, { type: 'start-region-selection' }, { frameId: 0 });
            window.close();
        } catch {
            setImageError('请刷新当前网页后重试，或在网页图片上右键分析。');
        }
    };

    return (<main className="popup-shell">
        <header className="popup-header px-5 py-4">
            <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-white/95 shadow-[0_8px_18px_rgba(0,0,0,0.24)]">
                    <OpenseekMark className="size-8" />
                </div>
                <div className="min-w-0">
                    <p className="text-[10px] font-semibold tracking-[0.12em] text-[#b99ff6]">千寻助手</p>
                    <h1 className="truncate text-[17px] font-semibold tracking-[0.08em] text-white">OPENSEEK</h1>
                </div>
                <button type="button" aria-label="图片反推设置" title="图片反推设置" onClick={() => browser.runtime.openOptionsPage()} className="ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[#aaa1b6] transition hover:bg-[#261e32] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b99ff6]">
                    <Settings className="size-[18px]" aria-hidden="true" />
                </button>
            </div>
        </header>

        <section className="border-b border-[#2b2535] px-5 py-4" aria-label="图片反推">
            <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-white"><Sparkles className="size-4 text-[#b99ff6]" />图透镜</p>
            </div>
            <button type="button" disabled={!canAnalyzePage} onClick={handleSelectRegion} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg px-3 bg-[#612bd3] text-xs font-medium text-white transition hover:bg-[#713be3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b99ff6] disabled:cursor-not-allowed disabled:opacity-40">
                <ScanLine className="size-4" />区域框选<span className="ml-auto rounded bg-black/15 px-1.5 py-1 text-[10px] text-white/70">Alt ⇧ S</span>
            </button>
            {imageError && <p role="alert" className="mt-2 text-[10px] leading-5 text-[#f6a2ae]">{imageError}</p>}
        </section>

        <section className="px-2 py-3">
            {platform ? <>
                <div className="mb-2 flex items-center justify-between px-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d8497]">可用工具</p>
                    <span className="text-[10px] text-[#6f6879]">{platform.description}</span>
                </div>
                <div className="flex flex-col gap-1">
                    {availableItems.map((item, index) => item.items ? <CollapsibleItem key={`${item.title}-${index}`} {...item} /> : <Item key={`${item.title}-${index}`} {...item} />)}
                </div>
            </> : <>
                <div className="mb-2 flex items-center gap-2 px-3">
                    <MonitorCheck className="size-4 text-[#b99ff6]" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8d8497]">社媒数据</p>
                </div>
                <div className="flex flex-col gap-1">
                    {platforms.map((supportedPlatform) => <Item
                        key={supportedPlatform.code}
                        icon={supportedPlatform.icon}
                        title={supportedPlatform.label}
                        label={<ExternalLink className="size-3.5 text-[#6f6879]" />}
                        onClick={() => window.open(`https://${supportedPlatform.hostname}`, "_blank")}
                    />)}
                </div>
            </>}
        </section>

        <Separator className="bg-[#2b2535]" />
        <footer className="flex items-center justify-between gap-1 px-3 py-2">
            <Item className="h-8 flex-1 rounded-md px-2 text-[11px] text-[#91899d]" icon={GitBranch} title="查看源码" iconClassName="size-3.5 text-[#b99ff6]" onClick={() => window.open('https://github.com/LIBERSEEK/OpenSeek-EXTENSIONS', "_blank")} />
            <Item className="h-8 flex-1 rounded-md px-2 text-[11px] text-[#91899d]" icon={Bug} title="提交反馈" iconClassName="size-3.5 text-[#e98bb5]" onClick={() => window.open('https://github.com/LIBERSEEK/OpenSeek-EXTENSIONS/issues', "_blank")} />
        </footer>
    </main>);
};


const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);

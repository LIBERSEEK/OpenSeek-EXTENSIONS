/**
 * Copyright (c) Andy Zhou. (https://github.com/iszhouhua)
 *
 * This source code is licensed under the GPL-3.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import biliIcon from "@/assets/icons/bili.svg";
import dyIcon from "@/assets/icons/dy.png";
import xhsIcon from "@/assets/icons/xhs.png";
import ksIcon from "@/assets/icons/ks.png";
import { OpenseekMark } from "@/components/logo";
import { BookText, BookUser, CircleUser, ExternalLink, MessageSquareMore, ScanLine, Settings } from "lucide-react";
import ReactDOM from "react-dom/client";
import { Tabs } from "wxt/browser";
import { Item, ItemProp } from './item';

type Platform = {
    code: string;
    hostname: string;
    label: string;
    icon: string;
    hostnames?: string[];
    getItems: (handleOpenDialog: (name: string) => void) => ItemProp[];
};

// Each platform lists its batch exports as flat rows; the dialogs ask for links.
const platforms: Platform[] = [
    {
        code: 'bili',
        hostname: 'www.bilibili.com',
        hostnames: ['www.bilibili.com', 'space.bilibili.com', 'm.bilibili.com'],
        label: '哔哩哔哩',
        icon: biliIcon,
        getItems: (handleOpenDialog) => [
            { icon: CircleUser, title: 'UP主信息', onClick: () => handleOpenDialog('author') },
            { icon: BookText, title: '视频数据', onClick: () => handleOpenDialog('post') },
            { icon: BookUser, title: 'UP主投稿', onClick: () => handleOpenDialog('author-post') },
            { icon: MessageSquareMore, title: '视频评论', onClick: () => handleOpenDialog('post-comment') },
        ]
    },
    {
        code: 'dy',
        hostname: 'www.douyin.com',
        label: '抖音',
        icon: dyIcon,
        getItems: (handleOpenDialog) => [
            { icon: CircleUser, title: '达人信息', onClick: () => handleOpenDialog('author') },
            { icon: BookText, title: '视频数据', onClick: () => handleOpenDialog('post') },
            { icon: BookUser, title: '达人作品', onClick: () => handleOpenDialog('author-post') },
            { icon: MessageSquareMore, title: '视频评论', onClick: () => handleOpenDialog('post-comment') },
        ]
    },
    {
        code: 'xhs',
        hostname: 'www.xiaohongshu.com',
        label: '小红书',
        icon: xhsIcon,
        getItems: (handleOpenDialog) => [
            { icon: CircleUser, title: '博主信息', onClick: () => handleOpenDialog('author') },
            { icon: BookText, title: '笔记数据', onClick: () => handleOpenDialog('post') },
            { icon: BookUser, title: '博主笔记', onClick: () => handleOpenDialog('author-post') },
            { icon: MessageSquareMore, title: '笔记评论', onClick: () => handleOpenDialog('post-comment') },
        ]
    },
    {
        code: 'ks',
        hostname: 'www.kuaishou.com',
        label: '快手',
        icon: ksIcon,
        getItems: (handleOpenDialog) => [
            { icon: CircleUser, title: '达人信息', onClick: () => handleOpenDialog('author') },
            { icon: BookText, title: '视频数据', onClick: () => handleOpenDialog('post') },
            { icon: BookUser, title: '达人作品', onClick: () => handleOpenDialog('author-post') },
            { icon: MessageSquareMore, title: '视频评论', onClick: () => handleOpenDialog('post-comment') },
        ]
    }
];

const isMac = /Mac/i.test(navigator.platform);

// Shows the shortcut the user actually has, in the symbols of their platform.
function formatShortcut(shortcut: string) {
    if (!isMac) return shortcut;
    const symbols: Record<string, string> = { Ctrl: '⌃', MacCtrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Command: '⌘' };
    return shortcut.split('+').map(key => symbols[key] ?? key).join('');
}

function useRegionShortcut() {
    const [shortcut, setShortcut] = useState('');
    useEffect(() => {
        browser.commands.getAll()
            .then(commands => setShortcut(formatShortcut(commands.find(command => command.name === 'select-region')?.shortcut || '')))
            .catch(() => setShortcut(''));
    }, []);
    return shortcut;
}

const Section = (props: { title: string; icon?: string; children: React.ReactNode }) => (
    <section className="border-t px-2 py-2">
        <div className="flex h-7 items-center gap-1.5 px-2.5 text-xs text-muted-foreground">
            {props.icon && <img src={props.icon} className="size-3.5 rounded-[3px]" alt="" />}
            {props.title}
        </div>
        <div className="flex flex-col">{props.children}</div>
    </section>
);

const App = () => {
    const [tab, setTab] = useState<Tabs.Tab>();
    const [platform, setPlatform] = useState<Platform>();
    const [imageError, setImageError] = useState('');
    const [exportError, setExportError] = useState('');
    const shortcut = useRegionShortcut();

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

    // Like 区域框选: close once the dialog is open on the page. A page loaded
    // before the extension cannot receive the message until it is refreshed.
    const handleOpenDialog = async (name: string) => {
        try {
            await sendMessage('openTaskDialog', { name }, tab?.id);
            window.close();
        } catch {
            setExportError('请刷新当前网页后重试。');
        }
    }

    const canAnalyzePage = /^https?:\/\//.test(tab?.url ?? '');

    const handleSelectRegion = async () => {
        if (!canAnalyzePage || tab?.id === undefined) return;
        try {
            await browser.tabs.sendMessage(tab.id, { type: 'start-region-selection' }, { frameId: 0 });
            window.close();
        } catch {
            setImageError('请刷新当前网页后重试。');
        }
    };

    return (<main className="popup-shell">
        <header className="flex items-center gap-3 px-4 py-3.5">
            <OpenseekMark className="size-9" />
            <div className="min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground">千寻助手</p>
                <h1 className="truncate text-[15px] font-semibold tracking-[0.06em]">OPENSEEK</h1>
            </div>
            <button type="button" aria-label="设置" title="设置" onClick={() => browser.runtime.openOptionsPage()} className="ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <Settings className="size-[18px]" aria-hidden="true" />
            </button>
        </header>

        <Section title="图透镜">
            <Item icon={ScanLine} title="区域框选" disabled={!canAnalyzePage} label={canAnalyzePage ? shortcut : '此页面不可用'} onClick={handleSelectRegion} />
            {imageError && <p role="alert" className="px-2.5 pb-1 pt-1.5 text-xs text-destructive">{imageError}</p>}
        </Section>

        {platform
            ? <Section title={`${platform.label} · 批量导出`} icon={platform.icon}>
                {platform.getItems(handleOpenDialog).map(item => <Item key={item.title} {...item} />)}
                {exportError && <p role="alert" className="px-2.5 pb-1 pt-1.5 text-xs text-destructive">{exportError}</p>}
            </Section>
            : <Section title="社媒数据">
                {platforms.map((supportedPlatform) => <Item
                    key={supportedPlatform.code}
                    icon={supportedPlatform.icon}
                    title={supportedPlatform.label}
                    label={<ExternalLink className="size-3.5" />}
                    onClick={() => window.open(`https://${supportedPlatform.hostname}`, "_blank")}
                />)}
            </Section>}
    </main>);
};


const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);

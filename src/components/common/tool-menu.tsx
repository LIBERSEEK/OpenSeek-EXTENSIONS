import { OpenseekMark } from '@/components/logo';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AppWindow, ScanLine, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

export function ToolMenu({ children }: { children: React.ReactNode }) {
    const runTool = (action: () => Promise<unknown>) => {
        void action().catch(() => toast.error('暂时无法打开工具，请刷新页面后重试'));
    };

    return <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
            <button type="button" aria-label="千寻工具菜单" title="千寻工具菜单" className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent p-0 transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <OpenseekMark className="size-8" />
            </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} collisionPadding={12} className="min-w-[208px] [&_[role=menuitem]]:min-h-9 [&_[role=menuitem]]:cursor-pointer">
            <DropdownMenuLabel className="text-xs text-muted-foreground">千寻 · 当前页面工具</DropdownMenuLabel>
            {children}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => runTool(() => sendMessage('selectImageRegion', undefined))}><ScanLine />框选图片反推</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runTool(() => sendMessage('openImageSettings', undefined))}><Settings2 />图片反推设置</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runTool(() => sendMessage('openPopup', undefined))}><AppWindow />打开千寻工具箱</DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>;
}

import { OpenseekMark } from '@/components/logo';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

// The page's own actions, then the one Image Lens action that applies to any
// page. Settings and the toolbox live behind the toolbar icon.
export function ToolMenu({ children }: { children: React.ReactNode }) {
    const selectRegion = () => {
        void sendMessage('selectImageRegion', undefined).catch(() => toast.error('暂时无法框选，请刷新页面后重试'));
    };

    return <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
            <button type="button" aria-label="千寻工具菜单" title="千寻工具菜单" className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent p-0 transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <OpenseekMark className="size-8" />
            </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} collisionPadding={12} className="min-w-[200px]">
            {children}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={selectRegion}>区域框选</DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>;
}

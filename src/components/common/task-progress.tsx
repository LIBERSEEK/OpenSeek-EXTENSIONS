import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TaskProcessor } from "@/utils/task";
import { throttle } from "lodash";
import { CircleAlert, CircleCheck, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { DownloadMedia } from "./download-media";

export enum TaskStatus {
    /**
     * 默认状态
     */
    INITIAL,
    /**
     * 执行中
     */
    EXECUTING,
    /**
     * 运行完成
     */
    COMPLETED,
    /**
     * 运行失败
     */
    FAILED
}

export const TaskProgress = (props: {
    processor: TaskProcessor;
    onClose: () => void;
}) => {
    const { processor, onClose } = props;
    const [total, setTotal] = useState(0);
    const [completed, setCompleted] = useState(0);
    const [status, setStatus] = useState<TaskStatus>(TaskStatus.INITIAL);
    const [reason, setReason] = useState<string>("");
    const [aborted, setAborted] = useState(false);

    useEffect(() => {
        setTotal(0);
        setCompleted(0);
        // A new task replaces the previous one on the same card.
        setAborted(false);
        setReason("");
        setStatus(processor ? TaskStatus.EXECUTING : TaskStatus.INITIAL);
    }, [processor]);

    useEffect(() => {
        if (!processor || status !== TaskStatus.EXECUTING) return;
        // 执行任务
        const controller = new AbortController();
        processor.signal = controller.signal;
        processor.actions = { setCompleted, setTotal };
        setCompleted(0);
        processor.execute().then(() => {
            setStatus(TaskStatus.COMPLETED);
        }).catch(err => {
            console.error(err);
            setReason(err?.message);
            setStatus(TaskStatus.FAILED);
        });
        return () => controller.abort();
    }, [status]);

    const handleDownloadData = async () => {
        if (!processor) return;
        const option = await processor.getDataDownloadOption();
        await sendMessage("download", option)
            .then(() => {
                toast.success("下载成功");
            }).catch(() => {
                toast.error("下载失败");
            });
        URL.revokeObjectURL(option.url);
    };

    const stop = () => { setAborted(true); setStatus(TaskStatus.FAILED); };
    const retry = () => { setAborted(false); setStatus(TaskStatus.EXECUTING); };

    const percentage = Math.min(Math.floor((completed ?? 0) / (total || 100) * 100), 100);
    // Rows collected before a failure can still be exported.
    const canExport = status === TaskStatus.COMPLETED || (status === TaskStatus.FAILED && completed > 0);
    const title = status === TaskStatus.COMPLETED ? "导出完成" : status === TaskStatus.FAILED ? (aborted ? "已中止" : "导出失败") : "正在导出";
    const progressText = total ? `已完成 ${completed}/${total}` : "正在准备…";
    const detail = status === TaskStatus.FAILED && !aborted
        ? [reason || "请重试", completed > 0 && progressText].filter(Boolean).join(" · ")
        : progressText;

    // One status line, one primary action on the right.
    return (<div className="fixed bottom-4 right-4 flex w-[360px] flex-col gap-3 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2">
        <div className="flex items-start gap-3">
            {status === TaskStatus.EXECUTING && <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />}
            {status === TaskStatus.COMPLETED && <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" />}
            {status === TaskStatus.FAILED && <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />}
            <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-0.5 break-words text-[13px] text-muted-foreground">{detail}</p>
            </div>
            <button type="button" aria-label="关闭" onClick={onClose} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="size-4" />
            </button>
        </div>
        {status === TaskStatus.EXECUTING && <Progress value={percentage} className="h-1.5" />}
        <div className="flex justify-end gap-2">
            {status === TaskStatus.EXECUTING && <Button size='sm' variant='secondary' onClick={stop}>中止</Button>}
            {canExport && processor?.mediaOptions?.length > 0 && <DownloadMedia processor={processor} >
                <Button size='sm' variant='secondary'>下载素材</Button>
            </DownloadMedia>}
            {canExport && <Button size='sm' variant={status === TaskStatus.COMPLETED ? 'default' : 'secondary'} onClick={throttle(handleDownloadData, 3000)}>导出数据</Button>}
            {status === TaskStatus.FAILED && <Button size='sm' onClick={retry}>重试</Button>}
        </div>
    </div>)
}

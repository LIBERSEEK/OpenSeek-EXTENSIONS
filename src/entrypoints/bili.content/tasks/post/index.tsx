import { RequestIntervalFormField } from "@/components/form-field/request-interval";
import { UrlArrayFormField, urlArrayTransform } from "@/components/form-field/url-array";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { parseVideoUrl as parseUrl } from "../../utils/parse-url";
import { Processor } from "./processor";

const formSchema = z.object({
    urls: z.array(z.string().trim()).nonempty().transform((arg, ctx) => urlArrayTransform(arg, ctx, parseUrl)).refine(urls => Array.isArray(urls) && urls.length > 0, "请输入至少一个有效链接").superRefine((urls, ctx) => {
        if (Array.isArray(urls) && urls.some(url => !/^(BV[0-9A-Za-z]{10}|av[1-9]\d*)$/.test(url.id) || !url.href.startsWith('https://www.bilibili.com/video/'))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "链接类型不匹配，请检查输入" });
    }).transform(urls => [...new Map(urls.map(url => [url.id, url])).values()]),
    requestInterval: z.coerce.number().finite().min(0, "请求间隔不能小于0秒")
});

export { parseUrl, Processor };

export type FormSchema = z.infer<typeof formSchema>;

const Component = (props: TaskDialogProps & { urls?: string[]; autoStart?: boolean }) => {
    const { urls, autoStart, setProcessor, ...restProps } = props;
    // Opened for the video on the page: start right away, and show the form
    // only if that link cannot be used.
    const [showForm, setShowForm] = useState(!autoStart);

    const form = useForm<any, any, FormSchema>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            urls: urls || [],
            requestInterval: 1
        }
    });

    const handleSubmit = (values: FormSchema) => {
        setProcessor(new Processor(values));
    }

    useEffect(() => {
        if (autoStart) void form.handleSubmit(handleSubmit, () => setShowForm(true))();
    }, []);

    if (!showForm) return null;

    return (<Dialog {...restProps}>
        <DialogContent className="max-w-[600px]" aria-describedby={undefined}>
            <DialogHeader>
                <DialogTitle>批量导出视频数据</DialogTitle>
            </DialogHeader>
            <Form {...form}>
                <form className="space-y-6 py-4">
                    <UrlArrayFormField
                        control={form.control}
                        name="urls" label="视频链接" />
                    <RequestIntervalFormField control={form.control} name="requestInterval"/>
                </form>
            </Form>
            <DialogFooter>
                <Button onClick={form.handleSubmit(handleSubmit)} className="w-full">导出</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>);
}

export default defineTaskDialog({
    name: "post",
    children: Component,
    processor: Processor
});
import { LimitPerIdFormField } from "@/components/form-field/limit-per-id";
import { RequestIntervalFormField } from "@/components/form-field/request-interval";
import { UrlArrayFormField, urlArrayTransform } from "@/components/form-field/url-array";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Form } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { parseVideoUrl as parseUrl } from "../../utils/parse-url";
import { Processor } from "./processor";

const formSchema = z.object({
    includeReplies: z.boolean(),
    limitPerId: z.coerce.number().int().max(10000).min(1, "请输入需要导出的评论数量"),
    urls: z.array(z.string().trim()).nonempty().transform((arg, ctx) => urlArrayTransform(arg, ctx, parseUrl)).refine(urls => Array.isArray(urls) && urls.length > 0, "请输入至少一个有效链接").superRefine((urls, ctx) => {
        if (Array.isArray(urls) && urls.some(url => !/^(BV[0-9A-Za-z]{10}|av[1-9]\d*)$/.test(url.id) || !url.href.startsWith('https://www.bilibili.com/video/'))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "链接类型不匹配，请检查输入" });
    }).transform(urls => [...new Map(urls.map(url => [url.id, url])).values()]),
    requestInterval: z.coerce.number().finite().min(0, "请求间隔不能小于0秒")
});

export type FormSchema = z.infer<typeof formSchema>;

export { Processor };

export type ExtendedProps = {
    post?: {
        postId: string
        commentCount: number
        title: string
        url: string
    }
}

const Component = (props: TaskDialogProps & ExtendedProps) => {
    const { post, setProcessor, ...restProps } = props;

    const form = useForm<any, any, FormSchema>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            includeReplies: true,
            limitPerId: Math.min(post?.commentCount || 1000, 10000),
            urls: post ? [post.url] : [],
            requestInterval: 1
        }
    });

    const handleSubmit = (values: FormSchema) => {
        setProcessor(new Processor(values));
    }

    return (<Dialog {...restProps}>
        <DialogContent className="max-w-[600px]" aria-describedby={undefined}>
            <DialogHeader>
                <DialogTitle>{post ? <>导出视频「{(post.title?.length > 20) ? post.title.substring(0, 20) + '...' : post.title}」的评论数据</> : <>根据视频链接批量导出视频评论</>}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
                <form className="space-y-6 py-4">
                    {!post && <UrlArrayFormField
                        control={form.control}
                        name="urls"
                        label="视频链接"
                    />}
                    <LimitPerIdFormField
                        control={form.control}
                        name="limitPerId"
                        description={post ? `当前视频共有${post.commentCount}条评论` : '每条视频需要导出的评论数量'} />
                    <FormField control={form.control} name="includeReplies" render={({ field }) => <FormItem className="flex items-center gap-2 space-y-0"><FormControl><Checkbox checked={field.value} onCheckedChange={value => field.onChange(value === true)} /></FormControl><FormLabel>包含楼中楼回复（计入每条视频的总数量）</FormLabel></FormItem>} />
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
    name: "post-comment",
    children: Component,
    processor: Processor
});
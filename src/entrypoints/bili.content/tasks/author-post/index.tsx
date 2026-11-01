import { LimitPerIdFormField } from "@/components/form-field/limit-per-id";
import { RequestIntervalFormField } from "@/components/form-field/request-interval";
import { UrlArrayFormField, urlArrayTransform } from "@/components/form-field/url-array";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { parseAuthorUrl as parseUrl } from "../../utils/parse-url";
import { Processor } from "./processor";

const formSchema = z.object({
    limitPerId: z.coerce.number().int().max(10000).min(1, "请输入需要导出的数量"),
    urls: z.array(z.string().trim()).nonempty().transform((arg, ctx) => urlArrayTransform(arg, ctx, parseUrl)).refine(urls => Array.isArray(urls) && urls.length > 0, "请输入至少一个有效链接").superRefine((urls, ctx) => {
        if (Array.isArray(urls) && urls.some(url => !/^[1-9]\d*$/.test(url.id) || !url.href.startsWith('https://space.bilibili.com/'))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "链接类型不匹配，请检查输入" });
    }).transform(urls => [...new Map(urls.map(url => [url.id, url])).values()]),
    requestInterval: z.coerce.number().finite().min(0, "请求间隔不能小于0秒")
});

export type FormSchema = z.infer<typeof formSchema>;

export { Processor };

export type ExtendedProps = {
    author?: {
        authorId: string
        authorName: string
        postCount: number
        url: string
    }
}

const Component = (props: TaskDialogProps & ExtendedProps) => {
    const { author, setProcessor, ...restProps } = props;

    const form = useForm<any, any, FormSchema>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            urls: author ? [author.url] : [],
            limitPerId: Math.min(author?.postCount || 10, 10000),
            requestInterval: 1
        },
    });

    const handleSubmit = (values: FormSchema) => {
        setProcessor(new Processor(values));
    }

    return (<Dialog {...restProps}>
        <DialogContent className="max-w-[600px]" aria-describedby={undefined}>
            <DialogHeader>
                <DialogTitle>{author ? <>导出<span className="text-red-400">{author.authorName}</span>的视频数据</> : <>根据UP主链接批量导出视频数据</>}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
                <form className="space-y-6 py-4">
                    {!author && <UrlArrayFormField
                        control={form.control}
                        name="urls" label="UP主链接" />}
                    <LimitPerIdFormField
                        control={form.control}
                        name="limitPerId"
                        description={author ? `当前UP主共有${author.postCount}个作品` : '每位UP主需要导出的视频数量'} />
                    <RequestIntervalFormField control={form.control} name="requestInterval"/>
                </form>
            </Form>
            <DialogFooter>
                <Button onClick={form.handleSubmit(handleSubmit)} className="w-full">开始</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>);
}


export default defineTaskDialog({
    name: "author-post",
    children: Component,
    processor: Processor
});
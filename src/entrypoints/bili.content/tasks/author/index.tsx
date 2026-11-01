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
    urls: z.array(z.string().trim()).nonempty().transform((arg, ctx) => urlArrayTransform(arg, ctx, parseUrl)).refine(urls => Array.isArray(urls) && urls.length > 0, "请输入至少一个有效链接").superRefine((urls, ctx) => {
        if (Array.isArray(urls) && urls.some(url => !/^[1-9]\d*$/.test(url.id) || !url.href.startsWith('https://space.bilibili.com/'))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "链接类型不匹配，请检查输入" });
    }).transform(urls => [...new Map(urls.map(url => [url.id, url])).values()]),
    requestInterval: z.coerce.number().finite().min(0, "请求间隔不能小于0秒")
});

export type FormSchema = z.infer<typeof formSchema>;

const Component = (props: TaskDialogProps & { urls?: string[] }) => {
    const { urls, setProcessor, ...restProps } = props;

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

    return (<Dialog {...restProps}>
        <DialogContent className="max-w-[600px]" aria-describedby={undefined}>
            <DialogHeader>
                <DialogTitle>批量导出UP主数据</DialogTitle>
            </DialogHeader>
            <Form {...form}>
                <form className="space-y-6 py-4">
                    <UrlArrayFormField
                        control={form.control}
                        name="urls" label="UP主链接" />
                    <RequestIntervalFormField control={form.control} name="requestInterval" />
                </form>
            </Form>
            <DialogFooter>
                <Button onClick={form.handleSubmit(handleSubmit)} className="w-full">开始</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>);
}

export default defineTaskDialog({
    name: "author",
    children: Component,
    processor: Processor
});
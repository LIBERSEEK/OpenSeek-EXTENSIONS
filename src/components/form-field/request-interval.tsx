import { cn } from "@/utils/tw";
import { ChevronRight } from "lucide-react";
import { ControllerProps, FieldPath, FieldValues } from "react-hook-form";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "../ui/form";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

// Rarely changed, so it stays folded behind a summary of its current value;
// a validation error unfolds it.
export const RequestIntervalFormField = <
    TFieldValues extends FieldValues = FieldValues,
    TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>(props: Omit<ControllerProps<TFieldValues, TName>, "render">) => {
    const [open, setOpen] = useState(false);
    return (
        <FormField {...props}
            render={({ field, fieldState }) => {
                const expanded = open || Boolean(fieldState.error);
                return (<Collapsible open={expanded} onOpenChange={setOpen}>
                    <CollapsibleTrigger type="button" className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                        <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} />
                        高级 · 请求间隔 {field.value ?? 0} 秒
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <FormItem className="pt-3">
                            <div className="flex items-center justify-between">
                                <FormLabel>请求间隔</FormLabel>
                                <FormDescription>
                                    两次接口请求之间的间隔时长，值越大越不容易触发风控
                                </FormDescription>
                            </div>
                            <div className="flex items-center">
                                <FormControl>
                                    <Input type="number" {...field} />
                                </FormControl>
                                <Label className="px-2">秒</Label>
                            </div>
                            <FormMessage />
                        </FormItem>
                    </CollapsibleContent>
                </Collapsible>);
            }}
        />)
}

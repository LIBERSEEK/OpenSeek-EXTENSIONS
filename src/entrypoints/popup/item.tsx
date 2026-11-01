import { LucideIcon } from "lucide-react";

export interface ItemProp extends React.HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon | string;
  iconClassName?: string;
  title: string;
  label?: React.ReactNode;
  disabled?: boolean;
}

// One popup row: icon, title and an optional trailing label such as a shortcut.
export const Item = (props: ItemProp) => {
  const { icon: Icon, title, label, className, iconClassName, disabled, onClick, ...restProps } = props;

  return (<div
    className={cn("popup-item flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] aria-disabled:cursor-default aria-disabled:opacity-50", className)}
    role="button"
    tabIndex={disabled ? -1 : 0}
    aria-disabled={disabled || undefined}
    onClick={disabled ? undefined : onClick}
    onKeyDown={(event) => {
      if (disabled) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onClick?.(event as unknown as React.MouseEvent<HTMLDivElement>);
      }
    }}
    {...restProps}>
    {typeof Icon === "string" ? <img src={Icon} className={cn("size-4 shrink-0 rounded-[4px]", iconClassName)} alt="" /> : <Icon className={cn("size-4 shrink-0 text-muted-foreground", iconClassName)} />}
    <span className="min-w-0 flex-1 truncate">{title}</span>
    {label && <span className="shrink-0 text-xs text-muted-foreground">{label}</span>}
  </div>);
};

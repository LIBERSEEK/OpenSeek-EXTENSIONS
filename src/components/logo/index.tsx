import { cn } from "@/utils/tw";

export function OpenseekMark({ className }: { className?: string }) {
  return (
    <img
      className={cn("shrink-0 rounded-[22%] object-contain", className)}
      src={browser.runtime.getURL('/icon/128.png')}
      alt=""
      aria-hidden="true"
    />
  );
}

export function Logo() {
  return (
    <button
      type="button"
      className="flex border-0 bg-transparent p-0 hover:cursor-pointer"
      aria-label="打开千寻助手"
      onClick={() => sendMessage("openPopup", undefined)}
    >
      <OpenseekMark className="size-8" />
    </button>
  );
}

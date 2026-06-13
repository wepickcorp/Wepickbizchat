import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrandLogoMarkProps {
  className?: string;
  iconClassName?: string;
}

export function BrandLogoMark({ className, iconClassName }: BrandLogoMarkProps) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm shadow-orange-500/20",
        className
      )}
      aria-hidden="true"
    >
      <span className="relative flex h-2/3 w-2/3 items-center justify-center">
        <MessageSquare className={cn("h-full w-full stroke-[3]", iconClassName)} />
        <span className="absolute -right-0.5 top-1 h-2.5 w-2.5 rounded-full border-2 border-primary bg-primary-foreground" />
      </span>
    </span>
  );
}

interface BrandLogoProps {
  className?: string;
  compact?: boolean;
}

export function BrandLogo({ className, compact = false }: BrandLogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <BrandLogoMark className={compact ? "h-9 w-9 rounded-lg" : "h-11 w-11"} />
      <div className="flex min-w-0 flex-col leading-none">
        <span className="truncate text-sm font-bold text-primary">BIZCHAT</span>
        <span className="mt-1 text-tiny text-muted-foreground">SK Core Target</span>
      </div>
    </div>
  );
}

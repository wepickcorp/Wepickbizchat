import type { ComponentType, SVGProps } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type AppIconComponent = ComponentType<SVGProps<SVGSVGElement>> | LucideIcon;

interface AppIconTileProps {
  icon?: AppIconComponent;
  imageSrc?: string;
  className?: string;
  iconClassName?: string;
  imageClassName?: string;
  tone?: "orange" | "blue" | "green" | "red" | "purple" | "slate";
}

const appIconToneClassNames: Record<NonNullable<AppIconTileProps["tone"]>, string> = {
  orange: "bg-[#f4f6f8] text-primary shadow-[0_10px_20px_-18px_rgba(15,23,42,0.28)]",
  blue: "bg-[#f4f6f8] text-[#2f80ed] shadow-[0_10px_20px_-18px_rgba(15,23,42,0.28)]",
  green: "bg-[#f4f6f8] text-[#11b981] shadow-[0_10px_20px_-18px_rgba(15,23,42,0.28)]",
  red: "bg-[#f4f6f8] text-destructive shadow-[0_10px_20px_-18px_rgba(15,23,42,0.28)]",
  purple: "bg-[#f4f6f8] text-[#7c5cff] shadow-[0_10px_20px_-18px_rgba(15,23,42,0.28)]",
  slate: "bg-[#f4f6f8] text-slate-700 shadow-[0_10px_20px_-18px_rgba(15,23,42,0.28)]",
};

export function AppIconTile({
  icon: Icon,
  imageSrc,
  className,
  iconClassName,
  imageClassName,
  tone = "orange",
}: AppIconTileProps) {
  return (
    <span
      className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-white/80 ring-1 ring-black/[0.035]",
        appIconToneClassNames[tone],
        className
      )}
      aria-hidden="true"
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt=""
          className={cn("h-7 w-7 object-contain drop-shadow-[0_6px_7px_rgba(15,23,42,0.12)]", imageClassName)}
          draggable={false}
        />
      ) : Icon ? (
        <Icon className={cn("h-6 w-6 stroke-[2.45]", iconClassName)} />
      ) : null}
    </span>
  );
}

interface AppNavIconProps {
  icon: LucideIcon;
  active?: boolean;
  className?: string;
  soft?: boolean;
}

export function AppNavIcon({ icon: Icon, active = false, className, soft = false }: AppNavIconProps) {
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors",
        soft
          ? active
            ? "text-primary"
            : "text-slate-800"
          : active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground",
        className
      )}
      aria-hidden="true"
    >
      <Icon className={soft ? "h-[26px] w-[26px] stroke-[2.4]" : "h-[18px] w-[18px] stroke-[2.2]"} />
    </span>
  );
}

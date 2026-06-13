import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { AppIconTile } from "@/components/app-icon-tile";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  iconClassName?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  iconClassName,
  trend,
  className,
}: StatsCardProps) {
  return (
    <Card className={cn("hover-elevate transition-shadow", className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-small font-medium text-muted-foreground mb-1">{title}</p>
            <p className="text-h1 font-bold truncate" data-testid={`text-stat-${title.replace(/\s/g, '-')}`}>
              {value}
            </p>
            {description && (
              <p className="text-tiny text-muted-foreground mt-1">{description}</p>
            )}
            {trend && (
              <p className={cn(
                "text-tiny mt-1",
                trend.isPositive ? "text-success" : "text-destructive"
              )}>
                {trend.isPositive ? '+' : ''}{trend.value}% 지난 달 대비
              </p>
            )}
          </div>
          <AppIconTile icon={Icon} className={iconClassName} />
        </div>
      </CardContent>
    </Card>
  );
}

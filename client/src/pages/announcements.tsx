import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { 
  Bell, 
  AlertTriangle, 
  Info,
  Calendar,
  Pin,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { formatDateTime } from "@/lib/authUtils";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  isPinned: boolean;
  createdAt: string;
}

const typeConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive"; icon: typeof Info; className: string }> = {
  info: { label: "안내", variant: "secondary", icon: Info, className: "bg-blue-50 border-blue-200" },
  warning: { label: "주의", variant: "default", icon: AlertTriangle, className: "bg-yellow-50 border-yellow-200" },
  urgent: { label: "긴급", variant: "destructive", icon: Bell, className: "bg-red-50 border-red-200" },
  event: { label: "이벤트", variant: "secondary", icon: Bell, className: "bg-purple-50 border-purple-200" },
};

export default function Announcements() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: announcements, isLoading } = useQuery<Announcement[]>({
    queryKey: ["/api/announcements"],
  });

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-display font-bold" data-testid="text-title">공지사항</h1>
        <p className="text-muted-foreground mt-1">
          서비스 업데이트 및 중요한 안내사항을 확인하세요
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-h2 flex items-center gap-2">
            <Bell className="h-5 w-5" />
            전체 공지사항
          </CardTitle>
          <CardDescription>
            최신 공지사항부터 확인할 수 있어요
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : !announcements || announcements.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="공지사항이 없어요"
              description="새로운 공지사항이 등록되면 여기에 표시됩니다"
            />
          ) : (
            <div className="space-y-3">
              {announcements.map((announcement) => {
                const config = typeConfig[announcement.type] || typeConfig.info;
                const TypeIcon = config.icon;
                const isExpanded = expandedId === announcement.id;

                return (
                  <div
                    key={announcement.id}
                    className={cn(
                      "border rounded-lg p-4 transition-colors cursor-pointer hover-elevate",
                      config.className
                    )}
                    onClick={() => toggleExpand(announcement.id)}
                    data-testid={`card-announcement-${announcement.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={cn(
                          "p-2 rounded-lg",
                          announcement.type === 'urgent' ? "bg-red-100" : 
                          announcement.type === 'warning' ? "bg-yellow-100" : 
                          announcement.type === 'event' ? "bg-purple-100" : "bg-blue-100"
                        )}>
                          <TypeIcon className={cn(
                            "h-4 w-4",
                            announcement.type === 'urgent' ? "text-red-600" : 
                            announcement.type === 'warning' ? "text-yellow-600" : 
                            announcement.type === 'event' ? "text-purple-600" : "text-blue-600"
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {announcement.isPinned && (
                              <Pin className="h-3 w-3 text-primary" />
                            )}
                            <Badge variant={config.variant} className="text-xs">
                              {config.label}
                            </Badge>
                            <h3 className="font-semibold text-foreground">
                              {announcement.title}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {announcement.createdAt ? new Date(announcement.createdAt).toLocaleDateString("ko-KR") : "-"}
                          </div>
                          {isExpanded && (
                            <div className="mt-3 text-sm text-foreground whitespace-pre-wrap border-t pt-3">
                              {announcement.content}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

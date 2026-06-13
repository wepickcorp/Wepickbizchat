import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Search,
  FileText,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  BarChart3,
  Mail,
  Clock,
} from "lucide-react";
import { useState } from "react";
import { formatDateTime, formatNumber, getMessageTypeLabel } from "@/lib/authUtils";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getUserFacingMessageName } from "@/lib/display-copy";
import type { Template } from "@shared/schema";

interface TemplateWithStats extends Template {
  isSystem?: boolean;
  sendHistory: {
    campaignCount: number;
    totalSent: number;
    totalDelivered: number;
    lastSentAt: string | null;
  };
}

export default function Templates() {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: templates, isLoading } = useQuery<TemplateWithStats[]>({
    queryKey: ["/api/templates"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({
        title: "메시지를 삭제했어요",
        description: "메시지 목록에서 삭제했어요.",
      });
    },
    onError: () => {
      toast({
        title: "삭제 실패",
        description: "다시 시도해주세요.",
        variant: "destructive",
      });
    },
  });

  const filteredTemplates = templates?.filter((template) => {
    return template.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleDelete = (id: string) => {
    if (confirm("정말 이 메시지를 삭제할까요?")) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">메시지 목록</h1>
          <p className="text-muted-foreground mt-1">
            검수가 끝난 메시지를 확인하고 캠페인에 활용해요
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="메시지 이름으로 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-templates"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between py-4 border-b last:border-0">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredTemplates && filteredTemplates.length > 0 ? (
            <div className="space-y-1">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between py-4 px-2 rounded-lg hover-elevate -mx-2 border-b last:border-0"
                  data-testid={`row-template-${template.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <span className="font-medium truncate" data-testid={`text-template-name-${template.id}`}>
                        {getUserFacingMessageName(template.name)}
                      </span>
                      {template.isSystem && (
                        <Badge variant="secondary" className="text-tiny shrink-0 bg-amber-100 text-amber-800 border-amber-200" data-testid={`badge-recommended-${template.id}`}>
                          추천 메시지
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-tiny shrink-0">
                        {getMessageTypeLabel(template.messageType)}
                      </Badge>
                      <span className="text-tiny text-muted-foreground font-mono" data-testid={`text-template-id-${template.id}`}>
                        ID: {template.id}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-small text-muted-foreground">
                      <span className="truncate max-w-[200px]">{template.content.substring(0, 50)}...</span>
                      <span className="shrink-0">{template.createdAt ? formatDateTime(template.createdAt) : '-'}</span>
                    </div>

                    {/* Send History Stats */}
                    {template.sendHistory && template.sendHistory.campaignCount > 0 && (
                      <div className="mt-2 flex items-center gap-4 text-small" data-testid={`send-history-${template.id}`}>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <BarChart3 className="h-3.5 w-3.5" />
                          <span>캠페인 {formatNumber(template.sendHistory.campaignCount)}건</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-primary">
                          <Mail className="h-3.5 w-3.5" />
                          <span>발송 {formatNumber(template.sendHistory.totalSent)}건</span>
                        </div>
                        {template.sendHistory.lastSentAt && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            <span>최근 {formatDateTime(template.sendHistory.lastSentAt)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-template-menu-${template.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="cursor-pointer gap-2"
                          onClick={() => setLocation(`/templates/${template.id}`)}
                          data-testid={`button-view-template-${template.id}`}
                        >
                          <Eye className="h-4 w-4" />
                          상세 보기
                        </DropdownMenuItem>
                        {!template.isSystem && (
                          <>
                            <DropdownMenuItem
                              className="cursor-pointer gap-2"
                              onClick={() => setLocation(`/templates/${template.id}/edit`)}
                              data-testid={`button-edit-template-${template.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                              수정하기
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                              onClick={() => handleDelete(template.id)}
                              data-testid={`button-delete-template-${template.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                              삭제하기
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title="준비된 메시지를 확인하고 있어요"
              description="운영팀이 검수를 마친 메시지만 캠페인에서 선택할 수 있어요."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

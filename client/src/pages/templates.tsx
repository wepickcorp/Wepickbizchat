import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { 
  FilePlus, 
  Search, 
  FileText,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  BarChart3,
  Mail,
  Clock,
  CheckCircle2,
  Clock3,
  XCircle,
  FileEdit,
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

function getStatusBadge(status: string) {
  switch (status) {
    case 'approved':
      return { 
        label: '승인됨', 
        variant: 'default' as const, 
        className: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-100',
        icon: CheckCircle2 
      };
    case 'pending':
      return { 
        label: '검수중', 
        variant: 'secondary' as const, 
        className: 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100',
        icon: Clock3 
      };
    case 'rejected':
      return { 
        label: '반려됨', 
        variant: 'destructive' as const, 
        className: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100',
        icon: XCircle 
      };
    default:
      return { 
        label: '작성중', 
        variant: 'outline' as const, 
        className: 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100',
        icon: FileEdit 
      };
  }
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
        title: "템플릿 삭제 완료",
        description: "템플릿이 삭제되었어요.",
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
    if (confirm("정말 이 템플릿을 삭제할까요?")) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">메세지 목록</h1>
          <p className="text-muted-foreground mt-1">
            메시지 템플릿을 관리하고 캠페인에 활용해요
          </p>
        </div>
        <Button asChild className="gap-2 w-fit" data-testid="button-new-template">
          <Link href="/templates/new">
            <FilePlus className="h-4 w-4" />
            메세지 만들기
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="메세지 이름으로 검색..."
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
                        {template.name}
                      </span>
                      {(() => {
                        const statusBadge = getStatusBadge(template.status);
                        const StatusIcon = statusBadge.icon;
                        return (
                          <Badge variant={statusBadge.variant} className={`text-tiny shrink-0 gap-1 ${statusBadge.className}`} data-testid={`badge-status-${template.id}`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusBadge.label}
                          </Badge>
                        );
                      })()}
                      {template.isSystem && (
                        <Badge variant="secondary" className="text-tiny shrink-0 bg-amber-100 text-amber-800 border-amber-200" data-testid={`badge-recommended-${template.id}`}>
                          추천템플릿
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
              title="메세지가 없어요"
              description="메시지 템플릿을 만들고 캠페인에 활용해보세요."
              action={{
                label: "첫 메세지 만들기",
                onClick: () => setLocation("/templates/new"),
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  PlusCircle, 
  Search, 
  Megaphone,
  Filter,
  MoreHorizontal,
  Eye,
  Trash2,
  Send,
  Calendar,
  Clock,
  Play,
  FileCheck,
  TestTube,
  Ban,
  StopCircle,
  FolderOpen,
} from "lucide-react";
import { useState } from "react";
import { formatCurrency, formatNumber, formatDateTime, getMessageTypeLabel, CAMPAIGN_STATUS, CANCELLABLE_STATUS_CODES, STOPPABLE_STATUS_CODES, DELETABLE_STATUS_CODES } from "@/lib/authUtils";
import { CampaignStatusBadge } from "@/components/campaign-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Campaign } from "@shared/schema";

export default function Campaigns() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [campaignToSend, setCampaignToSend] = useState<Campaign | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [campaignToCancel, setCampaignToCancel] = useState<Campaign | null>(null);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [campaignToStop, setCampaignToStop] = useState<Campaign | null>(null);
  const { toast } = useToast();

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/campaigns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "캠페인 삭제 완료",
        description: "캠페인이 성공적으로 삭제되었어요.",
      });
      setDeleteDialogOpen(false);
      setCampaignToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "삭제 실패",
        description: error.message || "캠페인 삭제에 실패했어요.",
        variant: "destructive",
      });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async ({ id, scheduledAt }: { id: string; scheduledAt?: string }) => {
      await apiRequest("POST", `/api/campaigns/${id}/submit`, { scheduledAt });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: isScheduled ? "예약 발송 완료" : "승인요청 완료",
        description: isScheduled 
          ? `${scheduleDate} ${scheduleTime}에 발송될 예정이에요.`
          : "캠페인 승인요청이 완료되었어요. 승인 후 발송됩니다.",
      });
      setSendDialogOpen(false);
      setCampaignToSend(null);
      setIsScheduled(false);
      setScheduleDate("");
      setScheduleTime("");
    },
    onError: (error: Error) => {
      toast({
        title: "승인요청 실패",
        description: error.message || "캠페인 승인요청에 실패했어요.",
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/campaigns/${id}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "캠페인 취소 완료",
        description: "캠페인이 성공적으로 취소되었어요.",
      });
      setCancelDialogOpen(false);
      setCampaignToCancel(null);
    },
    onError: (error: Error) => {
      toast({
        title: "취소 실패",
        description: error.message || "캠페인 취소에 실패했어요.",
        variant: "destructive",
      });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/campaigns/${id}/stop`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "발송 중단 완료",
        description: "캠페인 발송이 중단되었어요.",
      });
      setStopDialogOpen(false);
      setCampaignToStop(null);
    },
    onError: (error: Error) => {
      toast({
        title: "중단 실패",
        description: error.message || "캠페인 발송 중단에 실패했어요.",
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = (campaign: Campaign) => {
    setCampaignToDelete(campaign);
    setDeleteDialogOpen(true);
  };

  const handleSendClick = (campaign: Campaign) => {
    setCampaignToSend(campaign);
    setSendDialogOpen(true);
  };

  const handleCancelClick = (campaign: Campaign) => {
    setCampaignToCancel(campaign);
    setCancelDialogOpen(true);
  };

  const handleStopClick = (campaign: Campaign) => {
    setCampaignToStop(campaign);
    setStopDialogOpen(true);
  };

  // 바로 승인요청 (다이얼로그 없이)
  const handleApprovalRequest = (campaign: Campaign) => {
    sendMutation.mutate({ id: campaign.id });
  };

  const confirmDelete = () => {
    if (campaignToDelete) {
      deleteMutation.mutate(campaignToDelete.id);
    }
  };

  const confirmCancel = () => {
    if (campaignToCancel) {
      cancelMutation.mutate(campaignToCancel.id);
    }
  };

  const confirmStop = () => {
    if (campaignToStop) {
      stopMutation.mutate(campaignToStop.id);
    }
  };

  const confirmSend = () => {
    if (campaignToSend) {
      const scheduledAt = isScheduled && scheduleDate && scheduleTime 
        ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
        : undefined;
      sendMutation.mutate({ id: campaignToSend.id, scheduledAt });
    }
  };

  const filteredCampaigns = campaigns?.filter((campaign) => {
    const matchesSearch = campaign.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || campaign.statusCode?.toString() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">캠페인 목록</h1>
          <p className="text-muted-foreground mt-1">
            생성한 모든 캠페인을 관리해요
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="gap-2" data-testid="button-test-campaign">
            <Link href="/campaigns/test">
              <TestTube className="h-4 w-4" />
              테스트 발송
            </Link>
          </Button>
          <Button asChild className="gap-2" data-testid="button-new-campaign-list">
            <Link href="/campaigns/new">
              <PlusCircle className="h-4 w-4" />
              캠페인 만들기
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="캠페인 이름으로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-campaigns"
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="상태" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value={CAMPAIGN_STATUS.TEMP_REGISTERED.toString()}>임시등록</SelectItem>
                  <SelectItem value={CAMPAIGN_STATUS.APPROVAL_REQUESTED.toString()}>승인 대기</SelectItem>
                  <SelectItem value={CAMPAIGN_STATUS.APPROVED.toString()}>발송 대기</SelectItem>
                  <SelectItem value={CAMPAIGN_STATUS.SEND_PREPARATION.toString()}>발송 준비중</SelectItem>
                  <SelectItem value={CAMPAIGN_STATUS.IN_PROGRESS.toString()}>발송 중</SelectItem>
                  <SelectItem value={CAMPAIGN_STATUS.COMPLETED.toString()}>완료</SelectItem>
                  <SelectItem value={CAMPAIGN_STATUS.REJECTED.toString()}>반려</SelectItem>
                  <SelectItem value={CAMPAIGN_STATUS.CANCELLED.toString()}>취소</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-60" />
                  </div>
                  <Skeleton className="h-8 w-8" />
                </div>
              ))}
            </div>
          ) : filteredCampaigns && filteredCampaigns.length > 0 ? (
            <div className="space-y-3">
              {filteredCampaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                  data-testid={`card-campaign-${campaign.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <Link 
                        href={`/campaigns/${campaign.id}`}
                        className="font-medium hover:text-primary truncate"
                        data-testid={`link-campaign-${campaign.id}`}
                      >
                        {campaign.name}
                      </Link>
                      <CampaignStatusBadge statusCode={campaign.statusCode} />
                      <Badge variant="outline" className="text-tiny">
                        {getMessageTypeLabel(campaign.messageType)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-small text-muted-foreground">
                      <span>타겟: {formatNumber(campaign.targetCount || 0)}명</span>
                      <span>예산: {formatCurrency(parseInt(campaign.budget as string || "0"))}</span>
                      <span>생성일: {campaign.createdAt ? formatDateTime(campaign.createdAt) : '-'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {campaign.statusCode === CAMPAIGN_STATUS.TEMP_REGISTERED && (
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-2"
                        onClick={() => handleApprovalRequest(campaign)}
                        disabled={sendMutation.isPending}
                        data-testid={`button-approval-request-${campaign.id}`}
                      >
                        <FileCheck className="h-4 w-4" />
                        {sendMutation.isPending ? "요청 중..." : "승인요청"}
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          data-testid={`button-menu-${campaign.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild data-testid={`menu-view-${campaign.id}`}>
                          <Link href={`/campaigns/${campaign.id}`} className="flex items-center gap-2">
                            <Eye className="h-4 w-4" />
                            <span>상세 보기</span>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild data-testid={`menu-copy-${campaign.id}`}>
                          <Link href={`/campaigns/new?from=${campaign.id}`} className="flex items-center gap-2">
                            <FolderOpen className="h-4 w-4" />
                            <span>이 캠페인 복제하기</span>
                          </Link>
                        </DropdownMenuItem>
                        {CANCELLABLE_STATUS_CODES.includes(campaign.statusCode || 0) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-warning flex items-center gap-2"
                              onClick={(e) => {
                                e.preventDefault();
                                handleCancelClick(campaign);
                              }}
                              data-testid={`menu-cancel-${campaign.id}`}
                            >
                              <Ban className="h-4 w-4" />
                              <span>캠페인 취소</span>
                            </DropdownMenuItem>
                          </>
                        )}
                        {STOPPABLE_STATUS_CODES.includes(campaign.statusCode || 0) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive flex items-center gap-2"
                              onClick={(e) => {
                                e.preventDefault();
                                handleStopClick(campaign);
                              }}
                              data-testid={`menu-stop-${campaign.id}`}
                            >
                              <StopCircle className="h-4 w-4" />
                              <span>발송 중단</span>
                            </DropdownMenuItem>
                          </>
                        )}
                        {DELETABLE_STATUS_CODES.includes(campaign.statusCode || 0) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive flex items-center gap-2"
                              onClick={(e) => {
                                e.preventDefault();
                                handleDeleteClick(campaign);
                              }}
                              data-testid={`menu-delete-${campaign.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>삭제하기</span>
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
              icon={Megaphone}
              title={searchQuery || statusFilter !== 'all' ? "검색 결과가 없어요" : "아직 캠페인이 없어요"}
              description={searchQuery || statusFilter !== 'all' 
                ? "다른 검색어나 필터를 사용해보세요" 
                : "첫 캠페인을 만들어 고객에게 광고를 보내보세요"
              }
              action={!searchQuery && statusFilter === 'all' ? {
                label: "캠페인 만들기",
                onClick: () => window.location.href = '/campaigns/new',
              } : undefined}
            />
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>캠페인을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              "{campaignToDelete?.name}" 캠페인이 영구적으로 삭제돼요. 이 작업은 되돌릴 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "삭제 중..." : "삭제하기"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>캠페인을 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              "{campaignToCancel?.name}" 캠페인을 취소하면 더 이상 진행되지 않아요. 이 작업은 되돌릴 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-cancel">닫기</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancel}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
              disabled={cancelMutation.isPending}
              data-testid="button-confirm-cancel"
            >
              {cancelMutation.isPending ? "취소 중..." : "캠페인 취소"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>발송을 중단할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              "{campaignToStop?.name}" 캠페인의 발송을 중단하면 남은 메시지가 발송되지 않아요. 이미 발송된 메시지는 취소되지 않아요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-stop">닫기</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmStop}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={stopMutation.isPending}
              data-testid="button-confirm-stop"
            >
              {stopMutation.isPending ? "중단 중..." : "발송 중단"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>캠페인 발송하기</DialogTitle>
            <DialogDescription>
              "{campaignToSend?.name}" 캠페인을 발송할까요?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 border rounded-lg bg-muted/50">
              <div className="grid grid-cols-2 gap-2 text-small">
                <div>
                  <span className="text-muted-foreground">타겟 수:</span>
                  <span className="ml-2 font-medium">{formatNumber(campaignToSend?.targetCount || 0)}명</span>
                </div>
                <div>
                  <span className="text-muted-foreground">예산:</span>
                  <span className="ml-2 font-medium">{formatCurrency(parseInt(campaignToSend?.budget as string || "0"))}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">메시지 유형:</span>
                  <span className="ml-2 font-medium">{getMessageTypeLabel(campaignToSend?.messageType || "LMS")}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-lg space-y-4">
              <div className="flex items-center gap-3">
                <Checkbox 
                  id="schedule-checkbox"
                  checked={isScheduled} 
                  onCheckedChange={(checked) => setIsScheduled(checked === true)}
                  data-testid="checkbox-schedule-send"
                />
                <label htmlFor="schedule-checkbox" className="cursor-pointer">
                  <div className="font-medium">예약 발송</div>
                  <div className="text-small text-muted-foreground">원하는 날짜와 시간에 자동 발송해요</div>
                </label>
              </div>
              {isScheduled && (
                <div className="flex flex-col sm:flex-row gap-4 ml-6">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <Input 
                      type="date" 
                      value={scheduleDate} 
                      onChange={(e) => setScheduleDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-auto"
                      data-testid="input-schedule-date"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <Input 
                      type="time" 
                      value={scheduleTime} 
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-auto"
                      data-testid="input-schedule-time"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSendDialogOpen(false);
                setIsScheduled(false);
                setScheduleDate("");
                setScheduleTime("");
              }}
              data-testid="button-cancel-send"
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={confirmSend}
              disabled={sendMutation.isPending || (isScheduled && (!scheduleDate || !scheduleTime))}
              className="gap-2"
              data-testid="button-confirm-send"
            >
              {sendMutation.isPending ? (
                "처리 중..."
              ) : isScheduled ? (
                <>
                  <Calendar className="h-4 w-4" />
                  예약 발송
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  즉시 발송
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
  Calendar,
  Clock,
  Play,
  FileCheck,
  TestTube,
  Ban,
  StopCircle,
  FolderOpen,
  AlertCircle,
  Coins,
  CheckCircle2,
  Users,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { formatNumber, formatDateTime, getMessageTypeLabel, CAMPAIGN_STATUS, CANCELLABLE_STATUS_CODES, STOPPABLE_STATUS_CODES, DELETABLE_STATUS_CODES } from "@/lib/authUtils";
import { CampaignStatusBadge } from "@/components/campaign-status-badge";
import { EmptyState } from "@/components/empty-state";
import { AppIconTile } from "@/components/app-icon-tile";
import { featureObjectIcons } from "@/components/feature-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { BizChatErrorDialog } from "@/components/bizchat-error-dialog";
import { parseBizChatError, type BizChatErrorInfo } from "@/lib/bizchat-errors";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { calculateCampaignCredits } from "@shared/credit-policy";
import { getMinimumSendMessage } from "@/lib/credit-copy";
import type { Campaign } from "@shared/schema";

export default function Campaigns() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(5);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [campaignToSend, setCampaignToSend] = useState<Campaign | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [campaignToCancel, setCampaignToCancel] = useState<Campaign | null>(null);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [campaignToStop, setCampaignToStop] = useState<Campaign | null>(null);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorInfo, setErrorInfo] = useState<BizChatErrorInfo | null>(null);
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
        title: "발송 기록을 삭제했어요",
        description: "문자 발송 목록에서 지웠어요.",
      });
      setDeleteDialogOpen(false);
      setCampaignToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "발송 기록 삭제를 다시 확인해요",
        description: error.message || "발송 기록을 삭제하는 중 문제가 생겼어요.",
        variant: "destructive",
      });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      await apiRequest("POST", `/api/campaigns/${id}/start`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/summary"] });
      toast({
        title: "문자 발송을 시작했어요",
        description: "검수가 끝난 메시지와 발송 조건을 확인하고 발송을 시작했어요.",
      });
      setSendDialogOpen(false);
      setCampaignToSend(null);
    },
    onError: (error: Error) => {
      const { info } = parseBizChatError(error);
      setErrorInfo(info);
      setErrorDialogOpen(true);
      setSendDialogOpen(false);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/campaigns/${id}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/summary"] });
      toast({
        title: "발송을 취소했어요",
        description: "예약한 크레딧이 있으면 보유 크레딧으로 돌아와요.",
      });
      setCancelDialogOpen(false);
      setCampaignToCancel(null);
    },
    onError: (error: Error) => {
      toast({
        title: "발송 취소를 다시 확인해요",
        description: error.message || "발송을 취소하는 중 문제가 생겼어요.",
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
      queryClient.invalidateQueries({ queryKey: ["/api/credits/summary"] });
      toast({
        title: "발송을 중단했어요",
        description: "남은 발송만 멈췄어요. 이미 보낸 건의 크레딧은 사용 처리돼요.",
      });
      setStopDialogOpen(false);
      setCampaignToStop(null);
    },
    onError: (error: Error) => {
      toast({
        title: "발송 중단을 다시 확인해요",
        description: error.message || "발송을 중단하는 중 문제가 생겼어요.",
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

  // 검수 완료 템플릿은 별도 승인 없이 바로 발송 확인으로 이동해요.
  const handleApprovalRequest = (campaign: Campaign) => {
    handleSendClick(campaign);
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
      sendMutation.mutate({ id: campaignToSend.id });
    }
  };

  const hasActiveFilters = Boolean(searchQuery) || statusFilter !== "all" || periodFilter !== "all";
  const getCampaignTime = (campaign: Campaign) => {
    const time = campaign.createdAt ? new Date(campaign.createdAt).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  };
  const filteredCampaigns = campaigns
    ?.filter((campaign) => {
    const matchesSearch = campaign.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || campaign.statusCode?.toString() === statusFilter;
      const matchesPeriod =
        periodFilter === "all" ||
        getCampaignTime(campaign) >= Date.now() - Number(periodFilter) * 24 * 60 * 60 * 1000;
      return matchesSearch && matchesStatus && matchesPeriod;
    })
    .sort((a, b) => getCampaignTime(b) - getCampaignTime(a));
  const visibleCampaigns = filteredCampaigns?.slice(0, visibleCount);
  const remainingCampaignCount = Math.max((filteredCampaigns?.length || 0) - visibleCount, 0);
  const runningStatusCodes: number[] = [
    CAMPAIGN_STATUS.APPROVAL_REQUESTED,
    CAMPAIGN_STATUS.APPROVED,
    CAMPAIGN_STATUS.SEND_PREPARATION,
    CAMPAIGN_STATUS.IN_PROGRESS,
  ];
  const campaignStats = {
    total: campaigns?.length || 0,
    ready: campaigns?.filter((campaign) => campaign.statusCode === CAMPAIGN_STATUS.TEMP_REGISTERED).length || 0,
    running: campaigns?.filter((campaign) => runningStatusCodes.includes(campaign.statusCode || 0)).length || 0,
    completed: campaigns?.filter((campaign) => campaign.statusCode === CAMPAIGN_STATUS.COMPLETED).length || 0,
  };
  const campaignToSendCredits = calculateCampaignCredits({
    targetCount: campaignToSend?.targetCount || 0,
    templateCount: 1,
  });

  const getTargetingLabel = (campaign: Campaign) => {
    const summaryLabel = (campaign as any).targetingSummary?.modeLabel;
    if (summaryLabel) return summaryLabel;
    if ((campaign as any).rcvType === 1) return "방문 위치 · 바로";
    if ((campaign as any).rcvType === 2) return "방문 위치 · 모아서";
    return "기본 조건";
  };

  return (
    <div className="animate-fade-in space-y-4">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Button asChild className="h-12 gap-2 text-base" data-testid="button-new-campaign-list">
          <Link href="/campaigns/new">
            <PlusCircle className="h-4 w-4" />
            문자 보내기
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-12 gap-2 px-4 text-sm" data-testid="button-test-campaign">
          <Link href="/campaigns/test">
            <TestTube className="h-4 w-4" />
            테스트
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {[
          { label: "전체 발송", value: `${formatNumber(campaignStats.total)}개`, imageSrc: featureObjectIcons.megaphone, tone: "orange" as const },
          { label: "발송 전 확인", value: `${formatNumber(campaignStats.ready)}개`, imageSrc: featureObjectIcons.documentCheck, tone: "green" as const },
          { label: "진행 중", value: `${formatNumber(campaignStats.running)}개`, imageSrc: featureObjectIcons.clock, tone: "blue" as const },
          { label: "발송 완료", value: `${formatNumber(campaignStats.completed)}개`, imageSrc: featureObjectIcons.check, tone: "green" as const },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AppIconTile imageSrc={item.imageSrc} tone={item.tone} className="h-10 w-10 rounded-[14px]" imageClassName="h-7 w-7" />
                <div className="min-w-0">
                  <p className="truncate text-tiny text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-xl font-bold text-foreground">{item.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div>
            <CardTitle className="text-base">문자 발송 목록</CardTitle>
            <CardDescription>보낸 문자와 준비 중인 문자를 확인해요.</CardDescription>
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="문자 이름 검색"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setVisibleCount(5);
                }}
                className="min-h-11 pl-9"
                data-testid="input-search-campaigns"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 md:flex">
              <Select
                value={periodFilter}
                onValueChange={(value) => {
                  setPeriodFilter(value);
                  setVisibleCount(5);
                }}
              >
                <SelectTrigger className="min-h-11 w-full md:w-[148px]" data-testid="select-period-filter">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="기간" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 기간</SelectItem>
                  <SelectItem value="7">최근 7일</SelectItem>
                  <SelectItem value="30">최근 30일</SelectItem>
                  <SelectItem value="90">최근 90일</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setVisibleCount(5);
                }}
              >
                <SelectTrigger className="min-h-11 w-full md:w-[160px]" data-testid="select-status-filter">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="상태" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value={CAMPAIGN_STATUS.TEMP_REGISTERED.toString()}>발송 전 확인</SelectItem>
                  <SelectItem value={CAMPAIGN_STATUS.APPROVAL_REQUESTED.toString()}>발송 준비</SelectItem>
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
                <div key={i} className="flex items-center justify-between rounded-lg border p-5">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-60" />
                  </div>
                  <Skeleton className="h-8 w-8" />
                </div>
              ))}
            </div>
          ) : visibleCampaigns && visibleCampaigns.length > 0 ? (
            <div className="space-y-3">
              {visibleCampaigns.map((campaign) => {
                const campaignCredits = calculateCampaignCredits({
                  targetCount: campaign.targetCount || 0,
                  templateCount: 1,
                });
                return (
                <div
                  key={campaign.id}
                  className="rounded-lg border bg-card p-5 transition-all hover-elevate"
                  data-testid={`card-campaign-${campaign.id}`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <CampaignStatusBadge statusCode={campaign.statusCode} />
                        <Badge variant="outline" className="text-tiny">
                          {getMessageTypeLabel(campaign.messageType)}
                        </Badge>
                        {(campaign as any).creationMode === "recommended" && (
                          <Badge variant="secondary" className="text-tiny">
                            추천 메시지
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-tiny">
                          {getTargetingLabel(campaign)}
                        </Badge>
                      </div>
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        className="block truncate text-lg font-bold hover:text-primary"
                        data-testid={`link-campaign-${campaign.id}`}
                      >
                        {campaign.name}
                      </Link>
                      <div className="mt-3 grid gap-2 text-small text-muted-foreground sm:grid-cols-3">
                        <span className="flex items-center gap-1.5">
                          <Users className="h-4 w-4" />
                          {formatNumber(campaign.targetCount || 0)}명
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Coins className="h-4 w-4" />
                          {formatNumber(campaignCredits.neededCredits)}C
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4" />
                          {campaign.createdAt ? formatDateTime(campaign.createdAt) : "-"}
                        </span>
                      </div>
                      {campaign.statusCode === CAMPAIGN_STATUS.TEMP_REGISTERED && campaignCredits.isBelowMinimum && (
                        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-small text-destructive">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span>{getMinimumSendMessage(campaignCredits)}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 lg:shrink-0">
                      {campaign.statusCode === CAMPAIGN_STATUS.TEMP_REGISTERED && (
                        <Button
                          variant="default"
                          size="sm"
                          className="min-h-11 gap-2"
                          onClick={() => handleApprovalRequest(campaign)}
                          disabled={sendMutation.isPending || campaignCredits.isBelowMinimum}
                          data-testid={`button-approval-request-${campaign.id}`}
                        >
                          {sendMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileCheck className="h-4 w-4" />
                          )}
                          {sendMutation.isPending ? "시작 중..." : "발송하기"}
                        </Button>
                      )}
                      <Button variant="outline" size="sm" asChild className="min-h-11 gap-2">
                        <Link href={`/campaigns/${campaign.id}`}>
                          <Eye className="h-4 w-4" />
                          상세
                        </Link>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11"
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
                              <span>이 문자 다시 보내기</span>
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
                                <span>발송 취소</span>
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
                </div>
              )})}
              <div className="flex justify-center pt-2">
                {remainingCampaignCount > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 px-5"
                    onClick={() => setVisibleCount((count) => count + 5)}
                    data-testid="button-show-more-campaigns"
                  >
                    {formatNumber(remainingCampaignCount)}개 더 보기
                  </Button>
                ) : filteredCampaigns && filteredCampaigns.length > 5 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 px-5 text-muted-foreground"
                    onClick={() => setVisibleCount(5)}
                    data-testid="button-show-less-campaigns"
                  >
                    최근 목록만 보기
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Megaphone}
              title={hasActiveFilters ? "다른 조건으로 찾아볼 수 있어요" : "첫 문자를 보낼 수 있어요"}
              description={hasActiveFilters
                ? "다른 검색어나 필터로 다시 찾아볼 수 있어요"
                : "첫 문자를 준비해서 고객에게 광고를 보낼 수 있어요"
              }
              action={!hasActiveFilters ? {
                label: "문자 보내기",
                onClick: () => window.location.href = '/campaigns/new',
              } : undefined}
            />
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>문자 발송 기록을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              "{campaignToDelete?.name}" 발송 기록이 영구적으로 삭제돼요. 이 작업은 되돌릴 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">닫기</AlertDialogCancel>
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
            <AlertDialogTitle>발송을 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              "{campaignToCancel?.name}" 발송을 취소하면 진행을 멈춰요.
              묶인 크레딧이 있으면 보유 크레딧으로 돌아와요.
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
              {cancelMutation.isPending ? "취소 중..." : "발송 취소"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>발송을 중단할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              "{campaignToStop?.name}"의 남은 발송만 중단돼요.
              이미 보낸 메시지는 유지되고, 사용한 크레딧도 그대로 남아요.
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
            <DialogTitle>문자 발송하기</DialogTitle>
            <DialogDescription>
              "{campaignToSend?.name}" 문자를 발송할까요?
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
                  <span className="text-muted-foreground">필요 크레딧:</span>
                  <span className="ml-2 font-medium">{formatNumber(campaignToSendCredits.neededCredits)}C</span>
                </div>
                <div>
                  <span className="text-muted-foreground">메시지 유형:</span>
                  <span className="ml-2 font-medium">{getMessageTypeLabel(campaignToSend?.messageType || "LMS")}</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-small text-muted-foreground">
              발송을 시작하면 이미 보낸 문자는 취소하기 어려워요. 메시지와 받을 고객을 한 번 더 확인해요.
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSendDialogOpen(false);
              }}
              data-testid="button-cancel-send"
            >
              닫기
            </Button>
            <Button
              type="button"
              onClick={confirmSend}
              disabled={sendMutation.isPending}
              className="gap-2"
              data-testid="button-confirm-send"
            >
              {sendMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  발송을 시작하는 중...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  확인하고 발송하기
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BizChatErrorDialog
        open={errorDialogOpen}
        onOpenChange={setErrorDialogOpen}
        info={errorInfo}
        contextLabel="발송 실패"
      />
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Search,
  Filter,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  AlertTriangle,
  MessageSquare,
  Download,
  CreditCard,
} from "lucide-react";
import { useState } from "react";
import { formatNumber, formatDateTime, getMessageTypeLabel, CAMPAIGN_STATUS } from "@/lib/authUtils";
import { CampaignStatusBadge } from "@/components/campaign-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { Campaign } from "@shared/schema";
import { calculateCampaignCredits, CREDIT_POLICY } from "@shared/credit-policy";

function getRelativeTime(date: Date | string | null): string {
  if (!date) return "-";
  const now = new Date();
  const target = new Date(date);
  const diffMs = now.getTime() - target.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "방금 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 30) return `${diffDays}일 전`;
  return formatDateTime(date);
}

function getStatusIcon(statusCode: number | null) {
  switch (statusCode) {
    case CAMPAIGN_STATUS.TEMP_REGISTERED:
      return Clock;
    case CAMPAIGN_STATUS.APPROVAL_REQUESTED:
      return Clock;
    case CAMPAIGN_STATUS.APPROVED:
      return CheckCircle2;
    case CAMPAIGN_STATUS.REJECTED:
      return XCircle;
    case CAMPAIGN_STATUS.SEND_PREPARATION:
      return RefreshCw;
    case CAMPAIGN_STATUS.IN_PROGRESS:
      return Send;
    case CAMPAIGN_STATUS.COMPLETED:
      return CheckCircle2;
    case CAMPAIGN_STATUS.CANCELLED:
      return XCircle;
    default:
      return AlertTriangle;
  }
}

function formatCredit(credits: number): string {
  return `${formatNumber(credits)}C`;
}

function getCreditStatusCopy(campaign: Campaign, neededCredits: number) {
  if (campaign.statusCode === CAMPAIGN_STATUS.APPROVAL_REQUESTED || campaign.statusCode === CAMPAIGN_STATUS.APPROVED) {
    return {
      label: "예약",
      value: neededCredits,
      note: "승인/발송 전 묶인 크레딧",
    };
  }

  if (
    campaign.statusCode === CAMPAIGN_STATUS.IN_PROGRESS ||
    campaign.statusCode === CAMPAIGN_STATUS.COMPLETED ||
    campaign.statusCode === CAMPAIGN_STATUS.STOPPED
  ) {
    const attemptedCredits = calculateCampaignCredits({ targetCount: campaign.sentCount || 0 }).neededCredits;
    return {
      label: "사용",
      value: attemptedCredits,
      note: "실제 복구 내역은 크레딧 장부 기준",
    };
  }

  if (campaign.statusCode === CAMPAIGN_STATUS.CANCELLED || campaign.statusCode === CAMPAIGN_STATUS.REJECTED) {
    return {
      label: "해제",
      value: 0,
      note: "예약분은 보유 크레딧으로 반환",
    };
  }

  return {
    label: "예상",
    value: neededCredits,
    note: "발송 전 예상 크레딧",
  };
}

export default function SendHistory() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();

  const { data: campaigns, isLoading, refetch } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  const sentCampaigns = campaigns?.filter((campaign) => {
    const isSent = campaign.statusCode && campaign.statusCode >= CAMPAIGN_STATUS.APPROVAL_REQUESTED;
    const matchesSearch = campaign.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || campaign.statusCode?.toString() === statusFilter;
    return isSent && matchesSearch && matchesStatus;
  });

  const historyStats = sentCampaigns?.reduce(
    (acc, campaign) => {
      const targetCount = campaign.targetCount || 0;
      const sentCount = campaign.sentCount || 0;
      const successCount = campaign.successCount || 0;
      const neededCredits = calculateCampaignCredits({ targetCount }).neededCredits;

      acc.totalTargets += targetCount;
      acc.totalSent += sentCount;
      acc.totalSuccess += successCount;
      acc.totalNeededCredits += neededCredits;
      if (campaign.statusCode === CAMPAIGN_STATUS.COMPLETED) {
        acc.completedCount += 1;
      }
      return acc;
    },
    {
      totalTargets: 0,
      totalSent: 0,
      totalSuccess: 0,
      totalNeededCredits: 0,
      completedCount: 0,
    },
  ) || {
    totalTargets: 0,
    totalSent: 0,
    totalSuccess: 0,
    totalNeededCredits: 0,
    completedCount: 0,
  };

  const successRate = historyStats.totalSent > 0
    ? Math.round((historyStats.totalSuccess / historyStats.totalSent) * 100)
    : 0;

  const handleExport = async () => {
    try {
      const response = await fetch('/api/reports/export', {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `send-history-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "내보내기 완료",
        description: "발송 내역이 CSV 파일로 저장되었어요.",
      });
    } catch (error) {
      toast({
        title: "내보내기 실패",
        description: "발송 내역을 내보내는데 실패했어요.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">발송 내역</h1>
          <p className="mt-1 text-body-md text-muted-foreground">
            캠페인 발송 현황을 확인해요. 문자 1건 {CREDIT_POLICY.creditPerMessage}C 기준으로 계산돼요.
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2 w-fit"
          onClick={handleExport}
          data-testid="button-export"
        >
          <Download className="h-4 w-4" />
          CSV 내보내기
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-caption text-muted-foreground">발송 대상</p>
                <p className="mt-1 text-title-sm font-bold">{formatNumber(historyStats.totalTargets)}건</p>
              </div>
              <Send className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-caption text-muted-foreground">필요 크레딧</p>
                <p className="mt-1 text-title-sm font-bold">{formatCredit(historyStats.totalNeededCredits)}</p>
              </div>
              <CreditCard className="h-5 w-5 text-chart-4" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-caption text-muted-foreground">발송 완료</p>
                <p className="mt-1 text-title-sm font-bold">{formatNumber(historyStats.completedCount)}개</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-caption text-muted-foreground">성공률</p>
                <p className="mt-1 text-title-sm font-bold">{successRate}%</p>
              </div>
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
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
                data-testid="input-search-history"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => refetch()}
                data-testid="button-refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="상태" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
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
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="grid grid-cols-12 gap-4 p-4 items-center">
                  <div className="col-span-2">
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="col-span-3">
                    <Skeleton className="h-5 w-32" />
                  </div>
                  <div className="col-span-2">
                    <Skeleton className="h-6 w-16" />
                  </div>
                  <div className="col-span-3">
                    <Skeleton className="h-4 w-full" />
                  </div>
                  <div className="col-span-2">
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : sentCampaigns && sentCampaigns.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-muted/50 text-caption font-medium text-muted-foreground border-b">
                  <div className="col-span-2">생성일</div>
                  <div className="col-span-3">상태</div>
                  <div className="col-span-2">타입</div>
                  <div className="col-span-3">크레딧/현황</div>
                  <div className="col-span-2">최근 업데이트</div>
                </div>
                <div className="divide-y">
                  {sentCampaigns.map((campaign) => {
                    const StatusIcon = getStatusIcon(campaign.statusCode);
                    const totalCount = campaign.targetCount || 0;
                    const sentCount = campaign.sentCount || 0;
                    const successCount = campaign.successCount || 0;
                    const failedCount = Math.max(0, sentCount - successCount);
                    const pendingCount = Math.max(0, totalCount - sentCount);
                    const progressPercent = totalCount > 0 ? Math.min(100, (sentCount / totalCount) * 100) : 0;
                    const neededCredits = calculateCampaignCredits({ targetCount: totalCount }).neededCredits;
                    const creditStatus = getCreditStatusCopy(campaign, neededCredits);

                    return (
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        key={campaign.id}
                        className="grid grid-cols-12 gap-4 px-4 py-4 items-center hover-elevate cursor-pointer group"
                        data-testid={`row-history-${campaign.id}`}
                      >
                        <div className="col-span-2">
                          <span className="text-caption font-medium group-hover:text-primary">
                            {campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString('ko-KR', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            }) : '-'}
                          </span>
                        </div>

                        <div className="col-span-3">
                          <div className="flex items-center gap-2">
                            <StatusIcon className="h-4 w-4 text-muted-foreground" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-caption text-muted-foreground">
                                  총 {formatNumber(totalCount)}건
                                </span>
                                <CampaignStatusBadge statusCode={campaign.statusCode} />
                              </div>
                              <span className="block truncate text-body-md font-medium group-hover:text-primary">
                                {campaign.name}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="col-span-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-tiny">
                              API
                            </Badge>
                            <Badge variant="secondary" className="text-tiny">
                              {getMessageTypeLabel(campaign.messageType)}
                            </Badge>
                          </div>
                          <p className="mt-2 text-tiny text-muted-foreground">
                            문자 1건 {CREDIT_POLICY.creditPerMessage}C
                          </p>
                        </div>

                        <div className="col-span-3">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-tiny">
                              <span className="font-medium text-foreground">
                                {creditStatus.label} {formatCredit(creditStatus.value)}
                              </span>
                              <span className="text-muted-foreground">
                                {formatNumber(sentCount)} / {formatNumber(totalCount)}건
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-tiny">
                              <span className="text-destructive">
                                실패 {formatNumber(failedCount)}
                              </span>
                              <span className="text-success">
                                성공 {formatNumber(successCount)}
                              </span>
                              <span className="text-muted-foreground">
                                대기 {formatNumber(pendingCount)}
                              </span>
                            </div>
                            <Progress
                              value={progressPercent}
                              className="h-1.5"
                            />
                            <p className="text-[11px] leading-4 text-muted-foreground">
                              {creditStatus.note}
                            </p>
                          </div>
                        </div>

                        <div className="col-span-2">
                          <span className="text-caption text-muted-foreground">
                            {getRelativeTime(campaign.updatedAt || campaign.createdAt)}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6">
              <EmptyState
                icon={MessageSquare}
                title={searchQuery || statusFilter !== 'all' ? "다른 조건으로 찾아볼 수 있어요" : "발송 후 내역을 확인할 수 있어요"}
                description={searchQuery || statusFilter !== 'all'
                  ? "다른 검색어나 필터로 다시 찾아볼 수 있어요"
                  : "캠페인을 발송하면 여기에 발송 내역을 표시해요"
                }
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

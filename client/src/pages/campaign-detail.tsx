import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useRoute, useLocation } from "wouter";
import {
  ArrowLeft,
  Send,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  MessageSquare,
  Target,
  Coins,
  BarChart3,
  AlertCircle,
  RefreshCw,
  Download,
  Loader2,
  FileCheck
} from "lucide-react";
import { CAMPAIGN_STATUS, formatNumber, formatDateTime, getMessageTypeLabel } from "@/lib/authUtils";
import { CampaignStatusBadge } from "@/components/campaign-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { BizChatErrorDialog } from "@/components/bizchat-error-dialog";
import { parseBizChatError, type BizChatErrorInfo } from "@/lib/bizchat-errors";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { calculateCampaignCredits } from "@shared/credit-policy";
import { CREDIT_COPY, getCreditShortageMessage, getMinimumSendMessage } from "@/lib/credit-copy";
import { trackFunnelEvent } from "@/lib/funnel-events";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Campaign, Message, Targeting, Report } from "@shared/schema";

interface CampaignDetail extends Campaign {
  message?: Message;
  targeting?: Targeting;
  report?: Report;
}

const GENDER_LABELS: Record<string, string> = {
  all: "전체",
  male: "남성",
  female: "여성",
};

const VARIABLE_LABELS: Record<string, string> = {
  brandname: "브랜드명",
  brand: "브랜드명",
  companyname: "회사명",
  company: "회사명",
  eventname: "이벤트명",
  event: "이벤트명",
  benefit: "혜택",
  period: "기간",
  daterange: "기간",
  startdate: "시작일",
  enddate: "종료일",
  url: "URL",
  link: "URL",
  place: "장소",
  location: "장소",
  phone: "연락처",
  tel: "연락처",
};

function getVariableLabel(key: string) {
  return VARIABLE_LABELS[key.toLowerCase()] || key;
}

function formatVariableValue(value: unknown) {
  if (value && typeof value === "object" && ("start" in value || "end" in value)) {
    const range = value as { start?: string; end?: string };
    return [range.start, range.end].filter(Boolean).join(" ~ ") || "-";
  }
  return value === undefined || value === null || String(value).trim() === "" ? "-" : String(value);
}

function parseTargetingItems(values?: string[] | null) {
  return (values || [])
    .map((value) => {
      try {
        const parsed = JSON.parse(value);
        return typeof parsed === "object" && parsed ? parsed as Record<string, unknown> : { name: value };
      } catch {
        return { name: value };
      }
    })
    .filter(Boolean);
}

function getTargetingItemLabel(item: Record<string, unknown>) {
  return String(item.name || item.label || item.title || item.code || "").trim();
}

function getTargetingModeLabel(campaign: CampaignDetail, targeting?: Targeting) {
  if (campaign.rcvType === 1) return "방문 위치로 찾기 · 바로 보내기";
  if (campaign.rcvType === 2) return "방문 위치로 찾기 · 모아서 보내기";

  const locationTypeCount = parseTargetingItems((targeting as any)?.locationTypes).length;
  const interestCount =
    ((targeting as any)?.shopping11stCategories?.length || 0) +
    ((targeting as any)?.webappCategories?.length || 0) +
    ((targeting as any)?.callUsageTypes?.length || 0) +
    locationTypeCount +
    ((targeting as any)?.profiling?.length || 0);

  if (locationTypeCount > 0) return `위치로 찾기 · ${locationTypeCount}개 조건`;
  if (interestCount > 0) return `관심사로 찾기 · ${interestCount}개 조건`;
  if (campaign.creationMode === "recommended") return "추천 타겟 사용";
  return "기본 조건 사용";
}

function getVariableSummary(variableValues: unknown) {
  if (!variableValues || typeof variableValues !== "object" || Array.isArray(variableValues)) return [];
  return Object.entries(variableValues as Record<string, unknown>)
    .filter(([key]) => Boolean(key))
    .map(([key, value]) => ({
      key,
      label: getVariableLabel(key),
      value: formatVariableValue(value),
    }));
}

function isDraftLikeCampaign(campaign: CampaignDetail) {
  return (
    campaign.status === "draft" ||
    campaign.status === "temp_registered" ||
    campaign.statusCode === CAMPAIGN_STATUS.TEMP_REGISTERED
  );
}

interface BizChatStatsData {
  statDate: string;           // 통계 수집 일자 YYYYMMDD
  mdnCnt: number;             // 발송 대상자 수
  dupExcludeCnt: number;      // 타 캠페인 수신자 수
  adRcvExcludeCnt: number;    // 광고 수신 미동의 수신자 수
  sendTryCnt: number;         // 발송 시도자 수
  msgRecvCnt: number;         // 캠페인 메시지 수신자 수 (RCS + VMG)
  rcsMsgRecvCnt: number;      // RCS 메시지 수신자 수
  vmgMsgRecvCnt: number;      // 일반 메시지 수신자 수
  msgNotRecvCnt: number;      // 메시지 미수신자 수
  msgReactCnt: number;        // 메시지 반응자 수
  msgReactRatio: string;      // 메시지 반응률
  rcsMsgReactCnt: number;     // RCS 메시지 반응자 수
  rcsMsgReactRatio: string;   // RCS 메시지 반응률
  vmgMsgReactCnt: number;     // 일반 메시지 반응자 수
  vmgMsgReactRatio: string;   // 일반 메시지 반응률
  rcsMsgReadCnt: number;      // RCS 메시지 확인자 수
  rcsMsgReadRatio: string;    // RCS 메시지 확인률
  url?: {
    list: Array<{
      msgType: number;
      slideNum: number;
      linkType: number;
      linkNum: number;
      cnt: number;
    }>;
  };
}

interface BizChatStats {
  success: boolean;
  data?: BizChatStatsData;
  meta?: {
    campaignId: string;
    bizchatCampaignId: string;
    refreshedAt: string;
  };
  error?: string;
}

interface CreditSummary {
  enabled: boolean;
  effectiveAvailableCredits: number;
  reservedCredits: number;
}

export default function CampaignDetail() {
  const [, params] = useRoute("/campaigns/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const campaignId = params?.id || null;
  const [bizChatStats, setBizChatStats] = useState<BizChatStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorInfo, setErrorInfo] = useState<BizChatErrorInfo | null>(null);

  const { data: campaign, isLoading, error } = useQuery<CampaignDetail>({
    queryKey: ["/api/campaigns", campaignId],
    enabled: !!campaignId,
  });

  const { data: creditSummary } = useQuery<CreditSummary>({
    queryKey: ["/api/credits/summary"],
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/campaigns/${campaignId}/submit`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/summary"] });
      toast({
        title: "발송 요청을 확인했어요",
        description: "캠페인 발송 조건을 확인했어요.",
      });
    },
    onError: (error: Error) => {
      const { info } = parseBizChatError(error);
      setErrorInfo(info);
      setErrorDialogOpen(true);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/campaigns/${campaignId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "발송 기록을 삭제했어요",
        description: "문자 발송 목록에서 지웠어요.",
      });
      navigate("/campaigns/history");
    },
    onError: (error: Error) => {
      toast({
        title: "캠페인 삭제를 다시 확인해요",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/campaigns/${campaignId}/approve`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/summary"] });
      toast({
        title: "심사를 승인했어요",
        description: "필요한 크레딧을 확인한 뒤 발송할 수 있어요.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "승인을 다시 확인해요",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/campaigns/${campaignId}/cancel`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/summary"] });
      toast({
        title: "발송을 취소했어요",
        description: "발송용으로 묶어둔 크레딧이 있으면 보유 크레딧으로 돌아와요.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "캠페인 취소를 다시 확인해요",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/campaigns/${campaignId}/start`);
      return response.json();
    },
    onSuccess: () => {
      trackFunnelEvent({
        eventName: "send_started",
        funnelStep: "send",
        campaignId: campaignId || undefined,
        metadata: {
          targetCount: campaign?.targetCount,
          neededCredits: creditEstimate.neededCredits,
          source: "campaign_detail",
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/summary"] });
      toast({
        title: "발송 시작",
        description: "캠페인 발송을 시작했어요. 잠시 후 결과를 확인할 수 있어요.",
      });
    },
    onError: (error: Error) => {
      trackFunnelEvent({
        eventName: "send_failed",
        funnelStep: "send",
        campaignId: campaignId || undefined,
        metadata: {
          targetCount: campaign?.targetCount,
          neededCredits: creditEstimate.neededCredits,
          source: "campaign_detail",
          reason: error.message,
        },
      });
      toast({
        title: "발송을 다시 확인해요",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const fetchBizChatStats = async () => {
    if (!campaign?.bizchatCampaignId) {
      toast({
        title: "캠페인 발송 후 통계를 볼 수 있어요",
        description: "캠페인을 먼저 발송하면 BizChat 통계를 확인할 수 있어요.",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingStats(true);
    try {
      const response = await apiRequest("POST", "/api/bizchat/stats", {
        action: "fetchStats",
        campaignId: campaign.id,
      });
      const data = await response.json();
      setBizChatStats(data);

      if (data.success) {
        const stats = data.data;
        toast({
          title: "통계 조회 완료",
          description: `발송 ${formatNumber(stats?.sendTryCnt || 0)}건, 수신 ${formatNumber(stats?.msgRecvCnt || 0)}건`,
        });
      } else {
        toast({
          title: "통계를 다시 불러와요",
          description: data.error || "통계를 가져오는 중 문제가 생겼어요.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "통계를 다시 불러와요",
        description: "서버와 연결하는 중 문제가 생겼어요.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingStats(false);
    }
  };



  if (isLoading) {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="animate-fade-in">
        <EmptyState
          icon={AlertCircle}
          title="문자 발송 목록에서 다시 확인해요"
          description="캠페인이 삭제됐거나 접근 권한이 달라졌을 수 있어요"
          action={{
            label: "발송 목록으로",
            onClick: () => navigate("/campaigns/history"),
          }}
        />
      </div>
    );
  }

  const isDraftLike = isDraftLikeCampaign(campaign);
  const isRejected = campaign.status === "rejected";
  const canEdit = isDraftLike || isRejected;
  const canSubmit = isDraftLike || isRejected;
  const canDelete = isDraftLike;
  const canStart =
    canSubmit ||
    campaign.status === "pending" ||
    campaign.status === "approval_requested" ||
    campaign.status === "approved";
  const canCancelBeforeSend = ["pending", "approval_requested", "approved"].includes(campaign.status || "");
  const sentCount = campaign.sentCount || 0;
  const successCount = campaign.successCount || 0;
  const successRate = sentCount > 0 ? Math.round((successCount / sentCount) * 100) : 0;
  const legacyBalance = Number.parseFloat(String(user?.balance ?? "0")) || 0;
  const availableCredits = creditSummary?.enabled
    ? Number(creditSummary.effectiveAvailableCredits ?? 0)
    : legacyBalance;
  const creditEstimate = calculateCampaignCredits(
    { targetCount: campaign.targetCount || 0, templateCount: 1 },
    availableCredits,
  );
  const reservedCredits = Number(creditSummary?.reservedCredits ?? 0);
  const hasReservedCredits =
    creditSummary?.enabled &&
    ["approval_requested", "pending", "approved"].includes(campaign.status || "") &&
    reservedCredits >= creditEstimate.neededCredits &&
    creditEstimate.neededCredits > 0;
  const hasUsedCredits =
    creditSummary?.enabled &&
    ["running", "completed", "stopped"].includes(campaign.status || "") &&
    creditEstimate.neededCredits > 0;
  const isCancelled = campaign.status === "cancelled";
  const remainingCredits = hasReservedCredits || hasUsedCredits || isCancelled
    ? availableCredits
    : Math.max(0, availableCredits - creditEstimate.neededCredits);
  const creditAmountLabel = hasReservedCredits
    ? "묶인 크레딧"
    : hasUsedCredits
      ? "사용 크레딧"
      : "필요 크레딧";
  const remainingCreditLabel = isCancelled
    ? "현재 보유"
    : hasReservedCredits || hasUsedCredits
    ? "발송 후 보유"
    : "발송 후 잔여";
  const canSendWithCredits =
    !creditEstimate.isBelowMinimum &&
    (hasReservedCredits || creditEstimate.shortageCredits === 0);
  const nextAction = (() => {
    if (isDraftLike || isRejected) {
      return {
        title: "발송 전 확인만 남았어요",
        description: "받을 고객, 차감 크레딧, 발신번호를 확인한 뒤 발송해요.",
        tone: "bg-emerald-50 border-emerald-100 text-emerald-700",
        icon: Send,
      };
    }
    if (campaign.status === "pending" || campaign.status === "approval_requested") {
      return {
        title: "발송 전 확인만 남았어요",
        description: hasReservedCredits
          ? `${formatNumber(creditEstimate.neededCredits)}C를 발송용으로 묶어두었어요. 발송하기를 누르면 이 크레딧을 사용해요.`
          : "발송하기 전에 받을 고객과 차감 크레딧을 다시 확인해요.",
        tone: "bg-emerald-50 border-emerald-100 text-emerald-700",
        icon: Send,
      };
    }
    if (campaign.status === "approved") {
      if (hasReservedCredits) {
        return {
          title: "발송 크레딧을 준비했어요",
          description: `${formatNumber(creditEstimate.neededCredits)}C를 발송용으로 묶어두었어요. 발송하기를 누르면 이 크레딧을 사용해요.`,
          tone: "bg-emerald-50 border-emerald-100 text-emerald-700",
          icon: CheckCircle2,
        };
      }
      if (creditEstimate.isBelowMinimum) {
        return {
          title: "최소 발송 기준을 확인해요",
          description: getMinimumSendMessage(creditEstimate),
          tone: "bg-amber-50 border-amber-100 text-amber-700",
          icon: AlertCircle,
        };
      }
      if (!canSendWithCredits) {
        return {
          title: "크레딧을 충전하면 발송할 수 있어요",
          description: getCreditShortageMessage(creditEstimate),
          tone: "bg-red-50 border-red-100 text-red-700",
          icon: Coins,
        };
      }
      return {
        title: "발송 전 확인만 남았어요",
        description: "필요 크레딧이 충분해요. 확인 창에서 한 번 더 확인한 뒤 발송해요.",
        tone: "bg-emerald-50 border-emerald-100 text-emerald-700",
        icon: CheckCircle2,
      };
    }
    if (campaign.status === "running") {
      return {
        title: "발송이 진행 중이에요",
        description: "잠시 후 발송 결과와 성과를 이 화면에서 확인할 수 있어요.",
        tone: "bg-blue-50 border-blue-100 text-blue-700",
        icon: Send,
      };
    }
    if (campaign.status === "completed") {
      return {
        title: "발송을 완료했어요",
        description: "아래 성과 탭에서 결과를 확인해요. 복구 내역이 있으면 크레딧 장부에 따로 표시돼요.",
        tone: "bg-slate-50 border-slate-100 text-slate-700",
        icon: BarChart3,
      };
    }
    if (campaign.status === "stopped") {
      return {
        title: "발송이 중단됐어요",
        description: "이미 발송 시도된 건은 사용 처리돼요. 미처리 잔여분 복구 여부는 크레딧 장부에서 확인할 수 있어요.",
        tone: "bg-amber-50 border-amber-100 text-amber-700",
        icon: AlertCircle,
      };
    }
    if (campaign.status === "cancelled") {
      return {
        title: "캠페인이 취소됐어요",
        description: "발송용으로 묶어둔 크레딧이 있었다면 보유 크레딧으로 돌아와요.",
        tone: "bg-slate-50 border-slate-100 text-slate-700",
        icon: XCircle,
      };
    }
    return {
      title: "캠페인 상태를 확인해요",
      description: "현재 상태에 맞는 다음 작업을 안내할게요.",
      tone: "bg-slate-50 border-slate-100 text-slate-700",
      icon: AlertCircle,
    };
  })();
  const NextActionIcon = nextAction.icon;

  const targeting = campaign.targeting;
  const message = campaign.message;
  const targetingModeLabel = getTargetingModeLabel(campaign, targeting);
  const locationTargetItems = parseTargetingItems((targeting as any)?.locationTypes);
  const locationTargetLabels = locationTargetItems
    .map(getTargetingItemLabel)
    .filter(Boolean);
  const variableSummary = getVariableSummary(campaign.variableValues);

  const startedAtLabel = campaign.scheduledAt
    ? formatDateTime(campaign.scheduledAt)
    : ["running", "completed", "stopped"].includes(campaign.status || "")
      ? "발송을 시작했어요"
      : "발송하기를 누르면 시작해요";
  const campaignTimeline = [
    {
      label: "문자 준비",
      done: true,
      description: campaign.createdAt ? formatDateTime(campaign.createdAt) : "-",
    },
    {
      label: "발송 조건 확인",
      done: !canSubmit,
      description: canSubmit ? "확인하면 발송할 수 있어요" : "확인했어요",
    },
    {
      label: "발송 진행",
      done: ["approved", "running", "completed", "stopped"].includes(campaign.status || ""),
      description: startedAtLabel,
    },
    {
      label: "결과 확인",
      done: ["completed", "stopped"].includes(campaign.status || ""),
      description: sentCount > 0 ? `${formatNumber(sentCount)}건 발송했어요` : "발송 후 확인할 수 있어요",
    },
  ];

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild className="mt-1 h-10 w-10 shrink-0" data-testid="button-back">
            <Link href="/campaigns/history">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold md:text-3xl" data-testid="text-campaign-name">
                {campaign.name}
              </h1>
              <CampaignStatusBadge status={campaign.status} />
            </div>
            <p className="mt-1 text-small text-muted-foreground" data-testid="text-campaign-meta">
              {getMessageTypeLabel(campaign.messageType)} · 생성: {formatDateTime(campaign.createdAt!)}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          {canEdit && (
            <Button variant="outline" asChild className="h-11 gap-2" data-testid="button-edit">
              <Link href={`/campaigns/${campaign.id}/edit`}>
                <Edit className="h-4 w-4" />
                수정
              </Link>
            </Button>
          )}
          {canStart && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  className="h-11 gap-2 sm:min-w-[150px]"
                  disabled={!canSendWithCredits || startMutation.isPending}
                  onClick={() => {
                    trackFunnelEvent({
                      eventName: "send_confirm_opened",
                      funnelStep: "send",
                      campaignId: campaignId || undefined,
                      metadata: {
                        targetCount: campaign.targetCount,
                        neededCredits: creditEstimate.neededCredits,
                        source: "campaign_detail",
                      },
                    });
                  }}
                  data-testid="button-start"
                >
                  <Send className="h-4 w-4" />
                  발송하기
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>문자를 발송할까요?</AlertDialogTitle>
                  <AlertDialogDescription>
                    "{campaign.name}" 문자를 {formatNumber(campaign.targetCount)}명에게 발송해요.
                    {hasReservedCredits
                      ? ` 발송용으로 묶어둔 ${formatNumber(creditEstimate.neededCredits)}C를 사용해요.`
                      : ` 필요 크레딧은 ${formatNumber(creditEstimate.neededCredits)}C이고, 발송 후 ${formatNumber(remainingCredits)}C가 남아요.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>닫기</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      trackFunnelEvent({
                        eventName: "send_submitted",
                        funnelStep: "send",
                        campaignId: campaignId || undefined,
                        metadata: {
                          targetCount: campaign.targetCount,
                          neededCredits: creditEstimate.neededCredits,
                          source: "campaign_detail",
                        },
                      });
                      startMutation.mutate();
                    }}
                    disabled={startMutation.isPending}
                  >
                    {startMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        발송을 시작하는 중...
                      </>
                    ) : (
                      "발송하기"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        {(canCancelBeforeSend || canDelete) && (
          <div className="flex justify-end gap-1">
          {canCancelBeforeSend && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-9 gap-1.5 px-2 text-caption text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  data-testid="button-cancel-campaign"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  발송 전 취소
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>발송을 취소할까요?</AlertDialogTitle>
                  <AlertDialogDescription>
                    "{campaign.name}" 문자의 진행을 멈춰요.
                    {hasReservedCredits
                      ? ` 발송용으로 묶어둔 ${formatNumber(creditEstimate.neededCredits)}C는 보유 크레딧으로 돌아와요.`
                      : " 아직 크레딧을 사용하지 않았어요."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>닫기</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {cancelMutation.isPending ? "취소 중..." : "취소하기"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="h-9 gap-1.5 px-2 text-caption text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid="button-delete">
                  <Trash2 className="h-3.5 w-3.5" />
                  삭제
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>문자 발송 기록을 삭제할까요?</AlertDialogTitle>
                  <AlertDialogDescription>
                    이 작업은 되돌릴 수 없어요. "{campaign.name}" 발송 기록을 영구적으로 삭제해요.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>닫기</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    삭제하기
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          </div>
        )}
        </div>
        {canStart && !canSendWithCredits && (
          <p className="text-small text-amber-700" data-testid="text-start-disabled-reason">
            {creditEstimate.isBelowMinimum
              ? getMinimumSendMessage(creditEstimate)
              : getCreditShortageMessage(creditEstimate)}
          </p>
        )}
        </div>

      <Card className={`overflow-hidden border ${nextAction.tone}`}>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-white/80 p-3 shadow-sm">
                <NextActionIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-caption font-semibold">최종 확인</p>
                <h2 className="mt-1 text-xl font-bold md:text-2xl">{nextAction.title}</h2>
                <p className="mt-1 text-small opacity-80">{nextAction.description}</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-white/80 px-3 py-3">
                <p className="text-caption opacity-70">{hasReservedCredits ? creditAmountLabel : "차감 예정"}</p>
                <p className="text-lg font-bold">{formatNumber(creditEstimate.neededCredits)}C</p>
              </div>
              <div className="rounded-xl bg-white/80 px-3 py-3">
                <p className="text-caption opacity-70">{remainingCreditLabel}</p>
                <p className="text-lg font-bold">{formatNumber(remainingCredits)}C</p>
              </div>
              <div className="rounded-xl bg-white/80 px-3 py-3">
                <p className="text-caption opacity-70">받을 고객</p>
                <p className="text-lg font-bold">{formatNumber(campaign.targetCount)}명</p>
              </div>
            </div>
          </div>

          {(creditEstimate.isBelowMinimum || (!hasReservedCredits && !hasUsedCredits && creditEstimate.shortageCredits > 0)) && (
            <div className="mt-4 flex flex-col gap-3 rounded-lg bg-white/80 p-3 text-body-md sm:flex-row sm:items-center sm:justify-between">
              <span>
                {CREDIT_COPY.messageUnit} {CREDIT_COPY.minimumSend}
              </span>
              {!hasReservedCredits && !hasUsedCredits && creditEstimate.shortageCredits > 0 && (
                <Button size="sm" asChild data-testid="link-charge-credit-from-campaign">
                  <Link href="/billing">크레딧 충전</Link>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList data-testid="tabs-campaign-detail">
          <TabsTrigger value="overview" data-testid="tab-overview">요약</TabsTrigger>
          <TabsTrigger value="message" data-testid="tab-message">메시지</TabsTrigger>
          <TabsTrigger value="targeting" data-testid="tab-targeting">대상</TabsTrigger>
          <TabsTrigger value="report" data-testid="tab-report">리포트</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                진행 상태
              </CardTitle>
              <CardDescription>발송 전에는 준비 상태만 간단히 확인해요.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-4">
                {campaignTimeline.map((item, index) => (
                  <div
                    key={item.label}
                    className={`rounded-lg border p-4 ${
                      item.done ? "border-success/20 bg-success/5" : "bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-full text-tiny font-bold ${
                        item.done ? "bg-success text-success-foreground" : "bg-card text-muted-foreground"
                      }`}>
                        {item.done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                      </div>
                      <p className="font-semibold">{item.label}</p>
                    </div>
                    <p className="mt-2 text-small text-muted-foreground">{item.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {campaign.rejectionReason && (
            <Card className="border-destructive/20 bg-destructive/5">
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="font-medium text-destructive">반려 사유</span>
                </div>
                <p className="text-small" data-testid="text-rejection-reason">{campaign.rejectionReason}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="message" className="space-y-4">
          {message ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    {campaign.messageType === 'RCS' ? 'RCS 메시지' : '메시지 상세'}
                  </CardTitle>
                  <CardDescription>
                    {campaign.messageType === 'RCS'
                      ? 'RCS 지원 단말에 발송되는 메시지입니다'
                      : `${getMessageTypeLabel(campaign.messageType)} 형식의 메시지입니다`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-4">
                      {message.title && (
                        <div>
                          <p className="text-small text-muted-foreground mb-1">제목</p>
                          <p className="font-medium text-h3">{message.title}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-small text-muted-foreground mb-1">본문</p>
                        <div className="p-4 bg-muted rounded-lg">
                          <p className="whitespace-pre-wrap" data-testid="text-message-content">
                            {message.content}
                          </p>
                        </div>
                        <p className="text-tiny text-muted-foreground mt-2">
                          {message.content?.length || 0} / 2000자
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <div className="w-64 h-[480px] bg-gray-900 rounded-[2rem] p-3 shadow-xl">
                        <div className="w-full h-full bg-white dark:bg-gray-100 rounded-[1.5rem] overflow-hidden flex flex-col">
                          <div className="bg-gray-200 dark:bg-gray-300 p-3 text-center text-tiny text-gray-600">
                            {campaign.messageType === 'RCS' ? 'RCS 미리보기' : '메시지 미리보기'}
                          </div>
                          <div className="flex-1 p-4 overflow-auto">
                            <div className="bg-gray-100 dark:bg-gray-200 rounded-lg p-3 text-small text-gray-800">
                              {message.title && (
                                <p className="font-bold mb-2">{message.title}</p>
                              )}
                              <p className="whitespace-pre-wrap">{message.content}</p>
                              {message.imageUrl && (
                                <img
                                  src={message.imageUrl}
                                  alt="첨부 이미지"
                                  className="mt-3 rounded-lg max-w-full"
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {campaign.messageType === 'RCS' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-muted-foreground" />
                      LMS 폴백 메시지
                    </CardTitle>
                    <CardDescription>
                      RCS를 지원하지 않는 단말에 대체 발송되는 문자 메시지입니다
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(message as any).lmsContent ? (
                      <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-small text-muted-foreground">본문</p>
                              <Badge variant="outline" className="text-tiny">별도 설정됨</Badge>
                            </div>
                            <div className="p-4 bg-muted rounded-lg">
                              <p className="whitespace-pre-wrap" data-testid="text-lms-content">
                                {(message as any).lmsContent}
                              </p>
                            </div>
                            <p className="text-tiny text-muted-foreground mt-2">
                              {((message as any).lmsContent as string)?.length || 0} / 2000자
                            </p>
                          </div>
                        </div>
                        <div className="flex justify-center">
                          <div className="w-64 h-[480px] bg-gray-900 rounded-[2rem] p-3 shadow-xl">
                            <div className="w-full h-full bg-white dark:bg-gray-100 rounded-[1.5rem] overflow-hidden flex flex-col">
                              <div className="bg-gray-200 dark:bg-gray-300 p-3 text-center text-tiny text-gray-600">
                                LMS 폴백 미리보기
                              </div>
                              <div className="flex-1 p-4 overflow-auto">
                                <div className="bg-gray-100 dark:bg-gray-200 rounded-lg p-3 text-small text-gray-800">
                                  {message.title && (
                                    <p className="font-bold mb-2">{message.title}</p>
                                  )}
                                  <p className="whitespace-pre-wrap">{(message as any).lmsContent}</p>
                                  {(message as any).lmsImageUrl && (
                                    <img
                                      src={(message as any).lmsImageUrl}
                                      alt="LMS 첨부 이미지"
                                      className="mt-3 rounded-lg max-w-full"
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-muted/50 rounded-lg border border-dashed">
                        <p className="text-small text-muted-foreground" data-testid="text-lms-fallback-info">
                          별도 LMS 폴백 메시지를 설정하지 않았어요. RCS 메시지 내용으로 LMS를 대신 발송해요.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="p-6">
                <EmptyState
                  icon={MessageSquare}
                  title="메시지를 확인할 수 있어요"
                  description="캠페인에 메시지를 연결하면 여기에서 확인해요"
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="targeting">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                받을 고객
              </CardTitle>
              <CardDescription>
                캠페인을 받을 고객 조건을 확인해요.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {targeting ? (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-small text-muted-foreground mb-1">선택 방식</p>
                      <p className="text-h3 font-bold" data-testid="text-targeting-mode">
                        {targetingModeLabel}
                      </p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-small text-muted-foreground mb-1">성별</p>
                      <p className="text-h3 font-bold">{GENDER_LABELS[targeting.gender || "all"]}</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-small text-muted-foreground mb-1">연령대</p>
                      <p className="text-h3 font-bold">{targeting.ageMin || 0}~{targeting.ageMax || 100}세</p>
                    </div>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-small text-muted-foreground mb-1">타겟 수신자</p>
                    <p className="text-h3 font-bold text-primary">
                      {formatNumber(campaign.targetCount)}명
                    </p>
                  </div>

                  {targeting.regions && targeting.regions.length > 0 && (
                    <div>
                      <p className="text-small text-muted-foreground mb-2">지역</p>
                      <div className="flex flex-wrap gap-2">
                        {targeting.regions.map((region, idx) => (
                          <Badge key={idx} variant="outline">{region}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {locationTargetLabels.length > 0 && (
                    <div>
                      <p className="text-small text-muted-foreground mb-2">상세 위치</p>
                      <div className="flex flex-wrap gap-2">
                        {locationTargetLabels.map((location, idx) => (
                          <Badge key={`${location}-${idx}`} variant="outline" data-testid={`badge-detail-location-${idx}`}>
                            {location}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              ) : (
                <EmptyState
                  icon={Target}
                  title="타겟팅을 확인할 수 있어요"
                  description="캠페인에 타겟팅을 연결하면 여기에서 확인해요"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="report" className="space-y-4">
          {campaign.bizchatCampaignId && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-h3">
                    <Send className="h-5 w-5 text-primary" />
                    BizChat 실시간 통계
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchBizChatStats}
                    disabled={isLoadingStats}
                    className="gap-2"
                    data-testid="button-fetch-bizchat-stats"
                  >
                    {isLoadingStats ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    통계 조회
                  </Button>
                </div>
                <CardDescription>
                  BizChat 캠페인 ID: {campaign.bizchatCampaignId}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {bizChatStats?.success && bizChatStats.data ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="text-center p-3 bg-background rounded-lg border">
                        <p className="text-2xl font-bold text-primary">
                          {formatNumber(bizChatStats.data.mdnCnt || 0)}
                        </p>
                        <p className="text-tiny text-muted-foreground">발송 대상자</p>
                      </div>
                      <div className="text-center p-3 bg-background rounded-lg border">
                        <p className="text-2xl font-bold text-chart-4">
                          {formatNumber(bizChatStats.data.sendTryCnt || 0)}
                        </p>
                        <p className="text-tiny text-muted-foreground">발송 시도</p>
                      </div>
                      <div className="text-center p-3 bg-background rounded-lg border">
                        <p className="text-2xl font-bold text-success">
                          {formatNumber(bizChatStats.data.msgRecvCnt || 0)}
                        </p>
                        <p className="text-tiny text-muted-foreground">수신 성공</p>
                      </div>
                      <div className="text-center p-3 bg-background rounded-lg border">
                        <p className="text-2xl font-bold text-destructive">
                          {formatNumber(bizChatStats.data.msgNotRecvCnt || 0)}
                        </p>
                        <p className="text-tiny text-muted-foreground">수신 실패</p>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="text-center p-3 bg-background rounded-lg border">
                        <p className="text-2xl font-bold text-chart-5">
                          {formatNumber(bizChatStats.data.rcsMsgRecvCnt || 0)}
                        </p>
                        <p className="text-tiny text-muted-foreground">RCS 수신</p>
                      </div>
                      <div className="text-center p-3 bg-background rounded-lg border">
                        <p className="text-2xl font-bold text-chart-3">
                          {formatNumber(bizChatStats.data.vmgMsgRecvCnt || 0)}
                        </p>
                        <p className="text-tiny text-muted-foreground">일반 수신 (VMG)</p>
                      </div>
                      <div className="text-center p-3 bg-background rounded-lg border">
                        <p className="text-2xl font-bold text-primary">
                          {formatNumber(bizChatStats.data.msgReactCnt || 0)}
                        </p>
                        <p className="text-tiny text-muted-foreground">반응자</p>
                      </div>
                      <div className="text-center p-3 bg-background rounded-lg border">
                        <p className="text-2xl font-bold text-chart-1">
                          {bizChatStats.data.msgReactRatio || '0'}%
                        </p>
                        <p className="text-tiny text-muted-foreground">반응률</p>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="p-3 bg-muted/50 rounded-lg border">
                        <h4 className="font-medium mb-2 text-small">제외 현황</h4>
                        <div className="flex justify-between text-small">
                          <span className="text-muted-foreground">타 캠페인 수신자</span>
                          <span>{formatNumber(bizChatStats.data.dupExcludeCnt || 0)}명</span>
                        </div>
                        <div className="flex justify-between text-small">
                          <span className="text-muted-foreground">광고 수신 미동의</span>
                          <span>{formatNumber(bizChatStats.data.adRcvExcludeCnt || 0)}명</span>
                        </div>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg border">
                        <h4 className="font-medium mb-2 text-small">RCS 상세</h4>
                        <div className="flex justify-between text-small">
                          <span className="text-muted-foreground">RCS 반응자</span>
                          <span>{formatNumber(bizChatStats.data.rcsMsgReactCnt || 0)}명 ({bizChatStats.data.rcsMsgReactRatio || '0'}%)</span>
                        </div>
                        <div className="flex justify-between text-small">
                          <span className="text-muted-foreground">RCS 읽음</span>
                          <span>{formatNumber(bizChatStats.data.rcsMsgReadCnt || 0)}명 ({bizChatStats.data.rcsMsgReadRatio || '0'}%)</span>
                        </div>
                      </div>
                    </div>

                    {bizChatStats.meta?.refreshedAt && (
                      <p className="text-tiny text-muted-foreground text-right">
                        마지막 갱신: {formatDateTime(bizChatStats.meta.refreshedAt)} (5분 주기 갱신)
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-small">
                      "통계 조회" 버튼을 눌러 BizChat 실시간 통계를 확인하세요
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                캠페인 성과
              </CardTitle>
              <CardDescription>
                발송 결과 및 성과 분석
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sentCount > 0 ? (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-5">
                    <div className="text-center p-4 bg-muted rounded-lg" data-testid="stat-total-sent">
                      <p className="text-3xl font-bold text-primary">{formatNumber(sentCount)}</p>
                      <p className="text-small text-muted-foreground">총 발송</p>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg" data-testid="stat-delivered">
                      <p className="text-3xl font-bold text-success">{formatNumber(campaign.report?.deliveredCount || 0)}</p>
                      <p className="text-small text-muted-foreground">수신 완료</p>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg" data-testid="stat-failed">
                      <p className="text-3xl font-bold text-destructive">{formatNumber(campaign.report?.failedCount || 0)}</p>
                      <p className="text-small text-muted-foreground">실패</p>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg" data-testid="stat-clicks">
                      <p className="text-3xl font-bold text-chart-5">{formatNumber(campaign.report?.clickCount || 0)}</p>
                      <p className="text-small text-muted-foreground">클릭</p>
                    </div>
                    <div className="text-center p-4 bg-muted rounded-lg" data-testid="stat-optout">
                      <p className="text-3xl font-bold text-muted-foreground">{formatNumber(campaign.report?.optOutCount || 0)}</p>
                      <p className="text-small text-muted-foreground">수신거부</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-small text-muted-foreground">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      SKT 접수 전 실패처럼 발송이 성립하지 않은 경우에는 크레딧이 복구될 수 있어요.
                      이미 발송 시도된 건은 사용 처리되며, 복구 내역은 크레딧 관리의 장부에서 확인할 수 있어요.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-small mb-2">
                        <span>수신 완료율</span>
                        <span className="font-medium">
                          {sentCount > 0 ? (((campaign.report?.deliveredCount || 0) / sentCount) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                      <Progress
                        value={sentCount > 0 ? ((campaign.report?.deliveredCount || 0) / sentCount) * 100 : 0}
                        className="h-2"
                        data-testid="progress-delivery-rate"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-small mb-2">
                        <span>발송 성공률</span>
                        <span className="font-medium">{successRate}%</span>
                      </div>
                      <Progress value={successRate} className="h-2" data-testid="progress-success-rate" />
                    </div>
                    {campaign.report?.clickCount && successCount > 0 && (
                      <div>
                        <div className="flex justify-between text-small mb-2">
                          <span>클릭률 (CTR)</span>
                          <span className="font-medium">
                            {((campaign.report.clickCount / successCount) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <Progress
                          value={(campaign.report.clickCount / successCount) * 100}
                          className="h-2"
                          data-testid="progress-ctr"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={BarChart3}
                  title="발송 후 성과를 확인할 수 있어요"
                  description="캠페인이 발송되면 여기에서 성과를 확인할 수 있어요"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <BizChatErrorDialog
        open={errorDialogOpen}
        onOpenChange={setErrorDialogOpen}
        info={errorInfo}
        contextLabel="발송 요청 실패"
      />
    </div>
  );
}

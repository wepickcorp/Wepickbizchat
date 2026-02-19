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
  Wallet,
  BarChart3,
  AlertCircle,
  RefreshCw,
  Download,
  Loader2,
  FileCheck
} from "lucide-react";
import { formatCurrency, formatNumber, formatDateTime } from "@/lib/authUtils";
import { CampaignStatusBadge } from "@/components/campaign-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  lms: "LMS (장문 문자)",
  mms: "MMS (이미지 포함)",
  rcs: "RCS (리치 메시지)",
};

const GENDER_LABELS: Record<string, string> = {
  all: "전체",
  male: "남성",
  female: "여성",
};

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

export default function CampaignDetail() {
  const [, params] = useRoute("/campaigns/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const campaignId = params?.id || null;
  const [bizChatStats, setBizChatStats] = useState<BizChatStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  const { data: campaign, isLoading, error } = useQuery<CampaignDetail>({
    queryKey: ["/api/campaigns", campaignId],
    enabled: !!campaignId,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/campaigns/${campaignId}/submit`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "심사 요청 완료",
        description: "캠페인이 심사 대기 상태가 되었어요. 심사는 1-2 영업일이 소요됩니다.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "심사 요청 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/campaigns/${campaignId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "캠페인 삭제 완료",
        description: "캠페인이 삭제되었어요.",
      });
      navigate("/campaigns");
    },
    onError: (error: Error) => {
      toast({
        title: "삭제 실패",
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
      toast({
        title: "심사 승인 완료",
        description: "캠페인이 승인되었어요. 이제 발송을 시작할 수 있어요.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "승인 실패",
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
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "발송 시작",
        description: "캠페인 발송이 시작되었어요! 잠시 후 결과를 확인할 수 있어요.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "발송 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const fetchBizChatStats = async () => {
    if (!campaign?.bizchatCampaignId) {
      toast({
        title: "통계 조회 불가",
        description: "BizChat 캠페인 ID가 없어요. 캠페인을 먼저 발송해주세요.",
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
          title: "통계 조회 실패",
          description: data.error || "통계를 가져오는데 실패했어요.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "통계 조회 실패",
        description: "서버와 통신하는 중 오류가 발생했어요.",
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
          title="캠페인을 찾을 수 없어요"
          description="요청하신 캠페인이 존재하지 않거나 접근 권한이 없어요"
          action={{
            label: "캠페인 목록으로",
            onClick: () => navigate("/campaigns"),
          }}
        />
      </div>
    );
  }

  const canEdit = campaign.status === "temp_registered" || campaign.status === "rejected";
  const canSubmit = campaign.status === "temp_registered" || campaign.status === "rejected";
  const canDelete = campaign.status === "temp_registered";
  const canApprove = campaign.status === "pending";
  const canStart = campaign.status === "approved";
  const budget = parseFloat(campaign.budget as string || "0");
  const sentCount = campaign.sentCount || 0;
  const successCount = campaign.successCount || 0;
  const successRate = sentCount > 0 ? Math.round((successCount / sentCount) * 100) : 0;

  const targeting = campaign.targeting;
  const message = campaign.message;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild data-testid="button-back">
            <Link href="/campaigns">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-display font-bold" data-testid="text-campaign-name">
                {campaign.name}
              </h1>
              <CampaignStatusBadge status={campaign.status} />
            </div>
            <p className="text-muted-foreground" data-testid="text-campaign-meta">
              {MESSAGE_TYPE_LABELS[campaign.messageType]} · 생성: {formatDateTime(campaign.createdAt!)}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canEdit && (
            <Button variant="outline" asChild className="gap-2" data-testid="button-edit">
              <Link href={`/campaigns/${campaign.id}/edit`}>
                <Edit className="h-4 w-4" />
                수정
              </Link>
            </Button>
          )}
          {canSubmit && (
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="gap-2"
              data-testid="button-submit"
            >
              <FileCheck className="h-4 w-4" />
              {submitMutation.isPending ? "요청 중..." : "심사 요청"}
            </Button>
          )}
          {canApprove && (
            <Button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="gap-2"
              data-testid="button-approve"
            >
              <CheckCircle2 className="h-4 w-4" />
              {approveMutation.isPending ? "승인 중..." : "심사 승인 (시뮬레이션)"}
            </Button>
          )}
          {canStart && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="gap-2" data-testid="button-start">
                  <Send className="h-4 w-4" />
                  발송 시작
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>캠페인을 발송할까요?</AlertDialogTitle>
                  <AlertDialogDescription>
                    "{campaign.name}" 캠페인을 {formatNumber(campaign.targetCount)}명에게 발송합니다.
                    예상 비용은 {formatCurrency(campaign.targetCount * parseFloat(campaign.costPerMessage || "50"))}입니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => startMutation.mutate()}
                    disabled={startMutation.isPending}
                  >
                    {startMutation.isPending ? "발송 중..." : "발송 시작"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2" data-testid="button-delete">
                  <Trash2 className="h-4 w-4" />
                  삭제
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>캠페인을 삭제할까요?</AlertDialogTitle>
                  <AlertDialogDescription>
                    이 작업은 되돌릴 수 없어요. 캠페인 "{campaign.name}"을(를) 영구적으로 삭제합니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
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
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-small text-muted-foreground">예산</p>
                <p className="text-h3 font-bold" data-testid="text-budget">{formatCurrency(budget)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-chart-4/10">
                <Users className="h-5 w-5 text-chart-4" />
              </div>
              <div>
                <p className="text-small text-muted-foreground">예상 수신자</p>
                <p className="text-h3 font-bold" data-testid="text-recipients">
                  {formatNumber(campaign.targetCount)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <Send className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-small text-muted-foreground">발송 건수</p>
                <p className="text-h3 font-bold" data-testid="text-sent">{formatNumber(sentCount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-chart-5/10">
                <CheckCircle2 className="h-5 w-5 text-chart-5" />
              </div>
              <div>
                <p className="text-small text-muted-foreground">성공률</p>
                <p className="text-h3 font-bold" data-testid="text-success-rate">{successRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList data-testid="tabs-campaign-detail">
          <TabsTrigger value="overview" data-testid="tab-overview">개요</TabsTrigger>
          <TabsTrigger value="message" data-testid="tab-message">메시지</TabsTrigger>
          <TabsTrigger value="targeting" data-testid="tab-targeting">타겟팅</TabsTrigger>
          <TabsTrigger value="report" data-testid="tab-report">성과</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                캠페인 일정
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-small text-muted-foreground mb-1">발송 예정일</p>
                  <p className="font-medium" data-testid="text-scheduled-date">
                    {campaign.scheduledAt ? formatDateTime(campaign.scheduledAt) : "미정"}
                  </p>
                </div>
                <div>
                  <p className="text-small text-muted-foreground mb-1">발송 완료일</p>
                  <p className="font-medium" data-testid="text-completed-date">
                    {campaign.completedAt ? formatDateTime(campaign.completedAt) : "-"}
                  </p>
                </div>
              </div>
              {campaign.rejectionReason && (
                <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="font-medium text-destructive">반려 사유</span>
                  </div>
                  <p className="text-small" data-testid="text-rejection-reason">{campaign.rejectionReason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-h3">메시지 요약</CardTitle>
              </CardHeader>
              <CardContent>
                {message ? (
                  <div className="space-y-3">
                    {message.title && (
                      <div>
                        <p className="text-small text-muted-foreground mb-1">제목</p>
                        <p className="font-medium">{message.title}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-small text-muted-foreground mb-1">내용</p>
                      <p className="text-small whitespace-pre-wrap line-clamp-4" data-testid="text-message-preview">
                        {message.content}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-small">메시지가 설정되지 않았어요</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-h3">타겟팅 요약</CardTitle>
              </CardHeader>
              <CardContent>
                {targeting ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        {GENDER_LABELS[targeting.gender || "all"]}
                      </Badge>
                      <Badge variant="secondary">
                        {targeting.ageMin || 0}~{targeting.ageMax || 100}세
                      </Badge>
                      {targeting.regions && targeting.regions.length > 0 && (
                        <Badge variant="secondary">
                          {targeting.regions.length}개 지역
                        </Badge>
                      )}
                    </div>
                    <div>
                      <p className="text-small text-muted-foreground mb-1">타겟 수신자</p>
                      <p className="text-h2 font-bold text-primary" data-testid="text-estimated-reach">
                        {formatNumber(campaign.targetCount)}명
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-small">타겟팅이 설정되지 않았어요</p>
                )}
              </CardContent>
            </Card>
          </div>
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
                      : `${MESSAGE_TYPE_LABELS[campaign.messageType]} 형식의 메시지입니다`}
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
                          별도 LMS 폴백 메시지가 설정되지 않았어요. RCS 메시지 내용이 그대로 LMS로 대체 발송됩니다.
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
                  title="메시지가 없어요"
                  description="캠페인에 메시지가 설정되지 않았어요"
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
                타겟팅 설정
              </CardTitle>
              <CardDescription>
                SK CoreTarget 기반 정밀 타겟팅
              </CardDescription>
            </CardHeader>
            <CardContent>
              {targeting ? (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-small text-muted-foreground mb-1">성별</p>
                      <p className="text-h3 font-bold">{GENDER_LABELS[targeting.gender || "all"]}</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-small text-muted-foreground mb-1">연령대</p>
                      <p className="text-h3 font-bold">{targeting.ageMin || 0}~{targeting.ageMax || 100}세</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-small text-muted-foreground mb-1">타겟 수신자</p>
                      <p className="text-h3 font-bold text-primary">
                        {formatNumber(campaign.targetCount)}명
                      </p>
                    </div>
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

                </div>
              ) : (
                <EmptyState
                  icon={Target}
                  title="타겟팅이 없어요"
                  description="캠페인에 타겟팅이 설정되지 않았어요"
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
                  title="아직 성과 데이터가 없어요"
                  description="캠페인이 발송되면 여기에서 성과를 확인할 수 있어요"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

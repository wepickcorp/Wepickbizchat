import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  TrendingUp,
  Send,
  CheckCircle2,
  MousePointerClick,
  AlertCircle,
  Download,
  Calendar,
  Loader2,
  Eye,
  Users,
  MapPin
} from "lucide-react";
import { useState } from "react";
import { formatNumber, formatDateTime } from "@/lib/authUtils";
import { CampaignStatusBadge } from "@/components/campaign-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Campaign, Report } from "@shared/schema";
import { calculateCampaignCredits, CREDIT_POLICY } from "@shared/credit-policy";

interface CampaignWithReport extends Campaign {
  report?: Report;
}

interface BizChatStatsData {
  statDate: string;
  mdnCnt: number;
  dupExcludeCnt: number;
  adRcvExcludeCnt: number;
  sendTryCnt: number;
  msgRecvCnt: number;
  rcsMsgRecvCnt: number;
  vmgMsgRecvCnt: number;
  msgNotRecvCnt: number;
  msgReactCnt: number;
  msgReactRatio: string;
  rcsMsgReactCnt: number;
  rcsMsgReactRatio: string;
  vmgMsgReactCnt: number;
  vmgMsgReactRatio: string;
  rcsMsgReadCnt: number;
  rcsMsgReadRatio: string;
}

interface GenderAgeReportItem {
  age: string;
  sexCd: string;
  totSuccessCnt: number;
  totReactCnt: number;
  totReactRatio: string;
  rcsSuccessCnt: number;
  rcsReactCnt: number;
  rcsReactRatio: string;
  vmgSuccessCnt: number;
  vmgReactCnt: number;
  vmgReactRatio: string;
}

interface AreaReportItem {
  area: string;
  totSuccessCnt: number;
  totReactCnt: number;
  totReactRatio: string;
  rcsSuccessCnt: number;
  rcsReactCnt: number;
  vmgSuccessCnt: number;
  vmgReactCnt: number;
}

interface PeriodReportItem {
  dt: string;
  rcsReactCnt: number;
  rcsSuccessCnt: number;
  vmgReactCnt: number;
  vmgSuccessCnt: number;
  totReactCnt: number;
  totReactRatio: string;
  totSuccessCnt: number;
}

export default function Reports() {
  const [periodFilter, setPeriodFilter] = useState<string>("month");
  const [showAllCampaignResults, setShowAllCampaignResults] = useState(false);
  const { toast } = useToast();
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignWithReport | null>(null);
  const [campaignStats, setCampaignStats] = useState<BizChatStatsData | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const [genderAgeData, setGenderAgeData] = useState<GenderAgeReportItem[]>([]);
  const [areaData, setAreaData] = useState<AreaReportItem[]>([]);
  const [periodData, setPeriodData] = useState<PeriodReportItem[]>([]);
  const [isLoadingGenderAge, setIsLoadingGenderAge] = useState(false);
  const [isLoadingArea, setIsLoadingArea] = useState(false);
  const [isLoadingPeriod, setIsLoadingPeriod] = useState(false);

  const { data: campaigns, isLoading } = useQuery<CampaignWithReport[]>({
    queryKey: ["/api/campaigns?includeReports=true"],
  });

  const completedCampaigns = campaigns?.filter(c =>
    c.status === 'completed' || c.status === 'running'
  ) || [];
  const periodOptions = [
    { value: "week", label: "최근 7일", days: 7 },
    { value: "month", label: "최근 30일", days: 30 },
    { value: "quarter", label: "최근 3개월", days: 90 },
    { value: "all", label: "전체", days: null },
  ];
  const selectedPeriod = periodOptions.find((option) => option.value === periodFilter) || periodOptions[1];
  const selectedPeriodSummaryLabel = selectedPeriod.value === "all"
    ? "전체 기간에"
    : `${selectedPeriod.label} 동안`;
  const filteredCampaigns = completedCampaigns.filter((campaign) => {
    if (!selectedPeriod.days || !campaign.createdAt) return true;
    const createdAt = new Date(campaign.createdAt);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - selectedPeriod.days);
    return createdAt >= fromDate;
  });
  const visibleCampaignResults = showAllCampaignResults
    ? filteredCampaigns
    : filteredCampaigns.slice(0, 5);
  const hiddenCampaignResultCount = Math.max(filteredCampaigns.length - visibleCampaignResults.length, 0);

  const totalStats = filteredCampaigns.reduce((acc, campaign) => ({
    sent: acc.sent + (campaign.sentCount || 0),
    success: acc.success + (campaign.successCount || 0),
    clicks: acc.clicks + (campaign.report?.clickCount || 0),
    usedCredits: acc.usedCredits + calculateCampaignCredits({
      targetCount: campaign.sentCount || 0,
    }).neededCredits,
  }), { sent: 0, success: 0, clicks: 0, usedCredits: 0 });

  const successRate = totalStats.sent > 0
    ? Math.round((totalStats.success / totalStats.sent) * 100)
    : 0;

  const clickRate = totalStats.success > 0
    ? ((totalStats.clicks / totalStats.success) * 100).toFixed(1)
    : "0";

  const creditPerClick = totalStats.clicks > 0
    ? Math.round(totalStats.usedCredits / totalStats.clicks)
    : 0;

  const failedCount = Math.max(totalStats.sent - totalStats.success, 0);
  const failureRate = totalStats.sent > 0
    ? ((failedCount / totalStats.sent) * 100).toFixed(1)
    : "0";
  const campaignChartData = filteredCampaigns.slice(0, 6).map((campaign) => {
    const sent = campaign.sentCount || 0;
    const success = campaign.successCount || 0;
    const clicks = campaign.report?.clickCount || 0;

    return {
      name: campaign.name.length > 8 ? `${campaign.name.slice(0, 8)}...` : campaign.name,
      성공: success,
      실패: Math.max(sent - success, 0),
      클릭: clicks,
    };
  });

  const fetchCampaignStats = async (campaign: CampaignWithReport) => {
    if (!campaign.bizchatCampaignId) {
      toast({
        title: "통계 조회 불가",
        description: "BizChat에 등록되지 않은 캠페인이에요.",
        variant: "destructive",
      });
      return;
    }

    setSelectedCampaign(campaign);
    setIsDialogOpen(true);
    setIsLoadingStats(true);
    setCampaignStats(null);

    try {
      const response = await apiRequest("POST", "/api/bizchat/stats", {
        action: "fetchStats",
        campaignId: campaign.id,
      });
      const data = await response.json();

      if (data.success && data.data) {
        setCampaignStats(data.data);
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

  const fetchGenderAgeReport = async (campaignId: string) => {
    setIsLoadingGenderAge(true);
    setGenderAgeData([]);
    try {
      const response = await apiRequest("POST", "/api/bizchat/reports/gender-age", { campaignId });
      const data = await response.json();
      if (data.success && data.data?.list) {
        setGenderAgeData(data.data.list);
      } else if (data.error) {
        toast({
          title: "성별/연령대 분석을 다시 불러와요",
          description: data.error,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "성별/연령대 분석을 다시 불러와요",
        description: "서버와 연결하는 중 문제가 생겼어요.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingGenderAge(false);
    }
  };

  const fetchAreaReport = async (campaignId: string) => {
    setIsLoadingArea(true);
    setAreaData([]);
    try {
      const response = await apiRequest("POST", "/api/bizchat/reports/area", { campaignId });
      const data = await response.json();
      if (data.success && data.data?.list) {
        setAreaData(data.data.list);
      } else if (data.error) {
        toast({
          title: "지역별 분석을 다시 불러와요",
          description: data.error,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "지역별 분석을 다시 불러와요",
        description: "서버와 연결하는 중 문제가 생겼어요.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingArea(false);
    }
  };

  const fetchPeriodReport = async (campaignId: string) => {
    setIsLoadingPeriod(true);
    setPeriodData([]);
    try {
      const response = await apiRequest("POST", "/api/bizchat/reports/period", { campaignId });
      const data = await response.json();
      if (data.success && data.data?.list) {
        setPeriodData(data.data.list);
      } else if (data.error) {
        toast({
          title: "일자별 분석을 다시 불러와요",
          description: data.error,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "일자별 분석을 다시 불러와요",
        description: "서버와 연결하는 중 문제가 생겼어요.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPeriod(false);
    }
  };

  const isAtsEligible = (campaign: CampaignWithReport | null): boolean => {
    if (!campaign) return false;
    return campaign.rcvType === 0 && (campaign.status === 'completed' || campaign.status === 'stopped');
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (!selectedCampaign) return;

    if (tab === "gender-age" && !isLoadingGenderAge) {
      if (isAtsEligible(selectedCampaign)) {
        fetchGenderAgeReport(selectedCampaign.id);
      }
    }
    if (tab === "area" && !isLoadingArea) {
      if (isAtsEligible(selectedCampaign)) {
        fetchAreaReport(selectedCampaign.id);
      }
    }
    if (tab === "period" && !isLoadingPeriod) {
      if (isAtsEligible(selectedCampaign)) {
        fetchPeriodReport(selectedCampaign.id);
      }
    }
  };

  const getGenderAgeChartData = () => {
    const ageGroups = ["~10대", "20대", "30대", "40대", "50대", "60대~"];
    return ageGroups.map(age => {
      const male = genderAgeData.find(d => d.age === age && d.sexCd === "1");
      const female = genderAgeData.find(d => d.age === age && d.sexCd === "2");
      return {
        age,
        남성: male?.totSuccessCnt || 0,
        여성: female?.totSuccessCnt || 0,
        남성반응률: parseFloat(male?.totReactRatio || "0"),
        여성반응률: parseFloat(female?.totReactRatio || "0"),
      };
    });
  };

  return (
    <div className="animate-fade-in space-y-7">
      <Card className="border-primary/10">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-caption font-semibold text-primary">결과 보기</p>
              <p className="mt-1 text-small text-muted-foreground">
                {selectedPeriodSummaryLabel} 보낸 문자 {formatNumber(filteredCampaigns.length)}개의 결과를 보고 있어요.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/60 p-1 sm:flex">
                {periodOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setPeriodFilter(option.value);
                      setShowAllCampaignResults(false);
                    }}
                    className={`motion-press min-h-10 rounded-lg px-3 text-small font-semibold transition-colors ${
                      periodFilter === option.value
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`button-report-period-${option.value}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                className="min-h-10 gap-2"
                data-testid="button-download-report"
                onClick={() => {
                  window.open('/api/reports/export', '_blank');
                }}
                disabled={filteredCampaigns.length === 0}
              >
                <Download className="h-4 w-4" />
                내보내기
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <Card className="overflow-hidden">
          <CardHeader className="pb-4">
            <CardDescription className="font-semibold">발송 결과</CardDescription>
            <CardTitle className="text-title-lg">
              {totalStats.sent > 0
                ? `${formatNumber(totalStats.sent)}건 중 ${formatNumber(totalStats.success)}건이 도착했어요`
                : "발송을 시작하면 결과를 볼 수 있어요"}
            </CardTitle>
            <CardDescription>
              {totalStats.sent > 0
                ? `성공률 ${successRate}% · 도착하지 않은 건 ${formatNumber(failedCount)}건`
                : "캠페인을 발송하면 성공률과 사용 크레딧을 확인할 수 있어요"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success transition-all"
                style={{ width: `${Math.min(successRate, 100)}%` }}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-muted/60 p-4">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <Send className="h-4 w-4" />
                  <p className="text-caption">총 발송</p>
                </div>
                <p className="text-title-md font-bold">{formatNumber(totalStats.sent)}건</p>
              </div>
              <div className="rounded-2xl bg-success/10 p-4">
                <div className="mb-2 flex items-center gap-2 text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  <p className="text-caption">도착</p>
                </div>
                <p className="text-title-md font-bold text-success">{formatNumber(totalStats.success)}건</p>
              </div>
              <div className="rounded-2xl bg-muted/60 p-4">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <p className="text-caption">사용 크레딧</p>
                </div>
                <p className="text-title-md font-bold">{formatNumber(totalStats.usedCredits)}C</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardDescription className="font-semibold">반응 결과</CardDescription>
            <CardTitle className="text-title-lg">
              {totalStats.clicks > 0
                ? `${formatNumber(totalStats.clicks)}번 클릭했어요`
                : "클릭 데이터는 아직 쌓이지 않았어요"}
            </CardTitle>
            <CardDescription>
              {totalStats.clicks > 0
                ? `클릭률 ${clickRate}% · 클릭당 ${formatNumber(creditPerClick)}C`
                : "링크가 있는 메시지를 발송하면 클릭 흐름을 볼 수 있어요"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-2xl bg-primary/10 p-4">
              <div className="flex items-center gap-3">
                <MousePointerClick className="h-5 w-5 text-primary" />
                <p className="font-semibold">클릭률</p>
              </div>
              <p className="text-title-sm font-bold text-primary">{clickRate}%</p>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-muted/60 p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                <p className="font-semibold">도착하지 않은 건</p>
              </div>
              <p className={failedCount > 0 ? "text-title-sm font-bold text-destructive" : "text-title-sm font-bold"}>
                {formatNumber(failedCount)}건
              </p>
            </div>
            <p className="text-tiny text-muted-foreground">
              크레딧은 발송 시도 기준으로 계산하고, 복구 내역은 크레딧 장부에서 확인해요.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              캠페인별 발송 현황
            </CardTitle>
            <CardDescription>성공, 실패, 클릭 흐름을 함께 비교해요</CardDescription>
          </CardHeader>
          <CardContent>
            {campaignChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={campaignChartData} barGap={2} barCategoryGap="30%">
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip
                    formatter={(value: number, name: string) => [`${formatNumber(value)}건`, name]}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="성공" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="실패" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="클릭" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[260px] items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="mx-auto mb-2 h-12 w-12 opacity-50" />
                  <p className="text-small">캠페인 발송 후 데이터를 볼 수 있어요</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>확인할 포인트</CardTitle>
            <CardDescription>다음 운영에서 먼저 보면 좋은 내용이에요</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl bg-muted/60 p-4">
              <p className="font-semibold">{selectedPeriod.label} 문자 {filteredCampaigns.length}개를 비교해요</p>
              <p className="mt-1 text-small text-muted-foreground">
                목록에서 성공률과 클릭률을 함께 보면 타겟과 메시지 차이를 빠르게 찾을 수 있어요.
              </p>
            </div>
            <div className="rounded-2xl bg-muted/60 p-4">
              <p className="font-semibold">클릭이 있는 캠페인을 먼저 확인해요</p>
              <p className="mt-1 text-small text-muted-foreground">
                링크 반응이 있는 캠페인은 상세 분석에서 성별, 연령, 지역 흐름까지 이어서 볼 수 있어요.
              </p>
            </div>
            <div className="rounded-2xl bg-muted/60 p-4">
              <p className="font-semibold">도착하지 않은 건은 장부와 함께 봐요</p>
              <p className="mt-1 text-small text-muted-foreground">
                발송 시도 크레딧과 복구 내역을 같이 확인하면 실제 사용 크레딧을 더 정확히 볼 수 있어요.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>캠페인별 결과</CardTitle>
          <CardDescription>
            최근 결과를 먼저 보고, 필요한 캠페인만 더 확인해요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between py-4 border-b last:border-0">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <div className="flex gap-4">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredCampaigns.length > 0 ? (
            <div className="space-y-4">
              <div className={`grid gap-3 ${showAllCampaignResults ? "max-h-[680px] overflow-y-auto pr-1" : ""}`}>
              {visibleCampaignResults.map((campaign) => {
                const sent = campaign.sentCount || 0;
                const success = campaign.successCount || 0;
                const clicks = campaign.report?.clickCount || 0;
                const failed = Math.max(sent - success, 0);
                const rate = sent > 0 ? Math.round((success / sent) * 100) : 0;
                const ctr = success > 0 ? ((clicks / success) * 100).toFixed(1) : "0";
                const failedRate = sent > 0 ? (failed / sent) * 100 : 0;
                const attemptedCredits = calculateCampaignCredits({
                  targetCount: campaign.sentCount || 0,
                }).neededCredits;
                const statusBadges = [
                  rate >= 90 ? { label: "도착률 좋음", className: "border-success/30 bg-success/10 text-success" } : null,
                  failedRate >= 5 ? { label: "확인 필요", className: "border-destructive/30 bg-destructive/10 text-destructive" } : null,
                  clicks > 0 ? { label: "반응 있음", className: "border-primary/30 bg-primary/10 text-primary" } : { label: "반응 대기", className: "border-border bg-muted text-muted-foreground" },
                ].filter(Boolean) as { label: string; className: string }[];

                return (
                  <div
                    key={campaign.id}
                    className="motion-lift motion-press rounded-lg border bg-card p-4 hover:border-primary/40 hover:shadow-sm"
                    data-testid={`row-report-${campaign.id}`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-3">
                          <p className="font-bold truncate">{campaign.name}</p>
                          <CampaignStatusBadge status={campaign.status} />
                          {statusBadges.map((badge) => (
                            <Badge
                              key={badge.label}
                              variant="outline"
                              className={badge.className}
                            >
                              {badge.label}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-small text-muted-foreground">
                          {formatDateTime(campaign.createdAt!)} · {campaign.messageType}
                        </p>
                        <p className="mt-1 text-tiny text-muted-foreground">
                          발송 시도 {formatNumber(attemptedCredits)}C · 복구 내역은 크레딧 장부 기준
                        </p>
                      </div>
	                      <div className="rounded-xl bg-muted/50 p-4 lg:min-w-[300px]">
	                        <div className="flex items-end justify-between gap-4">
	                          <div>
	                            <p className="text-tiny font-semibold text-muted-foreground">도착률</p>
	                            <p className="mt-1 text-3xl font-bold text-success">{rate}%</p>
	                          </div>
	                          <p className="text-right text-small text-muted-foreground">
	                            {formatNumber(success)}건 도착
	                          </p>
	                        </div>
	                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background">
	                          <div
	                            className="h-full rounded-full bg-success transition-all"
	                            style={{ width: `${Math.min(rate, 100)}%` }}
	                          />
	                        </div>
	                        <p className="mt-3 text-small text-muted-foreground">
	                          {formatNumber(sent)}건 발송 · 실패 {formatNumber(failed)}건 · 클릭률 {ctr}%
	                        </p>
	                      </div>
                    </div>
                    {campaign.bizchatCampaignId && (
                      <div className="mt-4 flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fetchCampaignStats(campaign)}
                          className="min-h-10 gap-2"
                          data-testid={`button-stats-${campaign.id}`}
                        >
                          <Eye className="h-4 w-4" />
                          상세 분석 보기
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
              {filteredCampaigns.length > 5 && (
                <Button
                  variant="outline"
                  className="w-full min-h-11"
                  onClick={() => setShowAllCampaignResults((value) => !value)}
                >
                  {showAllCampaignResults
                    ? "최근 결과만 보기"
                    : `${formatNumber(hiddenCampaignResultCount)}개 더 보기`}
                </Button>
              )}
            </div>
          ) : (
            <EmptyState
              icon={BarChart3}
              title="이 기간에는 볼 결과가 없어요"
              description="기간을 넓히거나 문자를 발송하면 결과를 확인할 수 있어요."
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) {
          setActiveTab("basic");
          setGenderAgeData([]);
          setAreaData([]);
          setPeriodData([]);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              캠페인 상세 분석
            </DialogTitle>
            <DialogDescription>
              {selectedCampaign?.name} · ATS 캠페인은 성별/연령대 및 지역별 분석이 가능해요
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic" className="gap-1" data-testid="tab-basic-stats">
                <BarChart3 className="h-4 w-4" />
                기본
              </TabsTrigger>
              <TabsTrigger value="gender-age" className="gap-1" data-testid="tab-gender-age">
                <Users className="h-4 w-4" />
                성별/연령
              </TabsTrigger>
              <TabsTrigger value="area" className="gap-1" data-testid="tab-area">
                <MapPin className="h-4 w-4" />
                지역별
              </TabsTrigger>
              <TabsTrigger value="period" className="gap-1" data-testid="tab-period">
                <Calendar className="h-4 w-4" />
                일자별
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="mt-4">
              {isLoadingStats ? (
                <div className="py-8 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-muted-foreground">BizChat 통계를 조회하고 있어요...</p>
                </div>
              ) : campaignStats ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-2xl font-bold text-primary">
                        {formatNumber(campaignStats.mdnCnt || 0)}
                      </p>
                      <p className="text-tiny text-muted-foreground">발송 대상자</p>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-2xl font-bold text-chart-4">
                        {formatNumber(campaignStats.sendTryCnt || 0)}
                      </p>
                      <p className="text-tiny text-muted-foreground">발송 시도</p>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-2xl font-bold text-success">
                        {formatNumber(campaignStats.msgRecvCnt || 0)}
                      </p>
                      <p className="text-tiny text-muted-foreground">수신 성공</p>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-2xl font-bold text-destructive">
                        {formatNumber(campaignStats.msgNotRecvCnt || 0)}
                      </p>
                      <p className="text-tiny text-muted-foreground">수신 실패</p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="p-4 bg-muted/50 rounded-lg border space-y-2">
                      <h4 className="font-medium text-small">메시지 유형별 수신</h4>
                      <div className="flex justify-between text-small">
                        <span className="text-muted-foreground">RCS 수신</span>
                        <span className="font-medium">{formatNumber(campaignStats.rcsMsgRecvCnt || 0)}명</span>
                      </div>
                      <div className="flex justify-between text-small">
                        <span className="text-muted-foreground">일반(VMG) 수신</span>
                        <span className="font-medium">{formatNumber(campaignStats.vmgMsgRecvCnt || 0)}명</span>
                      </div>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg border space-y-2">
                      <h4 className="font-medium text-small">제외 현황</h4>
                      <div className="flex justify-between text-small">
                        <span className="text-muted-foreground">타 캠페인 수신자</span>
                        <span className="font-medium">{formatNumber(campaignStats.dupExcludeCnt || 0)}명</span>
                      </div>
                      <div className="flex justify-between text-small">
                        <span className="text-muted-foreground">광고 수신 미동의</span>
                        <span className="font-medium">{formatNumber(campaignStats.adRcvExcludeCnt || 0)}명</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                    <h4 className="font-medium text-small mb-3 flex items-center gap-2">
                      <MousePointerClick className="h-4 w-4 text-primary" />
                      반응 통계
                    </h4>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-primary">{campaignStats.msgReactRatio || '0'}%</p>
                        <p className="text-tiny text-muted-foreground">전체 반응률</p>
                        <p className="text-tiny text-muted-foreground">{formatNumber(campaignStats.msgReactCnt || 0)}명</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-chart-5">{campaignStats.rcsMsgReactRatio || '0'}%</p>
                        <p className="text-tiny text-muted-foreground">RCS 반응률</p>
                        <p className="text-tiny text-muted-foreground">{formatNumber(campaignStats.rcsMsgReactCnt || 0)}명</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-chart-3">{campaignStats.vmgMsgReactRatio || '0'}%</p>
                        <p className="text-tiny text-muted-foreground">일반 반응률</p>
                        <p className="text-tiny text-muted-foreground">{formatNumber(campaignStats.vmgMsgReactCnt || 0)}명</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-tiny text-muted-foreground">
                    <span>통계 수집일: {campaignStats.statDate ? `${campaignStats.statDate.slice(0,4)}-${campaignStats.statDate.slice(4,6)}-${campaignStats.statDate.slice(6,8)}` : '-'}</span>
                    <Badge variant="outline">5분 주기 갱신</Badge>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>통계 데이터를 다시 불러와요</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="gender-age" className="mt-4">
              {!isAtsEligible(selectedCampaign) ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>ATS 캠페인에서 성별/연령대 분석을 볼 수 있어요</p>
                  <p className="text-tiny mt-1">
                    {selectedCampaign?.rcvType !== 0
                      ? "ATS 타겟팅 캠페인만 조회할 수 있어요."
                      : "캠페인 발송이 완료된 후 익일부터 조회할 수 있어요."}
                  </p>
                </div>
              ) : isLoadingGenderAge ? (
                <div className="py-8 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-muted-foreground">성별/연령대별 분석을 조회하고 있어요...</p>
                </div>
              ) : genderAgeData.length > 0 ? (
                <div className="space-y-4">
                  <div className="p-4 bg-muted/50 rounded-lg border">
                    <h4 className="font-medium text-small mb-4">연령대별 발송 성공 수</h4>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={getGenderAgeChartData()} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <XAxis dataKey="age" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          formatter={(value: number) => formatNumber(value)}
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Legend />
                        <Bar dataKey="남성" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="여성" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="p-4 bg-muted/50 rounded-lg border">
                      <h4 className="font-medium text-small mb-3 flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-chart-1"></span>
                        남성 상세
                      </h4>
                      <div className="space-y-2">
                        {genderAgeData.filter(d => d.sexCd === "1").map(item => (
                          <div key={item.age} className="flex justify-between text-small">
                            <span className="text-muted-foreground">{item.age}</span>
                            <span className="font-medium">
                              {formatNumber(item.totSuccessCnt)}명
                              <span className="text-primary ml-2">({item.totReactRatio}%)</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg border">
                      <h4 className="font-medium text-small mb-3 flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-chart-2"></span>
                        여성 상세
                      </h4>
                      <div className="space-y-2">
                        {genderAgeData.filter(d => d.sexCd === "2").map(item => (
                          <div key={item.age} className="flex justify-between text-small">
                            <span className="text-muted-foreground">{item.age}</span>
                            <span className="font-medium">
                              {formatNumber(item.totSuccessCnt)}명
                              <span className="text-primary ml-2">({item.totReactRatio}%)</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <p className="text-tiny text-muted-foreground">
                    * ATS 캠페인만 조회할 수 있고, 발송 다음 날부터 볼 수 있어요. 데이터는 캠페인 시작 후 96시간까지 업데이트해요.
                  </p>
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>발송 다음 날부터 성별/연령대 분석을 볼 수 있어요</p>
                  <p className="text-tiny mt-1">ATS 캠페인만 조회할 수 있어요.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="area" className="mt-4">
              {!isAtsEligible(selectedCampaign) ? (
                <div className="py-8 text-center text-muted-foreground">
                  <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>ATS 캠페인에서 지역별 분석을 볼 수 있어요</p>
                  <p className="text-tiny mt-1">
                    {selectedCampaign?.rcvType !== 0
                      ? "ATS 타겟팅 캠페인만 조회할 수 있어요."
                      : "캠페인 발송이 완료된 후 익일부터 조회할 수 있어요."}
                  </p>
                </div>
              ) : isLoadingArea ? (
                <div className="py-8 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-muted-foreground">지역별 분석을 조회하고 있어요...</p>
                </div>
              ) : areaData.length > 0 ? (
                <div className="space-y-4">
                  <div className="p-4 bg-muted/50 rounded-lg border">
                    <h4 className="font-medium text-small mb-4">지역별 발송 성공 수</h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={areaData.slice(0, 10)}
                        layout="vertical"
                        margin={{ top: 10, right: 30, left: 40, bottom: 0 }}
                      >
                        <XAxis type="number" tick={{ fontSize: 12 }} />
                        <YAxis type="category" dataKey="area" tick={{ fontSize: 12 }} width={50} />
                        <Tooltip
                          formatter={(value: number) => formatNumber(value)}
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Bar dataKey="totSuccessCnt" name="발송 성공" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg border">
                    <h4 className="font-medium text-small mb-3">전체 지역 현황</h4>
                    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3 max-h-[200px] overflow-y-auto">
                      {areaData.map(item => (
                        <div key={item.area} className="flex justify-between text-small p-2 bg-background rounded">
                          <span className="text-muted-foreground">{item.area}</span>
                          <span className="font-medium">
                            {formatNumber(item.totSuccessCnt)}명
                            <span className="text-primary ml-2">({item.totReactRatio}%)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="text-tiny text-muted-foreground">
                    * ATS 캠페인만 조회할 수 있고, 발송 다음 날부터 볼 수 있어요. 데이터는 캠페인 시작 후 96시간까지 업데이트해요.
                  </p>
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>발송 다음 날부터 지역별 분석을 볼 수 있어요</p>
                  <p className="text-tiny mt-1">ATS 캠페인만 조회할 수 있어요.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="period" className="mt-4">
              {!isAtsEligible(selectedCampaign) ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>ATS 캠페인에서 일자별 분석을 볼 수 있어요</p>
                  <p className="text-tiny mt-1">
                    {selectedCampaign?.rcvType !== 0
                      ? "ATS 타겟팅 캠페인만 조회할 수 있어요."
                      : "캠페인 발송이 완료된 후 익일부터 조회할 수 있어요."}
                  </p>
                </div>
              ) : isLoadingPeriod ? (
                <div className="py-8 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-muted-foreground">일자별 분석을 조회하고 있어요...</p>
                </div>
              ) : periodData.length > 0 ? (
                <div className="space-y-4">
                  <div className="p-4 bg-muted/50 rounded-lg border">
                    <h4 className="font-medium text-small mb-4">일자별 발송 현황</h4>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={periodData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <XAxis dataKey="dt" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          formatter={(value: number, name: string) => [formatNumber(value), name === 'rcsSuccessCnt' ? 'RCS 성공' : name === 'vmgSuccessCnt' ? 'VMG 성공' : name]}
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Legend />
                        <Bar dataKey="rcsSuccessCnt" name="RCS 발송" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="vmgSuccessCnt" name="VMG 발송" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                    <h4 className="font-medium text-small mb-3 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      일자별 상세 현황
                    </h4>
                    <div className="max-h-[200px] overflow-y-auto">
                      <table className="w-full text-small">
                        <thead className="sticky top-0 bg-primary/5">
                          <tr className="text-muted-foreground">
                            <th className="text-left p-2">날짜</th>
                            <th className="text-right p-2">RCS</th>
                            <th className="text-right p-2">VMG</th>
                            <th className="text-right p-2">전체</th>
                            <th className="text-right p-2">반응률</th>
                          </tr>
                        </thead>
                        <tbody>
                          {periodData.map(item => (
                            <tr key={item.dt} className="border-t border-border/50">
                              <td className="p-2 font-medium">{item.dt}</td>
                              <td className="text-right p-2">{formatNumber(item.rcsSuccessCnt)}</td>
                              <td className="text-right p-2">{formatNumber(item.vmgSuccessCnt)}</td>
                              <td className="text-right p-2 font-medium">{formatNumber(item.totSuccessCnt)}</td>
                              <td className="text-right p-2 text-primary font-medium">{item.totReactRatio}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <p className="text-tiny text-muted-foreground">
                    * ATS 캠페인만 조회할 수 있고, 발송 다음 날부터 볼 수 있어요. 데이터는 캠페인 시작 후 96시간까지 업데이트해요.
                  </p>
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>발송 다음 날부터 일자별 분석을 볼 수 있어요</p>
                  <p className="text-tiny mt-1">ATS 캠페인만 조회할 수 있어요.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

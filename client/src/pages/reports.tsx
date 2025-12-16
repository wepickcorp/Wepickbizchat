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
  RefreshCw,
  Loader2,
  Eye,
  Users,
  MapPin
} from "lucide-react";
import { useState } from "react";
import { formatNumber, formatDateTime, formatCurrency } from "@/lib/authUtils";
import { StatsCard } from "@/components/stats-card";
import { CampaignStatusBadge } from "@/components/campaign-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Campaign, Report } from "@shared/schema";

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

export default function Reports() {
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const { toast } = useToast();
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignWithReport | null>(null);
  const [campaignStats, setCampaignStats] = useState<BizChatStatsData | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const [genderAgeData, setGenderAgeData] = useState<GenderAgeReportItem[]>([]);
  const [areaData, setAreaData] = useState<AreaReportItem[]>([]);
  const [isLoadingGenderAge, setIsLoadingGenderAge] = useState(false);
  const [isLoadingArea, setIsLoadingArea] = useState(false);

  const { data: campaigns, isLoading } = useQuery<CampaignWithReport[]>({
    queryKey: ["/api/campaigns?includeReports=true"],
  });

  const completedCampaigns = campaigns?.filter(c => 
    c.status === 'completed' || c.status === 'running'
  ) || [];

  const totalStats = completedCampaigns.reduce((acc, campaign) => ({
    sent: acc.sent + (campaign.sentCount || 0),
    success: acc.success + (campaign.successCount || 0),
    clicks: acc.clicks + (campaign.report?.clickCount || 0),
    budget: acc.budget + parseFloat(campaign.budget as string || "0"),
  }), { sent: 0, success: 0, clicks: 0, budget: 0 });

  const successRate = totalStats.sent > 0 
    ? Math.round((totalStats.success / totalStats.sent) * 100) 
    : 0;

  const clickRate = totalStats.success > 0 
    ? ((totalStats.clicks / totalStats.success) * 100).toFixed(1)
    : "0";

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
          title: "성별/연령대 분석 조회 실패",
          description: data.error,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "성별/연령대 분석 조회 실패",
        description: "서버와 통신하는 중 오류가 발생했어요.",
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
          title: "지역별 분석 조회 실패",
          description: data.error,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "지역별 분석 조회 실패",
        description: "서버와 통신하는 중 오류가 발생했어요.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingArea(false);
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
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">리포트</h1>
          <p className="text-muted-foreground mt-1">
            캠페인 성과를 분석하고 인사이트를 얻어보세요
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-period-filter">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="기간" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="week">최근 7일</SelectItem>
              <SelectItem value="month">최근 30일</SelectItem>
              <SelectItem value="quarter">최근 3개월</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            className="gap-2" 
            data-testid="button-download-report"
            onClick={() => {
              window.open('/api/reports/export', '_blank');
            }}
            disabled={completedCampaigns.length === 0}
          >
            <Download className="h-4 w-4" />
            내보내기
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="총 발송"
          value={formatNumber(totalStats.sent)}
          description="누적 발송 건수"
          icon={Send}
          iconClassName="bg-chart-4/10"
        />
        <StatsCard
          title="발송 성공"
          value={formatNumber(totalStats.success)}
          description={`성공률 ${successRate}%`}
          icon={CheckCircle2}
          iconClassName="bg-success/10"
        />
        <StatsCard
          title="클릭 수"
          value={formatNumber(totalStats.clicks)}
          description={`클릭률 ${clickRate}%`}
          icon={MousePointerClick}
          iconClassName="bg-primary/10"
        />
        <StatsCard
          title="총 광고비"
          value={formatCurrency(totalStats.budget)}
          description="누적 사용 예산"
          icon={TrendingUp}
          iconClassName="bg-chart-5/10"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              성과 요약
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-small">
                <span>발송 성공률</span>
                <span className="font-medium">{successRate}%</span>
              </div>
              <Progress value={successRate} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-small">
                <span>클릭률 (CTR)</span>
                <span className="font-medium">{clickRate}%</span>
              </div>
              <Progress value={parseFloat(clickRate)} className="h-2" />
            </div>
            <div className="pt-4 grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold text-primary">
                  {completedCampaigns.length}
                </p>
                <p className="text-small text-muted-foreground">완료된 캠페인</p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold text-success">
                  {formatCurrency(totalStats.budget / (totalStats.clicks || 1))}
                </p>
                <p className="text-small text-muted-foreground">클릭당 비용 (CPC)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>캠페인 성과 분포</CardTitle>
            <CardDescription>발송/성공/클릭 비율</CardDescription>
          </CardHeader>
          <CardContent>
            {completedCampaigns.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={[
                      { name: '발송 성공', value: totalStats.success, fill: 'hsl(var(--success))' },
                      { name: '발송 실패', value: totalStats.sent - totalStats.success, fill: 'hsl(var(--muted))' },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    <Cell fill="hsl(var(--success))" />
                    <Cell fill="hsl(var(--muted))" />
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => formatNumber(value)}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-small">캠페인 데이터가 없어요</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>캠페인별 성과</CardTitle>
          <CardDescription>각 캠페인의 상세 성과를 확인해보세요. BizChat 통계 버튼을 눌러 실시간 통계를 조회할 수 있어요.</CardDescription>
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
          ) : completedCampaigns.length > 0 ? (
            <div className="space-y-1">
              {completedCampaigns.map((campaign) => {
                const sent = campaign.sentCount || 0;
                const success = campaign.successCount || 0;
                const clicks = campaign.report?.clickCount || 0;
                const rate = sent > 0 ? Math.round((success / sent) * 100) : 0;
                const ctr = success > 0 ? ((clicks / success) * 100).toFixed(1) : "0";

                return (
                  <div
                    key={campaign.id}
                    className="flex flex-col md:flex-row md:items-center justify-between py-4 px-2 rounded-lg hover-elevate -mx-2 border-b last:border-0 gap-4"
                    data-testid={`row-report-${campaign.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <p className="font-medium truncate">{campaign.name}</p>
                        <CampaignStatusBadge status={campaign.status} />
                        {campaign.bizchatCampaignId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => fetchCampaignStats(campaign)}
                            className="gap-1 h-7"
                            data-testid={`button-stats-${campaign.id}`}
                          >
                            <Eye className="h-3 w-3" />
                            BizChat 통계
                          </Button>
                        )}
                      </div>
                      <p className="text-small text-muted-foreground">
                        {formatDateTime(campaign.createdAt!)} · {campaign.messageType}
                      </p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-center min-w-[80px]">
                        <p className="text-h3 font-bold">{formatNumber(sent)}</p>
                        <p className="text-tiny text-muted-foreground">발송</p>
                      </div>
                      <div className="text-center min-w-[80px]">
                        <p className="text-h3 font-bold text-success">{rate}%</p>
                        <p className="text-tiny text-muted-foreground">성공률</p>
                      </div>
                      <div className="text-center min-w-[80px]">
                        <p className="text-h3 font-bold text-primary">{ctr}%</p>
                        <p className="text-tiny text-muted-foreground">클릭률</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={BarChart3}
              title="리포트 데이터가 없어요"
              description="캠페인을 발송하면 여기에서 성과를 확인할 수 있어요"
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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic" className="gap-1" data-testid="tab-basic-stats">
                <BarChart3 className="h-4 w-4" />
                기본 통계
              </TabsTrigger>
              <TabsTrigger value="gender-age" className="gap-1" data-testid="tab-gender-age">
                <Users className="h-4 w-4" />
                성별/연령대
              </TabsTrigger>
              <TabsTrigger value="area" className="gap-1" data-testid="tab-area">
                <MapPin className="h-4 w-4" />
                지역별
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
                  <p>통계 데이터를 가져오지 못했어요</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="gender-age" className="mt-4">
              {!isAtsEligible(selectedCampaign) ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>성별/연령대별 분석을 사용할 수 없어요</p>
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
                    * ATS 캠페인만 조회 가능하며, 발송 익일부터 조회됩니다. 데이터는 캠페인 시작 후 96시간까지 업데이트됩니다.
                  </p>
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>성별/연령대별 분석 데이터가 없어요</p>
                  <p className="text-tiny mt-1">ATS 캠페인만 조회 가능하며, 발송 익일부터 조회됩니다.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="area" className="mt-4">
              {!isAtsEligible(selectedCampaign) ? (
                <div className="py-8 text-center text-muted-foreground">
                  <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>지역별 분석을 사용할 수 없어요</p>
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
                    * ATS 캠페인만 조회 가능하며, 발송 익일부터 조회됩니다. 데이터는 캠페인 시작 후 96시간까지 업데이트됩니다.
                  </p>
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>지역별 분석 데이터가 없어요</p>
                  <p className="text-tiny mt-1">ATS 캠페인만 조회 가능하며, 발송 익일부터 조회됩니다.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

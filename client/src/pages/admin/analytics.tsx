import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Megaphone, Send, Target, MousePointer, TrendingUp, BarChart3 } from "lucide-react";
import { calculateCampaignCredits } from "@shared/credit-policy";

interface AnalyticsData {
  period: { days: number; startDate: string };
  overview: {
    totalUsers: number;
    activeUsers: number;
    totalCampaigns: number;
    completedCampaigns: number;
    runningCampaigns: number;
    pendingCampaigns: number;
    totalSent: number;
    totalSuccess: number;
    totalClicks: number;
    totalBudget: number;
    deliveryRate: string;
    clickRate: string;
  };
  trends: {
    userGrowth: { date: string; count: number }[];
    dailyCampaigns: { date: string; count: number; totalBudget: number }[];
  };
  breakdown: {
    byStatus: { status: string; count: number }[];
    byMessageType: { messageType: string; count: number; totalSent: number }[];
  };
  topAdvertisers: {
    userId: string;
    userEmail: string;
    campaignCount: number;
    totalBudget: number;
    totalSent: number;
  }[];
}

const statusLabels: Record<string, string> = {
  draft: "초안",
  temp_registered: "임시등록",
  approval_requested: "검수 중",
  approved: "승인됨",
  running: "발송 중",
  completed: "완료",
  rejected: "반려",
  cancelled: "취소",
};

export default function AdminAnalytics() {
  const adminToken = localStorage.getItem("adminToken");
  const [period, setPeriod] = useState("30");

  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/reports/analytics", period],
    queryFn: async () => {
      const res = await fetch(`/api/admin/reports/analytics?period=${period}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const overview = data?.overview;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">통계 분석</h1>
          <p className="text-muted-foreground">플랫폼 성과 및 트렌드 분석</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7일</SelectItem>
            <SelectItem value="30">30일</SelectItem>
            <SelectItem value="90">90일</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">전체 사용자</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.totalUsers?.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  활성 {overview?.activeUsers?.toLocaleString()}명
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">캠페인</CardTitle>
                <Megaphone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.totalCampaigns?.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  진행 중 {overview?.runningCampaigns || 0}건
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">발송 메시지</CardTitle>
                <Send className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.totalSent?.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  성공률 {overview?.deliveryRate}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">클릭</CardTitle>
                <MousePointer className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.totalClicks?.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  클릭률 {overview?.clickRate}%
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>캠페인 상태별 분포</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data?.breakdown?.byStatus?.map((item) => (
                    <div key={item.status} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{statusLabels[item.status] || item.status}</Badge>
                      </div>
                      <span className="font-bold">{item.count}건</span>
                    </div>
                  ))}
                  {!data?.breakdown?.byStatus?.length && (
                    <p className="text-center text-muted-foreground">데이터 없음</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>메시지 유형별 발송</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data?.breakdown?.byMessageType?.map((item) => (
                    <div key={item.messageType} className="flex items-center justify-between">
                      <Badge>{item.messageType}</Badge>
                      <div className="text-right">
                        <span className="font-bold">{item.count}건</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          ({Number(item.totalSent).toLocaleString()}건 발송)
                        </span>
                      </div>
                    </div>
                  ))}
                  {!data?.breakdown?.byMessageType?.length && (
                    <p className="text-center text-muted-foreground">데이터 없음</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top 광고주</CardTitle>
              <CardDescription>기간 내 발송량과 필요 크레딧 기준 상위 광고주</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.topAdvertisers?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2">순위</th>
                        <th className="text-left py-3 px-2">광고주</th>
                        <th className="text-right py-3 px-2">캠페인 수</th>
                        <th className="text-right py-3 px-2">발송 건수</th>
                        <th className="text-right py-3 px-2">필요 크레딧</th>
                        <th className="text-right py-3 px-2">레거시 예산</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topAdvertisers.map((advertiser, index) => {
                        const neededCredits = calculateCampaignCredits({
                          targetCount: Number(advertiser.totalSent || 0),
                        }).neededCredits;

                        return (
                          <tr key={advertiser.userId} className="border-b">
                            <td className="py-3 px-2">
                              <Badge variant={index < 3 ? "default" : "secondary"}>{index + 1}</Badge>
                            </td>
                            <td className="py-3 px-2 font-medium">{advertiser.userEmail}</td>
                            <td className="py-3 px-2 text-right">{advertiser.campaignCount}건</td>
                            <td className="py-3 px-2 text-right">{Number(advertiser.totalSent).toLocaleString()}건</td>
                            <td className="py-3 px-2 text-right font-bold">
                              {neededCredits.toLocaleString("ko-KR")}C
                            </td>
                            <td className="py-3 px-2 text-right text-muted-foreground">
                              ₩{Number(advertiser.totalBudget).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">데이터가 없습니다</p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>사용자 가입 추이</CardTitle>
              </CardHeader>
              <CardContent>
                {data?.trends?.userGrowth?.length ? (
                  <div className="space-y-2">
                    {data.trends.userGrowth.slice(-10).map((item) => (
                      <div key={item.date} className="flex items-center justify-between">
                        <span className="text-muted-foreground">{item.date}</span>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 bg-primary rounded"
                            style={{ width: `${Math.min(100, item.count * 20)}px` }}
                          />
                          <span className="font-medium w-8 text-right">{item.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">데이터 없음</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>일별 캠페인 생성</CardTitle>
              </CardHeader>
              <CardContent>
                {data?.trends?.dailyCampaigns?.length ? (
                  <div className="space-y-2">
                    {data.trends.dailyCampaigns.slice(-10).map((item) => (
                      <div key={item.date} className="flex items-center justify-between">
                        <span className="text-muted-foreground">{item.date}</span>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 bg-primary rounded"
                            style={{ width: `${Math.min(100, item.count * 20)}px` }}
                          />
                          <span className="font-medium w-8 text-right">{item.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">데이터 없음</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, DollarSign, Send, CreditCard, RefreshCcw } from "lucide-react";
import { calculateCampaignCredits } from "@shared/credit-policy";
import { format, subMonths } from "date-fns";

export default function AdminReports() {
  const adminToken = localStorage.getItem("adminToken");
  const [startDate, setStartDate] = useState(() => format(subMonths(new Date(), 1), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/reports/settlements", startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(`/api/admin/reports/settlements?${params}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const summary = data?.summary || {};
  const totalNeededCredits = calculateCampaignCredits({
    targetCount: Number(summary.totalSentMessages || 0),
  }).neededCredits;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">정산 리포트</h1>
          <p className="text-muted-foreground">기간별 결제 금액과 캠페인 크레딧 사용 현황</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
            data-testid="input-start-date"
          />
          <span>~</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
            data-testid="input-end-date"
          />
          <Button onClick={() => refetch()} variant="outline" data-testid="button-refresh-report">
            <Calendar className="h-4 w-4 mr-2" />
            조회
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">충전 금액</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  +₩{(summary.totalCharge || 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">레거시 사용 금액</CardTitle>
                <Send className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ₩{(summary.totalUsage || 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">환불 금액</CardTitle>
                <RefreshCcw className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  -₩{(summary.totalRefund || 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">순 매출</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ₩{(summary.netRevenue || 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>캠페인 현황</CardTitle>
                <CardDescription>기간 내 완료된 캠페인</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">완료 캠페인</span>
                    <span className="font-bold">{summary.completedCampaigns || 0}건</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">발송 메시지</span>
                    <span className="font-bold">{(summary.totalSentMessages || 0).toLocaleString()}건</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">필요 크레딧 합계</span>
                    <span className="font-bold">{totalNeededCredits.toLocaleString("ko-KR")}C</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">레거시 예산 합계</span>
                    <span className="font-bold">₩{(summary.totalCampaignBudget || 0).toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>메시지 유형별 현황</CardTitle>
                <CardDescription>발송 메시지 유형 분석</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data?.messageTypeStats?.length > 0 ? (
                    data.messageTypeStats.map((stat: { messageType: string; count: number; totalSent: number }) => (
                      <div key={stat.messageType} className="flex justify-between items-center">
                        <span className="text-muted-foreground">{stat.messageType}</span>
                        <div className="text-right">
                          <span className="font-bold">{stat.count}건</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({Number(stat.totalSent).toLocaleString()}건 발송)
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-muted-foreground">데이터 없음</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>일별 거래 현황</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.dailyStats?.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2">날짜</th>
                        <th className="text-right py-3 px-2">충전</th>
                        <th className="text-right py-3 px-2">레거시 사용</th>
                        <th className="text-right py-3 px-2">환불</th>
                        <th className="text-right py-3 px-2">거래 건수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.dailyStats.map((stat: { date: string; chargeAmount: number; usageAmount: number; refundAmount: number; transactionCount: number }) => (
                        <tr key={stat.date} className="border-b">
                          <td className="py-3 px-2">{stat.date}</td>
                          <td className="py-3 px-2 text-right text-green-600">
                            +₩{Number(stat.chargeAmount).toLocaleString()}
                          </td>
                          <td className="py-3 px-2 text-right">
                            ₩{Number(stat.usageAmount).toLocaleString()}
                          </td>
                          <td className="py-3 px-2 text-right text-red-600">
                            -₩{Number(stat.refundAmount).toLocaleString()}
                          </td>
                          <td className="py-3 px-2 text-right">{stat.transactionCount}건</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">데이터가 없습니다</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

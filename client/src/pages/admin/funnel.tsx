import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowDown, CheckCircle2, MousePointerClick, Send, ShieldAlert, UserRoundCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type FunnelStep = {
  key: string;
  label: string;
  events: number;
  users: number;
  conversionFromPrevious: number;
  dropoff: number;
};

type FunnelData = {
  period: { days: number; startDate: string | null };
  missingTable: boolean;
  overview: {
    startUsers: number;
    sendUsers: number;
    finalConversion: number;
    failureCount: number;
  };
  funnel: FunnelStep[];
  recentEvents: Array<{
    event_name: string;
    funnel_step: string | null;
    page_path: string | null;
    campaign_id: string | null;
    product_type: string | null;
    created_at: string;
  }>;
  failureEvents: Array<{ eventName: string; count: number }>;
  message?: string;
};

const failureLabels: Record<string, string> = {
  signup_failed: "가입 실패",
  login_failed: "로그인 실패",
  payment_failed: "결제 실패",
  campaign_update_failed: "캠페인 저장 실패",
  send_failed: "발송 실패",
};

function formatNumber(value: number | undefined) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminFunnel() {
  const adminToken = localStorage.getItem("adminToken");
  const [period, setPeriod] = useState("7");

  const { data, isLoading } = useQuery<FunnelData>({
    queryKey: ["/api/admin/funnel", period],
    queryFn: async () => {
      const res = await fetch(`/api/admin/funnel?period=${period}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch funnel");
      return res.json();
    },
  });

  const overview = data?.overview;
  const maxUsers = Math.max(...(data?.funnel || []).map((step) => step.users), 1);
  const activeFailureEvents = data?.failureEvents?.filter((event) => event.count > 0) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">런칭 퍼널</h1>
          <p className="text-muted-foreground">고객이 어디서 멈추는지 확인해요</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">오늘</SelectItem>
            <SelectItem value="7">7일</SelectItem>
            <SelectItem value="30">30일</SelectItem>
            <SelectItem value="90">90일</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data?.missingTable && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>이벤트 테이블을 먼저 만들면 볼 수 있어요</AlertTitle>
          <AlertDescription>
            Neon에서 <code className="rounded bg-muted px-1 py-0.5">migrations/0002_event_logs.sql</code>을 적용하면 퍼널 지표가 쌓여요.
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">시작 사용자</CardTitle>
              <MousePointerClick className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(overview?.startUsers)}명</div>
              <p className="text-xs text-muted-foreground">랜딩 CTA 기준</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">발송 시작</CardTitle>
              <Send className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(overview?.sendUsers)}명</div>
              <p className="text-xs text-muted-foreground">실제 발송 버튼 기준</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">전체 전환율</CardTitle>
              <UserRoundCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overview?.finalConversion || 0}%</div>
              <p className="text-xs text-muted-foreground">시작 대비 발송 시작</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">확인할 실패</CardTitle>
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(overview?.failureCount)}건</div>
              <p className="text-xs text-muted-foreground">가입/결제/발송 실패</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>핵심 흐름</CardTitle>
            <CardDescription>이전 단계 대비 전환율과 이탈 수를 같이 봐요</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLoading ? (
                [...Array(8)].map((_, index) => <Skeleton key={index} className="h-20" />)
              ) : (
                data?.funnel?.map((step, index) => {
                  const width = Math.round((step.users / maxUsers) * 100);
                  return (
                    <div key={step.key} className="rounded-xl border bg-background p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant={index === 0 ? "default" : "secondary"}>{index + 1}</Badge>
                            <h3 className="font-semibold">{step.label}</h3>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            사용자 {formatNumber(step.users)}명 · 이벤트 {formatNumber(step.events)}건
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">{step.conversionFromPrevious}%</div>
                          <p className="text-xs text-muted-foreground">이전 단계 대비</p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        <Progress value={width} className="h-2" />
                        {index > 0 && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <ArrowDown className="h-3 w-3" />
                            이탈 {formatNumber(step.dropoff)}명
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>실패 이벤트</CardTitle>
              <CardDescription>바로 점검할 항목만 보여줘요</CardDescription>
            </CardHeader>
            <CardContent>
              {activeFailureEvents.length ? (
                <div className="space-y-3">
                  {activeFailureEvents.map((event) => (
                    <div key={event.eventName} className="flex items-center justify-between rounded-lg border p-3">
                      <span className="font-medium">{failureLabels[event.eventName] || event.eventName}</span>
                      <Badge variant="destructive">{formatNumber(event.count)}건</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  최근 기간에 큰 실패 이벤트가 없어요.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>최근 이벤트</CardTitle>
              <CardDescription>최근 30개 이벤트를 확인해요</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[420px] space-y-3 overflow-auto pr-1">
                {data?.recentEvents?.length ? (
                  data.recentEvents.map((event, index) => (
                    <div key={`${event.event_name}-${event.created_at}-${index}`} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{event.event_name}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(event.created_at)}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {event.page_path || event.funnel_step || event.product_type || event.campaign_id || "상세 정보 없음"}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">아직 쌓인 이벤트가 없어요.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

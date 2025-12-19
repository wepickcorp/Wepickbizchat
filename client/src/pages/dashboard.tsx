import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  Megaphone, 
  Send, 
  CheckCircle2, 
  MousePointerClick,
  PlusCircle,
  ArrowRight,
  TrendingUp,
  Bell,
  AlertTriangle,
  Info,
  X
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, formatNumber, formatDateTime } from "@/lib/authUtils";
import { StatsCard } from "@/components/stats-card";
import { CampaignStatusBadge } from "@/components/campaign-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";
import type { Campaign } from "@shared/schema";

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  isPinned: boolean;
  createdAt: string;
}

interface DashboardStats {
  totalCampaigns: number;
  activeCampaigns: number;
  totalSent: number;
  totalSuccess: number;
  totalClicks: number;
  successRate: number;
}

export default function Dashboard() {
  const { user, isImpersonating, endImpersonation } = useAuth();
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<string[]>([]);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: recentCampaigns, isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns?limit=5"],
  });

  const { data: announcements } = useQuery<Announcement[]>({
    queryKey: ["/api/announcements"],
  });

  const displayName = user?.firstName 
    ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}님`
    : '사용자님';

  const getAnnouncementIcon = (type: string) => {
    switch (type) {
      case 'warning': return AlertTriangle;
      case 'urgent': return Bell;
      default: return Info;
    }
  };

  const getAnnouncementVariant = (type: string): "default" | "destructive" => {
    return type === 'urgent' || type === 'warning' ? 'destructive' : 'default';
  };

  const visibleAnnouncements = announcements?.filter(a => !dismissedAnnouncements.includes(a.id)) || [];

  return (
    <div className="animate-fade-in space-y-8">
      {isImpersonating && (
        <Alert variant="destructive" className="border-orange-500 bg-orange-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>관리자 대리 로그인 중</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>현재 {user?.email} 계정으로 접속 중입니다. 30분 후 자동 만료됩니다.</span>
            <Button size="sm" variant="outline" onClick={endImpersonation}>
              세션 종료
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {visibleAnnouncements.length > 0 && (
        <div className="space-y-2">
          {visibleAnnouncements.map((announcement) => {
            const IconComponent = getAnnouncementIcon(announcement.type);
            return (
              <Alert key={announcement.id} variant={getAnnouncementVariant(announcement.type)}>
                <IconComponent className="h-4 w-4" />
                <AlertTitle className="flex items-center justify-between">
                  <span>{announcement.title}</span>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-6 w-6" 
                    onClick={() => setDismissedAnnouncements(prev => [...prev, announcement.id])}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </AlertTitle>
                <AlertDescription>{announcement.content}</AlertDescription>
              </Alert>
            );
          })}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-display font-bold" data-testid="text-welcome">
            안녕하세요, {displayName}
          </h1>
          <p className="text-muted-foreground mt-1">
            오늘도 효과적인 광고를 만들어보세요
          </p>
        </div>
        <Button asChild className="gap-2 w-fit" data-testid="button-new-campaign">
          <Link href="/campaigns/new">
            <PlusCircle className="h-4 w-4" />
            캠페인 만들기
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-32" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatsCard
              title="전체 캠페인"
              value={formatNumber(stats?.totalCampaigns || 0)}
              description={`${stats?.activeCampaigns || 0}개 진행 중`}
              icon={Megaphone}
              iconClassName="bg-primary/10"
            />
            <StatsCard
              title="총 발송"
              value={formatNumber(stats?.totalSent || 0)}
              description="누적 발송 건수"
              icon={Send}
              iconClassName="bg-chart-4/10"
            />
            <StatsCard
              title="성공률"
              value={`${stats?.successRate || 0}%`}
              description="평균 도달률"
              icon={CheckCircle2}
              iconClassName="bg-success/10"
            />
            <StatsCard
              title="클릭 수"
              value={formatNumber(stats?.totalClicks || 0)}
              description="총 클릭 수"
              icon={MousePointerClick}
              iconClassName="bg-chart-5/10"
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle className="text-h2">최근 캠페인</CardTitle>
            <Button variant="ghost" size="sm" asChild className="gap-1">
              <Link href="/campaigns" data-testid="link-view-all-campaigns">
                전체 보기
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {campaignsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between py-3 border-b last:border-0">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            ) : recentCampaigns && recentCampaigns.length > 0 ? (
              <div className="space-y-1">
                {recentCampaigns.map((campaign) => (
                  <Link
                    key={campaign.id}
                    href={`/campaigns/${campaign.id}`}
                    className="flex items-center justify-between py-3 px-2 rounded-lg hover-elevate -mx-2"
                    data-testid={`link-campaign-${campaign.id}`}
                  >
                    <div>
                      <p className="font-medium">{campaign.name}</p>
                      <p className="text-small text-muted-foreground">
                        {formatDateTime(campaign.createdAt!)} · {campaign.messageType}
                      </p>
                    </div>
                    <CampaignStatusBadge status={campaign.status} />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Megaphone}
                title="아직 캠페인이 없어요"
                description="첫 캠페인을 만들어 고객에게 광고를 보내보세요"
                action={{
                  label: "캠페인 만들기",
                  onClick: () => window.location.href = '/campaigns/new',
                }}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-h2">광고 잔액</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4">
              <div className="text-4xl font-bold text-primary mb-2" data-testid="text-dashboard-balance">
                {formatCurrency(user?.balance || 0)}
              </div>
              <p className="text-small text-muted-foreground mb-6">
                사용 가능한 잔액
              </p>
              <Button variant="outline" className="w-full gap-2" asChild>
                <Link href="/billing" data-testid="link-charge-from-dashboard">
                  <TrendingUp className="h-4 w-4" />
                  잔액 충전하기
                </Link>
              </Button>
            </div>

            <div className="border-t pt-4 mt-4">
              <p className="text-small text-muted-foreground mb-3">빠른 충전</p>
              <div className="grid grid-cols-2 gap-2">
                {[100000, 300000, 500000, 1000000].map((amount) => (
                  <Button
                    key={amount}
                    variant="secondary"
                    size="sm"
                    className="text-small"
                    data-testid={`button-quick-charge-${amount}`}
                  >
                    {formatCurrency(amount)}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-h2 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              캠페인 성과 추이
            </CardTitle>
            <CardDescription>최근 7일간 발송 현황</CardDescription>
          </CardHeader>
          <CardContent>
            {recentCampaigns && recentCampaigns.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={[
                    { name: '발송', value: stats?.totalSent || 0, fill: 'hsl(var(--chart-4))' },
                    { name: '성공', value: stats?.totalSuccess || 0, fill: 'hsl(var(--success))' },
                    { name: '클릭', value: stats?.totalClicks || 0, fill: 'hsl(var(--primary))' },
                  ]}
                  layout="vertical"
                  margin={{ left: 20, right: 20 }}
                >
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={40} tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: number) => formatNumber(value)}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-small">캠페인을 시작하면 성과가 표시돼요</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-h2">이번 달 성과 요약</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6 py-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{formatNumber(stats?.totalSent || 0)}</p>
                <p className="text-small text-muted-foreground">발송</p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold text-success">{formatNumber(stats?.totalSuccess || 0)}</p>
                <p className="text-small text-muted-foreground">성공</p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold text-primary">{formatNumber(stats?.totalClicks || 0)}</p>
                <p className="text-small text-muted-foreground">클릭</p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{stats?.successRate || 0}%</p>
                <p className="text-small text-muted-foreground">성공률</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

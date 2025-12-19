import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Megaphone, CreditCard, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface DashboardStats {
  totalUsers: number;
  newUsersToday: number;
  activeCampaigns: number;
  totalRevenue: number;
  revenueToday: number;
  totalSent: number;
}

function StatCard({ 
  title, 
  value, 
  change, 
  changeLabel,
  icon: Icon,
  isLoading 
}: { 
  title: string; 
  value: string | number; 
  change?: number;
  changeLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  isLoading?: boolean;
}) {
  const isPositive = change && change > 0;
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {change !== undefined && (
              <p className={`text-xs flex items-center gap-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(change)}% {changeLabel || '전일 대비'}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RecentActivityItem({ action, target, time, admin }: { action: string; target: string; time: string; admin: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div>
        <p className="text-sm font-medium">{action}</p>
        <p className="text-xs text-muted-foreground">{target}</p>
      </div>
      <div className="text-right">
        <p className="text-xs text-muted-foreground">{time}</p>
        <p className="text-xs text-muted-foreground">{admin}</p>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const adminToken = localStorage.getItem("adminToken");

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/admin/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const { data: recentLogs } = useQuery({
    queryKey: ["/api/admin/logs", "recent"],
    queryFn: async () => {
      const res = await fetch("/api/admin/logs?limit=5", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">대시보드</h1>
        <p className="text-muted-foreground">wepick BizChat 운영 현황</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="전체 광고주"
          value={stats?.totalUsers?.toLocaleString() || 0}
          change={stats?.newUsersToday ? Math.round((stats.newUsersToday / (stats.totalUsers || 1)) * 100) : undefined}
          changeLabel={`오늘 +${stats?.newUsersToday || 0}명`}
          icon={Users}
          isLoading={isLoading}
        />
        <StatCard
          title="활성 캠페인"
          value={stats?.activeCampaigns?.toLocaleString() || 0}
          icon={Megaphone}
          isLoading={isLoading}
        />
        <StatCard
          title="오늘 충전액"
          value={`₩${(stats?.revenueToday || 0).toLocaleString()}`}
          icon={CreditCard}
          isLoading={isLoading}
        />
        <StatCard
          title="총 발송량"
          value={(stats?.totalSent || 0).toLocaleString()}
          icon={TrendingUp}
          isLoading={isLoading}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>최근 활동</CardTitle>
            <CardDescription>관리자 활동 로그</CardDescription>
          </CardHeader>
          <CardContent>
            {recentLogs?.logs?.length > 0 ? (
              recentLogs.logs.map((log: any, i: number) => (
                <RecentActivityItem
                  key={log.id || i}
                  action={log.action}
                  target={log.targetType ? `${log.targetType}: ${log.targetId?.slice(0, 8)}...` : '-'}
                  time={new Date(log.createdAt).toLocaleString('ko-KR')}
                  admin={log.adminName || '관리자'}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                최근 활동이 없습니다
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>빠른 액션</CardTitle>
            <CardDescription>자주 사용하는 기능</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <a
              href="/admin/users"
              className="block p-3 rounded-lg border hover-elevate transition-colors"
              data-testid="link-admin-users"
            >
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">광고주 관리</p>
                  <p className="text-xs text-muted-foreground">계정 조회 및 잔액 조정</p>
                </div>
              </div>
            </a>
            <a
              href="/admin/transactions"
              className="block p-3 rounded-lg border hover-elevate transition-colors"
              data-testid="link-admin-transactions"
            >
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">결제 내역</p>
                  <p className="text-xs text-muted-foreground">충전 및 사용 내역 확인</p>
                </div>
              </div>
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

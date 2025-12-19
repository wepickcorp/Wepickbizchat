import { useEffect, useState } from "react";
import { useLocation, Link, Route, Switch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LayoutDashboard,
  Megaphone,
  Users,
  Calculator,
  LogOut,
  Building2,
  TrendingUp,
  Wallet,
  Calendar,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface AgencyInfo {
  id: string;
  name: string;
  contactName?: string;
  contactEmail?: string;
}

interface DashboardStats {
  subAccountCount: number;
  totalSpendThisMonth: number;
  totalCampaigns: number;
  activeCampaigns: number;
  commissionRate: number;
  estimatedCommission: number;
}

function AgencySidebar() {
  const [location] = useLocation();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const agencyUser = localStorage.getItem("agencyUser");
  const agency: AgencyInfo | null = agencyUser ? JSON.parse(agencyUser) : null;

  const handleLogout = () => {
    localStorage.removeItem("agencyToken");
    localStorage.removeItem("agencyUser");
    toast({ title: "로그아웃 완료" });
    navigate("/admin/login");
  };

  const menuItems = [
    { path: "/agency", label: "대시보드", icon: LayoutDashboard },
    { path: "/agency/campaigns", label: "캠페인", icon: Megaphone },
    { path: "/agency/advertisers", label: "광고주 관리", icon: Users },
    { path: "/agency/commission", label: "대행 수수료", icon: Calculator },
  ];

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-card">
      <div className="flex items-center gap-2 border-b p-4">
        <Building2 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="font-semibold">대행사 포털</h1>
          <p className="text-xs text-muted-foreground truncate">{agency?.name}</p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.path || (item.path !== "/agency" && location.startsWith(item.path));
          return (
            <Link key={item.path} href={item.path}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className="w-full justify-start"
                data-testid={`nav-${item.path.replace("/agency", "agency")}`}
              >
                <Icon className="h-4 w-4 mr-2" />
                {item.label}
              </Button>
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4">
        <Button variant="ghost" className="w-full justify-start" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          로그아웃
        </Button>
      </div>
    </div>
  );
}

function AgencyDashboard() {
  const agencyToken = localStorage.getItem("agencyToken");

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/agency/stats"],
    queryFn: async () => {
      const res = await fetch("/api/agency/stats", {
        headers: { Authorization: `Bearer ${agencyToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const formatCurrency = (amount: number) => {
    if (amount >= 100000000) {
      return `${(amount / 100000000).toFixed(1)}억원`;
    }
    if (amount >= 10000) {
      return `${(amount / 10000).toFixed(0)}만원`;
    }
    return `${amount.toLocaleString()}원`;
  };

  const getCommissionTierInfo = (spend: number) => {
    if (spend >= 100000000) return { rate: 20, tier: "플래티넘", nextTarget: null, color: "text-purple-500" };
    if (spend >= 50000000) return { rate: 15, tier: "골드", nextTarget: 100000000, color: "text-yellow-500" };
    return { rate: 10, tier: "실버", nextTarget: 50000000, color: "text-gray-400" };
  };

  const tierInfo = stats ? getCommissionTierInfo(stats.totalSpendThisMonth) : { rate: 10, tier: "실버", nextTarget: 50000000, color: "text-gray-400" };
  const progressToNextTier = stats && tierInfo.nextTarget 
    ? (stats.totalSpendThisMonth / tierInfo.nextTarget) * 100 
    : 100;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">대행사 대시보드</h1>
        <p className="text-muted-foreground">이번 달 실적과 수수료를 확인하세요</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">하위 광고주</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.subAccountCount || 0}개</div>
                <p className="text-xs text-muted-foreground">등록된 광고주 계정</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">이번 달 매출</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(stats?.totalSpendThisMonth || 0)}</div>
                <p className="text-xs text-muted-foreground">하위 계정 광고비 소진액</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">예상 수수료</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(stats?.estimatedCommission || 0)}</div>
                <Badge className={tierInfo.color}>{tierInfo.rate}% ({tierInfo.tier})</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium">활성 캠페인</CardTitle>
                <Megaphone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.activeCampaigns || 0}개</div>
                <p className="text-xs text-muted-foreground">총 {stats?.totalCampaigns || 0}개 캠페인</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                수수료 등급 현황
              </CardTitle>
              <CardDescription>
                다음 등급까지 {tierInfo.nextTarget ? formatCurrency(tierInfo.nextTarget - (stats?.totalSpendThisMonth || 0)) : "최고 등급 달성"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>현재 매출: {formatCurrency(stats?.totalSpendThisMonth || 0)}</span>
                  <span className={tierInfo.color}>{tierInfo.tier} ({tierInfo.rate}%)</span>
                </div>
                <Progress value={Math.min(progressToNextTier, 100)} className="h-3" />
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">실버</p>
                  <p className="font-semibold">10%</p>
                  <p className="text-xs">~5천만원</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">골드</p>
                  <p className="font-semibold text-yellow-500">15%</p>
                  <p className="text-xs">5천만원~</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">플래티넘</p>
                  <p className="font-semibold text-purple-500">20%</p>
                  <p className="text-xs">1억원~</p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>정산 예정일: 익월 30일</span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function AgencyCampaigns() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">캠페인 관리</h1>
      <p className="text-muted-foreground">하위 광고주들의 캠페인을 조회합니다</p>
      <Card className="mt-6">
        <CardContent className="p-8 text-center text-muted-foreground">
          캠페인 목록이 여기에 표시됩니다
        </CardContent>
      </Card>
    </div>
  );
}

function AgencyAdvertisers() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">광고주 관리</h1>
      <p className="text-muted-foreground">소속 광고주 계정을 관리합니다</p>
      <Card className="mt-6">
        <CardContent className="p-8 text-center text-muted-foreground">
          광고주 목록이 여기에 표시됩니다
        </CardContent>
      </Card>
    </div>
  );
}

function AgencyCommission() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">대행 수수료</h1>
      <p className="text-muted-foreground">월별 수수료 내역을 확인합니다</p>
      <Card className="mt-6">
        <CardContent className="p-8 text-center text-muted-foreground">
          수수료 내역이 여기에 표시됩니다
        </CardContent>
      </Card>
    </div>
  );
}

export default function AgencyPortal() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const token = localStorage.getItem("agencyToken");
    if (!token) {
      toast({ title: "로그인이 필요합니다", variant: "destructive" });
      navigate("/admin/login");
    }
  }, [navigate, toast]);

  return (
    <div className="flex h-screen">
      <AgencySidebar />
      <main className="flex-1 overflow-auto bg-muted/30">
        <Switch>
          <Route path="/agency" component={AgencyDashboard} />
          <Route path="/agency/campaigns" component={AgencyCampaigns} />
          <Route path="/agency/advertisers" component={AgencyAdvertisers} />
          <Route path="/agency/commission" component={AgencyCommission} />
        </Switch>
      </main>
    </div>
  );
}

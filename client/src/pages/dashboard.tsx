import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  ChevronRight,
  Coins,
  Info,
  Megaphone,
  PlusCircle,
  TrendingUp,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { formatNumber, formatDateTime } from "@/lib/authUtils";
import { CampaignStatusBadge } from "@/components/campaign-status-badge";
import { EmptyState } from "@/components/empty-state";
import { AppIconTile } from "@/components/app-icon-tile";
import {
  FeatureAlertIcon,
  featureObjectIcons,
} from "@/components/feature-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CREDIT_PRODUCTS } from "@shared/credit-policy";
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

interface CreditSummary {
  enabled: boolean;
  availableCredits?: number;
  effectiveAvailableCredits: number;
  totalUsedCredits?: number;
  expiringSoonCredits?: number;
}

const IN_PROGRESS_STATUSES = new Set([
  "draft",
  "pending",
  "pending_review",
  "review_pending",
  "approved",
  "scheduled",
  "sending",
]);

function getTaskCopy(campaign?: Campaign, hasCreditShortage = false) {
  if (hasCreditShortage) {
    return {
      title: "문자를 보내려면 크레딧을 충전해요",
      description: "문자 발송은 최소 2,000C부터 시작할 수 있어요.",
      actionLabel: "크레딧 충전하기",
      href: "/billing",
    };
  }

  if (campaign) {
    const status = String(campaign.status || "");
    if (status.includes("review") || status === "pending") {
      return {
        title: `${campaign.name} 검수가 필요해요`,
        description: "검수를 마치면 발송 예약 단계로 넘어갈 수 있어요.",
        actionLabel: "캠페인 확인하기",
        href: `/campaigns/${campaign.id}`,
      };
    }

    if (status === "scheduled" || status === "approved") {
      return {
        title: `${campaign.name} 발송 전 상태를 확인해주세요`,
        description: "발송 일정과 차감 예정 크레딧을 다시 확인해보세요.",
        actionLabel: "발송 확인하기",
        href: `/campaigns/${campaign.id}`,
      };
    }

    return {
      title: `${campaign.name} 작업을 이어갈 수 있어요`,
      description: "작성하던 캠페인을 이어서 준비해보세요.",
      actionLabel: "이어하기",
      href: `/campaigns/${campaign.id}`,
    };
  }

  return {
    title: "오늘 보낼 문자를 준비해요",
    description: "메시지, 받을 고객, 크레딧을 한 번에 확인하면서 보낼 수 있어요.",
    actionLabel: "문자 보내기",
    href: "/campaigns/new",
  };
}

export default function Dashboard() {
  const { user, isImpersonating, endImpersonation } = useAuth();
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<string[]>([]);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: recentCampaigns, isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns?limit=2"],
  });

  const { data: announcements } = useQuery<Announcement[]>({
    queryKey: ["/api/announcements"],
  });

  const { data: creditSummary } = useQuery<CreditSummary>({
    queryKey: ["/api/credits/summary"],
  });

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}님`
    : "사용자님";
  const legacyBalance = Number.parseFloat(String(user?.balance ?? "0")) || 0;
  const creditBalance = creditSummary?.enabled
    ? Number(creditSummary.effectiveAvailableCredits ?? 0)
    : legacyBalance;
  const expiringSoonCredits = Number(creditSummary?.expiringSoonCredits ?? 0);
  const totalUsedCredits = creditSummary?.enabled
    ? Number(creditSummary.totalUsedCredits ?? 0)
    : Math.floor(Number(stats?.totalSent ?? 0) * 2);
  const sendableMessages = Math.floor(creditBalance / 2);
  const hasCreditShortage = creditBalance < 2000;
  const quickCreditProducts = [
    CREDIT_PRODUCTS.light,
    CREDIT_PRODUCTS.topup,
    CREDIT_PRODUCTS.booster,
    CREDIT_PRODUCTS.enterprise,
  ];

  const primaryCampaignTask = useMemo(() => {
    return recentCampaigns?.find((campaign) =>
      IN_PROGRESS_STATUSES.has(String(campaign.status || ""))
    );
  }, [recentCampaigns]);
  const displayedRecentCampaigns = recentCampaigns?.slice(0, 2);

  const task = getTaskCopy(primaryCampaignTask, hasCreditShortage);

  const getAnnouncementIcon = (type: string) => {
    switch (type) {
      case "warning":
        return AlertTriangle;
      case "urgent":
        return Bell;
      default:
        return Info;
    }
  };

  const getAnnouncementVariant = (type: string): "default" | "destructive" => {
    return type === "urgent" || type === "warning" ? "destructive" : "default";
  };

  const visibleAnnouncements = announcements?.filter(a => !dismissedAnnouncements.includes(a.id)) || [];

  return (
    <div className="animate-fade-in space-y-6">
      {isImpersonating && (
        <Alert variant="destructive" className="border-orange-500 bg-orange-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>관리자 대리 로그인 중</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
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
                <AlertTitle className="flex items-center justify-between gap-3">
                  <span>{announcement.title}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <Card className="overflow-hidden border-primary/15 bg-card">
          <CardContent className="p-0">
            <div className="p-5 md:p-6">
              <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-caption font-medium text-muted-foreground">현재 보유 크레딧</p>
                  <div className="mt-2 flex items-end gap-2">
                    <p className="text-[2.75rem] font-bold leading-[3.25rem] text-foreground md:text-[3.25rem] md:leading-[3.75rem]" data-testid="text-dashboard-balance">
                      {formatNumber(creditBalance)}
                    </p>
                    <span className="pb-2 text-title-sm font-semibold text-muted-foreground">C</span>
                  </div>
                  <p className="mt-3 text-small text-muted-foreground">
                    문자 기준 최대 {formatNumber(sendableMessages)}건 발송 가능해요.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 md:min-w-[280px]">
                  <Button
                    variant={hasCreditShortage ? "outline" : "default"}
                    className={`gap-2 ${
                      hasCreditShortage ? "border-primary/20 bg-primary/5 text-primary hover:bg-primary/10" : ""
                    }`}
                    asChild
                    data-testid="button-new-campaign"
                  >
                    <Link href="/campaigns/new">
                      <PlusCircle className="h-4 w-4" />
                      문자 보내기
                    </Link>
                  </Button>
                  <Button
                    variant={hasCreditShortage ? "default" : "outline"}
                    className={`gap-2 ${
                      hasCreditShortage ? "" : "border-primary/20 bg-primary/5 text-primary hover:bg-primary/10"
                    }`}
                    asChild
                  >
                    <Link href="/billing" data-testid="link-charge-from-dashboard">
                      <Coins className="h-4 w-4" />
                      충전하기
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-muted/60 p-4">
                  <p className="text-caption font-medium text-muted-foreground">이번 달 사용</p>
                  <p className="mt-2 text-title-md font-bold">{formatNumber(totalUsedCredits)}C</p>
                </div>
                <div className="rounded-lg bg-muted/60 p-4">
                  <p className="text-caption font-medium text-muted-foreground">발송 가능</p>
                  <p className="mt-2 text-title-md font-bold">{formatNumber(sendableMessages)}건</p>
                </div>
                <div className="rounded-lg bg-muted/60 p-4">
                  <p className="text-caption font-medium text-muted-foreground">30일 내 만료 예정</p>
                  <p className="mt-2 text-title-md font-bold">{formatNumber(expiringSoonCredits)}C</p>
                </div>
              </div>

              {hasCreditShortage && (
                <div className="mt-4 flex flex-col gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
                    <div>
                      <p className="font-semibold text-destructive">
                        문자를 보내려면 최소 2,000C가 필요해요.
                      </p>
                      <p className="text-small text-muted-foreground">
                        크레딧을 충전하면 바로 문자 발송을 준비할 수 있어요.
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" asChild>
                    <Link href="/billing">충전하러 가기</Link>
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b pb-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">지금 해야 할 일</CardTitle>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-tiny font-bold text-primary">
                {primaryCampaignTask || hasCreditShortage ? "1건" : "추천"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-5 md:p-6">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <AppIconTile
                  icon={hasCreditShortage ? FeatureAlertIcon : undefined}
                  imageSrc={hasCreditShortage ? undefined : featureObjectIcons.clock}
                  tone={hasCreditShortage ? "red" : "blue"}
                  className="h-10 w-10 rounded-[14px]"
                  imageClassName="h-7 w-7"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{task.title}</p>
                  <p className="mt-1 text-small text-muted-foreground">{task.description}</p>
                </div>
              </div>
              <Button className="mt-4 w-full gap-2" asChild>
                <Link href={task.href}>
                  {task.actionLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {quickCreditProducts.slice(0, 2).map((product) => (
                <Button
                  key={product.productType}
                  variant="secondary"
                  size="sm"
                  className="h-auto min-h-14 flex-col gap-0 bg-card text-small"
                  data-testid={`button-quick-charge-${product.productType}`}
                  asChild
                >
                  <Link href="/billing">
                    <span>{product.name}</span>
                    <span className="text-tiny text-muted-foreground">
                      {formatNumber(product.credits)}C
                    </span>
                  </Link>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="text-base">이번 달 성과</CardTitle>
          <CardDescription>발송과 크레딧 사용 흐름을 한눈에 볼 수 있어요.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {statsLoading ? (
            <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-card p-5">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="mt-3 h-8 w-28" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "총 발송", value: `${formatNumber(stats?.totalSent || 0)}건`, imageSrc: featureObjectIcons.send, tone: "orange" as const },
                { label: "발송 성공률", value: `${stats?.successRate || 0}%`, imageSrc: featureObjectIcons.check, tone: "green" as const },
                { label: "사용 크레딧", value: `${formatNumber(totalUsedCredits)}C`, imageSrc: featureObjectIcons.data, tone: "blue" as const },
                { label: "클릭 수", value: `${formatNumber(stats?.totalClicks || 0)}건`, imageSrc: featureObjectIcons.click, tone: "purple" as const },
              ].map((item) => (
                <div key={item.label} className="bg-card p-5">
                  <div className="mb-3 flex items-center gap-3">
                    <AppIconTile imageSrc={item.imageSrc} tone={item.tone} className="h-9 w-9 rounded-[14px]" imageClassName="h-6 w-6" />
                    <p className="text-small text-muted-foreground">{item.label}</p>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="flex flex-col items-start gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <CardTitle className="text-base">최근 발송</CardTitle>
              <CardDescription>최근 문자 상태만 간단히 확인해요.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="min-h-10 gap-1 px-0 sm:px-3">
              <Link href="/campaigns/history" data-testid="link-view-all-campaigns">
                전체 보기
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {campaignsLoading ? (
              <div className="space-y-0">
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-center justify-between border-b px-4 py-3 last:border-0">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-7 w-20" />
                  </div>
                ))}
              </div>
            ) : displayedRecentCampaigns && displayedRecentCampaigns.length > 0 ? (
              <div>
                {displayedRecentCampaigns.map((campaign, index) => (
                  <Link
                    key={campaign.id}
                    href={`/campaigns/${campaign.id}`}
                    className="flex min-w-0 items-center justify-between gap-3 border-b px-4 py-3 transition-colors hover:bg-muted/50 last:border-0"
                    data-testid={`link-campaign-${campaign.id}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-small font-semibold">{campaign.name}</p>
                      <p className="mt-0.5 truncate text-caption text-muted-foreground">
                        {formatDateTime(campaign.createdAt!)} · {campaign.messageType}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <CampaignStatusBadge status={campaign.status} />
                      {index === 0 && <ChevronRight className="hidden h-4 w-4 text-muted-foreground sm:block" />}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-4 py-5 sm:p-5">
                <EmptyState
                  icon={Megaphone}
                  title="아직 캠페인이 없어요"
                  description="첫 문자를 준비해서 고객에게 광고를 보내보세요."
                  action={{
                    label: "문자 보내기",
                    onClick: () => window.location.href = "/campaigns/new",
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="border-b pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <AppIconTile imageSrc={featureObjectIcons.click} tone="purple" className="h-8 w-8 rounded-xl" imageClassName="h-5 w-5" />
              운영 요약
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-4 py-5 sm:p-5 md:p-6">
            <div className="rounded-lg bg-muted/60 p-4">
              <p className="text-small text-muted-foreground">진행 중 캠페인</p>
              <p className="mt-2 text-h2 font-bold">{formatNumber(stats?.activeCampaigns || 0)}개</p>
            </div>
            <div className="rounded-lg bg-muted/60 p-4">
              <p className="text-small text-muted-foreground">전체 캠페인</p>
              <p className="mt-2 text-h2 font-bold">{formatNumber(stats?.totalCampaigns || 0)}개</p>
            </div>
            <Button variant="outline" className="w-full gap-2" asChild>
              <Link href="/reports">
                리포트 보기
                <TrendingUp className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

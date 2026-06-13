import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  LogOut,
  MessageSquareText,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getUserFacingMessageName } from "@/lib/display-copy";
import { AppIconTile } from "@/components/app-icon-tile";
import {
  featureObjectIcons,
} from "@/components/feature-icons";

interface CreditSummary {
  enabled: boolean;
  effectiveAvailableCredits: number;
  reservedCredits: number;
}

interface MessageCopyRequest {
  id: string;
  content: string;
  status: string;
  adminNote?: string | null;
  rejectionReason?: string | null;
  templateId?: string | null;
  promotedTemplateId?: string | null;
  templateName?: string | null;
  createdAt: string;
}

function navigate(href: string) {
  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const quickActions = [
  { label: "문자 보내기", href: "/campaigns/new", imageSrc: featureObjectIcons.send, tone: "orange" as const },
  { label: "크레딧 충전", href: "/billing", imageSrc: featureObjectIcons.data, tone: "blue" as const },
  { label: "리포트", href: "/reports", imageSrc: featureObjectIcons.click, tone: "purple" as const },
];

const operationMenus = [
  { label: "문자 발송 목록", desc: "준비 중이거나 보낸 문자 확인", href: "/campaigns/history", imageSrc: featureObjectIcons.megaphone, tone: "orange" as const },
  { label: "발신번호 관리", desc: "기존 발신번호 정책 그대로 사용", href: "/sender-numbers", imageSrc: featureObjectIcons.phone, tone: "green" as const },
  { label: "발송 내역", desc: "발송 결과와 상태 확인", href: "/send-history", imageSrc: featureObjectIcons.check, tone: "green" as const },
];

const supportMenus = [
  { label: "세금계산서", desc: "발행 신청과 처리 현황", href: "/tax-invoices", imageSrc: featureObjectIcons.receipt, tone: "purple" as const },
  { label: "공지사항", desc: "운영 안내와 업데이트", href: "/announcements", imageSrc: featureObjectIcons.bell, tone: "orange" as const },
  { label: "계정 설정", desc: "프로필과 로그인 정보", href: "/settings", imageSrc: featureObjectIcons.settings, tone: "slate" as const },
];

export default function MorePage() {
  const { user, signOut } = useAuth();
  const { data: creditSummary } = useQuery<CreditSummary>({
    queryKey: ["/api/credits/summary"],
  });
  const { data: copyRequestData } = useQuery<{ requests: MessageCopyRequest[]; pendingCount: number }>({
    queryKey: ["/api/message-copy-requests"],
  });

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName || ""}`
    : user?.email?.split("@")[0] || "사용자";
  const initials = displayName.slice(0, 2).toUpperCase();
  const legacyBalance = user?.balance ? parseFloat(user.balance as string) : 0;
  const balance = creditSummary?.enabled
    ? Number(creditSummary.effectiveAvailableCredits ?? 0)
    : legacyBalance;
  const copyRequests = copyRequestData?.requests || [];
  const pendingCopyRequestCount = copyRequestData?.pendingCount || 0;
  const latestCopyRequest = copyRequests[0];
  const canUseLatestRequestTemplate =
    latestCopyRequest?.status === "approved_private" || latestCopyRequest?.status === "promoted";
  const latestRequestTemplateId = latestCopyRequest?.templateId || latestCopyRequest?.promotedTemplateId || null;

  return (
    <div className="animate-fade-in space-y-6">
      <Card className="overflow-hidden border-primary/15">
        <CardContent className="p-0">
          <div className="bg-primary/5 p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-title-md font-bold">{displayName}</h2>
                </div>
                <p className="mt-1 truncate text-caption text-muted-foreground">
                  {user?.email || "이메일 없음"}
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-caption text-muted-foreground">보유 크레딧</p>
              <p className="mt-2 text-title-md font-bold">{balance.toLocaleString("ko-KR")}C</p>
              <p className="mt-1 text-tiny text-muted-foreground">
                최대 {Math.floor(balance / 2).toLocaleString("ko-KR")}건 발송 가능
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/settings")}
              className="rounded-lg border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-sm"
              data-testid="button-more-profile"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                <p className="text-body-lg font-semibold">마이페이지</p>
                  <p className="mt-1 text-caption text-muted-foreground">내 정보와 로그인 정보 관리</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-title-sm font-bold">빠른 실행</h2>
        <div className="grid grid-cols-3 gap-3">
          {quickActions.map((item) => (
            <button
              key={item.href}
              type="button"
              onClick={() => navigate(item.href)}
              className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border bg-card p-3 text-center transition-all hover:border-primary/50 hover:shadow-sm"
              data-testid={`button-more-quick-${item.href.replace(/\//g, "-")}`}
            >
              <AppIconTile imageSrc={item.imageSrc} tone={item.tone} className="h-9 w-9 rounded-[13px]" imageClassName="h-6 w-6" />
              <span className="text-caption font-semibold">{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      <MenuSection title="운영 메뉴" items={operationMenus} />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-title-sm font-bold">내 메시지 유형 요청</h2>
          {pendingCopyRequestCount > 0 ? (
            <Badge variant="secondary">{pendingCopyRequestCount}건 검토 중</Badge>
          ) : (
            <Badge variant="outline">요청 없음</Badge>
          )}
        </div>
        <Card>
          <CardContent className="p-4">
            {latestCopyRequest ? (
              <div className="flex items-start gap-3">
                <AppIconTile imageSrc={featureObjectIcons.message} tone="orange" className="h-8 w-8 rounded-[12px]" imageClassName="h-5 w-5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">최근 요청</p>
                    <CopyRequestStatusBadge status={latestCopyRequest.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-small text-muted-foreground">
                    {latestCopyRequest.content}
                  </p>
                  {latestCopyRequest.templateName && (
                    <p className="mt-2 text-small font-medium text-primary">
                      반영된 메시지: {getUserFacingMessageName(latestCopyRequest.templateName)}
                    </p>
                  )}
                  {(latestCopyRequest.rejectionReason || latestCopyRequest.adminNote) && (
                    <p className="mt-2 text-small text-muted-foreground">
                      {latestCopyRequest.rejectionReason || latestCopyRequest.adminNote}
                    </p>
                  )}
                  {canUseLatestRequestTemplate && (
                    <Button
                      type="button"
                      size="sm"
                      className="mt-3 min-h-10"
                      onClick={() => {
                        const params = new URLSearchParams({ openTemplates: "1" });
                        if (latestRequestTemplateId) params.set("templateId", latestRequestTemplateId);
                        navigate(`/campaigns/new?${params.toString()}`);
                      }}
                      data-testid="button-use-copy-request-template"
                    >
                      이 메시지로 문자 보내기
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/campaigns/new")}
                className="flex w-full items-start gap-3 rounded-lg text-left transition-colors hover:bg-muted/40"
                data-testid="button-more-empty-copy-request"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <MessageSquareText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">필요한 메시지 유형을 요청할 수 있어요</p>
                  <p className="mt-1 text-small text-muted-foreground">
                    문자 보내기에서 찾는 메시지 유형이 없을 때만 조용히 요청할 수 있어요.
                  </p>
                </div>
                <ChevronRight className="mt-3 h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </CardContent>
        </Card>
      </section>

      <MenuSection title="고객/계정" items={supportMenus} />

      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full justify-start gap-2 text-destructive hover:text-destructive"
        onClick={signOut}
        data-testid="button-more-logout"
      >
        <LogOut className="h-4 w-4" />
        로그아웃
      </Button>
    </div>
  );
}

function CopyRequestStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    reviewing: { label: "검토 중", variant: "secondary" },
    approved_private: { label: "고객 전용 등록", variant: "default" },
    rejected: { label: "정보 보완 필요", variant: "destructive" },
    promoted: { label: "공용 등록", variant: "outline" },
  };
  const item = config[status] || config.reviewing;
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

function MenuSection({
  title,
  items,
}: {
  title: string;
  items: Array<{
    label: string;
    desc: string;
    href: string;
    icon?: ComponentType<SVGProps<SVGSVGElement>>;
    imageSrc?: string;
    imageClassName?: string;
    tone: "orange" | "blue" | "green" | "red" | "purple" | "slate";
  }>;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-title-sm font-bold">{title}</h2>
      <Card>
        <CardContent className="divide-y p-0">
          {items.map((item) => (
            <button
              key={item.href}
              type="button"
              onClick={() => navigate(item.href)}
              className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
              data-testid={`button-more-menu-${item.href.replace(/\//g, "-")}`}
            >
              <AppIconTile
                icon={item.icon}
                imageSrc={item.imageSrc}
                tone={item.tone}
                className="h-8 w-8 rounded-[12px]"
                iconClassName="h-4 w-4"
                imageClassName={item.imageClassName || "h-5 w-5"}
              />
              <div className="min-w-0 flex-1">
                <p className="text-body-md font-semibold">{item.label}</p>
                <p className="truncate text-caption text-muted-foreground">{item.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

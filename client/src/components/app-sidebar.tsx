import {
  Archive,
  LayoutDashboard,
  Megaphone,
  PlusCircle,
  Coins,
  BarChart3,
  History,
  Phone,
  Receipt,
  Bell,
  MapPin,
  ChevronRight,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useQuery } from "@tanstack/react-query";
import { BrandLogo } from "@/components/brand-logo";
import { AppNavIcon } from "@/components/app-icon-tile";

interface CreditSummary {
  enabled: boolean;
  effectiveAvailableCredits: number;
}

function navigate(href: string) {
  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const mainNavItems = [
  {
    title: "대시보드",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "캠페인",
    url: "/campaigns",
    icon: Megaphone,
  },
  {
    title: "크레딧",
    url: "/billing",
    icon: Coins,
  },
  {
    title: "리포트",
    url: "/reports",
    icon: BarChart3,
  },
];

const campaignNavItems = [
  {
    title: "문자 보내기",
    url: "/campaigns/new",
    icon: PlusCircle,
  },
  {
    title: "발송 목록",
    url: "/campaigns/history",
    icon: History,
  },
  {
    title: "발송 내역",
    url: "/send-history",
    icon: History,
  },
];

const preparationNavItems = [
  {
    title: "발신번호",
    url: "/sender-numbers",
    icon: Phone,
  },
  {
    title: "지오펜스",
    url: "/geofences",
    icon: MapPin,
  },
];

const subNavItems = [
  {
    title: "세금계산서",
    url: "/tax-invoices",
    icon: Receipt,
  },
  {
    title: "공지사항",
    url: "/announcements",
    icon: Bell,
  },
  {
    title: "리포트",
    url: "/reports",
    icon: BarChart3,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { data: creditSummary } = useQuery<CreditSummary>({
    queryKey: ["/api/credits/summary"],
  });

  const legacyBalance = user?.balance ? parseFloat(user.balance as string) : 0;
  const balance = creditSummary?.enabled
    ? Number(creditSummary.effectiveAvailableCredits ?? 0)
    : legacyBalance;
  const sendableMessages = Math.floor(balance / 2);
  const isNavActive = (url: string) => {
    if (url === "/dashboard") return location === url || location === "/";
    if (url === "/campaigns") return location.startsWith("/campaigns");
    return location === url || location.startsWith(`${url}/`);
  };
  const primaryActionLabel = balance < 2000 ? "크레딧 충전" : "문자 보내기";
  const primaryActionHref = balance < 2000 ? "/billing" : "/campaigns/new";

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border bg-card p-4">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex min-h-11 w-full items-center gap-3 rounded-lg text-left transition-colors hover:bg-muted/60"
          data-testid="link-logo"
        >
          <BrandLogo compact />
        </button>
      </SidebarHeader>
      <SidebarContent className="custom-scrollbar bg-card">
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">주요 메뉴</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => {
                const active = isNavActive(item.url);
                return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.url)}
                    isActive={active}
                    className="min-h-11 cursor-pointer rounded-lg px-3 data-[active=true]:bg-primary/10 data-[active=true]:font-semibold data-[active=true]:text-primary"
                    data-testid={`link-nav-${item.url.replace(/\//g, '-')}`}
                  >
                    <AppNavIcon icon={item.icon} active={active} />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )})}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">빠른 작업</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {campaignNavItems.map((item) => {
                const active = location === item.url || (item.url !== '/' && location.startsWith(item.url));
                return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.url)}
                    isActive={active}
                    className="min-h-11 cursor-pointer rounded-lg px-3 data-[active=true]:bg-primary/10 data-[active=true]:font-semibold data-[active=true]:text-primary"
                    data-testid={`link-nav-${item.url.replace(/\//g, '-')}`}
                  >
                    <AppNavIcon icon={item.icon} active={active} />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )})}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">발송 준비</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {preparationNavItems.map((item) => {
                const active = location === item.url || (item.url !== '/' && location.startsWith(item.url));
                return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.url)}
                    isActive={active}
                    className="min-h-11 cursor-pointer rounded-lg px-3 data-[active=true]:bg-primary/10 data-[active=true]:font-semibold data-[active=true]:text-primary"
                    data-testid={`link-nav-${item.url.replace(/\//g, '-')}`}
                  >
                    <AppNavIcon icon={item.icon} active={active} />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )})}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">운영</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {subNavItems.map((item) => {
                const active = location === item.url;
                return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.url)}
                    isActive={active}
                    className="min-h-11 cursor-pointer rounded-lg px-3 data-[active=true]:bg-primary/10 data-[active=true]:font-semibold data-[active=true]:text-primary"
                    data-testid={`link-nav-${item.url.replace(/\//g, '-')}`}
                  >
                    <AppNavIcon icon={item.icon} active={active} />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )})}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">크레딧</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="px-3 py-2">
              <div className="rounded-lg border border-primary/15 bg-primary/5 p-4">
                <div className="mb-1 flex items-center gap-1.5 text-tiny font-medium text-primary">
                  <Coins className="h-3.5 w-3.5" />
                  보유 크레딧
                </div>
                <div className="text-h2 font-bold text-foreground" data-testid="text-balance">
                  {balance.toLocaleString("ko-KR")}C
                </div>
                <div className="mb-3 text-tiny text-muted-foreground">
                  최대 {sendableMessages.toLocaleString("ko-KR")}건 발송 가능
                </div>
                <button
                  onClick={() => navigate(primaryActionHref)}
                  className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-tiny font-semibold text-primary-foreground hover-elevate active-elevate-2"
                  data-testid="link-charge"
                >
                  {primaryActionLabel}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <div className="px-3 pb-4">
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-3 text-tiny text-muted-foreground">
                <Archive className="h-3.5 w-3.5" />
                기존 기능은 그대로 보존돼요.
              </div>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

import {
  LayoutDashboard,
  Megaphone,
  PlusCircle,
  Wallet,
  BarChart3,
  FileText,
  FilePlus,
  History,
  Phone,
  Receipt,
  Bell,
  MapPin,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/authUtils";
import logoImage from "@assets/logo_optimized.png";
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
];

const campaignNavItems = [
  {
    title: "캠페인 만들기",
    url: "/campaigns/new",
    icon: PlusCircle,
  },
  {
    title: "캠페인 목록",
    url: "/campaigns",
    icon: Megaphone,
  },
  {
    title: "발송 내역",
    url: "/send-history",
    icon: History,
  },
];

const preparationNavItems = [
  {
    title: "메세지 만들기",
    url: "/templates/new",
    icon: FilePlus,
  },
  {
    title: "메세지 목록",
    url: "/templates",
    icon: FileText,
  },
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
    title: "잔액 관리",
    url: "/billing",
    icon: Wallet,
  },
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

  const balance = user?.balance ? parseFloat(user.balance as string) : 0;

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <button 
          onClick={() => navigate("/dashboard")} 
          className="flex items-center gap-3 w-full text-left" 
          data-testid="link-logo"
        >
          <img src={logoImage} alt="wepick x SKT 로고" className="h-9 w-auto" />
          <div className="flex flex-col">
            <span className="font-bold text-sm text-sidebar-foreground">wepickbizchat</span>
            <span className="text-tiny text-muted-foreground">광고관리</span>
          </div>
        </button>
      </SidebarHeader>
      <SidebarContent className="custom-scrollbar">
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">홈</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.url)}
                    isActive={location === item.url || location === '/'}
                    className="data-[active=true]:bg-sidebar-accent cursor-pointer"
                    data-testid={`link-nav-${item.url.replace(/\//g, '-')}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">캠페인 관리</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {campaignNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.url)}
                    isActive={location === item.url || (item.url !== '/' && location.startsWith(item.url))}
                    className="data-[active=true]:bg-sidebar-accent cursor-pointer"
                    data-testid={`link-nav-${item.url.replace(/\//g, '-')}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">발송준비</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {preparationNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.url)}
                    isActive={location === item.url || (item.url !== '/' && location.startsWith(item.url))}
                    className="data-[active=true]:bg-sidebar-accent cursor-pointer"
                    data-testid={`link-nav-${item.url.replace(/\//g, '-')}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">설정</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {subNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.url)}
                    isActive={location === item.url}
                    className="data-[active=true]:bg-sidebar-accent cursor-pointer"
                    data-testid={`link-nav-${item.url.replace(/\//g, '-')}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground">광고 잔액</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="px-3 py-2">
              <div className="rounded-lg bg-accent p-3">
                <div className="text-tiny text-muted-foreground mb-1">사용 가능 잔액</div>
                <div className="text-h2 font-bold text-foreground" data-testid="text-balance">
                  {formatCurrency(balance)}
                </div>
                <button 
                  onClick={() => navigate("/billing")}
                  className="text-tiny text-primary hover:underline cursor-pointer" 
                  data-testid="link-charge"
                >
                  충전하기
                </button>
              </div>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

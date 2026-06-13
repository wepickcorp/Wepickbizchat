import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, ChevronDown, Settings, LogOut, House, Send, WalletCards, ChartSpline, Menu } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import Landing from "@/pages/landing";
import AuthPage from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import Templates from "@/pages/templates";
import Campaigns from "@/pages/campaigns";
import CampaignsStart from "@/pages/campaigns-start";
import CampaignDetail from "@/pages/campaign-detail";
import CampaignsNew from "@/pages/campaigns-new";
import SendHistory from "@/pages/send-history";
import SenderNumbers from "@/pages/sender-numbers";
import Billing from "@/pages/billing";
import TaxInvoices from "@/pages/tax-invoices";
import Announcements from "@/pages/announcements";
import Reports from "@/pages/reports";
import TestCampaign from "@/pages/test-campaign";
import Geofences from "@/pages/geofences";
import SettingsPage from "@/pages/settings";
import MorePage from "@/pages/more";
import NotFound from "@/pages/not-found";

import AdminLogin from "@/pages/admin/login";
import AdminDashboard from "@/pages/admin/index";
import AdminUsers from "@/pages/admin/users";
import AdminCampaigns from "@/pages/admin/campaigns";
import AdminTransactions from "@/pages/admin/transactions";
import AdminLogs from "@/pages/admin/logs";
import AdminAnnouncements from "@/pages/admin/announcements";
import AdminRefunds from "@/pages/admin/refunds";
import AdminTaxInvoices from "@/pages/admin/tax-invoices";
import AdminReports from "@/pages/admin/reports";
import AdminAnalytics from "@/pages/admin/analytics";
import AdminRecommendedTemplates from "@/pages/admin/recommended-templates";
import AdminRecommendedTemplateForm from "@/pages/admin/recommended-template-form";
import AdminMessageCopyRequests from "@/pages/admin/message-copy-requests";
import { AdminLayout } from "@/components/admin-layout";
import { AppNavIcon } from "@/components/app-icon-tile";

import AgencyPortal from "@/pages/agency/index";

function navigate(href: string) {
  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function UserMenu() {
  const { user, signOut } = useAuth();

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName || ''}`
    : user?.email?.split('@')[0] || '사용자';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover-elevate active-elevate-2 border border-border"
          data-testid="button-user-menu"
        >
          <Avatar className="h-7 w-7">
            <AvatarImage src={user?.profileImageUrl || undefined} alt={displayName} />
            <AvatarFallback className="bg-primary text-primary-foreground text-tiny">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{displayName}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{displayName}</p>
          <p className="text-xs text-muted-foreground truncate">
            {user?.email || '이메일 없음'}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => navigate("/settings")}
          className="cursor-pointer"
          data-testid="link-settings"
        >
          <Settings className="h-4 w-4 mr-2" />
          <span>설정</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={signOut}
          className="flex items-center gap-2 text-destructive cursor-pointer"
          data-testid="link-logout"
        >
          <LogOut className="h-4 w-4" />
          <span>로그아웃</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const mobileNavItems = [
  { label: "홈", href: "/dashboard", icon: House },
  { label: "캠페인", href: "/campaigns", icon: Send },
  { label: "크레딧", href: "/billing", icon: WalletCards },
  { label: "리포트", href: "/reports", icon: ChartSpline },
  { label: "전체", href: "/more", icon: Menu },
];

function MobileBottomNav() {
  const [location] = useLocation();

  const isActive = (href: string) => {
    if (href === "/dashboard") return location === href || location === "/";
    if (href === "/campaigns") return location.startsWith("/campaigns");
    return location === href || location.startsWith(`${href}/`);
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid h-[66px] grid-cols-5 rounded-t-[18px] border border-b-0 bg-card/95 px-2.5 pt-1 shadow-[0_-10px_22px_-22px_rgba(15,23,42,0.38)] backdrop-blur md:hidden">
      {mobileNavItems.map((item) => {
        const active = isActive(item.href);
        return (
          <button
            key={item.href}
            type="button"
            onClick={() => navigate(item.href)}
            className={`group relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[11px] transition-all duration-150 ease-out active:scale-[0.94] ${
              active ? "font-bold text-primary" : "font-semibold text-slate-800"
            }`}
            data-testid={`button-mobile-nav-${item.href.replace(/\//g, "-")}`}
          >
            <AppNavIcon
              icon={item.icon}
              active={active}
              soft
              className={`h-[30px] w-[30px] transition-transform duration-150 ease-out group-active:scale-90 ${
                active ? "-translate-y-0.5" : ""
              }`}
            />
            <span className="transition-opacity duration-150 group-active:opacity-80">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex flex-col flex-1 overflow-hidden bg-background">
          <header className="hidden items-center justify-between h-16 px-4 md:flex md:px-6 border-b bg-card/90 backdrop-blur shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <UserMenu />
          </header>
          <main className="flex-1 overflow-auto custom-scrollbar">
            <div className="mx-auto w-full max-w-[1440px] p-5 pb-24 md:p-8">
              {children}
            </div>
          </main>
          <MobileBottomNav />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    </div>
  );
}

function TemplateAuthoringRedirect() {
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate("/campaigns/new");
  }, [navigate]);

  return <LoadingScreen />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading, session, isError, signOut } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !session) {
      navigate("/auth");
    }
  }, [isLoading, session, navigate]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return null;
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center p-8 max-w-md">
          <h2 className="text-xl font-semibold mb-2">연결 오류</h2>
          <p className="text-muted-foreground mb-4">
            서버와 연결하는 중 문제가 생겼어요. 다시 시도해요.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              다시 시도
            </button>
            <button
              onClick={signOut}
              className="px-4 py-2 border border-border rounded-md hover:bg-muted"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthenticatedLayout>
      <Component />
    </AuthenticatedLayout>
  );
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <AdminLayout>
      <Component />
    </AdminLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/templates" component={() => <ProtectedRoute component={Templates} />} />
      <Route path="/templates/new" component={() => <ProtectedRoute component={TemplateAuthoringRedirect} />} />
      <Route path="/templates/:id/edit" component={() => <ProtectedRoute component={TemplateAuthoringRedirect} />} />
      <Route path="/templates/:id" component={() => <ProtectedRoute component={TemplateAuthoringRedirect} />} />
      <Route path="/campaigns" component={() => <ProtectedRoute component={CampaignsStart} />} />
      <Route path="/campaigns/history" component={() => <ProtectedRoute component={Campaigns} />} />
      <Route path="/campaigns/new" component={() => <ProtectedRoute component={CampaignsNew} />} />
      <Route path="/campaigns/test" component={() => <ProtectedRoute component={TestCampaign} />} />
      <Route path="/campaigns/:id/edit" component={() => <ProtectedRoute component={CampaignsNew} />} />
      <Route path="/campaigns/:id" component={() => <ProtectedRoute component={CampaignDetail} />} />
      <Route path="/send-history" component={() => <ProtectedRoute component={SendHistory} />} />
      <Route path="/sender-numbers" component={() => <ProtectedRoute component={SenderNumbers} />} />
      <Route path="/billing" component={() => <ProtectedRoute component={Billing} />} />
      <Route path="/tax-invoices" component={() => <ProtectedRoute component={TaxInvoices} />} />
      <Route path="/announcements" component={() => <ProtectedRoute component={Announcements} />} />
      <Route path="/reports" component={() => <ProtectedRoute component={Reports} />} />
      <Route path="/geofences" component={() => <ProtectedRoute component={Geofences} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={SettingsPage} />} />
      <Route path="/more" component={() => <ProtectedRoute component={MorePage} />} />

      {/* Admin Routes */}
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/users" component={() => <AdminRoute component={AdminUsers} />} />
      <Route path="/admin/campaigns" component={() => <AdminRoute component={AdminCampaigns} />} />
      <Route path="/admin/transactions" component={() => <AdminRoute component={AdminTransactions} />} />
      <Route path="/admin/announcements" component={() => <AdminRoute component={AdminAnnouncements} />} />
      <Route path="/admin/refunds" component={() => <AdminRoute component={AdminRefunds} />} />
      <Route path="/admin/tax-invoices" component={() => <AdminRoute component={AdminTaxInvoices} />} />
      <Route path="/admin/reports" component={() => <AdminRoute component={AdminReports} />} />
      <Route path="/admin/analytics" component={() => <AdminRoute component={AdminAnalytics} />} />
      <Route path="/admin/recommended-templates/new" component={() => <AdminRoute component={AdminRecommendedTemplateForm} />} />
      <Route path="/admin/recommended-templates/:id/edit" component={() => <AdminRoute component={AdminRecommendedTemplateForm} />} />
      <Route path="/admin/recommended-templates" component={() => <AdminRoute component={AdminRecommendedTemplates} />} />
      <Route path="/admin/message-copy-requests" component={() => <AdminRoute component={AdminMessageCopyRequests} />} />
      <Route path="/admin/logs" component={() => <AdminRoute component={AdminLogs} />} />
      <Route path="/admin" component={() => <AdminRoute component={AdminDashboard} />} />

      {/* Agency Portal Routes */}
      <Route path="/agency/:rest*" component={AgencyPortal} />
      <Route path="/agency" component={AgencyPortal} />

      <Route component={() => <ProtectedRoute component={NotFound} />} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    root.classList.add("light");
    localStorage.removeItem("sk-coretarget-ui-theme");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

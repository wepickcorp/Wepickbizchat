import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  Megaphone, 
  CreditCard, 
  FileText, 
  LogOut,
  Shield,
  ChevronLeft,
  Menu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

const navItems = [
  { href: "/admin", icon: LayoutDashboard, label: "대시보드" },
  { href: "/admin/users", icon: Users, label: "광고주 관리" },
  { href: "/admin/campaigns", icon: Megaphone, label: "캠페인" },
  { href: "/admin/transactions", icon: CreditCard, label: "결제 내역" },
  { href: "/admin/logs", icon: FileText, label: "활동 로그" },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    const user = localStorage.getItem("adminUser");
    
    if (!token) {
      navigate("/admin/login");
      return;
    }

    if (user) {
      try {
        setAdminUser(JSON.parse(user));
      } catch {
        navigate("/admin/login");
      }
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    navigate("/admin/login");
  };

  if (!adminUser) {
    return null;
  }

  return (
    <div className="flex h-screen bg-muted/30">
      <aside 
        className={cn(
          "bg-background border-r flex flex-col transition-all duration-300",
          sidebarOpen ? "w-64" : "w-16"
        )}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg">Admin</span>
            </div>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={cn(!sidebarOpen && "mx-auto")}
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || 
              (item.href !== "/admin" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <a
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                    isActive 
                      ? "bg-primary text-primary-foreground" 
                      : "hover-elevate text-muted-foreground hover:text-foreground"
                  )}
                  data-testid={`link-admin-nav-${item.label}`}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {sidebarOpen && <span>{item.label}</span>}
                </a>
              </Link>
            );
          })}
        </nav>

        <div className="p-2 border-t">
          {sidebarOpen && (
            <div className="px-3 py-2 mb-2">
              <p className="text-sm font-medium truncate">{adminUser.name}</p>
              <p className="text-xs text-muted-foreground truncate">{adminUser.email}</p>
            </div>
          )}
          <Button
            variant="ghost"
            className={cn("w-full justify-start gap-3", !sidebarOpen && "justify-center")}
            onClick={handleLogout}
            data-testid="button-admin-logout"
          >
            <LogOut className="h-5 w-5" />
            {sidebarOpen && <span>로그아웃</span>}
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

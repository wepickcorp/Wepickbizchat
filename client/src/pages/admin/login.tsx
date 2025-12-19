import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield, Building2 } from "lucide-react";

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loginType, setLoginType] = useState<"admin" | "agency">("admin");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: "입력 오류",
        description: "이메일과 비밀번호를 입력해주세요",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const endpoint = loginType === "admin" ? "/api/admin/login" : "/api/agency/login";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "로그인 실패");
      }

      if (loginType === "admin") {
        localStorage.setItem("adminToken", data.token);
        localStorage.setItem("adminUser", JSON.stringify(data.admin));
        toast({
          title: "로그인 성공",
          description: `${data.admin.name}님, 환영합니다`,
        });
        navigate("/admin");
      } else {
        localStorage.setItem("agencyToken", data.token);
        localStorage.setItem("agencyUser", JSON.stringify(data.agency));
        toast({
          title: "로그인 성공",
          description: `${data.agency.name} 대행사님, 환영합니다`,
        });
        navigate("/agency");
      }
    } catch (error) {
      toast({
        title: "로그인 실패",
        description: error instanceof Error ? error.message : "알 수 없는 오류",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            {loginType === "admin" ? (
              <Shield className="h-6 w-6 text-primary" />
            ) : (
              <Building2 className="h-6 w-6 text-primary" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {loginType === "admin" ? "어드민 로그인" : "대행사 로그인"}
          </CardTitle>
          <CardDescription>
            wepick BizChat {loginType === "admin" ? "관리자" : "대행사"} 시스템
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={loginType} onValueChange={(v) => setLoginType(v as "admin" | "agency")} className="mb-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="admin" data-testid="tab-admin-login">
                <Shield className="h-4 w-4 mr-2" />
                어드민
              </TabsTrigger>
              <TabsTrigger value="agency" data-testid="tab-agency-login">
                <Building2 className="h-4 w-4 mr-2" />
                대행사
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                placeholder={loginType === "admin" ? "admin@wepick.kr" : "agency@company.com"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                data-testid="input-admin-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                data-testid="input-admin-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              data-testid="button-admin-login"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  로그인 중...
                </>
              ) : (
                "로그인"
              )}
            </Button>
          </form>

          {loginType === "agency" && (
            <p className="text-center text-sm text-muted-foreground mt-4">
              대행사 계정은 관리자에게 문의하여 등록할 수 있습니다.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

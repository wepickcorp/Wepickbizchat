import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Building2, Lock, Loader2 } from "lucide-react";

interface UserProfile {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  companyName: string | null;
  businessNumber: string | null;
  representativeName: string | null;
}

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
    enabled: !!user,
  });

  const [profileData, setProfileData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
  });

  const [businessData, setBusinessData] = useState({
    companyName: "",
    businessNumber: "",
    representativeName: "",
  });

  const [passwordData, setPasswordData] = useState({
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    if (profile) {
      setProfileData({
        firstName: profile.firstName || "",
        lastName: profile.lastName || "",
        phone: profile.phone || "",
      });
      setBusinessData({
        companyName: profile.companyName || "",
        businessNumber: profile.businessNumber || "",
        representativeName: profile.representativeName || "",
      });
    }
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: typeof profileData) => {
      const res = await apiRequest("PUT", "/api/profile", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "프로필이 저장되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: () => {
      toast({ title: "프로필 저장에 실패했습니다", variant: "destructive" });
    },
  });

  const updateBusinessMutation = useMutation({
    mutationFn: async (data: typeof businessData) => {
      const res = await apiRequest("PUT", "/api/profile", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "사업자 정보가 저장되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: () => {
      toast({ title: "사업자 정보 저장에 실패했습니다", variant: "destructive" });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { newPassword: string }) => {
      const res = await apiRequest("PUT", "/api/profile/password", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "비밀번호가 변경되었습니다" });
      setPasswordData({ newPassword: "", confirmPassword: "" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "비밀번호 변경에 실패했습니다", variant: "destructive" });
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(profileData);
  };

  const handleBusinessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateBusinessMutation.mutate(businessData);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.newPassword.length < 6) {
      toast({ title: "비밀번호는 최소 6자 이상이어야 합니다", variant: "destructive" });
      return;
    }
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({ title: "비밀번호가 일치하지 않습니다", variant: "destructive" });
      return;
    }
    
    changePasswordMutation.mutate({ newPassword: passwordData.newPassword });
  };

  if (isLoading) {
    return (
      <div className="container max-w-2xl py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">계정 설정</h1>
          <p className="text-muted-foreground">프로필 및 계정 정보를 관리합니다</p>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">계정 설정</h1>
        <p className="text-muted-foreground">프로필 및 계정 정보를 관리합니다</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">프로필 정보</CardTitle>
          </div>
          <CardDescription>이름과 연락처를 수정합니다</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lastName">성</Label>
                <Input
                  id="lastName"
                  value={profileData.lastName}
                  onChange={(e) => setProfileData(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="홍"
                  data-testid="input-last-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstName">이름</Label>
                <Input
                  id="firstName"
                  value={profileData.firstName}
                  onChange={(e) => setProfileData(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="길동"
                  data-testid="input-first-name"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                value={user?.email || ""}
                disabled
                className="bg-muted"
                data-testid="input-email"
              />
              <p className="text-xs text-muted-foreground">이메일은 변경할 수 없습니다</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phone">연락처</Label>
              <Input
                id="phone"
                value={profileData.phone}
                onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="010-1234-5678"
                data-testid="input-phone"
              />
            </div>

            <Button 
              type="submit" 
              disabled={updateProfileMutation.isPending}
              data-testid="button-save-profile"
            >
              {updateProfileMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              저장
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">사업자 정보</CardTitle>
          </div>
          <CardDescription>광고주 인증에 사용되는 사업자 정보입니다</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleBusinessSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">상호명</Label>
              <Input
                id="companyName"
                value={businessData.companyName}
                onChange={(e) => setBusinessData(prev => ({ ...prev, companyName: e.target.value }))}
                placeholder="주식회사 위픽"
                data-testid="input-company-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessNumber">사업자등록번호</Label>
              <Input
                id="businessNumber"
                value={businessData.businessNumber}
                onChange={(e) => setBusinessData(prev => ({ ...prev, businessNumber: e.target.value }))}
                placeholder="123-45-67890"
                data-testid="input-business-number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="representativeName">대표자명</Label>
              <Input
                id="representativeName"
                value={businessData.representativeName}
                onChange={(e) => setBusinessData(prev => ({ ...prev, representativeName: e.target.value }))}
                placeholder="홍길동"
                data-testid="input-representative-name"
              />
            </div>

            <Button 
              type="submit" 
              disabled={updateBusinessMutation.isPending}
              data-testid="button-save-business"
            >
              {updateBusinessMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              저장
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">비밀번호 변경</CardTitle>
          </div>
          <CardDescription>새로운 비밀번호를 설정합니다</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">새 비밀번호</Label>
              <Input
                id="newPassword"
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                placeholder="최소 6자 이상"
                data-testid="input-new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">새 비밀번호 확인</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="비밀번호를 다시 입력해주세요"
                data-testid="input-confirm-password"
              />
            </div>

            <Button 
              type="submit" 
              disabled={changePasswordMutation.isPending}
              data-testid="button-change-password"
            >
              {changePasswordMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              비밀번호 변경
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Search, ChevronLeft, ChevronRight, Loader2, Crown, UserX, UserCheck, LogIn, Building2, KeyRound } from "lucide-react";
import type { User, Agency } from "@shared/schema";

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
}

export default function AdminUsers() {
  const { toast } = useToast();
  const adminToken = localStorage.getItem("adminToken");
  
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceType, setBalanceType] = useState<"add" | "subtract">("add");
  const [balanceReason, setBalanceReason] = useState("");
  const [agencyDialogOpen, setAgencyDialogOpen] = useState(false);
  const [agencyName, setAgencyName] = useState("");
  const [agencyContactName, setAgencyContactName] = useState("");
  const [agencyContactPhone, setAgencyContactPhone] = useState("");
  const [agencyContactEmail, setAgencyContactEmail] = useState("");
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const { data, isLoading } = useQuery<UsersResponse>({
    queryKey: ["/api/admin/users", { search, page }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const adjustBalanceMutation = useMutation({
    mutationFn: async ({ userId, amount, reason }: { userId: string; amount: number; reason: string }) => {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`/api/admin/users/${userId}/balance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "잔액 조정에 실패했습니다");
      }
      return data;
    },
    onSuccess: (data) => {
      toast({ 
        title: "잔액 조정 완료", 
        description: `잔액이 ₩${Number(data.previousBalance).toLocaleString()}에서 ₩${Number(data.newBalance).toLocaleString()}으로 변경되었습니다` 
      });
      setBalanceDialogOpen(false);
      setBalanceAmount("");
      setBalanceReason("");
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", { search, page }] });
    },
    onError: (error: Error) => {
      toast({ title: "잔액 조정 실패", description: error.message, variant: "destructive" });
    },
  });

  const toggleMasterMutation = useMutation({
    mutationFn: async ({ userId, isMaster }: { userId: string; isMaster: boolean }) => {
      const res = await fetch(`/api/admin/users/${userId}/master`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ isMaster }),
      });
      if (!res.ok) throw new Error("Failed to update master status");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "마스터 상태 변경 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: () => {
      toast({ title: "마스터 상태 변경 실패", variant: "destructive" });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/users/${userId}/impersonate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
      });
      if (!res.ok) throw new Error("Failed to impersonate");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "대리 로그인 성공", 
        description: `${data.user.email}로 접속합니다. 30분 후 자동 만료됩니다.` 
      });
      localStorage.setItem("impersonateToken", data.impersonateToken);
      localStorage.setItem("impersonateUser", JSON.stringify(data.user));
      window.open("/dashboard", "_blank");
    },
    onError: () => {
      toast({ title: "대리 로그인 실패", variant: "destructive" });
    },
  });

  const setAgencyMutation = useMutation({
    mutationFn: async ({ userId, name, contactName, contactPhone, contactEmail }: { 
      userId: string; name: string; contactName?: string; contactPhone?: string; contactEmail?: string 
    }) => {
      const res = await fetch(`/api/admin/users/${userId}/agency`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ name, contactName, contactPhone, contactEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "대행사 지정에 실패했습니다");
      return data;
    },
    onSuccess: () => {
      toast({ title: "대행사 지정 완료", description: "해당 계정이 대행사로 등록되었습니다" });
      setAgencyDialogOpen(false);
      setAgencyName("");
      setAgencyContactName("");
      setAgencyContactPhone("");
      setAgencyContactEmail("");
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({ title: "대행사 지정 실패", description: error.message, variant: "destructive" });
    },
  });

  const removeAgencyMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/users/${userId}/agency`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "대행사 해제에 실패했습니다");
      return data;
    },
    onSuccess: () => {
      toast({ title: "대행사 해제 완료", description: "대행사 등록이 해제되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({ title: "대행사 해제 실패", description: error.message, variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "비밀번호 재설정에 실패했습니다");
      return data;
    },
    onSuccess: (data) => {
      toast({ 
        title: "비밀번호 재설정 완료", 
        description: `${data.userEmail}의 비밀번호가 변경되었습니다` 
      });
      setPasswordDialogOpen(false);
      setNewPassword("");
      setSelectedUser(null);
    },
    onError: (error: Error) => {
      toast({ title: "비밀번호 재설정 실패", description: error.message, variant: "destructive" });
    },
  });

  const handleBalanceSubmit = () => {
    if (!selectedUser || !balanceAmount || !balanceReason) {
      toast({ title: "모든 필드를 입력해주세요", variant: "destructive" });
      return;
    }

    const amount = balanceType === "add" ? Number(balanceAmount) : -Number(balanceAmount);
    adjustBalanceMutation.mutate({
      userId: selectedUser.id,
      amount,
      reason: balanceReason,
    });
  };

  const handleAgencySubmit = () => {
    if (!selectedUser || !agencyName) {
      toast({ title: "대행사명은 필수입니다", variant: "destructive" });
      return;
    }

    setAgencyMutation.mutate({
      userId: selectedUser.id,
      name: agencyName,
      contactName: agencyContactName || undefined,
      contactPhone: agencyContactPhone || undefined,
      contactEmail: agencyContactEmail || undefined,
    });
  };

  const totalPages = Math.ceil((data?.total || 0) / 20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">광고주 관리</h1>
        <p className="text-muted-foreground">등록된 광고주 계정을 관리합니다</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>광고주 목록</CardTitle>
          <CardDescription>총 {data?.total?.toLocaleString() || 0}명</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="이메일 또는 회사명 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-user-search"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>이메일</TableHead>
                      <TableHead>회사명</TableHead>
                      <TableHead>잔액</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>가입일</TableHead>
                      <TableHead className="text-right">액션</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.users?.map((user) => (
                      <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {user.email}
                            {user.isMaster && (
                              <Crown className="h-4 w-4 text-yellow-500" />
                            )}
                            {user.isAgency && (
                              <Building2 className="h-4 w-4 text-blue-500" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{user.companyName || "-"}</TableCell>
                        <TableCell>₩{Number(user.balance || 0).toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Badge variant={user.isVerified ? "default" : "secondary"}>
                              {user.isVerified ? "인증됨" : "미인증"}
                            </Badge>
                            {user.isAgency && (
                              <Badge variant="outline" className="border-blue-500 text-blue-500">
                                대행사
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString("ko-KR") : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => impersonateMutation.mutate(user.id)}
                              disabled={impersonateMutation.isPending}
                              title="대리 로그인"
                              data-testid={`button-impersonate-${user.id}`}
                            >
                              <LogIn className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setSelectedUser(user);
                                setNewPassword("");
                                setPasswordDialogOpen(true);
                              }}
                              title="비밀번호 재설정"
                              data-testid={`button-reset-password-${user.id}`}
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedUser(user);
                                setBalanceDialogOpen(true);
                              }}
                              data-testid={`button-adjust-balance-${user.id}`}
                            >
                              잔액 조정
                            </Button>
                            <Button
                              size="sm"
                              variant={user.isMaster ? "destructive" : "outline"}
                              onClick={() => toggleMasterMutation.mutate({
                                userId: user.id,
                                isMaster: !user.isMaster,
                              })}
                              data-testid={`button-toggle-master-${user.id}`}
                            >
                              {user.isMaster ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                            </Button>
                            {user.isAgency ? (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => removeAgencyMutation.mutate(user.id)}
                                disabled={removeAgencyMutation.isPending}
                                data-testid={`button-remove-agency-${user.id}`}
                              >
                                <Building2 className="h-4 w-4 mr-1" />
                                해제
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedUser(user);
                                  setAgencyName(user.companyName || "");
                                  setAgencyDialogOpen(true);
                                }}
                                data-testid={`button-set-agency-${user.id}`}
                              >
                                <Building2 className="h-4 w-4 mr-1" />
                                대행사
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {page} / {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>잔액 조정</DialogTitle>
            <DialogDescription>
              {selectedUser?.email}의 잔액을 조정합니다
              <br />
              현재 잔액: ₩{Number(selectedUser?.balance || 0).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>조정 유형</Label>
              <Select value={balanceType} onValueChange={(v) => setBalanceType(v as "add" | "subtract")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">증액 (+)</SelectItem>
                  <SelectItem value="subtract">차감 (-)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>금액 (원)</Label>
              <Input
                type="number"
                placeholder="100000"
                value={balanceAmount}
                onChange={(e) => setBalanceAmount(e.target.value)}
                data-testid="input-balance-amount"
              />
            </div>
            <div className="space-y-2">
              <Label>사유 (필수)</Label>
              <Textarea
                placeholder="잔액 조정 사유를 입력해주세요"
                value={balanceReason}
                onChange={(e) => setBalanceReason(e.target.value)}
                data-testid="input-balance-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBalanceDialogOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleBalanceSubmit}
              disabled={adjustBalanceMutation.isPending}
              data-testid="button-confirm-balance"
            >
              {adjustBalanceMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={agencyDialogOpen} onOpenChange={setAgencyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>대행사 지정</DialogTitle>
            <DialogDescription>
              {selectedUser?.email}을(를) 대행사 계정으로 등록합니다
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>대행사명 (필수)</Label>
              <Input
                placeholder="대행사명을 입력해주세요"
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                data-testid="input-agency-name"
              />
            </div>
            <div className="space-y-2">
              <Label>담당자명</Label>
              <Input
                placeholder="담당자 이름"
                value={agencyContactName}
                onChange={(e) => setAgencyContactName(e.target.value)}
                data-testid="input-agency-contact-name"
              />
            </div>
            <div className="space-y-2">
              <Label>담당자 연락처</Label>
              <Input
                placeholder="010-0000-0000"
                value={agencyContactPhone}
                onChange={(e) => setAgencyContactPhone(e.target.value)}
                data-testid="input-agency-contact-phone"
              />
            </div>
            <div className="space-y-2">
              <Label>담당자 이메일</Label>
              <Input
                type="email"
                placeholder="contact@agency.com"
                value={agencyContactEmail}
                onChange={(e) => setAgencyContactEmail(e.target.value)}
                data-testid="input-agency-contact-email"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgencyDialogOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleAgencySubmit}
              disabled={setAgencyMutation.isPending || !agencyName}
              data-testid="button-confirm-agency"
            >
              {setAgencyMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              대행사 등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>비밀번호 재설정</DialogTitle>
            <DialogDescription>
              {selectedUser?.email}의 비밀번호를 재설정합니다
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>새 비밀번호</Label>
              <Input
                type="text"
                placeholder="최소 8자 이상"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                data-testid="input-new-password"
              />
              <p className="text-xs text-muted-foreground">
                사용자에게 이 비밀번호를 전달해주세요. 로그인 후 변경을 권장합니다.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>
              취소
            </Button>
            <Button
              onClick={() => {
                if (!selectedUser || !newPassword) {
                  toast({ title: "비밀번호를 입력해주세요", variant: "destructive" });
                  return;
                }
                if (newPassword.length < 8) {
                  toast({ title: "비밀번호는 최소 8자 이상이어야 합니다", variant: "destructive" });
                  return;
                }
                resetPasswordMutation.mutate({
                  userId: selectedUser.id,
                  newPassword,
                });
              }}
              disabled={resetPasswordMutation.isPending || newPassword.length < 8}
              data-testid="button-confirm-password"
            >
              {resetPasswordMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              비밀번호 변경
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

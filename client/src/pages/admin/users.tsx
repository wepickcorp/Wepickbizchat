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
import { Search, ChevronLeft, ChevronRight, Loader2, Crown, UserX, UserCheck } from "lucide-react";
import type { User } from "@shared/schema";

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
      const res = await fetch(`/api/admin/users/${userId}/balance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ amount, reason }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to adjust balance");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "잔액 조정 완료", description: "잔액이 성공적으로 조정되었습니다" });
      setBalanceDialogOpen(false);
      setBalanceAmount("");
      setBalanceReason("");
      setSelectedUser(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
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
                          </div>
                        </TableCell>
                        <TableCell>{user.companyName || "-"}</TableCell>
                        <TableCell>₩{Number(user.balance || 0).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={user.isVerified ? "default" : "secondary"}>
                            {user.isVerified ? "인증됨" : "미인증"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString("ko-KR") : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
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
    </div>
  );
}

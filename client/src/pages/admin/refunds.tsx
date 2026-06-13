import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Search, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface Refund {
  id: string;
  userId: string;
  userEmail: string;
  amount: string;
  reason: string;
  status: string;
  adminNote: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
  processedAt: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: "대기중", variant: "secondary", icon: Clock },
  approved: { label: "승인됨", variant: "default", icon: CheckCircle },
  rejected: { label: "거절됨", variant: "destructive", icon: XCircle },
  completed: { label: "완료", variant: "outline", icon: CheckCircle },
};

export default function AdminRefunds() {
  const { toast } = useToast();
  const adminToken = localStorage.getItem("adminToken");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRefund, setSelectedRefund] = useState<Refund | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | "complete" | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/admin/refunds", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/refunds?${params}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        throw new Error(errorBody?.error || "환불 요청을 불러오지 못했어요");
      }
      return res.json();
    },
  });

  const processMutation = useMutation({
    mutationFn: async ({ id, action, adminNote }: { id: string; action: string; adminNote?: string }) => {
      const res = await fetch(`/api/admin/refunds/${id}/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ action, adminNote }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || "Failed to process");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      const actionLabels: Record<string, string> = {
        approve: "승인",
        reject: "거절",
        complete: "완료 처리",
      };
      toast({ title: `환불 요청이 ${actionLabels[variables.action]}되었습니다` });
      setSelectedRefund(null);
      setPendingAction(null);
      setAdminNote("");
      refetch();
    },
    onError: (error: Error) => {
      toast({ title: "처리 실패", description: error.message, variant: "destructive" });
    },
  });

  const handleProcess = (action: "approve" | "reject" | "complete") => {
    if (selectedRefund) {
      processMutation.mutate({ id: selectedRefund.id, action, adminNote });
    }
  };

  const actionCopy = pendingAction ? {
    approve: {
      title: "환불 요청을 승인할까요?",
      description: "승인 후에는 운영자가 실제 송금 여부를 확인한 뒤 완료 처리해야 해요.",
      confirm: "승인하기",
    },
    reject: {
      title: "환불 요청을 거절할까요?",
      description: "거절 처리하면 고객에게 환불이 진행되지 않은 상태로 남아요. 필요한 경우 관리자 메모를 남겨주세요.",
      confirm: "거절하기",
    },
    complete: {
      title: "환불 완료 처리할까요?",
      description: "완료 처리하면 요청 금액만큼 상품별 단가 기준으로 남은 크레딧이 차감돼요. 실제 송금 완료 후에만 진행해주세요.",
      confirm: "완료 처리",
    },
  }[pendingAction] : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">환불 관리</h1>
        <p className="text-muted-foreground">환불 요청을 검토하고 처리합니다</p>
      </div>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-4">
          <p className="text-sm text-amber-800">
            크레딧 기반 환불은 요청 금액(원)을 결제 상품별 크레딧 단가로 환산해 남은 크레딧에서 차감해요.
            완료 처리 전 예약 중인 캠페인과 이미 사용된 크레딧 여부를 확인해주세요.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>대기중 요청</CardDescription>
            <CardTitle className="text-2xl">{data?.pendingCount || 0}건</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>총 환불 완료 금액</CardDescription>
            <CardTitle className="text-2xl">₩{(data?.totalRefunded || 0).toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>전체 요청</CardDescription>
            <CardTitle className="text-2xl">{data?.total || 0}건</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="이메일 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-refunds"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="pending">대기중</SelectItem>
            <SelectItem value="approved">승인됨</SelectItem>
            <SelectItem value="rejected">거절됨</SelectItem>
            <SelectItem value="completed">완료</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>환불 요청 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
              환불 요청을 불러오지 못했어요. 관리자 로그인을 다시 확인해주세요.
            </div>
          ) : isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : (
            <div className="space-y-4">
              {data?.refunds?.map((r: Refund) => {
                const config = statusConfig[r.status] || statusConfig.pending;
                const StatusIcon = config.icon;
                return (
                  <div
                    key={r.id}
                    className="flex items-start justify-between gap-4 p-4 border rounded-lg cursor-pointer hover-elevate"
                    onClick={() => setSelectedRefund(r)}
                    data-testid={`refund-item-${r.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium">₩{Number(r.amount).toLocaleString()}</span>
                        <Badge variant={config.variant}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {config.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{r.userEmail}</p>
                      <p className="text-sm text-muted-foreground line-clamp-1">{r.reason}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(r.createdAt), "yyyy-MM-dd HH:mm")}
                      </p>
                    </div>
                    {r.status === "pending" && (
                      <Badge variant="outline" className="shrink-0">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        처리 필요
                      </Badge>
                    )}
                  </div>
                );
              })}
              {data?.refunds?.length === 0 && (
                <p className="text-center text-muted-foreground py-8">환불 요청이 없습니다</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedRefund} onOpenChange={() => setSelectedRefund(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>환불 요청 상세</DialogTitle>
          </DialogHeader>
          {selectedRefund && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">요청자</Label>
                  <p className="font-medium">{selectedRefund.userEmail}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">금액</Label>
                  <p className="font-medium">₩{Number(selectedRefund.amount).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    완료 시 상품별 단가 기준으로 남은 크레딧이 차감돼요
                  </p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">환불 사유</Label>
                <p className="font-medium">{selectedRefund.reason}</p>
              </div>
              {selectedRefund.bankName && (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-muted-foreground">은행</Label>
                    <p className="font-medium">{selectedRefund.bankName}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">계좌번호</Label>
                    <p className="font-medium">{selectedRefund.accountNumber}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">예금주</Label>
                    <p className="font-medium">{selectedRefund.accountHolder}</p>
                  </div>
                </div>
              )}
              <div>
                <Label className="text-muted-foreground">요청일시</Label>
                <p className="font-medium">{format(new Date(selectedRefund.createdAt), "yyyy-MM-dd HH:mm")}</p>
              </div>
              {selectedRefund.status === "pending" && (
                <div>
                  <Label>관리자 메모</Label>
                  <Textarea
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    placeholder="처리 메모 (선택)"
                    rows={3}
                    data-testid="input-refund-admin-note"
                  />
                </div>
              )}
              {selectedRefund.adminNote && (
                <div>
                  <Label className="text-muted-foreground">관리자 메모</Label>
                  <p className="font-medium">{selectedRefund.adminNote}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {selectedRefund?.status === "pending" && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => setPendingAction("reject")}
                  disabled={processMutation.isPending}
                  data-testid="button-reject-refund"
                >
                  거절
                </Button>
                <Button
                  onClick={() => setPendingAction("approve")}
                  disabled={processMutation.isPending}
                  data-testid="button-approve-refund"
                >
                  승인
                </Button>
              </>
            )}
            {selectedRefund?.status === "approved" && (
              <Button
                onClick={() => setPendingAction("complete")}
                disabled={processMutation.isPending}
                data-testid="button-complete-refund"
              >
                환불 완료 처리
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedRefund(null)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingAction} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{actionCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedRefund && (
                <>
                  요청 금액은 ₩{Number(selectedRefund.amount).toLocaleString()}입니다.{" "}
                </>
              )}
              {actionCopy?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processMutation.isPending}>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingAction && handleProcess(pendingAction)}
              disabled={processMutation.isPending}
              className={pendingAction === "reject" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              data-testid="button-confirm-refund-action"
            >
              {processMutation.isPending ? "처리 중..." : actionCopy?.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

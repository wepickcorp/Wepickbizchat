import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ChevronLeft, ChevronRight, ArrowUpCircle, ArrowDownCircle, RefreshCw } from "lucide-react";

const TYPE_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  charge: { label: "충전", icon: ArrowUpCircle, color: "text-green-600" },
  usage: { label: "사용", icon: ArrowDownCircle, color: "text-red-600" },
  refund: { label: "환불", icon: RefreshCw, color: "text-blue-600" },
  master_reset: { label: "마스터 리셋", icon: RefreshCw, color: "text-yellow-600" },
  admin_adjustment: { label: "관리자 조정", icon: RefreshCw, color: "text-purple-600" },
};

export default function AdminTransactions() {
  const adminToken = localStorage.getItem("adminToken");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/transactions", { search, type: typeFilter, page }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (typeFilter !== "all") params.set("type", typeFilter);
      const res = await fetch(`/api/admin/transactions?${params}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
  });

  const totalPages = Math.ceil((data?.total || 0) / 20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">결제 내역</h1>
        <p className="text-muted-foreground">결제 금액과 레거시 잔액 거래를 조회합니다. 크레딧 사용/환불은 크레딧 장부 기준으로 함께 확인해주세요.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">오늘 충전액</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ₩{(data?.todayCharge || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">오늘 레거시 사용액</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              ₩{(data?.todayUsage || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">이번 달 누적</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₩{(data?.monthlyTotal || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>거래 내역</CardTitle>
          <CardDescription>총 {data?.total?.toLocaleString() || 0}건</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="이메일 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-transaction-search"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="유형 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="charge">충전</SelectItem>
                <SelectItem value="usage">사용</SelectItem>
                <SelectItem value="refund">환불</SelectItem>
                <SelectItem value="master_reset">마스터 리셋</SelectItem>
                <SelectItem value="admin_adjustment">관리자 조정</SelectItem>
              </SelectContent>
            </Select>
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
                      <TableHead>유형</TableHead>
                      <TableHead>광고주</TableHead>
                      <TableHead>거래 금액</TableHead>
                      <TableHead>레거시 잔액</TableHead>
                      <TableHead>설명</TableHead>
                      <TableHead>결제수단</TableHead>
                      <TableHead>일시</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.transactions?.map((tx: any) => {
                      const typeInfo = TYPE_LABELS[tx.type] || { label: tx.type, color: "text-muted-foreground" };
                      const Icon = typeInfo.icon;
                      return (
                        <TableRow key={tx.id} data-testid={`row-transaction-${tx.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {Icon && <Icon className={`h-4 w-4 ${typeInfo.color}`} />}
                              <Badge variant="outline">{typeInfo.label}</Badge>
                            </div>
                          </TableCell>
                          <TableCell>{tx.userEmail || "-"}</TableCell>
                          <TableCell className={Number(tx.amount) >= 0 ? "text-green-600" : "text-red-600"}>
                            {Number(tx.amount) >= 0 ? "+" : ""}₩{Number(tx.amount).toLocaleString()}
                          </TableCell>
                          <TableCell>₩{Number(tx.balanceAfter || 0).toLocaleString()}</TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {tx.description || "-"}
                          </TableCell>
                          <TableCell>{tx.paymentMethod || "-"}</TableCell>
                          <TableCell>
                            {tx.createdAt ? new Date(tx.createdAt).toLocaleString("ko-KR") : "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
    </div>
  );
}

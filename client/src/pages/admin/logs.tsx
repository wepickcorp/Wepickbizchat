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
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  login: "로그인",
  balance_adjust: "잔액 조정",
  user_status_change: "계정 상태 변경",
  master_toggle: "마스터 권한 변경",
  view_user: "유저 조회",
  view_campaign: "캠페인 조회",
};

export default function AdminLogs() {
  const adminToken = localStorage.getItem("adminToken");
  
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/logs", { search, page }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/logs?${params}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
  });

  const totalPages = Math.ceil((data?.total || 0) / 30);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">활동 로그</h1>
        <p className="text-muted-foreground">관리자 활동 기록을 조회합니다</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>로그 목록</CardTitle>
          <CardDescription>총 {data?.total?.toLocaleString() || 0}건</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="관리자명 또는 액션 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-log-search"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>관리자</TableHead>
                      <TableHead>액션</TableHead>
                      <TableHead>대상</TableHead>
                      <TableHead>상세</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>일시</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.logs?.map((log: any) => (
                      <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                        <TableCell className="font-medium">
                          {log.adminName || log.adminEmail || "시스템"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {ACTION_LABELS[log.action] || log.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.targetType ? (
                            <span className="text-sm">
                              {log.targetType}: {log.targetId?.slice(0, 8)}...
                            </span>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          {log.details ? (
                            <span className="text-xs text-muted-foreground truncate block">
                              {JSON.stringify(log.details).slice(0, 50)}...
                            </span>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {log.ipAddress || "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.createdAt ? new Date(log.createdAt).toLocaleString("ko-KR") : "-"}
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
    </div>
  );
}

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
import { Search, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { CAMPAIGN_STATUS } from "@shared/schema";
import { calculateCampaignCredits } from "@shared/credit-policy";

const STATUS_COLORS: Record<string, string> = {
  draft: "secondary",
  temp_registered: "secondary",
  approval_requested: "default",
  approved: "default",
  rejected: "destructive",
  send_ready: "default",
  running: "default",
  completed: "outline",
  cancelled: "secondary",
  stopped: "destructive",
};

export default function AdminCampaigns() {
  const adminToken = localStorage.getItem("adminToken");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/campaigns", { search, status: statusFilter, page }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/campaigns?${params}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
  });

  const totalPages = Math.ceil((data?.total || 0) / 20);

  const getStatusLabel = (status: string) => {
    const found = Object.values(CAMPAIGN_STATUS).find(s => s.status === status);
    return found?.label || status;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">캠페인 모니터링</h1>
        <p className="text-muted-foreground">모든 광고 캠페인 현황을 조회합니다</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>캠페인 목록</CardTitle>
          <CardDescription>총 {data?.total?.toLocaleString() || 0}건</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="캠페인명 또는 광고주 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-campaign-search"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="상태 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {Object.values(CAMPAIGN_STATUS).map(({ status, label }) => (
                  <SelectItem key={status} value={status}>{label}</SelectItem>
                ))}
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
                      <TableHead>캠페인명</TableHead>
                      <TableHead>광고주</TableHead>
                      <TableHead>메시지 유형</TableHead>
                      <TableHead>타겟</TableHead>
                      <TableHead>필요 크레딧</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>생성일</TableHead>
                      <TableHead className="text-right">액션</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.campaigns?.map((campaign: any) => {
                      const targetCount = Number(campaign.targetCount || 0);
                      const neededCredits = calculateCampaignCredits({ targetCount }).neededCredits;

                      return (
                        <TableRow key={campaign.id} data-testid={`row-campaign-${campaign.id}`}>
                          <TableCell className="font-medium max-w-[200px] truncate">
                            {campaign.name}
                          </TableCell>
                          <TableCell>{campaign.userEmail || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{campaign.messageType}</Badge>
                          </TableCell>
                          <TableCell>{targetCount.toLocaleString("ko-KR")}명</TableCell>
                          <TableCell>
                            <div className="font-medium">{neededCredits.toLocaleString("ko-KR")}C</div>
                            <div className="text-xs text-muted-foreground">문자 1건 2C</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_COLORS[campaign.status] as any || "secondary"}>
                              {getStatusLabel(campaign.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString("ko-KR") : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              asChild
                            >
                              <a href={`/campaigns/${campaign.id}`} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
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

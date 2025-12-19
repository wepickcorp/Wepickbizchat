import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Search, Download, FileText } from "lucide-react";
import { format } from "date-fns";

interface TaxInvoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  amount: string;
  taxAmount: string;
  totalAmount: string;
  buyerBusinessNumber: string | null;
  buyerCompanyName: string | null;
  buyerEmail: string | null;
  status: string;
  pdfUrl: string | null;
  userId: string;
  userEmail: string;
  createdAt: string;
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  issued: { label: "발행됨", variant: "default" },
  sent: { label: "전송됨", variant: "outline" },
  cancelled: { label: "취소됨", variant: "secondary" },
};

export default function AdminTaxInvoices() {
  const adminToken = localStorage.getItem("adminToken");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/tax-invoices", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/tax-invoices?${params}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">세금계산서 관리</h1>
        <p className="text-muted-foreground">발행된 세금계산서를 조회합니다</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>이번 달 발행 건수</CardDescription>
            <CardTitle className="text-2xl">{data?.monthlyCount || 0}건</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>이번 달 발행 금액</CardDescription>
            <CardTitle className="text-2xl">₩{(data?.monthlyAmount || 0).toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="이메일 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-tax-invoices"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>세금계산서 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">계산서번호</th>
                    <th className="text-left py-3 px-2">발행일</th>
                    <th className="text-left py-3 px-2">구매자</th>
                    <th className="text-right py-3 px-2">공급가액</th>
                    <th className="text-right py-3 px-2">세액</th>
                    <th className="text-right py-3 px-2">합계</th>
                    <th className="text-center py-3 px-2">상태</th>
                    <th className="text-center py-3 px-2">다운로드</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.taxInvoices?.map((invoice: TaxInvoice) => {
                    const config = statusLabels[invoice.status] || statusLabels.issued;
                    return (
                      <tr key={invoice.id} className="border-b hover:bg-muted/50" data-testid={`tax-invoice-row-${invoice.id}`}>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            {invoice.invoiceNumber}
                          </div>
                        </td>
                        <td className="py-3 px-2">{format(new Date(invoice.issueDate), "yyyy-MM-dd")}</td>
                        <td className="py-3 px-2">
                          <div>
                            <p className="font-medium">{invoice.buyerCompanyName || "-"}</p>
                            <p className="text-xs text-muted-foreground">{invoice.buyerBusinessNumber || "-"}</p>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-right">₩{Number(invoice.amount).toLocaleString()}</td>
                        <td className="py-3 px-2 text-right">₩{Number(invoice.taxAmount).toLocaleString()}</td>
                        <td className="py-3 px-2 text-right font-medium">₩{Number(invoice.totalAmount).toLocaleString()}</td>
                        <td className="py-3 px-2 text-center">
                          <Badge variant={config.variant}>{config.label}</Badge>
                        </td>
                        <td className="py-3 px-2 text-center">
                          {invoice.pdfUrl ? (
                            <Button size="icon" variant="ghost" asChild>
                              <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {data?.taxInvoices?.length === 0 && (
                <p className="text-center text-muted-foreground py-8">세금계산서가 없습니다</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

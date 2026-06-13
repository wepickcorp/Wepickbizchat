import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  FileText,
  Plus,
  Download,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Building2
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatCurrency, formatDateTime } from "@/lib/authUtils";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TaxInvoice } from "@shared/schema";

const taxInvoiceSchema = z.object({
  amount: z.string().min(1, "발행 금액을 입력해주세요"),
  buyerBusinessNumber: z.string().min(10, "사업자등록번호를 입력해주세요"),
  buyerCompanyName: z.string().min(2, "상호명을 입력해주세요"),
  buyerRepresentative: z.string().optional(),
  buyerEmail: z.string().email("올바른 이메일 주소를 입력해주세요"),
  buyerAddress: z.string().optional(),
});

type TaxInvoiceFormData = z.infer<typeof taxInvoiceSchema>;

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  requested: { label: "신청됨", variant: "secondary", icon: Clock },
  issued: { label: "발행완료", variant: "default", icon: CheckCircle2 },
  cancelled: { label: "취소됨", variant: "destructive", icon: XCircle },
};

export default function TaxInvoices() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm<TaxInvoiceFormData>({
    resolver: zodResolver(taxInvoiceSchema),
    defaultValues: {
      amount: "",
      buyerBusinessNumber: "",
      buyerCompanyName: "",
      buyerRepresentative: "",
      buyerEmail: "",
      buyerAddress: "",
    },
  });

  const { data: invoices, isLoading } = useQuery<TaxInvoice[]>({
    queryKey: ["/api/tax-invoices"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: TaxInvoiceFormData) => {
      const res = await apiRequest("POST", "/api/tax-invoices", {
        ...data,
        amount: Number(data.amount.replace(/,/g, '')),
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({ title: "신청 완료", description: data.message });
      setIsDialogOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/tax-invoices"] });
    },
    onError: (error: Error) => {
      toast({ title: "신청 실패", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: TaxInvoiceFormData) => {
    createMutation.mutate(data);
  };

  const formatBusinessNumber = (value: string) => {
    const numbers = value.replace(/[^0-9]/g, '').slice(0, 10);
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 5) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 5)}-${numbers.slice(5)}`;
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-display font-bold" data-testid="text-title">세금계산서</h1>
          <p className="text-muted-foreground mt-1">
            세금계산서 발행을 신청하고 내역을 확인해요
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 w-fit" data-testid="button-request-invoice">
              <Plus className="h-4 w-4" />
              세금계산서 신청
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>세금계산서 발행 신청</DialogTitle>
              <DialogDescription>
                사업자 정보를 입력하면 영업일 기준 1-2일 내 발행됩니다
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>발행 금액 (원)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="100,000"
                          data-testid="input-invoice-amount"
                          onChange={(e) => {
                            const value = e.target.value.replace(/[^0-9]/g, '');
                            field.onChange(Number(value).toLocaleString());
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="buyerBusinessNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>사업자등록번호</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="000-00-00000"
                          data-testid="input-business-number"
                          onChange={(e) => field.onChange(formatBusinessNumber(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="buyerCompanyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>상호명</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="주식회사 OO" data-testid="input-company-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="buyerRepresentative"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>대표자명 (선택)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="홍길동" data-testid="input-representative" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="buyerEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>수신 이메일</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="finance@company.com" data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="buyerAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>사업장 주소 (선택)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="서울시 강남구..." data-testid="input-address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    취소
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-invoice">
                    {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    신청하기
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-h2 flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            발행 내역
          </CardTitle>
          <CardDescription>신청한 세금계산서 내역을 확인할 수 있어요</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !invoices || invoices.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="세금계산서 내역이 없어요"
              description="세금계산서를 신청하면 여기에 표시됩니다"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>신청일</TableHead>
                  <TableHead>상호명</TableHead>
                  <TableHead>공급가액</TableHead>
                  <TableHead>세액</TableHead>
                  <TableHead>합계</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">다운로드</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => {
                  const status = statusConfig[invoice.status] || statusConfig.requested;
                  const StatusIcon = status.icon;
                  return (
                    <TableRow key={invoice.id} data-testid={`row-invoice-${invoice.id}`}>
                      <TableCell className="text-muted-foreground">
                        {invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString("ko-KR") : "-"}
                      </TableCell>
                      <TableCell className="font-medium">{invoice.buyerCompanyName}</TableCell>
                      <TableCell>{formatCurrency(Number(invoice.amount))}</TableCell>
                      <TableCell>{formatCurrency(Number(invoice.taxAmount))}</TableCell>
                      <TableCell className="font-semibold">{formatCurrency(Number(invoice.totalAmount))}</TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {invoice.pdfUrl ? (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

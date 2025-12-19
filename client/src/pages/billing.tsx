import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { 
  Wallet, 
  CreditCard, 
  TrendingUp, 
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Plus,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  BanknoteIcon
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, formatDateTime } from "@/lib/authUtils";
import { StatsCard } from "@/components/stats-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Transaction, Refund } from "@shared/schema";
import { useLocation } from "wouter";

const refundSchema = z.object({
  amount: z.string().min(1, "환불 금액을 입력해주세요"),
  reason: z.string().min(5, "환불 사유를 5자 이상 입력해주세요"),
  bankName: z.string().min(1, "은행을 선택해주세요"),
  accountNumber: z.string().min(10, "계좌번호를 입력해주세요"),
  accountHolder: z.string().min(2, "예금주명을 입력해주세요"),
});

type RefundFormData = z.infer<typeof refundSchema>;

const banks = [
  "KB국민은행", "신한은행", "우리은행", "하나은행", "SC제일은행",
  "NH농협은행", "IBK기업은행", "카카오뱅크", "토스뱅크", "케이뱅크",
  "새마을금고", "수협은행", "대구은행", "부산은행", "광주은행",
];

const refundStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  pending: { label: "처리 대기", variant: "secondary", icon: Clock },
  approved: { label: "승인됨", variant: "outline", icon: CheckCircle2 },
  completed: { label: "환불 완료", variant: "default", icon: CheckCircle2 },
  rejected: { label: "거절됨", variant: "destructive", icon: XCircle },
};

const chargeAmounts = [100000, 300000, 500000, 1000000];

export default function Billing() {
  const { user, refetchUser } = useAuth();
  const { toast } = useToast();
  const [chargeAmount, setChargeAmount] = useState<number>(100000);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isChargeDialogOpen, setIsChargeDialogOpen] = useState(false);
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [, setLocation] = useLocation();

  const refundForm = useForm<RefundFormData>({
    resolver: zodResolver(refundSchema),
    defaultValues: {
      amount: "",
      reason: "",
      bankName: "",
      accountNumber: "",
      accountHolder: "",
    },
  });

  const { data: refunds, isLoading: refundsLoading } = useQuery<Refund[]>({
    queryKey: ["/api/refunds"],
  });

  const refundMutation = useMutation({
    mutationFn: async (data: RefundFormData) => {
      const res = await apiRequest("POST", "/api/refunds", {
        ...data,
        amount: Number(data.amount.replace(/,/g, '')),
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({ title: "환불 신청 완료", description: data.message });
      setIsRefundDialogOpen(false);
      refundForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/refunds"] });
    },
    onError: (error: Error) => {
      toast({ title: "환불 신청 실패", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const amount = params.get('amount');
    const canceled = params.get('canceled');
    const error = params.get('error');
    const message = params.get('message');

    if (success === 'true' && amount) {
      toast({
        title: "결제 완료",
        description: `${formatCurrency(parseInt(amount))}이 충전되었어요!`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      refetchUser();
      window.history.replaceState({}, '', '/billing');
    } else if (canceled === 'true') {
      toast({
        title: "결제 취소",
        description: "결제가 취소되었어요",
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/billing');
    } else if (error === 'true') {
      toast({
        title: "결제 실패",
        description: message || "결제 처리 중 오류가 발생했어요",
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/billing');
    }
  }, [toast, refetchUser]);

  const { data: transactions, isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  const chargeMutation = useMutation({
    mutationFn: async (data: { amount: number; paymentMethod: string }) => {
      const res = await apiRequest("POST", "/api/transactions/charge", data);
      return await res.json();
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await refetchUser();
      const chargedAmount = data.transaction?.amount 
        ? Math.abs(parseFloat(data.transaction.amount)) 
        : chargeAmount;
      toast({
        title: "충전 완료",
        description: `${formatCurrency(chargedAmount)}이 충전되었어요!`,
      });
      setIsChargeDialogOpen(false);
      setChargeAmount(100000);
      setCustomAmount("");
    },
    onError: (error: Error) => {
      toast({
        title: "충전 실패",
        description: error.message || "잠시 후 다시 시도해주세요",
        variant: "destructive",
      });
    },
  });

  const kispgCheckoutMutation = useMutation({
    mutationFn: async (amount: number) => {
      const res = await apiRequest("POST", "/api/kispg/auth", { amount });
      return await res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.kispgAuthUrl && data.params) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = data.kispgAuthUrl;
        form.style.display = 'none';

        Object.entries(data.params).forEach(([key, value]) => {
          if (key !== 'userId') {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = value as string;
            form.appendChild(input);
          }
        });

        document.body.appendChild(form);
        form.submit();
      }
    },
    onError: (error: Error) => {
      toast({
        title: "결제 오류",
        description: error.message || "결제 페이지로 이동할 수 없어요",
        variant: "destructive",
      });
    },
  });

  const handleCharge = () => {
    chargeMutation.mutate({
      amount: chargeAmount,
      paymentMethod: "card",
    });
  };

  const handleKispgCheckout = () => {
    kispgCheckoutMutation.mutate(chargeAmount);
  };

  const balance = parseFloat(user?.balance as string || "0");

  const totalCharged = transactions?.reduce((sum, t) => 
    t.type === 'charge' ? sum + parseFloat(t.amount as string) : sum, 0
  ) || 0;

  const totalUsed = transactions?.reduce((sum, t) => 
    t.type === 'usage' ? sum + Math.abs(parseFloat(t.amount as string)) : sum, 0
  ) || 0;

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value);
    const amount = parseInt(value) || 0;
    if (amount >= 10000) {
      setChargeAmount(amount);
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'charge':
        return <TrendingUp className="h-4 w-4 text-success" />;
      case 'usage':
        return <TrendingDown className="h-4 w-4 text-primary" />;
      case 'refund':
        return <RefreshCw className="h-4 w-4 text-chart-4" />;
      default:
        return null;
    }
  };

  const getTransactionLabel = (type: string) => {
    switch (type) {
      case 'charge':
        return '충전';
      case 'usage':
        return '사용';
      case 'refund':
        return '환불';
      default:
        return type;
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">잔액 관리</h1>
          <p className="text-muted-foreground mt-1">
            광고 잔액을 충전하고 거래 내역을 확인해요
          </p>
        </div>
        <Dialog open={isChargeDialogOpen} onOpenChange={setIsChargeDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 w-fit" data-testid="button-open-charge-dialog">
              <Plus className="h-4 w-4" />
              잔액 충전하기
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>잔액 충전</DialogTitle>
              <DialogDescription>
                충전할 금액을 선택해주세요. 최소 충전 금액은 10,000원이에요.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <RadioGroup
                value={chargeAmount.toString()}
                onValueChange={(v) => {
                  setChargeAmount(parseInt(v));
                  setCustomAmount("");
                }}
                className="grid grid-cols-2 gap-3"
              >
                {chargeAmounts.map((amount) => (
                  <Label
                    key={amount}
                    htmlFor={`amount-${amount}`}
                    className={cn(
                      "flex items-center justify-center p-4 rounded-lg border cursor-pointer text-center hover-elevate",
                      chargeAmount === amount && !customAmount
                        ? "border-primary bg-accent"
                        : "border-border"
                    )}
                  >
                    <RadioGroupItem 
                      value={amount.toString()} 
                      id={`amount-${amount}`} 
                      className="sr-only"
                    />
                    <span className="font-medium">{formatCurrency(amount)}</span>
                  </Label>
                ))}
              </RadioGroup>

              <div className="space-y-2">
                <Label htmlFor="custom-amount">직접 입력</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="custom-amount"
                    type="number"
                    min={10000}
                    step={10000}
                    placeholder="금액 입력"
                    value={customAmount}
                    onChange={(e) => handleCustomAmountChange(e.target.value)}
                    data-testid="input-custom-amount"
                  />
                  <span className="text-muted-foreground whitespace-nowrap">원</span>
                </div>
              </div>

              <div className="rounded-lg bg-muted p-4">
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground">현재 잔액</span>
                  <span className="font-medium">{formatCurrency(balance)}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground">충전 금액</span>
                  <span className="font-medium text-primary">+{formatCurrency(chargeAmount)}</span>
                </div>
                <hr className="my-2 border-border" />
                <div className="flex justify-between">
                  <span className="font-medium">충전 후 잔액</span>
                  <span className="font-bold text-success">{formatCurrency(balance + chargeAmount)}</span>
                </div>
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setIsChargeDialogOpen(false)} disabled={chargeMutation.isPending || kispgCheckoutMutation.isPending}>
                취소
              </Button>
              <Button 
                disabled={chargeAmount < 10000 || chargeMutation.isPending || kispgCheckoutMutation.isPending}
                onClick={handleKispgCheckout}
                className="gap-2"
                data-testid="button-kispg-checkout"
              >
                {kispgCheckoutMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                {kispgCheckoutMutation.isPending ? "이동 중..." : `${formatCurrency(chargeAmount)} 카드 결제`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="현재 잔액"
          value={formatCurrency(balance)}
          description="사용 가능한 잔액"
          icon={Wallet}
          iconClassName="bg-primary/10"
        />
        <StatsCard
          title="총 충전액"
          value={formatCurrency(totalCharged)}
          description="누적 충전 금액"
          icon={ArrowUpRight}
          iconClassName="bg-success/10"
        />
        <StatsCard
          title="총 사용액"
          value={formatCurrency(totalUsed)}
          description="누적 사용 금액"
          icon={ArrowDownRight}
          iconClassName="bg-chart-5/10"
        />
      </div>

      <Tabs defaultValue="transactions" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="transactions" data-testid="tab-transactions">거래 내역</TabsTrigger>
          <TabsTrigger value="refunds" data-testid="tab-refunds">환불 신청</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>거래 내역</CardTitle>
              <CardDescription>잔액 충전 및 사용 내역이에요</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center justify-between py-4 border-b last:border-0">
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                      <Skeleton className="h-5 w-24" />
                    </div>
                  ))}
                </div>
              ) : transactions && transactions.length > 0 ? (
                <div className="space-y-1">
                  {transactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between py-4 px-2 rounded-lg hover-elevate -mx-2 border-b last:border-0"
                      data-testid={`row-transaction-${transaction.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-full",
                          transaction.type === 'charge' ? "bg-success/10" :
                          transaction.type === 'usage' ? "bg-primary/10" : "bg-chart-4/10"
                        )}>
                          {getTransactionIcon(transaction.type)}
                        </div>
                        <div>
                          <p className="font-medium">
                            {getTransactionLabel(transaction.type)}
                            {transaction.description && ` - ${transaction.description}`}
                          </p>
                          <p className="text-small text-muted-foreground">
                            {formatDateTime(transaction.createdAt!)}
                            {transaction.paymentMethod && ` · ${transaction.paymentMethod}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "font-medium",
                          transaction.type === 'charge' ? "text-success" :
                          transaction.type === 'refund' ? "text-chart-4" : "text-foreground"
                        )}>
                          {transaction.type === 'charge' || transaction.type === 'refund' ? '+' : '-'}
                          {formatCurrency(Math.abs(parseFloat(transaction.amount as string)))}
                        </p>
                        <p className="text-small text-muted-foreground">
                          잔액 {formatCurrency(transaction.balanceAfter)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={CreditCard}
                  title="거래 내역이 없어요"
                  description="잔액을 충전하면 여기에 거래 내역이 표시돼요"
                  action={{
                    label: "잔액 충전하기",
                    onClick: () => setIsChargeDialogOpen(true),
                  }}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="refunds" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BanknoteIcon className="h-5 w-5" />
                  환불 신청
                </CardTitle>
                <CardDescription>잔액 환불을 신청하고 진행 상황을 확인해요</CardDescription>
              </div>
              <Dialog open={isRefundDialogOpen} onOpenChange={setIsRefundDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2" data-testid="button-request-refund">
                    <Plus className="h-4 w-4" />
                    환불 신청
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>환불 신청</DialogTitle>
                    <DialogDescription>
                      현재 잔액: {formatCurrency(balance)} | 영업일 기준 3-5일 내 처리됩니다
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...refundForm}>
                    <form onSubmit={refundForm.handleSubmit((data) => refundMutation.mutate(data))} className="space-y-4">
                      <FormField
                        control={refundForm.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>환불 금액 (원)</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="50,000"
                                data-testid="input-refund-amount"
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
                        control={refundForm.control}
                        name="reason"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>환불 사유</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                placeholder="환불 사유를 입력해주세요"
                                data-testid="input-refund-reason"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={refundForm.control}
                        name="bankName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>은행</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-bank">
                                  <SelectValue placeholder="은행을 선택해주세요" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {banks.map((bank) => (
                                  <SelectItem key={bank} value={bank}>{bank}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={refundForm.control}
                        name="accountNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>계좌번호</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="- 없이 입력"
                                data-testid="input-account-number"
                                onChange={(e) => field.onChange(e.target.value.replace(/[^0-9]/g, ''))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={refundForm.control}
                        name="accountHolder"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>예금주</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="홍길동" data-testid="input-account-holder" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={() => setIsRefundDialogOpen(false)}>
                          취소
                        </Button>
                        <Button type="submit" disabled={refundMutation.isPending} data-testid="button-submit-refund">
                          {refundMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                          신청하기
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {refundsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : !refunds || refunds.length === 0 ? (
                <EmptyState
                  icon={BanknoteIcon}
                  title="환불 신청 내역이 없어요"
                  description="환불을 신청하면 여기에 표시됩니다"
                />
              ) : (
                <div className="space-y-3">
                  {refunds.map((refund) => {
                    const status = refundStatusConfig[refund.status] || refundStatusConfig.pending;
                    const StatusIcon = status.icon;
                    return (
                      <div
                        key={refund.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                        data-testid={`row-refund-${refund.id}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                            <RefreshCw className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium">{formatCurrency(Number(refund.amount))} 환불 신청</p>
                            <p className="text-small text-muted-foreground">
                              {refund.createdAt ? formatDateTime(refund.createdAt) : "-"}
                              {refund.bankName && ` · ${refund.bankName}`}
                            </p>
                            {refund.adminNote && (
                              <p className="text-small text-muted-foreground mt-1">
                                관리자 메모: {refund.adminNote}
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge variant={status.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

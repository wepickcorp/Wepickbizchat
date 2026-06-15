import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import {
  Wallet,
  CreditCard,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Plus,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  BanknoteIcon,
  ShieldCheck,
  X,
  ChevronDown
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, formatDateTime } from "@/lib/authUtils";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { CREDIT_PRODUCTS, type CreditProductType } from "@shared/credit-policy";
import { CREDIT_COPY } from "@/lib/credit-copy";
import { useLocation } from "wouter";
import { trackFunnelEvent } from "@/lib/funnel-events";

interface CreditGrantView {
  id: string;
  productType: string | null;
  originalCredits: number;
  remainingCredits: number;
  purchasedAt: string;
  expiresAt: string;
}

interface CreditLedgerView {
  id: string;
  type: string;
  amountCredits: number;
  balanceAfterCredits: number | null;
  productType: string | null;
  description: string | null;
  createdAt: string;
}

interface CreditSummary {
  enabled: boolean;
  effectiveAvailableCredits: number;
  availableCredits: number;
  reservedCredits: number;
  expiringSoonCredits: number;
  totalGrantedCredits: number;
  totalUsedCredits: number;
  refundableCredits: number;
  refundableAmountKrw: number;
  hasLedger: boolean;
  legacyBalance: number;
  lots: CreditGrantView[];
  recentLedger: CreditLedgerView[];
}

const refundSchema = z.object({
  amount: z.string().min(1, "환불 금액을 입력해요"),
  reason: z.string().min(5, "환불 사유를 5자 이상 입력해요"),
  bankName: z.string().min(1, "은행을 선택해요"),
  accountNumber: z.string().min(10, "계좌번호를 입력해요"),
  accountHolder: z.string().min(2, "예금주명을 입력해요"),
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

const creditProductOrder: CreditProductType[] = ["light", "topup", "booster", "enterprise"];
const CREDIT_HISTORY_PREVIEW_LIMIT = 5;

export default function Billing() {
  const { user, refetchUser } = useAuth();
  const { toast } = useToast();
  const [chargeAmount, setChargeAmount] = useState<number>(100000);
  const [selectedProductType, setSelectedProductType] = useState<CreditProductType>("light");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isChargeDialogOpen, setIsChargeDialogOpen] = useState(false);
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [showAllCreditHistory, setShowAllCreditHistory] = useState(false);
  const [showOtherCreditProducts, setShowOtherCreditProducts] = useState(false);
  const [showDevCreditTools, setShowDevCreditTools] = useState(false);
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
      const amount = Number(data.amount.replace(/,/g, ''));
      if (amount > refundableAmountKrw) {
        throw new Error(`최대 ${formatCurrency(refundableAmountKrw)}까지 환불을 신청할 수 있어요`);
      }

      const res = await apiRequest("POST", "/api/refunds", {
        ...data,
        amount,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({ title: "환불 신청을 보냈어요", description: data.message });
      setIsRefundDialogOpen(false);
      refundForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/refunds"] });
    },
    onError: (error: Error) => {
      toast({ title: "환불 신청을 다시 확인해요", description: error.message, variant: "destructive" });
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
        title: "결제를 완료했어요",
        description: `${formatCurrency(parseInt(amount))}을 충전했어요.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/summary"] });
      refetchUser();
      window.history.replaceState({}, '', '/billing');
    } else if (canceled === 'true') {
      toast({
        title: "결제 취소",
        description: "결제를 취소했어요",
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/billing');
    } else if (error === 'true') {
      toast({
        title: "결제를 다시 확인해요",
        description: message || "결제를 처리하는 중 문제가 생겼어요",
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/billing');
    }
  }, [toast, refetchUser]);

  const { data: transactions, isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  const { data: creditSummary, isLoading: creditSummaryLoading } = useQuery<CreditSummary>({
    queryKey: ["/api/credits/summary"],
  });

  const chargeMutation = useMutation({
    mutationFn: async (data: { amount: number; paymentMethod: string }) => {
      const res = await apiRequest("POST", "/api/transactions/charge", data);
      return await res.json();
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/credits/summary"] });
      await refetchUser();
      const chargedAmount = data.transaction?.amount
        ? Math.abs(parseFloat(data.transaction.amount))
        : chargeAmount;
      toast({
        title: "크레딧을 충전했어요",
        description: `${formatCurrency(chargedAmount)}을 충전했어요.`,
      });
      setIsChargeDialogOpen(false);
      setChargeAmount(100000);
      setSelectedProductType("light");
      setCustomAmount("");
    },
    onError: (error: Error) => {
      toast({
        title: "충전을 다시 확인해요",
        description: error.message || "잠시 후 다시 시도해요",
        variant: "destructive",
      });
    },
  });

  const devCreditGrantMutation = useMutation({
    mutationFn: async (productType: CreditProductType) => {
      const res = await apiRequest("POST", "/api/credits/dev-grant", { productType });
      return await res.json();
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/credits/summary"] });
      await refetchUser();
      toast({
        title: "테스트 크레딧을 지급했어요",
        description: `${data.product?.name || "선택 상품"}이 로컬 장부에 반영됐어요.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "테스트 크레딧 지급을 다시 확인해요",
        description: error.message || "잠시 후 다시 시도해요",
        variant: "destructive",
      });
    },
  });

  const [showPaymentFrame, setShowPaymentFrame] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);
  const paymentFormRef = useRef<HTMLFormElement>(null);
  const [paymentParams, setPaymentParams] = useState<Record<string, string> | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string>('');

  // KIS PG postMessage 리스너
  useEffect(() => {
    const handlePaymentMessage = async (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;

      const { resultCode, data } = e.data;

      if (resultCode === '0000' && data) {
        // 결제 성공 - returnUrl로 결과 전송
        const returnUrl = paymentParams?.returnUrl;
        if (returnUrl) {
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = returnUrl;
          form.style.display = 'none';

          Object.entries(data).forEach(([key, value]) => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = value as string;
            form.appendChild(input);
          });

          document.body.appendChild(form);
          form.submit();
        }
      } else if (resultCode === 'XXXX') {
        // 결제 실패
        trackFunnelEvent({
          eventName: "payment_failed",
          funnelStep: "payment",
          productType: customAmount ? "custom" : selectedProductType,
          metadata: { amount: chargeAmount, reason: data?.resultMsg || "cancelled" },
        });
        setShowPaymentFrame(false);
        toast({
          title: "결제를 다시 확인해요",
          description: data?.resultMsg || "결제를 취소했어요",
          variant: "destructive",
        });
      }
    };

    window.addEventListener('message', handlePaymentMessage);
    return () => window.removeEventListener('message', handlePaymentMessage);
  }, [paymentParams, toast]);

  const kispgCheckoutMutation = useMutation({
    mutationFn: async (data: { amount: number; productType?: CreditProductType }) => {
      const res = await apiRequest("POST", "/api/kispg/auth", data);
      return await res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.kispgAuthUrl && data.params) {
        trackFunnelEvent({
          eventName: "payment_auth_opened",
          funnelStep: "payment",
          productType: customAmount ? "custom" : selectedProductType,
          metadata: { amount: chargeAmount },
        });
        const isMobile = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);

        if (isMobile) {
          // 모바일: 전체 페이지 리다이렉트
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
        } else {
          // PC: iframe + postMessage 방식
          setPaymentParams(data.params);
          setPaymentUrl(data.kispgAuthUrl);
          setIframeLoading(true);
          setShowPaymentFrame(true);
          setIsChargeDialogOpen(false);

          // form submit은 iframe이 렌더링된 후 수행
          setTimeout(() => {
            if (paymentFormRef.current) {
              paymentFormRef.current.submit();
            }
          }, 100);
        }
      }
    },
    onError: (error: Error) => {
      trackFunnelEvent({
        eventName: "payment_failed",
        funnelStep: "payment",
        productType: customAmount ? "custom" : selectedProductType,
        metadata: { amount: chargeAmount, reason: error.message },
      });
      toast({
        title: "결제 오류",
        description: error.message || "결제 페이지로 다시 이동해요",
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
    trackFunnelEvent({
      eventName: "payment_started",
      funnelStep: "payment",
      productType: customAmount ? "custom" : selectedProductType,
      metadata: { amount: chargeAmount },
    });
    kispgCheckoutMutation.mutate({
      amount: chargeAmount,
      productType: customAmount ? undefined : selectedProductType,
    });
  };

  const legacyBalance = parseFloat(user?.balance as string || "0");
  const balance = Number(
    creditSummary?.effectiveAvailableCredits ?? legacyBalance,
  );
  const expiringSoonCredits = Number(creditSummary?.expiringSoonCredits || 0);
  const refundableCredits = Number(creditSummary?.refundableCredits ?? balance);
  const refundableAmountKrw = Number(creditSummary?.refundableAmountKrw ?? refundableCredits);
  const totalGrantedCredits = Number(creditSummary?.totalGrantedCredits || 0);
  const totalUsedCredits = Number(creditSummary?.totalUsedCredits || 0);
  const hasCreditLedger = Boolean(creditSummary?.hasLedger);
  const hasUsedLightThisMonth = Boolean(
    creditSummary?.lots?.some((lot) => {
      if (lot.productType !== "light" || !lot.purchasedAt) return false;
      const purchasedAt = new Date(lot.purchasedAt);
      const now = new Date();
      return (
        purchasedAt.getFullYear() === now.getFullYear() &&
        purchasedAt.getMonth() === now.getMonth()
      );
    }),
  );
  const recommendedProductType: CreditProductType = hasUsedLightThisMonth ? "topup" : "light";
  const recommendedProduct = CREDIT_PRODUCTS[recommendedProductType];
  const otherCreditProductTypes = creditProductOrder.filter(
    (productType) => productType !== recommendedProductType,
  );

  const totalCharged = transactions?.reduce((sum, t) =>
    t.type === 'charge' ? sum + parseFloat(t.amount as string) : sum, 0
  ) || 0;

  const legacyTotalUsed = transactions?.reduce((sum, t) =>
    t.type === 'usage' ? sum + Math.abs(parseFloat(t.amount as string)) : sum, 0
  ) || 0;
  const displayedTotalUsedCredits = hasCreditLedger ? totalUsedCredits : Math.floor(legacyTotalUsed / 2);
  const ledgerEntries = creditSummary?.recentLedger || [];
  const visibleLedgerEntries = showAllCreditHistory
    ? ledgerEntries
    : ledgerEntries.slice(0, CREDIT_HISTORY_PREVIEW_LIMIT);
  const visibleTransactions = showAllCreditHistory
    ? transactions || []
    : (transactions || []).slice(0, CREDIT_HISTORY_PREVIEW_LIMIT);
  const hiddenLedgerCount = Math.max(0, ledgerEntries.length - CREDIT_HISTORY_PREVIEW_LIMIT);
  const hiddenTransactionCount = Math.max(0, (transactions?.length || 0) - CREDIT_HISTORY_PREVIEW_LIMIT);

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value);
    const amount = parseInt(value) || 0;
    if (amount >= 10000) {
      setChargeAmount(amount);
    }
  };

  const selectCreditProduct = (productType: CreditProductType) => {
    const product = CREDIT_PRODUCTS[productType];
    trackFunnelEvent({
      eventName: "credit_product_selected",
      funnelStep: "credit_product",
      productType,
      metadata: {
        credits: product.credits,
        priceKrw: product.priceKrw,
        messageCount: product.messageCount,
      },
    });
    setSelectedProductType(productType);
    setChargeAmount(product.priceKrw);
    setCustomAmount("");
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

  const getLedgerLabel = (type: string, description?: string | null) => {
    const normalizedDescription = description || "";

    if (type === "adjustment") {
      if (normalizedDescription.includes("잔여 발송분 복구")) {
        return "잔여분 복구";
      }
      if (normalizedDescription.includes("SKT 접수 실패 복구")) {
        return "SKT 접수 실패 복구";
      }
      if (
        normalizedDescription.includes("내부") ||
        normalizedDescription.includes("실패 복구") ||
        normalizedDescription.includes("크레딧 복구")
      ) {
        return "전액 복구";
      }
      return "수동 조정";
    }

    switch (type) {
      case "grant":
        return "크레딧 지급";
      case "reserve":
        return "발송 예약";
      case "use":
        return "크레딧 사용";
      case "release":
        return "예약 해제";
      case "refund":
        return "환불";
      case "expire":
        return "만료";
      default:
        return type;
    }
  };

  const getLedgerDescription = (entry: CreditLedgerView) => {
    const description = entry.description || "";

    if (entry.type === "adjustment" && description.includes("잔여 발송분 복구")) {
      return `${description} · 일부 접수/발송 후 미처리 잔여분만 돌아왔어요`;
    }
    if (entry.type === "adjustment" && description.includes("SKT 접수 실패 복구")) {
      return `${description} · SKT 접수 전 실패로 전액 복구됐어요`;
    }
    if (entry.type === "adjustment" && description.includes("내부")) {
      return `${description} · 내부 실패로 전액 복구됐어요`;
    }

    return description;
  };

  const getLedgerIcon = (type: string) => {
    switch (type) {
      case "grant":
      case "release":
        return <TrendingUp className="h-4 w-4 text-success" />;
      case "use":
      case "reserve":
      case "expire":
        return <TrendingDown className="h-4 w-4 text-primary" />;
      case "refund":
      case "adjustment":
        return <RefreshCw className="h-4 w-4 text-chart-4" />;
      default:
        return <CreditCard className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="animate-fade-in space-y-7">
      <Dialog open={isChargeDialogOpen} onOpenChange={setIsChargeDialogOpen}>
          <DialogContent hideClose className="max-h-[calc(100svh-1rem)] w-[calc(100vw-1rem)] overflow-y-auto rounded-lg p-4 sm:max-w-[640px] sm:p-6">
            <DialogHeader className="sr-only">
              <DialogTitle>크레딧 충전</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-1 sm:space-y-4 sm:py-2">
              <div className="grid gap-3 sm:grid-cols-2">
                {creditProductOrder.map((productType) => {
                  const product = CREDIT_PRODUCTS[productType];
                  const isSelected = selectedProductType === productType && !customAmount;
                  return (
                    <button
                      key={product.productType}
                      type="button"
                      onClick={() => selectCreditProduct(productType)}
                      className={cn(
                        "motion-press min-h-[108px] rounded-lg border bg-card p-3.5 text-left hover:border-primary/50 hover:shadow-sm sm:min-h-[124px] sm:p-4",
                        isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border"
                      )}
                      data-testid={`button-credit-product-${product.productType}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-small font-bold">{product.name}</p>
                          <p className="mt-0.5 text-tiny text-muted-foreground">
                            {product.messageCount.toLocaleString("ko-KR")}건 발송 가능
                          </p>
                        </div>
                        {product.monthlyLimitCount && (
                          <Badge variant="secondary">월 1회</Badge>
                        )}
                      </div>
                      <div className="mt-2 sm:mt-3">
                        <p className="text-title-sm font-bold text-primary sm:text-xl">
                          {product.credits.toLocaleString("ko-KR")}C
                        </p>
                        <p className="mt-0.5 text-tiny text-muted-foreground">
                          {formatCurrency(product.priceKrw)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2 rounded-lg border border-dashed p-3">
                <Label htmlFor="custom-amount">기타 금액 결제</Label>
                <p className="text-tiny text-muted-foreground">
                  기본 충전은 위 상품에서 선택해요. 기타 금액은 운영 확인이 필요한 예외 결제에만 사용해요.
                </p>
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
                  <span className="text-muted-foreground">현재 보유 크레딧</span>
                  <span className="font-medium">
                    {creditSummaryLoading ? "확인 중" : `${balance.toLocaleString("ko-KR")}C`}
                  </span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground">선택한 결제 금액</span>
                  <span className="font-medium text-primary">{formatCurrency(chargeAmount)}</span>
                </div>
                <hr className="my-2 border-border" />
                <div className="flex justify-between">
                  <span className="font-medium">선택 상품</span>
                  <span className="font-bold text-success">
                    {customAmount ? "기타 금액 결제" : CREDIT_PRODUCTS[selectedProductType].name}
                  </span>
                </div>
                {!customAmount && (
                  <div className="mt-2 flex justify-between text-tiny text-muted-foreground">
                    <span>참고 단가</span>
                    <span>{Math.round(CREDIT_PRODUCTS[selectedProductType].unitPriceKrw).toLocaleString("ko-KR")}원/건</span>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setIsChargeDialogOpen(false)} disabled={chargeMutation.isPending || kispgCheckoutMutation.isPending}>
                닫기
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
                {kispgCheckoutMutation.isPending ? "결제 화면으로 이동 중..." : `${formatCurrency(chargeAmount)} 결제하기`}
              </Button>
            </DialogFooter>
          </DialogContent>

        <Card className="overflow-hidden border-primary/15">
          <CardContent className="p-0">
            <div className="grid lg:grid-cols-[1.1fr_1fr]">
              <div className="bg-primary/5 p-5 md:p-7">
                <div className="flex items-start justify-between gap-3">
                  <div>
                  <p className="text-caption font-semibold text-muted-foreground">보유 크레딧</p>
                  {creditSummaryLoading ? (
                    <Skeleton className="mt-3 h-12 w-44" />
                  ) : (
                    <p className="mt-2 text-[2.5rem] font-bold leading-[3rem] tracking-normal md:text-[3rem] md:leading-[3.5rem]">
                      {balance.toLocaleString("ko-KR")}<span className="ml-1 text-title-md text-muted-foreground">C</span>
                    </p>
                  )}
                    <p className="mt-3 text-small text-muted-foreground">
                      최대 {Math.floor(balance / 2).toLocaleString("ko-KR")}건 발송 가능해요. 문자 1건은 2C로 계산돼요.
                    </p>
                  </div>
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-background shadow-sm">
                    <Wallet className="h-6 w-6 text-primary" />
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <DialogTrigger asChild>
                    <Button size="lg" className="min-h-12 gap-2" data-testid="button-open-charge-dialog">
                      <Plus className="h-4 w-4" />
                      크레딧 충전하기
                    </Button>
                  </DialogTrigger>
                  <Button
                    variant="outline"
                    size="lg"
                    className="min-h-12 gap-2"
                    onClick={() => setLocation("/campaigns/new")}
                  >
                    문자 보내기
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 p-5 md:p-7 sm:grid-cols-2">
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-caption text-muted-foreground">환불 가능</p>
                  <p className="mt-2 text-title-md font-bold">{refundableCredits.toLocaleString("ko-KR")}C</p>
                  <p className="mt-1 text-tiny text-muted-foreground">
                    예상 {formatCurrency(refundableAmountKrw)} · 사용분 제외
                  </p>
                </div>
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-caption text-muted-foreground">사용 크레딧</p>
                  <p className="mt-2 text-title-md font-bold">{displayedTotalUsedCredits.toLocaleString("ko-KR")}C</p>
                  <p className="mt-1 text-tiny text-muted-foreground">
                    {hasCreditLedger ? "장부 기준" : "기존 사용액 환산"}
                  </p>
                </div>
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-caption text-muted-foreground">30일 내 만료 예정</p>
                  <p className="mt-2 text-title-md font-bold">{expiringSoonCredits.toLocaleString("ko-KR")}C</p>
                  <p className="mt-1 text-tiny text-muted-foreground">유효기간 12개월 기준</p>
                </div>
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-caption text-muted-foreground">누적 충전</p>
                  <p className="mt-2 text-title-md font-bold">{formatCurrency(totalCharged)}</p>
                  <p className="mt-1 text-tiny text-muted-foreground">
                    총 지급 {totalGrantedCredits.toLocaleString("ko-KR")}C
                  </p>
                </div>
              </div>
            </div>
            <div className="border-t bg-muted/40 px-5 py-4 text-small text-muted-foreground md:px-7">
              {CREDIT_COPY.consumeOrder}
            </div>
          </CardContent>
        </Card>
      </Dialog>

      {import.meta.env.DEV && creditSummary?.enabled && (
        <Card className="border-dashed border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 text-left"
              onClick={() => setShowDevCreditTools((value) => !value)}
              data-testid="button-toggle-dev-credit-tools"
            >
              <div>
                <CardTitle className="flex items-center gap-2 text-body font-bold">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  로컬 테스트 충전
                </CardTitle>
                <CardDescription className="mt-1">
                  결제 없이 크레딧 장부만 확인하는 개발 전용 기능이에요.
                </CardDescription>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  showDevCreditTools && "rotate-180",
                )}
              />
            </button>
          </CardHeader>
          {showDevCreditTools && (
          <CardContent className="motion-enter">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {creditProductOrder.map((productType) => {
                  const product = CREDIT_PRODUCTS[productType];
                  const isPending = devCreditGrantMutation.isPending;
                  const isLightLocked = product.productType === "light" && hasUsedLightThisMonth;
                  return (
                    <Button
                      key={product.productType}
                      type="button"
                      variant={product.productType === "enterprise" ? "default" : "outline"}
                      className="h-auto min-h-16 flex-col items-start gap-1 p-4 text-left"
                      disabled={isPending || isLightLocked}
                      onClick={() => devCreditGrantMutation.mutate(productType)}
                      data-testid={`button-dev-grant-${product.productType}`}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="font-bold">{product.name}</span>
                        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      </span>
                      <span className="text-small opacity-80">
                        {isLightLocked
                          ? "이번 달 사용 완료"
                          : `${product.credits.toLocaleString("ko-KR")}C 바로 지급`}
                      </span>
                    </Button>
                  );
                })}
            </div>
          </CardContent>
          )}
        </Card>
      )}

      <Card className="border-primary/15">
        <CardHeader>
          <CardTitle>크레딧 충전</CardTitle>
          <CardDescription>
            먼저 추천 상품을 확인하고, 필요할 때만 다른 상품을 펼쳐요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <button
            type="button"
            onClick={() => {
              selectCreditProduct(recommendedProductType);
              setIsChargeDialogOpen(true);
            }}
            className="motion-lift motion-press w-full rounded-xl border border-primary/40 bg-primary/5 p-4 text-left hover:border-primary/70 hover:shadow-md sm:p-5"
            data-testid={`button-open-recommended-product-${recommendedProduct.productType}`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>추천 충전</Badge>
                  {recommendedProduct.monthlyLimitCount && <Badge variant="secondary">월 1회</Badge>}
                </div>
                <p className="mt-3 text-title-sm font-bold">{recommendedProduct.name}</p>
                <p className="mt-1 text-small text-muted-foreground">
                  {formatCurrency(recommendedProduct.priceKrw)} · 문자 {recommendedProduct.messageCount.toLocaleString("ko-KR")}건
                </p>
              </div>
              <div className="shrink-0 sm:text-right">
                <p className="text-3xl font-bold text-primary">
                  {recommendedProduct.credits.toLocaleString("ko-KR")}C
                </p>
              </div>
            </div>
          </button>

          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full justify-between px-1 text-muted-foreground hover:text-foreground"
            onClick={() => setShowOtherCreditProducts((value) => !value)}
            data-testid="button-toggle-other-credit-products"
          >
            <span>다른 충전 상품 {showOtherCreditProducts ? "접기" : "보기"}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                showOtherCreditProducts && "rotate-180",
              )}
            />
          </Button>

          {showOtherCreditProducts && (
            <div className="motion-enter grid gap-2 md:grid-cols-3">
              {otherCreditProductTypes.map((productType) => {
              const product = CREDIT_PRODUCTS[productType];
              const isLightLocked = product.productType === "light" && hasUsedLightThisMonth;
              const isEnterprise = product.productType === "enterprise";
              return (
                <button
                  key={product.productType}
                  type="button"
                  onClick={() => {
                    if (isLightLocked) return;
                    selectCreditProduct(productType);
                    setIsChargeDialogOpen(true);
                  }}
                  disabled={isLightLocked}
                  className={cn(
                    "motion-lift motion-press rounded-lg border bg-card p-4 text-left hover:border-primary/40 hover:shadow-sm",
                    isEnterprise && "border-chart-4/30",
                    isLightLocked && "cursor-not-allowed opacity-60 hover:border-border hover:shadow-none"
                  )}
                  data-testid={`button-open-product-${product.productType}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{product.name}</p>
                      <p className="mt-1 text-small text-muted-foreground">
                        {formatCurrency(product.priceKrw)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {isEnterprise && <Badge variant="outline">대용량</Badge>}
                      {product.monthlyLimitCount && (
                        <Badge variant={isLightLocked ? "outline" : "secondary"}>
                          {isLightLocked ? "이번 달 완료" : "월 1회"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="mt-4 text-2xl font-bold text-primary">
                    {product.credits.toLocaleString("ko-KR")}C
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-small text-muted-foreground">
                    <span>문자 {product.messageCount.toLocaleString("ko-KR")}건</span>
                    {isLightLocked && <p className="text-primary">{CREDIT_COPY.lightNextMonth}</p>}
                  </div>
                </button>
              );
            })}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="transactions" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="transactions" data-testid="tab-transactions">크레딧 내역</TabsTrigger>
          <TabsTrigger value="refunds" data-testid="tab-refunds">환불 신청</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>크레딧 내역</CardTitle>
              <CardDescription>
                예약, 사용, 취소 해제, 실패 복구 내역을 시간순으로 확인해요
              </CardDescription>
            </CardHeader>
            <CardContent>
              {creditSummaryLoading || isLoading ? (
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
              ) : hasCreditLedger && ledgerEntries.length ? (
                <div className="space-y-1">
                  {visibleLedgerEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between py-4 px-2 rounded-lg hover-elevate -mx-2 border-b last:border-0"
                      data-testid={`row-credit-ledger-${entry.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-full",
                          entry.type === 'grant' || entry.type === 'release' ? "bg-success/10" :
                          entry.type === 'refund' || entry.type === 'adjustment' ? "bg-chart-4/10" : "bg-primary/10"
                        )}>
                          {getLedgerIcon(entry.type)}
                        </div>
                        <div>
                          <p className="font-medium">
                            {getLedgerLabel(entry.type, entry.description)}
                          </p>
                          <p className="text-small text-muted-foreground">
                            {formatDateTime(entry.createdAt)}
                            {entry.productType && ` · ${entry.productType}`}
                            {getLedgerDescription(entry) && ` · ${getLedgerDescription(entry)}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "font-medium",
                          entry.amountCredits >= 0 ? "text-success" : "text-foreground"
                        )}>
                          {entry.amountCredits >= 0 ? "+" : "-"}
                          {Math.abs(entry.amountCredits).toLocaleString("ko-KR")}C
                        </p>
                        {entry.balanceAfterCredits !== null && (
                          <p className="text-small text-muted-foreground">
                            잔여 {entry.balanceAfterCredits.toLocaleString("ko-KR")}C
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {hiddenLedgerCount > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 w-full"
                      onClick={() => setShowAllCreditHistory((value) => !value)}
                      data-testid="button-toggle-credit-history"
                    >
                      {showAllCreditHistory
                        ? "최근 내역만 보기"
                        : `${hiddenLedgerCount.toLocaleString("ko-KR")}개 더 보기`}
                    </Button>
                  )}
                </div>
              ) : transactions && transactions.length > 0 ? (
                <div className="space-y-1">
                  {visibleTransactions.map((transaction) => (
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
                          잔여 {formatCurrency(transaction.balanceAfter)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {hiddenTransactionCount > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 w-full"
                      onClick={() => setShowAllCreditHistory((value) => !value)}
                      data-testid="button-toggle-transaction-history"
                    >
                      {showAllCreditHistory
                        ? "최근 내역만 보기"
                        : `${hiddenTransactionCount.toLocaleString("ko-KR")}개 더 보기`}
                    </Button>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={CreditCard}
                  title="크레딧 내역을 만들 수 있어요"
                  description="크레딧을 충전하면 장부 내역을 확인해요"
                  action={{
                    label: "크레딧 충전하기",
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
                <CardDescription>
                  예약·사용되지 않은 남은 크레딧의 환불 진행 상황을 확인해요
                </CardDescription>
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
                      환불 가능 크레딧: {refundableCredits.toLocaleString("ko-KR")}C.
                      예상 환불 가능액은 {formatCurrency(refundableAmountKrw)}까지예요.
                      예약 중이거나 이미 사용된 크레딧은 제외돼요.
                      최종 환불액은 결제 상품과 사용 내역을 확인한 뒤 확정해요.
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
                            <p className="text-tiny text-muted-foreground">
                              최대 {formatCurrency(refundableAmountKrw)}까지 신청할 수 있어요.
                            </p>
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
                                placeholder="환불 사유를 입력해요"
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
                                  <SelectValue placeholder="은행을 선택해요" />
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
                          닫기
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
                  title="환불 신청 내역을 확인할 수 있어요"
                  description="환불을 신청하면 여기에 표시해요"
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

      {/* KIS PG 결제창 오버레이 (PC용 iframe 방식) */}
      {showPaymentFrame && paymentParams && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPaymentFrame(false);
              setIframeLoading(true);
            }
          }}
        >
          <div className="bg-background rounded-xl w-full max-w-[520px] shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100">
                  <ShieldCheck className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">안전한 결제</h3>
                  <p className="text-sm text-muted-foreground">
                    KIS PG 보안결제
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowPaymentFrame(false);
                  setIframeLoading(true);
                }}
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted transition-colors"
                data-testid="button-close-payment"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {/* iframe 컨테이너 */}
            <div className="relative h-[580px] bg-white">
              {/* 로딩 오버레이 */}
              {iframeLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
                  <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
                  <p className="text-muted-foreground">결제창을 불러오는 중...</p>
                </div>
              )}
              <iframe
                name="kispg_pay_frame"
                className="w-full h-full"
                title="KIS PG 결제"
                onLoad={() => setIframeLoading(false)}
              />
            </div>

            {/* 푸터 */}
            <div className="px-5 py-3 border-t bg-muted/30">
              <p className="text-xs text-center text-muted-foreground">
                결제 정보는 암호화해서 안전하게 처리해요
              </p>
            </div>
          </div>

          {/* 숨겨진 폼 */}
          <form
            ref={paymentFormRef}
            method="POST"
            action={paymentUrl}
            target="kispg_pay_frame"
            style={{ display: 'none' }}
          >
            {Object.entries(paymentParams).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
          </form>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import {
  Phone,
  RefreshCw,
  Loader2,
  Cloud,
  CheckCircle2,
  Clock,
  XCircle,
  Info,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface BizChatSenderNumber {
  id?: string;
  num?: string;
  name: string;
  state?: number;
  comment?: string;
}

interface BizChatSenderResponse {
  success: boolean;
  senderNumbers: BizChatSenderNumber[];
  error?: string;
}

function getSenderStateInfo(state?: number): { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 } {
  switch (state) {
    case 0:
      return { label: "대기", variant: "secondary", icon: Clock };
    case 1:
      return { label: "승인", variant: "default", icon: CheckCircle2 };
    case 2:
      return { label: "반려", variant: "destructive", icon: XCircle };
    default:
      return { label: "등록됨", variant: "outline", icon: CheckCircle2 };
  }
}

export default function SenderNumbers() {
  const [senderNumbers, setSenderNumbers] = useState<BizChatSenderNumber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { toast } = useToast();

  const fetchSenderNumbers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiRequest("POST", "/api/bizchat/sender", { action: "list" });
      const data: BizChatSenderResponse = await response.json();

      if (data.success) {
        setSenderNumbers(data.senderNumbers || []);
        toast({
          title: "발신번호 조회 완료",
          description: `${data.senderNumbers?.length || 0}개의 발신번호를 가져왔어요.`,
        });
      } else {
        setError(data.error || "발신번호를 가져오는데 실패했어요.");
        toast({
          title: "조회 실패",
          description: data.error || "발신번호를 가져오는데 실패했어요.",
          variant: "destructive",
        });
      }
    } catch (err) {
      const errorMsg = "서버와 통신하는 중 오류가 발생했어요.";
      setError(errorMsg);
      toast({
        title: "조회 실패",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSenderNumbers();
  }, []);

  const approvedCount = senderNumbers.filter(s => s.state === 1).length;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">발신번호</h1>
          <p className="mt-1 text-body-md text-muted-foreground">
            BizChat에 등록된 발신번호를 확인하고 캠페인에 사용해요
          </p>
        </div>
        <Button
          onClick={fetchSenderNumbers}
          disabled={isLoading}
          className="gap-2 w-fit"
          data-testid="button-refresh-senders"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          새로고침
        </Button>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          발신번호는 BizChat에서 직접 등록하고 관리해요. 이 페이지에서는 등록된 발신번호만 조회할 수 있어요.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Cloud className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-title-sm font-semibold">BizChat 발신번호</h2>
                <CardDescription>
                  SK 비즈챗에 등록된 발신번호 목록이에요
                </CardDescription>
              </div>
            </div>
            {!isLoading && senderNumbers.length > 0 && (
              <Badge variant="secondary" className="gap-1">
                승인된 번호 {approvedCount}개
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div>
                      <Skeleton className="h-5 w-32 mb-1" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-6">
              <EmptyState
                icon={XCircle}
                title="조회 실패"
                description={error}
              />
              <div className="flex justify-center mt-4">
                <Button onClick={fetchSenderNumbers} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  다시 시도
                </Button>
              </div>
            </div>
          ) : senderNumbers.length > 0 ? (
            <div className="divide-y">
              {senderNumbers.map((sender, idx) => {
                const senderId = sender.id || sender.num || `idx-${idx}`;
                const stateInfo = getSenderStateInfo(sender.state);
                const StateIcon = stateInfo.icon;

                return (
                  <div
                    key={senderId}
                    className="flex items-center justify-between p-4 hover-elevate"
                    data-testid={`row-sender-${senderId}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Phone className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="text-body-md font-medium">
                          {sender.name || sender.num || '이름 없음'}
                        </div>
                        <div className="flex items-center gap-2 text-caption text-muted-foreground">
                          {sender.num && (
                            <span>번호 코드: {sender.num}</span>
                          )}
                          {sender.id && (
                            <>
                              <span className="text-muted-foreground/50">|</span>
                              <span>ID: {sender.id}</span>
                            </>
                          )}
                        </div>
                        {sender.comment && (
                          <div className="mt-1 text-tiny text-muted-foreground">
                            {sender.comment}
                          </div>
                        )}
                      </div>
                    </div>
                    <Badge variant={stateInfo.variant} className="gap-1">
                      <StateIcon className="h-3 w-3" />
                      {stateInfo.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6">
              <EmptyState
                icon={Phone}
                title="발신번호를 등록하면 사용할 수 있어요"
                description="BizChat에서 발신번호를 등록한 뒤 다시 조회해요"
              />
              <div className="flex justify-center mt-4">
                <Button onClick={fetchSenderNumbers} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  다시 조회
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="text-body-md text-muted-foreground">
              <p className="mb-1 font-medium">발신번호 상태 안내</p>
              <ul className="space-y-1 list-disc list-inside">
                <li><strong>대기:</strong> BizChat 검수 대기 중인 발신번호</li>
                <li><strong>승인:</strong> 캠페인 발송에 사용 가능한 발신번호</li>
                <li><strong>반려:</strong> 검수가 반려된 발신번호 (사유 확인 필요)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

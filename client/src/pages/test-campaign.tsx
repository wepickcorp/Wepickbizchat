import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Send,
  Phone,
  AlertTriangle,
  Info,
  Loader2,
  CheckCircle2,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormDescription,
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
import type { Template } from "@shared/schema";

interface BizChatSenderNumber {
  id?: string;
  code?: string;
  num?: string;
  number?: string;
  name: string;
  displayName?: string;
  state?: number;
}

const testCampaignSchema = z.object({
  name: z.string().min(1, "캠페인 이름을 입력해주세요"),
  templateId: z.string().min(1, "템플릿을 선택해주세요"),
  sndNum: z.string().min(1, "발신번호를 선택해주세요"),
  mdnList: z.string().min(10, "테스트 발송할 전화번호를 입력해주세요"),
  scheduledAt: z.string().optional(),
});

type TestCampaignFormData = z.infer<typeof testCampaignSchema>;

const FALLBACK_SENDER_NUMBERS: BizChatSenderNumber[] = [
  { id: "001001", num: "16700823", name: "SK텔레콤 혜택 알림", state: 1 },
  { id: "001005", num: "16702305", name: "SK텔레콤 우리 동네 혜택 알림", state: 1 },
];

export default function TestCampaign() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null);

  const { data: approvedTemplates, isLoading: templatesLoading } = useQuery<Template[]>({
    queryKey: ["/api/templates/approved"],
  });

  const [senderNumbers, setSenderNumbers] = useState<BizChatSenderNumber[]>(FALLBACK_SENDER_NUMBERS);

  const form = useForm<TestCampaignFormData>({
    resolver: zodResolver(testCampaignSchema),
    defaultValues: {
      name: `테스트발송_${new Date().toISOString().slice(0, 10)}`,
      templateId: "",
      sndNum: "001001",
      mdnList: "",
    },
  });

  const getMinScheduledTime = () => {
    const now = new Date();
    const minTime = new Date(now.getTime() + 60 * 60 * 1000);
    minTime.setSeconds(0);
    minTime.setMilliseconds(0);
    const minutes = minTime.getMinutes();
    const remainder = minutes % 10;
    if (remainder > 0) {
      minTime.setMinutes(minutes + (10 - remainder));
    }
    return minTime;
  };

  const parseMdnList = (input: string): string[] => {
    return input
      .split(/[,\n\s]+/)
      .map(mdn => mdn.trim().replace(/[^0-9]/g, ''))
      .filter(mdn => mdn.length >= 10 && mdn.length <= 11)
      .map(mdn => mdn.startsWith('010') ? mdn : `010${mdn.slice(-8)}`);
  };

  const onSubmit = async (data: TestCampaignFormData) => {
    setIsSubmitting(true);

    try {
      const mdnList = parseMdnList(data.mdnList);

      if (mdnList.length === 0) {
        toast({
          title: "전화번호 오류",
          description: "유효한 전화번호를 입력해주세요 (예: 01012345678)",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      if (mdnList.length > 200000) {
        toast({
          title: "전화번호 초과",
          description: "최대 200,000개까지만 입력 가능해요",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      const mdnUploadRes = await apiRequest("POST", "/api/bizchat/mdn-upload", {
        action: "create-file",
        mdnList,
      });
      const mdnUploadData = await mdnUploadRes.json();

      if (!mdnUploadData.success || !mdnUploadData.mdnFileId) {
        toast({
          title: "MDN 파일 업로드 실패",
          description: mdnUploadData.error || "전화번호 파일 업로드에 실패했어요",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      const minScheduledTime = getMinScheduledTime();
      const scheduledAt = data.scheduledAt || minScheduledTime.toISOString();

      const template = approvedTemplates?.find(t => t.id === data.templateId);

      const campaignRes = await apiRequest("POST", "/api/campaigns/test-create", {
        name: data.name,
        templateId: data.templateId,
        messageType: template?.messageType || 'LMS',
        sndNum: data.sndNum,
        rcvType: 10,
        mdnFileId: mdnUploadData.mdnFileId,
        sndGoalCnt: mdnList.length,
        targetCount: mdnList.length,
        budget: mdnList.length * 50,
        scheduledAt,
      });
      const campaignData = await campaignRes.json();

      if (campaignData.success && campaignData.campaign?.id) {
        setCreatedCampaignId(campaignData.campaign.id);

        queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });

        toast({
          title: "테스트 캠페인 생성 완료",
          description: `${mdnList.length}건의 번호로 테스트 캠페인이 생성되었어요. 승인 요청 후 발송됩니다.`,
        });
      } else {
        toast({
          title: "캠페인 생성 실패",
          description: campaignData.error || "캠페인 생성에 실패했어요",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Test campaign creation error:", error);
      toast({
        title: "오류 발생",
        description: error instanceof Error ? error.message : "캠페인 생성 중 오류가 발생했어요",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTemplateId = form.watch("templateId");
  const selectedTemplate = approvedTemplates?.find(t => t.id === selectedTemplateId);
  const mdnListValue = form.watch("mdnList");
  const parsedMdnCount = parseMdnList(mdnListValue).length;

  if (createdCampaignId) {
    return (
      <div className="animate-fade-in space-y-6">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="pt-8 text-center space-y-6">
            <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-2">테스트 캠페인 생성 완료!</h2>
              <p className="text-muted-foreground">
                캠페인이 BizChat에 등록되었어요.<br />
                승인 요청 후 지정한 번호로 문자가 발송됩니다.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <Button asChild variant="outline">
                <Link href="/campaigns/history">발송 목록</Link>
              </Button>
              <Button asChild>
                <Link href={`/campaigns/${createdCampaignId}`}>캠페인 상세 보기</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/campaigns")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-display font-bold">테스트 발송 캠페인</h1>
          <p className="text-muted-foreground mt-1">
            특정 번호로만 문자를 발송하는 테스트 캠페인을 만들어요
          </p>
        </div>
      </div>

      <Alert className="border-amber-200 bg-amber-50">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800">SKT 번호만 수신 가능</AlertTitle>
        <AlertDescription className="text-amber-700">
          BizChat은 SK텔레콤 가입자 대상 서비스입니다.
          테스트 발송은 <strong>SKT 번호</strong>만 수신 가능하며,
          개발 환경에서만 사용 가능합니다.
        </AlertDescription>
      </Alert>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                캠페인 정보
              </CardTitle>
              <CardDescription>테스트 캠페인의 기본 정보를 입력해주세요</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>캠페인 이름</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="예: 테스트발송_12월10일"
                        {...field}
                        data-testid="input-campaign-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="templateId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>템플릿 선택</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-template">
                          <SelectValue placeholder="승인된 템플릿을 선택해주세요" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {templatesLoading ? (
                          <SelectItem value="_loading" disabled>로딩 중...</SelectItem>
                        ) : approvedTemplates && approvedTemplates.length > 0 ? (
                          approvedTemplates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name} ({template.messageType})
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="_empty" disabled>승인된 템플릿이 없어요</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      승인된 템플릿만 선택 가능해요
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedTemplate && (
                <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{selectedTemplate.messageType}</Badge>
                    <span className="font-medium">{selectedTemplate.name}</span>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedTemplate.content?.slice(0, 200)}
                    {(selectedTemplate.content?.length || 0) > 200 && '...'}
                  </p>
                </div>
              )}

              <FormField
                control={form.control}
                name="sndNum"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>발신번호</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-sender">
                          <SelectValue placeholder="발신번호를 선택해주세요" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {senderNumbers.map((sender) => (
                          <SelectItem
                            key={sender.id || sender.code}
                            value={sender.id || sender.code || ''}
                          >
                            {sender.name} ({sender.num || sender.number})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                수신 번호 입력
              </CardTitle>
              <CardDescription>
                테스트 발송할 전화번호를 입력해주세요 (SKT 번호만 수신 가능)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="mdnList"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>전화번호 목록</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="01012345678&#10;01098765432&#10;또는 쉼표로 구분: 01012345678, 01098765432"
                        className="min-h-[150px] font-mono"
                        {...field}
                        data-testid="input-mdn-list"
                      />
                    </FormControl>
                    <FormDescription className="flex items-center justify-between">
                      <span>줄바꿈, 쉼표, 공백으로 구분 가능 (최대 200,000건)</span>
                      {parsedMdnCount > 0 && (
                        <Badge variant="secondary">
                          {parsedMdnCount}건 인식됨
                        </Badge>
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>개발 환경에서만 사용 가능한 기능입니다 (rcvType: 10)</li>
                    <li>승인 요청 후 발송이 진행됩니다</li>
                    <li>발송 시간은 현재로부터 최소 1시간 이후로 자동 설정됩니다</li>
                    <li>발송 시간대: 09:00 ~ 20:00 (KST)</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/campaigns")}
              data-testid="button-cancel"
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || parsedMdnCount === 0}
              data-testid="button-submit"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  생성 중...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  테스트 캠페인 생성 ({parsedMdnCount}건)
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

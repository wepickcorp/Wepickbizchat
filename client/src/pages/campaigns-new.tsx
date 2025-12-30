import { useState, useEffect, useCallback } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Campaign, Targeting } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Users,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Image,
  Smartphone,
  FilePlus,
  Save,
  ChevronDown,
  ChevronUp,
  Clock,
  Calendar,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, formatNumber, getMessageTypeLabel } from "@/lib/authUtils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import TargetingAdvanced, { type AdvancedTargetingState } from "@/components/targeting-advanced";
import type { Template } from "@shared/schema";

interface BizChatSenderNumber {
  id?: string;           // 발신번호코드 (캠페인 생성 시 sndNum에 사용)
  code?: string;         // 발신번호코드 (별칭)
  num?: string;          // 실제 발신번호
  number?: string;       // 실제 발신번호 (별칭)
  name: string;          // 발신번호 이름
  displayName?: string;  // 표시용 이름
  state?: number;        // 상태 (1: 승인됨)
}

const campaignSchema = z.object({
  name: z.string().min(1, "캠페인 이름을 입력해주세요").max(200, "캠페인 이름은 200자 이내로 입력해주세요"),
  templateId: z.string().min(1, "템플릿을 선택해주세요"),
  sndNum: z.string().min(1, "발신번호를 선택해주세요"),
  gender: z.enum(["all", "male", "female"]).default("all"),
  ageMin: z.number().min(10).max(100).default(20),
  ageMax: z.number().min(10).max(100).default(60),
  regions: z.array(z.string()).default([]),
  targetCount: z.number().min(100, "최소 100명 이상 선택해주세요").default(1000),
  budget: z.number().min(10000, "최소 10,000원 이상 입력해주세요"),
  scheduledAt: z.string().optional(),
});

type CampaignFormData = z.infer<typeof campaignSchema>;

const steps = [
  { id: 1, title: "템플릿 선택", icon: FileText },
  { id: 2, title: "타겟 설정", icon: Users },
  { id: 3, title: "예산 및 확인", icon: CheckCircle2 },
];

const regions = [
  "서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종",
  "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"
];

function getMessageTypeIcon(type: string) {
  switch (type) {
    case "LMS":
      return MessageSquare;
    case "MMS":
      return Image;
    case "RCS":
      return Smartphone;
    default:
      return MessageSquare;
  }
}

interface CampaignWithDetails extends Campaign {
  targeting?: Targeting;
}

export default function CampaignsNew() {
  const [, navigate] = useLocation();
  const [, editParams] = useRoute("/campaigns/:id/edit");
  const campaignId = editParams?.id || null;
  const isEditMode = !!campaignId;
  
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [uploadedImageId, setUploadedImageId] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showAdvancedTargeting, setShowAdvancedTargeting] = useState(false);
  const [advancedTargeting, setAdvancedTargetingState] = useState<AdvancedTargetingState>({
    targetingMode: 'ats',
    shopping11stCategories: [],
    webappCategories: [],
    callCategories: [],
    locations: [],
    profiling: [],
    geofences: [],
    // ATS 모수 정보 (BizChat 연동용)
    sndMosu: undefined,
    sndMosuQuery: undefined,
    sndMosuDesc: undefined,
  });
  
  // 타겟팅 모드에 따른 편의 변수
  const isMaptics = advancedTargeting.targetingMode === 'maptics';
  
  // 핵심 버그 수정: targetingMode가 누락된 업데이트에서 이전 모드를 보존
  // 스테일 클로저 문제로 인해 자식 컴포넌트에서 오래된 targeting을 참조할 수 있음
  const setAdvancedTargeting = useCallback((newState: AdvancedTargetingState | ((prev: AdvancedTargetingState) => AdvancedTargetingState)) => {
    setAdvancedTargetingState(prev => {
      const nextState = typeof newState === 'function' ? newState(prev) : newState;
      // targetingMode가 명시적으로 제공되지 않으면 이전 모드 유지
      const preservedMode = nextState.targetingMode ?? prev.targetingMode;
      console.log('[CampaignForm] setAdvancedTargeting:', {
        prevMode: prev.targetingMode,
        newMode: nextState.targetingMode,
        preservedMode,
        hasGeofences: (nextState.geofences?.length ?? 0) > 0,
      });
      return {
        ...nextState,
        targetingMode: preservedMode,
      };
    });
  }, []);
  const [useScheduledSend, setUseScheduledSend] = useState(false);
  const [selectedScheduleDate, setSelectedScheduleDate] = useState<Date | null>(null);
  const [selectedScheduleTime, setSelectedScheduleTime] = useState<string | null>(null);

  // 10분 단위 올림, 현재+1시간 이후의 유효한 발송 시간 계산
  const getMinScheduledTime = () => {
    const now = new Date();
    const minTime = new Date(now.getTime() + 60 * 60 * 1000); // 현재 + 1시간
    minTime.setSeconds(0);
    minTime.setMilliseconds(0);
    const minutes = minTime.getMinutes();
    const remainder = minutes % 10;
    if (remainder > 0) {
      minTime.setMinutes(minutes + (10 - remainder));
    }
    return minTime;
  };

  // 선택 가능한 날짜 목록 (오늘~7일 후, maptics 모드는 내일부터)
  const getAvailableDates = (startFromTomorrow = false) => {
    const minTime = getMinScheduledTime();
    const dates: { date: Date; label: string; dayLabel: string }[] = [];
    const startDay = startFromTomorrow ? 1 : 0; // maptics 모드는 내일(D+1)부터
    
    for (let day = startDay; day < 7 + startDay; day++) {
      const targetDate = new Date(minTime);
      targetDate.setDate(targetDate.getDate() + day);
      targetDate.setHours(0, 0, 0, 0);
      
      const isToday = day === 0;
      const isTomorrow = day === 1;
      
      let dayLabel = targetDate.toLocaleDateString('ko-KR', { weekday: 'short' });
      if (isToday) dayLabel = "오늘";
      else if (isTomorrow) dayLabel = "내일";
      
      const label = targetDate.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
      dates.push({ date: targetDate, label, dayLabel });
    }
    return dates;
  };

  // 선택된 날짜의 시간 슬롯 (10분 단위)
  const getTimeSlotsForDate = (date: Date | null) => {
    if (!date) return [];
    
    const minTime = getMinScheduledTime();
    const slots: { value: string; label: string; period: string }[] = [];
    
    const isToday = date.toDateString() === new Date().toDateString();
    const startHour = isToday ? minTime.getHours() : 9;
    const startMinute = isToday ? minTime.getMinutes() : 0;
    
    const slotDate = new Date(date);
    slotDate.setHours(startHour, startMinute, 0, 0);
    
    const endTime = new Date(date);
    endTime.setHours(21, 0, 0, 0);
    
    while (slotDate <= endTime) {
      const hours = slotDate.getHours();
      const timeStr = slotDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
      let period = "오전";
      if (hours >= 12 && hours < 18) period = "오후";
      else if (hours >= 18) period = "저녁";
      
      slots.push({
        value: slotDate.toISOString(),
        label: timeStr,
        period,
      });
      slotDate.setTime(slotDate.getTime() + 10 * 60 * 1000);
    }
    return slots;
  };

  // 시간 슬롯을 시간대별로 그룹화
  const getGroupedTimeSlots = (date: Date | null) => {
    const slots = getTimeSlotsForDate(date);
    const groups: { period: string; slots: typeof slots }[] = [];
    
    const periods = ["오전", "오후", "저녁"];
    periods.forEach(period => {
      const periodSlots = slots.filter(s => s.period === period);
      if (periodSlots.length > 0) {
        groups.push({ period, slots: periodSlots });
      }
    });
    return groups;
  };

  // 빠른 선택 옵션
  const getQuickSelectOptions = () => {
    const minTime = getMinScheduledTime();
    const options: { label: string; value: string }[] = [];
    
    // 내일 오전 10시
    const tomorrow10am = new Date(minTime);
    tomorrow10am.setDate(tomorrow10am.getDate() + 1);
    tomorrow10am.setHours(10, 0, 0, 0);
    if (tomorrow10am > minTime) {
      options.push({ label: "내일 오전 10시", value: tomorrow10am.toISOString() });
    }
    
    // 내일 오후 2시
    const tomorrow2pm = new Date(minTime);
    tomorrow2pm.setDate(tomorrow2pm.getDate() + 1);
    tomorrow2pm.setHours(14, 0, 0, 0);
    if (tomorrow2pm > minTime) {
      options.push({ label: "내일 오후 2시", value: tomorrow2pm.toISOString() });
    }
    
    // 내일 저녁 6시
    const tomorrow6pm = new Date(minTime);
    tomorrow6pm.setDate(tomorrow6pm.getDate() + 1);
    tomorrow6pm.setHours(18, 0, 0, 0);
    if (tomorrow6pm > minTime) {
      options.push({ label: "내일 저녁 6시", value: tomorrow6pm.toISOString() });
    }
    
    return options;
  };

  // 날짜/시간 선택 시 폼 값 업데이트
  const updateScheduledAt = (date: Date | null, timeValue: string | null) => {
    if (date && timeValue) {
      form.setValue("scheduledAt", timeValue);
    }
  };

  const { data: existingCampaign, isLoading: campaignLoading } = useQuery<CampaignWithDetails>({
    queryKey: ["/api/campaigns", campaignId],
    enabled: isEditMode,
  });

  const { data: approvedTemplates, isLoading: templatesLoading } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
  });

  const [senderNumbers, setSenderNumbers] = useState<BizChatSenderNumber[]>([]);
  const [senderNumbersLoading, setSenderNumbersLoading] = useState(true);

  // 실제 BizChat 발신번호 코드 매핑 (API 문서 기준)
  // 발신번호코드(id)를 캠페인 생성 시 sndNum으로 사용해야 함
  const FALLBACK_SENDER_NUMBERS: BizChatSenderNumber[] = [
    { id: "001001", num: "16700823", name: "SK텔레콤 혜택 알림", state: 1 },
    { id: "001005", num: "16702305", name: "SK텔레콤 우리 동네 혜택 알림", state: 1 },
  ];

  useEffect(() => {
    const fetchBizChatSenders = async () => {
      setSenderNumbersLoading(true);
      try {
        const response = await apiRequest("POST", "/api/bizchat/sender", { action: "list" });
        const data = await response.json();
        if (data.success && data.senderNumbers && data.senderNumbers.length > 0) {
          const approvedSenders = data.senderNumbers.filter((s: BizChatSenderNumber) => s.state === 1);
          if (approvedSenders.length > 0) {
            setSenderNumbers(approvedSenders);
          } else {
            setSenderNumbers(FALLBACK_SENDER_NUMBERS);
          }
        } else {
          console.log("Using fallback sender numbers");
          setSenderNumbers(FALLBACK_SENDER_NUMBERS);
        }
      } catch (error) {
        console.error("Failed to fetch BizChat sender numbers, using fallback:", error);
        setSenderNumbers(FALLBACK_SENDER_NUMBERS);
      } finally {
        setSenderNumbersLoading(false);
      }
    };
    fetchBizChatSenders();
  }, []);

  const form = useForm<CampaignFormData>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: "",
      templateId: "",
      sndNum: "",
      gender: "all",
      ageMin: 20,
      ageMax: 60,
      regions: [],
      targetCount: 1000,
      budget: 100000,
    },
  });

  useEffect(() => {
    if (isEditMode && existingCampaign) {
      // scheduledAt이 있으면 예약발송 모드로 설정
      const scheduledDate = existingCampaign.scheduledAt ? new Date(existingCampaign.scheduledAt as unknown as string) : null;
      const hasScheduledAt = scheduledDate && scheduledDate > new Date();
      setUseScheduledSend(!!hasScheduledAt);
      
      form.reset({
        name: existingCampaign.name,
        templateId: existingCampaign.templateId || "",
        sndNum: existingCampaign.sndNum || "",
        gender: (existingCampaign.targeting?.gender as "all" | "male" | "female") || "all",
        ageMin: existingCampaign.targeting?.ageMin || 20,
        ageMax: existingCampaign.targeting?.ageMax || 60,
        regions: existingCampaign.targeting?.regions || [],
        targetCount: existingCampaign.targetCount || 1000,
        budget: parseFloat(existingCampaign.budget as string) || 100000,
        scheduledAt: hasScheduledAt && scheduledDate ? scheduledDate.toISOString() : undefined,
      });
      
      // 기존 sndMosu 데이터를 advancedTargeting과 atsData에 설정
      const campaign = existingCampaign as any;
      if (campaign.sndMosu || campaign.sndMosuQuery || campaign.sndMosuDesc) {
        setAdvancedTargeting(prev => ({
          ...prev,
          sndMosu: campaign.sndMosu || undefined,
          sndMosuQuery: campaign.sndMosuQuery || undefined,
          sndMosuDesc: campaign.sndMosuDesc || undefined,
        }));
        // atsData에도 초기화 (캠페인 저장 시 사용)
        setAtsData({
          sndMosu: campaign.sndMosu || undefined,
          sndMosuQuery: campaign.sndMosuQuery || undefined,
          sndMosuDesc: campaign.sndMosuDesc || undefined,
        });
      }
    }
  }, [isEditMode, existingCampaign, form]);

  const selectedTemplateId = form.watch("templateId");
  const selectedTemplate = approvedTemplates?.find(t => t.id === selectedTemplateId);
  
  const watchTargetCount = form.watch("targetCount");
  const watchBudget = form.watch("budget");
  const watchGender = form.watch("gender");
  const watchAgeMin = form.watch("ageMin");
  const watchAgeMax = form.watch("ageMax");
  const watchRegions = form.watch("regions");

  const [estimatedAudience, setEstimatedAudience] = useState({
    min: 900000,
    estimated: 1000000,
    max: 1100000,
    reachRate: 90,
  });

  // ATS 모수 정보를 별도 상태로 관리 (무한 루프 방지)
  const [atsData, setAtsData] = useState<{
    sndMosu?: number;
    sndMosuQuery?: string;
    sndMosuDesc?: string;
  }>({});
  
  // ATS 모수 정보는 targeting-advanced.tsx에서 계산하여 advancedTargeting.sndMosu에 저장됨
  // 중복 API 호출 방지를 위해 별도의 estimate 호출 제거
  // advancedTargeting.sndMosu가 업데이트되면 atsData에 동기화
  useEffect(() => {
    if (advancedTargeting.sndMosu !== undefined) {
      console.log('[Campaign Form] Syncing ATS mosu from advancedTargeting:', advancedTargeting.sndMosu);
      setAtsData({
        sndMosu: advancedTargeting.sndMosu,
        sndMosuQuery: advancedTargeting.sndMosuQuery,
        sndMosuDesc: advancedTargeting.sndMosuDesc,
      });
      // estimatedAudience도 업데이트
      setEstimatedAudience(prev => ({
        ...prev,
        estimated: advancedTargeting.sndMosu || prev.estimated,
        min: Math.floor((advancedTargeting.sndMosu || prev.estimated) * 0.8),
        max: Math.ceil((advancedTargeting.sndMosu || prev.estimated) * 1.2),
      }));
    }
  }, [advancedTargeting.sndMosu, advancedTargeting.sndMosuQuery, advancedTargeting.sndMosuDesc]);

  // 메시지 유형별 단가
  const MESSAGE_PRICES = { LMS: 100, MMS: 120, RCS: 130 };
  const messageType = selectedTemplate?.messageType || 'LMS';
  const costPerMessage = MESSAGE_PRICES[messageType as keyof typeof MESSAGE_PRICES] || 100;
  const estimatedCost = watchTargetCount * costPerMessage;
  const userBalance = parseFloat(user?.balance as string || "0");

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileType', 'image');
    
    try {
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('업로드 실패');
      }
      
      const data = await response.json();
      setUploadedImageId(data.id);
      setUploadedImageUrl(URL.createObjectURL(file));
      toast({ 
        title: "이미지 업로드 완료",
        description: "이미지가 성공적으로 업로드되었어요"
      });
    } catch (error) {
      toast({ 
        title: "이미지 업로드 실패", 
        description: "이미지 업로드 중 오류가 발생했어요. 다시 시도해주세요.",
        variant: "destructive" 
      });
    } finally {
      setUploading(false);
    }
  };

  const saveCampaignMutation = useMutation({
    mutationFn: async (data: CampaignFormData) => {
      const template = approvedTemplates?.find(t => t.id === data.templateId);
      if (!template) throw new Error("템플릿을 찾을 수 없습니다");

      // 지오펜스(maptics) 캠페인인지 확인
      const hasGeofence = (advancedTargeting.geofences?.length ?? 0) > 0;
      const isMapticsCampaign = advancedTargeting.targetingMode === 'maptics' || hasGeofence;
      
      const campaignData = {
        name: data.name,
        templateId: data.templateId,
        messageType: template.messageType,
        sndNum: data.sndNum,
        gender: data.gender,
        ageMin: data.ageMin,
        ageMax: data.ageMax,
        regions: data.regions,
        targetCount: data.targetCount,
        budget: data.budget,
        scheduledAt: data.scheduledAt || undefined,
        // 고급 타겟팅 옵션
        ...advancedTargeting,
        // ATS 모수 정보: atsData 우선, 없으면 advancedTargeting에서 가져옴
        sndMosu: atsData.sndMosu || advancedTargeting.sndMosu || null,
        sndMosuQuery: atsData.sndMosuQuery || advancedTargeting.sndMosuQuery || null,
        sndMosuDesc: atsData.sndMosuDesc || advancedTargeting.sndMosuDesc || null,
        // 발송 목표 건수
        sndGoalCnt: data.targetCount,
        // Maptics(지오펜스) 캠페인 필수 필드: 실시간 발송 (rcvType=1)
        // 지오펜스 캠페인은 기본적으로 실시간 발송으로 09:00~21:00 시간대 설정
        ...(isMapticsCampaign ? {
          mapticsSendType: 'realtime' as const,
          rtStartHhmm: '0900',
          rtEndHhmm: '2100',
          sndDayDiv: 0,
        } : {}),
      };

      if (isEditMode && campaignId) {
        const response = await apiRequest("PATCH", `/api/campaigns/${campaignId}`, campaignData);
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/campaigns", campaignData);
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      if (isEditMode) {
        queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      }
      toast({
        title: isEditMode ? "캠페인 수정 완료" : "캠페인 저장 완료",
        description: isEditMode 
          ? "캠페인이 수정되었어요." 
          : "캠페인이 저장되었어요. 캠페인 목록에서 발송할 수 있어요.",
      });
      navigate("/campaigns");
    },
    onError: (error: Error) => {
      toast({
        title: isEditMode ? "캠페인 수정 실패" : "캠페인 저장 실패",
        description: error.message || "캠페인 저장 중 오류가 발생했어요. 다시 시도해주세요.",
        variant: "destructive",
      });
    },
  });

  const nextStep = async (e?: React.MouseEvent) => {
    // Stop event propagation to prevent form submit
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Prevent double clicks during transition
    if (isTransitioning) {
      console.log('[Campaign Form] Step transition blocked - already transitioning');
      return;
    }
    
    if (currentStep === 1) {
      const isValid = await form.trigger(["name", "templateId", "sndNum"]);
      if (!isValid) return;
    }
    if (currentStep === 2) {
      const isValid = await form.trigger(["gender", "ageMin", "ageMax"]);
      if (!isValid) return;
    }
    if (currentStep < 3) {
      setIsTransitioning(true);
      console.log('[Campaign Form] Transitioning from step', currentStep, 'to step', currentStep + 1);
      setCurrentStep(prev => prev + 1);
      // Allow next transition after state update
      setTimeout(() => setIsTransitioning(false), 300);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const onSubmit = (data: CampaignFormData) => {
    // Only submit when on the final step (Step 3)
    if (currentStep !== 3) {
      console.log('[Campaign Form] Submit blocked - not on step 3, current step:', currentStep);
      return;
    }
    console.log('[Campaign Form] Submitting campaign data:', data);
    saveCampaignMutation.mutate(data);
  };

  // Prevent Enter key from submitting the form on intermediate steps
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && currentStep !== 3) {
      e.preventDefault();
    }
  };

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
          <h1 className="text-display font-bold">
            {isEditMode ? "캠페인 수정" : "캠페인 만들기"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEditMode 
              ? "캠페인 정보를 수정하세요" 
              : "승인된 템플릿으로 새로운 광고 캠페인을 만들어보세요"}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 mb-8">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => currentStep > step.id && setCurrentStep(step.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
                currentStep === step.id
                  ? "bg-primary text-primary-foreground"
                  : currentStep > step.id
                  ? "bg-success/10 text-success cursor-pointer"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              disabled={currentStep < step.id}
              data-testid={`button-step-${step.id}`}
            >
              <step.icon className="h-4 w-4" />
              <span className="text-small font-medium hidden md:inline">{step.title}</span>
              <span className="text-small font-medium md:hidden">{step.id}</span>
            </button>
            {index < steps.length - 1 && (
              <div className={cn(
                "w-8 h-0.5 mx-1",
                currentStep > step.id ? "bg-success" : "bg-muted"
              )} />
            )}
          </div>
        ))}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} onKeyDown={handleKeyDown} className="space-y-6">
          {currentStep === 1 && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>캠페인 정보</CardTitle>
                  <CardDescription>캠페인 이름을 입력하고 사용할 템플릿을 선택해주세요</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>캠페인 이름</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="예: 2024년 연말 프로모션" 
                            {...field} 
                            data-testid="input-campaign-name"
                          />
                        </FormControl>
                        <FormDescription>캠페인을 구분할 수 있는 이름을 입력해주세요</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>템플릿 선택</CardTitle>
                  <CardDescription>
                    승인된 템플릿 중에서 사용할 템플릿을 선택해주세요
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {templatesLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-24 w-full" />
                      ))}
                    </div>
                  ) : approvedTemplates && approvedTemplates.length > 0 ? (
                    <FormField
                      control={form.control}
                      name="templateId"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              value={field.value}
                              className="space-y-3"
                            >
                              {approvedTemplates.map((template) => {
                                const Icon = getMessageTypeIcon(template.messageType);
                                return (
                                  <Label
                                    key={template.id}
                                    htmlFor={`template-${template.id}`}
                                    className={cn(
                                      "flex items-start gap-4 p-4 rounded-lg border cursor-pointer hover-elevate",
                                      field.value === template.id
                                        ? "border-primary bg-accent"
                                        : "border-border"
                                    )}
                                    data-testid={`radio-template-${template.id}`}
                                  >
                                    <RadioGroupItem 
                                      value={template.id} 
                                      id={`template-${template.id}`} 
                                      className="mt-1" 
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium">{template.name}</span>
                                        <Badge variant="outline" className="text-tiny gap-1">
                                          <Icon className="h-3 w-3" />
                                          {getMessageTypeLabel(template.messageType)}
                                        </Badge>
                                      </div>
                                      <p className="text-small text-muted-foreground line-clamp-2">
                                        {template.content}
                                      </p>
                                    </div>
                                  </Label>
                                );
                              })}
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <div className="text-center py-12">
                      <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="font-semibold mb-2">승인된 메세지가 없어요</h3>
                      <p className="text-small text-muted-foreground mb-4">
                        먼저 메세지를 만들고 검수를 받아야 캠페인을 만들 수 있어요
                      </p>
                      <Button asChild className="gap-2">
                        <Link href="/templates/new">
                          <FilePlus className="h-4 w-4" />
                          메세지 만들기
                        </Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>발신번호 선택</CardTitle>
                  <CardDescription>
                    캠페인 발송에 사용할 발신번호를 선택해주세요
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {senderNumbersLoading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <FormField
                      control={form.control}
                      name="sndNum"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>발신번호</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-sender-number">
                                <SelectValue placeholder="발신번호를 선택하세요" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {senderNumbers?.length > 0 ? (
                                senderNumbers.map((sender, idx) => {
                                  // BizChat API에서는 발신번호코드(id)를 sndNum으로 사용해야 함
                                  // 예: id="001001" → sndNum="001001" (실제 번호: 16700823)
                                  const senderCode = sender.id || sender.code || `sender-${idx}`;
                                  const displayNumber = sender.num || sender.number || '';
                                  const displayName = sender.name || sender.displayName || '';
                                  return (
                                    <SelectItem key={senderCode} value={senderCode}>
                                      {displayName} {displayNumber ? `(${displayNumber})` : ''}
                                    </SelectItem>
                                  );
                                })
                              ) : (
                                <div className="p-2 text-small text-muted-foreground text-center">
                                  승인된 발신번호가 없어요
                                </div>
                              )}
                            </SelectContent>
                          </Select>
                          <FormDescription>캠페인 발송에 사용될 번호예요</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>

              {selectedTemplate && (selectedTemplate.messageType === "MMS" || selectedTemplate.messageType === "RCS") && (
                <Card>
                  <CardHeader>
                    <CardTitle>이미지 업로드</CardTitle>
                    <CardDescription>
                      {selectedTemplate.messageType} 메시지에 포함될 이미지를 업로드해주세요 (선택사항)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="image-upload">이미지 파일</Label>
                      <Input
                        id="image-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        disabled={uploading}
                        className="mt-2"
                        data-testid="input-upload-image"
                      />
                      <p className="text-tiny text-muted-foreground mt-2">
                        JPG, PNG 형식 지원 (최대 10MB)
                      </p>
                    </div>
                    
                    {uploading && (
                      <div className="flex items-center gap-2 text-small text-muted-foreground">
                        <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                        <span>이미지 업로드 중...</span>
                      </div>
                    )}
                    
                    {uploadedImageUrl && (
                      <div className="space-y-2">
                        <Label>미리보기</Label>
                        <div className="rounded-lg overflow-hidden bg-muted max-w-xs">
                          <img 
                            src={uploadedImageUrl} 
                            alt="업로드된 이미지" 
                            className="w-full h-auto"
                            data-testid="img-preview"
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {selectedTemplate && (
                <Card className="bg-accent/50 border-accent">
                  <CardHeader>
                    <CardTitle className="text-h3">선택한 템플릿 미리보기</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-background rounded-xl p-4 shadow-sm max-w-[320px] space-y-3">
                      <div className="flex items-center gap-2 text-small text-muted-foreground">
                        {(() => {
                          const Icon = getMessageTypeIcon(selectedTemplate.messageType);
                          return <Icon className="h-4 w-4" />;
                        })()}
                        <span>{getMessageTypeLabel(selectedTemplate.messageType)}</span>
                      </div>
                      
                      {selectedTemplate.title && (
                        <div className="font-semibold text-body">
                          {selectedTemplate.title}
                        </div>
                      )}
                      
                      {selectedTemplate.imageUrl && (
                        <div className="rounded-lg overflow-hidden bg-muted aspect-video">
                          <img 
                            src={selectedTemplate.imageUrl} 
                            alt="템플릿 이미지" 
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      
                      <div className="text-small whitespace-pre-wrap">
                        {selectedTemplate.content}
                      </div>
                      
                      <div className="text-tiny text-muted-foreground pt-2 border-t">
                        SK코어타겟 비즈챗
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>타겟 설정</CardTitle>
                <CardDescription>광고를 받을 대상을 설정해주세요</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>성별</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex gap-4"
                        >
                          {[
                            { value: "all", label: "전체" },
                            { value: "male", label: "남성" },
                            { value: "female", label: "여성" },
                          ].map((option) => (
                            <Label
                              key={option.value}
                              htmlFor={`gender-${option.value}`}
                              className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer",
                                field.value === option.value
                                  ? "border-primary bg-accent"
                                  : "border-border hover-elevate"
                              )}
                            >
                              <RadioGroupItem value={option.value} id={`gender-${option.value}`} />
                              <span>{option.label}</span>
                            </Label>
                          ))}
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <Label>연령대</Label>
                  <div className="flex items-center gap-4">
                    <FormField
                      control={form.control}
                      name="ageMin"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <Select 
                            onValueChange={(v) => field.onChange(parseInt(v))} 
                            value={field.value.toString()}
                          >
                            <SelectTrigger data-testid="select-age-min">
                              <SelectValue placeholder="최소 연령" />
                            </SelectTrigger>
                            <SelectContent>
                              {[10, 20, 30, 40, 50, 60, 70].map((age) => (
                                <SelectItem key={age} value={age.toString()}>
                                  {age}세
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <span className="text-muted-foreground">~</span>
                    <FormField
                      control={form.control}
                      name="ageMax"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <Select 
                            onValueChange={(v) => field.onChange(parseInt(v))} 
                            value={field.value.toString()}
                          >
                            <SelectTrigger data-testid="select-age-max">
                              <SelectValue placeholder="최대 연령" />
                            </SelectTrigger>
                            <SelectContent>
                              {[20, 30, 40, 50, 60, 70, 80, 100].map((age) => (
                                <SelectItem key={age} value={age.toString()}>
                                  {age}세
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="regions"
                  render={() => (
                    <FormItem>
                      <div className="mb-4">
                        <FormLabel>지역</FormLabel>
                        <FormDescription>타겟팅할 지역을 선택해주세요 (선택 안함 = 전국)</FormDescription>
                      </div>
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                        {regions.map((region) => (
                          <FormField
                            key={region}
                            control={form.control}
                            name="regions"
                            render={({ field }) => (
                              <FormItem
                                key={region}
                                className="flex items-center space-x-2 space-y-0"
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(region)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...field.value, region])
                                        : field.onChange(
                                            field.value?.filter((v) => v !== region)
                                          );
                                    }}
                                    data-testid={`checkbox-region-${region}`}
                                  />
                                </FormControl>
                                <FormLabel className="text-small font-normal cursor-pointer">
                                  {region}
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </FormItem>
                  )}
                />

                <Card className="bg-muted/50">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-small text-muted-foreground">예상 도달 가능 인원</div>
                        <div className="text-h2 font-bold" data-testid="text-estimated-audience">
                          {formatNumber(estimatedAudience.estimated)}명
                        </div>
                        <div className="text-tiny text-muted-foreground">
                          ({formatNumber(estimatedAudience.min)} ~ {formatNumber(estimatedAudience.max)}명)
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-small text-muted-foreground">예상 도달률</div>
                        <div className="text-h2 font-bold text-primary">
                          {estimatedAudience.reachRate}%
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
            
            <Collapsible open={showAdvancedTargeting} onOpenChange={setShowAdvancedTargeting}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover-elevate">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          고급 타겟팅
                          <Badge variant="outline" className="font-normal">SK CoreTarget</Badge>
                        </CardTitle>
                        <CardDescription>
                          빅데이터 기반 정밀 타겟팅으로 광고 효과 UP
                        </CardDescription>
                      </div>
                      {showAdvancedTargeting ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <TargetingAdvanced
                      targeting={advancedTargeting}
                      onTargetingChange={setAdvancedTargeting}
                      basicTargeting={{
                        gender: watchGender,
                        ageMin: watchAgeMin,
                        ageMax: watchAgeMax,
                        regions: watchRegions,
                      }}
                    />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              {/* Maptics 모드: 모수 조회 불가 안내 */}
              {isMaptics && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-amber-800">위치 기반 광고 안내</p>
                        <p className="text-small text-amber-700 mt-1">
                          특정 장소 주변 고객에게 광고를 보내는 방식이에요. 
                          <strong>미리 몇 명에게 보낼 수 있는지 알 수 없어요.</strong> 
                          광고 승인 후에 최종 인원이 정해져요.
                        </p>
                        <ul className="text-small text-amber-700 mt-2 list-disc list-inside space-y-1">
                          <li>목표 인원은 넉넉하게 설정해 주세요</li>
                          <li>실제로 보낸 만큼만 비용이 청구돼요</li>
                          <li>광고 등록 후 <strong>하루 이상</strong> 여유를 두세요</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              <Card>
                <CardHeader>
                  <CardTitle>발송 수량</CardTitle>
                  <CardDescription>
                    {isMaptics 
                      ? "광고를 보내고 싶은 인원을 입력해주세요" 
                      : "광고를 받을 대상 수를 설정해주세요"
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="targetCount"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between mb-4">
                          <FormLabel>{isMaptics ? "희망 발송 수량" : "발송 수량"}</FormLabel>
                          <div className="text-h3 font-bold" data-testid="text-target-count">
                            {formatNumber(field.value)}명
                          </div>
                        </div>
                        <FormControl>
                          {isMaptics ? (
                            /* Maptics: 직접 입력 방식 */
                            <div className="space-y-4">
                              <Input
                                type="number"
                                min={100}
                                max={100000}
                                step={100}
                                value={field.value}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 100)}
                                className="text-right"
                                data-testid="input-target-count-maptics"
                              />
                              <p className="text-tiny text-muted-foreground">
                                100명에서 100,000명 사이로 입력할 수 있어요. 
                                실제로 광고를 받는 사람 수는 달라질 수 있어요.
                              </p>
                            </div>
                          ) : (
                            /* ATS: 슬라이더 방식 */
                            <div className="space-y-4">
                              <input
                                type="range"
                                min={100}
                                max={Math.min(estimatedAudience.estimated, 100000)}
                                step={100}
                                value={field.value}
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                                data-testid="slider-target-count"
                              />
                              <div className="flex justify-between text-tiny text-muted-foreground">
                                <span>100명</span>
                                <span>{formatNumber(Math.min(estimatedAudience.estimated, 100000))}명</span>
                              </div>
                            </div>
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>예산 설정</CardTitle>
                  <CardDescription>캠페인 예산을 설정해주세요</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="budget"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>예산</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type="number"
                              min={10000}
                              step={10000}
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              className="pl-8"
                              data-testid="input-budget"
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                              ₩
                            </span>
                          </div>
                        </FormControl>
                        <FormDescription>
                          건당 {formatCurrency(costPerMessage)} × {formatNumber(watchTargetCount)}건 = {formatCurrency(estimatedCost)}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <Card className="bg-muted/50">
                      <CardContent className="py-4">
                        <div className="text-small text-muted-foreground mb-1">현재 잔액</div>
                        <div className="text-h3 font-bold" data-testid="text-user-balance">
                          {formatCurrency(userBalance)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className={cn(
                      "bg-muted/50",
                      watchBudget > userBalance && "border-destructive"
                    )}>
                      <CardContent className="py-4">
                        <div className="text-small text-muted-foreground mb-1">예상 비용</div>
                        <div className={cn(
                          "text-h3 font-bold",
                          watchBudget > userBalance && "text-destructive"
                        )} data-testid="text-estimated-cost">
                          {formatCurrency(estimatedCost)}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {watchBudget > userBalance && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
                      <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">잔액이 부족해요</p>
                        <p className="text-small">
                          {formatCurrency(watchBudget - userBalance)}을 추가로 충전해주세요.{" "}
                          <Link href="/billing" className="underline">
                            충전하러 가기
                          </Link>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 타겟팅 모드별 안내 메시지 */}
                  {isMaptics ? (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 text-amber-700 border border-amber-200" data-testid="info-maptics-budget">
                      <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">예산 안내</p>
                        <p className="text-small">
                          위에 표시된 예상 비용은 <strong>대략적인 금액</strong>이에요. 
                          실제로 광고를 받는 사람 수에 따라 비용이 달라질 수 있으니, 예산을 여유 있게 준비해 주세요.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 text-blue-700 border border-blue-200" data-testid="info-ats-mosu">
                      <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">발송 모수 안내</p>
                        <p className="text-small">
                          발송 목표 건수의 <strong>150% 이상</strong>의 타겟 모수가 필요합니다. 
                          타겟팅 조건이 너무 좁으면 승인이 거부될 수 있습니다. 
                          (최대 발송 모수: 400,000명)
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    {isMaptics ? "캠페인 활성 기간" : "발송 일시 설정"}
                  </CardTitle>
                  <CardDescription>
                    {isMaptics 
                      ? "지오펜스 캠페인이 활성화되는 기간을 설정해주세요" 
                      : "캠페인 발송 시간을 설정해주세요"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {isMaptics ? (
                    /* 지오펜스 실시간 모드: 캠페인 활성 기간 설정 */
                    <div className="space-y-4">
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                        <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium">실시간 발송 안내</p>
                          <p className="text-small">
                            지오펜스 캠페인은 설정된 기간 동안 타겟 지역에 들어오는 고객에게 <strong>실시간으로</strong> 메세지가 발송됩니다.
                          </p>
                        </div>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium mb-2 block">활성 시작일 선택 (최소 D+1)</Label>
                        <div className="grid grid-cols-7 gap-2">
                          {getAvailableDates(true).map((dateOption) => (
                            <button
                              key={dateOption.date.toISOString()}
                              type="button"
                              onClick={() => {
                                setSelectedScheduleDate(dateOption.date);
                                // 지오펜스 모드에서는 선택한 날짜의 자정부터 활성화
                                const startOfDay = new Date(dateOption.date);
                                startOfDay.setHours(0, 0, 0, 0);
                                form.setValue("scheduledAt", startOfDay.toISOString());
                              }}
                              className={cn(
                                "flex flex-col items-center justify-center p-2 rounded-lg border transition-colors",
                                selectedScheduleDate?.toDateString() === dateOption.date.toDateString()
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border hover:bg-accent hover:text-accent-foreground"
                              )}
                              data-testid={`button-date-${dateOption.label}`}
                            >
                              <span className="text-tiny font-medium">{dateOption.dayLabel}</span>
                              <span className="text-sm font-bold">{dateOption.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {selectedScheduleDate && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                          <Calendar className="h-5 w-5 text-primary" />
                          <span className="font-medium text-primary">
                            {selectedScheduleDate.toLocaleDateString('ko-KR', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              weekday: 'long',
                            })} 부터 활성화
                          </span>
                        </div>
                      )}

                      <p className="text-tiny text-muted-foreground">
                        선택한 날짜부터 캠페인이 활성화되며, 예산 소진 시 자동으로 종료됩니다.
                      </p>
                    </div>
                  ) : (
                    /* 일반 ATS 모드: 발송 일시 설정 */
                    <div className="space-y-4">
                    <RadioGroup
                      value={useScheduledSend ? "scheduled" : "immediate"}
                      onValueChange={(value) => {
                        setUseScheduledSend(value === "scheduled");
                        if (value === "immediate") {
                          form.setValue("scheduledAt", undefined);
                        } else {
                          const minTime = getMinScheduledTime();
                          form.setValue("scheduledAt", minTime.toISOString());
                        }
                      }}
                      className="grid grid-cols-2 gap-4"
                    >
                      <div className="relative">
                        <RadioGroupItem
                          value="immediate"
                          id="send-immediate"
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor="send-immediate"
                          className={cn(
                            "flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-4 cursor-pointer transition-colors",
                            "hover:bg-accent hover:text-accent-foreground",
                            !useScheduledSend && "border-primary bg-primary/5"
                          )}
                          data-testid="radio-send-immediate"
                        >
                          <Clock className="mb-2 h-6 w-6" />
                          <span className="font-medium">바로 발송</span>
                          <span className="text-tiny text-muted-foreground mt-1">승인 후 즉시 발송</span>
                        </Label>
                      </div>
                      <div className="relative">
                        <RadioGroupItem
                          value="scheduled"
                          id="send-scheduled"
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor="send-scheduled"
                          className={cn(
                            "flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-4 cursor-pointer transition-colors",
                            "hover:bg-accent hover:text-accent-foreground",
                            useScheduledSend && "border-primary bg-primary/5"
                          )}
                          data-testid="radio-send-scheduled"
                        >
                          <Calendar className="mb-2 h-6 w-6" />
                          <span className="font-medium">예약 발송</span>
                          <span className="text-tiny text-muted-foreground mt-1">원하는 시간에 발송</span>
                        </Label>
                      </div>
                    </RadioGroup>

                    {useScheduledSend && (
                      <div className="space-y-4">
                        {/* 빠른 선택 */}
                        <div>
                          <Label className="text-sm font-medium mb-2 block">빠른 선택</Label>
                          <div className="flex flex-wrap gap-2">
                            {getQuickSelectOptions().map((option) => (
                              <Button
                                key={option.value}
                                type="button"
                                variant={form.watch("scheduledAt") === option.value ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                  const optionDate = new Date(option.value);
                                  setSelectedScheduleDate(new Date(optionDate.getFullYear(), optionDate.getMonth(), optionDate.getDate()));
                                  setSelectedScheduleTime(option.value);
                                  form.setValue("scheduledAt", option.value);
                                }}
                                data-testid={`button-quick-${option.label}`}
                              >
                                {option.label}
                              </Button>
                            ))}
                          </div>
                        </div>

                        {/* 날짜 선택 */}
                        <div>
                          <Label className="text-sm font-medium mb-2 block">날짜 선택</Label>
                          <div className="grid grid-cols-7 gap-2">
                            {getAvailableDates().map((dateOption) => (
                              <button
                                key={dateOption.date.toISOString()}
                                type="button"
                                onClick={() => {
                                  setSelectedScheduleDate(dateOption.date);
                                  setSelectedScheduleTime(null);
                                  form.setValue("scheduledAt", undefined);
                                }}
                                className={cn(
                                  "flex flex-col items-center justify-center p-2 rounded-lg border transition-colors",
                                  selectedScheduleDate?.toDateString() === dateOption.date.toDateString()
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border hover:bg-accent hover:text-accent-foreground"
                                )}
                                data-testid={`button-date-${dateOption.label}`}
                              >
                                <span className="text-tiny font-medium">{dateOption.dayLabel}</span>
                                <span className="text-sm font-bold">{dateOption.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 시간 선택 */}
                        {selectedScheduleDate && (
                          <div>
                            <Label className="text-sm font-medium mb-2 block">시간 선택</Label>
                            <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2">
                              {getGroupedTimeSlots(selectedScheduleDate).map((group) => (
                                <div key={group.period}>
                                  <div className="text-tiny font-medium text-muted-foreground mb-1.5 sticky top-0 bg-background py-1">
                                    {group.period} ({group.period === "오전" ? "9:00-11:50" : group.period === "오후" ? "12:00-17:50" : "18:00-21:00"})
                                  </div>
                                  <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
                                    {group.slots.map((slot) => (
                                      <button
                                        key={slot.value}
                                        type="button"
                                        onClick={() => {
                                          setSelectedScheduleTime(slot.value);
                                          form.setValue("scheduledAt", slot.value);
                                        }}
                                        className={cn(
                                          "px-2 py-1.5 text-sm rounded-md border transition-colors text-center",
                                          selectedScheduleTime === slot.value
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "border-border hover:bg-accent hover:text-accent-foreground"
                                        )}
                                        data-testid={`button-time-${slot.label}`}
                                      >
                                        {slot.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 선택된 일시 표시 */}
                        {form.watch("scheduledAt") && (
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                            <Clock className="h-5 w-5 text-primary" />
                            <span className="font-medium text-primary">
                              {new Date(form.watch("scheduledAt") as string).toLocaleString('ko-KR', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                weekday: 'long',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                              })}
                            </span>
                          </div>
                        )}

                        <p className="text-tiny text-muted-foreground">
                          발송은 10분 단위로 예약 가능하며, 현재 시간 기준 최소 1시간 이후부터 설정할 수 있어요
                        </p>
                      </div>
                    )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>캠페인 요약</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">캠페인 이름</span>
                      <span className="font-medium" data-testid="summary-campaign-name">{form.watch("name") || "-"}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">템플릿</span>
                      <span className="font-medium" data-testid="summary-template">{selectedTemplate?.name || "-"}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">메시지 유형</span>
                      <span className="font-medium">{selectedTemplate ? getMessageTypeLabel(selectedTemplate.messageType) : "-"}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">타겟 성별</span>
                      <span className="font-medium">
                        {watchGender === "all" ? "전체" : watchGender === "male" ? "남성" : "여성"}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">타겟 연령</span>
                      <span className="font-medium">{watchAgeMin}세 ~ {watchAgeMax}세</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">타겟 지역</span>
                      <span className="font-medium">
                        {watchRegions.length > 0 ? watchRegions.join(", ") : "전국"}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">발송 수량</span>
                      <span className="font-medium">{formatNumber(watchTargetCount)}명</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">{isMaptics ? "활성 시작일" : "발송 일시"}</span>
                      <span className="font-medium" data-testid="summary-scheduled-time">
                        {isMaptics
                          ? (form.watch("scheduledAt")
                            ? new Date(form.watch("scheduledAt") as string).toLocaleDateString('ko-KR', {
                                month: 'long',
                                day: 'numeric',
                                weekday: 'short',
                              }) + " 부터 실시간"
                            : "선택 안됨")
                          : (useScheduledSend && form.watch("scheduledAt")
                            ? new Date(form.watch("scheduledAt") as string).toLocaleString('ko-KR', {
                                month: 'long',
                                day: 'numeric',
                                weekday: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                              })
                            : "승인 후 즉시 발송")}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-muted-foreground">예상 비용</span>
                      <span className="font-bold text-primary">{formatCurrency(estimatedCost)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>
          )}

          {/* Submit button only shown on step 3 */}
          {currentStep === 3 && (
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={saveCampaignMutation.isPending || estimatedCost > userBalance}
                className="gap-2"
                data-testid="button-save-campaign"
              >
                {saveCampaignMutation.isPending 
                  ? "저장 중..." 
                  : isEditMode ? "캠페인 수정하기" : "캠페인 저장하기"}
                <Save className="h-4 w-4" />
              </Button>
            </div>
          )}
        </form>
      </Form>

      {/* Navigation buttons - OUTSIDE the form to prevent event bubbling */}
      <div className="flex justify-between gap-4 mt-6">
        {currentStep > 1 ? (
          <Button
            type="button"
            variant="outline"
            onClick={prevStep}
            className="gap-2"
            data-testid="button-prev-step"
          >
            <ArrowLeft className="h-4 w-4" />
            이전
          </Button>
        ) : (
          <div />
        )}
        
        {currentStep < 3 && (
          <Button
            type="button"
            onClick={(e) => nextStep(e)}
            className="gap-2"
            disabled={isTransitioning || (currentStep === 1 && (!form.watch("name") || !form.watch("templateId")))}
            data-testid="button-next-step"
          >
            {isTransitioning ? "이동 중..." : "다음"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

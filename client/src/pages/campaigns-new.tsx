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
  Save,
  ChevronDown,
  ChevronUp,
  Clock,
  Calendar,
  Target,
  Zap,
  MapPin,
  FolderOpen,
  Send,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, formatNumber, getMessageTypeLabel } from "@/lib/authUtils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getUserFacingMessageName } from "@/lib/display-copy";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import TargetingAdvanced, { type AdvancedTargetingState } from "@/components/targeting-advanced";
import type { CreationMode } from "@/components/campaign-creation-mode-selector";
import RecommendedTemplateSelector from "@/components/recommended-template-selector";
import TemplateVariableEditor from "@/components/template-variable-editor";
import LoadCampaignModal from "@/components/load-campaign-modal";
import type { Template } from "@shared/schema";
import { calculateCampaignCredits } from "@shared/credit-policy";
import { getCreditShortageMessage, getMinimumSendMessage } from "@/lib/credit-copy";
import {
  getTemplateVariableKey,
  getTemplateVariableLabel,
  getTemplateVariableSchema,
} from "@/lib/template-variables";

interface RecommendedTargetingConfig {
  mode: 'ats-general' | 'ats-advanced' | 'maptics';
  targetGender?: 'all' | 'male' | 'female';
  targetAgeStart?: number;
  targetAgeEnd?: number;
  advancedOptions?: {
    sndMosu?: number;
    areas?: string[];
    interests?: string[];
  };
  mapticsOptions?: {
    radius?: number;
    geofences?: Array<{ lat: number; lng: number; radius: number; name?: string }>;
    rcvType?: 1 | 2;
    rtStartHhmm?: string;
    rtEndHhmm?: string;
  };
}

interface RecommendedTemplate {
  id: string;
  name: string;
  category: string;
  purpose: string;
  titleTemplate?: string;
  lmsTitleTemplate?: string;
  contentTemplate: string;
  lmsContentTemplate?: string;
  variableSchema?: {
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'dateRange' | 'tel' | 'url';
    required?: boolean;
    placeholder?: string;
    suffix?: string;
    format?: string;
  }[];
  defaultImageUrl?: string;
  messageType?: string;
  rcsType?: number;
  urlLinks?: { list: string[]; reward?: number };
  buttons?: { list: { type: string; name: string; val1: string; val2?: string }[] };
  sourceTemplateId?: string;
  targetingConfig?: RecommendedTargetingConfig;
}

function getVariableKey(variable: NonNullable<RecommendedTemplate["variableSchema"]>[number]) {
  return getTemplateVariableKey(variable);
}

function isVariableValueMissing(value: any) {
  if (value && typeof value === "object" && ("start" in value || "end" in value)) {
    return !value.start || !value.end;
  }
  return value === undefined || value === null || String(value).trim() === "";
}

function formatVariableValue(value: any) {
  if (value && typeof value === "object" && ("start" in value || "end" in value)) {
    return [value.start, value.end].filter(Boolean).join(" ~ ") || "-";
  }
  return value === undefined || value === null || String(value).trim() === "" ? "-" : String(value);
}

function getVariableLabelForSummary(variable: NonNullable<RecommendedTemplate["variableSchema"]>[number]) {
  return getTemplateVariableLabel(variable);
}

interface BizChatSenderNumber {
  id?: string;           // 발신번호코드 (캠페인 생성 시 sndNum에 사용)
  code?: string;         // 발신번호코드 (별칭)
  num?: string;          // 실제 발신번호
  number?: string;       // 실제 발신번호 (별칭)
  name: string;          // 발신번호 이름
  displayName?: string;  // 표시용 이름
  state?: number;        // 상태 (1: 승인됨)
}

interface CreditSummary {
  enabled: boolean;
  effectiveAvailableCredits: number;
  legacyBalance: number;
}

const campaignSchema = z.object({
  name: z.string().min(1, "관리 이름을 입력해요").max(200, "관리 이름은 200자 이내로 입력해요"),
  templateId: z.string().min(1, "보낼 메시지를 선택해요"),
  sndNum: z.string().min(1, "발신번호를 선택해요"),
  gender: z.enum(["all", "male", "female"]).default("all"),
  ageMin: z.number().min(10).max(100).default(20),
  ageMax: z.number().min(10).max(100).default(60),
  regions: z.array(z.string()).default([]),
  targetCount: z.number().min(1000, "1,000건 이상부터 선택할 수 있어요").default(1000),
  budget: z.number().min(10000, "10,000원 이상부터 입력할 수 있어요"),
  scheduledAt: z.string().optional(),
});

type CampaignFormData = z.infer<typeof campaignSchema>;

// 추천 메시지 경로: 1=메시지 선택, 2=받을 고객, 3=발송 확인
// 셀프 메시지 경로: 1=템플릿 선택, 2=받을 고객, 3=발송 확인
const getSteps = (mode: CreationMode) => {
  if (mode === 'recommended') {
    return [
      { id: 1, title: "메시지 선택", icon: MessageSquare },
      { id: 2, title: "받을 고객", icon: Users },
      { id: 3, title: "발송 확인", icon: CheckCircle2 },
    ];
  }
  // self mode
  return [
    { id: 1, title: "메시지 선택", icon: FileText },
    { id: 2, title: "받을 고객", icon: Users },
    { id: 3, title: "발송 확인", icon: CheckCircle2 },
  ];
};

const regions = [
  "서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종",
  "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"
];

const regionAliases: Record<string, string> = {
  서울특별시: "서울",
  서울시: "서울",
  부산광역시: "부산",
  대구광역시: "대구",
  인천광역시: "인천",
  광주광역시: "광주",
  대전광역시: "대전",
  울산광역시: "울산",
  세종특별자치시: "세종",
  세종시: "세종",
  경기도: "경기",
  강원도: "강원",
  강원특별자치도: "강원",
  충청북도: "충북",
  충청남도: "충남",
  전라북도: "전북",
  전북특별자치도: "전북",
  전라남도: "전남",
  경상북도: "경북",
  경상남도: "경남",
  제주특별자치도: "제주",
  제주도: "제주",
};

function normalizeRegionName(rawName?: string | null) {
  if (!rawName) return null;
  const firstToken = rawName.trim().split(/\s+/)[0];
  return regionAliases[firstToken] || (regions.includes(firstToken) ? firstToken : null);
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

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

  // URL ?from=campaignId 파라미터 처리 (캠페인 목록에서 "이 설정으로 새 캠페인 만들기" 클릭 시)
  const fromCampaignIdParam = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('from')
    : null;
  const initialTemplateIdParam = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('templateId')
    : null;

  const { user } = useAuth();
  const { toast } = useToast();

  // 기본은 검수 완료 메시지를 바로 고르는 흐름이에요. 이전 캠페인 불러오기만 셀프 흐름을 사용해요.
  const [creationMode, setCreationMode] = useState<CreationMode>('recommended');
  const [selectedRecommendedTemplate, setSelectedRecommendedTemplate] = useState<RecommendedTemplate | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, any>>({});
  const [showCopyRequestForm, setShowCopyRequestForm] = useState(false);
  const [copyRequestContent, setCopyRequestContent] = useState("");

  // 스텝: 1=메시지 선택, 2=받을 고객, 3=발송 확인
  const [currentStep, setCurrentStep] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);
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

  const copyRequestMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("POST", "/api/message-copy-requests", { content });
      return response.json();
    },
    onSuccess: () => {
      setCopyRequestContent("");
      setShowCopyRequestForm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/message-copy-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/message-copy-requests"] });
      toast({
        title: "메시지 유형 요청을 받았어요",
        description: "운영팀이 확인한 뒤 SKT 검수가 끝난 메시지로 반영해요.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "메시지 유형 요청을 다시 확인해요",
        description: error.message || "다시 시도해요.",
        variant: "destructive",
      });
    },
  });

  const submitCopyRequest = () => {
    const trimmed = copyRequestContent.trim();
    if (!trimmed) {
      toast({
        title: "필요한 상황을 조금만 적어줘요",
        description: "운영팀이 메시지 유형을 판단할 수 있도록 목적과 상황만 남겨요.",
        variant: "destructive",
      });
      return;
    }
    copyRequestMutation.mutate(trimmed);
  };

  const getMissingRequiredTemplateVariables = useCallback(() => {
    const schema = selectedRecommendedTemplate ? getTemplateVariableSchema(selectedRecommendedTemplate) : [];
    return schema.filter((variable) => variable.required && isVariableValueMissing(variableValues[getVariableKey(variable)]));
  }, [selectedRecommendedTemplate, variableValues]);

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

  // 추천 템플릿 타겟팅 사용 여부 (true = 템플릿 타겟팅 사용, false = 사용자가 직접 수정)
  const [useTemplateTargeting, setUseTemplateTargeting] = useState(true);

  // 이전 캠페인 설정 불러오기 (전체 복제)
  const [loadCampaignModalOpen, setLoadCampaignModalOpen] = useState(false);
  const [loadFromCampaignId, setLoadFromCampaignId] = useState<string | null>(fromCampaignIdParam);

  const { data: loadSourceCampaign } = useQuery<CampaignWithDetails>({
    queryKey: ["/api/campaigns", loadFromCampaignId],
    enabled: !!loadFromCampaignId,
  });

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
    // 발송 가능 시간: 오전 8시 ~ 오후 8시 (KST)
    const startHour = isToday ? Math.max(minTime.getHours(), 8) : 8;
    const startMinute = isToday && minTime.getHours() >= 8 ? minTime.getMinutes() : 0;

    const slotDate = new Date(date);
    slotDate.setHours(startHour, startMinute, 0, 0);

    const endTime = new Date(date);
    endTime.setHours(20, 0, 0, 0); // 오후 8시까지

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

  const { data: templates, isLoading: templatesLoading } = useQuery<Template[]>({
    queryKey: ["/api/templates/approved"],
  });

  const { data: creditSummary } = useQuery<CreditSummary>({
    queryKey: ["/api/credits/summary"],
  });

  const [senderNumbers, setSenderNumbers] = useState<BizChatSenderNumber[]>([]);
  const [senderNumbersLoading, setSenderNumbersLoading] = useState(true);

  // 실제 BizChat 발신번호 코드 매핑 (API 문서 기준)
  // 발신번호코드(id)를 캠페인 생성 시 sndNum으로 사용해야 함
  const FALLBACK_SENDER_NUMBERS: BizChatSenderNumber[] = [
    { id: "001001", num: "16700823", name: "SK텔레콤 제휴 혜택 알림", state: 1 },
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

  const handleRecommendedTemplateSelect = useCallback((template: RecommendedTemplate) => {
    const normalizedTemplate = {
      ...template,
      variableSchema: getTemplateVariableSchema(template),
    };
    setSelectedRecommendedTemplate(normalizedTemplate);
    if (normalizedTemplate.sourceTemplateId) {
      form.setValue("templateId", normalizedTemplate.sourceTemplateId, { shouldValidate: true });
    }
    setVariableValues({});
    // 템플릿 선택 시 템플릿 타겟팅 사용 모드로 리셋
    setUseTemplateTargeting(true);

    // 추천 템플릿에 저장된 타겟팅 설정 자동 적용
    const templateWithConfig = normalizedTemplate as RecommendedTemplate | null;
    if (templateWithConfig?.targetingConfig) {
      const config = templateWithConfig.targetingConfig;
      const newTargeting: Partial<AdvancedTargetingState> = {};

      // 모드에 따라 타겟팅 설정 적용
      if (config.mode === 'maptics') {
        newTargeting.targetingMode = 'maptics';
        if (config.mapticsOptions) {
          newTargeting.mapticsSendType = config.mapticsOptions.rcvType === 2 ? 'batch' : 'realtime';
          newTargeting.rtStartHhmm = config.mapticsOptions.rtStartHhmm || '0900';
          newTargeting.rtEndHhmm = config.mapticsOptions.rtEndHhmm || '2000';
        }
      } else if (config.mode === 'ats-advanced') {
        // 고급 ATS 모드 - ats 모드 + 고급 옵션 활성화
        newTargeting.targetingMode = 'ats';
        // 고급 설정 UI 표시 (별도 상태 변수 사용)
        setShowAdvancedTargeting(true);
        if (config.advancedOptions?.sndMosu) {
          newTargeting.sndMosu = config.advancedOptions.sndMosu;
        }
        // areas와 interests는 locations/profiling으로 변환 필요
        // 현재는 단순 매핑이므로 UI에서 직접 선택하도록 안내
      } else {
        // 일반 ATS 모드 - 고급 설정 숨김
        newTargeting.targetingMode = 'ats';
        setShowAdvancedTargeting(false);
        // 이전 고급 설정 값 초기화
        newTargeting.sndMosu = undefined;
      }

      // 성별/나이 설정
      if (config.targetGender) {
        form.setValue("gender", config.targetGender);
      }
      if (config.targetAgeStart) {
        form.setValue("ageMin", config.targetAgeStart);
      }
      if (config.targetAgeEnd) {
        form.setValue("ageMax", config.targetAgeEnd);
      }

      setAdvancedTargeting(prev => ({ ...prev, ...newTargeting }));
    }
  }, [form, setAdvancedTargeting]);

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
  const selectedTemplate = templates?.find(t => t.id === selectedTemplateId);

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

  // 불러온 캠페인 전체 복제 → 마지막 단계(Step 3)로 이동
  useEffect(() => {
    if (!loadSourceCampaign || !loadFromCampaignId) return;

    const src = loadSourceCampaign;
    const targeting = src.targeting;

    // 메시지 (템플릿) 복제
    if (src.templateId) {
      form.setValue('templateId', src.templateId);
    }

    // 타겟팅 복제
    if (targeting) {
      form.setValue('gender', (targeting.gender as 'all' | 'male' | 'female') || 'all');
      form.setValue('ageMin', targeting.ageMin || 20);
      form.setValue('ageMax', targeting.ageMax || 60);
      form.setValue('regions', targeting.regions || []);

      const rcvType = src.rcvType ?? 0;
      const derivedTargetingMode: 'ats' | 'maptics' = (rcvType === 1 || rcvType === 2) ? 'maptics' : 'ats';
      const derivedMapticsSendType: 'realtime' | 'batch' | undefined =
        rcvType === 1 ? 'realtime' : rcvType === 2 ? 'batch' : undefined;

      const newAdvanced: AdvancedTargetingState = {
        targetingMode: derivedTargetingMode,
        shopping11stCategories: (targeting.shopping11stCategories as any[]) || [],
        webappCategories: (targeting.webappCategories as any[]) || [],
        callCategories: [],
        locations: [],
        profiling: [],
        geofences: [],
        sndMosu: src.sndMosu || undefined,
        sndMosuQuery: src.sndMosuQuery || undefined,
        sndMosuDesc: src.sndMosuDesc || undefined,
        mapticsSendType: derivedMapticsSendType,
        rtStartHhmm: src.rtStartHhmm || undefined,
        rtEndHhmm: src.rtEndHhmm || undefined,
      };
      setAdvancedTargeting(newAdvanced);
      if (
        newAdvanced.shopping11stCategories.length > 0 ||
        newAdvanced.webappCategories.length > 0
      ) {
        setShowAdvancedTargeting(true);
      }
    }

    // 예산·발송번호·목표건수 복제
    if (src.budget) form.setValue('budget', parseFloat(src.budget as string) || 100000);
    if (src.sndNum) form.setValue('sndNum', src.sndNum);
    if (src.targetCount) form.setValue('targetCount', src.targetCount);

    // 캠페인 이름은 복제하되 "(복사본)" 접미사 추가
    form.setValue('name', `${src.name} (복사본)`);

    toast({
      title: '이전 설정을 불러왔어요',
      description: `"${src.name}"의 설정을 불러왔어요. 관리 이름과 발송 조건을 확인해요.`,
    });

    // 셀프 모드로 설정하고 Step 1(캠페인 이름 + 템플릿 선택)로 이동
    setCreationMode('self');
    setCurrentStep(1);
    setLoadFromCampaignId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSourceCampaign]);

  // 메시지 유형별 단가
  const MESSAGE_PRICES = { LMS: 100, MMS: 120, RCS: 130 };
  const messageType = selectedTemplate?.messageType || 'LMS';
  const costPerMessage = MESSAGE_PRICES[messageType as keyof typeof MESSAGE_PRICES] || 100;
  const estimatedCost = watchTargetCount * costPerMessage;
  const legacyBalance = parseFloat(user?.balance as string || "0");
  const availableCredits = creditSummary?.effectiveAvailableCredits ?? legacyBalance;
  const creditModeEnabled = creditSummary?.enabled ?? false;
  const creditEstimate = calculateCampaignCredits(
    { targetCount: watchTargetCount, templateCount: 1 },
    availableCredits,
  );
  const creditRemaining = availableCredits - creditEstimate.neededCredits;
  const isAudienceTooNarrow = watchTargetCount > Math.max(0, estimatedAudience.estimated || 0);
  const cannotSaveByCredits =
    creditModeEnabled &&
    (creditEstimate.isBelowMinimum || creditEstimate.shortageCredits > 0);
  const missingSenderNumber = currentStep === 3 && !form.watch("sndNum");
  const selectedSenderNumber = senderNumbers.find(
    (sender) => (sender.id || sender.code || "") === form.watch("sndNum"),
  );
  const selectedTemplateSummaryName =
    selectedRecommendedTemplate?.name || selectedTemplate?.name || "-";
  const selectedMessageTypeLabel =
    selectedTemplate ? getMessageTypeLabel(selectedTemplate.messageType) : selectedRecommendedTemplate?.messageType || "-";
  const selectedVariableSummary = selectedRecommendedTemplate
    ? getTemplateVariableSchema(selectedRecommendedTemplate)
    ?.map((variable) => ({
      key: getVariableKey(variable),
      label: getVariableLabelForSummary(variable),
      value: formatVariableValue(variableValues[getVariableKey(variable)]),
    }))
    .filter((item) => item.key) || []
    : [];
  const advancedLocationNames = advancedTargeting.locations?.map((location) => location.name).filter(Boolean) || [];
  const advancedLocationRegions = uniqueValues(
    advancedLocationNames
      .map((name) => normalizeRegionName(name))
      .filter((name): name is string => Boolean(name)),
  );
  const effectiveRegions = uniqueValues([...watchRegions, ...advancedLocationRegions]);
  const targetRegionLabel =
    advancedLocationNames.length > 0
      ? advancedLocationNames.join(", ")
      : effectiveRegions.length > 0
        ? effectiveRegions.join(", ")
        : "전국";
  const visitLocationCount = advancedTargeting.geofences?.length || 0;
  const interestOnlyCount =
    (advancedTargeting.shopping11stCategories?.length || 0) +
    (advancedTargeting.webappCategories?.length || 0) +
    (advancedTargeting.callCategories?.length || 0) +
    (advancedTargeting.profiling?.length || 0);
  const targetingSummaryLabel = isMaptics
    ? visitLocationCount > 0
      ? `방문 위치 ${visitLocationCount}개`
      : "방문 위치로 찾기"
    : advancedLocationNames.length > 0
      ? `위치 ${advancedLocationNames.length}개`
      : interestOnlyCount > 0
        ? `관심사 조건 ${interestOnlyCount}개`
      : selectedRecommendedTemplate?.targetingConfig && useTemplateTargeting
        ? "추천 타겟 사용"
        : "기본 조건 사용";
  const currentStepLabel = getSteps(creationMode).find(step => step.id === currentStep)?.title || "메시지 선택";
  const stepperLabels = [
    "메시지 선택",
    "받을 고객",
    "발송 확인",
  ];
  const currentStepIndex = Math.min(Math.max(currentStep - 1, 0), stepperLabels.length - 1);
  const currentStepHeading = [
    "보낼 메시지를 선택해요",
    "받을 고객을 정해요",
    "마지막으로 확인해요",
  ][currentStepIndex];
  const currentStepDescription = [
    "SKT 검수가 끝난 메시지 중 보낼 내용을 골라요.",
    "지역, 연령, 관심사처럼 발송 대상을 좁혀요.",
    "발송 수량, 차감 크레딧, 발송 조건을 한 번 더 확인해요.",
  ][currentStepIndex];
  const nextStepLabel = stepperLabels[currentStepIndex + 1] || "문자 발송";
  const nextActionLabel = currentStep === 1
      ? "받을 고객 정하기"
    : currentStep === 2
        ? "발송 내용 확인하기"
        : isEditMode
          ? "수정 저장하기"
          : "문자 발송하기";
  const missingRequiredTemplateVariables = getMissingRequiredTemplateVariables();
  const isNextStepDisabled =
    isTransitioning ||
    (currentStep === 1 &&
      (!form.watch("name") ||
        !form.watch("templateId") ||
        (creationMode === "self" && !form.watch("sndNum")))) ||
    (currentStep === 2 &&
      creationMode === "recommended" &&
      (!form.watch("sndNum") || missingRequiredTemplateVariables.length > 0));
  const creditStatusLabel = !creditModeEnabled
    ? "잔액 기준"
    : creditEstimate.isBelowMinimum
      ? "최소 1,000건 필요"
      : creditEstimate.shortageCredits > 0
        ? `${formatNumber(creditEstimate.shortageCredits)}C 부족`
        : "발송 가능";

  const saveCampaignMutation = useMutation({
    mutationFn: async (data: CampaignFormData) => {
      const template = templates?.find(t => t.id === data.templateId);
      const resolvedMessageType = template?.messageType || selectedTemplate?.messageType || messageType || 'LMS';

      // 지오펜스(maptics) 캠페인인지 확인
      const hasGeofence = (advancedTargeting.geofences?.length ?? 0) > 0;
      const isMapticsCampaign = advancedTargeting.targetingMode === 'maptics' || hasGeofence;
      const mergedRegions = uniqueValues([
        ...(data.regions || []),
        ...((advancedTargeting.locations || [])
          .map((location) => normalizeRegionName(location.name))
          .filter((name): name is string => Boolean(name))),
      ]);

      const campaignData = {
        name: data.name,
        templateId: data.templateId,
        messageType: resolvedMessageType,
        sndNum: data.sndNum,
        gender: data.gender,
        ageMin: data.ageMin,
        ageMax: data.ageMax,
        regions: mergedRegions,
        targetCount: data.targetCount,
        budget: data.budget,
        scheduledAt: (isMapticsCampaign || useScheduledSend) ? data.scheduledAt || undefined : undefined,
        creationMode,
        recommendedTemplateId: selectedRecommendedTemplate?.id,
        variableValues: creationMode === "recommended" ? variableValues : undefined,
        // 고급 타겟팅 옵션
        ...advancedTargeting,
        // ATS 모수 정보: atsData 우선, 없으면 advancedTargeting에서 가져옴
        sndMosu: atsData.sndMosu || advancedTargeting.sndMosu || null,
        sndMosuQuery: atsData.sndMosuQuery || advancedTargeting.sndMosuQuery || null,
        sndMosuDesc: atsData.sndMosuDesc || advancedTargeting.sndMosuDesc || null,
        // 발송 목표 건수
        sndGoalCnt: data.targetCount,
        // Maptics(지오펜스) 캠페인 필수 필드: 실시간 발송 (rcvType=1)
        // 지오펜스 캠페인은 advancedTargeting에서 설정한 발송 시간대 사용 (기본값: 0900~2000)
        ...(isMapticsCampaign ? {
          mapticsSendType: advancedTargeting.mapticsSendType || 'realtime',
          rtStartHhmm: advancedTargeting.rtStartHhmm || '0900',
          rtEndHhmm: advancedTargeting.rtEndHhmm || '2000',
          sndDayDiv: advancedTargeting.sndDayDiv ?? 0,
        } : {}),
      };

      if (isEditMode && campaignId) {
        const response = await apiRequest("PATCH", `/api/campaigns/${campaignId}`, campaignData);
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/campaigns", campaignData);
        const createdCampaign = await response.json();
        if (!createdCampaign?.id) return createdCampaign;

        const startResponse = await apiRequest("POST", `/api/campaigns/${createdCampaign.id}/start`);
        return startResponse.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      if (isEditMode) {
        queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      }
      toast({
        title: isEditMode ? "문자 발송 내용을 수정했어요" : "문자 발송을 시작했어요",
        description: isEditMode
          ? "수정한 내용을 반영했어요."
          : "검수가 끝난 메시지와 입력 정보를 확인하고 발송을 시작했어요.",
      });
      navigate(isEditMode ? `/campaigns/${campaignId}` : "/campaigns/history");
    },
    onError: (error: Error) => {
      toast({
        title: isEditMode ? "수정 내용을 다시 확인해요" : "문자 발송을 다시 확인해요",
        description: error.message || "처리하는 중 문제가 생겼어요. 다시 시도해요.",
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
      const fieldsToValidate: Array<keyof CampaignFormData> =
        creationMode === "recommended"
          ? ["name", "templateId"]
          : ["name", "templateId", "sndNum"];
      const isValid = await form.trigger(fieldsToValidate);
      if (!isValid) return;
    }
    if (currentStep === 2) {
      if (creationMode === "recommended") {
        const missingVariables = getMissingRequiredTemplateVariables();
        if (missingVariables.length > 0) {
          toast({
            title: "필수 정보를 입력해요",
            description: `${missingVariables.map((variable) => variable.label).join(", ")} 항목이 필요해요.`,
            variant: "destructive",
          });
          return;
        }
      }
      const isValid = await form.trigger(["gender", "ageMin", "ageMax", "targetCount"]);
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
    if (currentStep === 1) {
      navigate("/campaigns");
      return;
    }
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const onSubmit = (data: CampaignFormData) => {
    // Only submit when on the final step (Step 3)
    if (currentStep !== 3) {
      console.log('[Campaign Form] Submit blocked - not on step 3, current step:', currentStep);
      return;
    }
    if (cannotSaveByCredits) {
      toast({
        title: creditEstimate.isBelowMinimum ? "발송 수량이 부족해요" : "크레딧이 부족해요",
        description: creditEstimate.isBelowMinimum
          ? getMinimumSendMessage(creditEstimate)
          : getCreditShortageMessage(creditEstimate),
        variant: "destructive",
      });
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
      <Card className="border-primary/15">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="flex items-start">
            {stepperLabels.map((label, index) => {
              const done = index < currentStepIndex;
              const active = index === currentStepIndex;
              return (
                <div key={label} className="flex flex-1 items-start last:flex-none">
                  <div className="flex min-w-10 flex-col items-center gap-2">
                    <div
                      aria-current={active ? "step" : undefined}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full border text-small font-bold transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : done
                            ? "border-primary/20 bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground"
                      )}
                    >
                      {index + 1}
                    </div>
                    <span
                      className={cn(
                        "hidden max-w-20 text-center text-[11px] font-semibold leading-tight md:block",
                        active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {label}
                    </span>
                  </div>
                  {index < stepperLabels.length - 1 && (
                    <div
                      className={cn(
                        "mx-2 mt-4 h-px flex-1",
                        done ? "bg-primary/40" : "bg-border"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <p className="text-caption font-bold text-primary">
              {currentStepIndex + 1}/{stepperLabels.length} · {currentStepLabel}
            </p>
            <h1 className="mt-2 text-title-lg font-bold">{currentStepHeading}</h1>
            <p className="mt-2 text-body-md text-muted-foreground md:text-body">
              {currentStepDescription}
            </p>
          </div>

          <div className="flex flex-col gap-2 rounded-xl bg-muted/40 px-4 py-3 text-caption text-muted-foreground md:flex-row md:items-center md:justify-between">
            <span>다음: {nextStepLabel}</span>
            <span>
              {creditStatusLabel} · 문자 1건당 최소 1,000건부터 발송 가능
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} onKeyDown={handleKeyDown} className="space-y-6">
          {/* Step 1: 추천 메시지 선택 (추천 모드) */}
          {currentStep === 1 && creationMode === 'recommended' && (
            <div className="motion-enter space-y-6">
              {!isEditMode && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLoadCampaignModalOpen(true)}
                    className="min-h-10 gap-2"
                    data-testid="button-load-previous-campaign"
                  >
                    <FolderOpen className="h-4 w-4" />
                    이전 문자 불러오기
                  </Button>
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>관리 이름</CardTitle>
                  <CardDescription>내가 구분하기 쉬운 이름을 입력해요.</CardDescription>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>관리 이름</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="예: 2024년 연말 프로모션"
                            {...field}
                            data-testid="input-campaign-name-recommended"
                          />
                        </FormControl>
                        <FormDescription>고객에게 보이는 이름은 아니에요.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <RecommendedTemplateSelector
                selectedTemplateId={selectedRecommendedTemplate?.id || null}
                initialTemplateId={initialTemplateIdParam}
                onSelectTemplate={handleRecommendedTemplateSelect}
              />

              <div className="border-t pt-3">
                {!showCopyRequestForm ? (
                  <button
                    type="button"
                    onClick={() => setShowCopyRequestForm(true)}
                    className="text-left text-small text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    data-testid="button-open-copy-request"
                  >
                    찾는 메시지 유형이 없나요? 요청하기
                  </button>
                ) : (
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-small font-semibold">필요한 메시지 유형 요청하기</p>
                        <p className="mt-1 text-small text-muted-foreground">
                          고객이 직접 문구를 작성하지 않고, 운영팀이 SKT 검수 완료 메시지로 반영해요.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowCopyRequestForm(false)}
                        className="h-8 px-2 text-muted-foreground"
                      >
                        닫기
                      </Button>
                    </div>
                    <Textarea
                      value={copyRequestContent}
                      onChange={(event) => setCopyRequestContent(event.target.value)}
                      placeholder="예: 재방문 고객에게 6월 할인 혜택을 안내하는 유형이 필요해요. 필요한 정보: 기간, 혜택, 예약 URL"
                      className="mt-3 min-h-[96px]"
                      data-testid="textarea-copy-request"
                    />
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-tiny text-muted-foreground">
                        검토 중이면 아직 문자 보내기에 사용할 수 없고, 반영되면 보낼 메시지에 보여요.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={submitCopyRequest}
                        disabled={copyRequestMutation.isPending}
                        className="min-h-11 gap-2"
                        data-testid="button-submit-copy-request"
                      >
                        <Send className="h-4 w-4" />
                        {copyRequestMutation.isPending ? "요청 중..." : "요청하기"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: 변수 입력 + 타겟팅 (추천 모드) */}
          {currentStep === 2 && creationMode === 'recommended' && selectedRecommendedTemplate && (
            <div className="motion-enter space-y-6">
              <TemplateVariableEditor
                template={selectedRecommendedTemplate}
                variableValues={variableValues}
                onVariableChange={(key, value) => {
                  setVariableValues(prev => ({ ...prev, [key]: value }));
                }}
                onAllVariablesChange={setVariableValues}
              />

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>타겟팅 설정</CardTitle>
                      <CardDescription>
                        {selectedRecommendedTemplate?.targetingConfig
                          ? "추천 메시지에 설정된 타겟팅을 적용해요"
                          : "광고를 받을 대상을 설정해요"}
                      </CardDescription>
                    </div>
                    {selectedRecommendedTemplate?.targetingConfig && (
                      <div className="flex items-center gap-2">
                        <Label htmlFor="use-template-targeting" className="text-sm">
                          {useTemplateTargeting ? "메시지 설정 사용" : "직접 수정"}
                        </Label>
                        <Switch
                          id="use-template-targeting"
                          checked={!useTemplateTargeting}
                          onCheckedChange={(checked) => setUseTemplateTargeting(!checked)}
                          data-testid="switch-template-targeting"
                        />
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="sndNum"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>발신번호</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-sender-number-recommended">
                              <SelectValue placeholder="발신번호를 선택해요" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {senderNumbers.map((sender) => (
                              <SelectItem
                                key={sender.id || sender.code}
                                value={sender.id || sender.code || ''}
                                data-testid={`select-sender-option-recommended-${sender.id || sender.code}`}
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

                  {/* 템플릿 타겟팅 사용 시 읽기 전용 요약 표시 */}
                  {selectedRecommendedTemplate?.targetingConfig && useTemplateTargeting ? (
                    <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Target className="h-4 w-4 text-primary" />
                        적용된 타겟팅
                      </div>
                      <div className="grid md:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">성별:</span>
                          <Badge variant="secondary">
                            {form.watch("gender") === "all" ? "전체" : form.watch("gender") === "male" ? "남성" : "여성"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">연령대:</span>
                          <Badge variant="secondary">
                            {form.watch("ageMin")}세 ~ {form.watch("ageMax")}세
                          </Badge>
                        </div>
                      </div>
                      {selectedRecommendedTemplate.targetingConfig.mode === 'ats-advanced' && (
                        <div className="pt-2 border-t">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                            <Zap className="h-3 w-3" />
                            관심사 기반 타겟팅이 적용됐어요
                          </div>
                        </div>
                      )}
                      {selectedRecommendedTemplate.targetingConfig.mode === 'maptics' && (
                        <div className="pt-2 border-t">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                            <MapPin className="h-3 w-3" />
                            방문 위치 기반 타겟팅이 적용됐어요
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* 직접 수정 모드 또는 템플릿 타겟팅이 없는 경우 */
                    <div className="grid md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="gender"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>성별</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-gender-recommended">
                                  <SelectValue placeholder="성별 선택" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="all">전체</SelectItem>
                                <SelectItem value="male">남성</SelectItem>
                                <SelectItem value="female">여성</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="space-y-2">
                        <Label>연령대</Label>
                        <div className="flex items-center gap-2">
                          <FormField
                            control={form.control}
                            name="ageMin"
                            render={({ field }) => (
                              <Input
                                type="number"
                                min={10}
                                max={100}
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 20)}
                                data-testid="input-age-min-recommended"
                              />
                            )}
                          />
                          <span>~</span>
                          <FormField
                            control={form.control}
                            name="ageMax"
                            render={({ field }) => (
                              <Input
                                type="number"
                                min={10}
                                max={100}
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 60)}
                                data-testid="input-age-max-recommended"
                              />
                            )}
                          />
                          <span>세</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="targetCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>발송 목표 건수</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1000}
                            step={100}
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1000)}
                            data-testid="input-target-count-recommended"
                          />
                        </FormControl>
                        <FormDescription>최소 1,000건 이상</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {(!selectedRecommendedTemplate?.targetingConfig || !useTemplateTargeting) && (
                <Collapsible open={showAdvancedTargeting} onOpenChange={setShowAdvancedTargeting}>
                  <Card>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover-elevate" data-testid="button-toggle-recommended-advanced-targeting">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              받을 고객 자세히 정하기
                              <Badge variant="outline" className="font-normal">선택</Badge>
                            </CardTitle>
                            <CardDescription>
                              관심사나 방문 위치를 더 정밀하게 설정할 수 있어요
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
              )}
            </div>
          )}

          {/* Step 1: 기존 템플릿 선택 (셀프 모드) */}
          {currentStep === 1 && creationMode === 'self' && (
            <div className="motion-enter space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>관리 이름</CardTitle>
                  <CardDescription>나중에 찾기 쉬운 이름으로 적어주세요.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>관리 이름</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="예: 6월 신규 고객 쿠폰 안내"
                            {...field}
                            data-testid="input-campaign-name"
                          />
                        </FormControl>
                        <FormDescription>고객에게 보이는 이름은 아니에요.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>어떤 메시지를 보낼까요?</CardTitle>
                  <CardDescription>
                    검수가 끝난 메시지만 보여요. 하나를 선택하면 다음 단계로 갈 수 있어요.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {templatesLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-24 w-full" />
                      ))}
                    </div>
                  ) : templates && templates.length > 0 ? (
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
                              {templates.map((template) => {
                                const Icon = getMessageTypeIcon(template.messageType);
                                return (
                                  <Label
                                    key={template.id}
                                    htmlFor={`template-${template.id}`}
                                    className={cn(
                                      "motion-press flex min-h-[96px] cursor-pointer items-start gap-4 rounded-lg border p-4 hover-elevate",
                                      field.value === template.id
                                        ? "border-primary bg-primary/5 ring-2 ring-primary"
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
                                        <span className="font-medium">{getUserFacingMessageName(template.name)}</span>
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
                      <h3 className="font-semibold mb-2">준비된 메시지를 확인하고 있어요</h3>
                      <p className="text-small text-muted-foreground mb-4">
                        운영팀이 검수를 마친 메시지만 선택할 수 있어요.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>발신번호</CardTitle>
                  <CardDescription>
                    기존 승인 정책 그대로 사용해요. 승인된 번호 중 하나를 골라주세요.
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
                              <SelectTrigger className="min-h-11" data-testid="select-sender-number">
                                <SelectValue placeholder="발신번호를 선택해요" />
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
                                    <SelectItem key={senderCode} value={senderCode} data-testid={`select-sender-option-${senderCode}`}>
                                      {displayName} {displayNumber ? `(${displayNumber})` : ''}
                                    </SelectItem>
                                  );
                                })
                              ) : (
                                <div className="p-2 text-small text-muted-foreground text-center">
                                  승인된 발신번호를 먼저 등록하면 사용할 수 있어요
                                </div>
                              )}
                            </SelectContent>
                          </Select>
                          <FormDescription>고객 문자에 표시되는 발신번호예요.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>

              {selectedTemplate && (
                <Card className="bg-accent/50 border-accent">
                  <CardHeader>
                    <CardTitle className="text-h3">선택한 메시지 미리보기</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* RCS 템플릿인 경우 일반/RCS 두 가지 모두 표시 */}
                    {selectedTemplate.messageType === 'RCS' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* 일반 메시지 (LMS Fallback) */}
                        <div>
                          <div className="text-small font-medium text-muted-foreground mb-2">일반 메시지 (LMS)</div>
                          <div className="bg-background rounded-xl p-4 shadow-sm max-w-[320px] space-y-3">
                            <div className="flex items-center gap-2 text-small text-muted-foreground">
                              <MessageSquare className="h-4 w-4" />
                              <span>LMS (Fallback)</span>
                            </div>

                            {((selectedTemplate as any).lmsImageUrl || selectedTemplate.imageUrl) && (
                              <div className="rounded-lg overflow-hidden bg-muted aspect-video">
                                <img
                                  src={(selectedTemplate as any).lmsImageUrl || selectedTemplate.imageUrl}
                                  alt="LMS 이미지"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}

                            <div className="text-small whitespace-pre-wrap">
                              {(selectedTemplate as any).lmsContent || selectedTemplate.content}
                            </div>

                            <div className="text-tiny text-muted-foreground pt-2 border-t">
                              SK코어타겟 비즈챗
                            </div>
                          </div>
                        </div>

                        {/* RCS 메시지 */}
                        <div>
                          <div className="text-small font-medium text-muted-foreground mb-2">RCS 메시지</div>
                          <div className="bg-background rounded-xl p-4 shadow-sm max-w-[320px] space-y-3">
                            <div className="flex items-center gap-2 text-small text-muted-foreground">
                              {(() => {
                                const Icon = getMessageTypeIcon(selectedTemplate.messageType);
                                return <Icon className="h-4 w-4" />;
                              })()}
                              <span>RCS</span>
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
                                  alt="RCS 이미지"
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
                        </div>
                      </div>
                    ) : (
                      /* 일반 LMS/MMS 템플릿 */
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
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 2: 타겟 설정 (셀프 모드) */}
          {currentStep === 2 && creationMode === 'self' && (
            <div className="motion-enter space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>누구에게 보낼까요?</CardTitle>
                <CardDescription>선택하지 않은 항목은 전체로 계산해요.</CardDescription>
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
                                "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 transition-all",
                                field.value === option.value
                                  ? "border-primary bg-primary/5 font-semibold text-primary ring-2 ring-primary"
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
                        <FormDescription>선택하지 않으면 전국으로 보내요.</FormDescription>
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
                                className={cn(
                                  "flex min-h-11 items-center space-x-2 space-y-0 rounded-lg border px-3 transition-all",
                                  field.value?.includes(region)
                                    ? "border-primary bg-primary/5"
                                    : "border-border bg-card"
                                )}
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
                                <FormLabel className="cursor-pointer text-small font-normal">
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

                <Card className="border-primary/10 bg-primary/5">
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
                          받을 고객 자세히 정하기
                          <Badge variant="outline" className="font-normal">선택</Badge>
                        </CardTitle>
                        <CardDescription>
                          관심사나 방문 위치를 더 정밀하게 설정할 수 있어요
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
                          <strong>최종 발송 가능 인원은 조건 확인 후 정해져요.</strong>
                          조건에 맞는 고객에게 바로 발송해요.
                        </p>
                        <ul className="text-small text-amber-700 mt-2 list-disc list-inside space-y-1">
                          <li>목표 인원은 넉넉하게 설정해요</li>
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
                  <CardTitle>얼마나 보낼까요?</CardTitle>
                  <CardDescription>
                    {isMaptics
                      ? "원하는 발송 수량을 입력해요."
                      : "최소 1,000건부터 발송할 수 있어요."
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="targetCount"
                    render={({ field }) => (
                      <FormItem>
                        <div className="mb-4 flex items-center justify-between">
                          <FormLabel>{isMaptics ? "희망 발송 수량" : "발송 수량"}</FormLabel>
                          <div className="text-2xl font-bold text-primary" data-testid="text-target-count">
                            {formatNumber(field.value)}명
                          </div>
                        </div>
                        <FormControl>
                          {isMaptics ? (
                            /* Maptics: 직접 입력 방식 */
                            <div className="space-y-4">
                              <Input
                                type="number"
                                min={1000}
                                max={100000}
                                step={100}
                                value={field.value}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 1000)}
                                className="min-h-12 text-right text-lg font-bold"
                                data-testid="input-target-count-maptics"
                              />
                              <p className="text-tiny text-muted-foreground">
                                1,000명에서 100,000명 사이로 입력할 수 있어요.
                                실제로 광고를 받는 사람 수는 달라질 수 있어요.
                              </p>
                            </div>
                          ) : (
                            /* ATS: 슬라이더 방식 */
                            <div className="space-y-4">
                              <input
                                type="range"
                                min={1000}
                                max={Math.max(1000, Math.min(estimatedAudience.estimated, 100000))}
                                step={100}
                                value={field.value}
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                                className="h-3 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary"
                                data-testid="slider-target-count"
                              />
                              <div className="flex justify-between text-tiny text-muted-foreground">
                                <span>1,000명</span>
                                <span>{formatNumber(Math.max(1000, Math.min(estimatedAudience.estimated, 100000)))}명</span>
                              </div>
                            </div>
                          )}
                        </FormControl>
	                        <FormMessage />
	                      </FormItem>
	                    )}
	                  />

	                  <div
	                    className={cn(
                      "flex flex-col gap-3 rounded-lg border p-4 text-small sm:flex-row sm:items-center sm:justify-between",
                      creditEstimate.isBelowMinimum || creditEstimate.shortageCredits > 0
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-primary/15 bg-primary/5 text-muted-foreground"
	                    )}
	                  >
                    <div className="flex items-start gap-2">
                      {creditEstimate.isBelowMinimum || creditEstimate.shortageCredits > 0 ? (
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      )}
                      <div>
                        <p className="font-bold text-foreground">
                          {creditModeEnabled
                            ? `예상 차감 ${formatNumber(creditEstimate.neededCredits)}C`
                            : `예상 비용 ${formatCurrency(estimatedCost)}`}
                        </p>
                        <p className="mt-1">
                          {creditEstimate.isBelowMinimum
                            ? getMinimumSendMessage(creditEstimate)
                            : creditEstimate.shortageCredits > 0
                              ? getCreditShortageMessage(creditEstimate)
                              : `${formatNumber(watchTargetCount)}건 발송 조건을 만족했어요.`}
                        </p>
                      </div>
                    </div>
	                    {creditModeEnabled && creditEstimate.shortageCredits > 0 && (
	                      <Link href="/billing" className="shrink-0 font-bold text-primary underline">
	                        충전하기
	                      </Link>
	                    )}
	                  </div>

	                  {!creditModeEnabled && watchBudget > legacyBalance && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
                      <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">잔액이 부족해요</p>
                        <p className="text-small">
                          {formatCurrency(watchBudget - legacyBalance)}을 추가로 충전해주세요.{" "}
                          <Link href="/billing" className="underline">
                            충전하러 가기
                          </Link>
                        </p>
                      </div>
                    </div>
	                  )}

	                  {isAudienceTooNarrow && (
	                    <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-700" data-testid="info-targeting-too-narrow">
	                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
	                      <div>
	                        <p className="font-medium">받을 고객이 부족할 수 있어요</p>
	                        <p className="text-small">
	                          지금 조건에서는 약 {formatNumber(estimatedAudience.estimated)}명에게 보낼 수 있어요.
	                          조건을 조금 넓히면 선택한 수량에 더 가깝게 발송할 수 있어요.
	                        </p>
	                      </div>
	                    </div>
	                  )}
	                </CardContent>
	              </Card>

	              {isMaptics && (
	                <Card>
	                  <CardHeader>
	                    <CardTitle className="flex items-center gap-2">
	                      <Clock className="h-5 w-5" />
	                      언제부터 활성화할까요?
	                    </CardTitle>
	                    <CardDescription>
	                      지오펜스 캠페인이 시작되는 날짜를 선택해요.
	                    </CardDescription>
	                  </CardHeader>
	                  <CardContent className="space-y-6">
	                    <div className="space-y-4">
	                      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
	                        <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
	                        <div>
	                          <p className="font-medium">실시간 발송 안내</p>
	                          <p className="text-small">
	                            지오펜스 캠페인은 설정한 기간 동안 타겟 지역에 들어오는 고객에게 <strong>실시간으로</strong> 메시지를 발송해요.
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
	                                const rtStartHhmm = advancedTargeting.rtStartHhmm || '0900';
	                                const startHour = parseInt(rtStartHhmm.slice(0, 2), 10);
	                                const startMinute = parseInt(rtStartHhmm.slice(2, 4), 10);
	                                const scheduledDate = new Date(dateOption.date);
	                                scheduledDate.setHours(startHour, startMinute, 0, 0);
	                                form.setValue("scheduledAt", scheduledDate.toISOString());
	                              }}
	                              className={cn(
	                                "flex min-h-14 flex-col items-center justify-center rounded-lg border p-2 transition-colors",
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
	                            })} {(advancedTargeting.rtStartHhmm || '0900').slice(0, 2)}:{(advancedTargeting.rtStartHhmm || '0900').slice(2)}~{(advancedTargeting.rtEndHhmm || '2000').slice(0, 2)}:{(advancedTargeting.rtEndHhmm || '2000').slice(2)} 활성화
	                          </span>
	                        </div>
	                      )}

	                      <p className="text-tiny text-muted-foreground">
	                        선택한 날짜부터 캠페인을 활성화하고, 예산을 모두 쓰면 자동으로 종료해요.
	                      </p>
	                    </div>
	                  </CardContent>
	                </Card>
	              )}

              <Card className="border-primary/15">
                <CardHeader>
                  <CardTitle>마지막으로 확인해요</CardTitle>
                    <CardDescription>문제가 없으면 바로 발송할 수 있어요.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className={cn(
                    "mb-4 rounded-lg border p-4",
                    cannotSaveByCredits ? "border-amber-200 bg-amber-50 text-amber-800" : "border-success/20 bg-success/5 text-success"
                  )}>
                    <div className="flex items-center gap-2 font-bold">
                      {cannotSaveByCredits ? (
                        <AlertCircle className="h-5 w-5" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5" />
                      )}
                      {cannotSaveByCredits ? "저장 전에 확인이 필요해요" : "저장 준비가 끝났어요"}
                    </div>
                    <p className="mt-1 text-body-md opacity-80">
                      {cannotSaveByCredits
                        ? creditEstimate.isBelowMinimum
                          ? getMinimumSendMessage(creditEstimate)
                          : getCreditShortageMessage(creditEstimate)
                      : "발신번호, 크레딧, 최소 발송 기준을 확인한 뒤 바로 발송해요."}
                    </p>
                  </div>

                  <div className="mb-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border bg-card p-4">
                      <p className="text-caption text-muted-foreground">보낼 메시지</p>
                      <p className="mt-1 text-body-lg font-bold" data-testid="summary-message-name">{selectedTemplateSummaryName}</p>
                      <p className="mt-1 text-caption text-muted-foreground">{selectedMessageTypeLabel}</p>
                    </div>
                    <div className="rounded-lg border bg-card p-4">
                      <p className="text-caption text-muted-foreground">받을 고객</p>
                      <p className="mt-1 text-body-lg font-bold" data-testid="summary-targeting-mode">{targetingSummaryLabel}</p>
                      <p className="mt-1 text-caption text-muted-foreground">
                        {watchGender === "all" ? "전체" : watchGender === "male" ? "남성" : "여성"} · {watchAgeMin}~{watchAgeMax}세
                      </p>
                    </div>
                    <div className="rounded-lg border bg-card p-4">
                      <p className="text-caption text-muted-foreground">차감 예정</p>
                      <p className="mt-1 text-body-lg font-bold text-primary" data-testid="summary-credit-need">
                        {creditModeEnabled ? `${formatNumber(creditEstimate.neededCredits)}C` : formatCurrency(estimatedCost)}
                      </p>
                      <p className="mt-1 text-caption text-muted-foreground">{formatNumber(watchTargetCount)}명 발송 기준</p>
                    </div>
                  </div>

                  <div className="mb-4 rounded-lg border bg-muted/40 px-4 py-3 text-body-md text-muted-foreground">
                    수정이 필요하면 아래의 이전 단계로 돌아가서 받을 고객, 발신번호, 발송 수량을 다시 조정할 수 있어요.
                  </div>

                  <div className="grid gap-px overflow-hidden rounded-lg border bg-border">
                    <div className="flex justify-between gap-4 bg-card px-4 py-3">
                      <span className="text-muted-foreground">관리 이름</span>
                      <span className="text-right font-medium" data-testid="summary-campaign-name">{form.watch("name") || "-"}</span>
                    </div>
                    <div className="flex justify-between gap-4 bg-card px-4 py-3">
                      <span className="text-muted-foreground">메시지</span>
                      <span className="text-right font-medium" data-testid="summary-template">{selectedTemplateSummaryName}</span>
                    </div>
                    <div className="flex justify-between gap-4 bg-card px-4 py-3">
                      <span className="text-muted-foreground">메시지 유형</span>
                      <span className="text-right font-medium">{selectedMessageTypeLabel}</span>
                    </div>
                    <div className="flex justify-between gap-4 bg-card px-4 py-3">
                      <span className="text-muted-foreground">발신번호</span>
                      <span className="text-right font-medium" data-testid="summary-sender-number">
                        {selectedSenderNumber
                          ? `${selectedSenderNumber.name} (${selectedSenderNumber.num || selectedSenderNumber.number || selectedSenderNumber.id || selectedSenderNumber.code})`
                          : "선택 안됨"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 bg-card px-4 py-3">
                      <span className="text-muted-foreground">받을 고객</span>
                      <span className="text-right font-medium">{targetingSummaryLabel}</span>
                    </div>
                    <div className="flex justify-between gap-4 bg-card px-4 py-3">
                      <span className="text-muted-foreground">타겟 성별</span>
                      <span className="text-right font-medium">
                        {watchGender === "all" ? "전체" : watchGender === "male" ? "남성" : "여성"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 bg-card px-4 py-3">
                      <span className="text-muted-foreground">타겟 연령</span>
                      <span className="text-right font-medium">{watchAgeMin}세 ~ {watchAgeMax}세</span>
                    </div>
                    <div className="flex justify-between gap-4 bg-card px-4 py-3">
                      <span className="text-muted-foreground">타겟 지역</span>
                      <span className="max-w-[60%] text-right font-medium" data-testid="summary-target-region">
                        {targetRegionLabel}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 bg-card px-4 py-3">
                      <span className="text-muted-foreground">발송 수량</span>
                      <span className="text-right font-medium">{formatNumber(watchTargetCount)}명</span>
                    </div>
                    <div className="flex justify-between gap-4 bg-card px-4 py-3">
                      <span className="text-muted-foreground">{isMaptics ? "활성 시작일" : "발송 일시"}</span>
                      <span className="text-right font-medium" data-testid="summary-scheduled-time">
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
                            : "바로 발송")}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 bg-card px-4 py-3">
                      <span className="text-muted-foreground">
                        {creditModeEnabled ? "필요 크레딧" : "예상 비용"}
                      </span>
                      <span className="text-right font-bold text-primary">
                        {creditModeEnabled ? `${formatNumber(creditEstimate.neededCredits)}C` : formatCurrency(estimatedCost)}
                      </span>
                    </div>
                    {creditModeEnabled && (
                      <>
                        <div className="flex justify-between gap-4 bg-card px-4 py-3">
                          <span className="text-muted-foreground">보유 크레딧</span>
                          <span className="text-right font-medium">{formatNumber(availableCredits)}C</span>
                        </div>
                        <div className="flex justify-between gap-4 bg-card px-4 py-3">
                          <span className="text-muted-foreground">발송 후 잔여</span>
                          <span
                            className={cn(
                              "text-right font-bold",
                              creditRemaining < 0 ? "text-destructive" : "text-success"
                            )}
                          >
                            {formatNumber(creditRemaining)}C
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {selectedVariableSummary.length > 0 && (
                    <div className="mt-4 rounded-lg border bg-card p-4">
                      <div className="mb-3">
                        <p className="font-bold">입력한 정보</p>
                        <p className="text-small text-muted-foreground">고객이 직접 문구를 바꾸지 않고, 필요한 정보만 채운 내용이에요.</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {selectedVariableSummary.map((item) => (
                          <div key={item.key} className="flex justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-small">
                            <span className="text-muted-foreground">{item.label}</span>
                            <span className="max-w-[60%] text-right font-medium" data-testid={`summary-variable-${item.key}`}>
                              {item.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>
          )}

          {/* Submit button only shown on step 3 */}
          {currentStep === 3 && (
            <div className="space-y-3">
              {(creditModeEnabled && cannotSaveByCredits) || missingSenderNumber ? (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-small text-amber-700">
                  {missingSenderNumber
                    ? "발신번호를 선택하면 바로 발송할 수 있어요."
                    : creditEstimate.isBelowMinimum
                      ? getMinimumSendMessage(creditEstimate)
                      : getCreditShortageMessage(creditEstimate)}
                </div>
              ) : null}
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={prevStep}
                  className="min-h-12 gap-2"
                  data-testid="button-prev-step-final"
                >
                  <ArrowLeft className="h-4 w-4" />
                  이전 단계로 돌아가기
                </Button>
                {isEditMode ? (
                  <Button
                    type="submit"
                    disabled={
                      saveCampaignMutation.isPending ||
                      cannotSaveByCredits ||
                      missingSenderNumber ||
                      (!creditModeEnabled && estimatedCost > legacyBalance)
                    }
                    className="min-h-12 gap-2 text-base"
                    data-testid="button-save-campaign"
                  >
                    {saveCampaignMutation.isPending ? "저장 중..." : "수정 내용 저장하기"}
                    <Save className="h-4 w-4" />
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        disabled={
                          saveCampaignMutation.isPending ||
                          cannotSaveByCredits ||
                          missingSenderNumber ||
                          (!creditModeEnabled && estimatedCost > legacyBalance)
                        }
                        className="min-h-12 gap-2 text-base"
                        data-testid="button-save-campaign"
                      >
                        {saveCampaignMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            발송을 시작하는 중...
                          </>
                        ) : (
                          <>
                            문자 발송하기
                            <Send className="h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>이대로 문자를 발송할까요?</AlertDialogTitle>
                        <AlertDialogDescription>
                          발송을 시작하면 취소하기 어려워요. 메시지, 받을 고객, 차감 크레딧을 마지막으로 확인해 주세요.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="space-y-2 rounded-lg bg-muted/50 p-4 text-small">
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">보낼 메시지</span>
                          <span className="text-right font-semibold">{selectedTemplateSummaryName}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">받을 고객</span>
                          <span className="text-right font-semibold">{formatNumber(watchTargetCount)}명</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground">차감 예정</span>
                          <span className="text-right font-semibold text-primary">
                            {creditModeEnabled ? `${formatNumber(creditEstimate.neededCredits)}C` : formatCurrency(estimatedCost)}
                          </span>
                        </div>
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel>닫기</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={form.handleSubmit(onSubmit)}
                          disabled={saveCampaignMutation.isPending}
                        >
                          {saveCampaignMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              발송을 시작하는 중...
                            </>
                          ) : (
                            "확인하고 발송하기"
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          )}
        </form>
      </Form>

      {/* Navigation buttons - OUTSIDE the form to prevent event bubbling */}
      {currentStep > 0 && currentStep < 3 && (
        <div className="mt-5 flex items-center gap-2 rounded-lg border bg-background/95 p-2 shadow-sm">
          <Button
            type="button"
            variant="outline"
            onClick={prevStep}
            className="min-h-10 shrink-0 gap-2 px-3 sm:px-4"
            data-testid="button-prev-step"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">이전</span>
          </Button>
          <Button
            type="button"
            onClick={(e) => nextStep(e)}
            className="min-h-10 flex-1 gap-2 text-small font-bold"
            disabled={isNextStepDisabled}
            data-testid="button-next-step"
          >
            {isTransitioning ? "이동 중..." : nextActionLabel}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
        </div>

      </div>

      {/* 이전 캠페인 설정 불러오기 모달 */}
      <LoadCampaignModal
        open={loadCampaignModalOpen}
        onClose={() => setLoadCampaignModalOpen(false)}
        onLoad={(campaignId) => {
          setLoadFromCampaignId(campaignId);
        }}
      />
    </div>
  );
}

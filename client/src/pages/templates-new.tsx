import { useState, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { 
  ArrowLeft, 
  MessageSquare, 
  Image as ImageIcon, 
  Smartphone,
  Eye,
  Save,
  Edit,
  CheckCircle,
  Upload,
  X,
  Loader2,
  Info,
  AlertTriangle,
  Link,
  Plus,
  Trash2,
  Phone,
  MapPin,
  ExternalLink,
  Sparkles,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Template, RcsButton, UrlLinkConfig, RcsButtonsConfig } from "@shared/schema";
import { getMessageTypeLabel } from "@/lib/authUtils";

interface TemplateWithSystem extends Template {
  isSystem?: boolean;
}

const rcsButtonSchema = z.object({
  type: z.enum(["0", "1", "2"]), // 0: URL연결, 1: 전화걸기, 2: 지도
  name: z.string().min(1, "버튼 텍스트를 입력해주세요"),
  val1: z.string().min(1, "버튼 값을 입력해주세요"),
  val2: z.string().optional(),
  reward: z.enum(["1"]).optional(),
});

const templateFormSchema = z.object({
  name: z.string().min(1, "템플릿 이름을 입력해주세요").max(200),
  messageType: z.enum(["LMS", "MMS", "RCS"], {
    required_error: "메시지 유형을 선택해주세요",
  }),
  rcsType: z.number().optional(),
  title: z.string().max(30, "제목은 30자 이하로 입력해주세요").optional(),
  content: z.string().min(1, "메시지 내용을 입력해주세요").max(2000),
  imageUrl: z.string().optional().or(z.literal("")),
  imageFileId: z.string().optional().or(z.literal("")),
  urlLinks: z.object({
    list: z.array(z.string()),
    reward: z.number().optional(),
  }).optional(),
  buttons: z.object({
    list: z.array(rcsButtonSchema),
  }).optional(),
});

type TemplateFormValues = z.infer<typeof templateFormSchema>;

const BUTTON_TYPES = [
  { value: "0", label: "URL 연결", icon: ExternalLink, placeholder: "https://example.com" },
  { value: "1", label: "전화 걸기", icon: Phone, placeholder: "02-1234-5678" },
  { value: "2", label: "지도 보여주기", icon: MapPin, placeholder: "위치명 (예: 강남역)" },
];

function navigate(href: string) {
  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}


const RCS_TYPES = [
  { value: 0, label: "스탠다드", maxChars: 1100, imageSpec: "400x240 또는 500x300, 최대 0.3MB", aspectRatio: "5/3", maxButtonTextLen: 17, maxUrlCount: 3 },
  { value: 1, label: "LMS", maxChars: 1100, imageSpec: "이미지 없음", aspectRatio: null, maxButtonTextLen: 17, maxUrlCount: 3 },
  { value: 2, label: "슬라이드", maxChars: 300, imageSpec: "464x336, 슬라이드당 최대 300KB (총 1MB)", aspectRatio: "464/336", maxButtonTextLen: 13, maxUrlCount: 1, note: "슬라이드당 300자, 전체 1300자 이내" },
  { value: 3, label: "이미지 강조 A", maxChars: 1100, imageSpec: "900x1200, 최대 1MB", aspectRatio: "3/4", maxButtonTextLen: 16, maxUrlCount: 3 },
  { value: 4, label: "이미지 강조 B", maxChars: 1100, imageSpec: "900x900, 최대 1MB", aspectRatio: "1/1", maxButtonTextLen: 16, maxUrlCount: 3 },
  { value: 5, label: "상품 소개 (세로)", maxChars: 1100, imageSpec: "900x560, 최대 1MB", aspectRatio: "900/560", maxButtonTextLen: 16, maxUrlCount: 3, note: "옵션 이미지 2~3개 필수 (300x300)" },
];

const MMS_IMAGE_SPEC = {
  format: "JPG",
  maxSize: "300KB (최대 1MB)",
  resolution: "320x240 권장 (최대 2000x2000)",
};

export default function TemplatesNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFileId, setImageFileId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [, viewParams] = useRoute("/templates/:id");
  const [, editParams] = useRoute("/templates/:id/edit");
  const rawTemplateId = viewParams?.id || editParams?.id || null;
  const templateId = rawTemplateId && rawTemplateId !== "new" ? rawTemplateId : null;
  const isEditMode = !!editParams?.id && editParams?.id !== "new";
  const isViewMode = !!viewParams?.id && viewParams?.id !== "new" && !editParams?.id;

  const { data: existingTemplate, isLoading: templateLoading } = useQuery<Template>({
    queryKey: ["/api/templates", templateId],
    enabled: !!templateId && templateId !== "new",
  });

  // 추천 템플릿 조회 (새 메세지 만들기 모드일 때만)
  const { data: allTemplates } = useQuery<TemplateWithSystem[]>({
    queryKey: ["/api/templates"],
    enabled: !templateId,
  });

  const recommendedTemplates = allTemplates?.filter(t => t.isSystem) || [];

  // 추천 템플릿 불러오기 함수
  const loadRecommendedTemplate = (template: TemplateWithSystem) => {
    const templateUrlLinks = template.urlLinks as UrlLinkConfig | null;
    const templateButtons = template.buttons as RcsButtonsConfig | null;
    
    form.reset({
      name: `${template.name} (복사본)`,
      messageType: template.messageType as "LMS" | "MMS" | "RCS",
      rcsType: template.rcsType || 0,
      title: template.title || "",
      content: template.content,
      imageUrl: template.imageUrl || "",
      imageFileId: template.imageFileId || "",
      urlLinks: templateUrlLinks || { list: [], reward: undefined },
      buttons: templateButtons || { list: [] },
    });
    
    if (template.imageUrl) {
      setImagePreview(template.imageUrl);
    }
    if (template.imageFileId) {
      setImageFileId(template.imageFileId);
    }
    if (templateUrlLinks?.list) {
      setUrlLinks(templateUrlLinks.list);
      setUrlRewardIndex(templateUrlLinks.reward);
    }
    if (templateButtons?.list) {
      setButtons(templateButtons.list);
    }
    
    toast({
      title: "추천 템플릿 불러오기 완료",
      description: "템플릿 내용을 수정해서 사용하세요.",
    });
  };

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      messageType: "LMS",
      rcsType: 0,
      title: "",
      content: "",
      imageUrl: "",
      imageFileId: "",
      urlLinks: { list: [], reward: undefined },
      buttons: { list: [] },
    },
  });

  // URL Links 상태 관리
  const [urlLinks, setUrlLinks] = useState<string[]>([]);
  const [urlRewardIndex, setUrlRewardIndex] = useState<number | undefined>(undefined);

  // Buttons 상태 관리
  const [buttons, setButtons] = useState<RcsButton[]>([]);

  useEffect(() => {
    if (existingTemplate) {
      const templateUrlLinks = existingTemplate.urlLinks as UrlLinkConfig | null;
      const templateButtons = existingTemplate.buttons as RcsButtonsConfig | null;
      
      form.reset({
        name: existingTemplate.name,
        messageType: existingTemplate.messageType as "LMS" | "MMS" | "RCS",
        rcsType: existingTemplate.rcsType || 0,
        title: existingTemplate.title || "",
        content: existingTemplate.content,
        imageUrl: existingTemplate.imageUrl || "",
        imageFileId: existingTemplate.imageFileId || "",
        urlLinks: templateUrlLinks || { list: [], reward: undefined },
        buttons: templateButtons || { list: [] },
      });
      if (existingTemplate.imageUrl) {
        setImagePreview(existingTemplate.imageUrl);
      }
      if (existingTemplate.imageFileId) {
        setImageFileId(existingTemplate.imageFileId);
      }
      if (templateUrlLinks?.list) {
        setUrlLinks(templateUrlLinks.list);
        setUrlRewardIndex(templateUrlLinks.reward);
      }
      if (templateButtons?.list) {
        setButtons(templateButtons.list);
      }
      if (isViewMode) {
        setShowPreview(true);
      }
    }
  }, [existingTemplate, form, isViewMode]);

  const watchedValues = form.watch();

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const messageType = watchedValues.messageType;
    const rcsType = watchedValues.rcsType;

    const validTypes = messageType === "MMS" 
      ? ["image/jpeg"] 
      : ["image/jpeg", "image/png"];
    
    if (!validTypes.includes(file.type)) {
      toast({
        title: "지원하지 않는 파일 형식",
        description: messageType === "MMS" ? "MMS는 JPG 파일만 지원해요" : "JPG 또는 PNG 파일만 지원해요",
        variant: "destructive",
      });
      return;
    }

    const getMaxFileSize = () => {
      if (messageType === "MMS") return 300 * 1024;
      if (messageType === "RCS") {
        switch (rcsType) {
          case 0: return 300 * 1024;
          case 2: return 300 * 1024;
          default: return 1024 * 1024;
        }
      }
      return 1024 * 1024;
    };
    
    const maxSize = getMaxFileSize();
    if (file.size > maxSize) {
      const sizeText = maxSize >= 1024 * 1024 
        ? `${maxSize / (1024 * 1024)}MB` 
        : `${Math.round(maxSize / 1024)}KB`;
      toast({
        title: "파일 크기 초과",
        description: `파일 크기가 ${sizeText}를 초과해요. 이미지를 압축해서 다시 시도해주세요.`,
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;
        setImagePreview(base64Data);
        form.setValue("imageUrl", base64Data);

        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          const response = await fetch("/api/bizchat/file", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              fileData: base64Data,
              fileName: file.name,
              fileType: file.type,
              type: 2,
              rcs: messageType === "RCS" ? 1 : 0,
            }),
          });

          const result = await response.json();

          if (result.success && result.fileId) {
            setImageFileId(result.fileId);
            form.setValue("imageFileId", result.fileId);
            toast({
              title: "이미지 업로드 완료",
              description: "BizChat 서버에 이미지가 업로드되었어요",
            });
          } else {
            toast({
              title: "이미지 업로드 실패",
              description: result.error || "다시 시도해주세요",
              variant: "destructive",
            });
          }
        } catch (error) {
          console.error("Image upload error:", error);
          toast({
            title: "이미지 업로드 실패",
            description: "서버 연결에 실패했어요. 나중에 다시 시도해주세요",
            variant: "destructive",
          });
        }

        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setIsUploading(false);
      toast({
        title: "이미지 처리 실패",
        description: "파일을 읽을 수 없어요",
        variant: "destructive",
      });
    }
  };

  const removeImage = () => {
    setImagePreview(null);
    setImageFileId(null);
    form.setValue("imageUrl", "");
    form.setValue("imageFileId", "");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: TemplateFormValues & { urlLinksData?: UrlLinkConfig; buttonsData?: RcsButtonsConfig }) => {
      const cleanedData = {
        ...data,
        imageUrl: data.imageUrl || undefined,
        imageFileId: data.imageFileId || undefined,
        title: data.title || undefined,
        rcsType: data.messageType === "RCS" ? data.rcsType : undefined,
        urlLinks: data.urlLinksData?.list?.length ? data.urlLinksData : undefined,
        buttons: data.buttonsData?.list?.length ? data.buttonsData : undefined,
      };
      return apiRequest("POST", "/api/templates", cleanedData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({
        title: "템플릿 생성 완료",
        description: "새 메세지가 저장되었어요. 이제 캠페인에서 사용할 수 있어요.",
      });
      navigate("/templates");
    },
    onError: (error: any) => {
      toast({
        title: "템플릿 생성 실패",
        description: error.message || "다시 시도해주세요.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: TemplateFormValues & { urlLinksData?: UrlLinkConfig; buttonsData?: RcsButtonsConfig }) => {
      const cleanedData = {
        ...data,
        imageUrl: data.imageUrl || undefined,
        imageFileId: data.imageFileId || undefined,
        title: data.title || undefined,
        rcsType: data.messageType === "RCS" ? data.rcsType : undefined,
        urlLinks: data.urlLinksData?.list?.length ? data.urlLinksData : undefined,
        buttons: data.buttonsData?.list?.length ? data.buttonsData : undefined,
      };
      return apiRequest("PATCH", `/api/templates/${templateId}`, cleanedData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/templates", templateId] });
      toast({
        title: "템플릿 수정 완료",
        description: "템플릿이 수정되었어요.",
      });
      navigate("/templates");
    },
    onError: (error: any) => {
      toast({
        title: "템플릿 수정 실패",
        description: error.message || "다시 시도해주세요.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TemplateFormValues) => {
    const submitData = {
      ...data,
      urlLinksData: urlLinks.length > 0 ? { list: urlLinks, reward: urlRewardIndex } : undefined,
      buttonsData: buttons.length > 0 ? { list: buttons } : undefined,
    };
    
    if (isEditMode && templateId) {
      updateMutation.mutate(submitData);
    } else {
      createMutation.mutate(submitData);
    }
  };

  if (templateLoading) {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-[600px]" />
          <Skeleton className="h-[600px]" />
        </div>
      </div>
    );
  }

  const getMessageTypeIcon = (type: string) => {
    switch (type) {
      case "LMS":
        return <MessageSquare className="h-5 w-5" />;
      case "MMS":
        return <ImageIcon className="h-5 w-5" />;
      case "RCS":
        return <Smartphone className="h-5 w-5" />;
      default:
        return <MessageSquare className="h-5 w-5" />;
    }
  };

  const getMessageTypeLabel = (type: string) => {
    switch (type) {
      case "LMS":
        return "LMS (장문 문자)";
      case "MMS":
        return "MMS (이미지 문자)";
      case "RCS":
        return "RCS (리치 메시지)";
      default:
        return type;
    }
  };

  const getMaxContentLength = (type: string, rcsType?: number) => {
    if (type === "LMS") return 2000;
    if (type === "MMS") return 1000;
    if (type === "RCS") {
      const rcsSpec = RCS_TYPES.find(t => t.value === rcsType);
      return rcsSpec?.maxChars || 1100;
    }
    return 2000;
  };

  const needsImage = (type: string, rcsType?: number) => {
    if (type === "MMS") return true;
    if (type === "RCS" && rcsType !== 1) return true;
    return false;
  };

  const getImageSpec = () => {
    if (watchedValues.messageType === "MMS") {
      return MMS_IMAGE_SPEC;
    }
    if (watchedValues.messageType === "RCS") {
      const rcsSpec = RCS_TYPES.find(t => t.value === watchedValues.rcsType);
      return rcsSpec ? { 
        format: "JPG/PNG", 
        maxSize: rcsSpec.imageSpec.includes("MB") ? rcsSpec.imageSpec.split(",")[1]?.trim() || "1MB" : "1MB",
        resolution: rcsSpec.imageSpec 
      } : null;
    }
    return null;
  };

  const pageTitle = isViewMode 
    ? "메세지 상세" 
    : isEditMode 
    ? "메세지 수정" 
    : "새 메세지 만들기";
  
  const pageDescription = isViewMode
    ? "메세지 상세 정보를 확인하세요"
    : isEditMode
    ? "메세지 정보를 수정하세요"
    : "메시지 템플릿을 작성하고 캠페인에 활용해보세요";

  const canEdit = !!existingTemplate;
  const isPending = createMutation.isPending || updateMutation.isPending;
  const showImageUpload = needsImage(watchedValues.messageType, watchedValues.rcsType);
  const imageSpec = getImageSpec();

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/templates")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-display font-bold">{pageTitle}</h1>
            </div>
            <p className="text-muted-foreground mt-1">
              {pageDescription}
            </p>
          </div>
        </div>
        
        {isViewMode && canEdit && (
          <Button
            onClick={() => navigate(`/templates/${templateId}/edit`)}
            className="gap-2"
            data-testid="button-edit-template"
          >
            <Edit className="h-4 w-4" />
            수정하기
          </Button>
        )}
      </div>

      {/* 추천 템플릿 섹션 - 새 메세지 만들기 모드에서만 표시 */}
      {!templateId && recommendedTemplates.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-h3">추천 템플릿</CardTitle>
            </div>
            <CardDescription>
              자주 사용되는 템플릿을 불러와서 빠르게 시작해보세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {recommendedTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => loadRecommendedTemplate(template)}
                  className="flex flex-col items-start p-4 rounded-lg border border-border hover-elevate text-left transition-all"
                  data-testid={`button-load-recommended-${template.id}`}
                >
                  <div className="flex items-center gap-2 mb-2 w-full">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-small truncate">{template.name}</span>
                    <Badge variant="outline" className="text-tiny shrink-0 ml-auto">
                      {getMessageTypeLabel(template.messageType)}
                    </Badge>
                  </div>
                  <p className="text-tiny text-muted-foreground line-clamp-2">
                    {template.content.substring(0, 80)}...
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-h2">메세지 정보</CardTitle>
            <CardDescription>
              메시지 유형을 선택하고 내용을 입력해주세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>메세지 이름</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="예: 12월 할인 이벤트 안내"
                          data-testid="input-template-name"
                          disabled={isViewMode}
                          {...field}
                        />
                      </FormControl>
                      {!isViewMode && (
                        <FormDescription>
                          나중에 쉽게 찾을 수 있도록 명확한 이름을 지어주세요
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="messageType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>메시지 유형</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(value);
                          if (value !== "RCS") {
                            form.setValue("rcsType", undefined);
                          } else {
                            form.setValue("rcsType", 0);
                          }
                          removeImage();
                        }} 
                        defaultValue={field.value} 
                        disabled={isViewMode}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-message-type" disabled={isViewMode}>
                            <SelectValue placeholder="메시지 유형 선택" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="LMS">
                            <div className="flex items-center gap-2">
                              <MessageSquare className="h-4 w-4" />
                              LMS (장문 문자)
                            </div>
                          </SelectItem>
                          <SelectItem value="MMS">
                            <div className="flex items-center gap-2">
                              <ImageIcon className="h-4 w-4" />
                              MMS (이미지 문자)
                            </div>
                          </SelectItem>
                          <SelectItem value="RCS">
                            <div className="flex items-center gap-2">
                              <Smartphone className="h-4 w-4" />
                              RCS (리치 메시지)
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {!isViewMode && (
                        <FormDescription>
                          {watchedValues.messageType === "LMS" && "텍스트 전용 장문 메시지 (최대 2,000자)"}
                          {watchedValues.messageType === "MMS" && "이미지 + 텍스트 (최대 1,000자)"}
                          {watchedValues.messageType === "RCS" && "풍부한 미디어 메시지 (RCS 미지원 시 LMS/MMS로 대체 발송)"}
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchedValues.messageType === "RCS" && (
                  <FormField
                    control={form.control}
                    name="rcsType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>RCS 메시지 타입</FormLabel>
                        <Select 
                          onValueChange={(value) => {
                            field.onChange(parseInt(value));
                            removeImage();
                          }} 
                          value={field.value?.toString()} 
                          disabled={isViewMode}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-rcs-type" disabled={isViewMode}>
                              <SelectValue placeholder="RCS 타입 선택" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {RCS_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value.toString()}>
                                <div className="flex flex-col">
                                  <span>{type.label}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {type.imageSpec === "이미지 없음" ? "텍스트 전용" : type.imageSpec}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!isViewMode && (() => {
                          const selectedRcsType = RCS_TYPES.find(t => t.value === watchedValues.rcsType);
                          return (
                            <FormDescription>
                              {selectedRcsType && (
                                <span className="block space-y-1">
                                  <span>최대 {selectedRcsType.maxChars}자, 버튼 텍스트 {selectedRcsType.maxButtonTextLen}자, URL {selectedRcsType.maxUrlCount}개</span>
                                  {selectedRcsType.note && (
                                    <span className="block text-amber-600 dark:text-amber-400">{selectedRcsType.note}</span>
                                  )}
                                </span>
                              )}
                            </FormDescription>
                          );
                        })()}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>제목 (선택)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="예: 특별 할인 안내"
                          maxLength={30}
                          data-testid="input-template-title"
                          disabled={isViewMode}
                          {...field}
                        />
                      </FormControl>
                      {!isViewMode && (
                        <FormDescription>
                          최대 30자까지 입력 가능해요
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>메시지 내용</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="메시지 내용을 입력하세요..."
                          className="min-h-[200px] resize-none"
                          maxLength={getMaxContentLength(watchedValues.messageType, watchedValues.rcsType)}
                          data-testid="input-template-content"
                          disabled={isViewMode}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {field.value.length} / {getMaxContentLength(watchedValues.messageType, watchedValues.rcsType)}자
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {showImageUpload && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <FormLabel>이미지 {watchedValues.messageType === "MMS" && "(필수)"}</FormLabel>
                      {imageFileId && (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          업로드 완료
                        </Badge>
                      )}
                    </div>
                    
                    {imageSpec && (
                      <Alert className="bg-muted/50">
                        <Info className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          <strong>이미지 규격:</strong> {imageSpec.resolution}
                          {imageSpec.format && ` (${imageSpec.format})`}
                          {watchedValues.messageType === "RCS" && (
                            <span className="block mt-1 text-muted-foreground">
                              RCS 이미지는 BizChat 서버에 업로드 후 사용됩니다. 외부 URL은 지원되지 않아요.
                            </span>
                          )}
                        </AlertDescription>
                      </Alert>
                    )}

                    {!isViewMode && (
                      <div className="relative">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept={watchedValues.messageType === "MMS" ? "image/jpeg" : "image/jpeg,image/png"}
                          onChange={handleImageUpload}
                          className="hidden"
                          data-testid="input-image-file"
                        />
                        
                        {!imagePreview ? (
                          <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                          >
                            {isUploading ? (
                              <div className="flex flex-col items-center gap-2">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">업로드 중...</p>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-2">
                                <Upload className="h-8 w-8 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">
                                  클릭하여 이미지를 업로드하세요
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {watchedValues.messageType === "MMS" ? "JPG 파일만 가능" : "JPG, PNG 파일 가능"}
                                </p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="relative rounded-lg overflow-hidden border">
                            <img
                              src={imagePreview}
                              alt="미리보기"
                              className="w-full h-48 object-cover"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-2 right-2"
                              onClick={removeImage}
                              data-testid="button-remove-image"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            {isUploading && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-white" />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {isViewMode && imagePreview && (
                      <div className="rounded-lg overflow-hidden border">
                        <img
                          src={imagePreview}
                          alt="첨부 이미지"
                          className="w-full h-48 object-cover"
                        />
                      </div>
                    )}

                    {watchedValues.messageType === "MMS" && !imagePreview && !isViewMode && (
                      <Alert variant="destructive" className="bg-destructive/10">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          MMS 메시지는 이미지가 필수입니다
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {/* URL 링크 관리 (MMS/RCS) */}
                {(watchedValues.messageType === "MMS" || watchedValues.messageType === "RCS") && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <FormLabel className="flex items-center gap-2">
                        <Link className="h-4 w-4" />
                        URL 링크 (선택)
                      </FormLabel>
                      {urlLinks.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {urlLinks.length}개 설정됨
                        </Badge>
                      )}
                    </div>
                    
                    <Alert className="bg-muted/50">
                      <Info className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        메시지 본문에 <code className="bg-muted px-1 rounded">[URL분석1]</code>, <code className="bg-muted px-1 rounded">[URL분석2]</code> 등의 변수를 삽입하면 실제 발송 시 추적 가능한 단축 URL로 변환됩니다.
                        {watchedValues.messageType === "RCS" && (() => {
                          const rcsSpec = RCS_TYPES.find(t => t.value === watchedValues.rcsType);
                          return rcsSpec ? ` (최대 ${rcsSpec.maxUrlCount}개)` : "";
                        })()}
                      </AlertDescription>
                    </Alert>

                    {!isViewMode && (
                      <div className="space-y-2">
                        {urlLinks.map((url, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Badge variant="secondary" className="shrink-0">
                              URL{index + 1}
                            </Badge>
                            <Input
                              placeholder="https://example.com/page"
                              value={url}
                              onChange={(e) => {
                                const newLinks = [...urlLinks];
                                newLinks[index] = e.target.value;
                                setUrlLinks(newLinks);
                              }}
                              className="flex-1"
                              data-testid={`input-url-${index}`}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const newLinks = urlLinks.filter((_, i) => i !== index);
                                setUrlLinks(newLinks);
                                if (urlRewardIndex === index) {
                                  setUrlRewardIndex(undefined);
                                } else if (urlRewardIndex !== undefined && urlRewardIndex > index) {
                                  setUrlRewardIndex(urlRewardIndex - 1);
                                }
                              }}
                              data-testid={`button-remove-url-${index}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                        
                        {(() => {
                          const rcsSpec = RCS_TYPES.find(t => t.value === watchedValues.rcsType);
                          const maxUrls = watchedValues.messageType === "RCS" && rcsSpec ? rcsSpec.maxUrlCount : 3;
                          return urlLinks.length < maxUrls && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full gap-2"
                              onClick={() => setUrlLinks([...urlLinks, ""])}
                              data-testid="button-add-url"
                            >
                              <Plus className="h-4 w-4" />
                              URL 추가
                            </Button>
                          );
                        })()}
                      </div>
                    )}

                    {isViewMode && urlLinks.length > 0 && (
                      <div className="space-y-2">
                        {urlLinks.map((url, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                            <Badge variant="secondary" className="shrink-0">URL{index + 1}</Badge>
                            <span className="text-sm text-muted-foreground truncate">{url || "(비어있음)"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* RCS 버튼 관리 */}
                {watchedValues.messageType === "RCS" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <FormLabel className="flex items-center gap-2">
                        <ExternalLink className="h-4 w-4" />
                        RCS 버튼 (선택)
                      </FormLabel>
                      {buttons.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {buttons.length}개 설정됨
                        </Badge>
                      )}
                    </div>
                    
                    <Alert className="bg-muted/50">
                      <Info className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        RCS 메시지 하단에 표시되는 클릭 버튼입니다. URL 연결, 전화 걸기, 지도 보기 중 선택할 수 있어요.
                        {(() => {
                          const rcsSpec = RCS_TYPES.find(t => t.value === watchedValues.rcsType);
                          return rcsSpec ? ` (버튼 텍스트 최대 ${rcsSpec.maxButtonTextLen}자, 최대 2개)` : "";
                        })()}
                      </AlertDescription>
                    </Alert>

                    {!isViewMode && (
                      <div className="space-y-3">
                        {buttons.map((button, index) => {
                          const buttonType = BUTTON_TYPES.find(t => t.value === button.type);
                          const ButtonIcon = buttonType?.icon || ExternalLink;
                          const rcsSpec = RCS_TYPES.find(t => t.value === watchedValues.rcsType);
                          const maxTextLen = rcsSpec?.maxButtonTextLen || 17;
                          
                          return (
                            <div key={index} className="p-3 border rounded-lg space-y-2 bg-muted/30">
                              <div className="flex items-center justify-between">
                                <Badge variant="secondary" className="gap-1">
                                  <ButtonIcon className="h-3 w-3" />
                                  버튼 {index + 1}
                                </Badge>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => setButtons(buttons.filter((_, i) => i !== index))}
                                  data-testid={`button-remove-btn-${index}`}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-2">
                                <Select
                                  value={button.type}
                                  onValueChange={(value: "0" | "1" | "2") => {
                                    const newButtons = [...buttons];
                                    newButtons[index] = { ...button, type: value, val1: "", val2: "" };
                                    setButtons(newButtons);
                                  }}
                                >
                                  <SelectTrigger data-testid={`select-btn-type-${index}`}>
                                    <SelectValue placeholder="버튼 타입" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {BUTTON_TYPES.map((type) => {
                                      const Icon = type.icon;
                                      return (
                                        <SelectItem key={type.value} value={type.value}>
                                          <div className="flex items-center gap-2">
                                            <Icon className="h-4 w-4" />
                                            {type.label}
                                          </div>
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                                
                                <Input
                                  placeholder="버튼 텍스트"
                                  value={button.name}
                                  maxLength={maxTextLen}
                                  onChange={(e) => {
                                    const newButtons = [...buttons];
                                    newButtons[index] = { ...button, name: e.target.value };
                                    setButtons(newButtons);
                                  }}
                                  data-testid={`input-btn-name-${index}`}
                                />
                              </div>
                              
                              <Input
                                placeholder={buttonType?.placeholder || "값 입력"}
                                value={button.val1}
                                onChange={(e) => {
                                  const newButtons = [...buttons];
                                  newButtons[index] = { ...button, val1: e.target.value };
                                  setButtons(newButtons);
                                }}
                                data-testid={`input-btn-val1-${index}`}
                              />
                              
                              {button.type === "2" && (
                                <Input
                                  placeholder="대체 URL (지도 미지원 시)"
                                  value={button.val2 || ""}
                                  onChange={(e) => {
                                    const newButtons = [...buttons];
                                    newButtons[index] = { ...button, val2: e.target.value };
                                    setButtons(newButtons);
                                  }}
                                  data-testid={`input-btn-val2-${index}`}
                                />
                              )}
                            </div>
                          );
                        })}
                        
                        {buttons.length < 2 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full gap-2"
                            onClick={() => setButtons([...buttons, { type: "0", name: "", val1: "" }])}
                            data-testid="button-add-btn"
                          >
                            <Plus className="h-4 w-4" />
                            버튼 추가
                          </Button>
                        )}
                      </div>
                    )}

                    {isViewMode && buttons.length > 0 && (
                      <div className="space-y-2">
                        {buttons.map((button, index) => {
                          const buttonType = BUTTON_TYPES.find(t => t.value === button.type);
                          const ButtonIcon = buttonType?.icon || ExternalLink;
                          return (
                            <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                              <Badge variant="secondary" className="gap-1 shrink-0">
                                <ButtonIcon className="h-3 w-3" />
                                {buttonType?.label}
                              </Badge>
                              <span className="text-sm font-medium">{button.name}</span>
                              <span className="text-xs text-muted-foreground truncate">→ {button.val1}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {!isViewMode && (
                  <div className="flex gap-3 pt-4">
                    <Button
                      type="submit"
                      disabled={isPending || isUploading}
                      className="gap-2 flex-1"
                      data-testid="button-save-template"
                    >
                      <Save className="h-4 w-4" />
                      {isPending ? "저장 중..." : isEditMode ? "템플릿 수정" : "템플릿 저장"}
                    </Button>
                  </div>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-h2">미리보기</CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setShowPreview(!showPreview)}
                data-testid="button-toggle-preview"
              >
                <Eye className="h-4 w-4" />
                {showPreview ? "숨기기" : "미리보기"}
              </Button>
            </div>
            <CardDescription>
              수신자에게 전송될 메시지 형태를 확인해보세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showPreview && (
              <div className="bg-muted rounded-2xl p-4 max-w-[320px] mx-auto">
                <div className="bg-background rounded-xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-small text-muted-foreground">
                    {getMessageTypeIcon(watchedValues.messageType)}
                    <span>{getMessageTypeLabel(watchedValues.messageType)}</span>
                    {watchedValues.messageType === "RCS" && (
                      <Badge variant="secondary" className="text-xs">
                        {RCS_TYPES.find(t => t.value === watchedValues.rcsType)?.label || "스탠다드"}
                      </Badge>
                    )}
                  </div>
                  
                  {watchedValues.title && (
                    <div className="font-semibold text-body">
                      {watchedValues.title}
                    </div>
                  )}
                  
                  {imagePreview && (
                    <div 
                      className="rounded-lg overflow-hidden bg-muted flex items-center justify-center"
                      style={{
                        aspectRatio: watchedValues.messageType === "RCS" 
                          ? (RCS_TYPES.find(t => t.value === watchedValues.rcsType)?.aspectRatio || "16/9")
                          : "4/3"
                      }}
                    >
                      <img 
                        src={imagePreview} 
                        alt="미리보기" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  
                  <div className="text-small whitespace-pre-wrap">
                    {watchedValues.content || "메시지 내용이 여기에 표시됩니다..."}
                  </div>
                  
                  {/* RCS 버튼 미리보기 */}
                  {watchedValues.messageType === "RCS" && buttons.length > 0 && (
                    <div className="space-y-2 pt-2">
                      {buttons.map((button, index) => {
                        const buttonType = BUTTON_TYPES.find(t => t.value === button.type);
                        const ButtonIcon = buttonType?.icon || ExternalLink;
                        return (
                          <button
                            key={index}
                            type="button"
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-primary/30 bg-primary/5 text-primary text-sm font-medium hover:bg-primary/10 transition-colors"
                            data-testid={`button-preview-${index}`}
                          >
                            <ButtonIcon className="h-4 w-4" />
                            {button.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  
                  <div className="text-tiny text-muted-foreground pt-2 border-t">
                    SK코어타겟 비즈챗
                  </div>
                </div>
              </div>
            )}
            
            {!showPreview && (
              <div className="text-center py-12 text-muted-foreground">
                <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>미리보기 버튼을 눌러 확인해보세요</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

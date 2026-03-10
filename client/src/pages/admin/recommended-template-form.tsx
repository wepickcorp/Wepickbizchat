import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useLocation, useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, ExternalLink, Phone, MapPin, Loader2 } from "lucide-react";
import { VariableSchemaEditor, type VariableSchemaItem } from "@/components/admin/variable-schema-editor";
import TargetingAdvanced, { type AdvancedTargetingState } from "@/components/targeting-advanced";
import { type RecommendedTargetingConfig } from "@shared/schema";

interface RecommendedTemplate {
  id: string;
  name: string;
  category: string;
  purpose: string;
  version?: string;
  titleTemplate?: string;
  lmsTitleTemplate?: string;
  contentTemplate: string;
  variableSchema?: VariableSchemaItem[];
  defaultImageUrl?: string;
  messageType?: string;
  rcsType?: number;
  urlLinks?: { list: string[]; reward?: number };
  buttons?: { list: RcsButton[] };
  isActive?: boolean;
  sortOrder?: number;
  targetingConfig?: RecommendedTargetingConfig;
}

interface FilterOption {
  value: string;
  label: string;
}

const RCS_TYPE_LABELS: Record<number, string> = {
  0: '스탠다드',
  1: 'LMS',
  2: '슬라이드',
  3: '이미지강조A',
  4: '이미지강조B',
  5: '상품소개세로',
};

const BUTTON_TYPES = [
  { value: "0", label: "URL 연결", icon: ExternalLink, placeholder: "https://example.com" },
  { value: "1", label: "전화 걸기", icon: Phone, placeholder: "02-1234-5678" },
  { value: "2", label: "지도 보여주기", icon: MapPin, placeholder: "위치명 (예: 강남역)" },
];

interface RcsButton {
  type: "0" | "1" | "2";
  name: string;
  val1: string;
  val2?: string;
  reward?: "1";
}

export default function AdminRecommendedTemplateForm() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const templateId = params?.id;
  const isEditMode = !!templateId;
  const adminToken = localStorage.getItem("adminToken");

  const [formData, setFormData] = useState<Partial<RecommendedTemplate>>({
    name: '',
    category: '',
    purpose: '',
    titleTemplate: '',
    lmsTitleTemplate: '',
    contentTemplate: '',
    variableSchema: [],
    messageType: 'RCS',
    rcsType: 4,
    isActive: true,
    sortOrder: 0,
  });
  const [variableSchema, setVariableSchema] = useState<VariableSchemaItem[]>([]);
  const [buttons, setButtons] = useState<RcsButton[]>([]);
  const [targetingEnabled, setTargetingEnabled] = useState(false);
  const [advancedTargeting, setAdvancedTargeting] = useState<AdvancedTargetingState>({
    targetingMode: 'ats',
    shopping11stCategories: [],
    webappCategories: [],
    callCategories: [],
    locations: [],
    profiling: [],
    geofences: [],
  });
  const [basicTargeting, setBasicTargeting] = useState({
    gender: 'all' as 'all' | 'male' | 'female',
    ageMin: 20,
    ageMax: 60,
    regions: [] as string[],
  });

  const { data: filtersData } = useQuery<{ categories: FilterOption[]; purposes: FilterOption[] }>({
    queryKey: ["/api/recommended-templates/filters"],
    queryFn: async () => {
      const res = await fetch("/api/recommended-templates?active=false");
      if (!res.ok) throw new Error("Failed");
      const d = await res.json();
      return { categories: d.categories || [], purposes: d.purposes || [] };
    },
  });

  const categories = filtersData?.categories || [];
  const purposes = filtersData?.purposes || [];

  const { data: existingTemplate, isLoading: loadingTemplate } = useQuery<RecommendedTemplate>({
    queryKey: ["/api/recommended-templates", templateId],
    queryFn: async () => {
      const res = await fetch(`/api/recommended-templates/${templateId}`);
      if (!res.ok) throw new Error("Failed to fetch template");
      const d = await res.json();
      return d.template || d;
    },
    enabled: isEditMode,
  });

  useEffect(() => {
    if (!existingTemplate) return;
    const t = existingTemplate;

    setFormData({
      name: t.name,
      category: t.category,
      purpose: t.purpose,
      titleTemplate: t.titleTemplate || '',
      lmsTitleTemplate: t.lmsTitleTemplate || '',
      contentTemplate: t.contentTemplate,
      defaultImageUrl: t.defaultImageUrl || '',
      messageType: t.messageType || 'RCS',
      rcsType: t.rcsType ?? 4,
      isActive: t.isActive ?? true,
      sortOrder: t.sortOrder ?? 0,
    });
    setVariableSchema(t.variableSchema || []);

    if (t.buttons?.list) {
      setButtons(t.buttons.list.map(btn => ({
        type: btn.type as "0" | "1" | "2",
        name: btn.name,
        val1: btn.val1,
        val2: btn.val2,
        reward: (btn as { reward?: "1" }).reward,
      })));
    } else {
      setButtons([]);
    }

    if (t.targetingConfig) {
      setTargetingEnabled(true);
      const cfg = t.targetingConfig;
      setBasicTargeting({
        gender: cfg.targetGender || 'all',
        ageMin: cfg.targetAgeStart || 20,
        ageMax: cfg.targetAgeEnd || 60,
        regions: [],
      });
      const advOpts = cfg.advancedOptions;
      const mapOpts = cfg.mapticsOptions;
      setAdvancedTargeting({
        targetingMode: cfg.mode === 'maptics' ? 'maptics' : 'ats',
        sndMosu: typeof advOpts?.sndMosu === 'number' ? advOpts.sndMosu : 0,
        mapticsSendType: mapOpts?.rcvType === 2 ? 'batch' : 'realtime',
        rtStartHhmm: mapOpts?.rtStartHhmm || '0900',
        rtEndHhmm: mapOpts?.rtEndHhmm || '1800',
        shopping11stCategories: advOpts?.shopping11stCategories || [],
        webappCategories: advOpts?.webappCategories || [],
        callCategories: advOpts?.callCategories || [],
        locations: [],
        profiling: [],
        geofences: mapOpts?.geofences || [],
      });
    } else {
      setTargetingEnabled(false);
    }
  }, [existingTemplate]);

  const buildTargetingConfig = (): RecommendedTargetingConfig | undefined => {
    if (!targetingEnabled) return undefined;

    const hasAdvancedAts =
      (advancedTargeting.sndMosu && advancedTargeting.sndMosu > 0) ||
      advancedTargeting.shopping11stCategories.length > 0 ||
      advancedTargeting.webappCategories.length > 0 ||
      advancedTargeting.callCategories.length > 0 ||
      advancedTargeting.locations.length > 0 ||
      advancedTargeting.profiling.length > 0;

    const mode = advancedTargeting.targetingMode === 'maptics' ? 'maptics' :
      hasAdvancedAts ? 'ats-advanced' : 'ats-general';

    const config: RecommendedTargetingConfig = {
      mode,
      targetGender: basicTargeting.gender,
      targetAgeStart: basicTargeting.ageMin,
      targetAgeEnd: basicTargeting.ageMax,
    };

    if (mode === 'ats-advanced') {
      config.advancedOptions = {
        sndMosu: typeof advancedTargeting.sndMosu === 'number' ? advancedTargeting.sndMosu : 0,
        areas: advancedTargeting.locations.map(l => l.code),
        interests: advancedTargeting.profiling.map(p => p.code),
        shopping11stCategories: advancedTargeting.shopping11stCategories,
        webappCategories: advancedTargeting.webappCategories,
        callCategories: advancedTargeting.callCategories,
      };
    }

    if (mode === 'maptics') {
      config.mapticsOptions = {
        rcvType: advancedTargeting.mapticsSendType === 'batch' ? 2 : 1,
        rtStartHhmm: advancedTargeting.rtStartHhmm,
        rtEndHhmm: advancedTargeting.rtEndHhmm,
        geofences: advancedTargeting.geofences,
      };
    }

    return config;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formData.name?.trim()) throw new Error("템플릿 이름을 입력해주세요");
      if (!formData.category) throw new Error("업종을 선택해주세요");
      if (!formData.purpose) throw new Error("목적을 선택해주세요");
      if (!formData.contentTemplate?.trim()) throw new Error("본문 템플릿을 입력해주세요");

      const submitData = {
        ...formData,
        variableSchema,
        buttons: buttons.length > 0 ? { list: buttons } : undefined,
        targetingConfig: buildTargetingConfig(),
      };

      const url = isEditMode
        ? `/api/recommended-templates/${templateId}`
        : "/api/recommended-templates";
      const method = isEditMode ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify(submitData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "저장 실패");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: isEditMode ? "템플릿이 수정되었습니다" : "템플릿이 생성되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["/api/recommended-templates"] });
      navigate("/admin/recommended-templates");
    },
    onError: (error: Error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  if (isEditMode && loadingTemplate) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/admin/recommended-templates")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">
              {isEditMode ? "추천 템플릿 수정" : "새 추천 템플릿"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {isEditMode ? "기존 템플릿을 수정합니다" : "업종별/목적별 추천 메시지 템플릿을 생성합니다"}
            </p>
          </div>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-template"
        >
          {saveMutation.isPending ? "저장 중..." : isEditMode ? "저장" : "생성"}
        </Button>
      </div>

      {/* 섹션 1: 기본 정보 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">템플릿 이름 *</Label>
              <Input
                id="name"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="예: 커머스 회원가입 유도"
                data-testid="input-template-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sortOrder">정렬 순서</Label>
              <Input
                id="sortOrder"
                type="number"
                value={formData.sortOrder || 0}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                data-testid="input-sort-order"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>업종 *</Label>
              <Select
                value={formData.category || ''}
                onValueChange={(v) => setFormData({ ...formData, category: v })}
              >
                <SelectTrigger data-testid="select-category">
                  <SelectValue placeholder="업종 선택" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>목적 *</Label>
              <Select
                value={formData.purpose || ''}
                onValueChange={(v) => setFormData({ ...formData, purpose: v })}
              >
                <SelectTrigger data-testid="select-purpose">
                  <SelectValue placeholder="목적 선택" />
                </SelectTrigger>
                <SelectContent>
                  {purposes.map((pur) => (
                    <SelectItem key={pur.value} value={pur.value}>{pur.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>메시지 타입</Label>
              <Select
                value={formData.messageType || 'RCS'}
                onValueChange={(v) => setFormData({ ...formData, messageType: v })}
              >
                <SelectTrigger data-testid="select-message-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RCS">RCS</SelectItem>
                  <SelectItem value="MMS">MMS</SelectItem>
                  <SelectItem value="LMS">LMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>RCS 타입</Label>
              <Select
                value={String(formData.rcsType ?? 4)}
                onValueChange={(v) => setFormData({ ...formData, rcsType: parseInt(v) })}
              >
                <SelectTrigger data-testid="select-rcs-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RCS_TYPE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="isActive"
              checked={formData.isActive ?? true}
              onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              data-testid="switch-is-active"
            />
            <Label htmlFor="isActive">활성화</Label>
          </div>
        </CardContent>
      </Card>

      {/* 섹션 2: 메시지 내용 + RCS 버튼 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">메시지 내용</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.messageType === 'RCS' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="titleTemplate">RCS 제목 템플릿</Label>
                <Input
                  id="titleTemplate"
                  value={formData.titleTemplate || ''}
                  onChange={(e) => setFormData({ ...formData, titleTemplate: e.target.value })}
                  placeholder="예: {업체명} 회원가입 혜택 안내"
                  data-testid="input-title-template"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lmsTitleTemplate">일반(LMS) 제목 템플릿</Label>
                <Input
                  id="lmsTitleTemplate"
                  value={formData.lmsTitleTemplate || ''}
                  onChange={(e) => setFormData({ ...formData, lmsTitleTemplate: e.target.value })}
                  placeholder="예: {업체명} 회원가입 혜택 안내"
                  data-testid="input-lms-title-template"
                />
                <p className="text-xs text-muted-foreground">RCS 미지원 기기에 표시될 LMS 폴백 제목</p>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="titleTemplate">제목 템플릿</Label>
              <Input
                id="titleTemplate"
                value={formData.titleTemplate || ''}
                onChange={(e) => setFormData({ ...formData, titleTemplate: e.target.value })}
                placeholder="예: {업체명} 회원가입 혜택 안내"
                data-testid="input-title-template"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="contentTemplate">본문 템플릿 *</Label>
            <Textarea
              id="contentTemplate"
              value={formData.contentTemplate || ''}
              onChange={(e) => setFormData({ ...formData, contentTemplate: e.target.value })}
              placeholder="예: 지금 {업체명} 신규가입하고 {할인율}% 할인받으세요!"
              rows={8}
              data-testid="input-content-template"
            />
            <p className="text-xs text-muted-foreground">변수는 {`{변수명}`} 형식으로 입력합니다</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultImageUrl">기본 이미지 URL</Label>
            <Input
              id="defaultImageUrl"
              value={formData.defaultImageUrl || ''}
              onChange={(e) => setFormData({ ...formData, defaultImageUrl: e.target.value })}
              placeholder="https://..."
              data-testid="input-default-image"
            />
          </div>

          {formData.messageType === 'RCS' && (
            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  RCS 버튼 (선택)
                </Label>
                {buttons.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {buttons.length}개 설정됨
                  </Badge>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                RCS 메시지 하단에 표시되는 클릭 버튼입니다. URL 연결, 전화 걸기, 지도 보기 중 선택할 수 있어요. (최대 2개)
              </p>

              <div className="space-y-3">
                {buttons.map((button, index) => {
                  const buttonType = BUTTON_TYPES.find(t => t.value === button.type);
                  const ButtonIcon = buttonType?.icon || ExternalLink;

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
                          onClick={() => setButtons(buttons.filter((_, i) => i !== index))}
                          data-testid={`button-remove-rcs-btn-${index}`}
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
                          <SelectTrigger data-testid={`select-rcs-btn-type-${index}`}>
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
                          maxLength={17}
                          onChange={(e) => {
                            const newButtons = [...buttons];
                            newButtons[index] = { ...button, name: e.target.value };
                            setButtons(newButtons);
                          }}
                          data-testid={`input-rcs-btn-name-${index}`}
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
                        data-testid={`input-rcs-btn-val1-${index}`}
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
                          data-testid={`input-rcs-btn-val2-${index}`}
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
                    data-testid="button-add-rcs-btn"
                  >
                    <Plus className="h-4 w-4" />
                    버튼 추가
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 섹션 3: 변수 설정 */}
      <VariableSchemaEditor
        value={variableSchema}
        onChange={setVariableSchema}
        contentTemplate={formData.contentTemplate}
      />

      {/* 섹션 4: 타겟팅 설정 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">타겟팅 설정</CardTitle>
              <CardDescription className="text-sm">
                이 템플릿에 적용할 기본 타겟팅 조건을 설정합니다
              </CardDescription>
            </div>
            <Switch
              checked={targetingEnabled}
              onCheckedChange={setTargetingEnabled}
              data-testid="switch-targeting-enabled"
            />
          </div>
        </CardHeader>

        {targetingEnabled && (
          <CardContent className="pt-0 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">대상 성별</Label>
              <RadioGroup
                value={basicTargeting.gender}
                onValueChange={(v) => setBasicTargeting({ ...basicTargeting, gender: v as 'all' | 'male' | 'female' })}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="tgt-gender-all" />
                  <Label htmlFor="tgt-gender-all" className="font-normal cursor-pointer">전체</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="male" id="tgt-gender-male" />
                  <Label htmlFor="tgt-gender-male" className="font-normal cursor-pointer">남성</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="female" id="tgt-gender-female" />
                  <Label htmlFor="tgt-gender-female" className="font-normal cursor-pointer">여성</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">최소 연령</Label>
                <Input
                  type="number"
                  min={15}
                  max={70}
                  value={basicTargeting.ageMin}
                  onChange={(e) => setBasicTargeting({ ...basicTargeting, ageMin: parseInt(e.target.value) || 20 })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">최대 연령</Label>
                <Input
                  type="number"
                  min={15}
                  max={70}
                  value={basicTargeting.ageMax}
                  onChange={(e) => setBasicTargeting({ ...basicTargeting, ageMax: parseInt(e.target.value) || 60 })}
                />
              </div>
            </div>

            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-4">고급 타겟팅 (BizChat ATS/Maptics)</h4>
              <TargetingAdvanced
                targeting={advancedTargeting}
                onTargetingChange={setAdvancedTargeting}
                basicTargeting={basicTargeting}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* 하단 저장 버튼 */}
      <div className="flex items-center justify-between pb-8">
        <Button
          variant="outline"
          onClick={() => navigate("/admin/recommended-templates")}
          data-testid="button-cancel"
        >
          취소
        </Button>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-template-bottom"
        >
          {saveMutation.isPending ? "저장 중..." : isEditMode ? "저장" : "생성"}
        </Button>
      </div>
    </div>
  );
}

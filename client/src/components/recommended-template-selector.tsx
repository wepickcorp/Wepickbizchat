import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { getUserFacingMessageName } from "@/lib/display-copy";

interface VariableSchemaItem {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'dateRange' | 'tel' | 'url';
  required?: boolean;
  placeholder?: string;
  suffix?: string;
  format?: string;
}

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
  buttons?: { list: { type: string; name: string; val1: string; val2?: string }[] };
  sourceTemplateId?: string;
  isPrivate?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

interface FilterOption {
  value: string;
  label: string;
}

interface RecommendedTemplateSelectorProps {
  selectedTemplateId: string | null;
  initialTemplateId?: string | null;
  onSelectTemplate: (template: RecommendedTemplate) => void;
}

function getVariableLabel(template: RecommendedTemplate, key: string) {
  const schemaLabel = template.variableSchema?.find((variable) => variable.key === key)?.label;
  if (schemaLabel) return schemaLabel;

  const normalized = key.toLowerCase();
  const fallbackLabels: Record<string, string> = {
    brandname: "브랜드명",
    brand: "브랜드명",
    companyname: "회사명",
    company: "회사명",
    eventname: "이벤트명",
    event: "이벤트명",
    benefit: "혜택",
    period: "기간",
    daterange: "기간",
    startdate: "시작일",
    enddate: "종료일",
    url: "URL",
    link: "URL",
    place: "장소",
    location: "장소",
    phone: "연락처",
    tel: "연락처",
  };

  return fallbackLabels[normalized] || key;
}

function formatTemplatePlaceholders(template: RecommendedTemplate, content: string | undefined) {
  if (!content) return "";
  return content
    .replace(/\{\{([^{}]+)\}\}/g, (_, key) => `{${getVariableLabel(template, key)}}`)
    .replace(/(?<!\{)\{([^{}]+)\}(?!\})/g, (_, key) => `{${getVariableLabel(template, key)}}`);
}

const CARDS_PER_PAGE_DESKTOP = 3;
const CARDS_PER_PAGE_MOBILE = 1;

export default function RecommendedTemplateSelector({
  selectedTemplateId,
  initialTemplateId,
  onSelectTemplate,
}: RecommendedTemplateSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>(initialTemplateId ? "all" : "commerce");
  const [selectedPurpose, setSelectedPurpose] = useState<string>("all");
  const [previewTemplate, setPreviewTemplate] = useState<RecommendedTemplate | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [autoSelectedTemplateId, setAutoSelectedTemplateId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{
    templates: RecommendedTemplate[];
    categories: FilterOption[];
    purposes: FilterOption[]
  }>({
    queryKey: ["/api/recommended-templates", selectedCategory, selectedPurpose],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== 'all') params.append('category', selectedCategory);
      if (selectedPurpose !== 'all') params.append('purpose', selectedPurpose);

      const res = await apiRequest("GET", `/api/recommended-templates?${params.toString()}`);
      return res.json();
    },
  });

  const templates = data?.templates || [];
  const categories = data?.categories || [];
  const purposes = data?.purposes || [];

  useEffect(() => {
    if (!initialTemplateId || selectedTemplateId || autoSelectedTemplateId === initialTemplateId) return;

    const matchedTemplate = templates.find(
      (template) => template.sourceTemplateId === initialTemplateId || template.id === initialTemplateId,
    );
    if (!matchedTemplate) return;

    setAutoSelectedTemplateId(initialTemplateId);
    onSelectTemplate(matchedTemplate);
  }, [autoSelectedTemplateId, initialTemplateId, onSelectTemplate, selectedTemplateId, templates]);

  const handleCategoryChange = useCallback((value: string) => {
    setSelectedCategory(value);
    setSelectedPurpose("all");
    setCarouselIndex(0);
  }, []);

  const handlePurposeChange = useCallback((value: string) => {
    setSelectedPurpose(value);
    setCarouselIndex(0);
  }, []);

  const maxIndex = Math.max(0, templates.length - CARDS_PER_PAGE_DESKTOP);
  const maxIndexMobile = Math.max(0, templates.length - CARDS_PER_PAGE_MOBILE);

  const prevSlide = useCallback(() => {
    setCarouselIndex(prev => Math.max(0, prev - 1));
  }, []);

  const nextSlide = useCallback(() => {
    setCarouselIndex(prev => Math.min(maxIndex, prev + 1));
  }, [maxIndex]);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold" data-testid="text-recommended-header">어떤 메시지를 보낼까요?</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" data-testid="button-recommended-info">
                <Info className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>업종과 목적에 맞는 메시지를 고를 수 있어요.</p>
              <p>선택 후 필요한 문구만 채우면 됩니다.</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-small text-muted-foreground">업종과 목적을 고르면 쓸 수 있는 메시지만 보여드려요.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={selectedCategory} onValueChange={handleCategoryChange}>
          <SelectTrigger className="min-h-11 w-full sm:w-[220px]" data-testid="select-category">
            <SelectValue placeholder="업종 선택" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat.value} value={cat.value} data-testid={`select-category-${cat.value}`}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedPurpose} onValueChange={handlePurposeChange}>
          <SelectTrigger className="min-h-11 w-full sm:w-[220px]" data-testid="select-purpose">
            <SelectValue placeholder="목적 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" data-testid="select-purpose-all">전체</SelectItem>
            {purposes.map((pur) => (
              <SelectItem key={pur.value} value={pur.value} data-testid={`select-purpose-${pur.value}`}>
                {pur.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-80 w-full rounded-lg" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground" data-testid="text-no-templates">
            선택한 조건에 맞는 추천 메시지가 없습니다.
            <br />
            다른 업종이나 목적을 선택해보세요.
          </p>
        </Card>
      ) : (
        <div className="relative">
          {carouselIndex > 0 && (
            <button
              type="button"
              onClick={prevSlide}
              className="absolute -left-5 top-1/2 -translate-y-1/2 z-10 flex h-11 w-11 items-center justify-center rounded-full border bg-background shadow-sm text-muted-foreground transition-colors hover:text-foreground"
              data-testid="button-carousel-prev"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          {carouselIndex < maxIndex && (
            <button
              type="button"
              onClick={nextSlide}
              className="absolute -right-5 top-1/2 -translate-y-1/2 z-10 flex h-11 w-11 items-center justify-center rounded-full border bg-background shadow-sm text-muted-foreground transition-colors hover:text-foreground"
              data-testid="button-carousel-next"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          <div className="overflow-hidden rounded-lg">
            <div
              className="flex transition-transform duration-300 ease-in-out"
              style={{
                gap: '1rem',
                transform: `translateX(calc(${-carouselIndex * 100 / 3}% - ${carouselIndex * 16 / 3}px))`,
              }}
            >
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="shrink-0 w-full md:w-[calc(33.333%-0.667rem)]"
                  data-testid={`card-template-${template.id}`}
                >
                  <Card className={cn(
                    "motion-lift motion-press flex h-full flex-col border",
                    selectedTemplateId === template.id && "border-primary bg-primary/5 ring-2 ring-primary"
                  )}>
                    <div className="border-b bg-muted/30 px-4 py-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        {template.isPrivate ? (
                          <Badge variant="secondary">
                            고객 전용
                          </Badge>
                        ) : (
                          <span className="text-tiny font-medium text-muted-foreground">추천 메시지</span>
                        )}
                        <button
                          type="button"
                          className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-small font-semibold text-primary transition-colors hover:bg-primary/10"
                          onClick={() => setPreviewTemplate(template)}
                          data-testid={`button-preview-template-${template.id}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          미리보기
                        </button>
                      </div>
                      <h3 className="line-clamp-1 text-body-lg font-bold" data-testid={`text-template-name-${template.id}`}>
                        {getUserFacingMessageName(template.name)}
                      </h3>
                    </div>

                    <div className="flex-1 p-4">
                      {template.titleTemplate && (
                        <p className="font-bold text-sm mb-2">{formatTemplatePlaceholders(template, template.titleTemplate)}</p>
                      )}
                      <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed" data-testid={`text-template-content-${template.id}`}>
                        {formatTemplatePlaceholders(template, template.contentTemplate)}
                      </p>
                    </div>

                    <div className="border-t p-3">
                      <Button
                        variant={selectedTemplateId === template.id ? "default" : "outline"}
                        size="sm"
                        className="ml-auto flex min-h-9 w-fit gap-1.5 px-3"
                        onClick={() => onSelectTemplate(template)}
                        data-testid={`button-select-template-${template.id}`}
                      >
                        {selectedTemplateId === template.id ? (
                          <>
                            선택됨
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </>
                        ) : (
                          <>
                            선택
                            <ChevronRight className="h-3.5 w-3.5" />
                          </>
                        )}
                      </Button>
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          </div>

          {templates.length > CARDS_PER_PAGE_DESKTOP && (
            <div className="flex justify-center gap-1.5 mt-4">
              {Array.from({ length: Math.ceil(templates.length / CARDS_PER_PAGE_DESKTOP) }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-full"
                  onClick={() => setCarouselIndex(Math.min(i * CARDS_PER_PAGE_DESKTOP, maxIndex))}
                  data-testid={`button-carousel-dot-${i}`}
                >
                  <span
                    className={`h-2 w-2 rounded-full transition-colors ${
                      Math.floor(carouselIndex / CARDS_PER_PAGE_DESKTOP) === i
                        ? 'bg-primary'
                        : 'bg-muted-foreground/30'
                    }`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>메시지 미리보기</DialogTitle>
            <DialogDescription>{getUserFacingMessageName(previewTemplate?.name)}</DialogDescription>
          </DialogHeader>
          {previewTemplate && (
            <div className="space-y-4">
              {previewTemplate.defaultImageUrl && (
                <div className="relative h-48 bg-muted rounded-lg overflow-hidden">
                  <img
                    src={previewTemplate.defaultImageUrl}
                    alt={getUserFacingMessageName(previewTemplate.name)}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="bg-muted rounded-lg p-4">
                {previewTemplate.titleTemplate && (
                  <p className="font-bold mb-2">{formatTemplatePlaceholders(previewTemplate, previewTemplate.titleTemplate)}</p>
                )}
                <p className="whitespace-pre-wrap text-sm">{formatTemplatePlaceholders(previewTemplate, previewTemplate.contentTemplate)}</p>
              </div>
              {previewTemplate.variableSchema && previewTemplate.variableSchema.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 text-sm">입력해야 할 정보</h4>
                  <div className="grid gap-2">
                    {previewTemplate.variableSchema.map((v, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Badge variant="outline">{v.label}</Badge>
                        <span className="text-muted-foreground">({v.type})</span>
                        {v.required && <Badge variant="secondary" className="text-xs">필수</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Button
                className="w-full"
                onClick={() => {
                  onSelectTemplate(previewTemplate);
                  setPreviewTemplate(null);
                }}
                data-testid="button-select-preview-template"
              >
                이 메시지 선택
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

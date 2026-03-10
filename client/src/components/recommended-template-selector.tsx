import { useState, useCallback } from "react";
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
  ChevronDown,
  Info,
  Eye,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  isActive?: boolean;
  sortOrder?: number;
}

interface FilterOption {
  value: string;
  label: string;
}

interface RecommendedTemplateSelectorProps {
  selectedTemplateId: string | null;
  onSelectTemplate: (template: RecommendedTemplate) => void;
}

const CARDS_PER_PAGE_DESKTOP = 3;
const CARDS_PER_PAGE_MOBILE = 1;

export default function RecommendedTemplateSelector({
  selectedTemplateId,
  onSelectTemplate,
}: RecommendedTemplateSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("commerce");
  const [selectedPurpose, setSelectedPurpose] = useState<string>("all");
  const [previewTemplate, setPreviewTemplate] = useState<RecommendedTemplate | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);

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
      
      const res = await fetch(`/api/recommended-templates?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });

  const templates = data?.templates || [];
  const categories = data?.categories || [];
  const purposes = data?.purposes || [];

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
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold" data-testid="text-recommended-header">발송 가능 메시지</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="text-muted-foreground" data-testid="button-recommended-info">
              <Info className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>업종과 목적에 맞는 검증된 메시지 템플릿을 선택하세요.</p>
            <p>별도 템플릿 승인 없이 바로 발송할 수 있습니다.</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={selectedCategory} onValueChange={handleCategoryChange}>
          <SelectTrigger className="w-full sm:w-[220px]" data-testid="select-category">
            <SelectValue placeholder="기본 메시지 업종 선택" />
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
          <SelectTrigger className="w-full sm:w-[220px]" data-testid="select-purpose">
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
              className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-background border shadow-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-carousel-prev"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          {carouselIndex < maxIndex && (
            <button
              type="button"
              onClick={nextSlide}
              className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-background border shadow-sm text-muted-foreground hover:text-foreground transition-colors"
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
                  <Card className="flex flex-col h-full border">
                    <div
                      className="flex items-center justify-center py-2 px-3 border-b cursor-pointer text-sm text-primary hover:underline"
                      onClick={() => setPreviewTemplate(template)}
                      data-testid={`button-preview-template-${template.id}`}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      미리보기
                    </div>

                    <div className="bg-muted/50 py-2.5 px-4 border-b text-center">
                      <h3 className="font-semibold text-sm truncate" data-testid={`text-template-name-${template.id}`}>
                        {template.name}
                      </h3>
                    </div>

                    <div className="flex-1 p-4 overflow-y-auto max-h-[280px]">
                      {template.titleTemplate && (
                        <p className="font-bold text-sm mb-2">{template.titleTemplate}</p>
                      )}
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed" data-testid={`text-template-content-${template.id}`}>
                        {template.contentTemplate}
                      </p>
                    </div>

                    <div className="p-3 border-t">
                      <Button
                        className="w-full gap-1.5"
                        onClick={() => onSelectTemplate(template)}
                        data-testid={`button-select-template-${template.id}`}
                      >
                        문구 적고 발송하기
                        <ChevronDown className="h-4 w-4" />
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
                  className={`w-2 h-2 rounded-full transition-colors ${
                    Math.floor(carouselIndex / CARDS_PER_PAGE_DESKTOP) === i
                      ? 'bg-primary'
                      : 'bg-muted-foreground/30'
                  }`}
                  onClick={() => setCarouselIndex(Math.min(i * CARDS_PER_PAGE_DESKTOP, maxIndex))}
                  data-testid={`button-carousel-dot-${i}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>메시지 미리보기</DialogTitle>
            <DialogDescription>{previewTemplate?.name}</DialogDescription>
          </DialogHeader>
          {previewTemplate && (
            <div className="space-y-4">
              {previewTemplate.defaultImageUrl && (
                <div className="relative h-48 bg-muted rounded-lg overflow-hidden">
                  <img 
                    src={previewTemplate.defaultImageUrl} 
                    alt={previewTemplate.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="bg-muted rounded-lg p-4">
                {previewTemplate.titleTemplate && (
                  <p className="font-bold mb-2">{previewTemplate.titleTemplate}</p>
                )}
                <p className="whitespace-pre-wrap text-sm">{previewTemplate.contentTemplate}</p>
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
                문구 적고 발송하기
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

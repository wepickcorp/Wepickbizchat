import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ShoppingCart, 
  Coffee, 
  Plane, 
  Dumbbell, 
  GraduationCap,
  CheckCircle2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Image
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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

const CATEGORY_ICONS: Record<string, typeof ShoppingCart> = {
  commerce: ShoppingCart,
  cafe_food: Coffee,
  travel_culture: Plane,
  sports_health: Dumbbell,
  education_life: GraduationCap,
};

const PURPOSE_COLORS: Record<string, string> = {
  signup: 'bg-blue-100 text-blue-800',
  review_event: 'bg-purple-100 text-purple-800',
  holiday_discount: 'bg-red-100 text-red-800',
  product_discount: 'bg-orange-100 text-orange-800',
  new_product: 'bg-green-100 text-green-800',
  new_product_discount: 'bg-emerald-100 text-emerald-800',
  app_download: 'bg-indigo-100 text-indigo-800',
  offline_product_discount: 'bg-amber-100 text-amber-800',
  offline_event: 'bg-pink-100 text-pink-800',
  event: 'bg-cyan-100 text-cyan-800',
  timedeal: 'bg-rose-100 text-rose-800',
  special_product: 'bg-violet-100 text-violet-800',
};

export default function RecommendedTemplateSelector({
  selectedTemplateId,
  onSelectTemplate,
}: RecommendedTemplateSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("commerce");
  const [selectedPurpose, setSelectedPurpose] = useState<string>("all");
  const [previewTemplate, setPreviewTemplate] = useState<RecommendedTemplate | null>(null);

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

  const getCategoryLabel = (value: string) => 
    categories.find(c => c.value === value)?.label || value;
  
  const getPurposeLabel = (value: string) => 
    purposes.find(p => p.value === value)?.label || value;

  const CategoryIcon = CATEGORY_ICONS[selectedCategory] || ShoppingCart;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">추천 메시지 선택</h2>
        <p className="text-muted-foreground">
          업종과 목적에 맞는 최적의 메시지를 선택하세요
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="font-semibold mb-3">업종 선택</h3>
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
            <TabsList className="grid grid-cols-5 w-full">
              {categories.map((cat) => {
                const Icon = CATEGORY_ICONS[cat.value] || ShoppingCart;
                return (
                  <TabsTrigger 
                    key={cat.value} 
                    value={cat.value}
                    className="flex flex-col gap-1 py-3 h-auto"
                    data-testid={`tab-category-${cat.value}`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs">{cat.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>

        <div>
          <h3 className="font-semibold mb-3">목적 선택</h3>
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-2 pb-2">
              <Button
                variant={selectedPurpose === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedPurpose('all')}
                data-testid="button-purpose-all"
              >
                전체
              </Button>
              {purposes.map((pur) => (
                <Button
                  key={pur.value}
                  variant={selectedPurpose === pur.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedPurpose(pur.value)}
                  data-testid={`button-purpose-${pur.value}`}
                >
                  {pur.label}
                </Button>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      </div>

      <div className="relative">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <CategoryIcon className="h-5 w-5" />
          {getCategoryLabel(selectedCategory)} 
          {selectedPurpose !== 'all' && ` · ${getPurposeLabel(selectedPurpose)}`}
          <Badge variant="secondary">{templates.length}개</Badge>
        </h3>

        {isLoading ? (
          <div className="grid md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-64 w-full" />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">
              선택한 조건에 맞는 추천 메시지가 없습니다.
              <br />
              다른 업종이나 목적을 선택해보세요.
            </p>
          </Card>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {templates.map((template) => (
              <Card 
                key={template.id}
                className={cn(
                  "cursor-pointer transition-all hover-elevate relative",
                  selectedTemplateId === template.id && "ring-2 ring-primary"
                )}
                onClick={() => onSelectTemplate(template)}
                data-testid={`card-template-${template.id}`}
              >
                {selectedTemplateId === template.id && (
                  <div className="absolute -top-2 -right-2 z-10">
                    <div className="bg-primary rounded-full p-1">
                      <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
                    </div>
                  </div>
                )}
                
                {template.defaultImageUrl && (
                  <div className="relative h-32 bg-muted rounded-t-lg overflow-hidden">
                    <img 
                      src={template.defaultImageUrl} 
                      alt={template.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                
                {!template.defaultImageUrl && (
                  <div className="h-32 bg-gradient-to-br from-primary/10 to-primary/5 rounded-t-lg flex items-center justify-center">
                    <Image className="h-10 w-10 text-muted-foreground/50" />
                  </div>
                )}
                
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base line-clamp-2">{template.name}</CardTitle>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewTemplate(template);
                      }}
                      data-testid={`button-preview-template-${template.id}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-xs">
                      {getCategoryLabel(template.category)}
                    </Badge>
                    <Badge 
                      className={cn("text-xs", PURPOSE_COLORS[template.purpose] || 'bg-gray-100 text-gray-800')}
                    >
                      {getPurposeLabel(template.purpose)}
                    </Badge>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {template.contentTemplate}
                  </p>
                </CardContent>
                
                {template.variableSchema && template.variableSchema.length > 0 && (
                  <CardFooter className="pt-0">
                    <div className="flex flex-wrap gap-1">
                      {template.variableSchema.slice(0, 3).map((v, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {v.label}
                        </Badge>
                      ))}
                      {template.variableSchema.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{template.variableSchema.length - 3}
                        </Badge>
                      )}
                    </div>
                  </CardFooter>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

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
                이 메시지 선택하기
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

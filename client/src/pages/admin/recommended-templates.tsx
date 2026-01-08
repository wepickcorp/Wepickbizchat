import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Eye, Search, Copy, Check } from "lucide-react";
import { VariableSchemaEditor, type VariableSchemaItem } from "@/components/admin/variable-schema-editor";
import { TargetingConfigEditor, type RecommendedTargetingConfig } from "@/components/admin/targeting-config-editor";

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
  targetingConfig?: RecommendedTargetingConfig;
  createdAt?: string;
  updatedAt?: string;
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

export default function AdminRecommendedTemplates() {
  const { toast } = useToast();
  const adminToken = localStorage.getItem("adminToken");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [purposeFilter, setPurposeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingTemplate, setEditingTemplate] = useState<RecommendedTemplate | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<RecommendedTemplate | null>(null);
  
  const [formData, setFormData] = useState<Partial<RecommendedTemplate>>({
    name: '',
    category: '',
    purpose: '',
    titleTemplate: '',
    contentTemplate: '',
    variableSchema: [],
    messageType: 'RCS',
    rcsType: 4,
    isActive: true,
    sortOrder: 0,
    targetingConfig: undefined,
  });
  const [variableSchema, setVariableSchema] = useState<VariableSchemaItem[]>([]);
  const [targetingConfig, setTargetingConfig] = useState<RecommendedTargetingConfig | undefined>(undefined);

  const { data, isLoading } = useQuery<{ templates: RecommendedTemplate[]; categories: FilterOption[]; purposes: FilterOption[] }>({
    queryKey: ["/api/recommended-templates", categoryFilter, purposeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      if (purposeFilter !== 'all') params.append('purpose', purposeFilter);
      params.append('active', 'false');
      
      const res = await fetch(`/api/recommended-templates?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (template: Partial<RecommendedTemplate>) => {
      const res = await fetch("/api/recommended-templates", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify(template),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create template");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "템플릿이 생성되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["/api/recommended-templates"] });
      setShowCreateDialog(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<RecommendedTemplate> }) => {
      const res = await fetch(`/api/recommended-templates/${id}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update template");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "템플릿이 수정되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["/api/recommended-templates"] });
      setEditingTemplate(null);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/recommended-templates/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error("Failed to delete template");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "템플릿이 삭제되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["/api/recommended-templates"] });
    },
    onError: () => {
      toast({ title: "삭제 실패", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      category: '',
      purpose: '',
      titleTemplate: '',
      contentTemplate: '',
      variableSchema: [],
      messageType: 'RCS',
      rcsType: 4,
      isActive: true,
      sortOrder: 0,
      targetingConfig: undefined,
    });
    setVariableSchema([]);
    setTargetingConfig(undefined);
  };

  const openEditDialog = (template: RecommendedTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      category: template.category,
      purpose: template.purpose,
      titleTemplate: template.titleTemplate || '',
      contentTemplate: template.contentTemplate,
      variableSchema: template.variableSchema || [],
      defaultImageUrl: template.defaultImageUrl || '',
      messageType: template.messageType || 'RCS',
      rcsType: template.rcsType ?? 4,
      isActive: template.isActive ?? true,
      sortOrder: template.sortOrder ?? 0,
      targetingConfig: template.targetingConfig,
    });
    setVariableSchema(template.variableSchema || []);
    setTargetingConfig(template.targetingConfig);
  };

  const handleSubmit = () => {
    // 필수 필드 검증
    if (!formData.name?.trim()) {
      toast({ title: "템플릿 이름을 입력해주세요", variant: "destructive" });
      return;
    }
    if (!formData.category) {
      toast({ title: "업종을 선택해주세요", variant: "destructive" });
      return;
    }
    if (!formData.purpose) {
      toast({ title: "목적을 선택해주세요", variant: "destructive" });
      return;
    }
    if (!formData.contentTemplate?.trim()) {
      toast({ title: "본문 템플릿을 입력해주세요", variant: "destructive" });
      return;
    }

    const submitData = {
      ...formData,
      variableSchema,
      targetingConfig,
    };
    
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const duplicateTemplate = (template: RecommendedTemplate) => {
    setFormData({
      name: `${template.name} (복사)`,
      category: template.category,
      purpose: template.purpose,
      titleTemplate: template.titleTemplate || '',
      contentTemplate: template.contentTemplate,
      variableSchema: template.variableSchema || [],
      defaultImageUrl: template.defaultImageUrl || '',
      messageType: template.messageType || 'RCS',
      rcsType: template.rcsType ?? 4,
      isActive: false,
      sortOrder: (template.sortOrder ?? 0) + 1,
      targetingConfig: template.targetingConfig,
    });
    setVariableSchema(template.variableSchema || []);
    setTargetingConfig(template.targetingConfig);
    setShowCreateDialog(true);
  };

  const filteredTemplates = data?.templates?.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.contentTemplate.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const getCategoryLabel = (value: string) => 
    data?.categories?.find(c => c.value === value)?.label || value;
  
  const getPurposeLabel = (value: string) => 
    data?.purposes?.find(p => p.value === value)?.label || value;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">추천 메시지 관리</h1>
          <p className="text-muted-foreground">업종별/목적별 추천 메시지 템플릿을 관리합니다</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setShowCreateDialog(true); }} data-testid="button-create-template">
              <Plus className="h-4 w-4 mr-2" />
              새 템플릿
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>새 추천 템플릿 생성</DialogTitle>
              <DialogDescription>업종별/목적별로 사용할 추천 메시지 템플릿을 생성합니다</DialogDescription>
            </DialogHeader>
            <TemplateForm 
              formData={formData}
              setFormData={setFormData}
              variableSchema={variableSchema}
              setVariableSchema={setVariableSchema}
              targetingConfig={targetingConfig}
              setTargetingConfig={setTargetingConfig}
              categories={data?.categories || []}
              purposes={data?.purposes || []}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>취소</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-submit-template">
                {createMutation.isPending ? "저장 중..." : "생성"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>템플릿 목록</CardTitle>
          <CardDescription>총 {filteredTemplates.length}개의 템플릿</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-60"
                data-testid="input-search-templates"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40" data-testid="select-category-filter">
                <SelectValue placeholder="업종" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 업종</SelectItem>
                {data?.categories?.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={purposeFilter} onValueChange={setPurposeFilter}>
              <SelectTrigger className="w-40" data-testid="select-purpose-filter">
                <SelectValue placeholder="목적" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 목적</SelectItem>
                {data?.purposes?.map((pur) => (
                  <SelectItem key={pur.value} value={pur.value}>{pur.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>업종</TableHead>
                  <TableHead>목적</TableHead>
                  <TableHead>RCS 타입</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>정렬</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((template) => (
                  <TableRow key={template.id} data-testid={`row-template-${template.id}`}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getCategoryLabel(template.category)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{getPurposeLabel(template.purpose)}</Badge>
                    </TableCell>
                    <TableCell>{RCS_TYPE_LABELS[template.rcsType ?? 4]}</TableCell>
                    <TableCell>
                      {template.isActive ? (
                        <Badge className="bg-green-100 text-green-800"><Check className="h-3 w-3 mr-1" />활성</Badge>
                      ) : (
                        <Badge variant="secondary">비활성</Badge>
                      )}
                    </TableCell>
                    <TableCell>{template.sortOrder}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={() => setPreviewTemplate(template)}
                          data-testid={`button-preview-${template.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={() => duplicateTemplate(template)}
                          data-testid={`button-duplicate-${template.id}`}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              size="icon" 
                              variant="ghost"
                              onClick={() => openEditDialog(template)}
                              data-testid={`button-edit-${template.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>템플릿 수정</DialogTitle>
                            </DialogHeader>
                            {editingTemplate && (
                              <TemplateForm 
                                formData={formData}
                                setFormData={setFormData}
                                variableSchema={variableSchema}
                                setVariableSchema={setVariableSchema}
                                targetingConfig={targetingConfig}
                                setTargetingConfig={setTargetingConfig}
                                categories={data?.categories || []}
                                purposes={data?.purposes || []}
                              />
                            )}
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setEditingTemplate(null)}>취소</Button>
                              <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
                                {updateMutation.isPending ? "저장 중..." : "저장"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm("이 템플릿을 삭제하시겠습니까?")) {
                              deleteMutation.mutate(template.id);
                            }
                          }}
                          data-testid={`button-delete-${template.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>템플릿 미리보기</DialogTitle>
            <DialogDescription>{previewTemplate?.name}</DialogDescription>
          </DialogHeader>
          {previewTemplate && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4">
                {previewTemplate.titleTemplate && (
                  <p className="font-bold mb-2">{previewTemplate.titleTemplate}</p>
                )}
                <p className="whitespace-pre-wrap text-sm">{previewTemplate.contentTemplate}</p>
              </div>
              {previewTemplate.variableSchema && previewTemplate.variableSchema.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">변수 스키마</h4>
                  <div className="grid gap-2">
                    {previewTemplate.variableSchema.map((v, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Badge variant="outline">{`{${v.key}}`}</Badge>
                        <span>{v.label}</span>
                        <span className="text-muted-foreground">({v.type})</span>
                        {v.required && <Badge variant="secondary">필수</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateForm({
  formData,
  setFormData,
  variableSchema,
  setVariableSchema,
  targetingConfig,
  setTargetingConfig,
  categories,
  purposes,
}: {
  formData: Partial<RecommendedTemplate>;
  setFormData: (data: Partial<RecommendedTemplate>) => void;
  variableSchema: VariableSchemaItem[];
  setVariableSchema: (schema: VariableSchemaItem[]) => void;
  targetingConfig: RecommendedTargetingConfig | undefined;
  setTargetingConfig: (config: RecommendedTargetingConfig | undefined) => void;
  categories: FilterOption[];
  purposes: FilterOption[];
}) {
  return (
    <ScrollArea className="h-[70vh] pr-4">
      <div className="space-y-6">
        {/* 기본 정보 */}
        <div className="space-y-4">
          <h3 className="font-medium text-sm text-muted-foreground">기본 정보</h3>
          
          <div className="grid grid-cols-2 gap-4">
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

          <div className="grid grid-cols-2 gap-4">
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

          <div className="grid grid-cols-2 gap-4">
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
        </div>

        {/* 메시지 내용 */}
        <div className="space-y-4">
          <h3 className="font-medium text-sm text-muted-foreground">메시지 내용</h3>
          
          <div className="space-y-2">
            <Label htmlFor="titleTemplate">제목 템플릿</Label>
            <Input
              id="titleTemplate"
              value={formData.titleTemplate || ''}
              onChange={(e) => setFormData({ ...formData, titleTemplate: e.target.value })}
              placeholder="예: {브랜드명} 회원가입 혜택 안내"
              data-testid="input-title-template"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contentTemplate">본문 템플릿 *</Label>
            <Textarea
              id="contentTemplate"
              value={formData.contentTemplate || ''}
              onChange={(e) => setFormData({ ...formData, contentTemplate: e.target.value })}
              placeholder="예: 지금 {브랜드명} 신규가입하고 {할인율}% 할인받으세요!"
              rows={6}
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
        </div>

        {/* 변수 설정 - 시각적 편집기 */}
        <VariableSchemaEditor
          value={variableSchema}
          onChange={setVariableSchema}
          contentTemplate={formData.contentTemplate}
        />

        {/* 타겟팅 설정 - 시각적 편집기 */}
        <TargetingConfigEditor
          value={targetingConfig}
          onChange={setTargetingConfig}
        />
      </div>
    </ScrollArea>
  );
}

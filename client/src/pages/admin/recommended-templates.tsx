import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Eye, Search, Copy, Check } from "lucide-react";
import { type VariableSchemaItem } from "@/components/admin/variable-schema-editor";
import { type RecommendedTargetingConfig } from "@shared/schema";

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
  const [, navigate] = useLocation();
  const adminToken = localStorage.getItem("adminToken");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [purposeFilter, setPurposeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<RecommendedTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecommendedTemplate | null>(null);

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
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: "삭제 실패", variant: "destructive" });
    },
  });

  const duplicateTemplate = (template: RecommendedTemplate) => {
    const duplicateData = {
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
      buttons: template.buttons,
    };

    fetch("/api/recommended-templates", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`,
      },
      body: JSON.stringify(duplicateData),
    })
      .then(res => {
        if (!res.ok) throw new Error("복제 실패");
        return res.json();
      })
      .then(() => {
        toast({ title: "템플릿이 복제되었습니다" });
        queryClient.invalidateQueries({ queryKey: ["/api/recommended-templates"] });
      })
      .catch(() => {
        toast({ title: "복제 실패", variant: "destructive" });
      });
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">추천 메시지 관리</h1>
          <p className="text-muted-foreground">업종별/목적별 추천 메시지 템플릿을 관리합니다</p>
        </div>
        <Button
          onClick={() => navigate("/admin/recommended-templates/new")}
          data-testid="button-create-template"
        >
          <Plus className="h-4 w-4 mr-2" />
          새 템플릿
        </Button>
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
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => navigate(`/admin/recommended-templates/${template.id}/edit`)}
                          data-testid={`button-edit-${template.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => setDeleteTarget(template)}
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
              {previewTemplate.targetingConfig && (
                <div>
                  <h4 className="font-semibold mb-2">타겟팅 설정</h4>
                  <div className="text-sm space-y-1">
                    <p>모드: <Badge variant="outline">{previewTemplate.targetingConfig.mode}</Badge></p>
                    {previewTemplate.targetingConfig.targetGender && previewTemplate.targetingConfig.targetGender !== 'all' && (
                      <p>성별: {previewTemplate.targetingConfig.targetGender === 'male' ? '남성' : '여성'}</p>
                    )}
                    {previewTemplate.targetingConfig.targetAgeStart && (
                      <p>연령: {previewTemplate.targetingConfig.targetAgeStart}~{previewTemplate.targetingConfig.targetAgeEnd}세</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>템플릿 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" 템플릿을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

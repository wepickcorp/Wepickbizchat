import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CheckCircle, Clock, ExternalLink, MessageSquareText, Plus, Search, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { VariableSchemaEditor, type VariableSchemaItem } from "@/components/admin/variable-schema-editor";
import { useToast } from "@/hooks/use-toast";

interface MessageCopyRequest {
  id: string;
  userId: string;
  userEmail: string | null;
  companyName: string | null;
  content: string;
  status: string;
  adminNote: string | null;
  rejectionReason: string | null;
  templateId: string | null;
  templateName: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

interface CustomerTemplate {
  id: string;
  name: string;
  messageType: string;
  title?: string | null;
  content: string;
  variableSchema?: VariableSchemaItem[];
  reviewedAt?: string | null;
  createdAt?: string | null;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  reviewing: { label: "검토 중", variant: "secondary" },
  approved_private: { label: "고객 전용 등록", variant: "default" },
  rejected: { label: "정보 보완 필요", variant: "destructive" },
  promoted: { label: "공용 등록", variant: "outline" },
};

export default function AdminMessageCopyRequests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const adminToken = localStorage.getItem("adminToken");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRequest, setSelectedRequest] = useState<MessageCopyRequest | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [showPrivateTemplateForm, setShowPrivateTemplateForm] = useState(false);
  const [privateTemplateForm, setPrivateTemplateForm] = useState({
    name: "",
    messageType: "RCS",
    title: "",
    lmsTitle: "",
    content: "",
    lmsContent: "",
    variableSchema: [] as VariableSchemaItem[],
  });

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/message-copy-requests", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/message-copy-requests?${params}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: templateData, isLoading: templatesLoading } = useQuery<{ templates: CustomerTemplate[] }>({
    queryKey: ["/api/admin/message-copy-requests", selectedRequest?.id, "templates"],
    enabled: !!selectedRequest,
    queryFn: async () => {
      const res = await fetch(`/api/admin/message-copy-requests/${selectedRequest?.id}/templates`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || "템플릿 목록 조회 실패");
      }
      return res.json();
    },
  });

  const processMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      if (action === "approve_private" && !templateId) {
        throw new Error("고객 전용으로 등록할 승인 템플릿을 선택해주세요");
      }
      const res = await fetch(`/api/admin/message-copy-requests/${id}/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          action,
          adminNote,
          rejectionReason,
          templateId,
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || "처리 실패");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "메시지 유형 요청이 처리됐어요" });
      setSelectedRequest(null);
      setAdminNote("");
      setRejectionReason("");
      setTemplateId("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/message-copy-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/message-copy-requests"] });
    },
    onError: (error: Error) => {
      toast({ title: "처리 실패", description: error.message, variant: "destructive" });
    },
  });

  const createPrivateTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRequest) throw new Error("요청을 먼저 선택해주세요");
      const res = await fetch(`/api/admin/message-copy-requests/${selectedRequest.id}/templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(privateTemplateForm),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || "고객 전용 템플릿 생성 실패");
      }
      return res.json();
    },
    onSuccess: (result) => {
      const createdTemplate = result?.template as CustomerTemplate | undefined;
      if (createdTemplate?.id) setTemplateId(createdTemplate.id);
      setPrivateTemplateForm({
        name: "",
        messageType: "RCS",
        title: "",
        lmsTitle: "",
        content: "",
        lmsContent: "",
        variableSchema: [],
      });
      setShowPrivateTemplateForm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/message-copy-requests", selectedRequest?.id, "templates"] });
      toast({
        title: "고객 전용 템플릿을 만들었어요",
        description: "선택된 템플릿으로 고객 전용 등록을 진행할 수 있어요.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "템플릿 생성 실패", description: error.message, variant: "destructive" });
    },
  });

  const requests: MessageCopyRequest[] = data?.requests || [];
  const customerTemplates = templateData?.templates || [];
  const counts = data?.counts || {};
  const pendingCount = Number(counts.reviewing || 0);

  const openRequest = (request: MessageCopyRequest) => {
    setSelectedRequest(request);
    setAdminNote(request.adminNote || "");
    setRejectionReason(request.rejectionReason || "");
    setTemplateId(request.templateId || "");
    setShowPrivateTemplateForm(false);
    setPrivateTemplateForm({
      name: "",
      messageType: "RCS",
      title: "",
      lmsTitle: "",
      content: "",
      lmsContent: "",
      variableSchema: [],
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">메시지 유형 요청함</h1>
        <p className="text-muted-foreground">고객이 찾지 못한 메시지 목적을 검토하고 SKT 검수 완료 템플릿으로 연결해요.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">검토 중</p>
              <p className="text-2xl font-bold">{pendingCount}건</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle className="h-5 w-5 text-success" />
            <div>
              <p className="text-sm text-muted-foreground">고객 전용 등록</p>
              <p className="text-2xl font-bold">{Number(counts.approved_private || 0)}건</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <XCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm text-muted-foreground">정보 보완 필요</p>
              <p className="text-2xl font-bold">{Number(counts.rejected || 0)}건</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>요청 목록</CardTitle>
          <CardDescription>새 요청은 상단에 먼저 보여요.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="고객사, 이메일, 요청 내용 검색"
                className="pl-9"
                data-testid="input-copy-request-search"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="md:w-48" data-testid="select-copy-request-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="reviewing">검토 중</SelectItem>
                <SelectItem value="approved_private">고객 전용 등록</SelectItem>
                <SelectItem value="rejected">정보 보완 필요</SelectItem>
                <SelectItem value="promoted">공용 등록</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="divide-y rounded-lg border">
            {isLoading ? (
              <p className="p-6 text-center text-muted-foreground">불러오는 중...</p>
            ) : requests.length === 0 ? (
              <p className="p-6 text-center text-muted-foreground">메시지 유형 요청이 없습니다</p>
            ) : (
              requests.map((request) => (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => openRequest(request)}
                  className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/50"
                  data-testid={`button-copy-request-${request.id}`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <MessageSquareText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{request.companyName || request.userEmail || "고객"}</p>
                      <StatusBadge status={request.status} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{request.content}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {format(new Date(request.createdAt), "yyyy.MM.dd HH:mm", { locale: ko })}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>메시지 유형 요청 상세</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{selectedRequest.companyName || selectedRequest.userEmail || "고객"}</p>
                  <StatusBadge status={selectedRequest.status} />
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm">{selectedRequest.content}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-id">연결할 고객 전용 템플릿</Label>
                <Select value={templateId || undefined} onValueChange={setTemplateId} disabled={templatesLoading}>
                  <SelectTrigger id="template-id" data-testid="select-copy-request-template">
                    <SelectValue placeholder={templatesLoading ? "승인 템플릿을 불러오는 중..." : "승인된 고객 전용 템플릿 선택"} />
                  </SelectTrigger>
                  <SelectContent>
                    {customerTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name} · {template.messageType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  고객 전용 등록은 요청 고객 계정의 승인 완료 템플릿만 연결할 수 있어요.
                </p>
                {customerTemplates.length > 0 && templateId && (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    {(() => {
                      const selectedTemplate = customerTemplates.find((template) => template.id === templateId);
                      if (!selectedTemplate) return null;
                      return (
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">{selectedTemplate.title || selectedTemplate.name}</p>
                          <p className="line-clamp-3 text-xs text-muted-foreground">{selectedTemplate.content}</p>
                        </div>
                      );
                    })()}
                  </div>
                )}
                {!templatesLoading && customerTemplates.length === 0 && (
                  <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">
                    이 고객에게 승인 완료된 전용 템플릿이 아직 없어요. 고객 전용으로 처리하려면 먼저 템플릿을 등록하고 SKT 검수를 완료해야 해요.
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setShowPrivateTemplateForm((value) => !value)}
                  >
                    <Plus className="h-4 w-4" />
                    고객 전용 템플릿 만들기
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      window.history.pushState({}, "", "/admin/recommended-templates/new");
                      window.dispatchEvent(new PopStateEvent("popstate"));
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                    공용 템플릿 만들기
                  </Button>
                </div>
                {showPrivateTemplateForm && (
                  <div className="space-y-3 rounded-lg border bg-card p-4">
                    <div>
                      <p className="text-sm font-semibold">SKT 검수 완료 고객 전용 템플릿</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        고객이 작성한 문구가 아니라, 운영팀이 SKT 검수를 마친 템플릿만 등록해요.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="private-template-name">템플릿 이름</Label>
                        <Input
                          id="private-template-name"
                          value={privateTemplateForm.name}
                          onChange={(event) => setPrivateTemplateForm((form) => ({ ...form, name: event.target.value }))}
                          placeholder="예: 재방문 혜택 안내"
                          data-testid="input-private-template-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="private-template-type">메시지 유형</Label>
                        <Select
                          value={privateTemplateForm.messageType}
                          onValueChange={(messageType) => setPrivateTemplateForm((form) => ({ ...form, messageType }))}
                        >
                          <SelectTrigger id="private-template-type" data-testid="select-private-template-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="RCS">RCS</SelectItem>
                            <SelectItem value="LMS">LMS</SelectItem>
                            <SelectItem value="MMS">MMS</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="private-template-title">RCS 제목</Label>
                        <Input
                          id="private-template-title"
                          value={privateTemplateForm.title}
                          onChange={(event) => setPrivateTemplateForm((form) => ({ ...form, title: event.target.value }))}
                          placeholder="검수 완료 제목"
                          data-testid="input-private-template-title"
                        />
                      </div>
                      {privateTemplateForm.messageType === "RCS" && (
                        <div className="space-y-2">
                          <Label htmlFor="private-template-lms-title">LMS 대체 제목</Label>
                          <Input
                            id="private-template-lms-title"
                            value={privateTemplateForm.lmsTitle}
                            onChange={(event) => setPrivateTemplateForm((form) => ({ ...form, lmsTitle: event.target.value }))}
                            placeholder="검수 완료 대체 제목"
                            data-testid="input-private-template-lms-title"
                          />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="private-template-content">검수 완료 본문</Label>
                      <Textarea
                        id="private-template-content"
                        value={privateTemplateForm.content}
                        onChange={(event) => setPrivateTemplateForm((form) => ({ ...form, content: event.target.value }))}
                        placeholder="SKT 검수를 마친 템플릿 본문을 입력하세요. 고객 자유 문구를 그대로 넣지 않아요."
                        className="min-h-24"
                        data-testid="textarea-private-template-content"
                      />
                    </div>
                    <VariableSchemaEditor
                      value={privateTemplateForm.variableSchema}
                      onChange={(variableSchema) => setPrivateTemplateForm((form) => ({ ...form, variableSchema }))}
                      contentTemplate={privateTemplateForm.content}
                    />
                    {privateTemplateForm.messageType === "RCS" && (
                      <div className="space-y-2">
                        <Label htmlFor="private-template-lms-content">LMS 대체 문구</Label>
                        <Textarea
                          id="private-template-lms-content"
                          value={privateTemplateForm.lmsContent}
                          onChange={(event) => setPrivateTemplateForm((form) => ({ ...form, lmsContent: event.target.value }))}
                          placeholder="RCS 미지원 단말에 보낼 검수 완료 대체 문구"
                          className="min-h-20"
                          data-testid="textarea-private-template-lms-content"
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setShowPrivateTemplateForm(false)}
                      >
                        취소
                      </Button>
                      <Button
                        type="button"
                        onClick={() => createPrivateTemplateMutation.mutate()}
                        disabled={createPrivateTemplateMutation.isPending}
                        data-testid="button-create-private-template"
                      >
                        {createPrivateTemplateMutation.isPending ? "생성 중..." : "검수 완료 템플릿 생성"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="reject-reason">보완 요청 내용</Label>
                <Textarea
                  id="reject-reason"
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value)}
                  placeholder="고객에게 보여줄 정보 보완 요청 내용을 입력하세요"
                  data-testid="textarea-copy-request-rejection"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-note">관리자 메모</Label>
                <Textarea
                  id="admin-note"
                  value={adminNote}
                  onChange={(event) => setAdminNote(event.target.value)}
                  placeholder="내부 처리 메모"
                  data-testid="textarea-copy-request-admin-note"
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => selectedRequest && processMutation.mutate({ id: selectedRequest.id, action: "reject" })}
              disabled={processMutation.isPending}
            >
              정보 보완 필요
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => selectedRequest && processMutation.mutate({ id: selectedRequest.id, action: "promote" })}
              disabled={processMutation.isPending}
            >
              공용 템플릿 등록
            </Button>
            <Button
              type="button"
              onClick={() => selectedRequest && processMutation.mutate({ id: selectedRequest.id, action: "approve_private" })}
              disabled={processMutation.isPending}
            >
              고객 전용 템플릿 등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const item = statusConfig[status] || statusConfig.reviewing;
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

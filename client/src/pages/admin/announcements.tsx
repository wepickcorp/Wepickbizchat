import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Search, Plus, Pencil, Trash2, Pin } from "lucide-react";
import { format } from "date-fns";

interface Announcement {
  id: string;
  title: string;
  content: string;
  category: string;
  priority: number;
  isPublished: boolean;
  isPinned: boolean;
  authorName: string;
  publishedAt: string | null;
  createdAt: string;
}

const categoryLabels: Record<string, string> = {
  general: "일반",
  update: "업데이트",
  maintenance: "점검",
  event: "이벤트",
};

const priorityLabels: Record<number, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  0: { label: "일반", variant: "secondary" },
  1: { label: "중요", variant: "default" },
  2: { label: "긴급", variant: "destructive" },
};

export default function AdminAnnouncements() {
  const { toast } = useToast();
  const adminToken = localStorage.getItem("adminToken");
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    category: "general",
    priority: 0,
    isPublished: false,
    isPinned: false,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/announcements", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/announcements?${params}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}` 
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "공지사항이 등록되었습니다" });
      setIsDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: () => {
      toast({ title: "등록 실패", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}` 
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "공지사항이 수정되었습니다" });
      setIsDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: () => {
      toast({ title: "수정 실패", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "공지사항이 삭제되었습니다" });
      refetch();
    },
    onError: () => {
      toast({ title: "삭제 실패", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      content: "",
      category: "general",
      priority: 0,
      isPublished: false,
      isPinned: false,
    });
    setEditingAnnouncement(null);
  };

  const handleEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setFormData({
      title: announcement.title,
      content: announcement.content,
      category: announcement.category,
      priority: announcement.priority,
      isPublished: announcement.isPublished,
      isPinned: announcement.isPinned,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingAnnouncement) {
      updateMutation.mutate({ id: editingAnnouncement.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">공지사항 관리</h1>
          <p className="text-muted-foreground">플랫폼 공지사항을 관리합니다</p>
        </div>
        <Button onClick={() => { resetForm(); setIsDialogOpen(true); }} data-testid="button-add-announcement">
          <Plus className="h-4 w-4 mr-2" />
          공지 등록
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="제목 또는 내용 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-announcements"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>공지사항 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <div className="space-y-4">
              {data?.announcements?.map((a: Announcement) => (
                <div key={a.id} className="flex items-start justify-between gap-4 p-4 border rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {a.isPinned && <Pin className="h-4 w-4 text-primary" />}
                      <h3 className="font-medium truncate">{a.title}</h3>
                      <Badge variant={priorityLabels[a.priority]?.variant || "secondary"}>
                        {priorityLabels[a.priority]?.label || "일반"}
                      </Badge>
                      <Badge variant="outline">{categoryLabels[a.category] || a.category}</Badge>
                      {!a.isPublished && <Badge variant="secondary">비공개</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{a.content}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {a.authorName} | {format(new Date(a.createdAt), "yyyy-MM-dd HH:mm")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="icon" variant="ghost" onClick={() => handleEdit(a)} data-testid={`button-edit-announcement-${a.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(a.id)} data-testid={`button-delete-announcement-${a.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {data?.announcements?.length === 0 && (
                <p className="text-center text-muted-foreground py-8">공지사항이 없습니다</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingAnnouncement ? "공지사항 수정" : "공지사항 등록"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>제목</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="공지사항 제목"
                data-testid="input-announcement-title"
              />
            </div>
            <div>
              <Label>내용</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="공지사항 내용"
                rows={6}
                data-testid="input-announcement-content"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>카테고리</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">일반</SelectItem>
                    <SelectItem value="update">업데이트</SelectItem>
                    <SelectItem value="maintenance">점검</SelectItem>
                    <SelectItem value="event">이벤트</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>중요도</Label>
                <Select value={String(formData.priority)} onValueChange={(v) => setFormData({ ...formData, priority: Number(v) })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">일반</SelectItem>
                    <SelectItem value="1">중요</SelectItem>
                    <SelectItem value="2">긴급</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isPublished}
                  onCheckedChange={(v) => setFormData({ ...formData, isPublished: v })}
                  data-testid="switch-announcement-published"
                />
                <Label>공개</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.isPinned}
                  onCheckedChange={(v) => setFormData({ ...formData, isPinned: v })}
                  data-testid="switch-announcement-pinned"
                />
                <Label>상단 고정</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>취소</Button>
            <Button 
              onClick={handleSubmit} 
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit-announcement"
            >
              {editingAnnouncement ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

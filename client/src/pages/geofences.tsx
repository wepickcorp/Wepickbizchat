import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  MapPin, 
  Search, 
  MoreHorizontal,
  Trash2,
  Pencil,
  Plus,
  MapPinned,
  Target,
} from "lucide-react";
import { useState } from "react";
import { formatDateTime } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Geofence {
  id: number;
  name: string;
  localId: string | null;
  latitude: string | null;
  longitude: string | null;
  radius: number;
  poiName: string | null;
  createdAt: string;
  isLocal: boolean;
}

interface GeofenceEditForm {
  name: string;
  gender: number;
  minAge: number;
  maxAge: number;
  stayMin: number;
  radius: number;
  address: string;
}

export default function Geofences() {
  const [searchQuery, setSearchQuery] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedGeofence, setSelectedGeofence] = useState<Geofence | null>(null);
  const [editForm, setEditForm] = useState<GeofenceEditForm>({
    name: "",
    gender: 0,
    minAge: 20,
    maxAge: 60,
    stayMin: 10,
    radius: 500,
    address: "",
  });
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ geofences: Geofence[] }>({
    queryKey: ["/api/maptics/geofences"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (targetId: number) => {
      return apiRequest("DELETE", "/api/maptics/geofences", { targetId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maptics/geofences"] });
      toast({
        title: "지오펜스 삭제 완료",
        description: "지오펜스가 삭제되었어요.",
      });
      setDeleteDialogOpen(false);
      setSelectedGeofence(null);
    },
    onError: (error: Error) => {
      toast({
        title: "삭제 실패",
        description: error.message || "다시 시도해주세요.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ targetId, data }: { targetId: number; data: GeofenceEditForm }) => {
      return apiRequest("PATCH", "/api/maptics/geofences", {
        targetId,
        name: data.name,
        target: [{
          gender: data.gender,
          minAge: data.minAge,
          maxAge: data.maxAge,
          stayMin: data.stayMin,
          radius: data.radius,
          address: data.address,
        }],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/maptics/geofences"] });
      toast({
        title: "지오펜스 수정 완료",
        description: "지오펜스가 수정되었어요.",
      });
      setEditDialogOpen(false);
      setSelectedGeofence(null);
    },
    onError: (error: Error) => {
      toast({
        title: "수정 실패",
        description: error.message || "다시 시도해주세요.",
        variant: "destructive",
      });
    },
  });

  const geofences = data?.geofences || [];
  const filteredGeofences = geofences.filter((gf) =>
    gf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    gf.poiName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEdit = (geofence: Geofence) => {
    setSelectedGeofence(geofence);
    setEditForm({
      name: geofence.name,
      gender: 0,
      minAge: 20,
      maxAge: 60,
      stayMin: 10,
      radius: geofence.radius || 500,
      address: geofence.poiName || "",
    });
    setEditDialogOpen(true);
  };

  const handleDelete = (geofence: Geofence) => {
    setSelectedGeofence(geofence);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedGeofence) {
      deleteMutation.mutate(selectedGeofence.id);
    }
  };

  const confirmUpdate = () => {
    if (selectedGeofence) {
      updateMutation.mutate({ targetId: selectedGeofence.id, data: editForm });
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">지오펜스 관리</h1>
          <p className="text-muted-foreground mt-1">
            위치 기반 타겟팅을 위한 지오펜스를 관리해요
          </p>
        </div>
        <Button asChild className="gap-2 w-fit" data-testid="button-new-geofence">
          <Link href="/campaigns/new">
            <Plus className="h-4 w-4" />
            새 캠페인에서 추가
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체 지오펜스</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{geofences.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">로컬 연동</CardTitle>
            <MapPinned className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{geofences.filter(g => g.isLocal).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">BizChat 전용</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{geofences.filter(g => !g.isLocal).length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="지오펜스 이름 또는 위치로 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-geofences"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between py-4 border-b last:border-0">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-8 w-8" />
                </div>
              ))}
            </div>
          ) : filteredGeofences.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <MapPin className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">등록된 지오펜스가 없어요</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-6">
                캠페인 생성 시 지도에서 지오펜스를 추가할 수 있어요
              </p>
              <Button asChild>
                <Link href="/campaigns/new">캠페인 만들기</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredGeofences.map((geofence) => (
                <div
                  key={geofence.id}
                  className="flex items-center justify-between py-4 px-4 border rounded-lg hover-elevate"
                  data-testid={`geofence-item-${geofence.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <MapPin className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{geofence.name}</span>
                        <Badge variant="outline" className="text-xs">
                          반경 {geofence.radius}m
                        </Badge>
                        {geofence.isLocal && (
                          <Badge variant="secondary" className="text-xs">로컬</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {geofence.poiName || "위치 정보 없음"}
                      </p>
                      {geofence.createdAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          생성: {formatDateTime(geofence.createdAt)}
                        </p>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-geofence-menu-${geofence.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(geofence)} data-testid={`button-edit-geofence-${geofence.id}`}>
                        <Pencil className="mr-2 h-4 w-4" />
                        수정
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDelete(geofence)} 
                        className="text-destructive"
                        data-testid={`button-delete-geofence-${geofence.id}`}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        삭제
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>지오펜스 수정</DialogTitle>
            <DialogDescription>
              지오펜스 설정을 수정해요. BizChat에도 함께 반영됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">지오펜스 이름</Label>
              <Input
                id="name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="지오펜스 이름"
                data-testid="input-edit-geofence-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="minAge">최소 나이</Label>
                <Input
                  id="minAge"
                  type="number"
                  min={19}
                  max={90}
                  value={editForm.minAge}
                  onChange={(e) => setEditForm({ ...editForm, minAge: parseInt(e.target.value) || 19 })}
                  data-testid="input-edit-geofence-minage"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxAge">최대 나이</Label>
                <Input
                  id="maxAge"
                  type="number"
                  min={19}
                  max={90}
                  value={editForm.maxAge}
                  onChange={(e) => setEditForm({ ...editForm, maxAge: parseInt(e.target.value) || 90 })}
                  data-testid="input-edit-geofence-maxage"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="radius">반경 (미터)</Label>
                <Input
                  id="radius"
                  type="number"
                  min={50}
                  max={2000}
                  value={editForm.radius}
                  onChange={(e) => setEditForm({ ...editForm, radius: parseInt(e.target.value) || 500 })}
                  data-testid="input-edit-geofence-radius"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stayMin">체류 시간 (분)</Label>
                <Input
                  id="stayMin"
                  type="number"
                  min={5}
                  max={30}
                  value={editForm.stayMin}
                  onChange={(e) => setEditForm({ ...editForm, stayMin: parseInt(e.target.value) || 10 })}
                  data-testid="input-edit-geofence-staymin"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">주소</Label>
              <Input
                id="address"
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                placeholder="지오펜스 주소"
                data-testid="input-edit-geofence-address"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              취소
            </Button>
            <Button 
              onClick={confirmUpdate} 
              disabled={updateMutation.isPending}
              data-testid="button-confirm-edit-geofence"
            >
              {updateMutation.isPending ? "수정 중..." : "수정"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>지오펜스를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              "{selectedGeofence?.name}" 지오펜스를 삭제하면 복구할 수 없어요.
              이 지오펜스를 사용하는 캠페인에도 영향을 줄 수 있어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-geofence"
            >
              {deleteMutation.isPending ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

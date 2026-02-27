import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Copy, Target, DollarSign, MessageSquare, CheckCircle2, Calendar } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { CampaignStatusBadge } from "@/components/campaign-status-badge";
import { formatCurrency, formatDateTime, getMessageTypeLabel } from "@/lib/authUtils";
import { cn } from "@/lib/utils";
import type { Campaign } from "@shared/schema";

export interface LoadCampaignOptions {
  copyTargeting: boolean;
  copyBudget: boolean;
  copyMessage: boolean;
}

interface LoadCampaignModalProps {
  open: boolean;
  onClose: () => void;
  onLoad: (campaignId: string, options: LoadCampaignOptions) => void;
}

export default function LoadCampaignModal({ open, onClose, onLoad }: LoadCampaignModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [options, setOptions] = useState<LoadCampaignOptions>({
    copyTargeting: true,
    copyBudget: true,
    copyMessage: true,
  });

  const { data: campaignsData, isLoading } = useQuery<{ campaigns: Campaign[] }>({
    queryKey: ['/api/campaigns'],
    enabled: open,
  });

  const campaigns = campaignsData?.campaigns || (Array.isArray(campaignsData) ? campaignsData as Campaign[] : []);

  const filteredCampaigns = useMemo(() => {
    if (!searchQuery.trim()) return campaigns;
    const q = searchQuery.toLowerCase();
    return campaigns.filter(c => c.name.toLowerCase().includes(q));
  }, [searchQuery, campaigns]);

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  const handleConfirm = () => {
    if (!selectedCampaignId) return;
    onLoad(selectedCampaignId, options);
    onClose();
  };

  const handleClose = () => {
    setSearchQuery('');
    setSelectedCampaignId(null);
    setOptions({ copyTargeting: true, copyBudget: true, copyMessage: true });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-primary" />
            이전 캠페인 설정 불러오기
          </DialogTitle>
          <DialogDescription>
            이전 캠페인의 설정을 가져와 새 캠페인의 기본값으로 사용합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 min-h-0">
          {/* 불러올 항목 선택 */}
          <div className="bg-muted/40 rounded-lg p-4 space-y-3">
            <p className="text-small font-medium text-muted-foreground">불러올 설정 선택</p>
            <div className="grid grid-cols-3 gap-3">
              <Label
                className={cn(
                  "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors",
                  options.copyMessage ? "border-primary bg-primary/5" : "border-border"
                )}
              >
                <Checkbox
                  checked={options.copyMessage}
                  onCheckedChange={(v) => setOptions(o => ({ ...o, copyMessage: !!v }))}
                  data-testid="checkbox-copy-message"
                />
                <div>
                  <div className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    <span className="text-small font-medium">메시지</span>
                  </div>
                  <p className="text-tiny text-muted-foreground">템플릿 선택</p>
                </div>
              </Label>
              <Label
                className={cn(
                  "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors",
                  options.copyTargeting ? "border-primary bg-primary/5" : "border-border"
                )}
              >
                <Checkbox
                  checked={options.copyTargeting}
                  onCheckedChange={(v) => setOptions(o => ({ ...o, copyTargeting: !!v }))}
                  data-testid="checkbox-copy-targeting"
                />
                <div>
                  <div className="flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    <span className="text-small font-medium">타겟팅</span>
                  </div>
                  <p className="text-tiny text-muted-foreground">성별·연령·지역·ATS</p>
                </div>
              </Label>
              <Label
                className={cn(
                  "flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors",
                  options.copyBudget ? "border-primary bg-primary/5" : "border-border"
                )}
              >
                <Checkbox
                  checked={options.copyBudget}
                  onCheckedChange={(v) => setOptions(o => ({ ...o, copyBudget: !!v }))}
                  data-testid="checkbox-copy-budget"
                />
                <div>
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    <span className="text-small font-medium">예산</span>
                  </div>
                  <p className="text-tiny text-muted-foreground">예산·발송번호</p>
                </div>
              </Label>
            </div>
          </div>

          <Separator />

          {/* 캠페인 검색 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="캠페인 이름으로 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-load-campaign-search"
            />
          </div>

          {/* 캠페인 목록 */}
          <ScrollArea className="flex-1 min-h-0 border rounded-lg">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-small">
                불러오는 중...
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-small">
                {searchQuery ? '검색 결과가 없습니다' : '이전 캠페인이 없습니다'}
              </div>
            ) : (
              <div className="divide-y">
                {filteredCampaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className={cn(
                      "flex items-center gap-3 p-4 cursor-pointer transition-colors hover:bg-muted/50",
                      selectedCampaignId === campaign.id && "bg-primary/5 border-l-2 border-l-primary"
                    )}
                    onClick={() => setSelectedCampaignId(campaign.id)}
                    data-testid={`campaign-item-${campaign.id}`}
                  >
                    <div className="shrink-0">
                      {selectedCampaignId === campaign.id ? (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-border" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-small truncate">{campaign.name}</span>
                        <Badge variant="outline" className="text-tiny shrink-0">
                          {getMessageTypeLabel(campaign.messageType || '')}
                        </Badge>
                        <CampaignStatusBadge statusCode={campaign.statusCode ?? 0} />
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-tiny text-muted-foreground flex-wrap">
                        {campaign.budget && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            {formatCurrency(Number(campaign.budget))}
                          </span>
                        )}
                        {campaign.createdAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDateTime(campaign.createdAt as unknown as string)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={handleClose} data-testid="button-load-campaign-cancel">
            취소
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedCampaignId || (!options.copyTargeting && !options.copyBudget && !options.copyMessage)}
            data-testid="button-load-campaign-confirm"
          >
            {selectedCampaign
              ? `"${selectedCampaign.name.length > 15 ? selectedCampaign.name.slice(0, 15) + '...' : selectedCampaign.name}" 불러오기`
              : '캠페인 선택 후 불러오기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Copy, CheckCircle2, Calendar, Wallet } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { CampaignStatusBadge } from "@/components/campaign-status-badge";
import { formatDateTime, formatNumber, getMessageTypeLabel } from "@/lib/authUtils";
import { cn } from "@/lib/utils";
import { calculateCampaignCredits } from "@shared/credit-policy";
import type { Campaign } from "@shared/schema";

interface LoadCampaignModalProps {
  open: boolean;
  onClose: () => void;
  onLoad: (campaignId: string) => void;
}

export default function LoadCampaignModal({ open, onClose, onLoad }: LoadCampaignModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

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
    onLoad(selectedCampaignId);
    onClose();
  };

  const handleClose = () => {
    setSearchQuery('');
    setSelectedCampaignId(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-primary" />
            이전 캠페인 복제하기
          </DialogTitle>
          <DialogDescription>
            이전 캠페인의 메시지와 타겟팅을 그대로 복제해요. 캠페인 이름과 발송일만 새로 설정하면 돼요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 min-h-0">
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

          <ScrollArea className="flex-1 min-h-0 border rounded-lg">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-small">
                불러오는 중...
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-small">
                {searchQuery ? '다른 검색어로 다시 찾아볼 수 있어요' : '복제할 캠페인을 만들면 여기에서 불러올 수 있어요'}
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
                        <span className="flex items-center gap-1">
                          <Wallet className="h-3 w-3" />
                          {formatNumber(calculateCampaignCredits({ targetCount: campaign.targetCount || 0 }).neededCredits)}C
                        </span>
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
            닫기
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedCampaignId}
            data-testid="button-load-campaign-confirm"
          >
            {selectedCampaign
              ? `"${selectedCampaign.name.length > 15 ? selectedCampaign.name.slice(0, 15) + '...' : selectedCampaign.name}" 복제하기`
              : '캠페인을 선택해요'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

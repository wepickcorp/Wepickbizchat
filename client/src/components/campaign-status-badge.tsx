import { Badge } from "@/components/ui/badge";
import { getStatusCodeLabel, getStatusCodeStyles, getStatusLabel } from "@/lib/authUtils";

interface CampaignStatusBadgeProps {
  status?: string;
  statusCode?: number;
  className?: string;
}

export function CampaignStatusBadge({ status, statusCode, className }: CampaignStatusBadgeProps) {
  if (statusCode !== undefined) {
    return (
      <Badge
        variant="outline"
        className={`${getStatusCodeStyles(statusCode)} ${className || ''}`}
        data-testid={`badge-status-${statusCode}`}
      >
        {getStatusCodeLabel(statusCode)}
      </Badge>
    );
  }

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'draft':
      case 'temp_registered':
        return 'bg-muted text-muted-foreground border-muted-border';
      case 'approval_requested':
      case 'pending':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'approved':
        return 'bg-success/10 text-success border-success/20';
      case 'running':
        return 'bg-primary/10 text-primary border-primary/20';
      case 'completed':
        return 'bg-success/10 text-success border-success/20';
      case 'stopped':
        return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'rejected':
        return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'cancelled':
        return 'bg-muted text-muted-foreground border-muted-border';
      default:
        return 'bg-muted text-muted-foreground border-muted-border';
    }
  };

  return (
    <Badge
      variant="outline"
      className={`${getStatusStyles(status || 'temp_registered')} ${className || ''}`}
      data-testid={`badge-status-${status || 'temp_registered'}`}
    >
      {getStatusLabel(status || 'temp_registered')}
    </Badge>
  );
}

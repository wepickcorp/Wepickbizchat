import { AlertCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import type { BizChatErrorInfo } from "@/lib/bizchat-errors";

interface BizChatErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: BizChatErrorInfo | null;
  /** 다이얼로그 상단에 표시할 컨텍스트 라벨 (예: "승인요청 실패") */
  contextLabel?: string;
}

export function BizChatErrorDialog({
  open,
  onOpenChange,
  info,
  contextLabel,
}: BizChatErrorDialogProps) {
  if (!info) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="dialog-bizchat-error">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-destructive/10">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex flex-col">
              {contextLabel && (
                <span
                  className="text-small text-muted-foreground"
                  data-testid="text-error-context"
                >
                  {contextLabel}
                </span>
              )}
              <AlertDialogTitle data-testid="text-error-title">
                {info.title}
              </AlertDialogTitle>
            </div>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-small text-muted-foreground">에러 코드</span>
                <Badge variant="secondary" data-testid="badge-error-code">
                  {info.code}
                </Badge>
              </div>
              <div>
                <p className="text-small font-medium text-foreground mb-1">
                  원인
                </p>
                <p
                  className="text-small text-muted-foreground"
                  data-testid="text-error-cause"
                >
                  {info.cause}
                </p>
              </div>
              <div>
                <p className="text-small font-medium text-foreground mb-1">
                  해결 방법
                </p>
                <p
                  className="text-small text-muted-foreground"
                  data-testid="text-error-solution"
                >
                  {info.solution}
                </p>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction data-testid="button-error-confirm">
            확인
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, CheckCircle2, ArrowRight, Clock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type CreationMode = 'recommended' | 'self' | null;

interface CreationModeSelectorProps {
  selectedMode: CreationMode;
  onSelectMode: (mode: CreationMode) => void;
}

export default function CreationModeSelector({
  selectedMode,
  onSelectMode
}: CreationModeSelectorProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-small font-semibold text-primary">첫 단계</p>
        <h2 className="text-2xl font-bold md:text-3xl">보낼 문구를 골라주세요</h2>
        <p className="text-muted-foreground">
          검토된 메시지를 고르고 필요한 정보만 채우면 돼요.
        </p>
      </div>

      <div className="grid gap-4">
        <Card
          className={cn(
            "relative cursor-pointer overflow-visible border-primary/20 bg-primary/5 transition-all hover-elevate",
            selectedMode === 'recommended' && "ring-2 ring-primary shadow-md"
          )}
          onClick={() => onSelectMode('recommended')}
          data-testid="card-creation-mode-recommended"
        >
          <div className="absolute -top-3 left-4">
            <Badge className="bg-primary text-primary-foreground">
              <Sparkles className="h-3 w-3 mr-1" />
              추천
            </Badge>
          </div>
          <CardHeader className="pt-7">
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="h-6 w-6 text-primary-foreground" />
              </div>
              {selectedMode === 'recommended' && (
                <CheckCircle2 className="h-6 w-6 text-primary" />
              )}
            </div>
            <CardTitle className="text-xl mt-4">메시지 고르기</CardTitle>
            <CardDescription>
              목적에 맞는 문구를 고르면 문자 발송까지 이어져요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <li className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary shrink-0" />
                <span>빠르게 만들 수 있어요</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <span>문구 구조가 이미 준비돼 있어요</span>
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-green-500 shrink-0" />
                <span>발송 조건은 마지막에 확인해요</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <span>초보자에게 추천해요</span>
              </li>
            </ul>
            <div className="mt-5 flex min-h-11 items-center justify-between rounded-lg bg-primary px-4 text-primary-foreground font-semibold">
              <span>메시지 고르기</span>
              <ArrowRight className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Pencil, CheckCircle2, ArrowRight } from "lucide-react";
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
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">광고 메시지 발송 방식 선택</h2>
        <p className="text-muted-foreground">
          원하시는 방식을 선택해주세요
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        <Card 
          className={cn(
            "cursor-pointer transition-all hover-elevate relative overflow-visible",
            selectedMode === 'recommended' && "ring-2 ring-primary"
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
          <CardHeader className="pt-6">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              {selectedMode === 'recommended' && (
                <CheckCircle2 className="h-6 w-6 text-primary" />
              )}
            </div>
            <CardTitle className="text-xl mt-4">추천 메시지로 발송</CardTitle>
            <CardDescription>
              업종과 목적에 맞는 검증된 메시지 템플릿을 활용하세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <span>업종별 최적화된 메시지 제공</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <span>검증된 문구로 높은 전환율</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <span>빠른 캠페인 생성 (3분 이내)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <span>별도 템플릿 승인 절차 불필요</span>
              </li>
            </ul>
            <div className="mt-4 flex items-center text-primary font-medium">
              <span>추천 메시지 선택하기</span>
              <ArrowRight className="h-4 w-4 ml-1" />
            </div>
          </CardContent>
        </Card>

        <Card 
          className={cn(
            "cursor-pointer transition-all hover-elevate relative overflow-visible",
            selectedMode === 'self' && "ring-2 ring-primary"
          )}
          onClick={() => onSelectMode('self')}
          data-testid="card-creation-mode-self"
        >
          <CardHeader className="pt-6">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Pencil className="h-6 w-6 text-muted-foreground" />
              </div>
              {selectedMode === 'self' && (
                <CheckCircle2 className="h-6 w-6 text-primary" />
              )}
            </div>
            <CardTitle className="text-xl mt-4">셀프 메시지로 발송</CardTitle>
            <CardDescription>
              직접 작성한 메시지 템플릿을 사용하세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>완전한 커스터마이징 가능</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>브랜드 톤앤매너 유지</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>기존 승인된 템플릿 활용</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-orange-500 shrink-0" />
                <span>템플릿 사전 승인 필요</span>
              </li>
            </ul>
            <div className="mt-4 flex items-center text-muted-foreground font-medium">
              <span>내 템플릿 선택하기</span>
              <ArrowRight className="h-4 w-4 ml-1" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

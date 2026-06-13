import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, MapPin, Target, Info } from "lucide-react";

export interface RecommendedTargetingConfig {
  mode: 'ats-general' | 'ats-advanced' | 'maptics';
  targetGender?: 'all' | 'male' | 'female';
  targetAgeStart?: number;
  targetAgeEnd?: number;
  advancedOptions?: {
    sndMosu?: number;
    areas?: string[];
    interests?: string[];
  };
  mapticsOptions?: {
    radius?: number;
    geofences?: Array<{ lat: number; lng: number; radius: number; name?: string }>;
    rcvType?: 1 | 2;
    rtStartHhmm?: string;
    rtEndHhmm?: string;
  };
}

interface TargetingConfigEditorProps {
  value: RecommendedTargetingConfig | undefined;
  onChange: (value: RecommendedTargetingConfig | undefined) => void;
}

const AREA_OPTIONS = [
  { value: 'seoul', label: '서울' },
  { value: 'gyeonggi', label: '경기' },
  { value: 'incheon', label: '인천' },
  { value: 'busan', label: '부산' },
  { value: 'daegu', label: '대구' },
  { value: 'gwangju', label: '광주' },
  { value: 'daejeon', label: '대전' },
  { value: 'ulsan', label: '울산' },
  { value: 'sejong', label: '세종' },
  { value: 'gangwon', label: '강원' },
  { value: 'chungbuk', label: '충북' },
  { value: 'chungnam', label: '충남' },
  { value: 'jeonbuk', label: '전북' },
  { value: 'jeonnam', label: '전남' },
  { value: 'gyeongbuk', label: '경북' },
  { value: 'gyeongnam', label: '경남' },
  { value: 'jeju', label: '제주' },
];

const INTEREST_OPTIONS = [
  { value: 'shopping', label: '쇼핑' },
  { value: 'travel', label: '여행' },
  { value: 'food', label: '맛집/외식' },
  { value: 'beauty', label: '뷰티/패션' },
  { value: 'sports', label: '스포츠/피트니스' },
  { value: 'entertainment', label: '엔터테인먼트' },
  { value: 'finance', label: '금융/투자' },
  { value: 'education', label: '교육' },
  { value: 'tech', label: '테크/IT' },
  { value: 'car', label: '자동차' },
  { value: 'pet', label: '반려동물' },
  { value: 'health', label: '건강/헬스케어' },
];

export function TargetingConfigEditor({ value, onChange }: TargetingConfigEditorProps) {
  const [enabled, setEnabled] = useState(!!value);
  const [config, setConfig] = useState<RecommendedTargetingConfig>(
    value || {
      mode: 'ats-general',
      targetGender: 'all',
      targetAgeStart: 20,
      targetAgeEnd: 60,
    }
  );

  // props 변경 시 내부 상태 동기화 (템플릿 전환 시)
  useEffect(() => {
    setEnabled(!!value);
    if (value) {
      setConfig(value);
    } else {
      setConfig({
        mode: 'ats-general',
        targetGender: 'all',
        targetAgeStart: 20,
        targetAgeEnd: 60,
      });
    }
  }, [value]);

  // 상태 변경 시 부모에게 전달
  useEffect(() => {
    if (enabled) {
      onChange(config);
    } else {
      onChange(undefined);
    }
  }, [enabled, config]);

  const updateConfig = (updates: Partial<RecommendedTargetingConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const updateAdvancedOptions = (updates: Partial<RecommendedTargetingConfig['advancedOptions']>) => {
    setConfig(prev => ({
      ...prev,
      advancedOptions: { ...prev.advancedOptions, ...updates },
    }));
  };

  const updateMapticsOptions = (updates: Partial<NonNullable<RecommendedTargetingConfig['mapticsOptions']>>) => {
    setConfig(prev => ({
      ...prev,
      mapticsOptions: { ...prev.mapticsOptions, ...updates },
    }));
  };

  const toggleArea = (area: string) => {
    const currentAreas = config.advancedOptions?.areas || [];
    const newAreas = currentAreas.includes(area)
      ? currentAreas.filter(a => a !== area)
      : [...currentAreas, area];
    updateAdvancedOptions({ areas: newAreas });
  };

  const toggleInterest = (interest: string) => {
    const currentInterests = config.advancedOptions?.interests || [];
    const newInterests = currentInterests.includes(interest)
      ? currentInterests.filter(i => i !== interest)
      : [...currentInterests, interest];
    updateAdvancedOptions({ interests: newInterests });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">타겟팅 설정</CardTitle>
            <CardDescription className="text-sm">
              이 템플릿에 적용할 기본 타겟팅 조건을 설정합니다
            </CardDescription>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            data-testid="switch-targeting-enabled"
          />
        </div>
      </CardHeader>

      {enabled && (
        <CardContent className="space-y-6">
          {/* 타겟팅 모드 선택 */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">타겟팅 모드</Label>
            <RadioGroup
              value={config.mode}
              onValueChange={(v: RecommendedTargetingConfig['mode']) => updateConfig({ mode: v })}
              className="grid grid-cols-3 gap-3"
            >
              <label className="cursor-pointer">
                <RadioGroupItem value="ats-general" className="peer sr-only" />
                <div className="flex flex-col items-center gap-2 p-4 border rounded-lg peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 hover-elevate">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium">일반 ATS</span>
                  <span className="text-xs text-muted-foreground text-center">성별/연령 기본</span>
                </div>
              </label>
              <label className="cursor-pointer">
                <RadioGroupItem value="ats-advanced" className="peer sr-only" />
                <div className="flex flex-col items-center gap-2 p-4 border rounded-lg peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 hover-elevate">
                  <Target className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium">고급 ATS</span>
                  <span className="text-xs text-muted-foreground text-center">지역/관심사 포함</span>
                </div>
              </label>
              <label className="cursor-pointer">
                <RadioGroupItem value="maptics" className="peer sr-only" />
                <div className="flex flex-col items-center gap-2 p-4 border rounded-lg peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 hover-elevate">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium">지오펜스</span>
                  <span className="text-xs text-muted-foreground text-center">위치 기반</span>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* 공통 설정: 성별 */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">대상 성별</Label>
            <RadioGroup
              value={config.targetGender || 'all'}
              onValueChange={(v: 'all' | 'male' | 'female') => updateConfig({ targetGender: v })}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="gender-all" />
                <Label htmlFor="gender-all" className="font-normal cursor-pointer">전체</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="male" id="gender-male" />
                <Label htmlFor="gender-male" className="font-normal cursor-pointer">남성</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="female" id="gender-female" />
                <Label htmlFor="gender-female" className="font-normal cursor-pointer">여성</Label>
              </div>
            </RadioGroup>
          </div>

          {/* 공통 설정: 연령대 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">대상 연령대</Label>
              <span className="text-sm text-muted-foreground">
                {config.targetAgeStart || 20}세 ~ {config.targetAgeEnd || 60}세
              </span>
            </div>
            <div className="px-2">
              <Slider
                value={[config.targetAgeStart || 20, config.targetAgeEnd || 60]}
                onValueChange={([start, end]) => updateConfig({ targetAgeStart: start, targetAgeEnd: end })}
                min={15}
                max={70}
                step={5}
                className="w-full"
                data-testid="slider-age-range"
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground px-2">
              <span>15세</span>
              <span>70세</span>
            </div>
          </div>

          {/* 고급 ATS 설정 */}
          {config.mode === 'ats-advanced' && (
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">고급 타겟팅 옵션</span>
              </div>

              {/* 모수 설정 */}
              <div className="space-y-2">
                <Label className="text-sm">타겟 모수 (선택)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={config.advancedOptions?.sndMosu || ''}
                    onChange={(e) => updateAdvancedOptions({ sndMosu: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="예: 100000"
                    className="w-40"
                    data-testid="input-snd-mosu"
                  />
                  <span className="text-sm text-muted-foreground">명</span>
                </div>
                <p className="text-xs text-muted-foreground">비워두면 자동으로 최대 모수가 적용됩니다</p>
              </div>

              {/* 지역 선택 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">지역 선택</Label>
                  {(config.advancedOptions?.areas?.length || 0) > 0 && (
                    <Badge variant="secondary">{config.advancedOptions?.areas?.length}개 선택</Badge>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {AREA_OPTIONS.map((area) => (
                    <label
                      key={area.value}
                      className="flex items-center gap-2 p-2 border rounded cursor-pointer hover-elevate"
                    >
                      <Checkbox
                        checked={config.advancedOptions?.areas?.includes(area.value) || false}
                        onCheckedChange={() => toggleArea(area.value)}
                      />
                      <span className="text-sm">{area.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 관심사 선택 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">관심사 선택</Label>
                  {(config.advancedOptions?.interests?.length || 0) > 0 && (
                    <Badge variant="secondary">{config.advancedOptions?.interests?.length}개 선택</Badge>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {INTEREST_OPTIONS.map((interest) => (
                    <label
                      key={interest.value}
                      className="flex items-center gap-2 p-2 border rounded cursor-pointer hover-elevate"
                    >
                      <Checkbox
                        checked={config.advancedOptions?.interests?.includes(interest.value) || false}
                        onCheckedChange={() => toggleInterest(interest.value)}
                      />
                      <span className="text-sm">{interest.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 지오펜스 설정 */}
          {config.mode === 'maptics' && (
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">지오펜스 옵션</span>
              </div>

              {/* 발송 방식 */}
              <div className="space-y-2">
                <Label className="text-sm">발송 방식</Label>
                <RadioGroup
                  value={String(config.mapticsOptions?.rcvType || 1)}
                  onValueChange={(v) => updateMapticsOptions({ rcvType: parseInt(v) as 1 | 2 })}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="1" id="rcvType-1" />
                    <Label htmlFor="rcvType-1" className="font-normal cursor-pointer">
                      실시간 (진입 즉시)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="2" id="rcvType-2" />
                    <Label htmlFor="rcvType-2" className="font-normal cursor-pointer">
                      모아서보내기
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* 활성 시간대 */}
              <div className="space-y-2">
                <Label className="text-sm">활성 시간대</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={config.mapticsOptions?.rtStartHhmm || '0900'}
                    onValueChange={(v) => updateMapticsOptions({ rtStartHhmm: v })}
                  >
                    <SelectTrigger className="w-24" data-testid="select-rt-start">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 13 }, (_, i) => i + 8).map((hour) => (
                        <SelectItem key={hour} value={String(hour).padStart(2, '0') + '00'}>
                          {hour}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span>~</span>
                  <Select
                    value={config.mapticsOptions?.rtEndHhmm || '2000'}
                    onValueChange={(v) => updateMapticsOptions({ rtEndHhmm: v })}
                  >
                    <SelectTrigger className="w-24" data-testid="select-rt-end">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 13 }, (_, i) => i + 8).map((hour) => (
                        <SelectItem key={hour} value={String(hour).padStart(2, '0') + '00'}>
                          {hour}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 기본 반경 */}
              <div className="space-y-2">
                <Label className="text-sm">기본 반경</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={config.mapticsOptions?.radius || 500}
                    onChange={(e) => updateMapticsOptions({ radius: parseInt(e.target.value) || 500 })}
                    className="w-24"
                    data-testid="input-default-radius"
                  />
                  <span className="text-sm text-muted-foreground">미터</span>
                </div>
              </div>

              <div className="p-3 bg-muted rounded-lg flex items-start gap-2">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  실제 지오펜스 위치는 캠페인 생성 시 사용자가 지도에서 직접 선택합니다.
                  여기서는 기본 설정만 지정합니다.
                </p>
              </div>
            </div>
          )}

          {/* 설정 요약 */}
          <div className="pt-4 border-t">
            <Label className="text-sm font-medium mb-2 block">설정 요약</Label>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {config.mode === 'ats-general' ? '일반 ATS' :
                 config.mode === 'ats-advanced' ? '고급 ATS' : '지오펜스'}
              </Badge>
              <Badge variant="outline">
                {config.targetGender === 'all' ? '전체' :
                 config.targetGender === 'male' ? '남성' : '여성'}
              </Badge>
              <Badge variant="outline">
                {config.targetAgeStart || 20}~{config.targetAgeEnd || 60}세
              </Badge>
              {config.mode === 'ats-advanced' && config.advancedOptions?.areas?.length ? (
                <Badge variant="outline">
                  지역 {config.advancedOptions.areas.length}개
                </Badge>
              ) : null}
              {config.mode === 'ats-advanced' && config.advancedOptions?.interests?.length ? (
                <Badge variant="outline">
                  관심사 {config.advancedOptions.interests.length}개
                </Badge>
              ) : null}
              {config.mode === 'maptics' && (
                <Badge variant="outline">
                  {config.mapticsOptions?.rcvType === 2 ? '모아서보내기' : '실시간'}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingBag,
  Smartphone,
  Phone,
  MapPin,
  Target,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Plus,
  X,
  Search,
  Loader2,
  TrendingUp,
  Clock,
} from "lucide-react";
import { formatNumber } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { GeofenceMap, type GeofenceMapItem } from "@/components/geofence-map";
import { type SelectedCategory, type SavedGeofence, type GeofenceTarget } from "@shared/schema";

// BizChat 카테고리 타입 (11st, webapp)
interface BizChatCategory {
  id: string;
  name: string;
  cateid: string;
}

interface BizChatCategoryResponse {
  metaType: string;
  dataType: string;
  list: BizChatCategory[];
}

// BizChat 위치 타입
interface BizChatLocation {
  hcode: string;
  ado: string;
  sigu: string;
  dong: string;
}

interface BizChatLocationResponse {
  list: BizChatLocation[];
  listR: BizChatLocation[];
}

// BizChat 필터 메타 타입
interface BizChatFilterAttribute {
  name: string;
  val: string;
  desc: string;
}

interface BizChatFilterMeta {
  name: string;
  desc: string;
  code: string;
  dataType: string;
  min: number;
  max: number;
  unit: string;
  attributes: BizChatFilterAttribute[];
}

interface BizChatFilterResponse {
  metaType: string;
  list: BizChatFilterMeta[];
}

// SelectedCategory, GeofenceTarget, SavedGeofence 타입은 @shared/schema에서 import

// 타겟팅 모드: ATS (고급 타겟팅) vs Maptics (지오펜스)
// BizChat API에서 두 방식은 상호 배타적 (rcvType=0 vs rcvType=1,2)
export type TargetingMode = 'ats' | 'maptics';

// Maptics 발송 방식: 실시간(rcvType=1) vs 모아서(rcvType=2)
export type MapticsSendType = 'realtime' | 'batch';

// 타겟팅 상태 (BizChat 규격 준수)
export interface AdvancedTargetingState {
  // 타겟팅 모드 (ATS vs Maptics)
  targetingMode: TargetingMode;
  // 11번가 카테고리 (cat1/cat2/cat3 형식) - ATS 전용
  shopping11stCategories: SelectedCategory[];
  // 웹앱 카테고리 (cat1/cat2/cat3 형식) - ATS 전용
  webappCategories: SelectedCategory[];
  // 통화Usage 카테고리 (cat1/cat2/cat3 형식) - ATS 전용
  callCategories: SelectedCategory[];
  // 위치 필터 (hcode 배열) - ATS 전용
  locations: {
    code: string;
    type: 'home' | 'work';
    name: string;
  }[];
  // 프로파일링 필터 (pro) - ATS 전용
  profiling: {
    code: string;
    value: string | { gt: string; lt: string };
    desc: string;
  }[];
  // 지오펜스 타겟팅 (Maptics) - Maptics 전용
  geofences: SavedGeofence[];
  // ATS 모수 정보 (BizChat API 연동용) - ATS 전용
  sndMosu?: number;
  sndMosuQuery?: string;
  sndMosuDesc?: string;
  
  // Maptics 발송 방식 (rcvType=1: realtime, rcvType=2: batch)
  mapticsSendType?: MapticsSendType;
  // Maptics 실시간 발송 시간대 (rcvType=1, HHMM 형식)
  rtStartHhmm?: string; // 0900~1950
  rtEndHhmm?: string;   // 0910~2000
  // Maptics 일 균등 분할 (rcvType=1, 0: 미분할, 1: 분할)
  sndDayDiv?: number;
}

interface TargetingAdvancedProps {
  targeting: AdvancedTargetingState;
  onTargetingChange: (targeting: AdvancedTargetingState) => void;
  basicTargeting: {
    gender: string;
    ageMin: number;
    ageMax: number;
    regions: string[];
  };
}

// 11번가/웹앱 계층적 카테고리 선택 컴포넌트
function HierarchicalCategorySection({
  title,
  description,
  icon: Icon,
  metaType,
  selectedCategories,
  onCategoriesChange,
  testIdPrefix,
}: {
  title: string;
  description: string;
  icon: typeof ShoppingBag;
  metaType: '11st' | 'webapp' | 'call';
  selectedCategories: SelectedCategory[];
  onCategoriesChange: (categories: SelectedCategory[]) => void;
  testIdPrefix: string;
}) {
  const [isOpen, setIsOpen] = useState(selectedCategories.length > 0);
  const [selectedCat1, setSelectedCat1] = useState<string | null>(null);
  const [selectedCat2, setSelectedCat2] = useState<string | null>(null);

  // 카테고리 1 조회
  const { data: cat1Data, isLoading: cat1Loading } = useQuery<BizChatCategoryResponse>({
    queryKey: [`/api/ats/meta/${metaType}`],
  });

  // 카테고리 2 조회 (cat1 선택 시)
  const { data: cat2Data, isLoading: cat2Loading } = useQuery<BizChatCategoryResponse>({
    queryKey: [`/api/ats/meta/${metaType}`, selectedCat1],
    queryFn: async () => {
      if (!selectedCat1) return { metaType: '', dataType: '', list: [] };
      const res = await fetch(`/api/ats/meta/${metaType}?cateid=${selectedCat1}`);
      return res.json();
    },
    enabled: !!selectedCat1,
  });

  // 카테고리 3 조회 (cat2 선택 시)
  const { data: cat3Data, isLoading: cat3Loading } = useQuery<BizChatCategoryResponse>({
    queryKey: [`/api/ats/meta/${metaType}`, selectedCat1, selectedCat2],
    queryFn: async () => {
      if (!selectedCat2) return { metaType: '', dataType: '', list: [] };
      const res = await fetch(`/api/ats/meta/${metaType}?cateid=${selectedCat2}`);
      return res.json();
    },
    enabled: !!selectedCat2,
  });

  const cat1List = cat1Data?.list || [];
  const cat2List = cat2Data?.list || [];
  const cat3List = cat3Data?.list || [];

  // cateid로 표시명 조회 (BizChat API는 cateid 코드를 기대함)
  const getCat1Name = (cateid: string) => cat1List.find(c => c.cateid === cateid)?.name || cateid;
  const getCat2Name = (cateid: string) => cat2List.find(c => c.cateid === cateid)?.name || cateid;
  const getCat3Name = (cateid: string) => cat3List.find(c => c.cateid === cateid)?.name || cateid;

  const addCategory = (cat1Cateid: string, cat2Cateid?: string, cat3Cateid?: string) => {
    // cateid 코드와 표시명을 모두 저장 (BizChat API는 cateid 코드를 기대)
    const newCat: SelectedCategory = { 
      cat1: cat1Cateid,  // cateid 코드 저장 (예: "01")
      cat1Name: getCat1Name(cat1Cateid),  // 표시명 저장 (예: "가구/인테리어")
    };
    if (cat2Cateid) {
      newCat.cat2 = cat2Cateid;  // cateid 코드 (예: "0101")
      newCat.cat2Name = getCat2Name(cat2Cateid);
    }
    if (cat3Cateid) {
      newCat.cat3 = cat3Cateid;  // cateid 코드 (예: "010101")
      newCat.cat3Name = getCat3Name(cat3Cateid);
    }

    // 중복 체크 (cateid 코드로 비교)
    const isDuplicate = selectedCategories.some(
      c => c.cat1 === newCat.cat1 && c.cat2 === newCat.cat2 && c.cat3 === newCat.cat3
    );
    if (!isDuplicate) {
      onCategoriesChange([...selectedCategories, newCat]);
    }
  };

  const removeCategory = (index: number) => {
    onCategoriesChange(selectedCategories.filter((_, i) => i !== index));
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={cn(selectedCategories.length > 0 && "border-primary/50")}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-body">{title}</CardTitle>
                  <CardDescription className="text-small">{description}</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedCategories.length > 0 && (
                  <Badge variant="secondary">{selectedCategories.length}개 선택</Badge>
                )}
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* 선택된 카테고리 표시 */}
            {selectedCategories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedCategories.map((cat, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="gap-1"
                    data-testid={`${testIdPrefix}-selected-${index}`}
                  >
                    {cat.cat1Name || cat.cat1}
                    {cat.cat2 && ` > ${cat.cat2Name || cat.cat2}`}
                    {cat.cat3 && ` > ${cat.cat3Name || cat.cat3}`}
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-destructive"
                      onClick={() => removeCategory(index)}
                    />
                  </Badge>
                ))}
              </div>
            )}

            {/* 계층적 선택 UI */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 카테고리 1 */}
              <div className="space-y-2">
                <Label className="text-small font-medium">대분류</Label>
                <ScrollArea className="h-[200px] border rounded-lg p-2">
                  {cat1Loading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {cat1List.map((cat) => (
                        <div
                          key={cat.cateid}
                          className={cn(
                            "flex items-center justify-between p-2 rounded cursor-pointer text-small",
                            selectedCat1 === cat.cateid
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-muted"
                          )}
                          onClick={() => {
                            setSelectedCat1(cat.cateid);
                            setSelectedCat2(null);
                          }}
                          data-testid={`${testIdPrefix}-cat1-${cat.cateid}`}
                        >
                          <span>{cat.name}</span>
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* 카테고리 2 */}
              <div className="space-y-2">
                <Label className="text-small font-medium">중분류</Label>
                <ScrollArea className="h-[200px] border rounded-lg p-2">
                  {!selectedCat1 ? (
                    <div className="text-center py-4 text-small text-muted-foreground">
                      대분류를 선택하세요
                    </div>
                  ) : cat2Loading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : cat2List.length === 0 ? (
                    <div className="text-center py-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addCategory(selectedCat1)}
                        data-testid={`${testIdPrefix}-add-cat1`}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        대분류만 추가
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {cat2List.map((cat) => (
                        <div
                          key={cat.cateid}
                          className={cn(
                            "flex items-center justify-between p-2 rounded cursor-pointer text-small",
                            selectedCat2 === cat.cateid
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-muted"
                          )}
                          onClick={() => setSelectedCat2(cat.cateid)}
                          data-testid={`${testIdPrefix}-cat2-${cat.cateid}`}
                        >
                          <span>{cat.name}</span>
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* 카테고리 3 */}
              <div className="space-y-2">
                <Label className="text-small font-medium">소분류</Label>
                <ScrollArea className="h-[200px] border rounded-lg p-2">
                  {!selectedCat2 ? (
                    <div className="text-center py-4 text-small text-muted-foreground">
                      중분류를 선택하세요
                    </div>
                  ) : cat3Loading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : cat3List.length === 0 ? (
                    <div className="text-center py-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addCategory(selectedCat1!, selectedCat2)}
                        data-testid={`${testIdPrefix}-add-cat2`}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        중분류까지 추가
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {cat3List.map((cat) => (
                        <div
                          key={cat.cateid}
                          className="flex items-center justify-between p-2 rounded cursor-pointer text-small hover:bg-muted"
                          onClick={() => addCategory(selectedCat1!, selectedCat2!, cat.cateid)}
                          data-testid={`${testIdPrefix}-cat3-${cat.cateid}`}
                        >
                          <span>{cat.name}</span>
                          <Plus className="h-4 w-4 text-primary" />
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// 위치 검색 컴포넌트
function LocationSearchSection({
  selectedLocations,
  onLocationsChange,
}: {
  selectedLocations: AdvancedTargetingState['locations'];
  onLocationsChange: (locations: AdvancedTargetingState['locations']) => void;
}) {
  const [isOpen, setIsOpen] = useState(selectedLocations.length > 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BizChatLocation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [locationType, setLocationType] = useState<'home' | 'work'>('home');

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const res = await apiRequest('POST', '/api/ats/meta/loc', { addr: searchQuery });
      const data: BizChatLocationResponse = await res.json();
      setSearchResults(data.list || []);
    } catch (error) {
      console.error('Location search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const addLocation = (loc: BizChatLocation) => {
    const newLoc = {
      code: loc.hcode,
      type: locationType,
      name: `${loc.ado} ${loc.sigu} ${loc.dong}`.trim(),
    };
    
    // 중복 체크
    const isDuplicate = selectedLocations.some(
      l => l.code === newLoc.code && l.type === newLoc.type
    );
    if (!isDuplicate) {
      onLocationsChange([...selectedLocations, newLoc]);
    }
  };

  const removeLocation = (index: number) => {
    onLocationsChange(selectedLocations.filter((_, i) => i !== index));
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={cn(selectedLocations.length > 0 && "border-primary/50")}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-body">위치 타겟팅</CardTitle>
                  <CardDescription className="text-small">
                    추정 집주소/직장주소로 타겟팅
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedLocations.length > 0 && (
                  <Badge variant="secondary">{selectedLocations.length}개 지역</Badge>
                )}
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* 선택된 위치 표시 */}
            {selectedLocations.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedLocations.map((loc, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="gap-1"
                    data-testid={`location-selected-${index}`}
                  >
                    [{loc.type === 'home' ? '집' : '직장'}] {loc.name}
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-destructive"
                      onClick={() => removeLocation(index)}
                    />
                  </Badge>
                ))}
              </div>
            )}

            {/* 위치 유형 선택 */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={locationType === 'home' ? 'default' : 'outline'}
                onClick={() => setLocationType('home')}
                data-testid="button-location-type-home"
              >
                추정 집주소
              </Button>
              <Button
                size="sm"
                variant={locationType === 'work' ? 'default' : 'outline'}
                onClick={() => setLocationType('work')}
                data-testid="button-location-type-work"
              >
                추정 직장주소
              </Button>
            </div>

            {/* 검색 */}
            <div className="flex gap-2">
              <Input
                placeholder="지역명 검색 (예: 강남, 양양)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                data-testid="input-location-search"
              />
              <Button onClick={handleSearch} disabled={isSearching}>
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* 검색 결과 */}
            {searchResults.length > 0 && (
              <ScrollArea className="h-[200px] border rounded-lg p-2">
                <div className="space-y-1">
                  {searchResults.map((loc, index) => (
                    <div
                      key={`${loc.hcode}-${index}`}
                      className="flex items-center justify-between p-2 rounded cursor-pointer text-small hover:bg-muted"
                      onClick={() => addLocation(loc)}
                      data-testid={`location-result-${loc.hcode}`}
                    >
                      <span>{loc.ado} {loc.sigu} {loc.dong}</span>
                      <Plus className="h-4 w-4 text-primary" />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// POI 검색 결과 타입
interface POIResult {
  road: string;
  lat: string;
  lon: string;
}

// 지오펜스 타겟팅 컴포넌트
function GeofenceSection({
  savedGeofences,
  onGeofencesChange,
}: {
  savedGeofences: SavedGeofence[];
  onGeofencesChange: (geofences: SavedGeofence[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(savedGeofences.length > 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'poi' | 'addr'>('poi');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<POIResult[]>([]);
  const [selectedPOI, setSelectedPOI] = useState<POIResult | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // 지도 관련 상태
  const [hoveredGeofenceId, setHoveredGeofenceId] = useState<number | null>(null);
  const [selectedGeofenceId, setSelectedGeofenceId] = useState<number | null>(null);

  // 지오펜스 설정
  const [geoName, setGeoName] = useState('');
  const [geoGender, setGeoGender] = useState(0);
  const [geoMinAge, setGeoMinAge] = useState(20);
  const [geoMaxAge, setGeoMaxAge] = useState(50);
  const [geoStayMin, setGeoStayMin] = useState(10);
  const [geoRadius, setGeoRadius] = useState(500);

  // 지오펜스를 지도 형식으로 변환
  const mapGeofences: GeofenceMapItem[] = savedGeofences.map((geo) => ({
    id: geo.id,
    name: geo.name,
    targets: geo.targets.map((t) => ({
      address: t.address,
      lat: t.lat,
      lon: t.lon,
      radius: t.radius,
    })),
  }));

  // 미리보기용 타겟 (선택된 POI + 현재 반경)
  const previewTarget = selectedPOI ? {
    address: selectedPOI.road,
    lat: selectedPOI.lat,
    lon: selectedPOI.lon,
    radius: geoRadius,
  } : null;

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await apiRequest('POST', '/api/maptics/poi', {
        skey: searchQuery.trim(),
        type: searchType,
      });
      const data = await res.json();
      setSearchResults(data.list || []);
    } catch (error) {
      console.error('POI search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const selectPOI = (poi: POIResult) => {
    setSelectedPOI(poi);
    setSearchResults([]);
    if (!geoName) {
      setGeoName(poi.road.split(' ').slice(0, 3).join(' '));
    }
  };

  const createGeofence = async () => {
    if (!selectedPOI || !geoName.trim()) return;
    setIsCreating(true);
    try {
      const target: GeofenceTarget = {
        gender: geoGender,
        minAge: geoMinAge,
        maxAge: geoMaxAge,
        stayMin: geoStayMin,
        radius: geoRadius,
        address: selectedPOI.road,
        lat: selectedPOI.lat,
        lon: selectedPOI.lon,
      };

      const res = await apiRequest('POST', '/api/maptics/geofences', {
        name: geoName.trim(),
        target: [target],
      });
      const data = await res.json();

      if (data.id) {
        const newGeofence: SavedGeofence = {
          id: data.id,
          name: geoName.trim(),
          targets: [target],
        };
        onGeofencesChange([...savedGeofences, newGeofence]);
        // 리셋
        setSelectedPOI(null);
        setGeoName('');
        setGeoGender(0);
        setGeoMinAge(20);
        setGeoMaxAge(50);
        setGeoStayMin(10);
        setGeoRadius(500);
      }
    } catch (error) {
      console.error('Failed to create geofence:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const removeGeofence = async (index: number) => {
    const geofence = savedGeofences[index];
    try {
      await apiRequest('DELETE', '/api/maptics/geofences', {
        targetId: geofence.id,
      });
      onGeofencesChange(savedGeofences.filter((_, i) => i !== index));
    } catch (error) {
      console.error('Failed to delete geofence:', error);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={cn(savedGeofences.length > 0 && "border-primary/50")}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-body">지오펜스 타겟팅</CardTitle>
                  <CardDescription className="text-small">
                    특정 위치에 방문한 고객 타겟팅
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {savedGeofences.length > 0 && (
                  <Badge variant="secondary">{savedGeofences.length}개 지오펜스</Badge>
                )}
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* 지오펜스 목록 + 지도 분할 레이아웃 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 왼쪽: 저장된 지오펜스 목록 */}
              <div className="space-y-2">
                <Label className="text-small font-medium">등록된 지오펜스</Label>
                {savedGeofences.length > 0 ? (
                  <div className="space-y-2">
                    {savedGeofences.map((geo, index) => (
                      <div
                        key={geo.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors",
                          selectedGeofenceId === geo.id 
                            ? "bg-primary/10 border border-primary/50" 
                            : hoveredGeofenceId === geo.id 
                              ? "bg-muted" 
                              : "bg-muted/50"
                        )}
                        data-testid={`geofence-saved-${geo.id}`}
                        onClick={() => setSelectedGeofenceId(selectedGeofenceId === geo.id ? null : geo.id)}
                        onMouseEnter={() => setHoveredGeofenceId(geo.id)}
                        onMouseLeave={() => setHoveredGeofenceId(null)}
                      >
                        <div>
                          <div className="font-medium text-small">{geo.name}</div>
                          <div className="text-tiny text-muted-foreground">
                            {geo.targets[0]?.address} · 반경 {geo.targets[0]?.radius}m · 체류 {geo.targets[0]?.stayMin}분
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeGeofence(index);
                          }}
                          data-testid={`button-remove-geofence-${geo.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-small text-muted-foreground p-4 text-center border rounded-lg border-dashed">
                    아래에서 위치를 검색하여 지오펜스를 추가해주세요
                  </div>
                )}
              </div>

              {/* 오른쪽: 지도 */}
              <div className="space-y-2">
                <Label className="text-small font-medium">지도 미리보기</Label>
                <GeofenceMap
                  geofences={mapGeofences}
                  selectedGeofenceId={selectedGeofenceId}
                  hoveredGeofenceId={hoveredGeofenceId}
                  onGeofenceClick={(id) => setSelectedGeofenceId(selectedGeofenceId === id ? null : id)}
                  onGeofenceHover={setHoveredGeofenceId}
                  previewTarget={previewTarget}
                  className="h-[280px]"
                />
              </div>
            </div>

            {/* POI 검색 */}
            <div className="space-y-2">
              <Label className="text-small font-medium">위치 검색</Label>
              <div className="flex gap-2">
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={searchType === 'poi' ? 'default' : 'outline'}
                    onClick={() => setSearchType('poi')}
                    data-testid="button-search-type-poi"
                  >
                    장소명
                  </Button>
                  <Button
                    size="sm"
                    variant={searchType === 'addr' ? 'default' : 'outline'}
                    onClick={() => setSearchType('addr')}
                    data-testid="button-search-type-addr"
                  >
                    주소
                  </Button>
                </div>
                <Input
                  placeholder={searchType === 'poi' ? '장소명 검색 (예: 강남역)' : '주소 검색 (예: 테헤란로)'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  data-testid="input-geofence-search"
                />
                <Button onClick={handleSearch} disabled={isSearching}>
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* 검색 결과 */}
              {searchResults.length > 0 && (
                <ScrollArea className="h-[150px] border rounded-lg p-2">
                  <div className="space-y-1">
                    {searchResults.map((poi, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 rounded cursor-pointer text-small hover:bg-muted"
                        onClick={() => selectPOI(poi)}
                        data-testid={`poi-result-${index}`}
                      >
                        <span>{poi.road}</span>
                        <Plus className="h-4 w-4 text-primary" />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* 선택된 POI 설정 */}
            {selectedPOI && (
              <div className="space-y-4 p-4 border rounded-lg bg-accent/20">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-small">선택된 위치</div>
                    <div className="text-tiny text-muted-foreground">{selectedPOI.road}</div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setSelectedPOI(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-small">지오펜스 이름</Label>
                  <Input
                    placeholder="지오펜스 이름"
                    value={geoName}
                    onChange={(e) => setGeoName(e.target.value)}
                    data-testid="input-geofence-name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-small">성별</Label>
                    <div className="flex gap-1">
                      {[
                        { value: 0, label: '전체' },
                        { value: 1, label: '남성' },
                        { value: 2, label: '여성' },
                      ].map((opt) => (
                        <Button
                          key={opt.value}
                          size="sm"
                          variant={geoGender === opt.value ? 'default' : 'outline'}
                          onClick={() => setGeoGender(opt.value)}
                        >
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-small">연령</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={19}
                        max={90}
                        value={geoMinAge}
                        onChange={(e) => setGeoMinAge(Number(e.target.value))}
                        className="w-16"
                        data-testid="input-geofence-min-age"
                      />
                      <span className="text-muted-foreground">~</span>
                      <Input
                        type="number"
                        min={19}
                        max={90}
                        value={geoMaxAge}
                        onChange={(e) => setGeoMaxAge(Number(e.target.value))}
                        className="w-16"
                        data-testid="input-geofence-max-age"
                      />
                      <span className="text-small text-muted-foreground">세</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-small">체류 시간 (분)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={5}
                        max={30}
                        value={geoStayMin}
                        onChange={(e) => setGeoStayMin(Number(e.target.value))}
                        className="w-20"
                        data-testid="input-geofence-stay-min"
                      />
                      <span className="text-tiny text-muted-foreground">5~30분</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-small">반경 (m)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={50}
                        max={2000}
                        step={50}
                        value={geoRadius}
                        onChange={(e) => setGeoRadius(Number(e.target.value))}
                        className="w-24"
                        data-testid="input-geofence-radius"
                      />
                      <span className="text-tiny text-muted-foreground">50~2000m</span>
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={createGeofence}
                  disabled={isCreating || !geoName.trim()}
                  data-testid="button-create-geofence"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      생성 중...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      지오펜스 등록
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// 프로파일링 필터 컴포넌트
function ProfilingSection({
  selectedProfiling,
  onProfilingChange,
}: {
  selectedProfiling: AdvancedTargetingState['profiling'];
  onProfilingChange: (profiling: AdvancedTargetingState['profiling']) => void;
}) {
  const [isOpen, setIsOpen] = useState(selectedProfiling.length > 0);

  // 프로파일링 필터 메타 조회
  const { data: proFilterData, isLoading } = useQuery<BizChatFilterResponse>({
    queryKey: ['/api/ats/meta/filter', 'pro'],
    queryFn: async () => {
      const res = await fetch('/api/ats/meta/filter?filterType=pro');
      return res.json();
    },
  });

  const proFilters = proFilterData?.list || [];

  const toggleFilter = (filter: BizChatFilterMeta) => {
    const existingIndex = selectedProfiling.findIndex(p => p.code === filter.code);
    
    if (existingIndex >= 0) {
      // 제거
      onProfilingChange(selectedProfiling.filter((_, i) => i !== existingIndex));
    } else {
      // 추가
      let value: string | { gt: string; lt: string };
      if (filter.dataType === 'boolean') {
        value = 'Y';
      } else if (filter.dataType === 'number') {
        value = { gt: String(filter.min), lt: String(filter.max) };
      } else {
        value = filter.attributes[0]?.val || 'Y';
      }
      
      onProfilingChange([
        ...selectedProfiling,
        {
          code: filter.code,
          value,
          desc: filter.name + (filter.desc ? ` (${filter.desc})` : ''),
        },
      ]);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={cn(selectedProfiling.length > 0 && "border-primary/50")}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-body">프로파일링 (예측 모델)</CardTitle>
                  <CardDescription className="text-small">
                    행동 예측 기반 타겟팅
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedProfiling.length > 0 && (
                  <Badge variant="secondary">{selectedProfiling.length}개 선택</Badge>
                )}
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : proFilters.length === 0 ? (
              <div className="text-center py-6 text-small text-muted-foreground">
                프로파일링 필터를 사용할 수 없습니다
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {proFilters.map((filter) => {
                  const isSelected = selectedProfiling.some(p => p.code === filter.code);
                  return (
                    <Label
                      key={filter.code}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                      data-testid={`profiling-${filter.code}`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleFilter(filter)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-small">{filter.name}</div>
                        {filter.desc && (
                          <div className="text-tiny text-muted-foreground">{filter.desc}</div>
                        )}
                      </div>
                    </Label>
                  );
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// 캐시 타입 정의
interface EstimateCache {
  key: string;
  result: {
    estimatedCount: number;
    sndMosuQuery?: string;
    sndMosuDesc?: string;
  };
  timestamp: number;
}

// 캐시 유효 시간 (5분)
const CACHE_TTL_MS = 5 * 60 * 1000;

export default function TargetingAdvanced({
  targeting,
  onTargetingChange,
  basicTargeting,
}: TargetingAdvancedProps) {
  const [estimatedCount, setEstimatedCount] = useState<number>(0);
  const [isEstimating, setIsEstimating] = useState(false);
  
  // 캐시 저장용 ref (리렌더링 방지)
  const cacheRef = useRef<EstimateCache | null>(null);

  // 타겟팅 모드 (기본값: ATS)
  const currentMode = targeting?.targetingMode || 'ats';

  // 모드 변경 핸들러 (모든 필드 명시적 초기화)
  const handleModeChange = useCallback((newMode: TargetingMode) => {
    if (newMode === currentMode) return;
    
    if (newMode === 'maptics') {
      // Maptics 모드로 전환: ATS 필터 초기화, 지오펜스 유지
      onTargetingChange({
        targetingMode: 'maptics',
        shopping11stCategories: [],
        webappCategories: [],
        callCategories: [],
        locations: [],
        profiling: [],
        geofences: targeting?.geofences ?? [],
      });
    } else {
      // ATS 모드로 전환: 지오펜스 초기화, ATS 필터 유지
      onTargetingChange({
        targetingMode: 'ats',
        shopping11stCategories: targeting?.shopping11stCategories ?? [],
        webappCategories: targeting?.webappCategories ?? [],
        callCategories: targeting?.callCategories ?? [],
        locations: targeting?.locations ?? [],
        profiling: targeting?.profiling ?? [],
        geofences: [],
      });
    }
  }, [currentMode, targeting, onTargetingChange]);

  useEffect(() => {
    const estimateAudience = async () => {
      // Maptics 모드에서는 ATS estimate API를 호출하지 않음 (모드 전환 버그 방지)
      if (currentMode === 'maptics') {
        console.log('[TargetingAdvanced] Maptics mode - skipping ATS estimate API');
        // Maptics 모드에서는 지오펜스 개수 기반으로 간단히 추정
        const geofenceCount = targeting?.geofences?.length ?? 0;
        setEstimatedCount(geofenceCount > 0 ? geofenceCount * 50000 : 0);
        setIsEstimating(false);
        return;
      }
      
      // 캐시 키 생성 (타겟팅 조건 기반)
      const cacheKey = JSON.stringify({
        basicTargeting,
        shopping11stCategories: targeting?.shopping11stCategories ?? [],
        webappCategories: targeting?.webappCategories ?? [],
        callCategories: targeting?.callCategories ?? [],
        locations: targeting?.locations ?? [],
        profiling: targeting?.profiling ?? [],
      });
      
      // 캐시 확인: 유효한 캐시가 있으면 API 호출 스킵
      const now = Date.now();
      if (cacheRef.current && 
          cacheRef.current.key === cacheKey && 
          (now - cacheRef.current.timestamp) < CACHE_TTL_MS) {
        console.log('[TargetingAdvanced] Using cached estimate:', cacheRef.current.result.estimatedCount);
        setEstimatedCount(cacheRef.current.result.estimatedCount);
        setIsEstimating(false);
        return;
      }
      
      setIsEstimating(true);
      try {
        // ATS 모드에서만 BizChat ATS mosu API 호출
        const estimatePayload = {
          ...basicTargeting,
          targetingMode: 'ats',
          shopping11stCategories: targeting?.shopping11stCategories ?? [],
          webappCategories: targeting?.webappCategories ?? [],
          callCategories: targeting?.callCategories ?? [],
          locations: targeting?.locations ?? [],
          profiling: targeting?.profiling ?? [],
        };
        
        const res = await apiRequest("POST", "/api/targeting/estimate", estimatePayload);
        const data = await res.json();
        setEstimatedCount(data.estimatedCount || 0);
        
        // 캐시에 결과 저장
        cacheRef.current = {
          key: cacheKey,
          result: {
            estimatedCount: data.estimatedCount || 0,
            sndMosuQuery: data.sndMosuQuery || data.query || '',
            sndMosuDesc: data.sndMosuDesc || data.description || '',
          },
          timestamp: Date.now(),
        };
        console.log('[TargetingAdvanced] Cached estimate result:', data.estimatedCount);
        
        // ATS 모드일 때 모수 정보를 부모에게 전달 (캠페인 저장에 필요)
        // 중요: targetingMode를 명시적으로 포함하여 모드 리셋 방지
        if (data.estimatedCount > 0) {
          onTargetingChange({
            ...targeting,
            targetingMode: 'ats',  // 명시적으로 현재 모드 유지
            sndMosu: data.estimatedCount,
            sndMosuQuery: data.sndMosuQuery || data.query || '',
            sndMosuDesc: data.sndMosuDesc || data.description || '',
          });
        }
      } catch (error) {
        console.error("Failed to estimate audience:", error);
      } finally {
        setIsEstimating(false);
      }
    };

    // 디바운스 시간 1000ms로 증가 (성능 최적화 - 빠른 연속 변경 시 불필요한 API 호출 방지)
    const debounce = setTimeout(estimateAudience, 1000);
    return () => clearTimeout(debounce);
  }, [targeting?.shopping11stCategories, targeting?.webappCategories, targeting?.callCategories, targeting?.locations, targeting?.profiling, targeting?.geofences, basicTargeting, currentMode]);

  // ATS 필터 개수
  const atsFilterCount =
    (targeting?.shopping11stCategories?.length ?? 0) +
    (targeting?.webappCategories?.length ?? 0) +
    (targeting?.callCategories?.length ?? 0) +
    (targeting?.locations?.length ?? 0) +
    (targeting?.profiling?.length ?? 0);

  // 지오펜스 개수
  const geofenceCount = targeting?.geofences?.length ?? 0;

  // 안전하게 배열 길이 확인 (undefined 방지)
  const hasAdvancedFilters = atsFilterCount > 0 || geofenceCount > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            고급 타겟팅 (SK CoreTarget)
          </h3>
          <p className="text-small text-muted-foreground mt-1">
            SKT 빅데이터 기반 정밀 타겟팅으로 광고 효과를 높여보세요
          </p>
        </div>
        <div className="text-right">
          <div className="text-small text-muted-foreground">예상 타겟</div>
          <div className="text-h3 font-bold text-primary" data-testid="text-advanced-estimated">
            {isEstimating ? (
              <Loader2 className="h-5 w-5 animate-spin inline" />
            ) : (
              formatNumber(estimatedCount) + "명"
            )}
          </div>
        </div>
      </div>

      {/* 타겟팅 모드 선택 (ATS vs Maptics) */}
      <div className="grid grid-cols-2 gap-3">
        <Card
          className={cn(
            "cursor-pointer transition-all hover-elevate",
            currentMode === 'ats'
              ? "border-primary ring-2 ring-primary/20"
              : "border-border"
          )}
          onClick={() => handleModeChange('ats')}
          data-testid="card-mode-ats"
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                currentMode === 'ats' ? "bg-primary/10" : "bg-muted"
              )}>
                <ShoppingBag className={cn(
                  "h-5 w-5",
                  currentMode === 'ats' ? "text-primary" : "text-muted-foreground"
                )} />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-body">ATS 고급 타겟팅</div>
                <div className="text-tiny text-muted-foreground mt-0.5">
                  쇼핑, 앱 사용, 통화, 위치, 프로파일링
                </div>
                {atsFilterCount > 0 && currentMode === 'ats' && (
                  <Badge variant="secondary" className="mt-2 text-tiny">
                    {atsFilterCount}개 필터 적용
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={cn(
            "cursor-pointer transition-all hover-elevate",
            currentMode === 'maptics'
              ? "border-primary ring-2 ring-primary/20"
              : "border-border"
          )}
          onClick={() => handleModeChange('maptics')}
          data-testid="card-mode-maptics"
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                currentMode === 'maptics' ? "bg-primary/10" : "bg-muted"
              )}>
                <MapPin className={cn(
                  "h-5 w-5",
                  currentMode === 'maptics' ? "text-primary" : "text-muted-foreground"
                )} />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-body">Maptics 지오펜스</div>
                <div className="text-tiny text-muted-foreground mt-0.5">
                  특정 위치 방문자 대상 타겟팅
                </div>
                {geofenceCount > 0 && currentMode === 'maptics' && (
                  <Badge variant="secondary" className="mt-2 text-tiny">
                    {geofenceCount}개 지오펜스
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 모드 변경 시 초기화 알림 */}
      {((currentMode === 'ats' && geofenceCount > 0) || 
        (currentMode === 'maptics' && atsFilterCount > 0)) && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="py-3 px-4">
            <p className="text-small text-amber-800">
              다른 타겟팅 모드로 전환하면 현재 선택이 초기화됩니다.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 현재 모드에 해당하는 필터만 표시 */}
      {((currentMode === 'ats' && atsFilterCount > 0) || 
        (currentMode === 'maptics' && geofenceCount > 0)) && (
        <Card className="bg-accent/30">
          <CardContent className="py-3">
            <div className="flex flex-wrap gap-1.5">
              {/* ATS 모드: ATS 필터 배지만 표시 */}
              {currentMode === 'ats' && (
                <>
                  {(targeting?.shopping11stCategories ?? []).map((cat, i) => (
                    <Badge key={`11st-${i}`} variant="secondary" className="text-tiny">
                      11번가: {cat.cat1Name || cat.cat1}{cat.cat2 && ` > ${cat.cat2Name || cat.cat2}`}{cat.cat3 && ` > ${cat.cat3Name || cat.cat3}`}
                    </Badge>
                  ))}
                  {(targeting?.webappCategories ?? []).map((cat, i) => (
                    <Badge key={`webapp-${i}`} variant="secondary" className="text-tiny">
                      앱: {cat.cat1Name || cat.cat1}{cat.cat2 && ` > ${cat.cat2Name || cat.cat2}`}{cat.cat3 && ` > ${cat.cat3Name || cat.cat3}`}
                    </Badge>
                  ))}
                  {(targeting?.callCategories ?? []).map((cat, i) => (
                    <Badge key={`call-${i}`} variant="secondary" className="text-tiny">
                      통화: {cat.cat1Name || cat.cat1}{cat.cat2 && ` > ${cat.cat2Name || cat.cat2}`}{cat.cat3 && ` > ${cat.cat3Name || cat.cat3}`}
                    </Badge>
                  ))}
                  {(targeting?.locations ?? []).map((loc, i) => (
                    <Badge key={`loc-${i}`} variant="secondary" className="text-tiny">
                      {loc.type === 'home' ? '집' : '직장'}: {loc.name}
                    </Badge>
                  ))}
                  {(targeting?.profiling ?? []).map((pro, i) => (
                    <Badge key={`pro-${i}`} variant="secondary" className="text-tiny">
                      {pro.desc}
                    </Badge>
                  ))}
                </>
              )}
              {/* Maptics 모드: 지오펜스 배지만 표시 */}
              {currentMode === 'maptics' && (targeting?.geofences ?? []).map((geo, i) => (
                <Badge key={`geo-${i}`} variant="secondary" className="text-tiny">
                  지오펜스: {geo.name} ({geo.targets[0]?.radius}m)
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {/* ATS 모드: 쇼핑, 앱, 통화, 위치, 프로파일링 */}
        {currentMode === 'ats' && (
          <>
            <HierarchicalCategorySection
              title="11번가 쇼핑 관심사"
              description="11번가 쇼핑 카테고리 기반 타겟팅"
              icon={ShoppingBag}
              metaType="11st"
              selectedCategories={targeting?.shopping11stCategories ?? []}
              onCategoriesChange={(cats) => 
                onTargetingChange({ ...targeting, shopping11stCategories: cats })
              }
              testIdPrefix="11st"
            />

            <HierarchicalCategorySection
              title="웹/앱 사용 관심사"
              description="자주 사용하는 앱/웹 카테고리 기반 타겟팅"
              icon={Smartphone}
              metaType="webapp"
              selectedCategories={targeting?.webappCategories ?? []}
              onCategoriesChange={(cats) => 
                onTargetingChange({ ...targeting, webappCategories: cats })
              }
              testIdPrefix="webapp"
            />

            <HierarchicalCategorySection
              title="통화 Usage 관심사"
              description="통화 사용 패턴 기반 타겟팅"
              icon={Phone}
              metaType="call"
              selectedCategories={targeting?.callCategories ?? []}
              onCategoriesChange={(cats) => 
                onTargetingChange({ ...targeting, callCategories: cats })
              }
              testIdPrefix="call"
            />

            <LocationSearchSection
              selectedLocations={targeting?.locations ?? []}
              onLocationsChange={(locs) =>
                onTargetingChange({ ...targeting, locations: locs })
              }
            />

            <ProfilingSection
              selectedProfiling={targeting?.profiling ?? []}
              onProfilingChange={(pro) =>
                onTargetingChange({ ...targeting, profiling: pro })
              }
            />
          </>
        )}

        {/* Maptics 모드: 발송 방식 선택 + 지오펜스 */}
        {currentMode === 'maptics' && (
          <>
            {/* 발송 방식 선택 (실시간 vs 모아서) */}
            <Card className="mb-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  발송 방식
                </CardTitle>
                <CardDescription className="text-sm">
                  지오펜스 진입 시 메시지 발송 방식을 선택하세요
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 발송 방식 선택 카드 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* 실시간 보내기 (rcvType=1) */}
                  <div
                    className={cn(
                      "relative p-4 rounded-lg border-2 cursor-pointer transition-all",
                      (targeting?.mapticsSendType ?? 'batch') === 'realtime'
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-muted-foreground/50"
                    )}
                    onClick={() => onTargetingChange({
                      ...targeting,
                      mapticsSendType: 'realtime',
                      rtStartHhmm: targeting?.rtStartHhmm ?? '0900',
                      rtEndHhmm: targeting?.rtEndHhmm ?? '2000',
                      sndDayDiv: targeting?.sndDayDiv ?? 0,
                    })}
                    data-testid="card-maptics-realtime"
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "p-2 rounded-lg",
                        (targeting?.mapticsSendType ?? 'batch') === 'realtime' 
                          ? "bg-primary/10" : "bg-muted"
                      )}>
                        <TrendingUp className={cn(
                          "h-5 w-5",
                          (targeting?.mapticsSendType ?? 'batch') === 'realtime'
                            ? "text-primary" : "text-muted-foreground"
                        )} />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">실시간 보내기</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          지오펜스에 진입하면 즉시 발송
                        </p>
                      </div>
                    </div>
                    {(targeting?.mapticsSendType ?? 'batch') === 'realtime' && (
                      <div className="absolute top-2 right-2">
                        <Badge variant="default" className="text-xs">선택됨</Badge>
                      </div>
                    )}
                  </div>
                  
                  {/* 모아서 보내기 (rcvType=2) */}
                  <div
                    className={cn(
                      "relative p-4 rounded-lg border-2 cursor-pointer transition-all",
                      (targeting?.mapticsSendType ?? 'batch') === 'batch'
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-muted-foreground/50"
                    )}
                    onClick={() => onTargetingChange({
                      ...targeting,
                      mapticsSendType: 'batch',
                      rtStartHhmm: undefined,
                      rtEndHhmm: undefined,
                      sndDayDiv: undefined,
                    })}
                    data-testid="card-maptics-batch"
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "p-2 rounded-lg",
                        (targeting?.mapticsSendType ?? 'batch') === 'batch' 
                          ? "bg-primary/10" : "bg-muted"
                      )}>
                        <Clock className={cn(
                          "h-5 w-5",
                          (targeting?.mapticsSendType ?? 'batch') === 'batch'
                            ? "text-primary" : "text-muted-foreground"
                        )} />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">모아서 보내기</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          수집 후 지정 시간에 일괄 발송
                        </p>
                      </div>
                    </div>
                    {(targeting?.mapticsSendType ?? 'batch') === 'batch' && (
                      <div className="absolute top-2 right-2">
                        <Badge variant="default" className="text-xs">선택됨</Badge>
                      </div>
                    )}
                  </div>
                </div>

                {/* 실시간 보내기 옵션 (rcvType=1 선택 시) */}
                {(targeting?.mapticsSendType ?? 'batch') === 'realtime' && (
                  <div className="pt-4 border-t space-y-4">
                    <div className="text-sm font-medium text-muted-foreground mb-2">
                      실시간 발송 시간대 설정
                    </div>
                    
                    {/* 발송 시간대 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="rtStartHhmm" className="text-sm">
                          발송 시작 시간
                        </Label>
                        <Select
                          value={targeting?.rtStartHhmm ?? '0900'}
                          onValueChange={(val) => onTargetingChange({
                            ...targeting,
                            rtStartHhmm: val,
                          })}
                        >
                          <SelectTrigger data-testid="select-rt-start-time">
                            <SelectValue placeholder="시작 시간" />
                          </SelectTrigger>
                          <SelectContent>
                            {['0900', '0910', '0920', '0930', '0940', '0950',
                              '1000', '1010', '1020', '1030', '1040', '1050',
                              '1100', '1110', '1120', '1130', '1140', '1150',
                              '1200', '1210', '1220', '1230', '1240', '1250',
                              '1300', '1310', '1320', '1330', '1340', '1350',
                              '1400', '1410', '1420', '1430', '1440', '1450',
                              '1500', '1510', '1520', '1530', '1540', '1550',
                              '1600', '1610', '1620', '1630', '1640', '1650',
                              '1700', '1710', '1720', '1730', '1740', '1750',
                              '1800', '1810', '1820', '1830', '1840', '1850',
                              '1900', '1910', '1920', '1930', '1940', '1950'
                            ].map((time) => (
                              <SelectItem key={time} value={time}>
                                {time.slice(0, 2)}:{time.slice(2)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          09:00~19:50
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="rtEndHhmm" className="text-sm">
                          발송 종료 시간
                        </Label>
                        <Select
                          value={targeting?.rtEndHhmm ?? '2000'}
                          onValueChange={(val) => onTargetingChange({
                            ...targeting,
                            rtEndHhmm: val,
                          })}
                        >
                          <SelectTrigger data-testid="select-rt-end-time">
                            <SelectValue placeholder="종료 시간" />
                          </SelectTrigger>
                          <SelectContent>
                            {['0910', '0920', '0930', '0940', '0950',
                              '1000', '1010', '1020', '1030', '1040', '1050',
                              '1100', '1110', '1120', '1130', '1140', '1150',
                              '1200', '1210', '1220', '1230', '1240', '1250',
                              '1300', '1310', '1320', '1330', '1340', '1350',
                              '1400', '1410', '1420', '1430', '1440', '1450',
                              '1500', '1510', '1520', '1530', '1540', '1550',
                              '1600', '1610', '1620', '1630', '1640', '1650',
                              '1700', '1710', '1720', '1730', '1740', '1750',
                              '1800', '1810', '1820', '1830', '1840', '1850',
                              '1900', '1910', '1920', '1930', '1940', '1950', '2000'
                            ].map((time) => (
                              <SelectItem key={time} value={time}>
                                {time.slice(0, 2)}:{time.slice(2)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          09:10~20:00
                        </p>
                      </div>
                    </div>

                    {/* 일 균등 분할 옵션 */}
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">일 균등 분할 발송</Label>
                        <p className="text-xs text-muted-foreground">
                          하루 발송량을 균등하게 분배합니다
                        </p>
                      </div>
                      <Checkbox
                        checked={(targeting?.sndDayDiv ?? 0) === 1}
                        onCheckedChange={(checked) => onTargetingChange({
                          ...targeting,
                          sndDayDiv: checked ? 1 : 0,
                        })}
                        data-testid="checkbox-snd-day-div"
                      />
                    </div>

                    {/* 안내 메시지 */}
                    <div className="flex items-start gap-2 p-3 bg-blue-50 text-blue-700 rounded-lg text-xs">
                      <Target className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium">실시간 발송 안내</p>
                        <p className="mt-1">
                          지오펜스에 진입한 고객에게 설정한 시간대({targeting?.rtStartHhmm?.slice(0,2)}:{targeting?.rtStartHhmm?.slice(2)}~{targeting?.rtEndHhmm?.slice(0,2)}:{targeting?.rtEndHhmm?.slice(2)}) 내에서 즉시 메시지가 발송됩니다.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 모아서 보내기 안내 (rcvType=2 선택 시) */}
                {(targeting?.mapticsSendType ?? 'batch') === 'batch' && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 text-amber-700 rounded-lg text-xs">
                    <Clock className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">모아서 보내기 안내</p>
                      <p className="mt-1">
                        수집 기간 동안 지오펜스에 진입한 고객을 모아서 지정 시간에 일괄 발송합니다. 발송 일시는 캠페인 생성 시 자동 설정됩니다.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <GeofenceSection
              savedGeofences={targeting?.geofences ?? []}
              onGeofencesChange={(geos) =>
                onTargetingChange({ ...targeting, geofences: geos })
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

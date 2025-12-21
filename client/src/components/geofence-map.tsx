import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, ZoomIn, ZoomOut, Locate, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadKakaoMaps } from "@/lib/kakao-maps";

export interface GeofenceMapTarget {
  address: string;
  lat?: string;
  lon?: string;
  radius: number;
}

export interface GeofenceMapItem {
  id: number;
  name: string;
  targets: GeofenceMapTarget[];
}

interface GeofenceMapProps {
  geofences: GeofenceMapItem[];
  selectedGeofenceId?: number | null;
  onGeofenceClick?: (id: number) => void;
  onGeofenceHover?: (id: number | null) => void;
  hoveredGeofenceId?: number | null;
  className?: string;
  showControls?: boolean;
  centerLat?: number;
  centerLng?: number;
  previewTarget?: GeofenceMapTarget | null;
}

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };
const DEFAULT_ZOOM = 11;

export function GeofenceMap({
  geofences,
  selectedGeofenceId,
  onGeofenceClick,
  onGeofenceHover,
  hoveredGeofenceId,
  className,
  showControls = true,
  centerLat,
  centerLng,
  previewTarget,
}: GeofenceMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const circlesRef = useRef<Map<number, kakao.maps.Circle[]>>(new Map());
  const previewCircleRef = useRef<kakao.maps.Circle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const initMap = useCallback(() => {
    if (!mapContainerRef.current || !window.kakao?.maps) return;

    const center = new window.kakao.maps.LatLng(
      centerLat || DEFAULT_CENTER.lat,
      centerLng || DEFAULT_CENTER.lng
    );

    const map = new window.kakao.maps.Map(mapContainerRef.current, {
      center,
      level: DEFAULT_ZOOM,
    });

    mapRef.current = map;
    setMapReady(true);
    setIsLoading(false);
  }, [centerLat, centerLng]);

  useEffect(() => {
    let mounted = true;

    loadKakaoMaps()
      .then(() => {
        if (mounted) {
          initMap();
        }
      })
      .catch((error) => {
        console.error('카카오맵 로드 실패:', error);
        if (mounted) {
          setLoadError(error.message || '지도를 불러오는데 실패했습니다');
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [initMap]);

  const getCircleColor = useCallback((id: number) => {
    const isSelected = selectedGeofenceId === id;
    const isHovered = hoveredGeofenceId === id;
    
    if (isSelected) {
      return { stroke: "#E84040", fill: "#E84040", fillOpacity: 0.35 };
    }
    if (isHovered) {
      return { stroke: "#E84040", fill: "#E84040", fillOpacity: 0.25 };
    }
    return { stroke: "#6B7280", fill: "#6B7280", fillOpacity: 0.15 };
  }, [selectedGeofenceId, hoveredGeofenceId]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    // 기존 원들 모두 제거
    circlesRef.current.forEach((circles) => {
      circles.forEach((circle) => circle.setMap(null));
    });
    circlesRef.current.clear();

    const bounds = new window.kakao.maps.LatLngBounds();
    let hasValidBounds = false;

    geofences.forEach((geo) => {
      const geoCircles: kakao.maps.Circle[] = [];

      geo.targets.forEach((target) => {
        if (!target.lat || !target.lon) return;

        const lat = parseFloat(target.lat);
        const lng = parseFloat(target.lon);
        if (isNaN(lat) || isNaN(lng)) return;

        const position = new window.kakao.maps.LatLng(lat, lng);
        const colors = getCircleColor(geo.id);

        const circle = new window.kakao.maps.Circle({
          center: position,
          radius: target.radius,
          strokeWeight: 2,
          strokeColor: colors.stroke,
          strokeOpacity: 0.8,
          strokeStyle: "solid",
          fillColor: colors.fill,
          fillOpacity: colors.fillOpacity,
          map: mapRef.current!,
        });

        window.kakao.maps.event.addListener(circle, "click", () => {
          onGeofenceClick?.(geo.id);
        });

        window.kakao.maps.event.addListener(circle, "mouseover", () => {
          onGeofenceHover?.(geo.id);
        });

        window.kakao.maps.event.addListener(circle, "mouseout", () => {
          onGeofenceHover?.(null);
        });

        geoCircles.push(circle);
        bounds.extend(circle.getBounds().getSouthWest());
        bounds.extend(circle.getBounds().getNorthEast());
        hasValidBounds = true;
      });

      if (geoCircles.length > 0) {
        circlesRef.current.set(geo.id, geoCircles);
      }
    });

    if (hasValidBounds && geofences.length > 0) {
      mapRef.current.setBounds(bounds, 50, 50, 50, 50);
    }
  }, [geofences, mapReady, getCircleColor, onGeofenceClick, onGeofenceHover]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    circlesRef.current.forEach((circles, id) => {
      const colors = getCircleColor(id);
      circles.forEach((circle) => {
        circle.setOptions({
          strokeColor: colors.stroke,
          fillColor: colors.fill,
          fillOpacity: colors.fillOpacity,
        });
      });
    });
  }, [selectedGeofenceId, hoveredGeofenceId, mapReady, getCircleColor]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    if (previewCircleRef.current) {
      previewCircleRef.current.setMap(null);
      previewCircleRef.current = null;
    }

    if (previewTarget?.lat && previewTarget?.lon) {
      const lat = parseFloat(previewTarget.lat);
      const lng = parseFloat(previewTarget.lon);
      if (isNaN(lat) || isNaN(lng)) return;

      const position = new window.kakao.maps.LatLng(lat, lng);

      const circle = new window.kakao.maps.Circle({
        center: position,
        radius: previewTarget.radius,
        strokeWeight: 3,
        strokeColor: "#E84040",
        strokeOpacity: 1,
        strokeStyle: "dashed",
        fillColor: "#E84040",
        fillOpacity: 0.3,
        map: mapRef.current,
      });

      previewCircleRef.current = circle;

      mapRef.current.setCenter(position);
      const zoomLevel = previewTarget.radius > 1000 ? 6 : previewTarget.radius > 500 ? 5 : 4;
      mapRef.current.setLevel(zoomLevel);
    }

    return () => {
      if (previewCircleRef.current) {
        previewCircleRef.current.setMap(null);
      }
    };
  }, [previewTarget, mapReady]);

  const handleZoomIn = () => {
    if (mapRef.current) {
      const level = mapRef.current.getLevel();
      mapRef.current.setLevel(level - 1, { animate: true });
    }
  };

  const handleZoomOut = () => {
    if (mapRef.current) {
      const level = mapRef.current.getLevel();
      mapRef.current.setLevel(level + 1, { animate: true });
    }
  };

  const handleFitBounds = () => {
    if (!mapRef.current || geofences.length === 0) return;

    const bounds = new window.kakao.maps.LatLngBounds();
    let hasValidBounds = false;

    geofences.forEach((geo) => {
      geo.targets.forEach((target) => {
        if (!target.lat || !target.lon) return;
        const lat = parseFloat(target.lat);
        const lng = parseFloat(target.lon);
        if (isNaN(lat) || isNaN(lng)) return;

        const position = new window.kakao.maps.LatLng(lat, lng);
        const tempCircle = new window.kakao.maps.Circle({
          center: position,
          radius: target.radius,
        });
        bounds.extend(tempCircle.getBounds().getSouthWest());
        bounds.extend(tempCircle.getBounds().getNorthEast());
        hasValidBounds = true;
      });
    });

    if (hasValidBounds) {
      mapRef.current.setBounds(bounds, 50, 50, 50, 50);
    }
  };

  return (
    <div className={cn("relative rounded-lg overflow-hidden border", className)}>
      <div
        ref={mapContainerRef}
        className="w-full h-full min-h-[300px]"
        data-testid="geofence-map-container"
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">지도 로딩 중...</span>
          </div>
        </div>
      )}

      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
          <div className="flex flex-col items-center gap-2 text-center px-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <span className="text-sm text-destructive font-medium">지도 로드 실패</span>
            <span className="text-xs text-muted-foreground">{loadError}</span>
          </div>
        </div>
      )}

      {showControls && mapReady && (
        <div className="absolute top-3 right-3 flex flex-col gap-1">
          <Button
            size="icon"
            variant="secondary"
            onClick={handleZoomIn}
            className="h-8 w-8 bg-background/90 backdrop-blur-sm shadow-sm"
            data-testid="button-map-zoom-in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            onClick={handleZoomOut}
            className="h-8 w-8 bg-background/90 backdrop-blur-sm shadow-sm"
            data-testid="button-map-zoom-out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          {geofences.length > 0 && (
            <Button
              size="icon"
              variant="secondary"
              onClick={handleFitBounds}
              className="h-8 w-8 bg-background/90 backdrop-blur-sm shadow-sm"
              data-testid="button-map-fit-bounds"
            >
              <Locate className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {geofences.length === 0 && !previewTarget && mapReady && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-background/80 backdrop-blur-sm rounded-lg px-4 py-3 text-center">
            <p className="text-sm text-muted-foreground">
              지오펜스를 추가하면 지도에 표시됩니다
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

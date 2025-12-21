// Kakao Maps SDK TypeScript Definitions
declare namespace kakao {
  namespace maps {
    class LatLng {
      constructor(lat: number, lng: number);
      getLat(): number;
      getLng(): number;
    }

    class LatLngBounds {
      constructor(sw?: LatLng, ne?: LatLng);
      extend(latlng: LatLng): void;
      getSouthWest(): LatLng;
      getNorthEast(): LatLng;
    }

    class Map {
      constructor(container: HTMLElement, options: MapOptions);
      setCenter(latlng: LatLng): void;
      getCenter(): LatLng;
      setLevel(level: number, options?: { animate?: boolean }): void;
      getLevel(): number;
      setBounds(bounds: LatLngBounds, paddingTop?: number, paddingRight?: number, paddingBottom?: number, paddingLeft?: number): void;
      getBounds(): LatLngBounds;
      relayout(): void;
      addControl(control: any, position: ControlPosition): void;
    }

    interface MapOptions {
      center: LatLng;
      level?: number;
      mapTypeId?: MapTypeId;
      draggable?: boolean;
      scrollwheel?: boolean;
      disableDoubleClick?: boolean;
      disableDoubleClickZoom?: boolean;
    }

    enum MapTypeId {
      ROADMAP = 1,
      SKYVIEW = 2,
      HYBRID = 3,
    }

    enum ControlPosition {
      TOP = 0,
      TOPLEFT = 1,
      TOPRIGHT = 2,
      BOTTOM = 3,
      BOTTOMLEFT = 4,
      BOTTOMRIGHT = 5,
      LEFT = 6,
      RIGHT = 7,
    }

    class ZoomControl {
      constructor();
    }

    class MapTypeControl {
      constructor();
    }

    class Circle {
      constructor(options: CircleOptions);
      setMap(map: Map | null): void;
      setOptions(options: Partial<CircleOptions>): void;
      getPosition(): LatLng;
      getRadius(): number;
      getBounds(): LatLngBounds;
    }

    interface CircleOptions {
      center: LatLng;
      radius: number;
      strokeWeight?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeStyle?: string;
      fillColor?: string;
      fillOpacity?: number;
      map?: Map;
    }

    class Polygon {
      constructor(options: PolygonOptions);
      setMap(map: Map | null): void;
      setOptions(options: Partial<PolygonOptions>): void;
      getPath(): LatLng[];
      getBounds(): LatLngBounds;
    }

    interface PolygonOptions {
      path: LatLng[];
      strokeWeight?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeStyle?: string;
      fillColor?: string;
      fillOpacity?: number;
      map?: Map;
    }

    class Marker {
      constructor(options: MarkerOptions);
      setMap(map: Map | null): void;
      getPosition(): LatLng;
      setPosition(position: LatLng): void;
    }

    interface MarkerOptions {
      position: LatLng;
      map?: Map;
      image?: MarkerImage;
      title?: string;
      draggable?: boolean;
      clickable?: boolean;
      zIndex?: number;
    }

    class MarkerImage {
      constructor(src: string, size: Size, options?: MarkerImageOptions);
    }

    interface MarkerImageOptions {
      alt?: string;
      coords?: string;
      offset?: Point;
      shape?: string;
      spriteOrigin?: Point;
      spriteSize?: Size;
    }

    class Size {
      constructor(width: number, height: number);
    }

    class Point {
      constructor(x: number, y: number);
    }

    class InfoWindow {
      constructor(options: InfoWindowOptions);
      open(map: Map, marker?: Marker): void;
      close(): void;
      setContent(content: string | HTMLElement): void;
      getContent(): string | HTMLElement;
      setPosition(position: LatLng): void;
      getPosition(): LatLng;
      setMap(map: Map | null): void;
    }

    interface InfoWindowOptions {
      content?: string | HTMLElement;
      position?: LatLng;
      removable?: boolean;
      disableAutoPan?: boolean;
      map?: Map;
    }

    class CustomOverlay {
      constructor(options: CustomOverlayOptions);
      setMap(map: Map | null): void;
      getMap(): Map | null;
      setPosition(position: LatLng): void;
      getPosition(): LatLng;
      setContent(content: string | HTMLElement): void;
      getContent(): string | HTMLElement;
      setVisible(visible: boolean): void;
      getVisible(): boolean;
      setZIndex(zIndex: number): void;
      getZIndex(): number;
    }

    interface CustomOverlayOptions {
      content?: string | HTMLElement;
      position?: LatLng;
      map?: Map;
      clickable?: boolean;
      xAnchor?: number;
      yAnchor?: number;
      zIndex?: number;
    }

    namespace event {
      function addListener(
        target: Map | Marker | Circle | Polygon | InfoWindow | CustomOverlay,
        type: string,
        callback: (...args: any[]) => void
      ): void;
      function removeListener(
        target: Map | Marker | Circle | Polygon | InfoWindow | CustomOverlay,
        type: string,
        callback: (...args: any[]) => void
      ): void;
    }

    namespace services {
      class Geocoder {
        constructor();
        addressSearch(
          address: string,
          callback: (result: GeocoderResult[], status: Status) => void
        ): void;
        coord2Address(
          lng: number,
          lat: number,
          callback: (result: Coord2AddressResult[], status: Status) => void
        ): void;
        coord2RegionCode(
          lng: number,
          lat: number,
          callback: (result: RegionCodeResult[], status: Status) => void
        ): void;
      }

      interface GeocoderResult {
        address_name: string;
        address_type: string;
        x: string;
        y: string;
        address?: {
          address_name: string;
          region_1depth_name: string;
          region_2depth_name: string;
          region_3depth_name: string;
          mountain_yn: string;
          main_address_no: string;
          sub_address_no: string;
        };
        road_address?: {
          address_name: string;
          region_1depth_name: string;
          region_2depth_name: string;
          region_3depth_name: string;
          road_name: string;
          underground_yn: string;
          main_building_no: string;
          sub_building_no: string;
          building_name: string;
          zone_no: string;
        };
      }

      interface Coord2AddressResult {
        address: {
          address_name: string;
          region_1depth_name: string;
          region_2depth_name: string;
          region_3depth_name: string;
          mountain_yn: string;
          main_address_no: string;
          sub_address_no: string;
        };
        road_address: {
          address_name: string;
          region_1depth_name: string;
          region_2depth_name: string;
          region_3depth_name: string;
          road_name: string;
          underground_yn: string;
          main_building_no: string;
          sub_building_no: string;
          building_name: string;
          zone_no: string;
        } | null;
      }

      interface RegionCodeResult {
        region_type: string;
        address_name: string;
        region_1depth_name: string;
        region_2depth_name: string;
        region_3depth_name: string;
        region_4depth_name: string;
        code: string;
        x: number;
        y: number;
      }

      class Places {
        constructor(map?: Map);
        keywordSearch(
          keyword: string,
          callback: (result: PlacesSearchResult[], status: Status, pagination: Pagination) => void,
          options?: PlacesSearchOptions
        ): void;
        categorySearch(
          code: string,
          callback: (result: PlacesSearchResult[], status: Status, pagination: Pagination) => void,
          options?: PlacesSearchOptions
        ): void;
      }

      interface PlacesSearchResult {
        id: string;
        place_name: string;
        category_name: string;
        category_group_code: string;
        category_group_name: string;
        phone: string;
        address_name: string;
        road_address_name: string;
        x: string;
        y: string;
        place_url: string;
        distance: string;
      }

      interface PlacesSearchOptions {
        location?: LatLng;
        bounds?: LatLngBounds;
        radius?: number;
        rect?: string;
        size?: number;
        page?: number;
        sort?: string;
        category_group_code?: string;
        useMapBounds?: boolean;
        useMapCenter?: boolean;
      }

      interface Pagination {
        totalCount: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
        current: number;
        first: number;
        last: number;
        gotoPage(page: number): void;
        nextPage(): void;
        prevPage(): void;
      }

      enum Status {
        OK = 'OK',
        ZERO_RESULT = 'ZERO_RESULT',
        ERROR = 'ERROR',
      }
    }

    function load(callback: () => void): void;
  }
}

interface Window {
  kakao: typeof kakao;
}

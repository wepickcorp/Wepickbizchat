let isLoading = false;
let isLoaded = false;
let loadPromise: Promise<void> | null = null;

export function loadKakaoMaps(): Promise<void> {
  if (isLoaded && window.kakao?.maps) {
    return Promise.resolve();
  }

  if (loadPromise) {
    return loadPromise;
  }

  const apiKey = import.meta.env.VITE_KAKAO_MAP_KEY;
  if (!apiKey) {
    return Promise.reject(new Error('VITE_KAKAO_MAP_KEY 환경변수가 설정되지 않았습니다'));
  }

  isLoading = true;

  loadPromise = new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      isLoaded = true;
      isLoading = false;
      window.kakao.maps.load(() => {
        resolve();
      });
      return;
    }

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&libraries=services,drawing&autoload=false`;
    script.async = true;

    script.onload = () => {
      if (window.kakao?.maps) {
        window.kakao.maps.load(() => {
          isLoaded = true;
          isLoading = false;
          resolve();
        });
      } else {
        isLoading = false;
        reject(new Error('카카오맵 SDK 로드 실패'));
      }
    };

    script.onerror = () => {
      isLoading = false;
      loadPromise = null;
      reject(new Error('카카오맵 스크립트 로드 실패'));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}

export function isKakaoMapsLoaded(): boolean {
  return isLoaded && !!window.kakao?.maps;
}

export function isKakaoMapsLoading(): boolean {
  return isLoading;
}

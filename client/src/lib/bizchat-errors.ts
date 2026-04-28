export interface BizChatErrorInfo {
  code: string;
  title: string;
  cause: string;
  solution: string;
}

const ERROR_MAP: Record<string, Omit<BizChatErrorInfo, "code">> = {
  E000001: {
    title: "BizChat 서버 오류",
    cause: "BizChat 서버에서 처리 중 알 수 없는 오류가 발생했어요.",
    solution: "잠시 후 다시 시도해주세요. 계속 발생하면 고객센터로 문의 부탁드려요.",
  },
  E000002: {
    title: "잘못된 요청",
    cause: "BizChat에 보낸 요청 정보가 올바르지 않아요. 메시지 제목이 30자를 넘거나 필수 항목이 비어있을 수 있어요.",
    solution: "메시지 제목을 30자 이내로 줄이고, 본문·이미지·발신번호가 모두 입력되었는지 확인 후 다시 시도해주세요.",
  },
  E000003: {
    title: "파일 처리 실패",
    cause: "이미지 또는 첨부 파일을 처리하는 데 실패했어요.",
    solution: "이미지 파일 크기와 형식(JPG/PNG, 1MB 이하)을 확인하고 다시 업로드해주세요.",
  },
  E000004: {
    title: "잘못된 발신번호",
    cause: "선택한 발신번호가 BizChat에 등록되어 있지 않거나 올바르지 않아요.",
    solution: "발신번호 관리 화면에서 등록된 번호를 다시 선택해주세요.",
  },
  E000005: {
    title: "데이터를 찾을 수 없음",
    cause: "요청한 캠페인 또는 데이터가 BizChat에 존재하지 않아요.",
    solution: "캠페인을 새로 저장한 뒤 다시 승인요청을 시도해주세요.",
  },
  E000006: {
    title: "BizChat 서버 오류",
    cause: "BizChat 서버에서 일시적인 오류가 발생했어요.",
    solution: "잠시 후 다시 시도해주세요.",
  },
  E000007: {
    title: "BizChat 서버 오류",
    cause: "BizChat 서버에서 일시적인 오류가 발생했어요.",
    solution: "잠시 후 다시 시도해주세요.",
  },
  E000100: {
    title: "비밀번호 입력 횟수 초과",
    cause: "BizChat 인증에 여러 번 실패해 잠시 차단되었어요.",
    solution: "잠시 후 다시 시도하거나 고객센터로 문의 부탁드려요.",
  },
  E000101: {
    title: "잘못된 비밀번호",
    cause: "BizChat 인증 정보가 올바르지 않아요.",
    solution: "관리자에게 BizChat 연동 설정 확인을 요청해주세요.",
  },
  E000104: {
    title: "세션 만료",
    cause: "BizChat 인증 세션이 만료되었어요.",
    solution: "잠시 후 다시 시도해주세요. 계속되면 다시 로그인해주세요.",
  },
  E000106: {
    title: "권한 없음",
    cause: "이 작업을 수행할 BizChat 권한이 없어요.",
    solution: "고객센터로 문의 부탁드려요.",
  },
  // ATS / Maptics
  E001000: {
    title: "타겟팅 데이터 호출 실패",
    cause: "11번가 타겟 데이터를 불러오지 못했어요.",
    solution: "잠시 후 다시 시도해주세요.",
  },
  E001001: {
    title: "타겟팅 데이터 호출 실패",
    cause: "웹/앱 사용 데이터를 불러오지 못했어요.",
    solution: "잠시 후 다시 시도해주세요.",
  },
  E001002: {
    title: "타겟팅 데이터 호출 실패",
    cause: "통화 사용 데이터를 불러오지 못했어요.",
    solution: "잠시 후 다시 시도해주세요.",
  },
  E001003: {
    title: "타겟팅 데이터 호출 실패",
    cause: "위치/이동 데이터를 불러오지 못했어요.",
    solution: "잠시 후 다시 시도해주세요.",
  },
  E001004: {
    title: "타겟팅 필터 조회 실패",
    cause: "타겟팅 필터 정보를 불러오지 못했어요.",
    solution: "잠시 후 다시 시도해주세요.",
  },
  E001005: {
    title: "발송 모수 확인 실패",
    cause: "선택한 타겟팅 조건의 발송 가능 모수를 확인하지 못했어요.",
    solution: "타겟팅 조건을 조정한 뒤 다시 시도해주세요.",
  },
  E001006: {
    title: "타겟 번호 획득 실패",
    cause: "타겟팅 조건에 맞는 발송 대상을 가져오지 못했어요.",
    solution: "타겟팅 조건을 조정해보거나 잠시 후 다시 시도해주세요.",
  },
  E001100: {
    title: "지오펜스 위치 검색 실패",
    cause: "지도 위치 정보를 불러오지 못했어요.",
    solution: "주소를 다시 검색하거나 다른 위치를 선택해주세요.",
  },
  E001101: {
    title: "지오펜스 생성 실패",
    cause: "지오펜스(위치 타겟팅) 생성에 실패했어요.",
    solution: "지오펜스 반경/주소를 확인하고 다시 시도해주세요.",
  },
  E001102: {
    title: "지오펜스 수정 실패",
    cause: "지오펜스 수정에 실패했어요.",
    solution: "지오펜스를 다시 만들어 시도해주세요.",
  },
  E001103: {
    title: "지오펜스 삭제 실패",
    cause: "지오펜스 삭제에 실패했어요.",
    solution: "잠시 후 다시 시도해주세요.",
  },
  // 캠페인 관련
  E100001: {
    title: "잘못된 발송 모수 값",
    cause: "발송 목표 인원(sndMosu) 값이 BizChat에서 허용되는 범위를 벗어났어요.",
    solution: "타겟팅 조건과 예산을 조정해 발송 인원을 다시 설정해주세요.",
  },
  E100002: {
    title: "잘못된 발송 목표 수",
    cause: "발송 목표 건수(sndGoalCnt) 값이 올바르지 않아요.",
    solution: "예산과 메시지 단가에 맞게 발송 건수를 다시 입력해주세요.",
  },
  E100003: {
    title: "잘못된 발신번호",
    cause: "선택한 발신번호가 BizChat에 등록되어 있지 않거나 사용할 수 없어요.",
    solution: "발신번호 관리에서 다른 번호를 선택해주세요.",
  },
  E100004: {
    title: "직접 지정 방식 미지원",
    cause: "MDN 직접 지정 방식이 지원되지 않는 캠페인 유형이에요.",
    solution: "타겟팅 방식을 변경해주세요.",
  },
  E100005: {
    title: "LMS/MMS 본문 길이 초과",
    cause: "LMS/MMS 메시지 본문이 허용되는 글자 수(2000자)를 초과했어요.",
    solution: "메시지 본문을 줄여서 다시 저장해주세요.",
  },
  E100006: {
    title: "RCS 본문 길이 초과",
    cause: "RCS 메시지 본문이 허용되는 글자 수(2700자)를 초과했어요.",
    solution: "메시지 본문을 줄여서 다시 저장해주세요.",
  },
  E100007: {
    title: "잘못된 캠페인 시작 날짜",
    cause: "캠페인 시작 날짜가 올바르지 않아요.",
    solution: "발송일을 현재 시각 이후로 다시 설정해주세요.",
  },
  E100008: {
    title: "MDN 파일 없음",
    cause: "타겟 발송 대상 파일이 없어요.",
    solution: "타겟팅을 다시 설정해주세요.",
  },
  E100009: {
    title: "잘못된 컨텐츠 형식",
    cause: "메시지 컨텐츠 형식이 올바르지 않아요.",
    solution: "메시지 유형(LMS/MMS/RCS)에 맞는 내용을 다시 확인해주세요.",
  },
  E100010: {
    title: "잘못된 발송 조건",
    cause: "발송 모수 조건(sndMosuQuery)이 올바르지 않아요.",
    solution: "타겟팅 조건을 다시 확인해주세요.",
  },
  E100011: {
    title: "잘못된 발송 조건 설명",
    cause: "발송 모수 설명(sndMosuDesc)이 올바르지 않아요.",
    solution: "타겟팅 조건을 다시 설정해주세요.",
  },
  E100012: {
    title: "잘못된 지오펜스",
    cause: "선택한 지오펜스 ID가 올바르지 않거나 사용할 수 없어요.",
    solution: "지도에서 지오펜스를 다시 설정해주세요.",
  },
  E100015: {
    title: "수집 일시 오류",
    cause: "데이터 수집 시작/종료 일시가 발송 시간대와 맞지 않아요.",
    solution: "발송 시간대를 다시 설정한 뒤 시도해주세요.",
  },
  E100017: {
    title: "잘못된 RCS 타입",
    cause: "RCS 메시지 타입이 올바르지 않아요.",
    solution: "메시지 유형을 다시 선택해주세요.",
  },
  E100018: {
    title: "잘못된 슬라이드 개수",
    cause: "RCS 슬라이드 개수가 RCS 타입과 맞지 않아요.",
    solution: "메시지를 다시 저장한 뒤 시도해주세요.",
  },
  E100022: {
    title: "수정 불가능한 상태",
    cause: "현재 상태에서는 캠페인을 수정할 수 없어요.",
    solution: "캠페인 목록에서 상태를 확인해주세요.",
  },
  E100024: {
    title: "취소/중단 불가능한 상태",
    cause: "현재 상태에서는 캠페인을 취소하거나 중단할 수 없어요.",
    solution: "캠페인 상태를 확인해주세요.",
  },
  E100030: {
    title: "잘못된 쿠폰 파일",
    cause: "랜덤 쿠폰 파일이 올바르지 않아요.",
    solution: "쿠폰 파일 형식을 확인하고 다시 업로드해주세요.",
  },
  E100031: {
    title: "발송 모수 부족",
    cause: "발송 가능 인원이 목표 건수의 150%에 미치지 못해요.",
    solution: "타겟팅 조건을 넓히거나 발송 건수를 줄여주세요.",
  },
  E100032: {
    title: "고객사명 없음",
    cause: "발송 메시지에 표시할 고객사명이 비어있어요.",
    solution: "프로필에서 고객사명을 등록한 뒤 다시 시도해주세요.",
  },
  E100033: {
    title: "수신거부 번호 없음",
    cause: "수신거부 안내 번호(adverDeny)가 비어있어요.",
    solution: "관리자에게 수신거부 번호 설정을 요청해주세요.",
  },
  E100037: {
    title: "URL 분석 정보 누락",
    cause: "메시지 본문의 [URL분석] 플레이스홀더에 대응하는 URL이 비어있어요.",
    solution: "URL 링크를 모두 입력했는지 확인 후 다시 저장해주세요.",
  },
  E100038: {
    title: "RCS 옵션 누락",
    cause: "RCS 메시지 옵션 정보가 누락되었어요.",
    solution: "메시지를 다시 저장한 뒤 시도해주세요.",
  },
  E002000: {
    title: "AI 서비스 연동 실패",
    cause: "AI 광고 카피 생성 서비스 연동에 실패했어요.",
    solution: "잠시 후 다시 시도해주세요.",
  },
  E002001: {
    title: "고언연 검수 연동 실패",
    cause: "고언연(광고 사전심의) 연동에 실패했어요.",
    solution: "잠시 후 다시 시도해주세요.",
  },
};

/**
 * BizChat 에러 코드를 사용자 친화적 안내 정보로 변환
 */
export function getBizChatErrorInfo(code: string | undefined | null): BizChatErrorInfo {
  if (code && ERROR_MAP[code]) {
    return { code, ...ERROR_MAP[code] };
  }
  return {
    code: code || "UNKNOWN",
    title: "알 수 없는 오류",
    cause: "처리 중 알 수 없는 오류가 발생했어요.",
    solution: "잠시 후 다시 시도하거나 문제가 계속되면 고객센터로 문의 부탁드려요.",
  };
}

/**
 * apiRequest가 던지는 Error("400: {body}") 형태에서
 * BizChat 에러 정보를 추출
 */
export function parseBizChatError(error: unknown): {
  info: BizChatErrorInfo;
  rawMessage: string;
} {
  const rawMessage = error instanceof Error ? error.message : String(error);

  // "400: {json}" 또는 "500: text" 형태에서 본문 분리
  const colonIdx = rawMessage.indexOf(": ");
  const body = colonIdx > 0 ? rawMessage.substring(colonIdx + 2) : rawMessage;

  let bizchatCode: string | undefined;
  let serverError: string | undefined;
  try {
    const parsed = JSON.parse(body);
    bizchatCode = parsed.bizchatCode || parsed.response?.code || parsed.code;
    serverError = parsed.error;
  } catch {
    // 본문이 JSON이 아니면 정규식으로 BizChat 코드 추출 시도
    const match = body.match(/E\d{6}/);
    if (match) bizchatCode = match[0];
  }

  const info = getBizChatErrorInfo(bizchatCode);
  // BizChat 코드가 없는데 서버에서 한국어 에러 메시지를 보낸 경우엔 그 메시지를 cause로 사용
  if (!bizchatCode && serverError) {
    return {
      info: {
        code: "SERVER",
        title: "요청 처리 실패",
        cause: serverError,
        solution: "메시지/타겟팅/예산 정보를 확인 후 다시 시도해주세요.",
      },
      rawMessage,
    };
  }
  return { info, rawMessage };
}

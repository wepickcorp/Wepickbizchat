export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

export const CAMPAIGN_STATUS = {
  TEMP_REGISTERED: 0,
  INSPECTION_REQUESTED: 1,
  INSPECTION_COMPLETED: 2,
  APPROVAL_REQUESTED: 10,
  APPROVED: 11,
  REJECTED: 17,
  SEND_PREPARATION: 20,
  IN_PROGRESS: 30,
  COMPLETED: 40,
  STOPPED: 35,
  CANCELLED: 25,
} as const;

// 삭제 가능 상태 (BizChat API 규격)
// BizChat: isTmp=1 또는 state=0 (임시등록)
export const DELETABLE_STATUS_CODES = [0];

// 취소 가능 상태 (BizChat API 규격)
// BizChat: 검수요청(1), 검수완료(2), 승인요청(10), 승인완료(11), 반려(17), 발송준비(20)
// 참고: 임시등록(0)은 '취소'가 아닌 '삭제' 대상
export const CANCELLABLE_STATUS_CODES = [1, 2, 10, 11, 17, 20];

// 중단 가능 상태: 발송중(30)
export const STOPPABLE_STATUS_CODES = [30];

export function getStatusCodeLabel(statusCode: number): string {
  const labels: Record<number, string> = {
    [CAMPAIGN_STATUS.TEMP_REGISTERED]: '임시등록',
    [CAMPAIGN_STATUS.INSPECTION_REQUESTED]: '검수요청',
    [CAMPAIGN_STATUS.INSPECTION_COMPLETED]: '검수완료',
    [CAMPAIGN_STATUS.APPROVAL_REQUESTED]: '승인 대기',
    [CAMPAIGN_STATUS.APPROVED]: '발송 대기',
    [CAMPAIGN_STATUS.REJECTED]: '반려됨',
    [CAMPAIGN_STATUS.SEND_PREPARATION]: '발송 준비중',
    [CAMPAIGN_STATUS.IN_PROGRESS]: '발송 중',
    [CAMPAIGN_STATUS.COMPLETED]: '발송 완료',
    [CAMPAIGN_STATUS.CANCELLED]: '취소됨',
    [CAMPAIGN_STATUS.STOPPED]: '발송 중단',
  };
  return labels[statusCode] || `상태 ${statusCode}`;
}

export function getStatusCodeStyles(statusCode: number): string {
  if (statusCode === CAMPAIGN_STATUS.TEMP_REGISTERED) {
    return 'bg-muted text-muted-foreground border-muted-border';
  }
  if (statusCode === CAMPAIGN_STATUS.APPROVAL_REQUESTED) {
    return 'bg-warning/10 text-warning border-warning/20';
  }
  if (statusCode === CAMPAIGN_STATUS.APPROVED) {
    return 'bg-success/10 text-success border-success/20';
  }
  if (statusCode === CAMPAIGN_STATUS.REJECTED) {
    return 'bg-destructive/10 text-destructive border-destructive/20';
  }
  if (statusCode === CAMPAIGN_STATUS.SEND_PREPARATION) {
    return 'bg-accent text-accent-foreground border-accent-border';
  }
  if (statusCode === CAMPAIGN_STATUS.CANCELLED) {
    return 'bg-muted text-muted-foreground border-muted-border';
  }
  if (statusCode === CAMPAIGN_STATUS.IN_PROGRESS) {
    return 'bg-primary/10 text-primary border-primary/20';
  }
  if (statusCode === CAMPAIGN_STATUS.STOPPED) {
    return 'bg-destructive/10 text-destructive border-destructive/20';
  }
  if (statusCode === CAMPAIGN_STATUS.COMPLETED) {
    return 'bg-success/10 text-success border-success/20';
  }
  return 'bg-muted text-muted-foreground border-muted-border';
}

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatNumber(num: number | string): string {
  const n = typeof num === 'string' ? parseFloat(num) : num;
  return new Intl.NumberFormat('ko-KR').format(n);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: '임시등록',
    temp_registered: '임시등록',
    approval_requested: '승인 대기',
    pending: '승인 대기',
    approved: '승인 완료',
    running: '발송 중',
    completed: '완료',
    stopped: '발송 중단',
    rejected: '반려',
    cancelled: '취소',
  };
  return labels[status] || status;
}

export function getMessageTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    LMS: '장문 문자 (LMS)',
    MMS: '이미지 문자 (MMS)',
    RCS: 'RCS 메시지',
  };
  return labels[type] || type;
}

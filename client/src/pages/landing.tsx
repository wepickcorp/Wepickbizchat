import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BarChart3,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileCheck2,
  HeartPulse,
  MapPin,
  Menu,
  MessageSquare,
  MousePointerClick,
  Phone,
  ShieldCheck,
  Store,
  Target,
  X,
  Zap,
} from "lucide-react";
import logoImage from "@assets/logo_optimized.png";

const MAIN_ORANGE = "#F05A1A";
const DARK_BROWN = "#1C0D00";
const WARM_CREAM = "#FFF8F4";
const SOFT_CREAM = "#FFF0E8";
const MOCHA_BROWN = "#7A5C46";

const SK_RED = MAIN_ORANGE;
const SK_NAVY = DARK_BROWN;
const SK_BLUE_GRAY = MOCHA_BROWN;

const navItems = [
  { label: "서비스 소개", href: "#service" },
  { label: "활용 사례", href: "#use-cases" },
  { label: "요금", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const stats = [
  { value: "1,600만+", label: "SKT 기반 타겟 모수" },
  { value: "LMS/MMS/RCS", label: "목적별 메시지 포맷" },
  { value: "위치/관심사", label: "정교한 타겟 조건" },
  { value: "리포트", label: "발송 결과 확인" },
];

const useCaseTabs = [
  {
    title: "지역 매장",
    icon: Store,
    cases: [
      ["재방문 쿠폰 발송", "매장 주변 고객과 기존 방문 가능 고객에게 쿠폰을 안내합니다."],
      ["오픈/이벤트 홍보", "생활권 고객에게 신규 오픈, 시즌 이벤트, 타임 세일을 알립니다."],
      ["방문 유도 캠페인", "위치 기반 조건으로 매장 방문 가능성이 높은 고객을 선별합니다."],
    ],
  },
  {
    title: "분양/부동산",
    icon: Building2,
    cases: [
      ["모델하우스 방문 유도", "관심 지역과 생활권 조건을 조합해 상담 가능 고객에게 발송합니다."],
      ["청약 일정 안내", "일정 마감 전 관심 고객에게 리마인드 메시지를 보냅니다."],
      ["상담 DB 확장", "보유 DB가 없어도 조건 기반 타겟 모수로 캠페인을 시작합니다."],
    ],
  },
  {
    title: "병원/의원",
    icon: HeartPulse,
    cases: [
      ["검진 시즌 홍보", "연령대와 지역 조건에 맞춰 건강검진 메시지를 발송합니다."],
      ["신규 진료 안내", "관심 가능성이 높은 고객에게 신규 진료 과목을 소개합니다."],
      ["내원 유도", "위치 기반 조건으로 병원 주변 고객에게 혜택을 안내합니다."],
    ],
  },
];

const features = [
  {
    icon: Target,
    title: "SK CoreTarget 타겟팅",
    description: "성별, 연령, 지역, 관심사, App/Web 신호 등 목적에 맞는 조건을 조합합니다.",
    badge: "핵심",
  },
  {
    icon: MapPin,
    title: "위치 기반 지오펜스",
    description: "Maptics 연동으로 특정 위치와 생활권 중심의 타겟 캠페인을 구성합니다.",
    badge: "Maptics",
  },
  {
    icon: MessageSquare,
    title: "다양한 메시지 포맷",
    description: "LMS, MMS, RCS 메시지를 캠페인 목적과 소재 유형에 맞게 선택합니다.",
    badge: null,
  },
  {
    icon: BarChart3,
    title: "발송 리포트",
    description: "발송 상태와 캠페인 결과를 확인하고 다음 운영에 반영할 수 있습니다.",
    badge: null,
  },
  {
    icon: ShieldCheck,
    title: "신뢰 기반 발송",
    description: "발신번호, 소재, 광고 수신 동의 기반 운영으로 광고 리스크를 줄입니다.",
    badge: "신뢰",
  },
  {
    icon: Zap,
    title: "빠른 캠페인 생성",
    description: "타겟 설정부터 메시지 구성, 검수, 발송까지 한 흐름으로 운영합니다.",
    badge: null,
  },
];

const processSteps = [
  ["타겟 설정", "업종, 지역, 연령, 관심사, 위치 조건을 선택합니다."],
  ["메시지 제작", "문구, 이미지, 버튼, URL을 캠페인 목적에 맞게 구성합니다."],
  ["검수/승인", "발신번호와 소재 기준을 확인하고 발송 준비를 마칩니다."],
  ["발송/분석", "예약, 실시간, 모아서 보내기 후 리포트를 확인합니다."],
];

const faqItems = [
  {
    q: "고객 DB가 없어도 사용할 수 있나요?",
    a: "네. 보유 고객 리스트가 없어도 타겟 조건을 선택해 예상 모수를 확인하고 캠페인을 구성할 수 있습니다.",
  },
  {
    q: "스팸 문자처럼 보이지 않나요?",
    a: "광고 수신 동의 고객을 대상으로 발신번호와 소재 검수 흐름을 거쳐 발송하는 구조입니다.",
  },
  {
    q: "위치 타겟팅도 가능한가요?",
    a: "가능합니다. 지역 타겟팅과 Maptics 지오펜스를 활용해 특정 생활권 중심 캠페인을 만들 수 있습니다.",
  },
  {
    q: "발송 결과를 확인할 수 있나요?",
    a: "캠페인 상태, 발송 이력, 리포트 화면을 통해 운영 결과를 확인할 수 있습니다.",
  },
];

export default function Landing() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeCase, setActiveCase] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const ActiveIcon = useCaseTabs[activeCase].icon;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#FFF8F4] text-[#1C0D00]">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-[#1C0D00]/10 bg-[#FFF8F4]/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <a href="/" className="flex items-center gap-3" aria-label="비즈챗 홈">
            <img src={logoImage} alt="wepick x SKT" className="h-9 w-auto" />
            <div className="flex items-center gap-2">
              <span className="text-base font-bold" style={{ color: SK_NAVY }}>
                비즈챗
              </span>
              <span className="hidden rounded-full bg-[#FFF0E8] px-2 py-0.5 text-xs font-bold text-[#1C0D00] sm:inline-flex">
                SK코어타겟
              </span>
            </div>
          </a>

          <nav className="hidden items-center gap-8 md:flex">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="text-sm font-medium text-[#7A5C46] hover:text-[#1C0D00]">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Button variant="ghost" asChild data-testid="button-login-header">
              <a href="/auth">로그인</a>
            </Button>
            <Button asChild className="gap-2">
              <a href="/auth">
                시작하기
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </div>

          <button
            type="button"
            className="rounded-md p-2 md:hidden"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label="메뉴 열기"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-[#1C0D00]/10 bg-[#FFF8F4] px-5 py-4 md:hidden">
            <div className="grid gap-3">
              {navItems.map((item) => (
                <a key={item.href} href={item.href} className="text-sm font-medium text-[#7A5C46]" onClick={() => setMobileOpen(false)}>
                  {item.label}
                </a>
              ))}
              <Button asChild className="mt-2">
                <a href="/auth">시작하기</a>
              </Button>
            </div>
          </div>
        )}
      </header>

      <main className="pt-16">
        <section className="relative overflow-hidden" style={{ background: SK_NAVY }}>
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background: `radial-gradient(circle at 74% 36%, ${SK_RED} 0%, transparent 38%)`,
            }}
          />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:py-28">
            <div className="min-w-0">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/80">
                <ShieldCheck className="h-4 w-4" style={{ color: SK_RED }} />
                SKT 데이터 기반 타겟 문자광고
              </div>
              <h1 className="max-w-3xl text-[2rem] font-black leading-[1.12] text-white sm:text-[2.2rem] md:text-[3rem] md:leading-[1.14]">
                <span className="md:hidden">
                  <span style={{ color: "#FFD0D8" }}>1,600만</span> SK텔레콤
                  <br />
                  가입자에게
                  <br />
                  우리 가게 광고를
                  <br />
                  보내세요
                </span>
                <span className="hidden md:block">
                  <span style={{ color: "#FFD0D8" }}>1,600만</span> SK텔레콤 가입자에게
                  <br />
                  우리 가게 광고를 보내세요
                </span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-white/70 md:text-lg">
                <span className="md:hidden">
                  광고 수신 동의 고객을 대상으로
                  <br />
                  타겟 설정, 메시지 제작, 검수,
                  <br />
                  발송과 리포트까지 한 번에 운영합니다.
                </span>
                <span className="hidden md:inline">
                  광고 수신 동의 고객을 대상으로 타겟 설정, 메시지 제작, 검수, 발송, 리포트까지
                  한 번에 운영하는 SK코어타겟 문자광고 플랫폼입니다.
                </span>
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild className="gap-2 bg-primary">
                  <a href="/auth">
                    5분 만에 첫 광고 보내기
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                  <a href="#service">서비스 보기</a>
                </Button>
              </div>
            </div>

          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-[-42px] h-36 bg-[linear-gradient(to_bottom,rgba(28,13,0,0)_0%,rgba(28,13,0,0.92)_42%,rgba(255,248,244,0.96)_100%)] blur-xl" />
        </section>

        <section className="border-b border-[#1C0D00]/10 bg-[#FFF8F4]">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 py-10 sm:grid-cols-2 sm:px-5 md:grid-cols-4 md:gap-6">
            {stats.map((stat) => (
              <div key={stat.label} className="min-w-0 text-center">
                <div className="break-all text-base font-black leading-tight sm:text-2xl md:text-3xl" style={{ color: SK_NAVY }}>{stat.value}</div>
                <div className="mt-1 text-sm text-[#7A5C46]">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="use-cases" className="bg-[#FFF0E8] py-20">
          <div className="mx-auto max-w-6xl px-5">
            <div className="mb-10 text-center">
              <p className="mb-3 text-sm font-bold" style={{ color: SK_RED }}>활용 사례</p>
              <h2 className="text-3xl font-black md:text-4xl" style={{ color: SK_NAVY }}>어떤 업종에서 쓰나요?</h2>
              <p className="mt-4 text-[#7A5C46]">업종별 목적에 맞는 메시지 캠페인을 빠르게 구성합니다.</p>
            </div>

            <div className="mb-8 flex flex-wrap justify-center gap-3">
              {useCaseTabs.map((tab, index) => (
                <button
                  key={tab.title}
                  type="button"
                  onClick={() => setActiveCase(index)}
                  className="rounded-full border px-5 py-2.5 text-sm font-bold transition"
                  style={{
                    background: activeCase === index ? SK_NAVY : "white",
                    color: activeCase === index ? "white" : SK_BLUE_GRAY,
                    borderColor: activeCase === index ? SK_NAVY : "rgba(28,13,0,0.14)",
                  }}
                >
                  {tab.title}
                </button>
              ))}
            </div>

            <div className="mb-6 flex items-center justify-center gap-2 text-sm font-bold" style={{ color: SK_NAVY }}>
              <ActiveIcon className="h-5 w-5" style={{ color: SK_RED }} />
              {useCaseTabs[activeCase].title} 캠페인 예시
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              {useCaseTabs[activeCase].cases.map(([title, text], index) => (
                <div key={title} className="rounded-2xl border border-[#1C0D00]/10 bg-[#FFF8F4] p-6">
                  <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFF0E8] text-sm font-black" style={{ color: SK_NAVY }}>
                    {index + 1}
                  </div>
                  <h3 className="font-bold" style={{ color: SK_NAVY }}>{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#7A5C46]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="service" className="bg-[#FFF8F4] py-20">
          <div className="mx-auto max-w-6xl px-5">
            <div className="mb-10 text-center">
              <p className="mb-3 text-sm font-bold" style={{ color: SK_RED }}>주요 기능</p>
              <h2 className="text-3xl font-black md:text-4xl" style={{ color: SK_NAVY }}>왜 비즈챗인가요?</h2>
            </div>

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div key={feature.title} className="rounded-2xl border border-[#1C0D00]/10 bg-white p-6">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: SK_NAVY }}>
                      <feature.icon className="h-5 w-5" />
                    </div>
                    {feature.badge && (
                      <span className="rounded-full bg-[#FFF0E8] px-2 py-0.5 text-xs font-bold" style={{ color: SK_RED }}>
                        {feature.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold" style={{ color: SK_NAVY }}>{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#7A5C46]">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#FFF0E8] py-20">
          <div className="mx-auto max-w-6xl px-5">
            <div className="mb-10 text-center">
              <p className="mb-3 text-sm font-bold" style={{ color: SK_RED }}>이용 흐름</p>
              <h2 className="text-3xl font-black md:text-4xl" style={{ color: SK_NAVY }}>타겟 설정부터 리포트까지 한 번에</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              {processSteps.map(([title, text], index) => (
                <div key={title} className="rounded-2xl bg-white p-6">
                  <div className="mb-5 flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: SK_RED }}>
                      {index + 1}
                    </span>
                    {index < processSteps.length - 1 && <ChevronRight className="hidden h-5 w-5 text-[#7A5C46]/45 md:block" />}
                  </div>
                  <h3 className="font-bold" style={{ color: SK_NAVY }}>{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#7A5C46]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="bg-[#FFF8F4] py-20">
          <div className="mx-auto max-w-5xl px-5">
            <div className="mb-10 text-center">
              <p className="mb-3 text-sm font-bold" style={{ color: SK_RED }}>요금 안내</p>
              <h2 className="text-3xl font-black md:text-4xl" style={{ color: SK_NAVY }}>부담 없이 시작하세요</h2>
              <p className="mt-4 text-[#7A5C46]">캠페인 예산에 맞춰 충전하고, 필요한 만큼 발송합니다.</p>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              {[
                ["스타터", "10만원", "소규모 테스트 캠페인"],
                ["스탠다드", "50만원", "정기 프로모션 운영"],
                ["프로", "100만원+", "대량 캠페인 및 성과 분석"],
              ].map(([name, price, text], index) => (
                <div
                  key={name}
                  className="relative rounded-2xl border p-6 text-center"
                  style={{
                    background: index === 1 ? SK_NAVY : "white",
                    borderColor: index === 1 ? SK_NAVY : "rgba(28,13,0,0.12)",
                  }}
                >
                  {index === 1 && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: SK_RED }}>
                      추천
                    </span>
                  )}
                  <div className="text-sm font-bold" style={{ color: index === 1 ? "rgba(255,255,255,0.65)" : SK_BLUE_GRAY }}>{name}</div>
                  <div className="mt-2 text-3xl font-black" style={{ color: index === 1 ? "white" : SK_NAVY }}>{price}</div>
                  <p className="mt-3 text-sm leading-6" style={{ color: index === 1 ? "rgba(255,255,255,0.7)" : SK_BLUE_GRAY }}>{text}</p>
                  <Button asChild className="mt-6 w-full" variant={index === 1 ? "default" : "secondary"}>
                    <a href="/auth">시작하기</a>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="bg-[#FFF0E8] py-20">
          <div className="mx-auto max-w-3xl px-5">
            <div className="mb-10 text-center">
              <p className="mb-3 text-sm font-bold" style={{ color: SK_RED }}>FAQ</p>
              <h2 className="text-3xl font-black md:text-4xl" style={{ color: SK_NAVY }}>자주 묻는 질문</h2>
            </div>

            <div className="space-y-3">
              {faqItems.map((item, index) => (
                <div key={item.q} className="overflow-hidden rounded-2xl border border-[#1C0D00]/10 bg-white">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  >
                    <span className="text-sm font-bold" style={{ color: SK_NAVY }}>{item.q}</span>
                    <ChevronDown className={`h-5 w-5 flex-shrink-0 text-[#7A5C46] transition ${openFaq === index ? "rotate-180" : ""}`} />
                  </button>
                  {openFaq === index && (
                    <div className="px-6 pb-5 text-sm leading-6 text-[#7A5C46]">
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden py-20" style={{ background: SK_NAVY }}>
          <div className="mx-auto grid max-w-6xl gap-8 px-5 md:grid-cols-[1fr_360px] md:items-center">
            <div>
              <div className="mb-4 flex items-center gap-2 text-sm font-bold text-white/60">
                <FileCheck2 className="h-4 w-4" />
                상용 운영을 위한 타겟 문자광고 플랫폼
              </div>
              <h2 className="text-3xl font-black leading-tight text-white md:text-4xl">
                우리 업종에 맞는 고객에게
                <br />
                지금 메시지를 보내세요
              </h2>
              <p className="mt-4 max-w-2xl leading-7 text-white/65">
                복잡한 광고 운영은 줄이고, 타겟 설정부터 발송 결과까지 명확하게 관리합니다.
              </p>
            </div>
            <div className="grid gap-3 text-sm text-white/80">
              {[
                [MousePointerClick, "문의/상담 유입 캠페인"],
                [Phone, "통화/방문 가능 고객 타겟"],
                [Clock, "예약/실시간/분할 발송"],
              ].map(([Icon, text]) => {
                const ItemIcon = Icon as typeof MousePointerClick;
                return (
                  <div key={text as string} className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3">
                    <ItemIcon className="h-4 w-4 text-white" />
                    <span>{text as string}</span>
                  </div>
                );
              })}
              <Button size="lg" asChild className="mt-3 gap-2">
                <a href="/auth">
                  시작하기
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#1C0D00] py-10">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-5 px-5 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <img src={logoImage} alt="wepick x SKT" className="h-8 w-auto" />
            <span className="text-sm font-bold text-white">SK코어타겟 비즈챗</span>
          </div>
          <p className="text-xs text-white/35">SK Telecom. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

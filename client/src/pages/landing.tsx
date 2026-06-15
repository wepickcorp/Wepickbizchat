import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BarChart3,
  ChevronDown,
  Fingerprint,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { trackFunnelEvent } from "@/lib/funnel-events";

const ORANGE = "#FF6B1A";

const featureCards = [
  {
    icon: ShieldCheck,
    title: "신뢰 기반 발송",
    description: "광고 수신 동의, 발신번호, 사전 검수 템플릿 기준을 지켜 광고 리스크를 줄입니다.",
    tone: "dark",
  },
  {
    icon: MapPin,
    title: "위치 기반 지오펜스",
    description: "Maptics 연동으로 매장 주변 생활권과 특정 방문 위치를 중심으로 고객을 선별합니다.",
    tone: "orange",
    action: "위치 타겟 보기",
  },
  {
    icon: Fingerprint,
    title: "SK CoreTarget",
    description: "성별, 연령, 지역, 관심사, App/Web 신호를 조합해 업종에 맞는 타겟 모수를 확인합니다.",
    tone: "blue",
    action: "조건 살펴보기",
  },
];

const metrics = [
  ["1,600만+", "SKT 기반 모수"],
  ["위치/관심사", "타겟 조건"],
  ["리포트", "발송 결과 확인"],
];

const steps = [
  ["타겟 설정", "업종, 지역, 연령, 관심사, 위치 조건을 선택합니다."],
  ["템플릿 선택", "검수 완료 문구를 고르고 브랜드명, 혜택, 기간 같은 정보만 입력합니다."],
  ["크레딧 확인", "최소 발송 수량과 차감 예정 크레딧을 확인합니다."],
  ["발송/분석", "예약 또는 즉시 발송 후 캠페인 결과를 리포트로 확인합니다."],
];

const faqItems = [
  {
    q: "고객 DB가 없어도 사용할 수 있나요?",
    a: "네. 보유 고객 리스트가 없어도 타겟 조건을 선택해 예상 모수를 확인하고 캠페인을 구성할 수 있습니다.",
  },
  {
    q: "문구를 마음대로 수정할 수 있나요?",
    a: "아니요. 기본 발송은 사전 검수된 템플릿을 사용하고, 고객은 필요한 정보값만 입력합니다.",
  },
  {
    q: "위치 타겟팅도 가능한가요?",
    a: "가능합니다. 지역 타겟팅과 Maptics 지오펜스를 활용해 특정 생활권 중심 캠페인을 만들 수 있습니다.",
  },
  {
    q: "크레딧은 어떻게 사용되나요?",
    a: "문자 1건은 2C로 계산하며, 템플릿 1개당 최소 1,000건부터 발송할 수 있습니다.",
  },
];

const footerColumns = [
  {
    title: "제품",
    links: [
      ["핵심 기능", "#targeting"],
      ["데이터 분석", "#targeting"],
      ["LMS/MMS 가이드", "#faq"],
    ],
  },
  {
    title: "성공 사례",
    links: [
      ["업종별 사례", "#flow"],
      ["파트너십", "/auth"],
      ["성과 분석", "#faq"],
    ],
  },
  {
    title: "고객지원",
    links: [
      ["FAQ", "#faq"],
      ["문의하기", "/auth"],
      ["업데이트 소식", "/auth"],
    ],
  },
  {
    title: "법적고지",
    links: [
      ["개인정보처리방침", "/auth"],
      ["이용약관", "/auth"],
    ],
  },
];

function LogoMark() {
  return (
    <a href="/" className="flex items-center gap-3" aria-label="BIZCHAT 홈">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FF6B1A] text-white shadow-xl shadow-orange-500/25">
        <span className="relative flex h-6 w-6 items-center justify-center">
          <MessageSquare className="h-6 w-6 stroke-[3]" />
          <span className="absolute -right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-[#FF6B1A] bg-white" />
        </span>
      </span>
      <span className="leading-none">
        <span className="block text-xl font-black tracking-[-0.04em] text-[#111827]">BIZCHAT</span>
        <span className="mt-1 block text-[10px] font-black tracking-[0.14em] text-[#FF6B1A]">SK CORE TARGET</span>
      </span>
    </a>
  );
}

function PhoneMockup() {
  return (
    <div data-testid="landing-phone-mockup" className="relative mx-auto w-[300px] max-w-full pt-4 md:w-[320px] md:pt-0">
      <div className="pointer-events-none absolute -inset-8 rounded-full bg-orange-100/70 blur-3xl" />
      <div className="landing-float relative rounded-[44px] border-[8px] border-[#172033] bg-[#111827] px-6 pb-10 pt-5 shadow-2xl shadow-slate-900/25">
        <div className="mx-auto mb-8 h-5 w-20 rounded-full bg-black/75" />
        <div className="rounded-2xl bg-white p-4 shadow-xl">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-50 text-[#FF6B1A]">
              <MessageSquare className="h-4 w-4 fill-[#FF6B1A]/10" />
            </span>
            <span className="text-xs font-black text-slate-400">비즈챗 | 강남점</span>
          </div>
          <p className="text-sm font-black leading-6 text-slate-900">
            [광고] 오늘 단 하루! 주변 고객님께만 드리는 50% 할인 쿠폰이 도착했습니다.
          </p>
          <div className="mt-4 flex h-32 items-center justify-center rounded-xl bg-slate-100 text-slate-300">
            <MessageSquare className="h-10 w-10" />
          </div>
        </div>
        <div className="ml-auto mt-5 w-[82%] rounded-2xl bg-blue-500 px-5 py-4 text-center text-sm font-black text-white shadow-lg shadow-blue-500/25">
          지금 바로 확인해보세요!
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const trackLandingClick = (cta: string) => {
    trackFunnelEvent({
      eventName: "landing_cta_clicked",
      funnelStep: "landing",
      metadata: { cta },
    });
  };

  return (
    <div className="min-h-screen bg-white text-[#111827]">
      <style>{`
        @keyframes landing-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-14px); }
        }
        .landing-float {
          animation: landing-float 5.5s ease-in-out infinite;
        }
      `}</style>
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-[1120px] items-center justify-between px-6">
          <LogoMark />
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#targeting" className="text-sm font-bold text-slate-600 hover:text-slate-950">
              서비스 소개
            </a>
            <a href="#flow" className="text-sm font-bold text-slate-600 hover:text-slate-950">
              이용 흐름
            </a>
            <a href="#faq" className="text-sm font-bold text-slate-600 hover:text-slate-950">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild className="font-bold text-slate-950">
              <a href="/auth" onClick={() => trackLandingClick("header_login")}>로그인</a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-white">
          <div className="mx-auto max-w-[1120px] px-6 pb-12 pt-16 md:pb-20 md:pt-24">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-4 py-2 text-xs font-black tracking-[0.08em] text-orange-700">
              <span className="h-2 w-2 rounded-full bg-[#FF6B1A]" />
              SKT OFFICIAL PARTNER
            </div>

            <div className="mt-8 grid gap-10 md:grid-cols-[minmax(0,1fr)_320px] md:items-center lg:grid-cols-[minmax(0,1fr)_360px]">
              <div>
                <h1
                  data-testid="landing-hero-title"
                  aria-label="1,600만 SK텔레콤 가입자에게 우리 가게 광고를 보내세요"
                  className="max-w-3xl text-[2.8rem] font-black leading-[1.04] tracking-[-0.02em] text-[#111827] sm:text-[4rem] md:text-[4.8rem]"
                >
                  <span className="text-[#FF6B1A]">1,600만</span> SK텔레콤
                  <br />
                  가입자에게
                  <br />
                  우리 가게 광고를 보내세요
                </h1>
                <p className="mt-8 max-w-2xl text-lg leading-9 text-slate-500 md:text-xl">
                  광고 수신 동의 고객을 대상으로 타겟 설정, 템플릿 선택, 발송 결과 확인까지
                  한 번에 운영하는 문자광고 플랫폼입니다.
                </p>
                <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                  <Button asChild className="min-h-14 rounded-2xl bg-[#FF6B1A] px-9 text-base font-black text-white shadow-2xl shadow-orange-500/25 hover:bg-[#f25a12]">
                    <a href="/auth" onClick={() => trackLandingClick("hero_start")}>
                      지금 바로 시작하기
                      <ArrowRight className="h-5 w-5" />
                    </a>
                  </Button>
                  <Button asChild variant="outline" className="min-h-14 rounded-2xl border-slate-200 bg-white px-9 text-base font-black shadow-sm">
                    <a href="/auth" onClick={() => trackLandingClick("hero_inquiry")}>도입 문의</a>
                  </Button>
                </div>

                <div className="mt-14 grid grid-cols-3 overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-xl shadow-slate-900/5">
                  {metrics.map(([value, label]) => (
                    <div key={label} className="border-r border-slate-100 px-4 py-6 last:border-r-0 sm:px-5">
                      <p className="text-2xl font-black text-[#111827] sm:text-3xl md:text-4xl">{value}</p>
                      <p className="mt-1 text-[10px] font-black tracking-[0.08em] text-slate-400 sm:text-[11px]">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <PhoneMockup />
            </div>
          </div>
        </section>

        <section id="targeting" className="bg-[#F8FAFC] py-16 md:py-24">
          <div className="mx-auto max-w-[1120px] px-6">
            <div className="mb-10">
              <p className="text-sm font-black text-[#FF6B1A]">SERVICE</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.02em] md:text-5xl">
                업종에 맞는 고객 조건을
                <br className="hidden md:block" />
                빠르게 조합하세요
              </h2>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {featureCards.map((feature) => {
                const Icon = feature.icon;
                const dark = feature.tone === "dark";
                return (
                  <article
                    key={feature.title}
                    className={`min-h-[320px] rounded-[36px] p-8 shadow-sm ${
                      dark ? "bg-[#111827] text-white" : "border border-slate-100 bg-white text-[#111827]"
                    }`}
                  >
                    <div
                      className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
                        feature.tone === "orange"
                          ? "bg-orange-50 text-[#FF6B1A]"
                          : feature.tone === "blue"
                            ? "bg-blue-50 text-blue-500"
                            : "bg-white/10 text-white/30"
                      }`}
                    >
                      <Icon className="h-8 w-8" />
                    </div>
                    <h3 className="mt-20 text-2xl font-black">{feature.title}</h3>
                    <p className={`mt-5 leading-8 ${dark ? "text-white/60" : "text-slate-500"}`}>{feature.description}</p>
                    {feature.action && (
                      <a href="/auth" className="mt-8 inline-flex items-center gap-2 text-sm font-black" style={{ color: feature.tone === "blue" ? "#2563EB" : ORANGE }}>
                        {feature.action}
                        <ArrowRight className="h-4 w-4" />
                      </a>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-white py-16 md:py-24">
          <div className="mx-auto grid max-w-[1120px] gap-10 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div className="rounded-[36px] bg-[#FF6B1A] p-9 text-white shadow-2xl shadow-orange-500/20">
              <Sparkles className="h-10 w-10" />
              <h2 className="mt-16 text-4xl font-black leading-tight">
                5분 만에
                <br />
                첫 광고를 준비하세요
              </h2>
              <p className="mt-5 leading-8 text-white/80">복잡한 소재 작성은 줄이고, 승인된 메시지 템플릿과 타겟 조건 중심으로 캠페인을 만듭니다.</p>
            </div>

            <div id="flow" className="grid gap-4">
              {steps.map(([title, description], index) => (
                <div key={title} className="flex gap-5 rounded-[24px] border border-slate-100 bg-white p-6 shadow-sm">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-sm font-black text-slate-900">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="text-lg font-black">{title}</h3>
                    <p className="mt-2 leading-7 text-slate-500">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#111827] py-16 text-white md:py-24">
          <div className="mx-auto max-w-[1120px] px-6">
            <div className="grid gap-6 md:grid-cols-3">
              {[
                [Target, "지역 매장", "오픈 이벤트, 재방문 쿠폰, 타임 세일을 생활권 고객에게 안내합니다."],
                [MessageSquare, "분양/부동산", "관심 지역과 생활권 조건을 조합해 상담 가능 고객에게 도달합니다."],
                [BarChart3, "병원/의원", "검진 시즌, 신규 진료, 내원 안내처럼 시점이 중요한 캠페인에 활용합니다."],
              ].map(([Icon, title, text]) => {
                const ItemIcon = Icon as typeof Target;
                return (
                  <div key={title as string} className="rounded-[28px] bg-white/8 p-7">
                    <ItemIcon className="h-8 w-8 text-[#FF6B1A]" />
                    <p className="mt-8 text-xl font-black">{title as string}</p>
                    <p className="mt-3 leading-7 text-white/55">{text as string}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="faq" className="bg-white py-16 md:py-24">
          <div className="mx-auto max-w-[820px] px-6">
            <div className="mb-10 text-center">
              <p className="text-sm font-black text-[#FF6B1A]">FAQ</p>
              <h2 className="mt-3 text-3xl font-black md:text-5xl">자주 묻는 질문</h2>
            </div>
            <div className="space-y-3">
              {faqItems.map((item, index) => (
                <div key={item.q} className="overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-sm">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-5 px-6 py-5 text-left font-black"
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  >
                    {item.q}
                    <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition ${openFaq === index ? "rotate-180" : ""}`} />
                  </button>
                  {openFaq === index && <p className="px-6 pb-6 leading-7 text-slate-500">{item.a}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#F8FAFC] py-16 md:py-24">
          <div className="mx-auto max-w-[1120px] px-6">
            <div className="rounded-[36px] bg-[#111827] p-8 text-white md:flex md:items-center md:justify-between md:p-12">
              <div>
                <p className="text-sm font-black text-white/40">BIZCHAT SK CORE TARGET</p>
                <h2 className="mt-4 text-3xl font-black leading-tight md:text-5xl">
                  복잡한 광고 운영은 줄이고
                  <br />
                  필요한 고객에게만 보내세요
                </h2>
              </div>
              <Button asChild className="mt-8 min-h-14 rounded-2xl bg-[#FF6B1A] px-9 text-base font-black text-white hover:bg-[#f25a12] md:mt-0">
                <a href="/auth">
                  광고 시작하기
                  <ArrowRight className="h-5 w-5" />
                </a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-100 bg-white">
        <div className="mx-auto max-w-[1120px] px-6 py-14">
          <div className="grid gap-10 md:grid-cols-[1.35fr_repeat(4,1fr)]">
            <div>
              <LogoMark />
              <p className="mt-8 max-w-[280px] text-base font-semibold leading-8 text-slate-500">
                SK텔레콤의 방대한 데이터를 비즈니스 성장 동력으로 전환하는 가장 스마트한 방법입니다.
              </p>
              <div className="mt-8 flex gap-4">
                {["f", "i", "▶"].map((label) => (
                  <span
                    key={label}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-sm font-black text-slate-400"
                    aria-hidden="true"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {footerColumns.map((column) => (
              <div key={column.title}>
                <h3 className="text-base font-black text-slate-950">{column.title}</h3>
                <div className="mt-7 grid gap-5">
                  {column.links.map(([label, href]) => (
                    <a key={label} href={href} className="text-sm font-bold text-slate-400 hover:text-slate-900">
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-14 border-t border-slate-100 pt-7 text-xs font-bold leading-7 text-slate-400">
            <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-4">
              <span>© 2026 주식회사 위픽코퍼레이션. All rights reserved.</span>
              <span className="hidden text-slate-200 lg:inline">•</span>
              <span>사업자등록번호: 214-88-01234</span>
              <span className="hidden text-slate-200 lg:inline">•</span>
              <span>대표자: 이민수</span>
              <span className="hidden text-slate-200 lg:inline">•</span>
              <span>SK core target Official Solution.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

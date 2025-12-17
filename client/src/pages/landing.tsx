import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Target, 
  MessageSquare, 
  BarChart3, 
  Shield, 
  ArrowRight,
  Users,
  Zap,
  CheckCircle2,
  MapPin,
  Smartphone,
  Gift,
  TrendingUp,
  Database,
  Clock,
  Layers,
  Store,
  Building2,
  Stethoscope,
  HelpCircle,
  Megaphone,
  UserCheck,
  PiggyBank,
  LineChart
} from "lucide-react";
import logoImage from "@assets/위픽xSKT 로고_1764247660608.png";

const painPoints = [
  {
    icon: Megaphone,
    title: "전단지, 현수막 효과가 없어요",
    description: "돈만 쓰고 손님은 안 와요",
  },
  {
    icon: UserCheck,
    title: "우리 고객이 될 사람을 찾고 싶어요",
    description: "아무에게나 보내는 광고는 그만",
  },
  {
    icon: PiggyBank,
    title: "광고비는 쓰는데 효과를 모르겠어요",
    description: "어디서 손님이 왔는지 알 수가 없어요",
  },
  {
    icon: LineChart,
    title: "쉽고 빠르게 광고하고 싶어요",
    description: "복잡한 건 딱 질색이에요",
  },
];

const features = [
  {
    icon: Target,
    title: "딱 맞는 고객만 찾아드려요",
    description: "1,600만 SKT 고객 중에서 우리 가게에 올 것 같은 사람만 골라서 보내요. 성별, 나이, 사는 곳, 관심사까지 다 알 수 있어요.",
  },
  {
    icon: BarChart3,
    title: "누가 봤는지 다 알려드려요",
    description: "내 광고를 본 사람이 누군지, 뭘 눌렀는지 한눈에 볼 수 있어요. 다음 광고는 더 잘 할 수 있겠죠?",
  },
  {
    icon: Shield,
    title: "스팸 아니에요, 진짜 광고예요",
    description: "SKT 인증 마크가 붙어서 신뢰도가 달라요. 발신자 번호도 인증되어 있어서 고객이 안심하고 열어봐요.",
  },
  {
    icon: Layers,
    title: "예쁜 문자로 보내요",
    description: "그냥 글자만 있는 문자 말고, 사진도 넣고 버튼도 넣을 수 있어요. 보는 사람도 누르고 싶어져요.",
  },
  {
    icon: Zap,
    title: "5분이면 광고 완성",
    description: "어렵지 않아요. 누가 받을지 고르고, 뭘 보낼지 쓰고, 보내기만 하면 끝이에요.",
  },
  {
    icon: Gift,
    title: "네이버페이 리워드로 효과 UP",
    description: "광고 보면 네이버페이 포인트를 주니까 사람들이 더 잘 봐요. 반응률이 20%나 올라가요.",
  },
];

const targetingFeatures = [
  {
    icon: Users,
    title: "이런 사람한테만",
    description: "30대 여성, 40대 남성 등 원하는 고객층만 골라요",
  },
  {
    icon: Smartphone,
    title: "이런 걸 좋아하는 사람",
    description: "쇼핑 좋아하는 사람, 부동산 관심 있는 사람 등",
  },
  {
    icon: MapPin,
    title: "우리 동네 사람만",
    description: "내 가게 근처에 사는 사람, 일하는 사람만 골라요",
  },
  {
    icon: Database,
    title: "우리 고객이 될 확률 높은 사람",
    description: "AI가 분석해서 반응할 것 같은 사람을 찾아줘요",
  },
];

const useCases = [
  {
    icon: Store,
    title: "자영업자",
    subtitle: "매장 사장님",
    examples: [
      "오픈 기념 할인 이벤트 알리기",
      "재방문 고객 쿠폰 발송",
      "신메뉴 출시 홍보",
    ],
    color: "bg-orange-500",
  },
  {
    icon: Building2,
    title: "분양대행사",
    subtitle: "분양 상담원",
    examples: [
      "분양 관심 고객 타겟 광고",
      "모델하우스 방문 유도",
      "청약 일정 안내 발송",
    ],
    color: "bg-blue-500",
  },
  {
    icon: Stethoscope,
    title: "병원",
    subtitle: "원장님",
    examples: [
      "건강검진 시즌 홍보",
      "신규 진료과목 안내",
      "휴진 및 진료시간 알림",
    ],
    color: "bg-emerald-500",
  },
];

const stats = [
  { value: "1,600만", label: "받을 수 있는 사람" },
  { value: "20%", label: "리워드 시 반응률 UP" },
  { value: "10만원", label: "부터 시작 가능" },
  { value: "실시간", label: "결과 확인" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src={logoImage} alt="wepick x SKT 로고" className="h-10 w-auto" />
            <span className="font-bold text-lg">비즈챗</span>
          </div>
          <div className="flex items-center gap-4">
            <Button asChild data-testid="button-login-header">
              <a href="/auth">로그인</a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden py-20 md:py-32">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/10" />
          <div className="container mx-auto px-4 relative">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-small text-accent-foreground mb-6">
                <Zap className="h-4 w-4 text-primary" />
                SK텔레콤 공식 광고 서비스
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
                내 고객이 될 사람에게만
                <br />
                <span className="text-primary">딱 맞게</span> 보내요
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                전단지 돌리느라 고생하셨죠?
                <br />
                이제 SKT 1,600만 고객 중에서 우리 가게 올 것 같은 사람만 골라서 문자 보내세요.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" asChild className="gap-2" data-testid="button-start-now">
                  <a href="/auth">
                    무료로 시작하기
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild data-testid="button-learn-more">
                  <a href="#pain-points">어떻게 하는 건가요?</a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 bg-card border-y">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="text-2xl md:text-3xl font-bold text-primary mb-1">
                    {stat.value}
                  </div>
                  <div className="text-small text-muted-foreground">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pain-points" className="py-20 bg-gradient-to-b from-background to-accent/20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                이런 고민 있으시죠?
              </h2>
              <p className="text-lg text-muted-foreground">
                그렇다면 <span className="text-primary font-semibold">비즈챗</span>으로 해결하세요
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {painPoints.map((item, index) => (
                <Card key={index} className="hover-elevate text-center">
                  <CardContent className="p-6">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mx-auto mb-4">
                      <item.icon className="h-7 w-7 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">{item.title}</h3>
                    <p className="text-small text-muted-foreground">{item.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                비즈챗은 이렇게 도와드려요
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                어렵지 않아요. 진짜로요.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <Card key={index} className="hover-elevate">
                  <CardContent className="p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 mb-4">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-h3 font-semibold mb-2">{feature.title}</h3>
                    <p className="text-small text-muted-foreground">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-card">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                우리 고객 될 사람만 찾아드려요
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                아무에게나 보내면 돈 낭비예요. 받을 사람을 골라서 보내세요.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {targetingFeatures.map((feature, index) => (
                <div key={index} className="text-center p-6">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mx-auto mb-4">
                    <feature.icon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="text-h3 font-semibold mb-2">{feature.title}</h3>
                  <p className="text-small text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                이런 분들이 쓰고 계세요
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                우리 같은 분들이 이미 효과 보고 있어요
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {useCases.map((useCase, index) => (
                <Card key={index} className="hover-elevate overflow-hidden">
                  <div className={`${useCase.color} p-4 text-white`}>
                    <div className="flex items-center gap-3">
                      <useCase.icon className="h-8 w-8" />
                      <div>
                        <h3 className="font-bold text-lg">{useCase.title}</h3>
                        <p className="text-sm opacity-90">{useCase.subtitle}</p>
                      </div>
                    </div>
                  </div>
                  <CardContent className="p-5">
                    <ul className="space-y-3">
                      {useCase.examples.map((example, i) => (
                        <li key={i} className="flex items-start gap-2 text-small">
                          <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                          <span>{example}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-card">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  예쁜 문자로 보내세요
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                  그냥 글자만 있는 문자 말고, 사진도 버튼도 넣을 수 있어요
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                {[
                  { title: "기본형", desc: "텍스트와 사진, 버튼까지 깔끔하게", icon: MessageSquare },
                  { title: "슬라이드형", desc: "여러 장 사진을 넘겨볼 수 있어요", icon: Layers },
                  { title: "이미지 강조형", desc: "사진을 크게 보여주고 싶을 때", icon: Smartphone },
                ].map((item, index) => (
                  <div key={index} className="text-center p-6 border rounded-lg bg-background">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground mx-auto mb-4">
                      <item.icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-h3 font-semibold mb-2">{item.title}</h3>
                    <p className="text-small text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  정말 쉬워요, 3단계면 끝
                </h2>
              </div>
              <div className="grid md:grid-cols-3 gap-8">
                {[
                  { step: "1", title: "뭘 보낼지 쓰기", desc: "광고 문구랑 사진 넣으면 돼요" },
                  { step: "2", title: "누가 받을지 고르기", desc: "우리 고객 될 것 같은 사람 선택해요" },
                  { step: "3", title: "보내기", desc: "결제하고 발송하면 끝이에요" },
                ].map((item, index) => (
                  <div key={index} className="text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg mx-auto mb-4">
                      {item.step}
                    </div>
                    <h3 className="text-h3 font-semibold mb-2">{item.title}</h3>
                    <p className="text-small text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-card">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <HelpCircle className="h-12 w-12 text-primary mx-auto mb-4" />
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                궁금한 거 있으시죠?
              </h2>
              <div className="text-left max-w-2xl mx-auto mt-8 space-y-6">
                {[
                  { q: "비용이 얼마나 들어요?", a: "문자 한 통에 100원 정도예요. 10만원부터 시작할 수 있어요." },
                  { q: "효과가 있을까요?", a: "타겟팅해서 보내니까 전단지보다 효과 좋아요. 누가 봤는지도 다 알 수 있고요." },
                  { q: "어려운 거 아니에요?", a: "아니요, 5분이면 첫 광고 보낼 수 있어요. 모르는 건 저희가 도와드려요." },
                ].map((faq, i) => (
                  <div key={i} className="border-b pb-4">
                    <h3 className="font-semibold mb-2">{faq.q}</h3>
                    <p className="text-muted-foreground">{faq.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              고민하지 마세요, 일단 해보세요
            </h2>
            <p className="text-lg opacity-90 mb-8 max-w-xl mx-auto">
              10만원으로 시작해서 효과 있으면 더 하면 되잖아요.
              <br />
              우리 가게 손님 될 사람, 지금 찾아보세요.
            </p>
            <Button 
              size="lg" 
              variant="secondary" 
              asChild 
              className="gap-2"
              data-testid="button-cta-start"
            >
              <a href="/auth">
                지금 바로 시작하기
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src={logoImage} alt="wepick x SKT 로고" className="h-8 w-auto" />
              <span className="font-semibold">비즈챗</span>
            </div>
            <p className="text-small text-muted-foreground">
              SK Telecom. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

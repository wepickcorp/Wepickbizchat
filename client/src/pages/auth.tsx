import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileText, Building2 } from "lucide-react";
import logoUrl from "@assets/logo_optimized.png";

interface AgencyOption {
  id: string;
  name: string;
}

const TERMS_OF_SERVICE = `위픽 서비스 이용약관 

본 약관은 주식회사 위픽코퍼레이션(이하 "회사")이 제공하는 통합회원 기반의 계열 서비스(위픽업, 위픽레터, 위픽부스터, 위픽비즈챗)의 이용과 관련하여 회사와 이용자 간의 권리·의무 및 책임사항을 규정함을 목적으로 합니다. 

제1조 (목적) 

이 약관은 회사가 운영하는 통합회원 시스템을 통해 회사의 계열 서비스를 이용함에 있어 필요한 기본적인 사항을 규정함으로써, 회원과 회사 간의 권리, 의무 및 책임을 명확히 하는 것을 목적으로 합니다. 

제2조 (정의) 

이 약관에서 사용하는 용어의 정의는 다음과 같습니다. 

"계열 서비스"(이하 "서비스") 는 회사가 운영하는 위픽업, 위픽레터, 위픽부스터, 위픽비즈챗 등 통합회원 시스템에 연동된 온라인 서비스를 말합니다. 

"통합회원시스템"은 하나의 인증 계정으로 회사의 복수 서비스를 자동 연동하여 사용할 수 있는 SSO(Single Sign-On) 기반 인증 시스템입니다. 

"통합회원"은 통합로그인 시스템을 통해 하나의 계정으로 회사가 운영하는 두 개 이상의 계열 서비스를 이용하거나, 통합회원 전환에 동의한 자를 말합니다. 

"회원정보"는 회원가입 시 기재한 이메일, 비밀번호 등 통합로그인 시스템을 통해 관리되는 정보를 의미합니다. 

"이용자" 는 통합회원 및 비회원을 포괄하는 개념입니다. 

제3조 (약관 외 준칙) 

이 약관에서 정하지 아니한 사항에 대해서는 법령, 또는 회사의 운영정책 및 규칙 등(이하 세부지침)의 규정에 따릅니다. 또한 본 약관과 세부지침이 충돌할 경우에는 세부지침에 따릅니다. 

제4조 (약관의 효력 및 변경) 

본 약관은 통합회원 시스템 및 각 계열 서비스 내에 게시함으로써 효력이 발생합니다. 

회사는 관련 법령을 위반하지 않는 범위 내에서 본 약관을 개정할 수 있으며, 변경 사항은 최소 7일(중대한 변경 시 30일) 전 공지합니다. 

변경된 약관에 동의하지 않을 경우 회원은 탈퇴할 수 있으며, 별도 이의 제기 없이 계속 서비스를 이용하는 경우 동의한 것으로 간주합니다. 

제5조 (적용 범위 및 우선순위) 

본 약관은 통합로그인을 사용하는 모든 계열 서비스에 공통 적용됩니다. 

계열 서비스별 특수사항이 있는 경우, 본 약관 내 관련 조항에서 분기하여 명시합니다. 

개인정보 관련 사항은 통합 개인정보처리방침에 따릅니다. 

제6조 (이용자에 대한 통지) 

회사는 이 약관에 별도 규정이 없는 한 이용자에게 전자우편, 문자메시지(SMS), 전자쪽지, 푸쉬(Push)알림 등의 전자적 수단을 이용하여 통지할 수 있습니다. 

회사는 이용자 전체에 대한 통지의 경우 7일 이상 회사가 운영하는 웹사이트 내의 게시판에 게시함으로써 제1항의 통지에 갈음할 수 있습니다. 다만, 이용자 본인의 거래와 관련하여 중대한 영향을 미치는 사항에 대하여는 제1항의 개별 통지를 합니다. 

회사는 이용자의 연락처 미기재, 변경 후 미수정, 오기재 등으로 인하여 개별 통지가 어려운 경우에 한하여 전항의 공지를 함으로써 개별 통지를 한 것으로 간주합니다. 

제7조 (회원가입 및 서비스 이용) 

회원가입은 통합회원 시스템을 통해 이루어지며, 이용자가 본 약관에 동의하고 가입 절차를 완료함으로써 성립됩니다. 기존 회원은 전환에 동의함으로써 통합회원으로 전환됩니다. 

통합회원은 하나의 계정으로 회사가 정한 모든 계열 서비스(위픽업, 위픽레터, 위픽부스터, 위픽비즈챗 등)를 로그인 및 이용할 수 있습니다. 

각 계열 서비스는 고유한 기능과 운영정책을 가지고 있으며, 서비스 특성에 따라 일부 기능은 별도 절차나 정보 제공을 요구할 수 있습니다. 

[위픽레터] 회원이 콘텐츠를 작성하거나 에디터로 활동하는 경우, 닉네임·프로필 이미지 등 공개 프로필 정보가 콘텐츠와 함께 노출될 수 있으며, 검색엔진에 노출될 수 있습니다. 공개 범위는 설정을 통해 조정할 수 있으며, 설정하지 않을 경우 기본값은 전체 공개입니다. 

[위픽업] 광고상품의 구매 및 광고집행을 위해 사업자 정보 및 결제정보가 필요하며, 회사와의 별도의 인증 또는 계약체결이 요구될 수 있습니다. 

[위픽부스터] 광고상품의 구매 및 광고집행을 위해 사업자 정보 및 결제정보가 필요하며, 회사와의 별도의 인증 또는 계약체결이 요구될 수 있습니다. 

[위픽비즈챗] 광고상품의 구매 및 광고집행을 위해 사업자 정보 및 결제정보가 필요하며, 회사와의 별도의 인증 또는 계약체결이 요구될 수 있습니다. 

제8조 (개인정보의 관리 및 보호) 

회사는 이용자의 개인정보의 보호 및 사용에 대해서 관련 법규 및 회사의 개인정보처리방침을 적용합니다. 다만, 회사에서 운영하는 웹 사이트 등에서 링크된 외부 웹페이지에서는 회사의 개인정보처리방침이 적용되지 않습니다. 

회사는 이용자들의 개인정보를 중요시하며, 정보통신망 이용촉진 및 정보보호 등에 관한 법률, 개인정보보호법 등 관련 법규를 준수하기 위해 노력합니다. 회사는 개인정보보호정책을 통하여 이용자가 제공하는 개인정보가 어떠한 용도와 방식으로 이용되고 있으며 개인정보보호를 위해 어떠한 조치가 취해지고 있는지 알려드립니다. 

회원정보는 통합로그인을 통해 일괄 관리되며, 이메일, 아이디 등 기본정보는 연동됩니다. 서비스 별 추가정보는 각 서비스에서 관리합니다. 

회원은 개인정보관리 기능을 통하여 언제든지 본인의 개인정보를 열람하고 수정할 수 있습니다. 다만 서비스 관리를 위해 아이디는 수정이 불가능합니다. 

아이디 및 비밀번호의 관리 책임은 회원에게 있으며, 타인에게 공유하거나 양도할 수 없습니다. 

개인정보 보유기간 및 이용기간은 개인정보처리방침 제3조*에 따릅니다. 

*개인정보처리방침 제3조 (개인정보의 보유 및 이용기간) 회사는 개인정보 수집 목적이 달성된 경우 지체 없이 해당 정보를 파기합니다. 단, 다음의 경우 법령 또는 내부 방침에 따라 일정 기간 보관할 수 있습니다. 

① 내부 방침에 의한 보존 
부정 이용 방지를 위한 기록: 1년 
분쟁 해결 및 고객지원 서비스 완결 목적 

②법령에 의한 보존 
계약 또는 청약철회 기록: 5년 (전자상거래 등에서의 소비자보호에 관한 법률) 
대금 결제 및 재화 공급 기록: 5년 (전자상거래 등에서의 소비자보호에 관한 법률) 
소비자 불만 또는 분쟁처리 기록: 3년 (전자상거래 등에서의 소비자보호에 관한 법률) 
웹사이트 방문 기록: 3개월 (통신비밀보호법) 
본인 확인 기록: 6개월 (정보통신 이용촉진 및 정보보호 등에 관한 법률) 

제9조 (서비스의 이용 및 제한) 

회사는 연중무휴, 1일 24시간 서비스 제공을 원칙으로 하나, 점검·장애 등으로 일시 중지될 수 있습니다. 

통합회원은 로그인 후 각 계열 서비스의 기능을 이용할 수 있으며, 유료 서비스 이용 시 결제수단, 이용요금, 환불 기준은 본 약관 및 서비스 내 운영정책에 따릅니다. 

비회원은 제한적으로 콘텐츠를 열람하거나 일부 광고상품 정보를 조회할 수 있습니다. 

회사는 만 14세 미만 아동의 회원 가입을 제한합니다. 

제10조 (콘텐츠 및 지식재산권) 

회사가 제공하는 서비스에 대한 저작권 등 지식재산권은 회사에 귀속됩니다. 

회사는 서비스와 관련하여 이용자에게 회사가 정한 조건 따라 회사가 제공하는 서비스를 이용할 수 있는 권한만을 부여하며, 이용자는 이를 양도, 판매, 담보제공 하는 등 처분행위를 할 수 없습니다. 

회원이 작성한 콘텐츠의 저작권은 회원이 작성한 콘텐츠는 작성자에게 저작권이 귀속되나, 회사는 해당 콘텐츠를 회사의 서비스 내외에서 작성자의 권리를 침해하지 않도록 일부 수정, 복제, 편집하여 활용할 수 있습니다. 

서비스의 UI, 기능, 디자인, 데이터 등에 대한 권리는 회사에 있으며, 무단 복제·배포를 금합니다. 

제11조 (유료서비스의 주문/결제) 

회사가 제공하는 유료서비스를 이용하는 경우 이용자는 이용대금을 납부하는 것을 원칙으로 합니다. 

회사는 이용자가 결제수단에 대해 정당한 사용권한을 가지고 있는지 여부를 확인할 수 있으며, 이에 대한 확인이 완료될 때까지 거래 진행을 중지하거나, 확인이 불가한 해당 거래를 취소할 수 있습니다. 

회사의 정책 및 결제업체(이동통신사, 카드사 등) 및 결제대행업체의 기준에 따라 이용자 당 월 누적 결제액 및 충전한도가 제한될 수 있습니다. 

이용자가 대금의 지급이나 결제를 위하여 입력한 정보에 대한 책임은 이용자에게 있습니다. 

유료서비스의 주문/결제 관련 상세 기준은 서비스 별 운영 정책에 따릅니다. 

[위픽업] 주문/결제 정책 
① 위픽업은 플랫폼에 입점한 판매자와 회원 간의 거래를 중개하여 광고 상품의 편리한 비교와 구매를 돕는 서비스이며, 직접적인 광고 상품 판매 당사자가 아닙니다. 
② 광고상품의 내용, 조건, 성과, 이행 책임은 해당 판매자와 광고주 간의 계약에 따릅니다. 
③ 회원은 구매 전 반드시 광고상품의 상세정보와 제공 조건을 확인해야 하며, 계약 체결 이후 발생하는 이슈에 대해서는 회사는 법령상 허용된 범위 내에서만 책임을 집니다. 
④ 회사는 판매자와 회원 간 거래의 안전성과 신뢰성을 높이기 위해 결제수단, 중개 시스템, 운영정책 등을 제공합니다. 단, 계약 이행 또는 결과에 대해 직접적인 보증을 하지는 않습니다. 
⑤ 회사는 결제금액에서 할인을 적용할 수 있는 쿠폰을 "회원"에게 발행할 수 있습니다. 

[위픽부스터] 주문/결제 정책 
"선불 광고비"는 신용카드와 현금을 통해 결제가 가능합니다. "선불광고비"와 "현금 등"의 교환비율은 일대일(1:1)입니다. 
"선불 광고비"는 마지막으로 충전 또는 이용된 날로부터 5년이 경과하도록 다시 충전 또는 이용되지 않을 경우 상법 상의 상사소멸시효에 의해 소멸될 수 있습니다. 

제12조 (환불) 

환불은 환불 불가 또는 부분 환불이 가능하며, 상세 기준은 서비스별 운영 정책에 따릅니다. 

[위픽업] 환불 정책 
① 위픽업은 광고상품 중개 플랫폼으로, 광고상품의 실제 판매 및 집행에 관한 의무와 책임은 판매자(매체사)와 구매자(광고주) 간 계약에 따릅니다. 
② 계약된 광고상품이 집행되지 않은 경우, 광고주의 환불 요청에 따라 판매자와 협의 후 환불 여부를 결정할 수 있습니다. 
③ 광고가 이미 집행되었거나 일부 집행된 경우, 환불은 불가능합니다. 

[위픽부스터] 환불 정책 
캠페인 집행 완료 이후에는 환불이 불가능합니다. 
① "선불 광고비"는 신용카드와 현금을 통해 결제가 가능합니다. 
② "회사"는 "회원"이 "서비스" 이용 중단 등을 이유로 "선불 광고비"를 환불을 요청하는 경우 환불합니다. 
③ "환불"은 "선불 광고비" 구매를 완료한 "회원"만 신청할 수 있습니다. 
④ "후불 광고비"는 "환불"이 불가능합니다. 

제13조 (회사의 권리와 의무) 

회사는 계속적이고 안정적인 서비스의 제공을 위하여 설비에 장애가 생기거나 멸실된 때에는 이를 지체 없이 수리 또는 복구합니다. 

시스템의 긴급점검, 증설, 교체, 시설의 보수 또는 공사를 하기 위하여 필요한 경우 예고 없이 서비스의 전부 또는 일부를 일시 중지할 수 있습니다. 

회사는 이용계약의 체결, 계약사항의 변경 및 해지 등 이용자와의 계약 관련 절차 및 내용 등에 있어 이용자에게 편의를 제공하도록 노력합니다. 

제14조 (이용자의 권리와 의무) 

이용자는 회원가입을 통해 이용신청을 하는 경우 사실에 근거해야 합니다. 허위 또는 타인의 정보를 등록한 경우 회사에 대하여 일체의 권리를 주장할 수 없습니다. 

이용자는 본 약관에서 규정하는 사항과 기타 회사가 정한 제반 규정을 준수하여야 합니다. 

이용자는 주소, 연락처, 전자우편 주소 등 회원정보가 변경된 경우 즉시 수정해야 합니다. 

이용자는 아이디와 비밀번호를 직접 관리해야 하며, 관리 소홀로 발생한 문제는 회사가 책임을 부담하지 않습니다. 

제15조 (서비스의 제공) 

회사의 서비스는 연중무휴, 1일 24시간 제공을 원칙으로 합니다. 다만 시스템 유지 보수를 위한 점검 등 특별한 사유가 있는 경우 일시적인 제공 중단이 발생할 수 있습니다. 

제16조 (서비스의 제한 등) 

회사는 전시, 사변, 천재지변 또는 이에 준하는 국가비상사태가 발생하거나 발생할 우려가 있는 경우 서비스의 전부 또는 일부를 제한하거나 중지할 수 있습니다. 

제17조 (서비스의 해지 및 서비스 탈퇴) 

회원은 언제든지 회원탈퇴 신청을 통해 이용계약해지를 요청할 수 있습니다. 

탈퇴 시 연동된 모든 계열 서비스 이용기록 및 계정이 삭제되며, 일부 정보는 법령에 따라 일정기간 보관될 수 있습니다. 

회사는 이용자가 본 약관에서 정한 의무를 위반한 경우 계약을 해지할 수 있습니다. 

제18조 (손해배상) 

회사 또는 이용자는 상대방의 귀책에 따라 손해가 발생하는 경우 손해배상을 청구할 수 있습니다. 다만, 회사는 무료서비스의 장애, 제공 중단 등으로 인한 손해에 대하여는 배상책임을 부담하지 않습니다. 

제19조 (책임 및 면책조항) 

천재지변 또는 이에 준하는 불가항력으로 인하여 "서비스"를 제공할 수 없는 경우에는 책임이 면제됩니다. 

'회원'의 귀책사유로 인한 "서비스" 이용의 장애에 대하여 책임을 지지 않습니다. 

무료로 제공되는 서비스 이용과 관련하여 관련 법에 특별한 규정이 없는 한 책임을 지지 않습니다. 

이용자 상호간 또는 이용자와 제3자 상호간 서비스를 매개로 발생한 분쟁에 개입하지 않으며, 이에 따른 책임도 지지 않습니다. 

제20조 (정보의 제공 및 광고의 게재) 

회사는 이용자가 서비스 이용 중 필요하다고 인정되는 각종 정보 및 광고를 전자우편, 휴대폰 메세지, 전화, 우편 등의 방법으로 제공할 수 있습니다. 이용자는 이를 원하지 않을 경우 수신을 거부할 수 있습니다. 

제21조 (분쟁해결) 

본 약관에서 정하지 아니한 사항과 본 약관의 해석에 관하여는 대한민국 법령에 따릅니다. 

서비스 이용으로 발생한 분쟁에 대해 소송이 제기되는 경우 법령에 정한 절차에 따른 법원을 관할 법원으로 합니다. 

부 칙 
본 약관은 2025년 1월 1일부터 적용됩니다.`;

export default function AuthPage() {
  const [, navigate] = useLocation();
  const { signIn, signUp, isAuthenticated } = useSupabaseAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [termsDialogOpen, setTermsDialogOpen] = useState(false);

  const { data: agenciesData } = useQuery<{ agencies: AgencyOption[] }>({
    queryKey: ["/api/agencies/list"],
  });

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn(loginEmail, loginPassword);

    if (error) {
      toast({
        title: "로그인 실패",
        description: error.message || "이메일 또는 비밀번호를 확인해주세요.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "로그인 성공",
        description: "환영합니다!",
      });
      navigate("/dashboard");
    }

    setIsLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!termsAgreed) {
      toast({
        title: "약관 동의 필요",
        description: "서비스 이용약관에 동의해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const { error } = await signUp(signupEmail, signupPassword, signupName, selectedAgencyId || undefined);

    if (error) {
      toast({
        title: "회원가입 실패",
        description: error.message || "회원가입 중 오류가 발생했어요.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "회원가입 성공",
        description: "이메일 인증을 완료해주세요.",
      });
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={logoUrl} alt="wepick x SKT" className="h-10" />
          </div>
          <CardTitle className="text-2xl">비즈챗 광고 플랫폼</CardTitle>
          <CardDescription>
            SK텔레콤 광고 수신 동의 고객 1,600만 명 대상
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" data-testid="tab-login">로그인</TabsTrigger>
              <TabsTrigger value="signup" data-testid="tab-signup">회원가입</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">이메일</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="email@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    data-testid="input-login-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">비밀번호</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="비밀번호를 입력하세요"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    data-testid="input-login-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                  data-testid="button-login"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      로그인 중...
                    </>
                  ) : (
                    "로그인"
                  )}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">이름</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="홍길동"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    required
                    data-testid="input-signup-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">이메일</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="email@example.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    required
                    data-testid="input-signup-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">비밀번호</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="6자리 이상 입력하세요"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                    minLength={6}
                    data-testid="input-signup-password"
                  />
                </div>
                
                {agenciesData?.agencies && agenciesData.agencies.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="signup-agency">
                      <div className="flex items-center gap-1">
                        <Building2 className="h-4 w-4" />
                        소속 대행사 (선택사항)
                      </div>
                    </Label>
                    <Select value={selectedAgencyId} onValueChange={setSelectedAgencyId}>
                      <SelectTrigger id="signup-agency" data-testid="select-signup-agency">
                        <SelectValue placeholder="대행사를 통해 가입하셨나요?" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">직접 가입 (대행사 없음)</SelectItem>
                        {agenciesData.agencies.map((agency) => (
                          <SelectItem key={agency.id} value={agency.id}>
                            {agency.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      대행사를 통해 가입하시면 대행사 지원을 받을 수 있습니다
                    </p>
                  </div>
                )}
                
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="terms-agree"
                      checked={termsAgreed}
                      onCheckedChange={(checked) => setTermsAgreed(checked === true)}
                      data-testid="checkbox-terms"
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <label
                        htmlFor="terms-agree"
                        className="text-sm font-medium leading-none cursor-pointer"
                      >
                        서비스 이용약관에 동의합니다 <span className="text-destructive">*</span>
                      </label>
                      <Dialog open={termsDialogOpen} onOpenChange={setTermsDialogOpen}>
                        <DialogTrigger asChild>
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                            data-testid="button-view-terms"
                          >
                            <FileText className="h-3 w-3" />
                            약관 전문 보기
                          </button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[80vh] bg-background">
                          <DialogHeader>
                            <DialogTitle className="text-foreground">위픽 서비스 이용약관</DialogTitle>
                          </DialogHeader>
                          <ScrollArea className="h-[60vh] pr-4">
                            <div className="bg-muted/50 rounded-lg p-4 border">
                              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                                {TERMS_OF_SERVICE}
                              </div>
                            </div>
                          </ScrollArea>
                          <div className="flex justify-end gap-2 pt-4 border-t">
                            <Button
                              variant="outline"
                              onClick={() => setTermsDialogOpen(false)}
                              data-testid="button-close-terms"
                            >
                              닫기
                            </Button>
                            <Button
                              onClick={() => {
                                setTermsAgreed(true);
                                setTermsDialogOpen(false);
                              }}
                              data-testid="button-agree-terms"
                            >
                              동의하고 닫기
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || !termsAgreed}
                  data-testid="button-signup"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      가입 중...
                    </>
                  ) : (
                    "회원가입"
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="text-center text-sm text-muted-foreground">
          <p className="w-full">
            문의: help@wepick.co.kr
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

import { Link } from "wouter";
import {
  ArrowRight,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppIconTile } from "@/components/app-icon-tile";
import { featureObjectIcons } from "@/components/feature-icons";

export default function CampaignsStart() {
  return (
    <div className="animate-fade-in">
      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
          <AppIconTile imageSrc={featureObjectIcons.send} className="h-14 w-14 rounded-2xl" imageClassName="h-10 w-10" />
          <p className="mt-4 text-caption font-semibold text-primary">문자 보내기</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-foreground sm:text-4xl">
            누구에게 보낼까요?
          </h1>
          <p className="mt-2 text-small text-muted-foreground">
            받을 고객을 정하고 바로 발송해요.
          </p>
          <Button asChild className="mt-6 h-12 w-full max-w-sm gap-2 text-base" data-testid="button-start-campaign">
            <Link href="/campaigns/new">
              문자 보내기
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className="mt-2 h-10 gap-2 px-3 text-small text-muted-foreground"
            data-testid="button-view-campaign-history"
          >
            <Link href="/campaigns/history">
              <History className="h-4 w-4" />
              최근 발송 보기
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

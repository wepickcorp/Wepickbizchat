import type { SVGProps } from "react";
import objectBellIcon from "@/assets/feature-icons/object-bell.png";
import objectCheckIcon from "@/assets/feature-icons/object-check.png";
import objectClickIcon from "@/assets/feature-icons/object-click.png";
import objectDataIcon from "@/assets/feature-icons/object-data.png";
import objectDataAltIcon from "@/assets/feature-icons/object-data-alt.png";
import objectDocumentCheckIcon from "@/assets/feature-icons/object-document-check.png";
import objectClockIcon from "@/assets/feature-icons/object-clock.png";
import objectMegaphoneIcon from "@/assets/feature-icons/object-megaphone.png";
import objectMessageIcon from "@/assets/feature-icons/object-message.png";
import objectPhoneIcon from "@/assets/feature-icons/object-phone.png";
import objectReceiptIcon from "@/assets/feature-icons/object-receipt.png";
import objectRefreshIcon from "@/assets/feature-icons/object-refresh.png";
import objectSendIcon from "@/assets/feature-icons/object-send.png";
import objectSettingsIcon from "@/assets/feature-icons/object-settings.png";

type FeatureIconProps = SVGProps<SVGSVGElement>;

export const featureObjectIcons = {
  bell: objectBellIcon,
  check: objectCheckIcon,
  click: objectClickIcon,
  data: objectDataIcon,
  dataAlt: objectDataAltIcon,
  documentCheck: objectDocumentCheckIcon,
  clock: objectClockIcon,
  megaphone: objectMegaphoneIcon,
  message: objectMessageIcon,
  phone: objectPhoneIcon,
  receipt: objectReceiptIcon,
  refresh: objectRefreshIcon,
  send: objectSendIcon,
  settings: objectSettingsIcon,
};

function FeatureIconBase({ children, ...props }: FeatureIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export function FeatureSendIcon(props: FeatureIconProps) {
  return (
    <FeatureIconBase {...props}>
      <path
        d="M4.65 12.94 18.7 5.86c.92-.46 1.91.43 1.55 1.4l-4.98 13.16c-.36.95-1.69.99-2.1.06l-2.01-4.49 3.72-3.74a.84.84 0 0 0-1.18-1.19l-3.77 3.7-4.98-1.71c-.96-.33-1.21-1.66-.3-2.11Z"
        fill="currentColor"
      />
      <path d="m6.6 12.09 8.8-4.47-5.1 5.05-3.7-.58Z" fill="white" opacity=".82" />
    </FeatureIconBase>
  );
}

export function FeatureCampaignIcon(props: FeatureIconProps) {
  return (
    <FeatureIconBase {...props}>
      <path
        d="M5.2 9.4c0-1.1.9-2 2-2h3.55l5.76-2.4c.83-.34 1.75.27 1.75 1.17v11.66c0 .9-.92 1.51-1.75 1.17l-5.76-2.4H7.2a2 2 0 0 1-2-2V9.4Z"
        fill="currentColor"
      />
      <path d="M7.5 9.8h3.05v4.4H7.5a.7.7 0 0 1-.7-.7v-3a.7.7 0 0 1 .7-.7Z" fill="white" opacity=".86" />
      <path d="M9.9 16.8h2.15l.8 2.1a1.25 1.25 0 0 1-2.32.92L9.9 16.8Z" fill="currentColor" opacity=".58" />
    </FeatureIconBase>
  );
}

export function FeatureCoinsIcon(props: FeatureIconProps) {
  return (
    <FeatureIconBase {...props}>
      <path
        d="M12 4.5c4.1 0 7.1 1.32 7.1 3.1v8.8c0 1.78-3 3.1-7.1 3.1s-7.1-1.32-7.1-3.1V7.6c0-1.78 3-3.1 7.1-3.1Z"
        fill="currentColor"
      />
      <path d="M17.3 7.7c0 .86-2.37 1.55-5.3 1.55s-5.3-.7-5.3-1.55 2.37-1.55 5.3-1.55 5.3.7 5.3 1.55Z" fill="white" opacity=".78" />
      <path d="M6.7 11.4c1.2.84 3.18 1.35 5.3 1.35s4.1-.51 5.3-1.35" stroke="white" strokeWidth="1.35" strokeLinecap="round" opacity=".75" />
      <path d="M6.7 15.1c1.2.84 3.18 1.35 5.3 1.35s4.1-.51 5.3-1.35" stroke="white" strokeWidth="1.35" strokeLinecap="round" opacity=".75" />
    </FeatureIconBase>
  );
}

export function FeatureChartIcon(props: FeatureIconProps) {
  return (
    <FeatureIconBase {...props}>
      <path d="M5.9 18.8a2 2 0 0 1-2-2V6.9a1.6 1.6 0 0 1 3.2 0v8.7h11a1.6 1.6 0 1 1 0 3.2H5.9Z" fill="currentColor" opacity=".22" />
      <path d="M7.9 13.2c.78-.78 2.05-.78 2.83 0l.54.54 4.64-4.64a1.75 1.75 0 0 1 2.48 2.48l-5.74 5.74a1.95 1.95 0 0 1-2.76 0L7.9 15.34a1.5 1.5 0 0 1 0-2.14Z" fill="currentColor" />
      <path d="M16.5 8h2.45v2.45" stroke="white" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" opacity=".82" />
    </FeatureIconBase>
  );
}

export function FeatureCheckIcon(props: FeatureIconProps) {
  return (
    <FeatureIconBase {...props}>
      <path d="M12 20.2a8.2 8.2 0 1 0 0-16.4 8.2 8.2 0 0 0 0 16.4Z" fill="currentColor" />
      <path d="m8.55 12.12 2.1 2.1 4.8-5.02" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </FeatureIconBase>
  );
}

export function FeatureClockIcon(props: FeatureIconProps) {
  return (
    <FeatureIconBase {...props}>
      <path d="M12 20.3a8.3 8.3 0 1 0 0-16.6 8.3 8.3 0 0 0 0 16.6Z" fill="currentColor" opacity=".24" />
      <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" fill="currentColor" />
      <path d="M12 8.45v3.7l2.45 1.45" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </FeatureIconBase>
  );
}

export function FeatureClickIcon(props: FeatureIconProps) {
  return (
    <FeatureIconBase {...props}>
      <path d="M6.4 4.85 17.8 10a1.15 1.15 0 0 1-.18 2.16l-3.42.87 2.65 2.65a1.6 1.6 0 1 1-2.27 2.26l-2.6-2.6-.85 3.35a1.15 1.15 0 0 1-2.16.18L3.8 7.45c-.5-1.1.97-2.09 2.6-2.6Z" fill="currentColor" />
      <path d="M5.55 3.9 4.8 2.4M9.2 4l.55-1.58M3.9 7.6l-1.58.55" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity=".7" />
      <path d="m7.1 7.7 3.07 6.75.75-2.92 3-.77L7.1 7.7Z" fill="white" opacity=".82" />
    </FeatureIconBase>
  );
}

export function FeatureDocumentCheckIcon(props: FeatureIconProps) {
  return (
    <FeatureIconBase {...props}>
      <path d="M7.1 3.8h6.25l4.05 4.05V18a2.2 2.2 0 0 1-2.2 2.2H7.1A2.2 2.2 0 0 1 4.9 18V6a2.2 2.2 0 0 1 2.2-2.2Z" fill="currentColor" />
      <path d="M13.2 4.2v3.5c0 .5.4.9.9.9h3.15" fill="white" opacity=".62" />
      <path d="m8.1 13.1 2.05 2.05 4.35-4.5" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </FeatureIconBase>
  );
}

export function FeatureHistoryIcon(props: FeatureIconProps) {
  return (
    <FeatureIconBase {...props}>
      <path d="M12 4a8 8 0 1 1-7.74 10.02 1.55 1.55 0 1 1 3-.8A4.9 4.9 0 1 0 8.1 8.6h1.25a1.35 1.35 0 1 1 0 2.7H5.4a1.4 1.4 0 0 1-1.4-1.4V5.95a1.35 1.35 0 1 1 2.7 0v.48A7.98 7.98 0 0 1 12 4Z" fill="currentColor" />
      <path d="M12 8.1v4l2.62 1.55" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </FeatureIconBase>
  );
}

export function FeaturePhoneIcon(props: FeatureIconProps) {
  return (
    <FeatureIconBase {...props}>
      <path d="M8.05 4.55 9.8 8.2c.32.66.13 1.45-.45 1.9l-1.13.86a10.38 10.38 0 0 0 4.82 4.82l.86-1.13c.45-.58 1.24-.77 1.9-.45l3.65 1.75c.74.36 1.1 1.22.83 2l-.55 1.58c-.25.73-.95 1.2-1.72 1.14C10.25 20.1 3.9 13.75 3.33 5.99a1.9 1.9 0 0 1 1.14-1.72l1.58-.55c.78-.27 1.64.09 2 .83Z" fill="currentColor" />
      <path d="M14.2 4.65c2.1.38 3.77 2.05 4.15 4.15M14.4 7.5c.73.25 1.35.87 1.6 1.6" stroke="white" strokeWidth="1.45" strokeLinecap="round" opacity=".78" />
    </FeatureIconBase>
  );
}

export function FeatureReceiptIcon(props: FeatureIconProps) {
  return (
    <FeatureIconBase {...props}>
      <path d="M6.8 3.7h10.4a1.8 1.8 0 0 1 1.8 1.8v14.2c0 .8-.95 1.22-1.55.7l-1.2-1.04-1.22 1.06a1.05 1.05 0 0 1-1.36 0l-1.22-1.06-1.22 1.06a1.05 1.05 0 0 1-1.36 0l-1.22-1.06-1.2 1.04c-.6.52-1.55.1-1.55-.7V5.5a1.8 1.8 0 0 1 1.8-1.8Z" fill="currentColor" />
      <path d="M8.7 8h6.6M8.7 11.2h6.6M8.7 14.4h3.8" stroke="white" strokeWidth="1.55" strokeLinecap="round" opacity=".85" />
    </FeatureIconBase>
  );
}

export function FeatureBellIcon(props: FeatureIconProps) {
  return (
    <FeatureIconBase {...props}>
      <path d="M12 3.8a5.65 5.65 0 0 0-5.65 5.65v2.35c0 .9-.33 1.77-.93 2.44l-.76.85c-.72.8-.15 2.06.93 2.06H18.4c1.08 0 1.65-1.26.93-2.06l-.76-.85a3.65 3.65 0 0 1-.93-2.44V9.45A5.65 5.65 0 0 0 12 3.8Z" fill="currentColor" />
      <path d="M9.7 18.25a2.45 2.45 0 0 0 4.6 0H9.7Z" fill="currentColor" opacity=".5" />
      <path d="M15.25 9.3A3.25 3.25 0 0 0 12 6.05" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity=".8" />
    </FeatureIconBase>
  );
}

export function FeatureSettingsIcon(props: FeatureIconProps) {
  return (
    <FeatureIconBase {...props}>
      <path d="M10.5 3.9h3l.45 2.02c.4.15.79.31 1.16.5l1.75-1.1 2.12 2.12-1.1 1.75c.19.37.35.76.5 1.16l2.02.45v3l-2.02.45c-.15.4-.31.79-.5 1.16l1.1 1.75-2.12 2.12-1.75-1.1c-.37.19-.76.35-1.16.5l-.45 2.02h-3l-.45-2.02c-.4-.15-.79-.31-1.16-.5l-1.75 1.1-2.12-2.12 1.1-1.75c-.19-.37-.35-.76-.5-1.16L3.6 13.8v-3l2.02-.45c.15-.4.31-.79.5-1.16l-1.1-1.75 2.12-2.12 1.75 1.1c.37-.19.76-.35 1.16-.5l.45-2.02Z" fill="currentColor" />
      <path d="M12 15.1a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2Z" fill="white" opacity=".82" />
    </FeatureIconBase>
  );
}

export function FeatureMessageIcon(props: FeatureIconProps) {
  return (
    <FeatureIconBase {...props}>
      <path d="M5.9 5.1h12.2a2.4 2.4 0 0 1 2.4 2.4v6.8a2.4 2.4 0 0 1-2.4 2.4h-5.6l-4.15 3.05c-.7.52-1.7.02-1.7-.85v-2.2H5.9a2.4 2.4 0 0 1-2.4-2.4V7.5a2.4 2.4 0 0 1 2.4-2.4Z" fill="currentColor" />
      <path d="M7.7 9.2h6.8M7.7 12.4h8.6" stroke="white" strokeWidth="1.55" strokeLinecap="round" opacity=".86" />
      <path d="M17.5 7.35a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z" fill="white" opacity=".86" />
    </FeatureIconBase>
  );
}

export function FeatureAlertIcon(props: FeatureIconProps) {
  return (
    <FeatureIconBase {...props}>
      <path d="M10.06 4.9c.86-1.48 3.02-1.48 3.88 0l6.18 10.7c.86 1.5-.22 3.37-1.94 3.37H5.82c-1.72 0-2.8-1.87-1.94-3.36l6.18-10.7Z" fill="currentColor" />
      <path d="M12 8.3v4.6M12 16.2h.01" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </FeatureIconBase>
  );
}

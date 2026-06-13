export interface TemplateVariableSchemaItem {
  key?: string;
  name?: string;
  label?: string;
  type?: "text" | "number" | "date" | "dateRange" | "tel" | "url";
  required?: boolean;
  placeholder?: string;
  suffix?: string;
  format?: string;
}

export interface VariableTemplateLike {
  titleTemplate?: string | null;
  lmsTitleTemplate?: string | null;
  title?: string | null;
  contentTemplate?: string | null;
  lmsContentTemplate?: string | null;
  content?: string | null;
  lmsContent?: string | null;
  variableSchema?: TemplateVariableSchemaItem[] | null;
}

export interface NormalizedTemplateVariableSchemaItem {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "dateRange" | "tel" | "url";
  required: boolean;
  placeholder?: string;
  suffix?: string;
  format?: string;
}

export function getTemplateVariableKey(variable: TemplateVariableSchemaItem): string {
  return variable.key || variable.name || "";
}

export function getTemplateVariableLabel(variable: TemplateVariableSchemaItem): string {
  const key = getTemplateVariableKey(variable);
  if (variable.label && variable.label !== key) return variable.label;

  const normalized = key.toLowerCase().replace(/\s+/g, "");
  const fallbackLabels: Record<string, string> = {
    brandname: "브랜드명",
    brand: "브랜드명",
    companyname: "회사명",
    company: "회사명",
    eventname: "이벤트명",
    event: "이벤트명",
    benefit: "혜택",
    period: "기간",
    daterange: "기간",
    startdate: "시작일",
    enddate: "종료일",
    url: "URL",
    link: "URL",
    place: "장소",
    location: "장소",
    phone: "연락처",
    tel: "연락처",
  };

  return fallbackLabels[normalized] || variable.label || key;
}

function inferVariableType(key: string): Required<TemplateVariableSchemaItem>["type"] {
  const normalized = key.toLowerCase().replace(/\s+/g, "");
  if (normalized.includes("url") || normalized.includes("link") || normalized.includes("링크")) return "url";
  if (normalized.includes("phone") || normalized.includes("tel") || normalized.includes("연락처") || normalized.includes("전화")) return "tel";
  if (normalized.includes("period") || normalized.includes("daterange") || normalized.includes("기간")) return "dateRange";
  if (normalized.includes("date") || normalized.includes("일자") || normalized.includes("날짜")) return "date";
  return "text";
}

function extractTemplateVariableKeys(...templates: Array<string | null | undefined>) {
  const keys = new Set<string>();
  const variablePattern = /\{\{([^{}]+)\}\}|(?<!\{)\{([^{}]+)\}(?!\})/g;

  for (const template of templates) {
    if (!template) continue;
    variablePattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = variablePattern.exec(template)) !== null) {
      const key = String(match[1] || match[2] || "").trim();
      if (key) keys.add(key);
    }
  }

  return Array.from(keys);
}

export function getTemplateVariableSchema(template: VariableTemplateLike): NormalizedTemplateVariableSchemaItem[] {
  const existing = template.variableSchema || [];
  const existingByKey = new Map(
    existing
      .map((variable) => [getTemplateVariableKey(variable), variable] as const)
      .filter(([key]) => Boolean(key)),
  );

  const inferredKeys = extractTemplateVariableKeys(
    template.titleTemplate,
    template.lmsTitleTemplate,
    template.title,
    template.contentTemplate,
    template.lmsContentTemplate,
    template.content,
    template.lmsContent,
  );

  const orderedKeys = [
    ...existing.map(getTemplateVariableKey).filter(Boolean),
    ...inferredKeys.filter((key) => !existingByKey.has(key)),
  ];

  return orderedKeys.map((key) => {
    const existingVariable = existingByKey.get(key);
    return {
      key,
      label: getTemplateVariableLabel(existingVariable || { key }),
      type: existingVariable?.type || inferVariableType(key),
      required: existingVariable?.required ?? true,
      placeholder: existingVariable?.placeholder,
      suffix: existingVariable?.suffix,
      format: existingVariable?.format,
    };
  });
}

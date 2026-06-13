import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Image, Smartphone, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getTemplateVariableKey,
  getTemplateVariableLabel,
  getTemplateVariableSchema,
} from "@/lib/template-variables";

interface VariableSchemaItem {
  key?: string;
  name?: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'dateRange' | 'tel' | 'url';
  required?: boolean;
  placeholder?: string;
  suffix?: string;
  format?: string;
}

function getVariableKey(variable: VariableSchemaItem): string {
  return getTemplateVariableKey(variable);
}

function getVariableLabel(variable: VariableSchemaItem): string {
  return getTemplateVariableLabel(variable);
}

interface RecommendedTemplate {
  id: string;
  name: string;
  category: string;
  purpose: string;
  titleTemplate?: string;
  contentTemplate: string;
  variableSchema?: VariableSchemaItem[];
  defaultImageUrl?: string;
  messageType?: string;
  rcsType?: number;
}

interface TemplateVariableEditorProps {
  template: RecommendedTemplate;
  variableValues: Record<string, any>;
  onVariableChange: (key: string, value: any) => void;
  onAllVariablesChange: (values: Record<string, any>) => void;
}

function replaceVariables(template: string, variables: Record<string, any>): string {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    const doubleBracePlaceholder = `{{${key}}}`;
    const singleBracePlaceholder = `{${key}}`;
    let displayValue = value;

    if (value && typeof value === 'object' && value.start && value.end) {
      displayValue = `${value.start} ~ ${value.end}`;
    }

    const fallbackValue = `{${key}}`;
    result = result
      .split(doubleBracePlaceholder)
      .join(displayValue || fallbackValue)
      .split(singleBracePlaceholder)
      .join(displayValue || fallbackValue);
  }

  return result;
}

function formatUnfilledVariables(template: string, variableSchema: VariableSchemaItem[]): string {
  const schemaFormatted = variableSchema.reduce((result, variable) => {
    const key = getVariableKey(variable);
    if (!key) return result;
    const label = getVariableLabel(variable);
    return result
      .split(`{{${key}}}`)
      .join(`{${label}}`)
      .split(`{${key}}`)
      .join(`{${label}}`);
  }, template);

  return schemaFormatted
    .replace(/\{\{([^{}]+)\}\}/g, (_, key) => `{${getVariableLabel({ key, label: key, type: "text" })}}`)
    .replace(/(?<!\{)\{([^{}]+)\}(?!\})/g, (_, key) => `{${getVariableLabel({ key, label: key, type: "text" })}}`);
}

function getInputType(type: VariableSchemaItem["type"]) {
  if (type === "number") return "number";
  if (type === "date") return "date";
  if (type === "tel") return "tel";
  if (type === "url") return "url";
  return "text";
}

export default function TemplateVariableEditor({
  template,
  variableValues,
  onVariableChange,
  onAllVariablesChange,
}: TemplateVariableEditorProps) {
  const [localValues, setLocalValues] = useState<Record<string, any>>(variableValues);

  useEffect(() => {
    setLocalValues(variableValues);
  }, [variableValues]);

  const handleChange = (key: string, value: any) => {
    const newValues = { ...localValues, [key]: value };
    setLocalValues(newValues);
    onVariableChange(key, value);
    onAllVariablesChange(newValues);
  };

  const variableSchema = getTemplateVariableSchema(template);
  const previewTitle = template.titleTemplate
    ? formatUnfilledVariables(replaceVariables(template.titleTemplate, localValues), variableSchema)
    : '';
  const previewContent = formatUnfilledVariables(replaceVariables(template.contentTemplate, localValues), variableSchema);

  const missingRequired = variableSchema.filter(
    v => {
      const value = localValues[getVariableKey(v)];
      if (value && typeof value === "object" && ("start" in value || "end" in value)) {
        return v.required && (!value.start || !value.end);
      }
      return v.required && !value;
    }
  );

  const getRcsTypeLabel = (type?: number) => {
    const labels: Record<number, string> = {
      0: '스탠다드',
      1: 'LMS',
      2: '슬라이드',
      3: '이미지강조A',
      4: '이미지강조B',
      5: '상품소개세로',
    };
    return labels[type ?? 4] || 'RCS';
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg" data-testid="text-template-variable-editor-title">필요한 정보만 입력해주세요</CardTitle>
            <CardDescription>
              {variableSchema.length > 0
                ? '문구는 검수가 끝난 메시지로 고정돼요. 아래 정보만 채우면 메시지가 자동으로 완성됩니다.'
                : '이 메시지는 추가 입력이 필요하지 않아요'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {variableSchema.map((variable) => {
              const varKey = getVariableKey(variable);
              const label = getVariableLabel(variable);
              return (
                <div key={varKey} className="space-y-2">
                  <Label htmlFor={varKey} className="flex items-center gap-2">
                    {label}
                    {variable.required && (
                      <Badge variant="destructive" className="text-xs">필수</Badge>
                    )}
                    {variable.suffix && (
                      <span className="text-xs text-muted-foreground">({variable.suffix})</span>
                    )}
                  </Label>

                  {variable.type === 'dateRange' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">시작일</p>
                        <Input
                          type="date"
                          value={localValues[varKey]?.start || ''}
                          onChange={(e) => handleChange(varKey, {
                            ...localValues[varKey],
                            start: e.target.value
                          })}
                          data-testid={`input-variable-${varKey}-start`}
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">종료일</p>
                        <Input
                          type="date"
                          value={localValues[varKey]?.end || ''}
                          onChange={(e) => handleChange(varKey, {
                            ...localValues[varKey],
                            end: e.target.value
                          })}
                          data-testid={`input-variable-${varKey}-end`}
                        />
                      </div>
                    </div>
                  ) : (
                    <Input
                      id={varKey}
                      type={getInputType(variable.type)}
                      placeholder={variable.placeholder || `${label}만 입력`}
                      value={localValues[varKey] || ''}
                      onChange={(e) => handleChange(varKey, e.target.value)}
                      data-testid={`input-variable-${varKey}`}
                    />
                  )}

                  {variable.format && (
                    <p className="text-xs text-muted-foreground">형식: {variable.format}</p>
                  )}
                </div>
              );
            })}

            {variableSchema.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <Smartphone className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>이 메시지는 바로 사용할 수 있어요</p>
              </div>
            )}
          </CardContent>
        </Card>

        {missingRequired.length > 0 && (
          <Card className="border-destructive">
            <CardContent className="pt-4">
              <p className="text-sm text-destructive">
                {missingRequired.map(getVariableLabel).join(', ')} 항목을 입력해주세요
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg" data-testid="text-template-variable-preview-title">이렇게 보내드립니다</CardTitle>
              <Badge variant="outline">{getRcsTypeLabel(template.rcsType)}</Badge>
            </div>
            <CardDescription>{template.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted rounded-lg overflow-hidden">
              {template.defaultImageUrl && (
                <div className="relative h-40 bg-muted">
                  <img
                    src={template.defaultImageUrl}
                    alt="미리보기"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="p-4 space-y-2">
                {previewTitle && (
                  <p className="font-bold text-lg">{previewTitle}</p>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {previewContent}
                </p>
              </div>
            </div>

            <div className="mt-4 text-xs text-muted-foreground flex items-center justify-between">
              <span>
                {template.messageType || 'RCS'} · {getRcsTypeLabel(template.rcsType)}
              </span>
              <span>
                {previewContent.length}자
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

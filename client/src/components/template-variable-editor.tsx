import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Image, Smartphone, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

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
  return variable.key || variable.name || '';
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
    const placeholder = `{${key}}`;
    let displayValue = value;
    
    if (value && typeof value === 'object' && value.start && value.end) {
      displayValue = `${value.start} ~ ${value.end}`;
    }
    
    result = result.split(placeholder).join(displayValue || `{${key}}`);
  }
  
  return result;
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

  const variableSchema = template.variableSchema || [];
  const previewTitle = template.titleTemplate 
    ? replaceVariables(template.titleTemplate, localValues)
    : '';
  const previewContent = replaceVariables(template.contentTemplate, localValues);

  const missingRequired = variableSchema.filter(
    v => v.required && !localValues[getVariableKey(v)]
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
            <CardTitle className="text-lg">메시지 정보 입력</CardTitle>
            <CardDescription>
              {variableSchema.length > 0 
                ? '아래 정보를 입력하면 메시지가 자동으로 완성됩니다'
                : '이 템플릿은 추가 입력이 필요하지 않습니다'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {variableSchema.map((variable) => {
              const varKey = getVariableKey(variable);
              return (
                <div key={varKey} className="space-y-2">
                  <Label htmlFor={varKey} className="flex items-center gap-2">
                    {variable.label}
                    {variable.required && (
                      <Badge variant="destructive" className="text-xs">필수</Badge>
                    )}
                    {variable.suffix && (
                      <span className="text-xs text-muted-foreground">({variable.suffix})</span>
                    )}
                  </Label>
                  
                  {variable.type === 'dateRange' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="date"
                        value={localValues[varKey]?.start || ''}
                        onChange={(e) => handleChange(varKey, {
                          ...localValues[varKey],
                          start: e.target.value
                        })}
                        data-testid={`input-variable-${varKey}-start`}
                      />
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
                  ) : (
                    <Input
                      id={varKey}
                      type={variable.type === 'number' ? 'number' : variable.type === 'date' ? 'date' : 'text'}
                      placeholder={variable.placeholder || `${variable.label} 입력`}
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
                <p>이 템플릿은 바로 사용할 수 있습니다</p>
              </div>
            )}
          </CardContent>
        </Card>

        {missingRequired.length > 0 && (
          <Card className="border-destructive">
            <CardContent className="pt-4">
              <p className="text-sm text-destructive">
                {missingRequired.map(v => v.label).join(', ')} 항목을 입력해주세요
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">미리보기</CardTitle>
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

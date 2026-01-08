import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, GripVertical, AlertCircle } from "lucide-react";

export interface VariableSchemaItem {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'dateRange' | 'tel' | 'url';
  required?: boolean;
  placeholder?: string;
  suffix?: string;
  format?: string;
}

const VARIABLE_TYPES: { value: VariableSchemaItem['type']; label: string; description: string }[] = [
  { value: 'text', label: '텍스트', description: '브랜드명, 상품명 등' },
  { value: 'number', label: '숫자', description: '할인율, 가격 등' },
  { value: 'date', label: '날짜', description: '이벤트 시작일 등' },
  { value: 'dateRange', label: '기간', description: '이벤트 기간 등' },
  { value: 'tel', label: '전화번호', description: '연락처' },
  { value: 'url', label: 'URL', description: '링크 주소' },
];

interface VariableSchemaEditorProps {
  value: VariableSchemaItem[];
  onChange: (value: VariableSchemaItem[]) => void;
  contentTemplate?: string;
}

export function VariableSchemaEditor({ value, onChange, contentTemplate }: VariableSchemaEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // 템플릿 변경 시 편집 상태 리셋
  useEffect(() => {
    setEditingIndex(null);
  }, [value]);

  const addVariable = () => {
    const newVariable: VariableSchemaItem = {
      key: '',
      label: '',
      type: 'text',
      required: true,
    };
    onChange([...value, newVariable]);
    setEditingIndex(value.length);
  };

  const updateVariable = (index: number, updates: Partial<VariableSchemaItem>) => {
    const newVariables = [...value];
    newVariables[index] = { ...newVariables[index], ...updates };
    onChange(newVariables);
  };

  const removeVariable = (index: number) => {
    const newVariables = value.filter((_, i) => i !== index);
    onChange(newVariables);
    setEditingIndex(null);
  };

  const extractVariablesFromTemplate = () => {
    if (!contentTemplate) return;
    const matches = contentTemplate.match(/\{([^}]+)\}/g);
    if (!matches) return;
    
    const existingKeys = new Set(value.map(v => v.key));
    const newVariables: VariableSchemaItem[] = [];
    
    matches.forEach(match => {
      const key = match.slice(1, -1);
      if (!existingKeys.has(key)) {
        newVariables.push({
          key,
          label: key,
          type: 'text',
          required: true,
        });
        existingKeys.add(key);
      }
    });
    
    if (newVariables.length > 0) {
      onChange([...value, ...newVariables]);
    }
  };

  const getUnusedVariables = () => {
    if (!contentTemplate) return [];
    return value.filter(v => !contentTemplate.includes(`{${v.key}}`));
  };

  const unusedVariables = getUnusedVariables();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">변수 설정</CardTitle>
            <CardDescription className="text-sm">
              메시지에서 사용자가 입력할 변수들을 정의합니다
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {contentTemplate && (
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={extractVariablesFromTemplate}
                data-testid="button-extract-variables"
              >
                템플릿에서 추출
              </Button>
            )}
            <Button 
              type="button" 
              size="sm" 
              onClick={addVariable}
              data-testid="button-add-variable"
            >
              <Plus className="h-4 w-4 mr-1" />
              변수 추가
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {unusedVariables.length > 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <span className="font-medium">미사용 변수:</span>{' '}
              {unusedVariables.map(v => `{${v.key}}`).join(', ')}
              <span className="text-amber-600 block mt-1">
                본문 템플릿에서 사용되지 않는 변수입니다
              </span>
            </div>
          </div>
        )}

        {value.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>정의된 변수가 없습니다</p>
            <p className="text-sm mt-1">
              본문에 {'{브랜드명}'}, {'{할인율}'} 등의 변수를 입력한 후 추출하거나 직접 추가하세요
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>변수명</TableHead>
                <TableHead>표시 라벨</TableHead>
                <TableHead>유형</TableHead>
                <TableHead className="w-20">필수</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {value.map((variable, index) => (
                <TableRow key={index}>
                  <TableCell className="cursor-grab text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {`{${variable.key || '...'}}`}
                      </Badge>
                      {editingIndex === index ? (
                        <Input
                          value={variable.key}
                          onChange={(e) => updateVariable(index, { key: e.target.value.replace(/[^a-zA-Z0-9가-힣_]/g, '') })}
                          placeholder="변수명"
                          className="h-8 w-32"
                          data-testid={`input-variable-key-${index}`}
                        />
                      ) : (
                        <button
                          type="button"
                          className="text-left text-sm text-muted-foreground hover:text-foreground"
                          onClick={() => setEditingIndex(index)}
                        >
                          수정
                        </button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={variable.label}
                      onChange={(e) => updateVariable(index, { label: e.target.value })}
                      placeholder="입력 필드 라벨"
                      className="h-8"
                      data-testid={`input-variable-label-${index}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={variable.type}
                      onValueChange={(v: VariableSchemaItem['type']) => updateVariable(index, { type: v })}
                    >
                      <SelectTrigger className="h-8 w-28" data-testid={`select-variable-type-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VARIABLE_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            <span>{t.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={variable.required ?? true}
                      onCheckedChange={(checked) => updateVariable(index, { required: checked })}
                      data-testid={`switch-variable-required-${index}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => removeVariable(index)}
                      data-testid={`button-remove-variable-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {value.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <Label className="text-sm font-medium">변수 유형 안내</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {VARIABLE_TYPES.map((t) => (
                <div key={t.value} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{t.label}:</span> {t.description}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

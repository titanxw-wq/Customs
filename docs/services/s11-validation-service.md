# S11 - 质量校验服务

## 1. 服务概述

S11 质量校验服务对抽取的数据进行完整性、一致性、准确性验证和异常检测。

**技术栈**: 规则引擎 + 统计分析

---

## 2. 服务接口定义

```typescript
interface S11_ValidationRequest {
  case_id: UUID;
  file_id: UUID;
  data: ValidationInputData;
  validation_rules?: ValidationRule[];
}

type ValidationInputData =
  | { type: 'entities'; data: ExtractedEntity[] }
  | { type: 'relations'; data: ExtractedRelation[] }
  | { type: 'transaction'; data: TransactionData[] };

interface S11_ValidationResponse {
  code: number;
  message: string;
  data: {
    case_id: UUID;
    file_id: UUID;
    validation_results: ValidationResult[];
    summary: ValidationSummary;
  };
}
```

---

## 3. 核心类设计

```typescript
abstract class ValidationRule {
  abstract rule_id: string;
  abstract severity: 'error' | 'warning' | 'info';
  abstract description: string;

  abstract validate(data: any): ValidationResult[];
}

class CompletenessRule extends ValidationRule {
  private fieldName: string;

  constructor(rule_id: string, fieldName: string, severity) {
    super();
    this.fieldName = fieldName;
  }

  validate(data: any[]): ValidationResult[] {
    const results: ValidationResult[] = [];

    data.forEach((item, idx) => {
      if (!item[this.fieldName] || item[this.fieldName] === null) {
        results.push({
          rule_id: this.rule_id,
          severity: this.severity,
          status: 'failed',
          message: `Item ${idx}: Missing ${this.fieldName}`,
          affected_items: [item.id],
          suggestions: [`Provide ${this.fieldName} value`]
        });
      }
    });

    return results;
  }
}

class ConsistencyRule extends ValidationRule {
  private checkFn: (data: any) => ValidationResult[];

  validate(data: any): ValidationResult[] {
    return this.checkFn(data);
  }
}

class AnomalyDetectionRule extends ValidationRule {
  private detectFn: (data: any) => ValidationResult[];

  validate(data: any): ValidationResult[] {
    return this.detectFn(data);
  }
}

class S11_ValidationService {
  private rules: Map<string, ValidationRule[]> = new Map();

  constructor() {
    this.registerRules();
  }

  async validate(request: S11_ValidationRequest): Promise<S11_ValidationResponse> {
    const dataType = request.data.type;
    const rules = this.rules.get(dataType) || [];

    // 添加自定义规则
    if (request.validation_rules) {
      rules.push(...this.parseCustomRules(request.validation_rules));
    }

    const allResults: ValidationResult[] = [];

    // 执行验证
    for (const rule of rules) {
      try {
        const results = rule.validate(request.data.data);
        allResults.push(...results);
      } catch (error) {
        console.error(`Rule ${rule.rule_id} failed:`, error);
      }
    }

    return {
      code: 0,
      message: 'success',
      data: {
        case_id: request.case_id,
        file_id: request.file_id,
        validation_results: allResults,
        summary: this.generateSummary(allResults, rules.length)
      }
    };
  }

  private registerRules(): void {
    this.rules.set('entities', [
      new CompletenessRule('ENT-001', 'name', 'error'),
      this.createPhoneValidationRule(),
      this.createConfidenceRule()
    ]);

    this.rules.set('transaction', [
      this.createPositiveAmountRule(),
      this.createFutureDateRule(),
      this.createAnomalyDetectionRule()
    ]);
  }

  private createAnomalyDetectionRule(): AnomalyDetectionRule {
    return new class extends AnomalyDetectionRule {
      rule_id = 'TXN-003';
      severity = 'warning' as const;
      description = 'Detect large transactions';

      detectFn(data: TransactionData[]): ValidationResult[] {
        if (data.length < 5) return [];

        const amounts = data.map(t => t.amount);
        const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const std = Math.sqrt(
          amounts.map(a => (a - mean) ** 2).reduce((a, b) => a + b, 0) / amounts.length
        );
        const threshold = mean + 3 * std;

        return data
          .filter(t => t.amount > threshold)
          .map(t => ({
            rule_id: this.rule_id,
            severity: this.severity,
            status: 'failed' as const,
            message: `Large transaction: ${t.transaction_id}, amount: ${t.amount}`,
            affected_items: [t.transaction_id],
            suggestions: ['Verify for potential fraud']
          }));
      }
    }();
  }

  private generateSummary(results: ValidationResult[], totalRules: number): ValidationSummary {
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const warnings = results.filter(r => r.severity === 'warning').length;
    const errors = results.filter(r => r.severity === 'error').length;

    const qualityScore = totalRules > 0 ? (passed / totalRules) * 100 : 100;

    return {
      total_rules: totalRules,
      passed,
      failed,
      warnings,
      errors,
      quality_score: Math.round(qualityScore * 100) / 100
    };
  }
}
```

---

## 4. 规则定义格式

```typescript
interface ValidationRule {
  rule_id: string;
  rule_type: 'completeness' | 'consistency' | 'accuracy' | 'anomaly';
  severity: 'error' | 'warning' | 'info';
  condition: string;
  description: string;
}

interface ValidationResult {
  rule_id: string;
  severity: 'error' | 'warning' | 'info';
  status: 'passed' | 'failed' | 'skipped';
  message: string;
  affected_items: string[];
  suggestions?: string[];
}
```

---

## 5. 验证规则类型

### 5.1 完整性验证
- 必填字段检查
- 空值检查
- 格式验证

### 5.2 一致性验证
- 跨数据源一致性
- 时间序列一致性
- 关系一致性

### 5.3 准确性验证
- 业务规则校验
- 数据范围验证
- 引用完整性

### 5.4 异常检测
- 统计异常 (3σ 规则)
- 孤立点检测
- 异常模式识别

---

## 6. 质量分数计算

```typescript
interface ValidationSummary {
  total_rules: number;
  passed: number;
  failed: number;
  warnings: number;
  errors: number;
  quality_score: number;  // 0-100
}

function calculateQualityScore(summary: ValidationSummary): number {
  const passedWeight = 1.0;
  const warningWeight = 0.5;
  const errorWeight = 0.0;

  const score = (
    summary.passed * passedWeight +
    summary.warnings * warningWeight +
    summary.errors * errorWeight
  ) / summary.total_rules;

  return Math.round(score * 100);
}
```

---

## 7. 处理流程

```typescript
async function processValidation(request: S11_ValidationRequest) {
  // 1. 获取适用规则
  const rules = getRulesForDataType(request.data.type);

  // 2. 添加自定义规则
  if (request.validation_rules) {
    rules.push(...parseCustomRules(request.validation_rules));
  }

  // 3. 执行验证
  const allResults: ValidationResult[] = [];
  for (const rule of rules) {
    const results = await rule.validate(request.data.data);
    allResults.push(...results);
  }

  // 4. 生成摘要
  const summary = generateSummary(allResults, rules.length);

  return { validation_results: allResults, summary };
}
```

---

## 8. 错误码定义

| 错误码 | 说明 | 处理建议 |
|-------|------|---------|
| S11-001 | 规则解析失败 | 检查规则格式 |
| S11-002 | 验证超时 | 减少数据量 |

---

*版本: 1.0.0 | 更新日期: 2026-02-15*

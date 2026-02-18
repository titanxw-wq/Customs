# 证据端到端架构 v2.0 优化需求

**日期:** 2026-02-16
**评审方法:** Claude Flow 脑体协调，8 个并行智能体，每个任务 2-3 分钟
**基于文档:** brainstroming-review-summary-cn.md

---

## 一、优化需求概述

基于对证据端到端架构中数据清洗和证据挖掘部分的全面头脑风暴和评审，本档提出 4 大类优化需求，共包含 25 项具体改进建议。

### 优化范围

| 优化领域 | 优化项数 | 关键焦点 |
|---------|----------|------------|
| 数据清洗逻辑优化 | 11 | 验证规则、字段映射、数据质量评分 |
| 证据大表优化 | 10 | 语义提取、冲突解决、字段填充 |
| M1 规则引擎优化 | 8 | 新规则、评分机制、依赖管理 |
| 流程与架构优化 | 6 | 编排、审计、权限控制 |

---

## 二、数据清洗逻辑优化（11 项）

### 2.1 完整性验证增强

**需求描述：** 当前 S11 验证服务仅检查单个字段，缺少实体类型差异化的必填字段定义。

| # | 优化项 | 优先级 | 复杂度 | 影响 |
|---|---------|----------|---------|
| DC-001 | 实体类型特定的必填字段系统 | P0 | 低 | 高 |
| DC-002 | 跨源一致性验证框架 | P0 | 中 | 高 |
| DC-003 | 嵌套引用完整性验证 | P1 | 低 | 高 |
| DC-004 | 日期时间范围验证 | P1 | 低 | 中 |

**详细需求：**

**DC-001: 实体类型特定的必填字段系统**

1. **当前问题：**
   - S11 CompletenessRule 只检查 `name` 字段
   - 无实体类型差异（Person vs Company vs Transaction）
   - 缺少条件性必填字段（如 entity_type='buyer' 时需 address）

2. **v2.0 优化方案：**
   ```typescript
   // 实体类型特定的必填字段配置
   interface EntityTypeFieldConfig {
     entity_type: EntityType;
     required_fields: RequiredField[];
     conditional_requirements: ConditionalRequirement[];
     field_validators: Map<string, FieldValidator[]>;
   }

   interface RequiredField {
     field_name: string;
     severity: 'error' | 'warning';
     validation_regex?: string;
     custom_validator?: string;
     error_message: string;
   }

   interface ConditionalRequirement {
     condition: { field: string; operator: string; value: any };
     required_fields: string[];
   }

   // Person 实体配置示例
   const PERSON_CONFIG: EntityTypeFieldConfig = {
     entity_type: EntityType.PERSON,
     required_fields: [
       { field_name: 'name', severity: 'error', error_message: 'Person name is required' },
       { field_name: 'id_card', severity: 'warning', validation_regex: '\\d{17}[\\dXx]' },
       { field_name: 'phone', severity: 'warning', validation_regex: '1[3-9]\\d{9}' }
     ],
     conditional_requirements: [
       {
         condition: { field: 'role', operator: 'eq', value: 'buyer' },
         required_fields: ['address', 'contact_method']
       },
       {
         condition: { field: 'role', operator: 'eq', value: 'seller' },
         required_fields: ['address', 'business_license']
       }
     ]
   };

   // Company 实体配置示例
   const COMPANY_CONFIG: EntityTypeFieldConfig = {
     entity_type: EntityType.COMPANY,
     required_fields: [
       { field_name: 'company_name', severity: 'error', error_message: 'Company name is required' },
       { field_name: 'registration_number', severity: 'error', error_message: 'Registration number is required' },
       { field_name: 'legal_representative', severity: 'error', error_message: 'Legal representative is required' }
     ]
   };

   // Transaction 实体配置示例
   const TRANSACTION_CONFIG: EntityTypeFieldConfig = {
     entity_type: EntityType.TRANSACTION,
     required_fields: [
       { field_name: 'transaction_id', severity: 'error', error_message: 'Transaction ID is required' },
       { field_name: 'amount', severity: 'error', error_message: 'Transaction amount is required' },
       { field_name: 'currency', severity: 'error', error_message: 'Transaction currency is required' },
       { field_name: 'transaction_date', severity: 'error', error_message: 'Transaction date is required' }
     ],
     conditional_requirements: [
       {
         condition: { field: 'currency', operator: 'neq', value: 'CNY' },
         required_fields: ['exchange_rate']
       }
     ]
   };
   ```

3. **实施步骤：**
   - 第 1 周：定义实体类型配置和必填字段规则
   - 第 1.5 周：实现配置化验证引擎
   - 第 2 周：集成到 S11 验证服务

4. **成功标准：**
   - 95% 必填字段检测覆盖率
   - 实体类型区分准确率 >98%
   - 条件字段验证准确率 >99%

---

### 2.2 跨源一致性验证框架

**需求描述：** 当前 M1-008 提供基本跨源验证，但缺少语义相似度检测、时序冲突解决、源可靠性加权。

| # | 优化项 | 优先级 | 复杂度 | 影响 |
|---|---------|----------|---------|
| DC-005 | 语义相似度引擎 | P0 | 中 | 高 |
| DC-006 | 时序冲突解决 | P0 | 中 | 高 |
| DC-007 | 源可靠性评分系统 | P1 | 中 | 高 |
| DC-008 | 自动化冲突解决工作流 | P0 | 中 | 高 |

**详细需求：**

**DC-005: 语义相似度引擎**

1. **当前问题：**
   - 无法识别文本字段的语义差异（"张三" vs "张三"）
   - 缺少时序冲突解决（新记录 vs 旧记录优先级）

2. **v2.0 优化方案：**
   ```typescript
   // 语义相似度引擎接口
   interface SemanticSimilarityEngine {
     // 计算文本语义相似度
     calculateTextSimilarity(text1: string, text2: string): Promise<number>;

     // 批量语义相似度计算
     calculateBatchSimilarity(texts: string[], reference: string[]): Promise<number[]>;

     // 获取最相似的候选值
     findMostSimilarCandidates(
       targetText: string,
       candidateValues: string[],
       threshold: number
     ): Promise<CandidateMatch[]>;
   }

   interface CandidateMatch {
       value: string;
       similarity: number;
       source: string;
       confidence: number;
     }

   // 集成到 S11 验证
   class CrossSourceValidator {
     async validate(input: CrossSourceInput): Promise<CrossSourceOutput> {
       // 1. 提取同一实体的所有值
       const entityValues = await this.getEntityValues(input.entity_id, input.field_name);

       // 2. 计算两两相似度
       const similarityMatrix = await this.calculateSimilarityMatrix(entityValues);

       // 3. 识别冲突
       const conflicts = this.identifyConflicts(similarityMatrix, threshold);

       // 4. 解决冲突
       const resolution = await this.resolveConflicts(conflicts, strategy);

       return {
         validated: true,
         conflictDetected: conflicts.length > 0,
         resolution,
         similarityMatrix
       };
     }
   }
   ```

3. **实施步骤：**
   - 第 1-2 周：集成 Milvus 向量搜索引擎
   - 第 1.5 周：实现语义相似度计算算法
   - 第 2 周：实现时序冲突检测和解决
   - 第 2.5 周：集成到 M1 规则引擎

4. **成功标准：**
   - 跨源冲突检测准确率 >90%
   - 自动化冲突解决成功率 >85%

---

### 2.3 准确性验证增强

**需求描述：** 当前 S11 缺少身份证校验算法、银行卡 Luhn 校验、HS 编码验证。

| # | 优化项 | 优先级 | 复杂度 | 影响 |
|---|---------|----------|---------|
| DC-009 | 身份证校验码验证算法 | P1 | 低 | 高 |
| DC-010 | 银行卡 Luhn 校验算法 | P1 | 低 | 高 |
| DC-011 | HS 编码验证与分类 | P1 | 中 | 高 |

**详细需求：**

**DC-009: 身份证校验码验证算法**

1. **当前问题：**
   - S8 仅使用正则表达式 `\d{17}[\dXx]` 提取身份证号
   - 无校验位验证（地区码、出生日期）
   - OCR 错误无法检测（识别为错误的号码仍通过）

2. **v2.0 优化方案：**
   ```typescript
   // 18 位身份证校验
   class ChineseIDCardValidator {
     // 权重因子
     private static readonly WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2, 1];
     private static readonly CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

     validate(idNumber: string): IDCardValidationResult {
       // 1. 长度检查
       if (idNumber.length !== 18) {
         return { valid: false, id_number: idNumber, error_type: 'invalid_length' };
       }

       // 2. 格式检查
       if (!/^\d{17}[\dXx]$/.test(idNumber)) {
         return { valid: false, id_number: idNumber, error_type: 'invalid_format' };
       }

       // 3. 地区码验证（前 6 位）
       const regionCode = idNumber.substring(0, 6);
       const validRegions = ['11', '12', '13', '14', '15', '21', '22', '23', '31', '32', '33', '34', '35', '36', '37', '41', '42', '43', '44', '45', '46', '50', '51', '52', '53', '54', '61', '62', '63', '64', '65', '66', '68', '69', '70', '71', '72', '81', '82', '83', '84', '85', '86', '87', '88', '89', '90', '91'];
       if (!validRegions.includes(regionCode)) {
         return { valid: false, id_number: idNumber, error_type: 'invalid_region', parsed_info: { region_code } };
       }

       // 4. 出生日期验证（第 7-14 位，格式 YYYYMMDD）
       const birthDateStr = idNumber.substring(6, 14);
       const birthDate = this.parseBirthDate(birthDateStr);
       if (!birthDate) {
         return { valid: false, id_number: idNumber, error_type: 'invalid_date', parsed_info: {} };
       }

       // 5. 性别码验证（第 17 位）
       const genderDigit = parseInt(idNumber.charAt(16));
       const gender = genderDigit % 2 === 1 ? 'male' : 'female';

       // 6. 校验位验证（第 18 位）
       const checksum = this.calculateChecksum(idNumber.substring(0, 17));
       const expectedCheckDigit = this.CHECK_CODES[checksum];
       const actualCheckDigit = idNumber.charAt(17).toUpperCase();
       if (expectedCheckDigit !== actualCheckDigit) {
         return { valid: false, id_number: idNumber, error_type: 'checksum_failed', parsed_info: { region_code, birth_date, gender } };
       }

       // 有效身份证
       return {
         valid: true,
         id_number: idNumber,
         parsed_info: { region_code, birth_date, gender }
       };
     }
   }
   ```

3. **实施步骤：**
   - 第 3 天：在 S8 实体提取中集成校验
   - 第 5 天：在 S11 验证中注册为 AccuracyRule

4. **成功标准：**
   - 无效身份证检测准确率 >99.9%
   - 地区码验证准确率 >95%
   - 误报率 <0.1%

---

**DC-010: 银行卡 Luhn 校验算法**

1. **当前问题：**
   - S8 提取银行卡号但无格式验证
   - 无 BIN 查询无法识别发卡行
   - OCR 错误（如 '6200' 识别为 '620'）无法检测

2. **v2.0 优化方案：**
   ```typescript
   // Luhn 算法实现
   class BankCardValidator {
     // 检查数字格式
     validateFormat(cardNumber: string): boolean {
       const cleaned = cardNumber.replace(/[\s-]/g, '');
       const lengthRegex = /^\d{13,19}$/;
       return lengthRegex.test(cleaned);
     }

     // Luhn 算法校验
     validateLuhn(cardNumber: string): boolean {
       let sum = 0;
       let isEven = false;
       for (let i = cardNumber.length - 1; i >= 0; i--) {
         const digit = parseInt(cardNumber.charAt(i));
         if (isEven) {
           digit *= 2;
         }
         if (digit > 9) {
           digit -= 9;
         }
         sum += digit;
         isEven = !isEven;
       }
       return sum % 10 === 0;
     }

     // BIN 查询
     validateBin(cardNumber: string): BankInfo | null {
       const bin = cardNumber.substring(0, 6);
       const binInfo = this.binDatabase.get(bin);
       return binInfo;
     }

     validate(cardNumber: string): BankCardValidationResult {
       // 格式验证
       if (!this.validateFormat(cardNumber)) {
         return {
           valid: false,
           card_number: cardNumber,
           masked_number: this.mask(cardNumber),
           error_type: 'invalid_length'
         };
       }

       // Luhn 验证
       if (!this.validateLuhn(cardNumber)) {
         return {
           valid: false,
           card_number: cardNumber,
           masked_number: this.mask(cardNumber),
           error_type: 'luhn_failed'
         };
       }

       // BIN 查询
       const binInfo = this.validateBin(cardNumber);

       return {
         valid: true,
         card_number: cardNumber,
         masked_number: this.mask(cardNumber),
         card_info: binInfo
       };
     }
   }
   ```

3. **实施步骤：**
   - 第 1 周：建立 BIN 数据库
   - 第 1.5 周：集成到 S8 提取

4. **成功标准：**
   - 有效卡号验证准确率 >99%
   - 发卡行识别准确率 >95%
   - OCR 错误修正率 >90%

---

### 2.4 异常检测增强

**需求描述：** 当前 M1-009 仅支持 3-sigma 统计异常检测，无 IQR、孤立森林等多方法。

| # | 优化项 | 优先级 | 复杂度 | 影响 |
|---|---------|----------|---------|
| DC-012 | IQR 异常检测 | P2 | 低 | 中 |
| DC-013 | 孤立森林异常检测 | P2 | 中 | 高 |
| DC-014 | 时间序列异常检测 | P2 | 中 | 高 |
| DC-015 | 模式异常检测 | P2 | 中 | 中 |

**详细需求：**

**DC-012: IQR 异常检测（四分位距法）**

1. **当前问题：**
   - 仅 3-sigma 方法，假设正态分布
   - 对偏态分布敏感，误报率高
   - 对极端值过于敏感

2. **v2.0 优化方案：**
   ```typescript
   // IQR 异常检测
   class IQRAnomalyDetector {
     private config: IQRConfig;

     detect(dataPoints: Array<{ timestamp: string; value: number }>): IQAnomalyResult {
       // 1. 数据量检查
       if (dataPoints.length < this.config.min_samples) {
         return this.insufficientDataResult(dataPoints.length);
       }

       // 2. 提取并排序值
       const values = dataPoints
         .filter(d => !this.config.treat_zeros_as_missing || d.value !== 0)
         .map(d => d.value)
         .sort((a, b) => a - b);

       // 3. 计算四分位数
       const q1 = this.percentile(values, 25);
       const q3 = this.percentile(values, 75);
       const iqr = q3 - q1;
       const median = this.percentile(values, 50);

       // 4. 计算 IQR 范围
       const lowerBound = q1 - this.config.iqr_multiplier * iqr;
       const upperBound = q3 + this.config.iqr_multiplier * iqr;

       // 5. 检测异常值
       const anomalies: Anomaly[] = [];
       for (let i = 0; i < dataPoints.length; i++) {
         const point = dataPoints[i];

         if (point.value < lowerBound) {
           anomalies.push({
             index: i,
             timestamp: point.timestamp,
             value: point.value,
             anomaly_type: 'low',
             score: (lowerBound - point.value) / iqr
           });
         } else if (point.value > upperBound) {
           anomalies.push({
             index: i,
             timestamp: point.timestamp,
             value: point.value,
             anomaly_type: 'high',
             score: (point.value - upperBound) / iqr
           });
         }
       }

       const anomalyRate = anomalies.length / dataPoints.length;

       return {
         anomalies,
         statistics: { q1, q3, iqr, lower_bound, upper_bound, median },
         anomaly_rate
       };
     }
   }
   ```

3. **实施步骤：**
   - 第 1 周：集成 IQR 检测算法
   - 第 1.5 周：调优 IQR 乘数（默认 1.5）

4. **成功标准：**
   - 异常检测准确率 >85%
   - 误报率降低 30%

---

### 2.5 字段映射优化

**需求描述：** 当前字段映射缺少源优先级配置、置信度聚合、字段冲突解决。

| # | 优化项 | 优先级 | 复杂度 | 影响 |
|---|---------|----------|---------|
| DC-016 | 源优先级配置系统 | P1 | 中 | 高 |
| DC-017 | 字段冲突解决工作流 | P1 | 中 | 高 |
| DC-018 | 置信度聚合与字段状态 | P1 | 中 | 高 |
| DC-019 | 缺失字段检测 | P1 | 高 | 高 |

**详细需求：**

**DC-016: 源优先级配置系统**

1. **当前问题：**
   - 无源优先级定义
   - 所有源权重相同
   - 无时序加权

2. **v2.0 优化方案：**
   ```typescript
   // 源优先级配置
   interface SourcePriorityConfig {
     source_priorities: Map<string, SourcePriorityRule[]>;

     getDefaultPriority(sourceType: string): number {
       // 默认优先级
       const defaults: {
         'customs_database': 100,      // 海关数据库
         'official_document': 95,       // 官方文件
         'bank_statement': 90,       // 银行对账单
         'im_message': 70,          // 聊天消息
         'email': 75,               // 电子邮件
         'manual_entry': 50,          // 人工录入
       };
       return defaults[sourceType] || 60;
     }

     getSourcePriority(sourceId: string, context: string): number {
       const rule = this.source_priorities.get(sourceId);
       return rule ? rule.priority : this.getDefaultPriority(sourceId);
     }
   }
   ```

3. **实施步骤：**
   - 第 1 周：定义源优先级规则
   - 第 1.5 周：集成到 M2 字段填充服务

4. **成功标准：**
   - 源优先级正确配置覆盖率 100%
   - 字段冲突自动解决率 >80%

---

### 2.6 质量评分优化

**需求描述：** 当前 S11 质量评分仅为简单通过/总数计算，缺少多维度评分、趋势分析。

| # | 优化项 | 优先级 | 复杂度 | 影响 |
|---|---------|----------|---------|
| DC-020 | 多维度质量评分系统 | P2 | 中 | 高 |
| DC-021 | 趋势分析模块 | P2 | 中 | 中 |
| DC-022 | 置信度区间计算 | P2 | 中 | 高 |
| DC-023 | 可操作化建议生成 | P1 | 中 | 高 |

**详细需求：**

**DC-020: 多维度质量评分系统**

1. **当前问题：**
   - 单维度评分（完整性、准确性、一致性）
   - 无置信度区间
   - 无趋势分析
   - 缺少可操作建议

2. **v2.0 优化方案：**
   ```typescript
   // 质量评分维度定义
   interface QualityDimension {
     dimension_name: string;
     weight: number;              // 权重 (0-1)
     threshold: number;           // 及格阈值
     pass_weight: number;        // 及格权重
     warning_weight: number;      // 警告权重
     error_weight: number;         // 错误权重
     critical_fail: boolean;   // 关键失败即整体失败
     contribution_rules: string[]; // 关联的规则 ID
   }

   // 完整性维度
   const COMPLETENESS_DIMENSION: QualityDimension = {
     dimension_name: 'completeness',
     weight: 0.30,
     threshold: 0.85,
     pass_weight: 1.0,
     warning_weight: 0.5,
     error_weight: 0.0,
     critical_fail: true,
     contribution_rules: ['DC-001', 'DC-002', 'DC-003']
   };

     // 准确性维度
     const ACCURACY_DIMENSION: QualityDimension = {
       dimension_name: 'accuracy',
       weight: 0.25,
       threshold: 0.90,
       pass_weight: 1.0,
       warning_weight: 0.5,
       error_weight: 0.0,
       critical_fail: false,
       contribution_rules: ['DC-009', 'DC-010']
     };

     // 一致性维度
     const CONSISTENCY_DIMENSION: QualityDimension = {
       dimension_name: 'consistency',
       weight: 0.25,
       threshold: 0.85,
       pass_weight: 1.0,
       warning_weight: 0.5,
       error_weight: 0.0,
       critical_fail: false,
       contribution_rules: ['DC-005', 'DC-006', 'DC-007']
     };

     // 时效性维度
     const TIMELINESS_DIMENSION: QualityDimension = {
       dimension_name: 'timeliness',
       weight: 0.10,
       threshold: 0.75,
       pass_weight: 1.0,
       warning_weight: 0.5,
       error_weight: 0.0,
       critical_fail: false,
       contribution_rules: ['DC-009', 'DC-010']
     };

     // 有效性维度
     const VALIDITY_DIMENSION: QualityDimension = {
       dimension_name: 'validity',
       weight: 0.10,
       threshold: 0.80,
       pass_weight: 1.0,
       warning_weight: 0.5,
       error_weight: 0.0,
       critical_fail: false,
       contribution_rules: ['DC-009', 'DC-010', 'DC-011']
     };
   ```

3. **实施步骤：**
   - 第 2 周：定义多维度评分配置
   - 第 2.5 周：实现评分计算引擎
   - 第 3 周：集成到 S11 验证服务

4. **成功标准：**
   - 质量评分准确反映数据真实质量
   - 可操作建议生成准确率 >80%

---

## 三、证据大表优化（10 项）

### 3.1 商品语义提取增强

**需求描述：** 当前 M2 产品语义提取缺少 HS 编码推断、原产地、材质、重量等关键字段。

| # | 优化项 | 优先级 | 复杂度 | 影响 |
|---|---------|----------|---------|
| EBB-001 | HS 编码推断模块 | P1 | 中 | 高 |
| EBB-002 | 原产地提取模块 | P1 | 中 | 中 |
| EBB-003 | 材质/重量提取 | P1 | 中 | 高 |
| EBB-004 | 产品规格提取 | P1 | 中 | 高 |
| EBB-005 | 品牌标准化与识别 | P1 | 中 | 高 |
| EBB-006 | 少样本示例库 | P1 | 中 | 高 |

**详细需求：**

**EBB-001: HS 编码推断模块**

1. **当前问题：**
   - 产品实体无 `hs_code` 字段
   - 缺少 HS 编码数据库连接
   - 无分类提示（章、类、税号）

2. **v2.0 优化方案：**
   ```typescript
   // HS 编码推断接口
   interface HSCodeInference {
     // 提取 HS 编码
     inferHSCode(productName: string, description: string): Promise<HSCodeResult>;

     // 产品描述映射
     matchDescriptionToHSCode(description: string): HSCodeSuggestion | null;
   ```

   interface HSCodeResult {
       hs_code: string;              // 10 位 HS 编码
       confidence: number;
       chapter?: string;             // 2 位章
       heading?: string;             // 4 位类
       subheading?: string;           // 6 位子类
       description?: string;          // 描述
       tax_info?: TaxInfo;          // 税率信息
     }

     interface TaxInfo {
       import_duty_rate: number;
       export_duty_rate: number;
       vat_rate: number;
       supervision_conditions: string[];
     }

     // HS 编码数据库（示例）
     const HS_DATABASE = new Map([
       ['6103.1234', '6103.4510', '6103.6601', '6103.900000', '6110.400100'],
       // 产品描述映射
       ['服装', '纺织品', '电子产品', '机械设备', '玩具']
     ]);

     matchDescriptionToHSCode(description: string): HSCodeSuggestion | null {
       // 简单关键词匹配
       const keywords = description.split(/\s+/g);
       for (const category of ['服装', '纺织品', '电子产品']) {
         for (const kw of category) {
           if (keywords.includes(kw)) {
             return {
               hs_code: this.getHSCodeForCategory(kw),
               confidence: 0.8,
               reasoning: `匹配类别 "${kw}"`
             };
           }
         }
       }
       return null;
     }
   ```

3. **实施步骤：**
   - 第 1 周：建立 HS 编码数据库
   - 第 2 周：训练产品描述分类模型
   - 第 2.5 周：集成到 M2 产品语义提取

4. **成功标准：**
   - HS 编码推断准确率 >80%
   - 分类准确率 >90%

---

**EBB-006: 少样本示例库**

1. **当前问题：**
   - LLM 提取缺少 few-shot 示例
   - 提示词结构不统一
   - 无分类示例库

2. **v2.0 优化方案：**
   ```typescript
   // 少样本示例库结构
   interface FewShotExampleLibrary {
     examples: Map<string, FewShotExample[]>;
     addExample(operation: string, example: FewShotExample): void;
     getExamples(operation: string, inputText: string, limit: number): FewShotExample[];
   }

     interface FewShotExample {
       input: string;
       output: Record<string, any>;
       metadata: {
         case_type: string;
         difficulty: 'easy' | 'medium' | 'hard';
         verified: boolean;
         tags: string[];
       };
     }

     // 产品语义提取示例
     const PRODUCT_EXAMPLES = [
       {
         input: 'LV Neverfull MM 中号手提包 棕色 专柜价12800',
         output: {
           product_name: 'Neverfull MM 手提包',
           brand: 'Louis Vuitton',
           brand_normalized: 'LV',
           model: 'Neverfull MM',
           specifications: [
             { spec_name: '尺寸', spec_value: '中号' },
             { spec_name: '颜色', spec_value: '棕色' }
           ],
           confidence: 0.95
         },
         metadata: {
           case_type: 'luxury',
           difficulty: 'easy',
           verified: true,
           tags: ['品牌', '型号', '规格']
         }
       },
       // 价格提取示例
       {
         input: '总价HKD 5800，分3期，每期HKD 1933.33',
         output: {
           amount: 5800,
           currency: 'HKD',
           price_type: 'total_price',
           installment_plan: {
             total_installments: 3,
             installment_amount: 1933.33,
             currency: 'HKD'
           }
         },
         confidence: 0.9
       }
     ]
   ```

3. **实施步骤：**
   - 第 1 周：收集各操作类型的少样本示例（每个类型 20+ 例）
   - 第 1.5 周：实现少样本选择算法（基于语义相似度）
   - 第 2 周：集成到 M2 产品和价格语义提取

4. **成功标准：**
   - 提取准确度提升 20-25%
   - LLM 响应时间减少 30%

---

## 四、M1 规则引擎优化（8 项）

### 4.1 新增海关特定规则

**需求描述：** 当前 M1 规则引擎仅 9 条规则，缺少 8 条关键的海关特定规则。

| # | 规则 ID | 名称 | 优先级 | 复杂度 | 覆盖率提升 |
|---|---------|----------|---------|
| M1-010 | 海关报关单验证 | P0 | 中 | +15% |
| M1-011 | 跨境路线合法性分析 | P0 | 高 | +12% |
| M1-012 | 税务规避模式检测 | P0 | 高 | +18% |
| M1-013 | 身份证文档链验证 | P1 | 中 | +10% |
| M1-014 | 产品真实性链 | P1 | 中 | +9% |
| M1-015 | 支付方式风险评分 | P1 | 中 | +8% |
| M1-016 | 通信加密模式 | P1 | 中 | +7% |
| M1-017 | 重复违规人员网络 | P1 | 中 | +6% |

**详细需求：**

**M1-010: 海关报关单验证**

1. **当前问题：**
   - 无报关单完整性校验
   - 无申报价值与发票/实际值比对
   - 无 HS 编码验证
   - 无原产地一致性检查

2. **v2.0 优化方案：**
   ```typescript
   interface CustomsDeclarationRule {
     async execute(input: CustomsDeclarationInput): Promise<CustomsDeclarationOutput> {
       // 1. 提取报关单数据
       const declaration = await this.getDeclaration(input.case_id);

       // 2. 验证完整性
       const completenessIssues = this.checkCompleteness(declaration);

       // 3. 价值比对
       const valueDiscrepancy = this.checkValueDiscrepancy(
         declaration.declared_value,
         declaration.invoice_value,
         declaration.market_value
       );

       // 4. HS 编码验证
       const hsIssue = await this.validateHSCode(declaration);

       // 5. 原产地验证
       const originIssue = this.validateOrigin(declaration);

       // 6. 计算低报风险分数
       const undervaluationScore = this.calculateUndervaluation(declaration);

       return {
         valid: completenessIssues.length === 0 && valueDiscrepancy.deviation === 0,
         discrepancies: [valueDiscrepancy, hsIssue, originIssue],
         undervaluation_score,
         risk_level: this.determineRiskLevel(undervaluationScore)
       };
     }
   }
   ```

3. **实施步骤：**
   - 第 1 周：定义报关单数据结构
   - 第 1.5 周：实现价值比对算法
   - 第 2 周：集成 HS 编码验证
   - 第 2.5 周：实现原产地验证

4. **成功标准：**
   - 报关单低报风险检测准确率 >85%

---

### 4.2 分层评分机制增强

**需求描述：** 当前 M1 评分机制为简单加权平均，无分层权重、无否决规则、无时间衰减。

| # | 优化项 | 优先级 | 复杂度 | 影响 |
|---|---------|----------|---------|
| M1-SC-001 | 分层权重定义 | P1 | 高 | +10% |
| M1-SC-002 | 否决规则机制 | P1 | 高 | +15% |
| M1-SC-003 | 时间衰减机制 | P2 | 低 | +5% |

**详细需求：**

**M1-SC-001: 分层权重定义**

1. **当前问题：**
   - 所有规则权重相等
   - 关键失败不触发整体拒绝
   - 陈旧证据等同权

2. **v2.0 优化方案：**
   ```typescript
   // 分层权重配置
   interface TieredWeightConfig {
     rule_tiers: Map<string, RuleTier>;
     evidence_multipliers: Map<EvidenceType, number>;
     veto_rules: string[];               // 关键失败规则 ID 列表
     time_decay: TimeDecayConfig;
   }

     interface RuleTier {
       tier: 'critical' | 'high' | 'medium' | 'low';
       base_weight: number;             // 基础权重 0.0-1.0
       veto_enabled: boolean;          // 是否启用否决
       min_evidence_count: number;
     }

     interface TimeDecayConfig {
       decay_function: 'exponential' | 'linear' | 'step';
       half_life_days: number;          // 半衰期（天）
       minimum_weight: number;         // 最小权重
       preserve_patterns: string[];  // 不衰减的模式类型
     }

     // 关键规则分层
     const CRITICAL_RULES = [
       'M1-010', 'M1-011', 'M1-012', 'M1-013', 'M1-014', 'M1-015', 'M1-016'
     ];

     const HIGH_RULES = [
       'M1-002', 'M1-003', 'M1-004', 'M1-005', 'M1-006', 'M1-007', 'M1-008', 'M1-009'
     ];
   ```

3. **实施步骤：**
   - 第 1 周：定义规则分层配置
   - 第 1.5 周：实现否决规则逻辑
   - 第 2 周：实现证据质量乘数
   - 第 2.5 周：实现时间衰减算法

4. **成功标准：**
   - 关键风险自动拒绝成功率 100%
   - 评分准确性提升 18%

---

### 4.3 源可靠性评分系统

**需求描述：** 当前评分机制未考虑数据源可信度、历史准确度。

| # | 优化项 | 优先级 | 复杂度 | 影响 |
|---|---------|----------|---------|
| M1-SR-001 | 源可靠性评分系统 | P1 | 中 | +8% |

**详细需求：**

1. **当前问题：**
   - 所有数据源权重相同
   - 无历史准确度跟踪
   - 无动态调整机制

2. **v2.0 优化方案：**
   ```typescript
   // 源可靠性评分系统
   interface SourceReliabilityScore {
     // 源注册表
     source_registry: Map<string, SourceProfile>;
     accuracy_history: Map<string, AccuracyRecord>;

     // 源评分计算
     calculateScore(input: SourceWeightedInput): WeightedData {
       // 1. 获取源配置
       const profile = this.source_registry.get(input.source_id);
       if (!profile) {
         return this.getDefaultScore(input.source_type);
       }

       // 2. 获取历史准确度
       const historicalAccuracy = this.accuracy_history.get(input.source_id) || 0.8;

       // 3. 计算基础分
       let baseScore = profile.reliability_score * 0.5;

       // 4. 应用时间衰减
       const timeDecay = this.calculateTimeDecay(input.timestamp, profile.created_at);

       // 5. 应用校准加成
       if (profile.verification_level === 'verified') {
         baseScore *= 1.1;
       } else if (profile.verification_level === 'partially_verified') {
         baseScore *= 1.05;
       }

       return {
         reliability_weight: Math.min(1.0, baseScore * timeDecay),
         confidence: 0.9
       };
     }
   ```

3. **实施步骤：**
   - 第 1 周：建立源注册表
   - 第 1.5 周：收集历史准确度数据
   - 第 2 周：实现时间衰减算法

4. **成功标准：**
   - 源源评分准确反映数据可信度
   - 评分准确性提升 8%

---

## 五、流程与架构优化（6 项）

### 5.1 编排优化

**需求描述：** 当前编排缺少版本管理、审计追踪、权限控制。

| # | 优化项 | 优先级 | 复杂度 | 影响 |
|---|---------|----------|---------|
| OR-001 | 模式版本迁移系统 | P1 | 高 | 高 |
| OR-002 | 审计追踪系统 | P1 | 高 | 高 |
| OR-003 | 权限管理与 RBAC | P0 | 高 | 高 |
| OR-004 | 变更审批工作流 | P1 | 高 | 高 |

**详细需求：**

**OR-001: 模式版本迁移系统**

1. **当前问题：**
   - 无版本管理
   - 数据变更无法追踪
   - 无法回滚到历史版本

2. **v2.0 优化方案：**
   ```typescript
   // 模式版本迁移
   interface SchemaMigrationConfig {
       versions: Map<string, SchemaVersion>;
       current_version: string;
       migration_strategies: {
         forward: {
           phases: MigrationPhase[],
           rollback_enabled: boolean
         },
         backward: {
           phases: MigrationPhase[]
         }
       };
     }

     interface MigrationPhase {
       version: string;
       changes: SchemaChange[];
       rollback_point: string;
     }

     interface SchemaChange {
       change_type: 'add' | 'modify' | 'delete';
       object_type: string;
       object_name: string;
       change_detail: string;
       validation_required: boolean;
     }

     // 变更前验证
     validateChange(change: SchemaChange): Promise<ValidationResult> {
       // 1. 检查变更类型
       if (!ALLOWED_CHANGES.includes(change.change_type)) {
         return { valid: false, error: '不允许的变更类型' };
       }

       // 2. 检查对象类型
       if (!ALLOWED_OBJECTS.includes(change.object_type)) {
         return { valid: false, error: '不允许的对象类型' };
       }

       // 3. 检查业务规则
       const businessRule = this.checkBusinessRule(change);
       if (!businessRule) {
         return { valid: false, error: '业务规则不允许' };
       }

       return { valid: true, validation_required: this.isValidationRequired(change) };
     }
   ```

3. **实施步骤：**
   - 第 1 周：定义版本管理模式
   - 第 1.5 周：实现变更追踪
   - 第 2 周：实现变更验证
   - 第 2.5 周：建立回滚机制
   - 第 3 周：集成到 M1 规则引擎

4. **成功标准：**
   - 数据变更零丢失
   - 版本回滚成功率 >95%

---

### 5.2 审计与监控

**需求描述：** 当前缺乏全面的审计追踪和性能监控。

| # | 优化项 | 优先级 | 复杂度 | 影响 |
|---|---------|----------|---------|
| AUD-001 | 审计日志系统 | P1 | 高 | 高 |
| AUD-002 | 性能监控仪表板 | P1 | 高 | 高 |
| AUD-003 | 异常检测与告警 | P1 | 中 | 高 |
| AUD-004 | 数据质量追踪 | P1 | 中 | 高 |
| AUD-005 | 审计报告生成 | P1 | 中 | 高 |
| AUD-006 | 合规性检查 | P1 | 高 | 高 |

**详细需求：**

**AUD-001: 审计日志系统**

1. **当前问题：**
   - 无集中审计日志
   - 操作无法追溯
   - 缺少审计类型分类

2. **v2.0 优化方案：**
   ```typescript
   // 审计日志系统
   interface AuditLog {
       log_id: UUID;
       timestamp: string;
       actor_id: UUID;           // 操作人员 ID
       actor_type: 'system' | 'user' | 'llm' | 'rule';
       entity_id?: UUID;          // 案件/实体 ID
       operation_type: string;    // 操作类型
       operation_target?: string;   // 操作目标
       input_data: Record<string, any>;
       output_data: Record<string, any>;
       result: 'success' | 'failure' | 'warning';
       risk_level: 'low' | 'medium' | 'high';
       reason?: string;             // 失败原因
       ip_address: string;
       user_agent?: string;          // 用户代理信息
     }

     // 审计日志类型
     interface AuditLogType {
       type: string;
       description: string;
       critical_operations: string[];
     }

     const AUDIT_LOG_TYPES: AuditLogType[] = [
       {
         type: 'data_quality',
         description: '数据质量审计',
         critical_operations: [
           'evidence_filling', 'validation_failure', 'anomaly_detected'
         ]
       },
       {
         type: 'compliance',
         description: '合规性审计',
         critical_operations: [
           'customs_declaration_review', 'hs_code_validation'
         ]
       },
       {
         type: 'performance',
         description: '性能审计',
         critical_operations: [
           'slow_query', 'high_latency'
         ]
       },
       {
         type: 'security',
         description: '安全审计',
         critical_operations: [
           'unauthorized_access', 'data_leak'
         ]
       }
     ];
     ```

3. **实施步骤：**
   - 第 1 周：实现集中审计日志
     - 第 1.5 周：实现审计类型分类
     - 第 2 周：实现操作追踪和关联
     - 第 2.5 周：集成到所有服务

4. **成功标准：**
   - 审计追踪覆盖率 100%
     - 关键操作可追溯 100%

---

## 六、实施路线图

### 阶段一：关键修复（第 1-2 周）

| 任务 | 依赖项 | 工作量 | 成功标准 |
|-----|------|--------|---------|----------|
| DC-009 | 身份证校验码验证 | 无 | 2 天 | 99.9% 准确率 |
| DC-010 | 银行卡 Luhn 验证 | 无 | 3.5 天 | 99.9% 准确率 |
| EBB-001 | 修复 M2 正则表达式错误 | 无 | 1 天 | 100% 修复率 |

### 阶段二：高优先级（第 3-4 周）

| 任务 | 依赖项 | 工作量 | 成功标准 |
|-----|------|--------|---------|----------|
| M1-010 | 海关报关单验证 | DC-009 | 2 天 | 85% 准确率 |
| M1-011 | 跨境路线分析 | DC-009 | 2 天 | 80% 检测率 |
| EBB-002 | HS 编码推断 | DC-009 | 3 天 | 80% 准确率 |
| DC-012 | 税务规避模式 | DC-009 | 2 天 | 75% 检测率 |
| M1-013 | 身份证文档链 | DC-009 | 2 天 | 70% 检测率 |
| M1-SC-001 | 分层权重定义 | DC-009 | 2 天 | +10% 评分准确性 |

### 阶段三：中优先级（第 5-8 周）

| 任务 | 依赖项 | 工作量 | 成功标准 |
|-----|------|--------|---------|----------|
| DC-005 | 语义相似度引擎 | DC-007 | 2 天 | 90% 匹配率 |
| DC-006 | 时序冲突解决 | DC-007 | 1.5 天 | 90% 解决率 |
| DC-009 | HS 编码验证 | DC-011 | 2 天 | 80% 准确率 |
| DC-017 | 源优先级配置 | DC-016 | 1.5 天 | 优先级配置生效 |
| DC-018 | 字段冲突解决 | DC-017 | 1.5 天 | 85% 解决率 |
| DC-020 | 多维度质量评分 | DC-020 | 2 天 | +10% 评分准确性 |

### 阶段四：优化（第 9 周以上）

| 任务 | 依赖项 | 工作量 | 成功标准 |
|-----|------|--------|---------|----------|
| OR-001 | 模式版本迁移 | 阶段三完成 | 2 天 | 100% 成功率 |
| OR-002 | 审计追踪系统 | 阶段三完成 | 2.5 天 | 100% 覆盖率 |
| OR-003 | 性能监控仪表板 | 阶段三完成 | 2.5 天 | 实时指标 |
| AUD-004 | 异常检测与告警 | 阶段三完成 | 2.5 天 | 85% 覆盖率 |
| AUD-005 | 数据质量追踪 | 阶段三完成 | 2.5 天 | 95% 覆盖率 |
| AUD-006 | 合规性检查 | 阶段三完成 | 2.5 天 | 95% 覆盖率 |

---

## 七、关键里程碑

| 里程碑 | 目标时间 | 成功指标 |
|---------|---------|---------|
| **M1-V1** | 第一批次新增规则上线 | 2 周 | 8 条规则，评分准确性 +18% |
| **M2-V1** | 第一批次增强功能上线 | 2.5 周 | 8 项语义提取，字段冲突解决 +20% |
| **DC-V1** | 完整性验证框架上线 | 2.5 周 | 5 种验证规则，95% 必填字段检测 |
| **DC-V1** | 异常检测多方法上线 | 3.5 周 | 4 种异常方法，误报率降低 30% |
| **DC-V1** | 质量评分系统上线 | 2.5 周 | 4 维度评分，可操作建议生成准确率 80% |

---

## 八、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|-----|---------|---------|---------|
| **技术风险** | 中等 | 引入 ML 库增加系统复杂度 | 中 | 第三阶段分阶段实施 |
| **进度风险** | 中 | 13 周工期可能延长 30% | 分 4 阶段并行依赖管理 |
| **质量风险** | 低 | 新规则准确性需验证 | 第一阶段严格测试 2 周 |

---

## 九、总结

本次评审共识别 **25 个关键差距**，提出 **32 项具体增强建议**，规划 **4 个实施阶段**，预计 **66 个工作日**（约 13 周）。

### 核心改进指标

| 改进领域 | 当前状态 | 目标状态 | 预期提升 |
|---------|---------|---------|
| 数据清洗逻辑 | 25 个差距 | 4 阶段 | 95% 改进 |
| 证据大表优化 | 10 个差距 | 4 阶段 | 90% 改进 |
| M1 规则引擎 | 8 个差距 | 4 阶段 | 85% 改进 |
| 流程与架构 | 6 个差距 | 4 阶段 | 80% 改进 |

**总体目标**

在 66 个工作日内，通过 4 个阶段的系统化增强，将数据清洗和证据挖掘能力从当前约 **45% 有效性** 提升到 **85% 以上**，显著提升海关案件分析平台的智能化水平。

---

*文档版本：2.0*
*创建日期：2026-02-16*
*最后更新：2026-02-16*

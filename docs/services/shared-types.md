# 共享接口和类型定义

## 1. 基础类型定义

```typescript
/**
 * 唯一标识符类型
 */
type UUID = string;

/**
 * 时间戳类型 (ISO 8601 格式)
 */
type Timestamp = string;

/**
 * 货币类型
 */
type Currency = 'CNY' | 'USD' | 'HKD' | 'EUR' | 'JPY' | 'GBP';

/**
 * 置信度类型 (0.0 - 1.0)
 */
type Confidence = number;

/**
 * 状态类型
 */
type Status = 'pending' | 'processing' | 'completed' | 'failed' | 'archived' | 'cancelled';
```

---

## 2. 通用响应包装

```typescript
/**
 * 标准 API 响应包装
 */
interface ApiResponse<T> {
  code: number;                       // 响应码
  message: string;                    // 响应消息
  data: T;                          // 响应数据
  request_id: UUID;                   // 请求 ID（用于追踪）
  timestamp: Timestamp;                // 响应时间戳
  trace_id?: string;                 // 分布式追踪 ID
}

/**
 * 分页响应包装
 */
interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;                     // 当前页码
    page_size: number;                 // 每页大小
    total: number;                    // 总记录数
    total_pages: number;                // 总页数
    has_next: boolean;                 // 是否有下一页
    has_prev: boolean;                 // 是否有上一页
  };
}

/**
 * 流式响应包装
 */
interface StreamResponse {
  code: number;
  message: string;
  request_id: UUID;
  timestamp: Timestamp;
  stream_id: string;                  // 流 ID
  total_count?: number;               // 总记录数（流结束时）
}

/**
 * 错误响应包装
 */
interface ErrorResponse {
  code: number;                       // 错误码
  message: string;                    // 错误消息
  error_type: string;                 // 错误类型
  details?: Record<string, unknown>; // 错误详情
  request_id: UUID;
  timestamp: Timestamp;
  stack_trace?: string;               // 堆栈跟踪
}
```

---

## 3. 案件相关类型

```typescript
/**
 * 案件类型枚举
 */
enum CaseType {
  SMUGGLE = 'smuggle',               // 走私
  TAX_FRAUD = 'tax_fraud',          // 偷税
  COUNTERFEIT = 'counterfeit',         // 伪冒
  IP_INFRINGEMENT = 'ip_infringement',  // 侵权
  VIOLATION = 'violation',            // 违规
  MONEY_LAUNDERING = 'money_laundering',  // 洗钱
  OTHER = 'other'                      // 其他
}

/**
 * 案件状态枚举
 */
enum CaseStatus {
  DRAFT = 'draft',                   // 草稿
  ASSIGNED = 'assigned',              // 已分派
  INVESTIGATING = 'investigating',  // 调查中
  REVIEWED = 'reviewed',              // 已审核
  CLOSED = 'closed',                  // 已结案
  ARCHIVED = 'archived'            // 已归档
  CANCELLED = 'cancelled'             // 已取消
}

/**
 * 优先级类型
 */
enum Priority {
  CRITICAL = 1,                      // 紧急
  HIGH = 2,                          // 高
  MEDIUM = 3,                        // 中
  LOW = 4,                           // 低
}

/**
 * 案件接口
 */
interface Case extends BaseEntity {
  case_id: UUID;
  case_type: CaseType;
  case_number: string;               // 案件编号
  title: string;
  description: string;
  status: CaseStatus;
  priority: Priority;
  created_at: Timestamp;
  updated_at: Timestamp;
  created_by: UUID;                // 创建人 ID
  assigned_to: UUID;                // 负责人 ID
  archived_at?: Timestamp;            // 归档时间
  metadata?: CaseMetadata;
  tags?: string[];
}

interface CaseMetadata {
  risk_score: number;                 // 风险分数
  evidence_count: number;             // 证据数量
  entity_count: number;              // 实体数量
  relation_count: number;            // 关系数量
  quality_score: number;             // 质量分数
}
```

---

## 4. 文件相关类型

```typescript
/**
 * 文件类型枚举
 */
enum FileType {
  IM_LOG = 'im_log',                // IM 聊天记录
  IMAGE = 'image',                  // 图片
  VIDEO = 'video',                  // 视频
  AUDIO = 'audio',                  // 音频
  PDF = 'pdf',                      // PDF 文档
  EXCEL = 'excel',                  // Excel 表格
  EMAIL = 'email',                  // 邮件
  DOC = 'doc',                      // Word 文档
  OTHER = 'other'                   // 其他
}

/**
 * 文件状态枚举
 */
enum FileStatus {
  UPLOADING = 'uploading',           // 上传中
  PARSING = 'parsing',              // 解析中
  INDEXING = 'indexing',            // 索引中
  COMPLETED = 'completed',            // 已完成
  FAILED = 'failed',                // 失败
}

/**
 * 文件接口
 */
interface CaseFile extends BaseEntity {
  file_id: UUID;
  case_id: UUID;
  file_name: string;
  file_type: FileType;
  file_size: number;               // 文件大小(字节)
  file_hash: string;               // 文件哈希
  mime_type: string;                // MIME 类型
  storage_path: string;             // 存储路径
  status: FileStatus;
  uploaded_at: Timestamp;
  parsed_at?: Timestamp;            // 解析完成时间
  indexed_at?: Timestamp;           // 索引完成时间
  uploader_id: UUID;               // 上传人 ID
  metadata?: FileMetadata;
}

interface FileMetadata {
  original_filename?: string;
  source_url?: string;             // 原始 URL
  download_count: number;         // 下载次数
  last_accessed_at?: Timestamp;
}
```

---

## 5. 实体相关类型

```typescript
/**
 * 实体类型枚举
 */
enum EntityType {
  // 人物相关
  PERSON = 'person',                 // 人物
  BUYER = 'buyer',                 // 买方
  SELLER = 'seller',               // 卖方
  CUSTOMER = 'customer',             // 客户
  SUPPLIER = 'supplier',             // 供应商
  INTERMEDIARY = 'intermediary',    // 中介
  WITNESS = 'witness',             // 证人

  // 组织相关
  ORGANIZATION = 'organization',       // 组织
  COMPANY = 'company',              // 公司
  BRANCH = 'branch',               // 分支
  DEPARTMENT = 'department',          // 部门

  // 商品相关
  PRODUCT = 'product',               // 商品
  BRAND = 'brand',                 // 品牌
  MODEL = 'model',                 // 型号

  // 地点相关
  LOCATION = 'location',             // 地点
  COUNTRY = 'country',              // 国家
  PROVINCE = 'province',            // 省份
  CITY = 'city',                   // 城市
  ADDRESS = 'address',              // 地址
  PORT = 'port',                   // 港口

  // 金融相关
  ACCOUNT = 'account',               // 账户
  BANK_CARD = 'bank_card',          // 银行卡
  TRANSACTION = 'transaction',        // 交易

  // 证件相关
  ID_CARD = 'id_card',             // 身份证
  PASSPORT = 'passport',           // 护照
  LICENSE_PLATE = 'license_plate',  // 车牌
  PHONE = 'phone',                 // 电话
  EMAIL = 'email',                 // 邮箱

  // 其他
  CUSTOM = 'custom'                // 自定义
}

/**
 * 实体接口
 */
interface Entity extends BaseEntity {
  entity_id: UUID;
  case_id: UUID;
  entity_type: EntityType;
  name: string;
  aliases: string[];               // 别名列表
  attributes: EntityAttribute[];
  source_file_id?: UUID;           // 来源文件 ID
  created_at: Timestamp;
  updated_at: Timestamp;
  confidence: number;             // 置信度
}

/**
 * 实体属性
 */
interface EntityAttribute {
  attribute_name: string;           // 属性名称
  attribute_value: unknown;         // 属性值
  attribute_type: 'string' | 'number' | 'date' | 'boolean' | 'array';
  confidence: number;             // 置信度
  source?: string;                 // 数据来源
}

/**
 * 人物实体扩展属性
 */
interface PersonEntity extends Entity {
  entity_type: EntityType.PERSON;
  person_attributes: PersonAttributes;
  role?: string;                   // 角色
  risk_level?: 'low' | 'medium' | 'high';
}

interface PersonAttributes {
  gender?: 'male' | 'female' | 'unknown';
  age?: number;
  phone?: string;
  email?: string;
  id_card?: string;
  passport?: string;
  address?: Address;
}
```

---

## 6. 关系相关类型

```typescript
/**
 * 关系类型枚举
 */
enum RelationType {
  // 拥有关系
  OWNS = 'owns',                  // 拥有
  WORKS_FOR = 'works_for',         // 受雇于
  EMPLOYS = 'employs',           // 雇佣
  PARTNERS_WITH = 'partners_with', // 合伙

  // 交易关系
  SUPPLIED_TO = 'supplied_to',       // 供应给
  PAYMENT_TO = 'payment_to',       // 付款给
  ORDERED_FROM = 'ordered_from',   // 订购自
  INVOICED = 'invoiced',        // 开票给

  // 通信关系
  KNOWS = 'knows',                // 认识
  CONTACT_OF = 'contact_of',       // 联系人
  FAMILY_OF = 'family_of',         // 亲属

  // 位置关系
  LOCATED_AT = 'located_at',     // 位于
  TRAVELS_TO = 'travels_to',    // 旅行至
  BRANCH_OF = 'branch_of',        // 分支于

  // 其他
  RELATED_TO = 'related_to',       // 关联
  BRAND_OF = 'brand_of',          // 品牌属于
  MODEL_OF = 'model_of',          // 型号属于
}

/**
 * 关系接口
 */
interface Relation extends BaseEntity {
  relation_id: UUID;
  case_id: UUID;
  source_id: UUID;               // 源实体 ID
  target_id: UUID;               // 目标实体 ID
  relation_type: RelationType;
  relation_data?: RelationData;    // 关系数据
  confidence: number;             // 置信度
  evidence_ids: UUID[];          // 证据 ID 列表
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * 关系数据
 */
interface RelationData {
  weight?: number;                // 关系权重
  attributes?: Record<string, unknown>;
  start_date?: Timestamp;         // 起始日期
  end_date?: Timestamp;           // 结束日期
}
```

---

## 7. 解析服务类型

```typescript
/**
 * 解析服务编号
 */
enum ServiceType {
  S1 = 's1_im_parser',
  S2 = 's2_image_parser',
  S3 = 's3_audio_parser',
  S4 = 's4_video_parser',
  S5 = 's5_pdf_parser',
  S6 = 's6_excel_parser',
  S7 = 's7_email_parser',
  S8 = 's8_entity_extraction',
  S9 = 's9_graph_service',
  S10 = 's10_index_service',
  S11 = 's11_validation_service',
  S12 = 's12_archive_service',
  M1 = 'm1_rule_engine',
  M2 = 'm2_field_filling',
  M3 = 'm3_graph_analysis',
  M4 = 'm4_llm_inference',
  M5 = 'm5_bi_aggregation',
}

/**
 * 解析结果接口
 */
interface ParseResult {
  service_type: ServiceType;
  file_id: UUID;
  success: boolean;
  confidence: number;             // 解析置信度
  parsed_data: ParsedData;
  error?: ParseError;
  elapsed_ms: number;
}

/**
 * 解析数据联合类型
 */
type ParsedData =
  | IMParsedData
  | ImageParsedData
  | AudioParsedData
  | VideoParsedData
  | PDFParsedData
  | ExcelParsedData
  | EmailParsedData;

/**
 * IM 解析数据
 */
interface IMParsedData {
  platform: string;               // 平台 (微信/WhatsApp 等)
  participants: Participant[];
  timeline: TimelineMessage[];
  media_references: MediaReference[];
  statistics: ConversationStats;
}

interface Participant {
  id: string;
  name: string;
  alias?: string;
  avatar?: string;
  role?: 'owner' | 'admin' | 'member';
}

interface TimelineMessage {
  message_id: string;
  timestamp: Timestamp;
  sender: string;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'location' | 'link' | 'system';
  content: string;
  media_ref?: string;
  reply_to?: string;
  forwarded_from?: string;
}

/**
 * 图片解析数据
 */
interface ImageParsedData {
  image_info: ImageInfo;
  ocr_result?: OCRResult;
  detected_objects?: DetectedObject[];
  detected_faces?: FaceDetection[];
  qr_codes?: QRCode[];
}

/**
 * 音频解析数据
 */
interface AudioParsedData {
  audio_info: AudioInfo;
  transcription: TranscriptionResult;
}

/**
 * 视频解析数据
 */
interface VideoParsedData {
  video_info: VideoInfo;
  keyframes?: Keyframe[];
  audio_transcription?: TranscriptionResult;
}

/**
 * PDF 解析数据
 */
interface PDFParsedData {
  document_info: DocumentInfo;
  pages: PageContent[];
  tables: ExtractedTable[];
}

/**
 * Excel 解析数据
 */
interface ExcelParsedData {
  workbook_info: WorkbookInfo;
  sheets: SheetData[];
}

/**
 * 邮件解析数据
 */
interface EmailParsedData {
  email_info: EmailInfo;
  headers: EmailHeaders;
  body: EmailBody;
  attachments: EmailAttachment[];
}

/**
 * 解析错误
 */
interface ParseError {
  error_code: string;
  error_message: string;
  error_type: string;
  recoverable: boolean;
}
```

---

## 8. 证据挖掘类型

```typescript
/**
 * 规则引擎规则类型
 */
enum RuleType {
  TIME_WINDOW = 'time_window',          // 时间窗
  ORDER_ID = 'order_id',               // 订单号
  PERSON_MERGE = 'person_merge',         // 人物归并
  AMOUNT_VALIDATION = 'amount_validation', // 金额校验
  QUANTITY_VALIDATION = 'quantity_validation', // 数量校验
  LOGISTICS_PATH = 'logistics_path',      // 物流路径
  VOUCHER_VALIDATION = 'voucher_validation', // 票据校验
  CROSS_SOURCE_CONSISTENCY = 'cross_source_consistency', // 跨源一致性
  ANOMALY_DETECTION = 'anomaly_detection', // 异常检测
}

/**
 * 规则执行结果
 */
interface RuleMatchResult {
  rule_id: string;
  rule_type: RuleType;
  matched: boolean;
  score: number;
  details?: Record<string, unknown>;
}

/**
 * 字段填充操作类型
 */
enum FieldFillingOperation {
  ALIGN_FIELDS = 'align_fields',
  EXTRACT_PRODUCT = 'extract_product',
  EXTRACT_PRICE = 'extract_price',
  EXTRACT_ROLE = 'extract_role',
  FUSE_SOURCES = 'fuse_sources',
  SUGGEST_FILL = 'suggest_fill',
}

/**
 * 字段填充结果
 */
interface FieldFillResult {
  operation: FieldFillingOperation;
  filled_fields: FilledField[];
  confidence: number;
  suggestions?: FillSuggestion[];
}

interface FilledField {
  field_name: string;
  value: unknown;
  source: string;
  confidence: number;
}

/**
 * 图谱分析操作类型
 */
enum GraphAnalysisOperation {
  EXTRACT_EVENT_CHAIN = 'extract_event_chain',
  CALCULATE_RELATION_STRENGTH = 'calculate_relation_strength',
  IDENTIFY_UPSTREAM_DOWNSTREAM = 'identify_upstream_downstream',
  DETECT_GANGS = 'detect_gangs',
  MULTI_ROUND_UPDATE = 'multi_round_update',
}

/**
 * 图谱分析结果
 */
interface GraphAnalysisResult {
  operation: GraphAnalysisOperation;
  paths?: GraphPath[];
  communities?: GraphCommunity[];
  centrality?: CentralityMetrics;
}

interface GraphPath {
  path_id: UUID;
  nodes: Entity[];
  relations: Relation[];
  length: number;
  total_weight: number;
}

interface GraphCommunity {
  community_id: UUID;
  nodes: UUID[];
  member_count: number;
  central_nodes: UUID[];
  modularity: number;
}

/**
 * LLM 推理操作类型
 */
enum InferenceOperation {
  SEMANTIC_UNDERSTANDING = 'semantic_understanding',
  SEMANTIC_COMPLETION = 'semantic_completion',
  CROSS_MODAL_REASONING = 'cross_modal_reasoning',
  CONFIDENCE_EVALUATION = 'confidence_evaluation',
}

/**
 * 推理结果
 */
interface InferenceResult {
  operation: InferenceOperation;
  understanding?: SemanticUnderstanding;
  completion?: CompletionResult;
  cross_modal?: CrossModalResult;
  confidence?: ConfidenceEvaluation;
}

/**
 * 语义理解结果
 */
interface SemanticUnderstanding {
  summary: string;
  key_points: string[];
  intents: Intent[];
  sentiment: Sentiment;
  topics: string[];
}

interface Intent {
  intent_type: 'trade' | 'communication' | 'logistics' | 'financial';
  confidence: number;
  description: string;
}

/**
 * BI 聚合操作类型
 */
enum AggregationOperation {
  TRANSACTION_STATISTICS = 'transaction_statistics',
  TIME_DISTRIBUTION = 'time_distribution',
  RISK_METRICS = 'risk_metrics',
  ENTITY_STATISTICS = 'entity_statistics',
  PATTERN_ANALYSIS = 'pattern_analysis',
}

/**
 * 聚合结果
 */
interface AggregationResult {
  operation: AggregationOperation;
  summary: AggregationSummary;
  data: AggregationData;
}

interface AggregationSummary {
  total_records: number;
  processed_at: Timestamp;
}

interface AggregationData {
  by_currency?: Record<string, CurrencyStats>;
  by_entity_type?: Record<string, EntityTypeStats>;
  by_time_period?: TimePeriodStats[];
  trends?: TrendData[];
}
```

---

## 9. 验证和质量类型

```typescript
/**
 * 验证规则类型
 */
enum ValidationRuleType {
  COMPLETENESS = 'completeness',
  CONSISTENCY = 'consistency',
  ACCURACY = 'accuracy',
  ANOMALY = 'anomaly',
}

/**
 * 验证严重级别
 */
enum ValidationSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

/**
 * 验证结果
 */
interface ValidationResult {
  rule_id: string;
  rule_name: string;
  rule_type: ValidationRuleType;
  severity: ValidationSeverity;
  status: 'passed' | 'failed' | 'skipped';
  message: string;
  affected_items: string[];
  suggestions?: string[];
  confidence: number;
}

/**
 * 质量评分
 */
interface QualityScore {
  overall_score: number;            // 总体分数 (0-100)
  dimensions: {
    completeness: number;          // 完整性分数
    consistency: number;           // 一致性分数
    accuracy: number;             // 准确性分数
    anomaly_free: number;          // 无异常分数
  };
  grade: 'A' | 'B' | 'C' | 'D' | 'F'; // 质量等级
}
```

---

## 10. 事件和消息类型

```typescript
/**
 * 事件类型
 */
enum EventType {
  FILE_UPLOADED = 'file_uploaded',
  FILE_PARSED = 'file_parsed',
  ENTITY_CREATED = 'entity_created',
  RELATION_CREATED = 'relation_created',
  RULE_MATCHED = 'rule_matched',
  VALIDATION_COMPLETED = 'validation_completed',
  INDEX_COMPLETED = 'index_completed',
  ARCHIVED = 'archived',
  ERROR_OCCURRED = 'error_occurred',
}

/**
 * 事件接口
 */
interface Event extends BaseEntity {
  event_id: UUID;
  event_type: EventType;
  case_id: UUID;
  source_service: ServiceType;
  source_id: string;             // 来源 ID
  payload: unknown;            // 事件载荷
  created_at: Timestamp;
}

/**
 * WebSocket 消息类型
 */
enum WSMessageType {
  PARSE_PROGRESS = 'parse_progress',
  PARSE_COMPLETE = 'parse_complete',
  ENTITY_PROGRESS = 'entity_progress',
  RELATION_PROGRESS = 'relation_progress',
  VALIDATION_PROGRESS = 'validation_progress',
  NOTIFICATION = 'notification',
}

/**
 * WebSocket 消息
 */
interface WSMessage {
  type: WSMessageType;
  data: unknown;
  timestamp: Timestamp;
}
```

---

## 11. 事件和消息类型

```typescript
/**
 * 事件类型
 */
enum EventType {
  FILE_UPLOADED = 'file_uploaded',
  FILE_PARSED = 'file_parsed',
  ENTITY_CREATED = 'entity_created',
  RELATION_CREATED = 'relation_created',
  RULE_MATCHED = 'rule_matched',
  VALIDATION_COMPLETED = 'validation_completed',
  INDEX_COMPLETED = 'index_completed',
  ARCHIVED = 'archived',
  ERROR_OCCURRED = 'error_occurred',
}

/**
 * 事件接口
 */
interface Event extends BaseEntity {
  event_id: UUID;
  event_type: EventType;
  case_id: UUID;
  source_service: ServiceType;
  source_id: string;             // 来源 ID
  payload: unknown;            // 事件载荷
  created_at: Timestamp;
}

/**
 * WebSocket 消息类型
 */
enum WSMessageType {
  PARSE_PROGRESS = 'parse_progress',
  PARSE_COMPLETE = 'parse_complete',
  ENTITY_PROGRESS = 'entity_progress',
  RELATION_PROGRESS = 'relation_progress',
  VALIDATION_PROGRESS = 'validation_progress',
  NOTIFICATION = 'notification',
}

/**
 * WebSocket 消息
 */
interface WSMessage {
  type: WSMessageType;
  data: unknown;
  timestamp: Timestamp;
}
```

---

## 12. 辅助类型

```typescript
/**
 * 边界框
 */
interface BoundingBox {
  x: number;                       // 归一化 X 坐标 (0-1)
  y: number;                       // 归一化 Y 坐标 (0-1)
  width: number;                   // 归一化宽度 (0-1)
  height: number;                  // 归一化高度 (0-1)
}

/**
 * 坐标点
 */
interface Point {
  x: number;
  y: number;
}

/**
 * 范围
 */
interface Range {
  start: number;
  end: number;
  count: number;
}

/**
 * 分页参数
 */
interface PaginationParams {
  page: number;                     // 页码 (从 1 开始)
  page_size: number;                 // 每页大小
  cursor?: string;                // 游标分页
}

/**
 * 过滤条件
 */
interface FilterCondition {
  field: string;                   // 字段名
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'notin' | 'like' | 'ilike';
  value: unknown;                   // 比较值
}

/**
 * 排序条件
 */
interface SortCondition {
  field: string;                   // 排序字段
  order: 'asc' | 'desc';            // 排序方向
}

/**
 * 查询参数
 */
interface QueryParams {
  pagination?: PaginationParams;
  filters?: FilterCondition[];
  sort?: SortCondition[];
  search?: string;                   // 搜索关键词
  fields?: string[];                 // 返回字段
}

/**
 * 健康检查响应
 */
interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  service: string;
  version: string;
  uptime: number;                   // 运行时间(秒)
  last_check: Timestamp;
  dependencies: HealthCheckDependency[];
}

interface HealthCheckDependency {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  latency_ms: number;
}
```

---

*版本: 1.0.0 | 更新日期: 2026-02-16*

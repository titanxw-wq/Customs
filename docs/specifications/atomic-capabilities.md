# 原子能力规格文档 (S1-S12 + M1-M5)

## 概述

本文档详细定义了海关案件数据分析平台的 **17 个原子能力服务**，分为两大类：

- **S1-S12**: 数据解析与处理服务 (第 3 阶段)
- **M1-M5**: 证据挖掘与分析服务 (第 4 阶段)

每个服务可独立开发、部署和扩展。

---

## S1: IM 对话时序解析服务

### 1.1 服务概述

| 属性 | 值 |
|------|-----|
| 服务编号 | S1 |
| 服务名称 | IM 对话时序解析服务 |
| 状态 | 已具备 |
| 输入 | IM 导出文件 (微信/WhatsApp/Telegram) |
| 输出 | 对话时间线 JSON |

### 1.2 功能规格

```yaml
功能列表:
  - IM 导出格式解析 (微信/WhatsApp/Telegram/Line)
  - 时间线重建与排序
  - 消息去重与合并
  - 参与者识别与归并
  - 多媒体附件链路解析

输入格式:
  - 微信导出: .txt / .html / .csv
  - WhatsApp: .txt / .json
  - Telegram: .json / .html

输出格式:
  类型: application/json
  Schema:
    conversation_id: string (UUID)
    participants: Participant[]
    messages: Message[]
    timeline: TimelineEntry[]
    attachments: AttachmentRef[]
```

### 1.3 接口定义

```python
class IMParserService:
    def parse(self, file_path: str, platform: str) -> ParseResult:
        """
        解析 IM 导出文件

        Args:
            file_path: 文件路径
            platform: 平台类型 (wechat/whatsapp/telegram)

        Returns:
            ParseResult: 解析结果
        """
        pass

    def build_timeline(self, messages: List[Message]) -> List[TimelineEntry]:
        """构建时间线"""
        pass

    def extract_participants(self, messages: List[Message]) -> List[Participant]:
        """提取参与者"""
        pass
```

### 1.4 数据输出示例

```json
{
  "conversation_id": "conv-001",
  "platform": "wechat",
  "participants": [
    {
      "id": "p001",
      "name": "张三",
      "account": "zhangsan_wx",
      "role": "seller"
    },
    {
      "id": "p002",
      "name": "李四",
      "account": "lisi_wx",
      "role": "buyer"
    }
  ],
  "messages": [
    {
      "message_id": "m001",
      "sender_id": "p001",
      "content": "这款包包现货，价格 5800",
      "timestamp": "2024-01-15T10:30:00+08:00",
      "message_type": "text"
    }
  ],
  "timeline": [
    {
      "timestamp": "2024-01-15T10:30:00+08:00",
      "event_type": "inquiry",
      "participants": ["p001", "p002"],
      "summary": "商品咨询"
    }
  ]
}
```

### 1.5 技术实现

```python
# 微信解析器
class WeChatParser:
    PATTERNS = {
        'message': r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.+?)\((\d+)\)',
        'image': r'\[图片\]',
        'video': r'\[视频\]',
        'voice': r'\[语音\]',
        'file': r'\[文件\]',
        'location': r'\[位置\].*?\((.+?),(.+?)\)'
    }

    def parse_text_export(self, content: str) -> List[Message]:
        messages = []
        for match in re.finditer(self.PATTERNS['message'], content):
            timestamp, sender, content = match.groups()
            messages.append(Message(
                timestamp=parse_datetime(timestamp),
                sender=sender,
                content=content.strip()
            ))
        return messages
```

### 1.6 性能指标

| 指标 | 目标值 |
|------|--------|
| 解析速度 | 1000 条消息/秒 |
| 内存占用 | < 500MB |
| 准确率 | > 99% |

---

## S2: IM 图片解析服务

### 2.1 服务概述

| 属性 | 值 |
|------|-----|
| 服务编号 | S2 |
| 服务名称 | IM 图片解析服务 |
| 状态 | 需改造 |
| 父能力 | S2 |
| 子能力 | S21 (图片分类), S22 (商品识别) |

### 2.2 功能规格

```yaml
功能列表:
  - 批量图片转码 (格式统一)
  - OCR 文字识别
  - 表格识别与结构化
  - 感知哈希去重
  - 图片分类 (商品/票据/聊天截图/其他)
  - 商品要素识别

子能力:
  S21_图片分类:
    - 图像分类模型
    - 表格疑似检测
    - 场景/材质识别

  S22_商品图像查询:
    - 商品要素识别 (品牌/型号)
    - 向量相似检索
    - 商品库匹配
```

### 2.3 接口定义

```python
class ImageParserService:
    def parse_image(self, image_path: str) -> ImageParseResult:
        """
        解析单张图片

        Returns:
            ImageParseResult:
                - image_hash: 感知哈希
                - category: 图片分类
                - ocr_text: OCR 识别文本
                - tables: 表格数据 (如有)
                - product_info: 商品信息 (如分类为商品)
        """
        pass

    def batch_parse(self, image_paths: List[str]) -> List[ImageParseResult]:
        """批量解析"""
        pass

    def find_similar(self, image_hash: str, top_k: int) -> List[SimilarImage]:
        """查找相似图片"""
        pass
```

### 2.4 数据输出示例

```json
{
  "image_id": "img-001",
  "file_path": "/cases/case-001/media/img001.jpg",
  "image_hash": "phash:a1b2c3d4e5f6...",
  "category": "product",
  "ocr_text": "GUCCI\nMARMONT\n系列号: 123456",
  "tables": [],
  "product_info": {
    "brand": "GUCCI",
    "model": "MARMONT",
    "serial_number": "123456",
    "confidence": 0.92
  },
  "metadata": {
    "width": 1920,
    "height": 1080,
    "format": "JPEG",
    "size_bytes": 524288
  }
}
```

### 2.5 技术栈

| 组件 | 技术选型 |
|------|---------|
| OCR | PaddleOCR |
| 图像分类 | ResNet-50 / EfficientNet |
| 商品识别 | CLIP + Milvus |
| 去重 | perceptual-hash |

---

## S3: IM 语音解析服务

### 3.1 服务概述

| 属性 | 值 |
|------|-----|
| 服务编号 | S3 |
| 服务名称 | IM 语音解析服务 |
| 状态 | 需改造 |
| 输入 | 音频文件 (AMR/M4A/MP3/WAV) |
| 输出 | 转写文本 + 时间戳 |

### 3.2 功能规格

```yaml
功能列表:
  - 音频格式转码
  - ASR 语音转写
  - 说话人区分 (Speaker Diarization)
  - 时间对齐
  - 关键词检测

支持格式:
  - AMR (微信语音)
  - M4A (iPhone 录音)
  - MP3/WAV (通用格式)
  - SILK (微信语音编解码)
```

### 3.3 接口定义

```python
class AudioParserService:
    def transcribe(self, audio_path: str) -> TranscribeResult:
        """
        语音转写

        Returns:
            TranscribeResult:
                - full_text: 完整转写文本
                - segments: 分段转写 (带说话人)
                - duration: 音频时长
                - language: 检测语言
        """
        pass

    def detect_speakers(self, audio_path: str) -> List[Speaker]:
        """说话人识别"""
        pass
```

### 3.4 数据输出示例

```json
{
  "audio_id": "audio-001",
  "file_path": "/cases/case-001/media/voice001.amr",
  "duration_seconds": 45.3,
  "language": "zh-CN",
  "full_text": "这个包包是正品，专柜买的，有小票",
  "segments": [
    {
      "speaker": "SPEAKER_01",
      "start_time": 0.0,
      "end_time": 15.2,
      "text": "这个包包是正品"
    },
    {
      "speaker": "SPEAKER_02",
      "start_time": 16.0,
      "end_time": 45.3,
      "text": "专柜买的，有小票"
    }
  ],
  "confidence": 0.91
}
```

### 3.5 技术栈

| 组件 | 技术选型 |
|------|---------|
| ASR | FunASR / Whisper |
| 说话人分离 | pyannote-audio |
| 音频处理 | FFmpeg + pydub |

---

## S4: IM 视频解析服务

### 4.1 服务概述

| 属性 | 值 |
|------|-----|
| 服务编号 | S4 |
| 服务名称 | IM 视频解析服务 |
| 状态 | 待讨论确认 |
| 输入 | 视频文件 (MP4/MOV/AVI) |
| 输出 | 关键帧 + 转写文本 |

### 4.2 功能规格

```yaml
功能列表:
  - 视频格式转码
  - ASR 音频转写
  - 关键帧抽取
  - 场景变化检测
  - OCR 关键帧识别

处理策略:
  简单案件:
    - 抽取关键帧 (每 N 秒/场景变化)
    - 关键帧 OCR
    - 音频转写

  复杂案件:
    - 仅建立索引和元数据
    - 按需深度解析
```

### 4.3 接口定义

```python
class VideoParserService:
    def parse_video(self, video_path: str, strategy: str = "standard") -> VideoParseResult:
        """
        解析视频

        Args:
            video_path: 视频文件路径
            strategy: 解析策略 (light/standard/deep)

        Returns:
            VideoParseResult:
                - duration: 视频时长
                - keyframes: 关键帧列表
                - transcript: 转写文本
                - scenes: 场景列表
        """
        pass

    def extract_keyframes(self, video_path: str, method: str) -> List[KeyFrame]:
        """
        抽取关键帧

        Args:
            method: 抽取方法 (interval/scene_change/motion)
        """
        pass
```

### 4.4 数据输出示例

```json
{
  "video_id": "video-001",
  "file_path": "/cases/case-001/media/vid001.mp4",
  "duration_seconds": 120.5,
  "resolution": "1920x1080",
  "keyframes": [
    {
      "frame_id": "kf-001",
      "timestamp": 5.2,
      "image_path": "/processed/case-001/frames/kf-001.jpg",
      "ocr_text": "发票号码: 12345678",
      "scene_type": "document"
    }
  ],
  "transcript": {
    "full_text": "这是购买记录...",
    "segments": [...]
  }
}
```

---

## S5: PDF/图片表格解析服务

### 5.1 服务概述

| 属性 | 值 |
|------|-----|
| 服务编号 | S5 |
| 服务名称 | PDF/图片表格解析服务 |
| 状态 | 需改造，进行中 |
| 输入 | PDF/图片文件 |
| 输出 | 结构化表格 JSON |

### 5.2 功能规格

```yaml
功能列表:
  - PDF 文本提取
  - 图片 OCR 识别
  - 表格检测与识别
  - 表格结构还原
  - 手写体识别 (部分)
  - 规则模板抽取

技术方案:
  方案1_OCR+表格识别:
    - PaddleOCR 文字识别
    - Table Recognition 表格结构
    - 适用于扫描件/图片

  方案2_深度学习结构识别:
    - LayoutLM 文档理解
    - 适用于复杂排版 PDF

  方案3_规则模板:
    - 预定义模板匹配
    - 适用于固定格式单据
```

### 5.3 接口定义

```python
class TableParserService:
    def parse_pdf(self, pdf_path: str) -> List[TableResult]:
        """解析 PDF 文件中的表格"""
        pass

    def parse_image(self, image_path: str) -> List[TableResult]:
        """解析图片中的表格"""
        pass

    def extract_by_template(self, file_path: str, template_id: str) -> DictResult:
        """按模板抽取"""
        pass
```

### 5.4 数据输出示例

```json
{
  "file_id": "file-001",
  "tables": [
    {
      "table_id": "tbl-001",
      "page": 1,
      "bbox": [100, 200, 500, 600],
      "headers": ["订单号", "商品名称", "数量", "单价", "金额"],
      "rows": [
        ["ORD001", "GUCCI 包包", "1", "5800", "5800"],
        ["ORD002", "LV 钱包", "2", "3500", "7000"]
      ],
      "confidence": 0.95
    }
  ]
}
```

---

## S6: Excel 结构化解析服务

### 6.1 服务概述

| 属性 | 值 |
|------|-----|
| 服务编号 | S6 |
| 服务名称 | Excel 结构化解析服务 |
| 状态 | 已具备 |
| 输入 | Excel 文件 (.xlsx/.xls/.csv) |
| 输出 | 结构化数据 |

### 6.2 功能规格

```yaml
功能列表:
  - 多 Sheet 解析
  - 合并单元格处理
  - 公式展开与计算
  - 数据类型推断
  - 空值/异常值处理
  - 大文件流式处理

支持格式:
  - .xlsx (Excel 2007+)
  - .xls (Excel 97-2003)
  - .csv (逗号分隔)
  - .tsv (制表符分隔)
```

### 6.3 接口定义

```python
class ExcelParserService:
    def parse(self, file_path: str, options: ParseOptions = None) -> ExcelParseResult:
        """
        解析 Excel 文件

        Args:
            file_path: 文件路径
            options:
                - sheets: 指定 Sheet (默认全部)
                - header_row: 表头行号
                - expand_formulas: 是否展开公式
        """
        pass

    def get_sheets(self, file_path: str) -> List[SheetInfo]:
        """获取 Sheet 列表"""
        pass
```

### 6.4 数据输出示例

```json
{
  "file_id": "excel-001",
  "sheets": [
    {
      "sheet_name": "订单明细",
      "headers": ["订单号", "日期", "商品", "数量", "金额"],
      "data": [
        {"订单号": "ORD001", "日期": "2024-01-15", "商品": "包包", "数量": 1, "金额": 5800}
      ],
      "merged_cells": [
        {"range": "A1:A3", "value": "合并内容"}
      ],
      "row_count": 100,
      "column_count": 5
    }
  ]
}
```

---

## S7: 邮件解析服务

### 7.1 服务概述

| 属性 | 值 |
|------|-----|
| 服务编号 | S7 |
| 服务名称 | 邮件解析服务 |
| 状态 | 已具备 |
| 输入 | 邮件文件 (.eml/.msg/.mbox) |
| 输出 | 邮件结构化数据 |

### 7.2 功能规格

```yaml
功能列表:
  - MIME 结构解析
  - 邮件头部解析 (发件人/收件人/主题/时间)
  - 正文提取 (纯文本/HTML)
  - 附件提取与链路解析
  - 嵌套邮件处理
  - 邮件线程重建

支持格式:
  - .eml (标准邮件格式)
  - .msg (Outlook 格式)
  - .mbox (邮箱导出格式)
```

### 7.3 接口定义

```python
class EmailParserService:
    def parse_email(self, file_path: str) -> EmailParseResult:
        """解析单个邮件"""
        pass

    def parse_mbox(self, file_path: str) -> List[EmailParseResult]:
        """解析 mbox 文件"""
        pass

    def extract_attachments(self, email: Email) -> List[Attachment]:
        """提取附件"""
        pass
```

### 7.4 数据输出示例

```json
{
  "email_id": "email-001",
  "headers": {
    "from": "sender@example.com",
    "to": ["receiver@example.com"],
    "cc": [],
    "subject": "订单确认",
    "date": "2024-01-15T10:30:00+08:00"
  },
  "body": {
    "text": "您好，附件是订单确认...",
    "html": "<html>...</html>"
  },
  "attachments": [
    {
      "filename": "订单.pdf",
      "content_type": "application/pdf",
      "size": 102400,
      "file_path": "/cases/case-001/attachments/订单.pdf"
    }
  ],
  "thread_id": "thread-001"
}
```

---

## S8: 实体抽取服务

### 8.1 服务概述

| 属性 | 值 |
|------|-----|
| 服务编号 | S8 |
| 服务名称 | 实体抽取服务 |
| 状态 | 待讨论确认 |
| 功能 | 人/地/物/时间标准化 |

### 8.2 功能规格

```yaml
功能列表:
  - 命名实体识别 (NER)
  - 字典/规则抽取
  - LLM 语义抽取
  - 实体标准化
  - 实体链接与消歧

实体类型:
  - Person: 人物 (姓名、别名)
  - Organization: 组织 (公司、店铺)
  - Location: 地点 (地址、城市)
  - Product: 商品 (品牌、型号)
  - DateTime: 时间 (日期、时间段)
  - Money: 金额 (数值、币种)
  - Phone: 电话号码
  - IDNumber: 证件号码
```

### 8.3 接口定义

```python
class EntityExtractionService:
    def extract(self, text: str, entity_types: List[str] = None) -> List[Entity]:
        """
        从文本中抽取实体

        Args:
            text: 输入文本
            entity_types: 要抽取的实体类型 (默认全部)

        Returns:
            Entity 列表
        """
        pass

    def normalize(self, entity: Entity) -> Entity:
        """实体标准化"""
        pass

    def link_entities(self, entities: List[Entity], case_id: str) -> List[LinkedEntity]:
        """实体链接 (与已有实体关联)"""
        pass
```

### 8.4 数据输出示例

```json
{
  "text": "张三在2024年1月15日从深圳发货，收件人李四，电话13812345678",
  "entities": [
    {
      "entity_id": "ent-001",
      "entity_type": "Person",
      "text": "张三",
      "normalized": "张三",
      "position": {"start": 0, "end": 2},
      "confidence": 0.98
    },
    {
      "entity_id": "ent-002",
      "entity_type": "DateTime",
      "text": "2024年1月15日",
      "normalized": "2024-01-15",
      "position": {"start": 3, "end": 13}
    },
    {
      "entity_id": "ent-003",
      "entity_type": "Location",
      "text": "深圳",
      "normalized": "广东省深圳市",
      "position": {"start": 14, "end": 16}
    }
  ]
}
```

---

## S9: 关系/图谱构建服务

### 9.1 服务概述

| 属性 | 值 |
|------|-----|
| 服务编号 | S9 |
| 服务名称 | 关系/图谱构建服务 |
| 状态 | 待讨论确认 |
| 输出 | 关系边 + 置信度 |

### 9.2 功能规格

```yaml
功能列表:
  - 关系抽取 (RE)
  - 规则模板匹配
  - 图谱推断
  - LLM 关系抽取
  - 图数据库写入
  - 关系强度计算

关系类型:
  - KNOWS: 认识
  - FAMILY_OF: 亲属
  - WORKS_FOR: 工作关系
  - BUYER_OF: 买家
  - SELLER_OF: 卖家
  - TRANSACTS_WITH: 交易
  - COMMUNICATED_WITH: 通讯
```

### 9.3 接口定义

```python
class GraphBuilderService:
    def extract_relations(self, text: str, entities: List[Entity]) -> List[Relation]:
        """从文本中抽取关系"""
        pass

    def build_graph(self, case_id: str, entities: List[Entity], relations: List[Relation]) -> Graph:
        """构建图谱"""
        pass

    def infer_relations(self, graph: Graph) -> List[InferredRelation]:
        """推断隐含关系"""
        pass
```

---

## S10: 轻量索引服务

### 10.1 服务概述

| 属性 | 值 |
|------|-----|
| 服务编号 | S10 |
| 服务名称 | 轻量索引服务 |
| 状态 | 需改造 |
| 功能 | 快速检索索引 |

### 10.2 功能规格

```yaml
功能列表:
  - 关键词倒排索引
  - 元数据索引
  - 向量轻量索引
  - 实时索引更新
  - 索引合并与优化

存储后端:
  - Elasticsearch: 全文检索
  - Milvus: 向量检索
  - PostgreSQL: 元数据索引
```

### 10.3 接口定义

```python
class IndexService:
    def index_document(self, doc: Document) -> bool:
        """索引文档"""
        pass

    def search(self, query: str, filters: dict = None, top_k: int = 20) -> List[SearchResult]:
        """搜索"""
        pass

    def vector_search(self, embedding: List[float], top_k: int = 10) -> List[SearchResult]:
        """向量搜索"""
        pass
```

---

## S11: 质量校验服务

### 11.1 服务概述

| 属性 | 值 |
|------|-----|
| 服务编号 | S11 |
| 服务名称 | 质量校验服务 |
| 状态 | 规划中 |
| 功能 | 质量评分/异常标记 |

### 11.2 功能规格

```yaml
功能列表:
  - 数据完整性校验
  - 一致性校验
  - 置信度评估
  - 异常检测
  - 抽样人工复核
  - 质量报告生成

校验维度:
  - 完整性: 必填字段是否完整
  - 一致性: 跨源数据是否一致
  - 准确性: 数值/格式是否正确
  - 时效性: 数据时间是否合理
```

### 11.3 接口定义

```python
class QualityCheckService:
    def validate(self, data: dict, rules: List[ValidationRule]) -> ValidationResult:
        """数据校验"""
        pass

    def calculate_score(self, case_id: str) -> QualityScore:
        """计算质量评分"""
        pass

    def sample_for_review(self, case_id: str, sample_rate: float) -> List[SampleItem]:
        """抽样复核"""
        pass
```

---

## S12: 落库归档服务

### 12.1 服务概述

| 属性 | 值 |
|------|-----|
| 服务编号 | S12 |
| 服务名称 | 落库归档服务 |
| 状态 | 待讨论确认 |
| 功能 | 持久化数据 |

### 12.2 功能规格

```yaml
功能列表:
  - PostgreSQL 主表入库
  - Elasticsearch 全文索引
  - Milvus 向量入库
  - Neo4j 图谱入库
  - 数据湖批量入库
  - 冷热数据分层

入库策略:
  - 事务性写入 (PostgreSQL)
  - 批量写入 (ES/Milvus)
  - 增量更新
  - 幂等处理
```

### 12.3 接口定义

```python
class StorageService:
    def store_to_postgres(self, data: dict, table: str) -> bool:
        """存入 PostgreSQL"""
        pass

    def index_to_es(self, doc: dict, index: str) -> bool:
        """索引到 ES"""
        pass

    def store_to_milvus(self, embeddings: List[Embedding], collection: str) -> bool:
        """存入 Milvus"""
        pass

    def archive_case(self, case_id: str) -> bool:
        """归档案件"""
        pass
```

---

# 证据挖掘服务 (M1-M5)

> 第 4 阶段：证据挖掘（增强 LLM / BI数据分析）
>
> 证据挖掘采用"按结构化程度分支"的闭环流程，结合规则、SQL/BI 与 LLM/图谱推断，服务证据大表字段填充与复核闭环。

---

## M1: 规则引擎与评分服务

### 1.1 服务概述

| 属性 | 值 |
|------|-----|
| 服务编号 | M1 |
| 服务名称 | 规则引擎与评分服务 |
| 阶段 | 证据挖掘 |
| 功能 | 案型规则匹配 + 评分计算 |
| 输出 | 命中清单 / 评分解释 |

### 1.2 功能规格

```yaml
功能列表:
  - 规则模板加载与管理
  - 多维度规则匹配
  - 阈值计算与评分
  - 规则命中解释
  - 规则版本管理

处理分支:
  高结构化:
    - SQL/BI 主导
    - 规则匹配/聚合/对账
    - 异常识别
    - 证据大表字段填充
    - 规则阈值回写与口径修订

  混合型:
    - SQL/BI 与 LLM 并行
    - 结构化字段对齐 + 语义抽取融合
    - 关系图谱校验/补全
    - 大表填充与置信度评分
    - 回写规则与提示模板

  低结构化:
    - LLM 语义理解 + 图谱推断
    - 事件链路/人物关系生成
    - 定向触发深解析
    - 大表填充
    - 多轮条件调整与图谱增量更新
```

### 1.3 子能力定义

| 子编号 | 子能力名称 | 目标字段/规则 | 实现方式 |
|--------|-----------|--------------|---------|
| M1-1 | 时间窗匹配 | 交易/支付/物流/通讯时间 | SQL 窗口函数 + 时间桶 |
| M1-2 | 订单/票据号匹配 | 订单号/小票号/运单号 | 主键对齐 + 冲突检测 |
| M1-3 | 人物主体匹配 | 证件号/手机号/账号 | 多键归一 + 消歧规则 |
| M1-4 | 金额与币种校验 | 应付/实付/转账差异 | 差额阈值 + 币种换算 |
| M1-5 | 商品数量一致性 | 品名/型号/规格/数量 | 规格归一 + 单价校验 |
| M1-6 | 物流路径规则 | 发货/收货/过货一致性 | 路径规则 + 时间对齐 |
| M1-7 | 票据/凭证规则 | 发票/保卡/关单对齐 | 票据号关联 + 缺失标记 |
| M1-8 | 跨源一致性 | 交易/支付/对话/物流 | 多源 JOIN + 冲突标注 |
| M1-9 | 异常模式检测 | 高频/拆分支付/异常折扣 | 规则模板 + 统计阈值 |

### 1.4 接口定义

```python
class RuleEngineService:
    def load_rules(self, template_id: str) -> List[Rule]:
        """加载案型规则模板"""
        pass

    def match_rules(self, case_id: str, rule_ids: List[str] = None) -> List[RuleMatch]:
        """
        规则匹配

        Returns:
            List[RuleMatch]:
                - rule_id: 规则ID
                - matched: 是否命中
                - score: 评分
                - details: 命中详情
        """
        pass

    def calculate_score(self, matches: List[RuleMatch]) -> CaseScore:
        """计算综合评分"""
        pass


class TimeWindowMatcher:
    """M1-1: 时间窗匹配"""

    def match_time_windows(
        self,
        case_id: str,
        time_fields: List[str],
        tolerance_hours: int = 72
    ) -> TimeMatchResult:
        """
        时间窗一致性校验

        Args:
            time_fields: 时间字段列表 (transaction_time, payment_time, shipping_time, message_time)
            tolerance_hours: 容差小时数
        """
        pass


class OrderIdMatcher:
    """M1-2: 订单/票据号匹配"""

    def match_ids(
        self,
        case_id: str,
        id_fields: List[str],
        fuzzy_match: bool = True,
        fuzzy_threshold: float = 0.9
    ) -> IdMatchResult:
        """
        订单号一致性校验

        Args:
            id_fields: ID字段列表 (order_id, receipt_number, tracking_number)
        """
        pass


class PersonMatcher:
    """M1-3: 人物主体匹配"""

    def merge_persons(
        self,
        case_id: str,
        identity_fields: List[str],
        match_threshold: float = 0.7
    ) -> List[MergedPerson]:
        """
        人物主体归并

        Args:
            identity_fields: 身份字段 (phone, id_number, wechat, alipay)
        """
        pass


class AmountValidator:
    """M1-4: 金额与币种校验"""

    def validate_amounts(
        self,
        case_id: str,
        amount_fields: List[str],
        tolerance_percent: float = 5.0
    ) -> AmountValidationResult:
        """
        金额一致性校验

        Args:
            amount_fields: 金额字段 (quoted_price, paid_amount, transferred_amount)
        """
        pass
```

### 1.5 数据输出示例

```json
{
  "case_id": "case-001",
  "rule_matches": [
    {
      "rule_id": "TIME_WINDOW_MATCH",
      "rule_name": "时间窗一致性",
      "matched": true,
      "score": 0.95,
      "details": {
        "transaction_time": "2024-01-15T10:30:00",
        "payment_time": "2024-01-15T10:35:00",
        "shipping_time": "2024-01-15T14:00:00",
        "max_deviation_hours": 3.5,
        "tolerance_hours": 72
      }
    },
    {
      "rule_id": "AMOUNT_CONSISTENCY",
      "rule_name": "金额一致性",
      "matched": false,
      "score": 0.6,
      "details": {
        "quoted_price": 5800,
        "paid_amount": 5600,
        "deviation_percent": 3.4,
        "tolerance_percent": 5.0,
        "conflict": false
      }
    }
  ],
  "overall_score": 0.85,
  "risk_level": "medium"
}
```

---

## M2: 证据大表字段填充服务

### 2.1 服务概述

| 属性 | 值 |
|------|-----|
| 服务编号 | M2 |
| 服务名称 | 证据大表字段填充服务 |
| 阶段 | 证据挖掘 |
| 功能 | 字段融合 + 冲突消解 + 置信度评分 |
| 输出 | 字段填充结果 |

### 2.2 功能规格

```yaml
功能列表:
  - 多源字段融合
  - 冲突检测与消解
  - 置信度加权计算
  - 字段来源追溯
  - 缺失字段检测
  - 补证建议生成

处理策略:
  - 结构化数据优先
  - 高置信度优先
  - 时间近者优先
  - 人工标记最优先
```

### 2.3 子能力定义

| 子编号 | 子能力名称 | 目标字段 | 实现方式 |
|--------|-----------|---------|---------|
| M2-1 | 结构化字段对齐 | 订单/商品/金额/时间/人物 | 字段映射表 + 口径统一 |
| M2-2 | 商品语义抽取 | 品牌/型号/序列号/保卡 | 语义抽取 + 实体标准化 |
| M2-3 | 价格与交易语义 | 报价/折扣/实付/税金 | 数值解析 + 语义归类 |
| M2-4 | 人物角色语义 | 买家/卖家/代购/中间人 | 关系语义识别 + 角色绑定 |
| M2-5 | 证据来源融合 | 多来源同字段冲突 | 置信度加权 + 冲突消解 |
| M2-6 | 语义补证建议 | 缺失字段线索 | 缺口检测 + 线索生成 |

### 2.4 接口定义

```python
class EvidenceFieldFiller:
    def fill_fields(self, case_id: str, template_id: str) -> FilledEvidence:
        """
        填充证据大表字段

        Args:
            case_id: 案件ID
            template_id: 案型模板ID

        Returns:
            FilledEvidence:
                - fields: 填充后的字段列表
                - conflicts: 冲突列表
                - missing: 缺失字段
                - suggestions: 补证建议
        """
        pass

    def resolve_conflicts(
        self,
        field_name: str,
        candidates: List[FieldCandidate],
        strategy: str = "highest_confidence"
    ) -> ResolvedField:
        """
        字段冲突消解

        Args:
            candidates: 候选值列表 (带来源和置信度)
            strategy: 消解策略 (highest_confidence, latest, manual)
        """
        pass


class ProductSemanticExtractor:
    """M2-2: 商品语义抽取"""

    def extract_product_info(self, text: str, images: List[str] = None) -> ProductInfo:
        """
        抽取商品信息

        Returns:
            ProductInfo:
                - brand: 品牌
                - model: 型号
                - serial_number: 序列号
                - warranty_info: 保修信息
        """
        pass


class RoleSemanticExtractor:
    """M2-4: 人物角色语义"""

    def extract_roles(self, case_id: str) -> List[PersonRole]:
        """
        识别人物角色

        Returns:
            PersonRole:
                - person_id: 人员ID
                - role: 角色 (buyer, seller, agent, middleman, carrier)
                - confidence: 置信度
                - evidence_ids: 证据来源
        """
        pass


class SupplementSuggester:
    """M2-6: 语义补证建议"""

    def generate_suggestions(self, case_id: str, template_id: str) -> List[SupplementSuggestion]:
        """
        生成补证建议

        Returns:
            SupplementSuggestion:
                - missing_field: 缺失字段
                - importance: 重要程度
                - suggested_sources: 建议来源
                - search_keywords: 搜索关键词
        """
        pass
```

### 2.5 数据输出示例

```json
{
  "case_id": "case-001",
  "evidence_table": {
    "buyer_name": {
      "value": "张三",
      "normalized": "张三",
      "sources": [
        {"file_id": "f001", "field": "收货人", "confidence": 0.98},
        {"file_id": "f002", "field": "买家姓名", "confidence": 0.95}
      ],
      "final_confidence": 0.97,
      "conflict": false
    },
    "transaction_amount": {
      "value": 5800,
      "sources": [
        {"file_id": "f001", "field": "订单金额", "confidence": 0.95, "value": 5800},
        {"file_id": "f003", "field": "转账金额", "confidence": 0.90, "value": 5600}
      ],
      "final_confidence": 0.93,
      "conflict": true,
      "conflict_resolution": "highest_confidence",
      "conflict_note": "订单金额与转账金额不一致，已选择高置信度值"
    }
  },
  "missing_fields": ["buyer_id_number", "invoice_number"],
  "supplement_suggestions": [
    {
      "missing_field": "buyer_id_number",
      "importance": "high",
      "suggested_sources": ["身份证照片", "实名认证记录"],
      "search_keywords": ["身份证", "实名"]
    }
  ]
}
```

---

## M3: 图谱路径分析与链路生成

### 3.1 服务概述

| 属性 | 值 |
|------|-----|
| 服务编号 | M3 |
| 服务名称 | 图谱路径分析与链路生成 |
| 阶段 | 证据挖掘 |
| 功能 | 链路推断 + 可视化 + 路径评分 |
| 输出 | 链路解释与评分 |

### 3.2 功能规格

```yaml
功能列表:
  - 实体间路径发现
  - 关系链路推断
  - 事件时间线排序
  - 关系强度计算
  - 团伙/社区识别
  - 关键节点发现
  - 多轮条件增量更新

图算法:
  - 最短路径 (Dijkstra)
  - 社区发现 (Louvain)
  - 中心性分析 (PageRank, Betweenness)
  - 关联规则挖掘
```

### 3.3 子能力定义

| 子编号 | 子能力名称 | 目标 | 实现方式 |
|--------|-----------|------|---------|
| M3-1 | 事件链语义抽取 | 交易/转账/运输/沟通 | 事件模板 + 时间线排序 |
| M3-2 | 关系强度计算 | 共现/资金往来/共用账号 | 频次统计 + 权重函数 |
| M3-3 | 上下游/团伙识别 | 关键节点与角色聚类 | 社区发现 + 中心性指标 |
| M3-4 | 多轮条件更新 | 案情条件变化 | 增量推断 + 结果回写 |
| M3-5 | 链路可视化 | 图谱展示 | 图查询 + 路径评分 |

### 3.4 接口定义

```python
class GraphPathAnalyzer:
    def find_paths(
        self,
        case_id: str,
        source_entity_id: str,
        target_entity_id: str,
        max_depth: int = 5
    ) -> List[EntityPath]:
        """
        查找实体间路径

        Returns:
            EntityPath:
                - nodes: 节点列表
                - edges: 边列表
                - length: 路径长度
                - confidence: 综合置信度
        """
        pass

    def find_all_paths(self, case_id: str, max_depth: int = 3) -> List[EntityPath]:
        """查找所有实体路径"""
        pass


class EventChainExtractor:
    """M3-1: 事件链语义抽取"""

    def extract_event_chain(self, case_id: str) -> List[EventChain]:
        """
        抽取事件链

        Returns:
            EventChain:
                - chain_id: 链条ID
                - events: 事件列表 (按时间排序)
                - participants: 参与者
                - chain_type: 链条类型 (transaction, shipment, communication)
        """
        pass


class RelationStrengthCalculator:
    """M3-2: 关系强度计算"""

    def calculate_strength(
        self,
        case_id: str,
        relation_types: List[str] = None
    ) -> List[RelationStrength]:
        """
        计算关系强度

        Args:
            relation_types: 关系类型 (co_occurrence, financial, shared_account)

        Returns:
            RelationStrength:
                - source_id: 源实体
                - target_id: 目标实体
                - strength: 强度值 (0-1)
                - factors: 影响因素
        """
        pass


class CommunityDetector:
    """M3-3: 上下游/团伙识别"""

    def detect_communities(
        self,
        case_id: str,
        algorithm: str = "louvain",
        min_size: int = 3
    ) -> List[Community]:
        """
        社区检测/团伙识别

        Returns:
            Community:
                - community_id: 社区ID
                - members: 成员列表
                - central_figure: 核心人物
                - cohesion: 凝聚度
        """
        pass

    def find_key_figures(self, case_id: str) -> List[KeyFigure]:
        """
        发现关键人物 (中心性分析)

        Returns:
            KeyFigure:
                - person_id: 人员ID
                - name: 姓名
                - centrality_score: 中心性得分
                - role: 推断角色
        """
        pass


class IncrementalUpdater:
    """M3-4: 多轮条件更新"""

    def update_with_conditions(
        self,
        case_id: str,
        new_conditions: dict
    ) -> IncrementalResult:
        """
        基于新条件增量更新

        Args:
            new_conditions: 新的案情条件

        Returns:
            IncrementalResult:
                - new_entities: 新发现的实体
                - new_relations: 新发现的关系
                - updated_fields: 更新的字段
                - triggered_parsing: 需要触发的深度解析
        """
        pass
```

### 3.5 数据输出示例

```json
{
  "case_id": "case-001",
  "event_chains": [
    {
      "chain_id": "chain-001",
      "chain_type": "transaction",
      "events": [
        {
          "event_id": "e001",
          "event_type": "inquiry",
          "timestamp": "2024-01-15T10:00:00",
          "participants": ["张三", "李四"],
          "description": "商品咨询"
        },
        {
          "event_id": "e002",
          "event_type": "order",
          "timestamp": "2024-01-15T10:30:00",
          "participants": ["张三", "李四"],
          "description": "下单购买"
        },
        {
          "event_id": "e003",
          "event_type": "payment",
          "timestamp": "2024-01-15T10:35:00",
          "participants": ["张三", "李四"],
          "description": "支付货款"
        }
      ]
    }
  ],
  "communities": [
    {
      "community_id": "comm-001",
      "members": ["张三", "李四", "王五"],
      "central_figure": "李四",
      "cohesion": 0.85,
      "role": "销售团伙"
    }
  ],
  "key_figures": [
    {
      "person_id": "p002",
      "name": "李四",
      "centrality_score": 0.92,
      "betweenness": 0.85,
      "role": "组织者"
    }
  ]
}
```

---

## M4: LLM/多模态推理服务

### 4.1 服务概述

| 属性 | 值 |
|------|-----|
| 服务编号 | M4 |
| 服务名称 | LLM/多模态推理服务 |
| 阶段 | 证据挖掘 |
| 功能 | 语义抽取 + 摘要生成 |
| 输出 | 摘要 / 抽取结果 |

### 4.2 功能规格

```yaml
功能列表:
  - 长文本摘要
  - 关键信息抽取
  - 语义理解与推理
  - 多模态内容理解 (文本+图片)
  - 对话意图识别
  - 情感/态度分析
  - 隐含关系推断

LLM 应用场景:
  - 低结构化数据处理
  - 语义字段融合
  - 图谱校验/补全
  - 事件链路推断
  - 补证建议生成

模型选择:
  - 简单任务: Haiku (低延迟)
  - 复杂推理: Sonnet/Opus (高准确度)
```

### 4.3 接口定义

```python
class LLMInferenceService:
    def summarize(self, text: str, max_length: int = 500) -> str:
        """文本摘要"""
        pass

    def extract_info(self, text: str, schema: dict) -> dict:
        """
        结构化信息抽取

        Args:
            text: 输入文本
            schema: 抽取模式 (字段名 + 描述)

        Returns:
            抽取的结构化数据
        """
        pass

    def infer_relation(self, text: str, entities: List[str]) -> List[dict]:
        """推断实体关系"""
        pass

    def analyze_multimodal(self, text: str, image_paths: List[str]) -> dict:
        """多模态内容理解"""
        pass


class IntentRecognizer:
    """对话意图识别"""

    def recognize_intent(self, message: str) -> IntentResult:
        """
        识别对话意图

        Returns:
            IntentResult:
                - intent: 意图类型 (inquiry, negotiation, order, complaint, etc.)
                - confidence: 置信度
                - entities: 涉及实体
        """
        pass


class ImplicitRelationInferrer:
    """隐含关系推断"""

    def infer(self, case_id: str) -> List[InferredRelation]:
        """
        推断隐含关系

        Returns:
            InferredRelation:
                - source_entity: 源实体
                - target_entity: 目标实体
                - relation_type: 关系类型
                - evidence: 推断依据
                - confidence: 置信度
        """
        pass
```

### 4.4 数据输出示例

```json
{
  "summary": "2024年1月15日，张三通过微信与李四联系购买GUCCI包包，商定价格5800元，当日完成支付并发货。",
  "extracted_info": {
    "product": "GUCCI 包包",
    "price": 5800,
    "currency": "CNY",
    "buyer": "张三",
    "seller": "李四",
    "transaction_date": "2024-01-15",
    "platform": "微信"
  },
  "inferred_relations": [
    {
      "source": "张三",
      "target": "李四",
      "relation": "BUYER_OF",
      "evidence": "对话记录显示张三向李四购买商品",
      "confidence": 0.95
    }
  ],
  "intents": [
    {"message_id": "m001", "intent": "inquiry", "confidence": 0.92},
    {"message_id": "m005", "intent": "negotiation", "confidence": 0.88},
    {"message_id": "m010", "intent": "order", "confidence": 0.95}
  ]
}
```

---

## M5: BI 指标聚合服务

### 5.1 服务概述

| 属性 | 值 |
|------|-----|
| 服务编号 | M5 |
| 服务名称 | BI 指标聚合服务 |
| 阶段 | 证据挖掘 |
| 功能 | 指标计算 + 对账 + 异常检测 |
| 输出 | 指标 / 异常检测结果 |

### 5.2 功能规格

```yaml
功能列表:
  - 交易金额统计
  - 时间分布分析
  - 实体频次统计
  - 异常值检测
  - 趋势分析
  - 对账核验

指标类型:
  汇总指标:
    - 总交易金额
    - 总交易笔数
    - 涉案人员数
    - 涉案商品数

 分布指标:
    - 时间分布 (日/周/月)
    - 金额分布
    - 商品分布

 异常指标:
    - 高频交易
    - 异常金额
    - 时间异常
```

### 5.3 接口定义

```python
class BIAggregationService:
    def calculate_metrics(self, case_id: str, metric_types: List[str]) -> dict:
        """
        计算指标

        Args:
            metric_types: 指标类型列表

        Returns:
            指标计算结果
        """
        pass

    def detect_anomalies(self, case_id: str) -> List[Anomaly]:
        """
        异常检测

        Returns:
            Anomaly:
                - anomaly_type: 异常类型
                - description: 描述
                - severity: 严重程度
                - related_entities: 相关实体
        """
        pass

    def reconcile(self, case_id: str) -> ReconciliationResult:
        """
        对账核验

        Returns:
            ReconciliationResult:
                - matched: 匹配项
                - unmatched: 未匹配项
                - discrepancies: 差异项
        """
        pass


class TimeDistributionAnalyzer:
    """时间分布分析"""

    def analyze_distribution(
        self,
        case_id: str,
        time_field: str,
        granularity: str = "day"
    ) -> TimeDistribution:
        """
        时间分布分析

        Args:
            granularity: 粒度 (hour, day, week, month)
        """
        pass


class AmountAnalyzer:
    """金额分析"""

    def analyze_amounts(self, case_id: str) -> AmountAnalysis:
        """
        金额分析

        Returns:
            AmountAnalysis:
                - total: 总金额
                - distribution: 金额分布
                - outliers: 异常值
                - by_currency: 按币种统计
        """
        pass
```

### 5.4 数据输出示例

```json
{
  "case_id": "case-001",
  "metrics": {
    "total_transaction_amount": 580000,
    "total_transactions": 150,
    "total_persons": 25,
    "total_products": 45,
    "date_range": {
      "start": "2024-01-01",
      "end": "2024-03-31"
    }
  },
  "distributions": {
    "by_month": [
      {"month": "2024-01", "count": 45, "amount": 180000},
      {"month": "2024-02", "count": 55, "amount": 200000},
      {"month": "2024-03", "count": 50, "amount": 200000}
    ],
    "by_amount_range": [
      {"range": "0-1000", "count": 20},
      {"range": "1000-5000", "count": 80},
      {"range": "5000-10000", "count": 40},
      {"range": "10000+", "count": 10}
    ]
  },
  "anomalies": [
    {
      "anomaly_type": "high_frequency",
      "description": "2024-02-15 单日交易 25 笔",
      "severity": "high",
      "related_entities": ["李四"]
    },
    {
      "anomaly_type": "large_amount",
      "description": "单笔交易金额 50000 超过平均值 3 倍",
      "severity": "medium",
      "related_entities": ["张三", "李四"]
    }
  ],
  "reconciliation": {
    "matched": 140,
    "unmatched": 10,
    "discrepancies": [
      {
        "type": "amount_mismatch",
        "order_id": "ORD001",
        "expected": 5800,
        "actual": 5600,
        "difference": 200
      }
    ]
  }
}
```

---

## 服务编排规则

### 第 3 阶段：数据解析 (S1-S12)

**简单案件流程**:
```
元数据抽取 → 文本抽取/OCR/表格识别 → 实体/关系抽取 → 质量校验 → 落库
```

**复杂案件流程**:
```
元数据抽取 → 轻量索引(S10) → 时间线/参与者(S1+S8) → 初版图谱(S9)
→ 条件筛选 → 定向深解析(S2-S7) → 迭代更新
```

### 第 4 阶段：证据挖掘 (M1-M5)

**按结构化程度分支**:

```
                    ┌─────────────────────┐
                    │   字段候选池入口     │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   结构化程度判断     │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  高结构化     │    │   混合型      │    │  低结构化     │
│  (M5+M1)      │    │ (M1+M2+M4)    │    │  (M4+M3)      │
└───────────────┘    └───────────────┘    └───────────────┘
        │                      │                      │
        ▼                      ▼                      ▼
 SQL/BI 规则分析       规则+LLM 并行        LLM 语义理解
 异常识别/对账         语义抽取融合        图谱推断
 证据大表填充          图谱校验补全        事件链路生成
 规则阈值回写          大表填充+评分       定向深解析触发
                                           多轮条件更新
```

---

*版本: 1.1.0 | 更新日期: 2026-02-15*

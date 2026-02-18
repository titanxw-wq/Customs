# S1-S4 多模态解析服务详细设计

## 1. 服务概述

多模态解析服务组负责处理海关案件中的 IM 通讯数据、图片、语音和视频等多媒体内容。

| 服务编号 | 服务名称 | 技术栈 | 核心功能 |
|---------|---------|--------|---------|
| S1 | IM 对话时序解析 | Python + 正则引擎 | 微信/WhatsApp 等导出数据解析 |
| S2 | 图片解析 | PaddleOCR + ResNet | OCR、商品识别、人脸检测 |
| S3 | 语音解析 | FunASR / Whisper | 语音转写、说话人分离 |
| S4 | 视频解析 | FFmpeg + ASR | 关键帧提取、视频转写 |

---

## 2. S1 - IM 对话时序解析服务

### 2.1 服务接口定义

```typescript
// 请求接口
interface S1_IMParseRequest {
  file_id: UUID;                    // 文件 ID
  file_path: string;                // 文件路径
  platform: 'wechat' | 'whatsapp' | 'telegram' | 'qq' | 'auto';
  encoding?: string;                // 文件编码，默认 utf-8
  options?: {
    extract_media?: boolean;        // 是否提取媒体附件
    merge_forwarded?: boolean;      // 是否合并转发消息
    include_deleted?: boolean;      // 是否包含已删除消息标记
  };
}

// 响应接口
interface S1_IMParseResponse {
  code: number;
  message: string;
  data: {
    file_id: UUID;
    platform: string;
    participants: Participant[];
    timeline: TimelineMessage[];
    media_references: MediaReference[];
    statistics: ConversationStats;
    parse_confidence: number;
  };
}

// 参与者
interface Participant {
  id: string;                       // 平台 ID
  name: string;                     // 昵称
  alias?: string;                   // 备注名
  avatar?: string;                  // 头像 URL
  role?: 'owner' | 'admin' | 'member';
}

// 时间线消息
interface TimelineMessage {
  message_id: string;
  timestamp: string;                // ISO 8601
  sender: Participant;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'location' | 'link' | 'system';
  content: string;
  media_ref?: string;               // 媒体引用 ID
  reply_to?: string;                // 回复消息 ID
  forwarded_from?: string;          // 转发来源
  metadata?: Record<string, unknown>;
}

// 媒体引用
interface MediaReference {
  media_id: string;
  message_id: string;
  media_type: string;
  original_name: string;
  file_size: number;
  file_hash: string;
  storage_path: string;
}

// 会话统计
interface ConversationStats {
  total_messages: number;
  date_range: {
    start: string;
    end: string;
  };
  participants_count: number;
  media_count: {
    images: number;
    videos: number;
    audios: number;
    files: number;
  };
}
```

### 2.2 核心类设计

```python
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from abc import ABC, abstractmethod
import re
import json
from datetime import datetime

@dataclass
class ParseContext:
    """解析上下文"""
    file_id: str
    platform: str
    encoding: str
    options: Dict[str, Any]

class IMParserFactory:
    """IM 解析器工厂"""

    _parsers = {
        'wechat': WeChatParser,
        'whatsapp': WhatsAppParser,
        'telegram': TelegramParser,
        'qq': QQParser,
    }

    @classmethod
    def create_parser(cls, platform: str, context: ParseContext) -> 'BaseIMParser':
        parser_class = cls._parsers.get(platform)
        if not parser_class:
            raise ValueError(f"Unsupported platform: {platform}")
        return parser_class(context)

    @classmethod
    def detect_platform(cls, file_path: str, content_sample: str) -> str:
        """自动检测平台类型"""
        patterns = {
            'wechat': r'微信|WeChat|聊天记录',
            'whatsapp': r'WhatsApp|\d{1,2}/\d{1,2}/\d{2,4}',
            'telegram': r'Telegram|telegram',
        }
        for platform, pattern in patterns.items():
            if re.search(pattern, content_sample, re.IGNORECASE):
                return platform
        return 'unknown'

class BaseIMParser(ABC):
    """IM 解析器基类"""

    def __init__(self, context: ParseContext):
        self.context = context
        self.participants: Dict[str, Participant] = {}
        self.timeline: List[TimelineMessage] = []
        self.media_refs: List[MediaReference] = []

    @abstractmethod
    def parse(self, content: str) -> S1_IMParseResponse:
        """解析 IM 导出内容"""
        pass

    @abstractmethod
    def extract_participants(self, content: str) -> List[Participant]:
        """提取参与者信息"""
        pass

    @abstractmethod
    def parse_message_line(self, line: str) -> Optional[TimelineMessage]:
        """解析单条消息"""
        pass

    def normalize_timestamp(self, ts_str: str) -> str:
        """标准化时间戳为 ISO 8601 格式"""
        # 子类实现具体逻辑
        pass

    def calculate_confidence(self) -> float:
        """计算解析置信度"""
        if not self.timeline:
            return 0.0

        parsed_count = len(self.timeline)
        valid_timestamps = sum(1 for msg in self.timeline if msg.timestamp)
        valid_senders = sum(1 for msg in self.timeline if msg.sender)

        confidence = (valid_timestamps / parsed_count * 0.4 +
                     valid_senders / parsed_count * 0.4 +
                     min(parsed_count / 100, 1.0) * 0.2)
        return round(confidence, 3)

class WeChatParser(BaseIMParser):
    """微信聊天记录解析器"""

    # 微信时间戳格式正则
    TIMESTAMP_PATTERNS = [
        r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})',
        r'(\d{4}/\d{2}/\d{2}\s+\d{2}:\d{2})',
    ]

    def parse(self, content: str) -> S1_IMParseResponse:
        lines = content.split('\n')

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # 尝试解析消息行
            message = self.parse_message_line(line)
            if message:
                self.timeline.append(message)

        # 提取参与者
        self.extract_participants(content)

        # 计算统计信息
        stats = self._calculate_stats()

        return S1_IMParseResponse(
            code=0,
            message="success",
            data={
                "file_id": self.context.file_id,
                "platform": "wechat",
                "participants": list(self.participants.values()),
                "timeline": self.timeline,
                "media_references": self.media_refs,
                "statistics": stats,
                "parse_confidence": self.calculate_confidence()
            }
        )

    def parse_message_line(self, line: str) -> Optional[TimelineMessage]:
        # 实现微信消息解析逻辑
        for pattern in self.TIMESTAMP_PATTERNS:
            match = re.search(pattern, line)
            if match:
                timestamp_str = match.group(1)
                # 解析发送者和内容
                parts = line.split(timestamp_str)
                if len(parts) >= 2:
                    sender_part = parts[0].strip()
                    content_part = parts[-1].strip()

                    return TimelineMessage(
                        message_id=self._generate_message_id(),
                        timestamp=self.normalize_timestamp(timestamp_str),
                        sender=self._get_or_create_participant(sender_part),
                        message_type=self._detect_message_type(content_part),
                        content=content_part
                    )
        return None

    def extract_participants(self, content: str) -> List[Participant]:
        # 从消息中提取所有发送者
        pass

    def _detect_message_type(self, content: str) -> str:
        """检测消息类型"""
        if '[图片]' in content or '[Image]' in content:
            return 'image'
        elif '[视频]' in content or '[Video]' in content:
            return 'video'
        elif '[语音]' in content or '[Voice]' in content:
            return 'audio'
        elif '[文件]' in content or '[File]' in content:
            return 'file'
        elif '[链接]' in content or 'http' in content:
            return 'link'
        elif '[位置]' in content or '[Location]' in content:
            return 'location'
        return 'text'
```

### 2.3 处理流程

```
┌─────────────────────────────────────────────────────────────┐
│                     S1 处理流程                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   接收文件路径   │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  检测平台类型    │◄── 自动检测或指定
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  选择解析器      │◄── 工厂模式
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  读取文件内容    │◄── 支持多种编码
                    └────────┬────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │逐行解析  │   │提取参与方│   │媒体引用  │
        └────┬─────┘   └────┬─────┘   └────┬─────┘
              │               │               │
              └───────────────┼───────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  构建时间线      │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  计算置信度      │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  返回结构化结果  │
                    └─────────────────┘
```

### 2.4 错误码定义

| 错误码 | 说明 | 处理建议 |
|-------|------|---------|
| S1-001 | 文件格式不支持 | 转换为支持的格式 |
| S1-002 | 编码检测失败 | 手动指定编码 |
| S1-003 | 平台类型无法识别 | 手动指定平台 |
| S1-004 | 时间戳解析失败 | 检查数据完整性 |
| S1-005 | 媒体文件丢失 | 补充媒体文件 |

---

## 3. S2 - 图片解析服务

### 3.1 服务接口定义

```typescript
interface S2_ImageParseRequest {
  file_id: UUID;
  file_path: string;
  parse_options: {
    ocr_enabled: boolean;           // 启用 OCR
    ocr_language?: string;          // OCR 语言 (chi_sim, eng, etc.)
    product_detection?: boolean;    // 商品识别
    face_detection?: boolean;       // 人脸检测
    qr_code_detection?: boolean;    // 二维码检测
    extract_metadata?: boolean;     // 提取 EXIF 元数据
  };
}

interface S2_ImageParseResponse {
  code: number;
  message: string;
  data: {
    file_id: UUID;
    image_info: ImageInfo;
    ocr_result?: OCRResult;
    detected_objects?: DetectedObject[];
    detected_faces?: FaceDetection[];
    qr_codes?: QRCode[];
    metadata?: EXIFMetadata;
    confidence: number;
  };
}

interface ImageInfo {
  width: number;
  height: number;
  format: string;                   // JPEG, PNG, etc.
  color_mode: string;
  file_size: number;
  file_hash: string;
}

interface OCRResult {
  full_text: string;
  text_blocks: TextBlock[];
  tables?: TableStructure[];
  confidence: number;
}

interface TextBlock {
  block_id: string;
  text: string;
  bounding_box: {                   // 归一化坐标 (0-1)
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  language: string;
}

interface TableStructure {
  table_id: string;
  rows: number;
  columns: number;
  cells: TableCell[];
  bounding_box: BoundingBox;
}

interface DetectedObject {
  object_id: string;
  category: string;                 // 商品类别
  label: string;                    // 具体标签
  confidence: number;
  bounding_box: BoundingBox;
  attributes?: Record<string, unknown>;
}

interface FaceDetection {
  face_id: string;
  bounding_box: BoundingBox;
  landmarks?: FaceLandmarks;
  attributes?: {
    age?: number;
    gender?: string;
    emotion?: string;
  };
  embedding?: number[];             // 人脸特征向量
}

interface QRCode {
  qr_id: string;
  content: string;
  bounding_box: BoundingBox;
  format: string;
}
```

### 3.2 核心类设计

```python
from paddleocr import PaddleOCR
from PIL import Image
import cv2
import numpy as np
from typing import List, Optional, Dict, Any
from dataclasses import dataclass

@dataclass
class ImageParseContext:
    file_id: str
    file_path: str
    options: Dict[str, Any]

class S2_ImageParser:
    """图片解析服务"""

    def __init__(self, context: ImageParseContext):
        self.context = context
        self.ocr_engine = None
        self.object_detector = None
        self.face_detector = None

    def initialize(self):
        """初始化解析引擎"""
        if self.context.options.get('ocr_enabled', True):
            lang = self.context.options.get('ocr_language', 'ch')
            self.ocr_engine = PaddleOCR(
                use_angle_cls=True,
                lang=lang,
                show_log=False
            )

    def parse(self) -> S2_ImageParseResponse:
        """执行图片解析"""
        result = {
            "file_id": self.context.file_id,
            "image_info": self._get_image_info(),
            "confidence": 0.0
        }

        # OCR 解析
        if self.ocr_engine:
            ocr_result = self._perform_ocr()
            result["ocr_result"] = ocr_result
            result["confidence"] = ocr_result["confidence"]

        # 商品检测
        if self.context.options.get('product_detection'):
            objects = self._detect_objects()
            result["detected_objects"] = objects

        # 人脸检测
        if self.context.options.get('face_detection'):
            faces = self._detect_faces()
            result["detected_faces"] = faces

        # 二维码检测
        if self.context.options.get('qr_code_detection'):
            qr_codes = self._detect_qr_codes()
            result["qr_codes"] = qr_codes

        # 元数据提取
        if self.context.options.get('extract_metadata'):
            metadata = self._extract_metadata()
            result["metadata"] = metadata

        return S2_ImageParseResponse(
            code=0,
            message="success",
            data=result
        )

    def _get_image_info(self) -> ImageInfo:
        """获取图片基本信息"""
        with Image.open(self.context.file_path) as img:
            return ImageInfo(
                width=img.width,
                height=img.height,
                format=img.format,
                color_mode=img.mode,
                file_size=self._get_file_size(),
                file_hash=self._calculate_hash()
            )

    def _perform_ocr(self) -> OCRResult:
        """执行 OCR 识别"""
        ocr_result = self.ocr_engine.ocr(self.context.file_path, cls=True)

        text_blocks = []
        full_text_parts = []
        total_confidence = 0.0

        for idx, line in enumerate(ocr_result[0] if ocr_result[0] else []):
            box, (text, confidence) = line

            text_block = TextBlock(
                block_id=f"block_{idx}",
                text=text,
                bounding_box=self._normalize_bbox(box),
                confidence=float(confidence),
                language=self._detect_language(text)
            )
            text_blocks.append(text_block)
            full_text_parts.append(text)
            total_confidence += float(confidence)

        avg_confidence = total_confidence / len(text_blocks) if text_blocks else 0.0

        # 检测表格结构
        tables = self._detect_tables(ocr_result)

        return OCRResult(
            full_text="\n".join(full_text_parts),
            text_blocks=text_blocks,
            tables=tables,
            confidence=round(avg_confidence, 3)
        )

    def _detect_tables(self, ocr_result) -> List[TableStructure]:
        """检测表格结构"""
        # 使用 PaddleOCR 的表格识别功能
        # 或者基于文本块位置推断表格
        pass

    def _detect_objects(self) -> List[DetectedObject]:
        """检测商品对象"""
        # 使用预训练的商品检测模型
        pass

    def _detect_faces(self) -> List[FaceDetection]:
        """检测人脸"""
        # 使用 OpenCV 或其他人脸检测库
        pass

    def _detect_qr_codes(self) -> List[QRCode]:
        """检测二维码"""
        img = cv2.imread(self.context.file_path)
        detector = cv2.QRCodeDetector()
        data, points, _ = detector.detectAndDecode(img)

        if data:
            return [QRCode(
                qr_id="qr_0",
                content=data,
                bounding_box=self._points_to_bbox(points),
                format="QR"
            )]
        return []

    def _extract_metadata(self) -> EXIFMetadata:
        """提取 EXIF 元数据"""
        try:
            with Image.open(self.context.file_path) as img:
                exif = img._getexif()
                if exif:
                    return self._parse_exif(exif)
        except Exception:
            pass
        return {}

    def _normalize_bbox(self, box: List) -> BoundingBox:
        """将像素坐标转换为归一化坐标"""
        # 获取图片尺寸
        img_info = self._get_image_info()

        # 计算边界框
        x_coords = [p[0] for p in box]
        y_coords = [p[1] for p in box]

        return BoundingBox(
            x=min(x_coords) / img_info.width,
            y=min(y_coords) / img_info.height,
            width=(max(x_coords) - min(x_coords)) / img_info.width,
            height=(max(y_coords) - min(y_coords)) / img_info.height
        )
```

### 3.3 处理流程

```
┌─────────────────────────────────────────────────────────────┐
│                     S2 处理流程                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   加载图片文件   │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  获取图片信息    │
                    │  (尺寸/格式)     │
                    └────────┬────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
  ┌───────────┐        ┌───────────┐        ┌───────────┐
  │  OCR 识别  │        │  对象检测  │        │  人脸检测  │
  │(PaddleOCR)│        │(商品/物品) │        │(OpenCV)   │
  └─────┬─────┘        └─────┬─────┘        └─────┬─────┘
        │                     │                     │
        ▼                     ▼                     ▼
  ┌───────────┐        ┌───────────┐        ┌───────────┐
  │ 表格检测   │        │ 二维码检测 │        │ EXIF提取  │
  └─────┬─────┘        └─────┬─────┘        └─────┬─────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  结果融合与校验  │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  计算置信度      │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  返回结构化结果  │
                    └─────────────────┘
```

### 3.4 配置参数

```yaml
# S2 服务配置
s2_image_parser:
  # OCR 配置
  ocr:
    enabled: true
    language: "ch"                  # 中文
    use_angle_cls: true             # 角度分类
    det_db_thresh: 0.3              # 检测阈值
    det_db_box_thresh: 0.5          # 文本框阈值

  # 商品检测配置
  product_detection:
    enabled: true
    model: "yolov8-products"
    confidence_threshold: 0.5
    categories:
      - "cosmetics"                 # 化妆品
      - "electronics"               # 电子产品
      - "luxury_goods"              # 奢侈品
      - "tobacco"                   # 烟草
      - "alcohol"                   # 酒类

  # 人脸检测配置
  face_detection:
    enabled: false                  # 默认关闭，涉及隐私
    model: "retinaface"
    confidence_threshold: 0.8

  # 资源限制
  resources:
    max_image_size: 50MB            # 最大图片大小
    max_resolution: 10000           # 最大分辨率
    timeout: 60s                    # 超时时间
```

---

## 4. S3 - 语音解析服务

### 4.1 服务接口定义

```typescript
interface S3_AudioParseRequest {
  file_id: UUID;
  file_path: string;
  parse_options: {
    language?: string;              // 语言代码
    enable_diarization?: boolean;   // 说话人分离
    num_speakers?: number;          // 预期说话人数
    enable_punctuation?: boolean;   // 标点恢复
    enable_itn?: boolean;           // 逆文本标准化
    hot_words?: string[];           // 热词列表
  };
}

interface S3_AudioParseResponse {
  code: number;
  message: string;
  data: {
    file_id: UUID;
    audio_info: AudioInfo;
    transcription: TranscriptionResult;
    speakers?: SpeakerSegment[];
    confidence: number;
  };
}

interface AudioInfo {
  duration: number;                 // 时长(秒)
  sample_rate: number;              // 采样率
  channels: number;                 // 声道数
  format: string;                   // 格式
  file_size: number;
  file_hash: string;
}

interface TranscriptionResult {
  full_text: string;                // 完整转写文本
  segments: TranscriptionSegment[]; // 分段结果
  language: string;                 // 检测到的语言
  confidence: number;
}

interface TranscriptionSegment {
  segment_id: string;
  start_time: number;               // 开始时间(秒)
  end_time: number;                 // 结束时间(秒)
  text: string;                     // 文本内容
  speaker_id?: string;              // 说话人 ID
  confidence: number;
  words?: WordTimestamp[];          // 词级时间戳
}

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

interface SpeakerSegment {
  speaker_id: string;
  segments: string[];               // 片段 ID 列表
  total_duration: number;           // 总时长
  speaker_label?: string;           // 可选标签
}
```

### 4.2 核心类设计

```python
from funasr import AutoModel
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import librosa
import soundfile as sf

@dataclass
class AudioParseContext:
    file_id: str
    file_path: str
    options: Dict[str, Any]

class S3_AudioParser:
    """语音解析服务"""

    def __init__(self, context: AudioParseContext):
        self.context = context
        self.asr_model = None
        self.diarization_model = None

    def initialize(self):
        """初始化 ASR 模型"""
        # FunASR 模型配置
        self.asr_model = AutoModel(
            model="paraformer-zh",      # 中文模型
            vad_model="fsmn-vad",       # VAD 模型
            punc_model="ct-punc",       # 标点模型
            # 热词支持
            hotword=self.context.options.get('hot_words', [])
        )

    def parse(self) -> S3_AudioParseResponse:
        """执行语音解析"""
        # 获取音频信息
        audio_info = self._get_audio_info()

        # 执行 ASR 转写
        transcription = self._transcribe()

        # 说话人分离
        speakers = None
        if self.context.options.get('enable_diarization'):
            speakers = self._diarize()

        return S3_AudioParseResponse(
            code=0,
            message="success",
            data={
                "file_id": self.context.file_id,
                "audio_info": audio_info,
                "transcription": transcription,
                "speakers": speakers,
                "confidence": transcription["confidence"]
            }
        )

    def _get_audio_info(self) -> AudioInfo:
        """获取音频信息"""
        # 使用 librosa 或 soundfile 获取音频信息
        y, sr = librosa.load(self.context.file_path, sr=None)
        duration = librosa.get_duration(y=y, sr=sr)

        info = sf.info(self.context.file_path)

        return AudioInfo(
            duration=duration,
            sample_rate=sr,
            channels=info.channels,
            format=info.format,
            file_size=self._get_file_size(),
            file_hash=self._calculate_hash()
        )

    def _transcribe(self) -> TranscriptionResult:
        """执行语音转写"""
        result = self.asr_model.generate(
            input=self.context.file_path,
            batch_size_s=300,          # 批处理时长
            hotword=self.context.options.get('hot_words', [])
        )

        segments = []
        full_text_parts = []
        total_confidence = 0.0

        for idx, item in enumerate(result):
            text = item.get("text", "")
            timestamp = item.get("timestamp", [])
            confidence = item.get("confidence", 0.0)

            segment = TranscriptionSegment(
                segment_id=f"seg_{idx}",
                start_time=timestamp[0] / 1000 if timestamp else 0,
                end_time=timestamp[1] / 1000 if timestamp else 0,
                text=text,
                confidence=confidence,
                words=self._extract_words(item.get("word_timestamps", []))
            )
            segments.append(segment)
            full_text_parts.append(text)
            total_confidence += confidence

        avg_confidence = total_confidence / len(segments) if segments else 0.0

        return TranscriptionResult(
            full_text=" ".join(full_text_parts),
            segments=segments,
            language=self.context.options.get('language', 'zh'),
            confidence=round(avg_confidence, 3)
        )

    def _diarize(self) -> List[SpeakerSegment]:
        """说话人分离"""
        # 使用说话人分离模型
        # 返回说话人分段信息
        pass

    def _extract_words(self, word_timestamps: List) -> List[WordTimestamp]:
        """提取词级时间戳"""
        words = []
        for wt in word_timestamps:
            words.append(WordTimestamp(
                word=wt.get("word", ""),
                start=wt.get("start", 0) / 1000,
                end=wt.get("end", 0) / 1000,
                confidence=wt.get("confidence", 0.0)
            ))
        return words
```

### 4.3 配置参数

```yaml
# S3 服务配置
s3_audio_parser:
  # ASR 模型配置
  asr:
    model: "paraformer-zh"           # 中文模型
    vad_model: "fsmn-vad"            # 语音活动检测
    punc_model: "ct-punc"            # 标点恢复
    device: "cuda"                   # 使用 GPU

  # 说话人分离配置
  diarization:
    enabled: false
    model: "cam++"
    max_speakers: 10

  # 资源限制
  resources:
    max_file_size: 500MB
    max_duration: 3600               # 最大1小时
    supported_formats:
      - "wav"
      - "mp3"
      - "m4a"
      - "flac"
      - "ogg"
```

---

## 5. S4 - 视频解析服务

### 5.1 服务接口定义

```typescript
interface S4_VideoParseRequest {
  file_id: UUID;
  file_path: string;
  parse_options: {
    extract_keyframes?: boolean;     // 提取关键帧
    keyframe_interval?: number;      // 关键帧间隔(秒)
    keyframe_threshold?: number;     // 场景变化阈值
    transcribe_audio?: boolean;      // 转写音频
    ocr_keyframes?: boolean;         // 关键帧 OCR
    detect_objects?: boolean;        // 对象检测
    generate_thumbnails?: boolean;   // 生成缩略图
  };
}

interface S4_VideoParseResponse {
  code: number;
  message: string;
  data: {
    file_id: UUID;
    video_info: VideoInfo;
    keyframes?: Keyframe[];
    audio_transcription?: TranscriptionResult;
    detected_objects?: VideoObject[];
    confidence: number;
  };
}

interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  bitrate: number;
  format: string;
  file_size: number;
  file_hash: string;
}

interface Keyframe {
  keyframe_id: string;
  timestamp: number;                 // 时间点(秒)
  frame_path: string;                // 帧图片路径
  thumbnail_path?: string;           // 缩略图路径
  ocr_result?: OCRResult;            // OCR 结果
  detected_objects?: DetectedObject[];
  scene_change_score?: number;       // 场景变化分数
}

interface VideoObject {
  object_id: string;
  category: string;
  label: string;
  appearances: ObjectAppearance[];   // 出现时段
  confidence: number;
}

interface ObjectAppearance {
  start_time: number;
  end_time: number;
  bounding_box: BoundingBox;
}
```

### 5.2 核心类设计

```python
import ffmpeg
import cv2
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import subprocess
import os

class S4_VideoParser:
    """视频解析服务"""

    def __init__(self, context: 'VideoParseContext'):
        self.context = context
        self.audio_parser = None
        self.image_parser = None

    def initialize(self):
        """初始化子解析器"""
        if self.context.options.get('transcribe_audio'):
            # 初始化音频解析器
            pass
        if self.context.options.get('ocr_keyframes') or self.context.options.get('detect_objects'):
            # 初始化图片解析器
            pass

    def parse(self) -> S4_VideoParseResponse:
        """执行视频解析"""
        # 获取视频信息
        video_info = self._get_video_info()

        result = {
            "file_id": self.context.file_id,
            "video_info": video_info,
            "confidence": 0.0
        }

        # 提取关键帧
        if self.context.options.get('extract_keyframes'):
            keyframes = self._extract_keyframes()
            result["keyframes"] = keyframes

        # 提取并转写音频
        if self.context.options.get('transcribe_audio'):
            audio_path = self._extract_audio()
            transcription = self._transcribe_audio(audio_path)
            result["audio_transcription"] = transcription

        # 检测对象
        if self.context.options.get('detect_objects'):
            objects = self._detect_objects_in_video()
            result["detected_objects"] = objects

        return S4_VideoParseResponse(
            code=0,
            message="success",
            data=result
        )

    def _get_video_info(self) -> VideoInfo:
        """获取视频信息"""
        probe = ffmpeg.probe(self.context.file_path)
        video_stream = next(
            s for s in probe['streams'] if s['codec_type'] == 'video'
        )

        format_info = probe['format']

        return VideoInfo(
            duration=float(format_info.get('duration', 0)),
            width=int(video_stream.get('width', 0)),
            height=int(video_stream.get('height', 0)),
            fps=self._parse_framerate(video_stream.get('r_frame_rate', '0/1')),
            codec=video_stream.get('codec_name', ''),
            bitrate=int(format_info.get('bit_rate', 0)),
            format=format_info.get('format_name', ''),
            file_size=int(format_info.get('size', 0)),
            file_hash=self._calculate_hash()
        )

    def _extract_keyframes(self) -> List[Keyframe]:
        """提取关键帧"""
        keyframes = []
        cap = cv2.VideoCapture(self.context.file_path)

        fps = cap.get(cv2.CAP_PROP_FPS)
        interval = int(fps * self.context.options.get('keyframe_interval', 5))
        threshold = self.context.options.get('keyframe_threshold', 0.3)

        prev_frame = None
        frame_count = 0

        output_dir = self._get_output_dir()

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            # 场景变化检测
            if prev_frame is not None:
                diff = cv2.absdiff(frame, prev_frame)
                score = np.mean(diff) / 255.0

                if score > threshold or frame_count % interval == 0:
                    keyframe = self._save_keyframe(
                        frame, frame_count / fps, output_dir
                    )
                    keyframes.append(keyframe)

            prev_frame = frame
            frame_count += 1

        cap.release()
        return keyframes

    def _save_keyframe(self, frame, timestamp: float, output_dir: str) -> Keyframe:
        """保存关键帧"""
        keyframe_id = f"kf_{int(timestamp * 1000)}"
        frame_path = os.path.join(output_dir, f"{keyframe_id}.jpg")

        cv2.imwrite(frame_path, frame)

        keyframe = Keyframe(
            keyframe_id=keyframe_id,
            timestamp=timestamp,
            frame_path=frame_path
        )

        # OCR 处理
        if self.context.options.get('ocr_keyframes'):
            ocr_result = self.image_parser.parse(frame_path)
            keyframe.ocr_result = ocr_result

        # 对象检测
        if self.context.options.get('detect_objects'):
            objects = self.image_parser.detect_objects(frame_path)
            keyframe.detected_objects = objects

        return keyframe

    def _extract_audio(self) -> str:
        """提取音频轨道"""
        audio_path = self.context.file_path.rsplit('.', 1)[0] + '.wav'

        (
            ffmpeg
            .input(self.context.file_path)
            .output(audio_path, acodec='pcm_s16le', ac=1, ar='16000')
            .overwrite_output()
            .run(quiet=True)
        )

        return audio_path

    def _transcribe_audio(self, audio_path: str) -> TranscriptionResult:
        """转写音频"""
        # 使用 S3 服务进行转写
        return self.audio_parser.parse(audio_path)

    def _detect_objects_in_video(self) -> List[VideoObject]:
        """视频对象检测"""
        # 实现视频级对象追踪
        pass
```

### 5.3 配置参数

```yaml
# S4 服务配置
s4_video_parser:
  # 关键帧提取配置
  keyframe:
    enabled: true
    interval: 5                       # 每5秒至少一帧
    threshold: 0.3                    # 场景变化阈值
    format: "jpg"
    quality: 90

  # 音频提取配置
  audio:
    enabled: true
    sample_rate: 16000
    channels: 1

  # 并行处理配置
  parallel:
    enabled: true
    workers: 4

  # 资源限制
  resources:
    max_file_size: 2GB
    max_duration: 7200               # 最大2小时
    supported_formats:
      - "mp4"
      - "avi"
      - "mov"
      - "mkv"
      - "wmv"
      - "flv"
```

---

## 6. 服务间依赖关系

```
S1 (IM解析) ──┬──► S2 (图片解析) ────► S8 (实体抽取)
              │
              ├──► S3 (语音解析) ────► S8 (实体抽取)
              │
              └──► S4 (视频解析) ──┬──► S2 (图片/关键帧)
                                   │
                                   └──► S3 (音频轨道)
```

---

## 7. 部署配置

### 7.1 Docker Compose

```yaml
version: '3.8'

services:
  s1-im-parser:
    build: ./services/s1-im-parser
    ports:
      - "8001:8000"
    environment:
      - LOG_LEVEL=info
    volumes:
      - ./data:/data
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G

  s2-image-parser:
    build: ./services/s2-image-parser
    ports:
      - "8002:8000"
    environment:
      - OCR_LANGUAGE=ch
    volumes:
      - ./data:/data
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
          device_requests:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  s3-audio-parser:
    build: ./services/s3-audio-parser
    ports:
      - "8003:8000"
    environment:
      - ASR_MODEL=paraformer-zh
    volumes:
      - ./data:/data
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G

  s4-video-parser:
    build: ./services/s4-video-parser
    ports:
      - "8004:8000"
    volumes:
      - ./data:/data
    depends_on:
      - s2-image-parser
      - s3-audio-parser
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 16G
```

---

*版本: 1.0.0 | 更新日期: 2026-02-15*

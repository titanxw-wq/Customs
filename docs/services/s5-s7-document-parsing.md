# S5-S7 文档解析服务详细设计

## 1. 服务概述

文档解析服务组负责处理海关案件中的各类文档文件，包括 PDF、图片表格、Excel 电子表格和电子邮件。

| 服务编号 | 服务名称 | 技术栈 | 核心功能 |
|---------|---------|--------|---------|
| S5 | PDF/图片表格解析 | PaddleOCR + 表格识别 | PDF 文本提取、表格识别、版面分析 |
| S6 | Excel 解析 | openpyxl / Apache POI | 多 Sheet 解析、公式计算、类型推断 |
| S7 | 邮件解析 | Python email 模块 | 邮件头解析、正文提取、附件处理 |

---

## 2. S5 - PDF/图片表格解析服务

### 2.1 服务接口定义

```typescript
interface S5_PDFParseRequest {
  file_id: UUID;
  file_path: string;
  parse_options: {
    extract_text?: boolean;          // 提取文本
    extract_tables?: boolean;        // 提取表格
    extract_images?: boolean;        // 提取图片
    ocr_fallback?: boolean;          // OCR 兜底
    ocr_language?: string;           // OCR 语言
    table_structure?: boolean;       // 表格结构识别
    layout_analysis?: boolean;       // 版面分析
    page_range?: {                   // 页码范围
      start: number;
      end: number;
    };
  };
}

interface S5_PDFParseResponse {
  code: number;
  message: string;
  data: {
    file_id: UUID;
    document_info: DocumentInfo;
    pages: PageContent[];
    tables: ExtractedTable[];
    images: ExtractedImage[];
    metadata: PDFMetadata;
    confidence: number;
  };
}

interface DocumentInfo {
  page_count: number;
  title?: string;
  author?: string;
  creator?: string;
  producer?: string;
  creation_date?: string;
  modification_date?: string;
  file_size: number;
  file_hash: string;
  is_scanned: boolean;              // 是否为扫描件
  is_encrypted: boolean;
}

interface PageContent {
  page_number: number;
  width: number;
  height: number;
  text_content?: string;
  text_blocks?: TextBlock[];
  layout_blocks?: LayoutBlock[];
  confidence: number;
}

interface LayoutBlock {
  block_id: string;
  block_type: 'text' | 'title' | 'list' | 'table' | 'image' | 'header' | 'footer';
  bounding_box: BoundingBox;
  content: string | ExtractedTable | ExtractedImage;
  confidence: number;
}

interface ExtractedTable {
  table_id: string;
  page_number: number;
  bounding_box: BoundingBox;
  header_row: string[];
  data_rows: string[][];
  cell_spans?: CellSpan[];          // 合并单元格信息
  html_representation: string;      // HTML 格式
  confidence: number;
}

interface CellSpan {
  row: number;
  col: number;
  row_span: number;
  col_span: number;
}

interface ExtractedImage {
  image_id: string;
  page_number: number;
  bounding_box: BoundingBox;
  image_path: string;               // 提取的图片路径
  format: string;
  ocr_text?: string;                // 图片内 OCR 文本
}

interface PDFMetadata {
  keywords?: string[];
  subject?: string;
  custom_properties?: Record<string, string>;
}
```

### 2.2 核心类设计

```python
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import fitz  # PyMuPDF
from paddleocr import PPStructure
import pdfplumber
from PIL import Image
import io
import os

@dataclass
class PDFParseContext:
    file_id: str
    file_path: str
    options: Dict[str, Any]

class S5_PDFParser:
    """PDF/图片表格解析服务"""

    def __init__(self, context: PDFParseContext):
        self.context = context
        self.doc = None
        self.table_engine = None
        self.pages: List[PageContent] = []
        self.tables: List[ExtractedTable] = []
        self.images: List[ExtractedImage] = []

    def initialize(self):
        """初始化解析引擎"""
        # 打开 PDF 文档
        self.doc = fitz.open(self.context.file_path)

        # 初始化表格识别引擎
        if self.context.options.get('extract_tables') or \
           self.context.options.get('table_structure'):
            self.table_engine = PPStructure(
                show_log=False,
                use_angle_cls=True,
                lang=self.context.options.get('ocr_language', 'ch')
            )

    def parse(self) -> S5_PDFParseResponse:
        """执行 PDF 解析"""
        # 获取文档信息
        doc_info = self._get_document_info()

        # 解析指定页码范围
        page_range = self._get_page_range()

        for page_num in page_range:
            page_content = self._parse_page(page_num)
            self.pages.append(page_content)

        # 计算总体置信度
        confidence = self._calculate_confidence()

        return S5_PDFParseResponse(
            code=0,
            message="success",
            data={
                "file_id": self.context.file_id,
                "document_info": doc_info,
                "pages": self.pages,
                "tables": self.tables,
                "images": self.images,
                "metadata": self._extract_metadata(),
                "confidence": confidence
            }
        )

    def _get_document_info(self) -> DocumentInfo:
        """获取文档基本信息"""
        metadata = self.doc.metadata

        # 检测是否为扫描件
        is_scanned = self._detect_scanned()

        return DocumentInfo(
            page_count=len(self.doc),
            title=metadata.get('title'),
            author=metadata.get('author'),
            creator=metadata.get('creator'),
            producer=metadata.get('producer'),
            creation_date=metadata.get('creationDate'),
            modification_date=metadata.get('modDate'),
            file_size=os.path.getsize(self.context.file_path),
            file_hash=self._calculate_hash(),
            is_scanned=is_scanned,
            is_encrypted=self.doc.is_encrypted
        )

    def _detect_scanned(self) -> bool:
        """检测是否为扫描件"""
        # 检查前几页是否有可提取的文本
        for page_num in range(min(3, len(self.doc))):
            page = self.doc[page_num]
            text = page.get_text()
            if len(text.strip()) > 100:
                return False
        return True

    def _parse_page(self, page_num: int) -> PageContent:
        """解析单页"""
        page = self.doc[page_num]

        page_content = PageContent(
            page_number=page_num + 1,
            width=page.rect.width,
            height=page.rect.height,
            confidence=0.0
        )

        # 提取文本
        if self.context.options.get('extract_text', True):
            if self._detect_scanned():
                # 扫描件使用 OCR
                text_content, text_blocks = self._ocr_page(page)
            else:
                # 数字 PDF 直接提取
                text_content, text_blocks = self._extract_text(page)

            page_content.text_content = text_content
            page_content.text_blocks = text_blocks

        # 版面分析
        if self.context.options.get('layout_analysis'):
            layout_blocks = self._analyze_layout(page)
            page_content.layout_blocks = layout_blocks

        # 提取表格
        if self.context.options.get('extract_tables'):
            tables = self._extract_tables_from_page(page, page_num)
            self.tables.extend(tables)

        # 提取图片
        if self.context.options.get('extract_images'):
            images = self._extract_images_from_page(page, page_num)
            self.images.extend(images)

        return page_content

    def _extract_text(self, page) -> Tuple[str, List[TextBlock]]:
        """提取文本内容"""
        text = page.get_text("text")
        blocks = page.get_text("dict")["blocks"]

        text_blocks = []
        for block in blocks:
            if block.get('type') == 0:  # 文本块
                block_text = "".join(
                    span.get('text', '')
                    for line in block.get('lines', [])
                    for span in line.get('spans', [])
                )

                text_blocks.append(TextBlock(
                    block_id=f"block_{len(text_blocks)}",
                    text=block_text,
                    bounding_box=BoundingBox(
                        x=block['bbox'][0] / page.rect.width,
                        y=block['bbox'][1] / page.rect.height,
                        width=(block['bbox'][2] - block['bbox'][0]) / page.rect.width,
                        height=(block['bbox'][3] - block['bbox'][1]) / page.rect.height
                    ),
                    confidence=1.0,
                    language='zh'
                ))

        return text, text_blocks

    def _ocr_page(self, page) -> Tuple[str, List[TextBlock]]:
        """对页面进行 OCR"""
        # 将页面转换为图片
        mat = fitz.Matrix(2, 2)  # 放大2倍提高 OCR 精度
        pix = page.get_pixmap(matrix=mat)
        img_data = pix.tobytes("png")

        # 使用 PaddleOCR 识别
        result = self.table_engine.ocr(img_data, cls=True)

        text_blocks = []
        full_text_parts = []

        for idx, line in enumerate(result[0] if result[0] else []):
            box, (text, confidence) = line

            text_block = TextBlock(
                block_id=f"ocr_block_{idx}",
                text=text,
                bounding_box=self._normalize_bbox(box, page.rect.width * 2, page.rect.height * 2),
                confidence=float(confidence),
                language=self._detect_language(text)
            )
            text_blocks.append(text_block)
            full_text_parts.append(text)

        return "\n".join(full_text_parts), text_blocks

    def _extract_tables_from_page(self, page, page_num: int) -> List[ExtractedTable]:
        """提取表格"""
        tables = []

        # 使用 pdfplumber 提取表格
        with pdfplumber.open(self.context.file_path) as pdf:
            plumber_page = pdf.pages[page_num]
            page_tables = plumber_page.extract_tables()

            for idx, table_data in enumerate(page_tables):
                if not table_data:
                    continue

                # 获取表格边界
                table_bbox = self._find_table_bbox(plumber_page, table_data)

                table = ExtractedTable(
                    table_id=f"table_p{page_num + 1}_{idx}",
                    page_number=page_num + 1,
                    bounding_box=table_bbox,
                    header_row=table_data[0] if table_data else [],
                    data_rows=table_data[1:] if len(table_data) > 1 else [],
                    html_representation=self._table_to_html(table_data),
                    confidence=0.85
                )
                tables.append(table)

        # 如果 pdfplumber 没找到表格，使用 OCR 表格识别
        if not tables and self.context.options.get('table_structure'):
            tables = self._ocr_tables(page, page_num)

        return tables

    def _ocr_tables(self, page, page_num: int) -> List[ExtractedTable]:
        """使用 OCR 识别表格结构"""
        # 转换为图片
        mat = fitz.Matrix(2, 2)
        pix = page.get_pixmap(matrix=mat)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

        # 使用 PPStructure 进行表格识别
        result = self.table_engine(img)

        tables = []
        for idx, item in enumerate(result):
            if item.get('type') == 'table':
                table_html = item.get('res', {}).get('html', '')
                table_data = self._html_to_table(table_html)

                table = ExtractedTable(
                    table_id=f"ocr_table_p{page_num + 1}_{idx}",
                    page_number=page_num + 1,
                    bounding_box=self._get_table_bbox(item),
                    header_row=table_data[0] if table_data else [],
                    data_rows=table_data[1:] if len(table_data) > 1 else [],
                    html_representation=table_html,
                    confidence=item.get('confidence', 0.8)
                )
                tables.append(table)

        return tables

    def _extract_images_from_page(self, page, page_num: int) -> List[ExtractedImage]:
        """提取图片"""
        images = []
        image_list = page.get_images(full=True)

        output_dir = self._get_output_dir()

        for idx, img_info in enumerate(image_list):
            xref = img_info[0]
            base_image = self.doc.extract_image(xref)

            image_id = f"img_p{page_num + 1}_{idx}"
            image_path = os.path.join(output_dir, f"{image_id}.{base_image['ext']}")

            with open(image_path, 'wb') as f:
                f.write(base_image['image'])

            images.append(ExtractedImage(
                image_id=image_id,
                page_number=page_num + 1,
                bounding_box=self._find_image_bbox(page, xref),
                image_path=image_path,
                format=base_image['ext']
            ))

        return images

    def _table_to_html(self, table_data: List[List[str]]) -> str:
        """将表格数据转换为 HTML"""
        if not table_data:
            return ""

        html = ["<table>"]
        for i, row in enumerate(table_data):
            tag = "th" if i == 0 else "td"
            html.append("<tr>")
            for cell in row:
                html.append(f"<{tag}>{cell or ''}</{tag}>")
            html.append("</tr>")
        html.append("</table>")

        return "\n".join(html)

    def _calculate_confidence(self) -> float:
        """计算解析置信度"""
        if not self.pages:
            return 0.0

        total_blocks = sum(len(p.text_blocks or []) for p in self.pages)
        if total_blocks == 0:
            return 0.0

        total_confidence = sum(
            sum(b.confidence for b in (p.text_blocks or []))
            for p in self.pages
        )

        return round(total_confidence / total_blocks, 3)
```

### 2.3 处理流程

```
┌─────────────────────────────────────────────────────────────┐
│                     S5 处理流程                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   加载 PDF 文件  │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  获取文档信息    │
                    │  (页数/元数据)   │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  检测是否扫描件  │
                    └────────┬────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
        ┌───────────┐                  ┌───────────┐
        │ 数字 PDF  │                  │  扫描件   │
        │ 直接提取  │                  │  OCR 识别 │
        └─────┬─────┘                  └─────┬─────┘
              │                               │
              └───────────────┬───────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  逐页解析        │
                    │  - 文本提取      │
                    │  - 表格识别      │
                    │  - 图片提取      │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  版面分析        │
                    │  (标题/段落/表格)│
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  表格结构识别    │
                    │  (合并单元格)   │
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

---

## 3. S6 - Excel 解析服务

### 3.1 服务接口定义

```typescript
interface S6_ExcelParseRequest {
  file_id: UUID;
  file_path: string;
  parse_options: {
    sheets?: string[];               // 指定 Sheet 名称
    sheet_indices?: number[];        // 指定 Sheet 索引
    include_formulas?: boolean;      // 包含公式
    include_styles?: boolean;        // 包含样式
    include_charts?: boolean;        // 包含图表
    detect_header?: boolean;         // 自动检测表头
    type_inference?: boolean;        // 类型推断
    max_rows?: number;               // 最大行数限制
  };
}

interface S6_ExcelParseResponse {
  code: number;
  message: string;
  data: {
    file_id: UUID;
    workbook_info: WorkbookInfo;
    sheets: SheetData[];
    named_ranges?: NamedRange[];
    charts?: ChartInfo[];
    confidence: number;
  };
}

interface WorkbookInfo {
  sheet_count: number;
  sheet_names: string[];
  author?: string;
  creation_date?: string;
    modification_date?: string;
  file_size: number;
  file_hash: string;
  has_macros: boolean;
  is_protected: boolean;
}

interface SheetData {
  sheet_name: string;
  sheet_index: number;
  dimensions: {
    rows: number;
    columns: number;
  };
  header_row?: string[];             // 检测到的表头
  data_rows: RowData[];
  merged_cells?: MergedCell[];
  column_types?: ColumnType[];
  statistics?: SheetStatistics;
  hidden_rows?: number[];
  hidden_columns?: string[];
}

interface RowData {
  row_index: number;
  cells: CellData[];
}

interface CellData {
  column: string;                    // 列名 (A, B, C...)
  value: any;                        // 值
  formatted_value?: string;          // 格式化后的值
  type: 'string' | 'number' | 'date' | 'boolean' | 'formula' | 'error' | 'empty';
  formula?: string;                  // 公式 (如果包含)
  format?: string;                   // 数字格式
  style?: CellStyle;
  hyperlink?: string;
  comment?: string;
}

interface CellStyle {
  font?: {
    name: string;
    size: number;
    bold: boolean;
    italic: boolean;
    color: string;
  };
  fill?: {
    color: string;
    pattern: string;
  };
  alignment?: {
    horizontal: string;
    vertical: string;
    wrap_text: boolean;
  };
  borders?: Record<string, { style: string; color: string }>;
}

interface MergedCell {
  range: string;                     // e.g., "A1:C1"
  start_row: number;
  start_col: number;
  end_row: number;
  end_col: number;
  value: any;
}

interface ColumnType {
  column: string;
  inferred_type: 'string' | 'number' | 'date' | 'boolean' | 'mixed';
  sample_values: any[];
  null_count: number;
  unique_count: number;
}

interface SheetStatistics {
  total_cells: number;
  non_empty_cells: number;
  numeric_cells: number;
  date_cells: number;
  formula_cells: number;
  error_cells: number;
}

interface NamedRange {
  name: string;
  scope: string;                     // 工作簿/工作表
  formula: string;
  value: any;
}

interface ChartInfo {
  chart_name: string;
  chart_type: string;
  sheet_name: string;
  position: {
    row: number;
    column: number;
  };
  data_range: string;
}
```

### 3.2 核心类设计

```python
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import openpyxl
from openpyxl.utils import get_column_letter
from openpyxl.utils.cell import column_index_from_string
from datetime import datetime
import os

@dataclass
class ExcelParseContext:
    file_id: str
    file_path: str
    options: Dict[str, Any]

class S6_ExcelParser:
    """Excel 解析服务"""

    def __init__(self, context: ExcelParseContext):
        self.context = context
        self.workbook = None

    def initialize(self):
        """初始化工作簿"""
        self.workbook = openpyxl.load_workbook(
            self.context.file_path,
            data_only=not self.context.options.get('include_formulas', False),
            keep_links=False
        )

    def parse(self) -> S6_ExcelParseResponse:
        """执行 Excel 解析"""
        # 获取工作簿信息
        workbook_info = self._get_workbook_info()

        # 解析工作表
        sheets = self._parse_sheets()

        # 提取命名区域
        named_ranges = None
        if self.workbook.defined_names:
            named_ranges = self._extract_named_ranges()

        # 提取图表
        charts = None
        if self.context.options.get('include_charts'):
            charts = self._extract_charts()

        return S6_ExcelParseResponse(
            code=0,
            message="success",
            data={
                "file_id": self.context.file_id,
                "workbook_info": workbook_info,
                "sheets": sheets,
                "named_ranges": named_ranges,
                "charts": charts,
                "confidence": self._calculate_confidence(sheets)
            }
        )

    def _get_workbook_info(self) -> WorkbookInfo:
        """获取工作簿信息"""
        props = self.workbook.properties

        return WorkbookInfo(
            sheet_count=len(self.workbook.sheetnames),
            sheet_names=self.workbook.sheetnames,
            author=props.creator,
            creation_date=props.created,
            modification_date=props.modified,
            file_size=os.path.getsize(self.context.file_path),
            file_hash=self._calculate_hash(),
            has_macros=self._detect_macros(),
            is_protected=self.workbook.security is not None
        )

    def _parse_sheets(self) -> List[SheetData]:
        """解析所有工作表"""
        sheets = []

        # 确定要解析的工作表
        target_sheets = self._get_target_sheets()

        for sheet_name in target_sheets:
            if sheet_name in self.workbook.sheetnames:
                sheet = self.workbook[sheet_name]
                sheet_data = self._parse_single_sheet(sheet)
                sheets.append(sheet_data)

        return sheets

    def _parse_single_sheet(self, sheet) -> SheetData:
        """解析单个工作表"""
        max_row = min(sheet.max_row, self.context.options.get('max_rows', 100000))
        max_col = sheet.max_column

        # 收集所有行数据
        data_rows = []
        for row_idx in range(1, max_row + 1):
            row_data = self._parse_row(sheet, row_idx, max_col)
            data_rows.append(row_data)

        # 检测表头
        header_row = None
        if self.context.options.get('detect_header', True):
            header_row = self._detect_header(data_rows)

        # 提取合并单元格
        merged_cells = self._extract_merged_cells(sheet)

        # 类型推断
        column_types = None
        if self.context.options.get('type_inference', True):
            column_types = self._infer_column_types(data_rows, max_col)

        # 统计信息
        statistics = self._calculate_statistics(data_rows)

        return SheetData(
            sheet_name=sheet.title,
            sheet_index=self.workbook.sheetnames.index(sheet.title),
            dimensions={
                "rows": max_row,
                "columns": max_col
            },
            header_row=header_row,
            data_rows=data_rows,
            merged_cells=merged_cells,
            column_types=column_types,
            statistics=statistics,
            hidden_rows=self._get_hidden_rows(sheet),
            hidden_columns=self._get_hidden_columns(sheet)
        )

    def _parse_row(self, sheet, row_idx: int, max_col: int) -> RowData:
        """解析单行"""
        cells = []

        for col_idx in range(1, max_col + 1):
            col_letter = get_column_letter(col_idx)
            cell = sheet.cell(row=row_idx, column=col_idx)

            cell_data = CellData(
                column=col_letter,
                value=self._get_cell_value(cell),
                type=self._get_cell_type(cell),
                formula=cell.value if isinstance(cell.value, str) and cell.value.startswith('=') else None
            )

            if self.context.options.get('include_styles'):
                cell_data.style = self._extract_style(cell)

            cells.append(cell_data)

        return RowData(row_index=row_idx, cells=cells)

    def _get_cell_value(self, cell) -> Any:
        """获取单元格值"""
        value = cell.value

        if value is None:
            return None

        # 处理日期类型
        if isinstance(value, datetime):
            return value.isoformat()

        return value

    def _get_cell_type(self, cell) -> str:
        """获取单元格类型"""
        value = cell.value

        if value is None:
            return 'empty'
        if isinstance(value, str):
            if value.startswith('='):
                return 'formula'
            return 'string'
        if isinstance(value, (int, float)):
            return 'number'
        if isinstance(value, bool):
            return 'boolean'
        if isinstance(value, datetime):
            return 'date'

        return 'string'

    def _detect_header(self, data_rows: List[RowData]) -> Optional[List[str]]:
        """检测表头行"""
        if not data_rows:
            return None

        first_row = data_rows[0]

        # 检查第一行是否为表头
        header_indicators = 0
        for cell in first_row.cells:
            if cell.type == 'string' and cell.value:
                # 表头通常是短文本，不包含数字
                if len(str(cell.value)) < 50:
                    header_indicators += 1

        if header_indicators > len(first_row.cells) * 0.5:
            return [str(cell.value) if cell.value else f"Column_{cell.column}"
                    for cell in first_row.cells]

        return None

    def _extract_merged_cells(self, sheet) -> List[MergedCell]:
        """提取合并单元格"""
        merged = []

        for merged_range in sheet.merged_cells.ranges:
            min_col, min_row, max_col, max_row = merged_range.bounds

            # 获取合并区域的值（取左上角单元格）
            cell = sheet.cell(row=min_row, column=min_col)

            merged.append(MergedCell(
                range=str(merged_range),
                start_row=min_row,
                start_col=min_col,
                end_row=max_row,
                end_col=max_col,
                value=self._get_cell_value(cell)
            ))

        return merged

    def _infer_column_types(self, data_rows: List[RowData], max_col: int) -> List[ColumnType]:
        """推断列类型"""
        column_types = []

        start_row = 1 if self.context.options.get('detect_header') else 0

        for col_idx in range(1, max_col + 1):
            col_letter = get_column_letter(col_idx)

            values = []
            type_counts = {'string': 0, 'number': 0, 'date': 0, 'boolean': 0, 'empty': 0}

            for row in data_rows[start_row:]:
                if col_idx <= len(row.cells):
                    cell = row.cells[col_idx - 1]
                    values.append(cell.value)
                    type_counts[cell.type] += 1

            # 推断主要类型
            non_empty = sum(v for k, v in type_counts.items() if k != 'empty')
            inferred_type = max(type_counts, key=type_counts.get)

            if type_counts[inferred_type] < non_empty * 0.7:
                inferred_type = 'mixed'

            column_types.append(ColumnType(
                column=col_letter,
                inferred_type=inferred_type,
                sample_values=values[:5],
                null_count=type_counts['empty'],
                unique_count=len(set(str(v) for v in values if v is not None))
            ))

        return column_types

    def _calculate_statistics(self, data_rows: List[RowData]) -> SheetStatistics:
        """计算统计信息"""
        total = 0
        non_empty = 0
        numeric = 0
        dates = 0
        formulas = 0
        errors = 0

        for row in data_rows:
            for cell in row.cells:
                total += 1
                if cell.type != 'empty':
                    non_empty += 1
                if cell.type == 'number':
                    numeric += 1
                if cell.type == 'date':
                    dates += 1
                if cell.type == 'formula':
                    formulas += 1
                if cell.type == 'error':
                    errors += 1

        return SheetStatistics(
            total_cells=total,
            non_empty_cells=non_empty,
            numeric_cells=numeric,
            date_cells=dates,
            formula_cells=formulas,
            error_cells=errors
        )
```

### 3.3 处理流程

```
┌─────────────────────────────────────────────────────────────┐
│                     S6 处理流程                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   加载工作簿     │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  获取工作簿信息  │
                    │  (Sheet列表)    │
                    └────────┬────────┘
                              │
                              ▼
              ┌───────────────┴───────────────┐
              │         遍历每个 Sheet         │
              └───────────────┬───────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  逐行解析单元格  │
                    └────────┬────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
  ┌───────────┐        ┌───────────┐        ┌───────────┐
  │ 类型推断   │        │ 表头检测   │        │ 合并单元格 │
  └─────┬─────┘        └─────┬─────┘        └─────┬─────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  统计信息计算    │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  返回结构化数据  │
                    └─────────────────┘
```

---

## 4. S7 - 邮件解析服务

### 4.1 服务接口定义

```typescript
interface S7_EmailParseRequest {
  file_id: UUID;
  file_path: string;
  parse_options: {
    extract_attachments?: boolean;   // 提取附件
    extract_inline_images?: boolean; // 提取内嵌图片
    parse_html_body?: boolean;       // 解析 HTML 正文
    extract_headers?: boolean;        // 提取所有头信息
    detect_encoding?: boolean;        // 自动检测编码
  };
}

interface S7_EmailParseResponse {
  code: number;
  message: string;
  data: {
    file_id: UUID;
    email_info: EmailInfo;
    headers: EmailHeaders;
    body: EmailBody;
    attachments: EmailAttachment[];
    inline_images: InlineImage[];
    participants: EmailParticipants;
    confidence: number;
  };
}

interface EmailInfo {
  message_id: string;
  subject: string;
  date: string;
  file_size: number;
  file_hash: string;
  format: 'eml' | 'msg' | 'mbox';
}

interface EmailHeaders {
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  reply_to?: EmailAddress;
  sender?: EmailAddress;
  in_reply_to?: string;
  references?: string[];
  priority?: 'high' | 'normal' | 'low';
  sensitivity?: 'normal' | 'personal' | 'private' | 'confidential';
  custom_headers?: Record<string, string>;
}

interface EmailAddress {
  name?: string;
  address: string;
  display_string: string;            // "Name <email@example.com>"
}

interface EmailBody {
  text_content?: string;             // 纯文本正文
  html_content?: string;             // HTML 正文
  converted_text?: string;           // HTML 转换的文本
  content_type: string;
  charset: string;
}

interface EmailAttachment {
  attachment_id: string;
  filename: string;
  content_type: string;
  content_id?: string;               // Content-ID for inline
  file_size: number;
  file_hash: string;
  storage_path: string;              // 存储路径
  is_inline: boolean;
}

interface InlineImage {
  image_id: string;
  content_id: string;
  content_type: string;
  storage_path: string;
}

interface EmailParticipants {
  senders: EmailAddress[];
  recipients: EmailAddress[];
  all_addresses: string[];           // 所有邮箱地址
}
```

### 4.2 核心类设计

```python
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import email
from email import policy
from email.parser import BytesParser
from email.utils import parseaddr, getaddresses
import os
import re
from bs4 import BeautifulSoup
import quopri
import base64

@dataclass
class EmailParseContext:
    file_id: str
    file_path: str
    options: Dict[str, Any]

class S7_EmailParser:
    """邮件解析服务"""

    def __init__(self, context: EmailParseContext):
        self.context = context
        self.message = None

    def initialize(self):
        """初始化邮件解析"""
        with open(self.context.file_path, 'rb') as f:
            self.message = BytesParser(policy=policy.default).parse(f)

    def parse(self) -> S7_EmailParseResponse:
        """执行邮件解析"""
        # 获取基本信息
        email_info = self._get_email_info()

        # 解析头信息
        headers = self._parse_headers()

        # 解析正文
        body = self._parse_body()

        # 提取附件
        attachments = []
        if self.context.options.get('extract_attachments', True):
            attachments = self._extract_attachments()

        # 提取内嵌图片
        inline_images = []
        if self.context.options.get('extract_inline_images', True):
            inline_images = self._extract_inline_images()

        # 提取参与者
        participants = self._extract_participants(headers)

        return S7_EmailParseResponse(
            code=0,
            message="success",
            data={
                "file_id": self.context.file_id,
                "email_info": email_info,
                "headers": headers,
                "body": body,
                "attachments": attachments,
                "inline_images": inline_images,
                "participants": participants,
                "confidence": self._calculate_confidence()
            }
        )

    def _get_email_info(self) -> EmailInfo:
        """获取邮件基本信息"""
        return EmailInfo(
            message_id=self.message.get('Message-ID', ''),
            subject=self.message.get('Subject', ''),
            date=self.message.get('Date', ''),
            file_size=os.path.getsize(self.context.file_path),
            file_hash=self._calculate_hash(),
            format=self._detect_format()
        )

    def _parse_headers(self) -> EmailHeaders:
        """解析邮件头"""
        def parse_address(addr_str: str) -> EmailAddress:
            name, address = parseaddr(addr_str)
            return EmailAddress(
                name=name,
                address=address,
                display_string=addr_str
            )

        def parse_addresses(addr_str: str) -> List[EmailAddress]:
            if not addr_str:
                return []
            return [parse_address(addr) for name, addr in getaddresses([addr_str])]

        headers = EmailHeaders(
            from_=parse_address(self.message.get('From', '')),
            to=parse_addresses(self.message.get('To', '')),
            cc=parse_addresses(self.message.get('Cc', '')),
            bcc=parse_addresses(self.message.get('Bcc', '')),
            reply_to=parse_address(self.message.get('Reply-To', '')) if self.message.get('Reply-To') else None,
            in_reply_to=self.message.get('In-Reply-To'),
            references=self._parse_references()
        )

        # 提取自定义头
        if self.context.options.get('extract_headers'):
            standard_headers = {
                'From', 'To', 'Cc', 'Bcc', 'Reply-To', 'Subject',
                'Date', 'Message-ID', 'In-Reply-To', 'References'
            }
            custom = {}
            for key in self.message.keys():
                if key not in standard_headers:
                    custom[key] = self.message.get(key)
            headers.custom_headers = custom if custom else None

        return headers

    def _parse_body(self) -> EmailBody:
        """解析邮件正文"""
        text_content = None
        html_content = None
        content_type = 'text/plain'
        charset = 'utf-8'

        if self.message.is_multipart():
            for part in self.message.walk():
                content_type_part = part.get_content_type()
                charset_part = part.get_content_charset() or 'utf-8'

                if content_type_part == 'text/plain' and not text_content:
                    payload = part.get_payload(decode=True)
                    text_content = payload.decode(charset_part, errors='replace')
                    charset = charset_part
                    content_type = 'text/plain'

                elif content_type_part == 'text/html' and not html_content:
                    payload = part.get_payload(decode=True)
                    html_content = payload.decode(charset_part, errors='replace')
                    charset = charset_part
                    content_type = 'text/html'

        else:
            content_type = self.message.get_content_type()
            charset = self.message.get_content_charset() or 'utf-8'
            payload = self.message.get_payload(decode=True)

            if payload:
                decoded = payload.decode(charset, errors='replace')
                if content_type == 'text/html':
                    html_content = decoded
                else:
                    text_content = decoded

        # 将 HTML 转换为纯文本
        converted_text = None
        if html_content and not text_content:
            converted_text = self._html_to_text(html_content)

        return EmailBody(
            text_content=text_content,
            html_content=html_content,
            converted_text=converted_text,
            content_type=content_type,
            charset=charset
        )

    def _extract_attachments(self) -> List[EmailAttachment]:
        """提取附件"""
        attachments = []
        output_dir = self._get_output_dir()

        for idx, part in enumerate(self.message.walk()):
            # 跳过非附件部分
            content_disposition = part.get('Content-Disposition', '')
            if 'attachment' not in content_disposition:
                continue

            filename = part.get_filename()
            if not filename:
                filename = f"attachment_{idx}"

            # 解码文件名 (处理编码的文件名)
            filename = self._decode_filename(filename)

            # 保存附件
            payload = part.get_payload(decode=True)
            file_hash = self._calculate_content_hash(payload)

            attachment_path = os.path.join(output_dir, f"att_{idx}_{filename}")
            with open(attachment_path, 'wb') as f:
                f.write(payload)

            attachments.append(EmailAttachment(
                attachment_id=f"att_{idx}",
                filename=filename,
                content_type=part.get_content_type(),
                file_size=len(payload),
                file_hash=file_hash,
                storage_path=attachment_path,
                is_inline=False
            ))

        return attachments

    def _extract_inline_images(self) -> List[InlineImage]:
        """提取内嵌图片"""
        inline_images = []
        output_dir = self._get_output_dir()

        for idx, part in enumerate(self.message.walk()):
            content_id = part.get('Content-ID')
            if not content_id:
                continue

            content_type = part.get_content_type()
            if not content_type.startswith('image/'):
                continue

            # 保存图片
            payload = part.get_payload(decode=True)
            ext = content_type.split('/')[-1]
            image_path = os.path.join(output_dir, f"inline_{idx}.{ext}")

            with open(image_path, 'wb') as f:
                f.write(payload)

            # 移除 Content-ID 的尖括号
            cid = content_id.strip('<>')

            inline_images.append(InlineImage(
                image_id=f"img_{idx}",
                content_id=cid,
                content_type=content_type,
                storage_path=image_path
            ))

        return inline_images

    def _extract_participants(self, headers: EmailHeaders) -> EmailParticipants:
        """提取所有参与者"""
        senders = [headers.from_] if headers.from_ else []
        recipients = headers.to + (headers.cc or []) + (headers.bcc or [])

        all_addresses = []
        for addr in senders + recipients:
            if addr and addr.address:
                all_addresses.append(addr.address)

        return EmailParticipants(
            senders=senders,
            recipients=recipients,
            all_addresses=list(set(all_addresses))
        )

    def _html_to_text(self, html: str) -> str:
        """将 HTML 转换为纯文本"""
        soup = BeautifulSoup(html, 'html.parser')

        # 移除脚本和样式
        for element in soup(['script', 'style']):
            element.decompose()

        # 获取文本
        text = soup.get_text(separator='\n')

        # 清理多余空白
        lines = [line.strip() for line in text.splitlines()]
        return '\n'.join(line for line in lines if line)

    def _decode_filename(self, filename: str) -> str:
        """解码编码的文件名"""
        # 处理 =?charset?encoding?text?= 格式
        if filename.startswith('=?'):
            from email.header import decode_header
            decoded_parts = decode_header(filename)
            result = []
            for part, charset in decoded_parts:
                if isinstance(part, bytes):
                    result.append(part.decode(charset or 'utf-8', errors='replace'))
                else:
                    result.append(part)
            return ''.join(result)
        return filename

    def _calculate_confidence(self) -> float:
        """计算解析置信度"""
        confidence = 1.0

        # 检查必要字段
        if not self.message.get('From'):
            confidence -= 0.2
        if not self.message.get('To'):
            confidence -= 0.1
        if not self.message.get('Date'):
            confidence -= 0.1
        if not self.message.get('Subject'):
            confidence -= 0.1

        # 检查正文
        body = self._parse_body()
        if not body.text_content and not body.html_content:
            confidence -= 0.3

        return max(0.0, round(confidence, 3))
```

---

## 5. 服务间依赖关系

```
S5 (PDF解析) ────► S2 (图片解析) ────► S8 (实体抽取)
       │                                     │
       └─────────────────────────────────────┘

S6 (Excel解析) ───────────────────────► S8 (实体抽取)
       │                                     │
       └─────────────────────────────────────┘

S7 (邮件解析) ──► [附件] ──┬──► S5 (PDF)
                          ├──► S6 (Excel)
                          └──► S2 (图片)
                                   │
                                   ▼
                               S8 (实体抽取)
```

---

## 6. 配置参数

```yaml
# S5-S7 服务配置
document_parsing:
  # PDF 解析配置
  s5_pdf_parser:
    max_file_size: 200MB
    max_pages: 1000
    ocr:
      enabled: true
      language: "ch"
      fallback_on_empty: true
    table:
      enabled: true
      engine: "ppstructure"          # ppstructure / pdfplumber / camelot
    output:
      image_format: "png"
      image_quality: 90

  # Excel 解析配置
  s6_excel_parser:
    max_file_size: 100MB
    max_rows: 100000
    max_columns: 1000
    type_inference:
      enabled: true
      sample_size: 1000
    cache:
      enabled: true
      ttl: 3600

  # 邮件解析配置
  s7_email_parser:
    max_file_size: 50MB
    max_attachments: 100
    max_attachment_size: 20MB
    supported_formats:
      - "eml"
      - "msg"
      - "mbox"
    attachment_extraction:
      enabled: true
      extract_inline: true
```

---

*版本: 1.0.0 | 更新日期: 2026-02-15*

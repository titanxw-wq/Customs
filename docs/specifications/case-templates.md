# 案型模板定义

## 1. 模板概述

案型模板定义了不同类型案件的分析规则、字段映射、校验逻辑和报告模板。

---

## 2. 案型分类

### 2.1 案型代码表

| 代码 | 案型名称 | 风险等级 | 数据来源特征 |
|------|---------|---------|-------------|
| SMUGGLE | 走私案件 | 高 | IM 通讯 + 物流 + 资金 |
| TAX_FRAUD | 涉税案件 | 高 | 发票 + 交易记录 + 财务 |
| IP_THEFT | 知识产权 | 中 | 商品图片 + 交易 + 通讯 |
| DRUG | 毒品案件 | 极高 | IM 加密通讯 + 资金 |
| FRAUD | 诈骗案件 | 高 | IM + 资金流 + 通讯录 |
| GAMBLING | 赌博案件 | 高 | 交易流水 + IM 群组 |
| MONEY_LAUNDER | 洗钱案件 | 极高 | 资金流水 + 账户网络 |

### 2.2 模板优先级

```
极高风险 → 高风险 → 中风险 → 低风险
   ↓           ↓         ↓         ↓
 全面解析   重点解析   按需解析   轻量解析
```

---

## 3. 模板数据结构

### 3.1 基础模板结构

```json
{
  "template_id": "SMUGGLE_V1",
  "template_name": "跨境电商走私案模板",
  "version": "1.0.0",
  "case_type": "SMUGGLE",
  "description": "适用于跨境电商、代购、水客等走私案件分析",

  "metadata": {
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-02-15T00:00:00Z",
    "author": "系统管理员"
  },

  "data_sources": {
    "required": ["im", "transaction", "logistics"],
    "optional": ["financial", "identity", "customs"]
  },

  "parse_strategy": {
    "mode": "complex",
    "services": ["S1", "S2", "S3", "S5", "S6", "S8", "S9"],
    "priority_order": ["S8", "S1", "S5", "S9"]
  }
}
```

### 3.2 字段定义

```json
{
  "fields": [
    {
      "field_id": "buyer_name",
      "field_name": "买家姓名",
      "field_group": "buyer",
      "data_type": "string",
      "required": true,
      "validation": {
        "min_length": 2,
        "max_length": 100
      },
      "extraction": {
        "sources": ["im", "order", "address"],
        "methods": ["ner", "rule", "llm"],
        "priority": "im > order > address"
      }
    },
    {
      "field_id": "buyer_phone",
      "field_name": "买家电话",
      "field_group": "buyer",
      "data_type": "phone",
      "required": true,
      "validation": {
        "pattern": "^1[3-9]\\d{9}$"
      },
      "normalization": {
        "remove_prefix": ["+86", "86"],
        "format": "national"
      }
    },
    {
      "field_id": "transaction_amount",
      "field_name": "交易金额",
      "field_group": "transaction",
      "data_type": "currency",
      "required": true,
      "validation": {
        "min_value": 0,
        "max_value": 100000000
      },
      "aggregation": {
        "method": "sum",
        "group_by": "buyer_id"
      }
    }
  ]
}
```

### 3.3 字段分组定义

```json
{
  "field_groups": [
    {
      "group_id": "buyer",
      "group_name": "买家信息",
      "fields": [
        "buyer_name",
        "buyer_phone",
        "buyer_id_number",
        "buyer_address",
        "buyer_wechat",
        "buyer_alipay"
      ]
    },
    {
      "group_id": "seller",
      "group_name": "卖家信息",
      "fields": [
        "seller_name",
        "seller_phone",
        "seller_shop_name",
        "seller_platform",
        "seller_wechat"
      ]
    },
    {
      "group_id": "transaction",
      "group_name": "交易信息",
      "fields": [
        "order_id",
        "transaction_time",
        "transaction_amount",
        "currency",
        "payment_method",
        "payment_status"
      ]
    },
    {
      "group_id": "logistics",
      "group_name": "物流信息",
      "fields": [
        "tracking_number",
        "shipping_from",
        "shipping_to",
        "carrier",
        "shipping_time",
        "delivery_time"
      ]
    },
    {
      "group_id": "product",
      "group_name": "商品信息",
      "fields": [
        "product_name",
        "product_brand",
        "product_model",
        "quantity",
        "unit_price",
        "total_price",
        "product_category"
      ]
    }
  ]
}
```

---

## 4. 规则引擎配置

### 4.1 校验规则定义

```json
{
  "rules": [
    {
      "rule_id": "TIME_WINDOW_MATCH",
      "rule_name": "时间窗一致性",
      "rule_type": "validation",
      "description": "检查交易、支付、物流、通讯时间是否在合理范围内",
      "config": {
        "time_fields": [
          "transaction_time",
          "payment_time",
          "shipping_time",
          "message_time"
        ],
        "tolerance_hours": 72,
        "cross_reference": true
      },
      "weight": 0.8
    },
    {
      "rule_id": "ORDER_ID_MATCH",
      "rule_name": "订单号一致性",
      "rule_type": "validation",
      "description": "检查订单号在不同来源中是否一致",
      "config": {
        "id_fields": ["order_id", "receipt_number", "tracking_number"],
        "fuzzy_match": true,
        "fuzzy_threshold": 0.9
      },
      "weight": 1.0
    },
    {
      "rule_id": "AMOUNT_CONSISTENCY",
      "rule_name": "金额一致性",
      "rule_type": "validation",
      "description": "检查应收、实付、转账金额是否一致",
      "config": {
        "amount_fields": ["quoted_price", "paid_amount", "transferred_amount"],
        "tolerance_percent": 5,
        "currency_conversion": true
      },
      "weight": 0.9
    },
    {
      "rule_id": "PERSON_IDENTITY_MATCH",
      "rule_name": "人物身份一致性",
      "rule_type": "validation",
      "description": "通过电话、身份证、账号等多维度归并同一人物",
      "config": {
        "identity_fields": ["phone", "id_number", "wechat", "alipay"],
        "match_threshold": 0.7
      },
      "weight": 1.0
    },
    {
      "rule_id": "SHIPPING_ROUTE_VALIDATION",
      "rule_name": "物流路径校验",
      "rule_type": "validation",
      "description": "检查发货、收货、过货路径是否合理",
      "config": {
        "route_check": true,
        "time_sequence": true,
        "known_smuggling_routes": ["HK-SZ", "MC-ZH"]
      },
      "weight": 0.7
    }
  ]
}
```

### 4.2 异常检测规则

```json
{
  "anomaly_rules": [
    {
      "rule_id": "HIGH_FREQUENCY_TRANSACTION",
      "rule_name": "高频交易检测",
      "description": "检测短时间内大量交易",
      "config": {
        "time_window_hours": 24,
        "threshold_count": 50,
        "threshold_amount": 500000
      },
      "severity": "high"
    },
    {
      "rule_id": "SPLIT_PAYMENT",
      "rule_name": "拆分支付检测",
      "description": "检测可能为规避监管的拆分支付",
      "config": {
        "same_amount_threshold": 0.01,
        "min_split_count": 3,
        "time_window_hours": 48
      },
      "severity": "medium"
    },
    {
      "rule_id": "ABNORMAL_DISCOUNT",
      "rule_name": "异常折扣检测",
      "description": "检测异常低价或高折扣",
      "config": {
        "market_price_deviation": 0.3,
        "discount_threshold": 0.5
      },
      "severity": "medium"
    },
    {
      "rule_id": "COMMUNICATION_PATTERN",
      "rule_name": "通讯模式异常",
      "description": "检测可疑通讯模式",
      "config": {
        "encrypted_app_usage": true,
        "delete_message_pattern": true,
        "group_size_threshold": 100
      },
      "severity": "high"
    }
  ]
}
```

---

## 5. 预置模板

### 5.1 跨境电商走私案 (SMUGGLE_V1)

```json
{
  "template_id": "SMUGGLE_V1",
  "template_name": "跨境电商走私案模板",
  "case_type": "SMUGGLE",

  "fields": [
    {"field_id": "buyer_name", "required": true},
    {"field_id": "buyer_phone", "required": true},
    {"field_id": "buyer_address", "required": true},
    {"field_id": "seller_name", "required": true},
    {"field_id": "seller_wechat", "required": false},
    {"field_id": "product_name", "required": true},
    {"field_id": "product_brand", "required": false},
    {"field_id": "quantity", "required": true},
    {"field_id": "unit_price", "required": true},
    {"field_id": "total_amount", "required": true},
    {"field_id": "transaction_time", "required": true},
    {"field_id": "payment_method", "required": true},
    {"field_id": "tracking_number", "required": true},
    {"field_id": "shipping_from", "required": true},
    {"field_id": "shipping_to", "required": true}
  ],

  "rules": [
    "TIME_WINDOW_MATCH",
    "ORDER_ID_MATCH",
    "AMOUNT_CONSISTENCY",
    "PERSON_IDENTITY_MATCH",
    "SHIPPING_ROUTE_VALIDATION"
  ],

  "anomaly_rules": [
    "HIGH_FREQUENCY_TRANSACTION",
    "SPLIT_PAYMENT",
    "ABNORMAL_DISCOUNT"
  ],

  "graph_config": {
    "central_entity": "seller",
    "relation_types": ["SELLS_TO", "SHIPS_TO", "RECEIVES_FROM"],
    "community_detection": true
  },

  "report_sections": [
    "case_summary",
    "entity_network",
    "transaction_analysis",
    "logistics_analysis",
    "timeline",
    "risk_assessment",
    "evidence_list"
  ]
}
```

### 5.2 代购走私案 (DAIGOU_V1)

```json
{
  "template_id": "DAIGOU_V1",
  "template_name": "代购走私案模板",
  "case_type": "SMUGGLE",

  "fields": [
    {"field_id": "buyer_name", "required": true},
    {"field_id": "buyer_phone", "required": true},
    {"field_id": "agent_name", "required": true},
    {"field_id": "agent_wechat", "required": true},
    {"field_id": "agent_location", "required": true},
    {"field_id": "product_name", "required": true},
    {"field_id": "product_brand", "required": true},
    {"field_id": "purchase_location", "required": false},
    {"field_id": "purchase_price", "required": false},
    {"field_id": "selling_price", "required": true},
    {"field_id": "shipping_method", "required": true},
    {"field_id": "customs_declaration", "required": false}
  ],

  "rules": [
    "TIME_WINDOW_MATCH",
    "PERSON_IDENTITY_MATCH",
    "AMOUNT_CONSISTENCY"
  ],

  "anomaly_rules": [
    "ABNORMAL_DISCOUNT",
    "COMMUNICATION_PATTERN"
  ],

  "special_fields": [
    {
      "field_id": "profit_margin",
      "calculation": "(selling_price - purchase_price) / purchase_price",
      "threshold": 0.5,
      "alert": "high_profit_margin"
    }
  ]
}
```

### 5.3 水客走私案 (SHUIKE_V1)

```json
{
  "template_id": "SHUIKE_V1",
  "template_name": "水客走私案模板",
  "case_type": "SMUGGLE",

  "characteristics": {
    "multiple_carriers": true,
    "small_batch_high_frequency": true,
    "organized_network": true
  },

  "fields": [
    {"field_id": "carrier_name", "required": true},
    {"field_id": "carrier_id_number", "required": true},
    {"field_id": "carrier_phone", "required": true},
    {"field_id": "organizer_name", "required": true},
    {"field_id": "product_name", "required": true},
    {"field_id": "carrying_quantity", "required": true},
    {"field_id": "trip_count", "required": true},
    {"field_id": "crossing_point", "required": true},
    {"field_id": "crossing_time", "required": true},
    {"field_id": "fee_per_trip", "required": true}
  ],

  "rules": [
    "PERSON_IDENTITY_MATCH",
    "SHIPPING_ROUTE_VALIDATION"
  ],

  "anomaly_rules": [
    "HIGH_FREQUENCY_TRANSACTION"
  ],

  "graph_config": {
    "central_entity": "organizer",
    "hierarchy": true,
    "carrier_clustering": true
  }
}
```

---

## 6. 字段映射配置

### 6.1 来源字段映射

```json
{
  "source_mappings": {
    "wechat_export": {
      "buyer_name": ["$.contacts[].name", "$.messages[].sender"],
      "buyer_phone": ["$.contacts[].phone"],
      "transaction_time": ["$.messages[].timestamp", "$.transfers[].time"],
      "transaction_amount": ["$.transfers[].amount", "$.red_packets[].amount"]
    },
    "alipay_export": {
      "transaction_time": ["$.records[].gmt_create"],
      "transaction_amount": ["$.records[].amount"],
      "order_id": ["$.records[].trade_no"],
      "counterparty": ["$.records[].counter_party"]
    },
    "excel_order": {
      "order_id": ["$.订单号", "$.order_id", "$.Order ID"],
      "buyer_name": ["$.收货人", "$.买家姓名", "$.buyer_name"],
      "product_name": ["$.商品名称", "$.product", "$.Item"],
      "quantity": ["$.数量", "$.qty", "$.Quantity"],
      "unit_price": ["$.单价", "$.price", "$.Unit Price"]
    }
  }
}
```

### 6.2 标准化规则

```json
{
  "normalization_rules": [
    {
      "field_type": "phone",
      "rules": [
        {"action": "remove_prefix", "value": ["+86", "86", "0086"]},
        {"action": "remove_chars", "value": [" ", "-", "(", ")"]},
        {"action": "validate", "pattern": "^1[3-9]\\d{9}$"}
      ]
    },
    {
      "field_type": "currency",
      "rules": [
        {"action": "remove_chars", "value": ["¥", "$", "€", "HK$", "USD", "CNY"]},
        {"action": "parse_number"},
        {"action": "round", "precision": 2}
      ]
    },
    {
      "field_type": "date",
      "rules": [
        {"action": "parse_formats", "value": ["YYYY-MM-DD", "YYYY/MM/DD", "DD-MM-YYYY"]},
        {"action": "timezone", "value": "Asia/Shanghai"},
        {"action": "format", "value": "YYYY-MM-DD"}
      ]
    },
    {
      "field_type": "name",
      "rules": [
        {"action": "trim"},
        {"action": "normalize_whitespace"},
        {"action": "remove_titles", "value": ["先生", "女士", "小姐", "Mr", "Mrs", "Ms"]}
      ]
    }
  ]
}
```

---

## 7. 报告模板配置

### 7.1 报告结构

```json
{
  "report_template": {
    "template_id": "REPORT_STANDARD_V1",
    "sections": [
      {
        "section_id": "summary",
        "section_name": "案件摘要",
        "required": true,
        "order": 1,
        "content": {
          "case_overview": true,
          "key_findings": true,
          "risk_level": true,
          "recommendation": true
        }
      },
      {
        "section_id": "entity_network",
        "section_name": "涉案人员网络",
        "required": true,
        "order": 2,
        "content": {
          "person_list": true,
          "organization_list": true,
          "relationship_graph": true,
          "community_analysis": true
        }
      },
      {
        "section_id": "transaction_analysis",
        "section_name": "交易分析",
        "required": true,
        "order": 3,
        "content": {
          "transaction_summary": true,
          "amount_statistics": true,
          "time_distribution": true,
          "anomaly_detection": true
        }
      },
      {
        "section_id": "evidence_list",
        "section_name": "证据清单",
        "required": true,
        "order": 4,
        "content": {
          "file_inventory": true,
          "key_evidence": true,
          "chain_of_custody": true
        }
      },
      {
        "section_id": "timeline",
        "section_name": "时间线",
        "required": false,
        "order": 5,
        "content": {
          "events_timeline": true,
          "key_milestones": true
        }
      }
    ]
  }
}
```

---

*版本: 1.0.0 | 更新日期: 2026-02-15*

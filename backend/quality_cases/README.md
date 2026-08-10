# AI 成片真实质量测试集

将原始生活照片放到本目录下的 `photos/`，复制
`manifest.example.json` 为 `manifest.local.json` 并替换文件名。

测试集必须同时覆盖：

- 数量：1、3、6、9 张。
- 内容：`portrait`、`group`、`food`、`architecture`、`night`、`screen`。

先验证测试集，不调用 API：

```bash
cd backend
source .venv/bin/activate
python scripts/quality_check_ai_posters.py \
  quality_cases/manifest.local.json
```

确认预计费用后执行真实测试。四个用例、每例两个候选，共调用 Seedream
八次：

```bash
python scripts/quality_check_ai_posters.py \
  quality_cases/manifest.local.json \
  --execute \
  --confirm-cost YES
```

生成图、JSON 诊断和 Markdown 人工检查表保存在
`backend/quality_reports/`，该目录已被 Git 忽略。

人工检查必须确认：

- 每张输入照片恰好出现一次，没有漏图或重复。
- 没有新增无关人物、照片、品牌或 Logo。
- 人物身份、脸部、服装、食物和关键物品基本保持。
- 建筑结构没有明显错误重绘。
- 中文标题与图注清晰，没有明显乱码或错字。

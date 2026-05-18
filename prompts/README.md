# Prompts

与业务代码分离，存放 **文案生成** 等系统提示与风格说明。

## 当前文件

| 文件 | 用途 |
|------|------|
| `generate_copy_system.md` | **gpt-4o-mini** 多模态生成：看图 + 输出 `title` / `diary` / `captions` / `hashtags` 的 JSON 约束与风格说明 |

后端从仓库根路径读取：`prompts/generate_copy_system.md`（相对 `backend/app/` 上两级目录）。

## 将来可扩展

- 分步 Vision 结构化 JSON 的专用提示
- 按风格拆分的片段与版本记录

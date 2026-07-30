"""
DayFrame 文案生成核心模块。

通过 OpenAI gpt-4o-mini（vision）识别用户上传的照片，
生成结构化的日记文案（标题、正文、每张图配文、话题标签）。
同时支持 hand-drawn-v1 模板的 SVG 手绘标注坐标生成。
"""

import base64
import json
import os
import re
from pathlib import Path

from openai import OpenAI
from pydantic import ValidationError

from app.image_prep import EXT_TO_MIME, read_image_for_model
from app.json_repair import parse_json_object
from app.schemas import (
    DayFrameCopyModel,
    GenerateRequest,
    LayoutHintModel,
    PhotoSketchModel,
    SketchCalloutModel,
)

# prompts/ 目录位于仓库根目录，通过 __file__ 向上两级定位
PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"

# 风格 id 到中文名称的映射，拼入 user prompt 让模型理解文风
STYLE_LABELS = {
    "xiaohongshu": "小红书",
    "travel": "旅行日记",
    "literary": "文艺",
    "minimal": "简洁",
    "moments": "朋友圈",
}


def _openai_base_url() -> str:
    """构造 OpenAI API base URL，兼容带 /chat/completions 的误填。"""
    raw = (os.environ.get("OPENAI_BASE_URL") or "").strip()
    if not raw:
        return "https://api.openai.com/v1"
    u = raw.rstrip("/")
    # 如果用户误填了完整 /chat/completions 路径，自动去除
    if u.endswith("/chat/completions"):
        u = u[: -len("/chat/completions")].rstrip("/")
    if not u.endswith("/v1"):
        u = f"{u}/v1"
    return u


def _strip_json_fence(text: str) -> str:
    """去除模型输出中可能出现的 Markdown 代码围栏（```json ... ```）。"""
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.IGNORECASE)
        t = re.sub(r"\s*```\s*$", "", t)
    return t.strip()


def _parse_model_json(raw: str) -> dict:
    """解析模型返回的 JSON 字符串，自动修复截断/格式问题。"""
    return parse_json_object(_strip_json_fence(raw))


def _coerce_dayframe_payload(data: dict, photo_count: int) -> dict:
    """合并模型返回中的嵌套字段，为缺失的 title/diary/captions/hashtags 填默认值。

    模型有时会在 result / data / copy 等外层 key 里嵌套真正的字段，
    此函数展开所有可能的包装层，确保返回的结构是扁平的 DayFrameCopy 格式。
    """
    merged = dict(data)
    for key in ("result", "data", "copy", "response", "output", "content"):
        inner = merged.get(key)
        if isinstance(inner, dict):
            merged = {**merged, **inner}

    title = merged.get("title") or merged.get("Title") or ""
    diary = merged.get("diary") or merged.get("content") or merged.get("body") or ""

    caps = merged.get("captions")
    if isinstance(caps, str):
        caps = [caps]
    if not isinstance(caps, list):
        caps = []
    captions = [str(c).strip() for c in caps if c is not None and str(c).strip()]

    # 手绘模板中：如果 captions 不够，从 sketches 的 summary 字段提取补充
    sketches_raw = merged.get("sketches")
    if isinstance(sketches_raw, list):
        for i, sk in enumerate(sketches_raw):
            if i >= len(captions) and isinstance(sk, dict):
                summary = sk.get("summary") or sk.get("caption")
                if summary:
                    captions.append(str(summary)[:120])

    while len(captions) < photo_count:
        captions.append(f"第 {len(captions) + 1} 张")
    captions = captions[:photo_count]

    tags = merged.get("hashtags") or merged.get("tags") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in re.split(r"[\s,#]+", tags) if t.strip()]
    if not isinstance(tags, list):
        tags = []
    hashtags = [str(t) if str(t).startswith("#") else f"#{t}" for t in tags if t][:8]
    if not hashtags:
        hashtags = ["#生活记录", "#日常", "#DayFrame"]

    if not str(title).strip():
        title = captions[0][:40] if captions else "今日随拍"
    if not str(diary).strip():
        diary = "记录一下今天的心情与画面，留给以后的自己。"

    return {
        "title": str(title).strip(),
        "diary": str(diary).strip(),
        "captions": captions,
        "hashtags": hashtags,
        "sketches": sketches_raw,
    }


def _completion_text_and_finish(resp: object) -> tuple[str, str | None]:
    """从 OpenAI ChatCompletion 响应中提取文本内容和 finish_reason。

    参数 resp 可以是 SDK 的 Pydantic 对象（正常情况），
    也可能是字符串（网关返回 HTML 等异常），此函数统一处理。
    """
    if isinstance(resp, str):
        snippet = resp.strip()[:200]
        if snippet.lower().startswith("<!doctype") or snippet.lower().startswith("<html"):
            raise ValueError(
                "模型接口返回了网页 HTML，不是 API JSON。请把 backend/.env 里的 "
                "OPENAI_BASE_URL 设为带 /v1 的地址，例如 https://z.apiyihe.org/v1",
            )
        raise ValueError(f"模型接口返回异常文本: {snippet}")
    choices = getattr(resp, "choices", None)
    if not choices:
        raise ValueError("模型返回为空（无 choices）")
    choice = choices[0]
    message = choice.message
    content = (getattr(message, "content", None) or "").strip()
    finish = getattr(choice, "finish_reason", None)
    return content, finish


def _message_content_from_completion(resp: object) -> str:
    """仅从响应中提取文本，忽略 finish_reason。"""
    content, _ = _completion_text_and_finish(resp)
    return content


def _max_tokens_for_request(template_id: str, photo_count: int) -> int:
    """根据模板类型和图片数量，决定 max_tokens 上限。

    手绘模板的 JSON 输出体积大（含坐标数组），自动按图片数量增加上限；
    普通文案模板使用固定 2048。
    环境变量 OPENAI_MAX_TOKENS 可强行覆盖。
    """
    raw = os.environ.get("OPENAI_MAX_TOKENS", "").strip()
    if raw:
        try:
            cap = int(raw)
            if cap >= 1024:
                return cap
        except ValueError:
            pass
    if template_id == "hand-drawn-v1":
        # 手绘 JSON 体积大，按张数加码，降低截断概率
        return min(16384, 6000 + photo_count * 3500)
    return 2048


def _openai_timeout_seconds() -> float:
    """返回 OpenAI API 调用的超时秒数，默认 360 秒（6 分钟）。

    通过环境变量 OPENAI_TIMEOUT 配置，最小 60 秒。
    """
    raw = os.environ.get("OPENAI_TIMEOUT", "360").strip()
    try:
        return max(60.0, float(raw))
    except ValueError:
        return 360.0


def _load_system_prompt(template_id: str) -> str:
    """从 prompts/ 目录加载对应模板的系统提示词文件。"""
    if template_id == "image-collage-v1":
        path = PROMPTS_DIR / "generate_collage_system.md"
    else:
        path = PROMPTS_DIR / "generate_copy_system.md"
    fallback = "你是图文助手，只输出 JSON：title, diary, captions, hashtags。"
    if not path.is_file():
        return fallback
    return path.read_text(encoding="utf-8")


def _image_parts(upload_dir: Path, filenames: list[str]) -> list[dict]:
    """读取上传的图片文件，压缩后转为 base64 的 OpenAI message part。

    每张图被压缩到最长边 1024px、JPEG quality 78，
    然后编码为 data URI 格式嵌入 user message 的 image_url part。
    包含路径穿越防护（校验文件在 upload_dir 内）。
    """
    parts: list[dict] = []
    for name in filenames:
        path = (upload_dir / name).resolve()
        # 路径穿越防护：确保文件在 upload_dir 内
        try:
            path.relative_to(upload_dir.resolve())
        except ValueError as e:
            raise ValueError("非法路径") from e
        if not path.is_file():
            raise FileNotFoundError(name)
        ext = path.suffix.lower().lstrip(".")
        mime = EXT_TO_MIME.get(ext)
        if not mime:
            raise ValueError(f"不支持的扩展名: {ext}")
        raw, mime = read_image_for_model(path)
        b64 = base64.standard_b64encode(raw).decode("ascii")
        parts.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{b64}"},
            },
        )
    return parts


def generate_dayframe_copy(upload_dir: Path, req: GenerateRequest) -> DayFrameCopyModel:
    """核心入口：调用 OpenAI gpt-4o-mini 生成完整的日记文案。

    流程：
    1. 校验 API Key 存在
    2. 加载系统提示词（根据 template_id 选择）
    3. 读取、压缩、编码图片为 base64
    4. 构造 user prompt（含风格、模板、图片数量等信息）
    5. 调用 OpenAI Chat Completion API（response_format = json_object）
    6. 解析并修复模型返回的 JSON
    7. 通过 Pydantic 校验后返回 DayFrameCopyModel
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key or not api_key.strip():
        raise RuntimeError("MISSING_API_KEY")

    n = len(req.filenames)
    style_label = STYLE_LABELS.get(req.style_id, req.style_id)
    system = _load_system_prompt(req.template_id)

    image_parts = _image_parts(upload_dir, req.filenames)
    user_text = (
        f"style_id: {req.style_id}\n"
        f"风格名称：{style_label}\n"
        f"template_id: {req.template_id}\n"
        f"图片数量：{n}\n"
        f"\n"
        f"请根据以上 {n} 张图（按发送顺序）生成 JSON。"
        f"captions 必须恰好包含 {n} 个字符串，与图片一一对应。"
    )
    # 将文本和图片放在同一个 user message 中（多模态）
    user_content: list[dict] = [{"type": "text", "text": user_text}, *image_parts]

    client = OpenAI(
        api_key=api_key.strip(),
        base_url=_openai_base_url(),
        timeout=_openai_timeout_seconds(),
        max_retries=1,
    )
    resp = client.chat.completions.create(
        model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        temperature=0.7,
        max_tokens=_max_tokens_for_request(req.template_id, n),
    )
    raw, finish = _completion_text_and_finish(resp)
    if finish == "length":
        # 输出被截断时，json_repair 仍会尝试修复不完整的 JSON
        pass
    data = _coerce_dayframe_payload(_parse_model_json(raw), n)

    # Pydantic 校验，确保字段类型和格式正确
    try:
        copy = DayFrameCopyModel.model_validate(data)
    except ValidationError as e:
        raise ValueError(
            f"模型 JSON 字段不符合约定（已尝试补全缺失字段）。"
            f"请重试。详情: {e!s}",
        ) from e
    caps = list(copy.captions)
    if len(caps) < n:
        caps.extend([f"第 {i + 1} 张" for i in range(len(caps), n)])
    elif len(caps) > n:
        caps = caps[:n]

    sketches = _normalize_sketches(copy.sketches, n, req.template_id)

    layout_hints_raw = data.get("layout_hints")
    layout_hints: list[LayoutHintModel] | None = None
    if isinstance(layout_hints_raw, list) and len(layout_hints_raw) == n:
        hints = []
        for item in layout_hints_raw:
            if isinstance(item, dict):
                try:
                    hints.append(LayoutHintModel.model_validate(item))
                except ValidationError:
                    hints.append(LayoutHintModel())
            else:
                hints.append(LayoutHintModel())
        if len(hints) == n:
            layout_hints = hints

    return DayFrameCopyModel(
        title=copy.title,
        diary=copy.diary,
        captions=caps,
        hashtags=copy.hashtags,
        sketches=sketches,
        layout_hints=layout_hints,
    )


def _load_overlay_sketch_prompt() -> str:
    """加载手绘标注的系统提示词，供 overlay 回退方案使用。"""
    path = PROMPTS_DIR / "generate_hand_drawn_system.md"
    if path.is_file():
        return path.read_text(encoding="utf-8")
    return "输出 JSON，含 sketches 数组。"


def generate_overlay_sketches(
    upload_dir: Path,
    req: GenerateRequest,
) -> list[PhotoSketchModel]:
    """图像编辑不可用时的回退：用 vision 模型生成 SVG 叠加坐标。

    当 OPENAI_IMAGE_API（gpt-image-1）不可用时（例如第三方网关不支持 /images/edits），
    改用 vision 模型（gpt-4o-mini）生成每张图上标注元素的坐标信息，
    前端据此渲染 SVG 叠加层。
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key or not api_key.strip():
        raise RuntimeError("MISSING_API_KEY")

    n = len(req.filenames)
    system = _load_overlay_sketch_prompt()
    image_parts = _image_parts(upload_dir, req.filenames)
    user_text = (
        f"图片数量：{n}\n"
        f"只输出 JSON，字段：sketches（长度 {n}）。"
        f"每个 callout 必须含 outline（10–20 个点，沿物体真实外轮廓，禁止椭圆）。"
        f"不要 title/diary，仅 sketches。"
    )
    client = OpenAI(
        api_key=api_key.strip(),
        base_url=_openai_base_url(),
        timeout=_openai_timeout_seconds(),
        max_retries=1,
    )
    resp = client.chat.completions.create(
        model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": [{"type": "text", "text": user_text}, *image_parts]},
        ],
        temperature=0.5,
        max_tokens=4096,
    )
    raw = _message_content_from_completion(resp)
    try:
        data = _parse_model_json(raw)
    except ValueError:
        return []
    sketches_raw = data.get("sketches")
    return _normalize_sketches(sketches_raw, n, "hand-drawn-v1") or []


def _coerce_photo_sketch(item: dict) -> dict:
    """将模型返回的草图数据平整为 PhotoSketchModel 兼容的字典。

    处理大小写字段名差异（target_x / targetX），
    对校验失败的 callout 尝试手动赋值兜底，避免整条数据丢弃。
    """
    callouts_in = item.get("callouts") or []
    callouts: list[dict] = []
    for c in callouts_in:
        if not isinstance(c, dict):
            continue
        try:
            callouts.append(SketchCalloutModel.model_validate(c).model_dump())
        except ValidationError:
            # 模型可能返回字段名大小写不一致，手动兼容
            try:
                callouts.append(
                    SketchCalloutModel(
                        subject=str(c.get("subject") or "detail"),
                        text=str(c.get("text") or "nice ♡"),
                        target_x=float(c.get("target_x", c.get("targetX", 0.5))),
                        target_y=float(c.get("target_y", c.get("targetY", 0.5))),
                        target_w=float(c.get("target_w", c.get("targetW", 0.2))),
                        target_h=float(c.get("target_h", c.get("targetH", 0.15))),
                        label_x=float(c.get("label_x", c.get("labelX", 0.15))),
                        label_y=float(c.get("label_y", c.get("labelY", 0.15))),
                        outline=None,
                        decoration=c.get("decoration"),
                    ).model_dump(),
                )
            except (TypeError, ValueError):
                continue
    return {
        "callouts": callouts,
        "summary": str(item.get("summary") or ""),
        "summary_x": float(item.get("summary_x", item.get("summaryX", 0.78))),
        "summary_y": float(item.get("summary_y", item.get("summaryY", 0.9))),
    }


def overlay_vision_enabled() -> bool:
    """检查是否启用了 overlay 回退方案（HAND_DRAWN_OVERLAY_VISION=true）。"""
    raw = (os.environ.get("HAND_DRAWN_OVERLAY_VISION") or "").strip().lower()
    return raw in ("1", "true", "yes", "on")


def _normalize_sketches(
    raw: list[PhotoSketchModel] | None,
    n: int,
    template_id: str,
) -> list[PhotoSketchModel] | None:
    """规范 sketches 数据（仅 hand-drawn-v1 模板；该模板现已不走本模块）。"""
    if template_id != "hand-drawn-v1":
        return None
    items: list[PhotoSketchModel] = []
    for item in raw or []:
        if isinstance(item, PhotoSketchModel):
            items.append(item)
        elif isinstance(item, dict):
            try:
                items.append(PhotoSketchModel.model_validate(_coerce_photo_sketch(item)))
            except ValidationError:
                continue
    # 不足 n 条则用空 callouts 补齐
    while len(items) < n:
        items.append(PhotoSketchModel(callouts=[], summary="A little moment ♡"))
    if len(items) > n:
        items = items[:n]
    return items


# 导出给 main.py 使用，使 Images API 客户端（sketch_image.py）与 chat 共用 base_url / timeout 配置
openai_base_url = _openai_base_url
openai_timeout_seconds = _openai_timeout_seconds

"""
DayFrame 文案生成核心模块。

通过 OpenAI 兼容的多模态模型识别用户上传的照片，
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

from app.image_prep import (
    EXT_TO_MIME,
    PhotoMetadata,
    inspect_image,
    read_image_for_model,
)
from app.json_repair import parse_json_object
from app.schemas import (
    DayFrameCopyModel,
    GenerateRequest,
    LayoutHintModel,
    PhotoAnalysisModel,
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


def _strip_caption_number(value: object) -> str:
    text = str(value).strip()
    return re.sub(
        r"^(?:(?:(?:第\s*)?\d+\s*张(?:图|照片)?|"
        r"图\s*[一二三四五六七八九十\d]+|照片\s*\d+)"
        r"\s*[.、:：\-—]?|0?\d{1,2}\s*[.、:：\-—])\s*",
        "",
        text,
    ).strip()


def _raw_photo_analysis(value: object, index: int) -> dict:
    if not isinstance(value, list) or index >= len(value):
        return {}
    item = value[index]
    return item if isinstance(item, dict) else {}


def _fallback_caption(
    index: int,
    analyses_raw: object,
    used: set[str],
) -> str:
    analysis = _raw_photo_analysis(analyses_raw, index)
    summary = analysis.get("subject_summary") or analysis.get("subject")
    if isinstance(summary, str):
        candidate = _strip_caption_number(summary)[:40]
        if candidate and candidate not in used:
            return candidate

    generic = (
        "这一幕先好好收下",
        "刚好留下眼前这一刻",
        "今天也有值得回看的画面",
        "把当时的瞬间存进今天",
        "这一页还想再多看一会儿",
        "现场的光也一起记住了",
        "属于今天的一小段记忆",
        "回看时还是会想起这一刻",
        "这张也放进今天的故事里",
    )
    for offset in range(len(generic)):
        candidate = generic[(index + offset) % len(generic)]
        if candidate not in used:
            return candidate
    return f"留住今天的第 {index + 1} 个瞬间"


def _normalize_captions(
    caps: object,
    photo_count: int,
    analyses_raw: object,
    sketches_raw: object,
) -> list[str]:
    raw_captions = caps if isinstance(caps, list) else [caps] if isinstance(caps, str) else []
    captions = [
        _strip_caption_number(raw_captions[index])
        if index < len(raw_captions) and raw_captions[index] is not None
        else ""
        for index in range(photo_count)
    ]

    if isinstance(sketches_raw, list):
        for index, sketch in enumerate(sketches_raw[:photo_count]):
            if captions[index] or not isinstance(sketch, dict):
                continue
            summary = sketch.get("summary") or sketch.get("caption")
            if summary:
                captions[index] = _strip_caption_number(summary)[:120]

    frequencies: dict[str, int] = {}
    for caption in captions:
        normalized = re.sub(r"\s+", "", caption)
        if normalized:
            frequencies[normalized] = frequencies.get(normalized, 0) + 1

    used: set[str] = set()
    for index, caption in enumerate(captions):
        normalized = re.sub(r"\s+", "", caption)
        if not caption or frequencies.get(normalized, 0) > 1 or normalized in used:
            caption = _fallback_caption(index, analyses_raw, used)
            captions[index] = caption
            normalized = re.sub(r"\s+", "", caption)
        used.add(normalized)
    return captions


def _flatten_model_payload(data: dict) -> dict:
    merged = dict(data)
    for key in ("result", "data", "copy", "response", "output", "content"):
        inner = merged.get(key)
        if isinstance(inner, dict):
            merged = {**merged, **inner}
    return merged


def _has_complete_chalkboard_copy(data: dict, photo_count: int) -> bool:
    merged = _flatten_model_payload(data)
    title = merged.get("title") or merged.get("Title")
    diary = merged.get("diary") or merged.get("content") or merged.get("body")
    caps = merged.get("captions")
    if not isinstance(title, str) or not title.strip():
        return False
    if not isinstance(diary, str) or not diary.strip():
        return False
    if not isinstance(caps, list) or len(caps) != photo_count:
        return False
    cleaned = [
        _strip_caption_number(value) if value is not None else ""
        for value in caps
    ]
    return all(cleaned) and len({re.sub(r"\s+", "", item) for item in cleaned}) == photo_count


def _coerce_dayframe_payload(data: dict, photo_count: int) -> dict:
    """合并模型返回中的嵌套字段，为缺失的 title/diary/captions/hashtags 填默认值。

    模型有时会在 result / data / copy 等外层 key 里嵌套真正的字段，
    此函数展开所有可能的包装层，确保返回的结构是扁平的 DayFrameCopy 格式。
    """
    merged = _flatten_model_payload(data)

    title = merged.get("title") or merged.get("Title") or ""
    diary = merged.get("diary") or merged.get("content") or merged.get("body") or ""

    sketches_raw = merged.get("sketches")
    photo_analyses_raw = merged.get("photo_analyses")
    captions = _normalize_captions(
        merged.get("captions"),
        photo_count,
        photo_analyses_raw,
        sketches_raw,
    )

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
        "layout_hints": merged.get("layout_hints"),
        "photo_analyses": photo_analyses_raw,
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
    if template_id == "chalkboard-collage-v1":
        return min(8192, 3072 + photo_count * 256)
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
    if template_id == "chalkboard-collage-v1":
        path = PROMPTS_DIR / "generate_chalkboard_system.md"
    elif template_id == "image-collage-v1":
        path = PROMPTS_DIR / "generate_collage_system.md"
    else:
        path = PROMPTS_DIR / "generate_copy_system.md"
    fallback = "你是图文助手，只输出 JSON：title, diary, captions, hashtags。"
    if not path.is_file():
        return fallback
    return path.read_text(encoding="utf-8")


def _resolve_uploaded_path(upload_dir: Path, filename: str) -> Path:
    path = (upload_dir / filename).resolve()
    try:
        path.relative_to(upload_dir.resolve())
    except ValueError as e:
        raise ValueError("非法路径") from e
    if not path.is_file():
        raise FileNotFoundError(filename)
    return path


def _inspect_photos(
    upload_dir: Path,
    filenames: list[str],
) -> list[PhotoMetadata]:
    return [
        inspect_image(_resolve_uploaded_path(upload_dir, name), index)
        for index, name in enumerate(filenames)
    ]


def _image_parts(upload_dir: Path, filenames: list[str]) -> list[dict]:
    """读取上传的图片文件，压缩后转为 base64 的 OpenAI message part。

    每张图被压缩到最长边 1024px、JPEG quality 78，
    然后编码为 data URI 格式嵌入 user message 的 image_url part。
    包含路径穿越防护（校验文件在 upload_dir 内）。
    """
    parts: list[dict] = []
    for name in filenames:
        path = _resolve_uploaded_path(upload_dir, name)
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


def _photo_metadata_prompt(metadata: list[PhotoMetadata]) -> str:
    items = [
        {
            "index": item.index,
            "width": item.width,
            "height": item.height,
            "aspect_ratio": item.aspect_ratio,
            "orientation": item.orientation,
            "captured_at": item.captured_at,
        }
        for item in metadata
    ]
    return json.dumps(items, ensure_ascii=False, separators=(",", ":"))


def _raw_analysis_item(value: object, index: int) -> dict:
    if not isinstance(value, list) or index >= len(value):
        return {}
    item = value[index]
    return dict(item) if isinstance(item, dict) else {}


def _assign_layout_roles(
    analyses: list[PhotoAnalysisModel],
) -> list[PhotoAnalysisModel]:
    if not analyses:
        return []
    ranked = sorted(analyses, key=lambda item: (-item.importance, item.index))
    roles = {ranked[0].index: "hero"}
    support_count = 0 if len(ranked) == 1 else 1 if len(ranked) <= 4 else 2
    for item in ranked[1 : 1 + support_count]:
        roles[item.index] = "support"
    return [
        item.model_copy(update={"layout_role": roles.get(item.index, "detail")})
        for item in analyses
    ]


def _build_photo_analyses(
    metadata: list[PhotoMetadata],
    analyses_raw: object,
    hints_raw: object,
) -> list[PhotoAnalysisModel]:
    analyses: list[PhotoAnalysisModel] = []
    for item in metadata:
        semantic = _raw_analysis_item(hints_raw, item.index)
        semantic.update(_raw_analysis_item(analyses_raw, item.index))
        if "subject_summary" not in semantic and isinstance(
            semantic.get("subject"),
            str,
        ):
            semantic["subject_summary"] = semantic["subject"]
        if isinstance(semantic.get("subject_summary"), str):
            semantic["subject_summary"] = semantic["subject_summary"][:120]

        trusted = {
            "index": item.index,
            "width": item.width,
            "height": item.height,
            "aspect_ratio": item.aspect_ratio,
            "orientation": item.orientation,
            "captured_at": item.captured_at,
        }
        try:
            analysis = PhotoAnalysisModel.model_validate(
                {**semantic, **trusted},
            )
        except ValidationError:
            analysis = PhotoAnalysisModel.model_validate(trusted)
        analyses.append(analysis)
    return _assign_layout_roles(analyses)


def _layout_hints_from_analyses(
    analyses: list[PhotoAnalysisModel],
) -> list[LayoutHintModel]:
    return [
        LayoutHintModel(
            importance=item.importance,
            subject_type=item.subject_type,
            has_faces=item.has_faces,
            aspect_ratio=item.aspect_ratio,
        )
        for item in analyses
    ]


def _chalkboard_copy_limits(photo_count: int) -> dict[str, int]:
    if photo_count <= 3:
        return {
            "title": 14,
            "diary": 140,
            "hero_caption": 28,
            "support_caption": 24,
            "detail_caption": 20,
        }
    if photo_count <= 6:
        return {
            "title": 14,
            "diary": 130,
            "hero_caption": 24,
            "support_caption": 20,
            "detail_caption": 16,
        }
    return {
        "title": 12,
        "diary": 110,
        "hero_caption": 20,
        "support_caption": 16,
        "detail_caption": 14,
    }


def _truncate_copy_text(
    value: str,
    limit: int,
    *,
    prefer_sentence: bool = False,
) -> str:
    text = re.sub(r"[ \t]+", " ", value.strip())
    if len(text) <= limit:
        return text
    prefix = text[:limit]
    if prefer_sentence:
        boundary = max(
            prefix.rfind(mark)
            for mark in ("。", "！", "？", "；", "\n")
        )
        if boundary >= int(limit * 0.6):
            return prefix[: boundary + 1].strip()
    compact = text[: max(1, limit - 1)]
    return f"{compact.rstrip('，、；：,.!！?？ ')}…"


def _fit_chalkboard_copy(
    title: str,
    diary: str,
    captions: list[str],
    analyses: list[PhotoAnalysisModel],
) -> tuple[str, str, list[str]]:
    limits = _chalkboard_copy_limits(len(analyses))
    fitted_captions: list[str] = []
    for index, caption in enumerate(captions):
        role = analyses[index].layout_role
        limit = limits.get(f"{role}_caption", limits["detail_caption"])
        fitted_captions.append(_truncate_copy_text(caption, limit))
    return (
        _truncate_copy_text(title, limits["title"]),
        _truncate_copy_text(diary, limits["diary"], prefer_sentence=True),
        fitted_captions,
    )


def generate_dayframe_copy(upload_dir: Path, req: GenerateRequest) -> DayFrameCopyModel:
    """核心入口：调用配置的多模态模型生成完整日记文案。

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

    photo_metadata = _inspect_photos(upload_dir, req.filenames)
    image_parts = _image_parts(upload_dir, req.filenames)
    copy_budget = ""
    if req.template_id == "chalkboard-collage-v1":
        limits = _chalkboard_copy_limits(n)
        copy_budget = (
            "\n黑板手账版面文字预算（中文字符上限，必须遵守）："
            f"title 不超过 {limits['title']} 字；"
            f"diary 不超过 {limits['diary']} 字；"
            f"每条 caption 建议 {limits['detail_caption']}–"
            f"{limits['hero_caption']} 字，重点照片可以更长，细节照片更短。"
        )
    user_text = (
        f"style_id: {req.style_id}\n"
        f"风格名称：{style_label}\n"
        f"template_id: {req.template_id}\n"
        f"图片数量：{n}\n"
        f"照片可信元数据（按 index 对应图片顺序）："
        f"{_photo_metadata_prompt(photo_metadata)}\n"
        f"{copy_budget}\n"
        f"\n"
        f"请根据以上 {n} 张图（按发送顺序）生成 JSON。"
        f"captions 必须恰好包含 {n} 个非空字符串，与图片一一对应，"
        f"每条都要针对对应图片单独撰写，不能重复。"
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
    parsed = _parse_model_json(raw)
    if (
        req.template_id == "chalkboard-collage-v1"
        and (finish == "length" or not _has_complete_chalkboard_copy(parsed, n))
    ):
        retry_text = (
            f"上一次输出缺少核心文案、caption 为空或出现重复。请重新观察同一组 "
            f"{n} 张图片并输出完整 JSON。title 和 diary 必须非空；captions 必须"
            f"恰好包含 {n} 个非空且互不重复的字符串，第 i 条只能描述第 i 张图片；"
            "photo_analyses 也必须与图片顺序一一对应。只输出 JSON。"
        )
        retry_resp = client.chat.completions.create(
            model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
                {"role": "assistant", "content": raw},
                {"role": "user", "content": retry_text},
            ],
            temperature=0.45,
            max_tokens=_max_tokens_for_request(req.template_id, n),
        )
        retry_raw, _ = _completion_text_and_finish(retry_resp)
        parsed = _parse_model_json(retry_raw)
    data = _coerce_dayframe_payload(parsed, n)

    # 提前弹出 layout_hints，由下面的手动循环做逐项容错解析
    layout_hints_raw = data.pop("layout_hints", None)
    photo_analyses_raw = data.pop("photo_analyses", None)

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

    photo_analyses = _build_photo_analyses(
        photo_metadata,
        photo_analyses_raw,
        layout_hints_raw,
    )
    layout_hints = _layout_hints_from_analyses(photo_analyses)
    title = copy.title
    diary = copy.diary
    if req.template_id == "chalkboard-collage-v1":
        title, diary, caps = _fit_chalkboard_copy(
            title,
            diary,
            caps,
            photo_analyses,
        )

    return DayFrameCopyModel(
        title=title,
        diary=diary,
        captions=caps,
        hashtags=copy.hashtags,
        sketches=sketches,
        layout_hints=layout_hints,
        photo_analyses=photo_analyses,
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

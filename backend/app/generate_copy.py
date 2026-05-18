import base64
import json
import os
from pathlib import Path

from openai import OpenAI
from pydantic import ValidationError

from app.image_prep import EXT_TO_MIME, read_image_for_model
from app.schemas import DayFrameCopyModel, GenerateRequest

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"
STYLE_LABELS = {
    "xiaohongshu": "小红书",
    "travel": "旅行日记",
    "literary": "文艺",
    "minimal": "简洁",
    "moments": "朋友圈",
}


def _openai_base_url() -> str:
    raw = (os.environ.get("OPENAI_BASE_URL") or "").strip()
    if not raw:
        return "https://api.openai.com/v1"
    u = raw.rstrip("/")
    if u.endswith("/chat/completions"):
        u = u[: -len("/chat/completions")].rstrip("/")
    if not u.endswith("/v1"):
        u = f"{u}/v1"
    return u


def _message_content_from_completion(resp: object) -> str:
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
    message = choices[0].message
    return (getattr(message, "content", None) or "").strip()


def _openai_timeout_seconds() -> float:
    raw = os.environ.get("OPENAI_TIMEOUT", "360").strip()
    try:
        return max(60.0, float(raw))
    except ValueError:
        return 360.0


def _load_system_prompt() -> str:
    path = PROMPTS_DIR / "generate_copy_system.md"
    if not path.is_file():
        return "你是图文助手，只输出 JSON：title, diary, captions, hashtags。"
    return path.read_text(encoding="utf-8")


def _image_parts(upload_dir: Path, filenames: list[str]) -> list[dict]:
    parts: list[dict] = []
    for name in filenames:
        path = (upload_dir / name).resolve()
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
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key or not api_key.strip():
        raise RuntimeError("MISSING_API_KEY")

    n = len(req.filenames)
    style_label = STYLE_LABELS.get(req.style_id, req.style_id)
    system = _load_system_prompt()

    image_parts = _image_parts(upload_dir, req.filenames)
    user_text = (
        f"style_id: {req.style_id}\n"
        f"风格名称：{style_label}\n"
        f"图片数量：{n}\n\n"
        f"请根据以上 {n} 张图（按发送顺序）生成 JSON。"
        f"captions 必须恰好包含 {n} 个字符串，与图片一一对应。"
    )
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
        max_tokens=2048,
    )
    raw = _message_content_from_completion(resp)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError("模型返回非合法 JSON") from e

    try:
        copy = DayFrameCopyModel.model_validate(data)
    except ValidationError as e:
        raise ValueError(f"模型 JSON 字段不符合约定: {e!s}") from e
    caps = list(copy.captions)
    if len(caps) < n:
        caps.extend([f"第 {i + 1} 张" for i in range(len(caps), n)])
    elif len(caps) > n:
        caps = caps[:n]
    return DayFrameCopyModel(
        title=copy.title,
        diary=copy.diary,
        captions=caps,
        hashtags=copy.hashtags,
    )

"""尽力修复模型返回的残缺 / 轻微非法 JSON。"""

import json
import re


def remove_trailing_commas(text: str) -> str:
    prev = None
    out = text
    while prev != out:
        prev = out
        out = re.sub(r",(\s*[}\]])", r"\1", out)
    return out


def close_open_brackets(text: str) -> str:
    """为被 max_tokens 截断的 JSON 补上未闭合的引号与括号。"""
    s = text.rstrip()
    if not s:
        return s

    stack: list[str] = []
    in_string = False
    escape = False

    for ch in s:
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            stack.append("}")
        elif ch == "[":
            stack.append("]")
        elif ch in "}":
            if stack and stack[-1] == "}":
                stack.pop()
        elif ch in "]":
            if stack and stack[-1] == "]":
                stack.pop()

    if in_string:
        s += '"'
    # 截断在键名或冒号后时，去掉不完整尾部
    s = re.sub(r',\s*"[^"]*"\s*:\s*$', "", s)
    s = re.sub(r',\s*$', "", s)
    while stack:
        s += stack.pop()
    return s


def _try_load(text: str) -> dict | None:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def salvage_truncated_object(text: str) -> dict | None:
    """从长到短尝试截断并闭合括号，挽救被截断的大 JSON。"""
    cleaned = remove_trailing_commas(text)
    candidates = [
        cleaned,
        close_open_brackets(cleaned),
    ]
    for cand in candidates:
        data = _try_load(cand)
        if data:
            return data

    # 从尾部逐步截断（步长加大以控制耗时）
    n = len(cleaned)
    step = max(32, n // 80)
    for end in range(n, max(0, n - 8000), -step):
        chunk = cleaned[:end].rstrip().rstrip(",")
        for cand in (chunk, close_open_brackets(chunk)):
            data = _try_load(remove_trailing_commas(cand))
            if data:
                return data
    return None


def parse_json_object(raw: str) -> dict:
    text = (raw or "").strip()
    if not text:
        raise ValueError("模型返回为空，无法解析 JSON。")

    if text.lower().startswith("<!doctype") or text.lower().startswith("<html"):
        raise ValueError("模型接口返回了网页 HTML，不是 JSON。")

    attempts = [
        text,
        remove_trailing_commas(text),
        close_open_brackets(text),
        close_open_brackets(remove_trailing_commas(text)),
    ]
    match = re.search(r"\{[\s\S]*", text)
    if match:
        attempts.append(match.group(0))
        attempts.append(close_open_brackets(match.group(0)))

    seen: set[str] = set()
    for cand in attempts:
        if cand in seen or not cand:
            continue
        seen.add(cand)
        data = _try_load(cand)
        if data:
            return data

    salvaged = salvage_truncated_object(text)
    if salvaged:
        return salvaged

    raise ValueError(
        "模型返回的 JSON 不完整或格式错误（常见于输出过长被截断）。"
        "请减少图片张数后重试，或在 backend/.env 增大 OPENAI_MAX_TOKENS。",
    )

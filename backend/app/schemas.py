import re

from pydantic import BaseModel, Field, field_validator

_STYLE_RE = re.compile(r"^(xiaohongshu|travel|literary|minimal|moments)$")
_FILENAME_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z]+$",
)


class GenerateRequest(BaseModel):
    style_id: str = Field(..., description="与前端风格 id 一致")
    filenames: list[str] = Field(..., min_length=1, max_length=9)

    @field_validator("style_id")
    @classmethod
    def validate_style(cls, v: str) -> str:
        if not _STYLE_RE.match(v):
            raise ValueError("无效 style_id")
        return v

    @field_validator("filenames")
    @classmethod
    def validate_filenames(cls, v: list[str]) -> list[str]:
        for name in v:
            if not _FILENAME_RE.match(name):
                raise ValueError(f"非法文件名: {name}")
        return v


class DayFrameCopyModel(BaseModel):
    title: str
    diary: str
    captions: list[str]
    hashtags: list[str]

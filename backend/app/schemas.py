import re

from pydantic import BaseModel, Field, field_validator

_STYLE_RE = re.compile(r"^(xiaohongshu|travel|literary|minimal|moments)$")
_TEMPLATE_RE = re.compile(
    r"^(vertical-v1|polka-scrapbook-v1|hand-drawn-v1|image-collage-v1)$",
)
_FILENAME_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z]+$",
)
_DECO_RE = re.compile(r"^(heart|sparkle|steam|smile|star)$")


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


class GenerateRequest(BaseModel):
    style_id: str = Field(..., description="与前端风格 id 一致")
    template_id: str = Field(
        default="vertical-v1",
        description="排版模板，手绘模板会生成 sketches 字段",
    )
    filenames: list[str] = Field(..., min_length=1, max_length=9)

    @field_validator("style_id")
    @classmethod
    def validate_style(cls, v: str) -> str:
        if not _STYLE_RE.match(v):
            raise ValueError("无效 style_id")
        return v

    @field_validator("template_id")
    @classmethod
    def validate_template(cls, v: str) -> str:
        if not _TEMPLATE_RE.match(v):
            raise ValueError("无效 template_id")
        return v

    @field_validator("filenames")
    @classmethod
    def validate_filenames(cls, v: list[str]) -> list[str]:
        for name in v:
            if not _FILENAME_RE.match(name):
                raise ValueError(f"非法文件名: {name}")
        return v


class OutlinePointModel(BaseModel):
    x: float
    y: float

    @field_validator("x", "y")
    @classmethod
    def clamp_xy(cls, v: float) -> float:
        return _clamp01(v)


class SketchCalloutModel(BaseModel):
    subject: str
    text: str
    target_x: float
    target_y: float
    target_w: float
    target_h: float
    label_x: float
    label_y: float
    outline: list[OutlinePointModel] | None = None
    decoration: str | None = None

    @field_validator(
        "target_x",
        "target_y",
        "target_w",
        "target_h",
        "label_x",
        "label_y",
    )
    @classmethod
    def clamp_coords(cls, v: float) -> float:
        return _clamp01(v)

    @field_validator("outline")
    @classmethod
    def validate_outline(
        cls,
        v: list[OutlinePointModel] | None,
    ) -> list[OutlinePointModel] | None:
        if v is None or len(v) < 3:
            return None
        if len(v) > 16:
            return v[:16]
        return v

    @field_validator("decoration")
    @classmethod
    def validate_deco(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        if not _DECO_RE.match(v):
            return None
        return v


class PhotoSketchModel(BaseModel):
    callouts: list[SketchCalloutModel] = Field(default_factory=list)
    summary: str = ""
    summary_x: float = 0.78
    summary_y: float = 0.9

    @field_validator("summary_x", "summary_y")
    @classmethod
    def clamp_summary(cls, v: float) -> float:
        return _clamp01(v)


class LayoutHintModel(BaseModel):
    importance: float = 0.5
    subject_type: str = "other"
    has_faces: bool = False
    aspect_ratio: float = 1.0

    @field_validator("importance")
    @classmethod
    def clamp_importance(cls, v: float) -> float:
        return max(0.0, min(1.0, float(v)))


class DayFrameCopyModel(BaseModel):
    title: str
    diary: str
    captions: list[str]
    hashtags: list[str]
    sketches: list[PhotoSketchModel] | None = None
    layout_hints: list[LayoutHintModel] | None = None

import re

from pydantic import BaseModel, Field, field_validator

_STYLE_RE = re.compile(r"^(xiaohongshu|travel|literary|minimal|moments)$")
_TEMPLATE_RE = re.compile(
    r"^(vertical-v1|polka-scrapbook-v1|hand-drawn-v1|image-collage-v1|chalkboard-collage-v1)$",
)
_FILENAME_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z]+$",
)
_DECO_RE = re.compile(r"^(heart|sparkle|steam|smile|star)$")
_SUBJECT_RE = re.compile(r"^(portrait|group|food|landscape|object|other)$")
_RENDER_MODE_RE = re.compile(r"^(frame|cutout|hero)$")
_CUTOUT_STATUS_RE = re.compile(r"^(pending|ready|failed|skipped)$")
_LAYOUT_NODE_RE = re.compile(r"^(photo|text|decoration)$")
_ORIENTATION_RE = re.compile(r"^(portrait|landscape|square)$")
_LAYOUT_ROLE_RE = re.compile(r"^(hero|support|detail)$")


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


class GenerateRequest(BaseModel):
    style_id: str = Field(..., description="与前端风格 id 一致")
    template_id: str = Field(
        default="vertical-v1",
        description="排版模板，手绘模板会生成 sketches 字段",
    )
    filenames: list[str] = Field(..., min_length=1, max_length=9)
    include_cutouts: bool = True

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


class NormalizedRectModel(BaseModel):
    x: float
    y: float
    width: float
    height: float

    @field_validator("x", "y", "width", "height")
    @classmethod
    def clamp_rect(cls, v: float) -> float:
        return _clamp01(v)


class PhotoAnalysisModel(BaseModel):
    """模板布局需要的单张照片结构化分析结果。"""

    index: int = Field(..., ge=0)
    width: int | None = Field(default=None, ge=1)
    height: int | None = Field(default=None, ge=1)
    aspect_ratio: float = Field(default=1.0, gt=0)
    orientation: str = "square"
    captured_at: str | None = None
    importance: float = 0.5
    subject_type: str = "other"
    subject_summary: str = Field(default="", max_length=120)
    has_faces: bool = False
    focal_x: float = 0.5
    focal_y: float = 0.5
    recommended_render: str = "frame"
    layout_role: str = "detail"

    @field_validator("importance", "focal_x", "focal_y")
    @classmethod
    def clamp_analysis_value(cls, v: float) -> float:
        return _clamp01(v)

    @field_validator("subject_type")
    @classmethod
    def validate_subject_type(cls, v: str) -> str:
        return v if _SUBJECT_RE.match(v) else "other"

    @field_validator("recommended_render")
    @classmethod
    def validate_render_mode(cls, v: str) -> str:
        return v if _RENDER_MODE_RE.match(v) else "frame"

    @field_validator("orientation")
    @classmethod
    def validate_orientation(cls, v: str) -> str:
        return v if _ORIENTATION_RE.match(v) else "square"

    @field_validator("layout_role")
    @classmethod
    def validate_layout_role(cls, v: str) -> str:
        return v if _LAYOUT_ROLE_RE.match(v) else "detail"


class CutoutAssetModel(BaseModel):
    """原图对应的可选透明抠图资产。"""

    photo_index: int = Field(..., ge=0)
    status: str = "pending"
    url: str | None = None
    mask_url: str | None = None
    subject_bounds: NormalizedRectModel | None = None
    error: str | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        return v if _CUTOUT_STATUS_RE.match(v) else "pending"


class LayoutNodeModel(BaseModel):
    """前后端共享的基础布局节点，坐标单位为导出画布像素。"""

    id: str
    node_type: str
    x: float
    y: float
    width: float = Field(..., gt=0)
    height: float = Field(..., gt=0)
    rotation: float = 0
    z_index: int = 0
    photo_index: int | None = Field(default=None, ge=0)
    render_mode: str | None = None
    text_role: str | None = None
    decoration_id: str | None = None

    @field_validator("node_type")
    @classmethod
    def validate_node_type(cls, v: str) -> str:
        if not _LAYOUT_NODE_RE.match(v):
            raise ValueError("无效 node_type")
        return v

    @field_validator("render_mode")
    @classmethod
    def validate_optional_render_mode(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v if _RENDER_MODE_RE.match(v) else "frame"


class TemplateLayoutModel(BaseModel):
    version: int = 1
    template_id: str
    variant_id: str
    canvas_width: int = Field(..., gt=0)
    canvas_height: int = Field(..., gt=0)
    nodes: list[LayoutNodeModel] = Field(default_factory=list)


class DayFrameCopyModel(BaseModel):
    title: str
    diary: str
    captions: list[str]
    hashtags: list[str]
    sketches: list[PhotoSketchModel] | None = None
    layout_hints: list[LayoutHintModel] | None = None
    photo_analyses: list[PhotoAnalysisModel] | None = None

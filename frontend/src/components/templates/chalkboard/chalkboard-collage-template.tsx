"use client";

import {
  forwardRef,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChalkboardTexture,
  ChalkDoodle,
  ChalkTitleUnderline,
  PaperTape,
  type ChalkDoodleKind,
} from "@/components/templates/chalkboard/chalkboard-visuals";
import { computeChalkboardLayout } from "@/lib/templates/chalkboard/compute-chalkboard-layout";
import {
  diaryTypography,
  fitCaption,
  fitTitle,
} from "@/lib/templates/chalkboard/text-fit";
import type { TemplateRenderProps } from "@/lib/templates/registry";
import type {
  PhotoAnalysis,
  PhotoLayoutNode,
  PhotoSubjectType,
} from "@/lib/types";

const CHALK_FONT =
  '"Xingkai SC", "Kaiti SC", "STKaiti", "KaiTi", "Songti SC", serif';
const TITLE_FONT =
  '"HanziPen SC", "Xingkai SC", "Kaiti SC", "STKaiti", serif';
const FRAME_CLIPS = [
  "polygon(1% 1%, 99% 0, 100% 98%, 2% 100%, 0 52%)",
  "polygon(0 2%, 98% 0, 100% 99%, 1% 98%)",
  "polygon(2% 0, 100% 2%, 98% 100%, 0 98%)",
  "polygon(0 1%, 99% 2%, 100% 97%, 2% 100%)",
];
const CAPTION_COLORS = ["#f4eee2", "#e9c1c5", "#ead88d", "#bad8cf"];

function doodleForSubject(subject: PhotoSubjectType): ChalkDoodleKind {
  switch (subject) {
    case "portrait":
    case "group":
      return "heart";
    case "food":
      return "steam";
    case "landscape":
      return "birds";
    case "object":
      return "arrow";
    default:
      return "sparkle";
  }
}

function doodlePosition(
  node: PhotoLayoutNode,
  analysis: PhotoAnalysis | undefined,
): { x: number; y: number; size: number; rotate: number } {
  const size = node.renderMode === "cutout" ? 34 : 26;
  const preferRight = node.x + node.width / 2 < 195;
  let x = preferRight ? node.x + node.width - 8 : node.x - size + 8;
  let y = node.y + Math.max(12, (node.height - 38) * 0.18);
  if (analysis?.subjectType === "food") {
    x = node.x + node.width * 0.5 - size * 0.5;
    y = node.y - 8;
  }
  return {
    x: Math.max(4, Math.min(390 - size - 4, x)),
    y: Math.max(0, y),
    size,
    rotate: preferRight ? 8 : -8,
  };
}

function dayLabel(analyses: PhotoAnalysis[] | undefined): string {
  const captured = analyses?.find((item) => item.capturedAt)?.capturedAt;
  if (!captured) return "A LITTLE PIECE OF TODAY";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(captured);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : "DAILY MOMENTS";
}

export const ChalkboardCollageTemplate = forwardRef<
  HTMLDivElement,
  TemplateRenderProps
>(function ChalkboardCollageTemplate(
  {
    copy,
    photos,
    cutoutAssets,
    layoutSeed,
    layout: layoutOverride,
    renderModeOverrides,
    editable = false,
    selectedPhotoIndex,
    onSelectPhoto,
    onLayoutChange,
  },
  ref,
) {
  const dragRef = useRef<{
    pointerId: number;
    nodeId: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const cutoutsByIndex = new Map(
    cutoutAssets?.map((asset) => [asset.photoIndex, asset]),
  );
  const analysesByIndex = new Map(
    copy.photoAnalyses?.map((analysis) => [analysis.index, analysis]),
  );
  const generatedLayout = useMemo(
    () =>
      computeChalkboardLayout({
        photoCount: photos.length,
        analyses: copy.photoAnalyses,
        cutoutAssets,
        captions: copy.captions,
        renderModeOverrides,
        seed: layoutSeed,
      }),
    [
      photos.length,
      copy.photoAnalyses,
      copy.captions,
      cutoutAssets,
      layoutSeed,
      renderModeOverrides,
    ],
  );
  const overridePhotoCount = layoutOverride?.nodes.filter(
    (node) => node.nodeType === "photo",
  ).length;
  const layout =
    layoutOverride?.templateId === "chalkboard-collage-v1" &&
    overridePhotoCount === photos.length
      ? layoutOverride
      : generatedLayout;
  const photoNodes = layout.nodes.filter(
    (node): node is PhotoLayoutNode => node.nodeType === "photo",
  );
  const decoratedNodes = photoNodes
    .filter((node, index) => {
      const analysis = analysesByIndex.get(node.photoIndex);
      return (
        analysis?.layoutRole !== "detail" ||
        node.renderMode === "cutout" ||
        index % 3 === 0
      );
    })
    .slice(0, 5);
  const titleFit = fitTitle(copy.title);
  const diaryType = diaryTypography(copy.diary);

  function onPhotoPointerDown(
    event: ReactPointerEvent<HTMLElement>,
    node: PhotoLayoutNode,
  ) {
    if (!editable || !onLayoutChange) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelectPhoto?.(node.photoIndex);
    dragRef.current = {
      pointerId: event.pointerId,
      nodeId: node.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: node.x,
      startY: node.y,
    };
  }

  function onPhotoPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (
      !editable ||
      !onLayoutChange ||
      !drag ||
      drag.pointerId !== event.pointerId
    ) {
      return;
    }
    event.preventDefault();
    const node = layout.nodes.find(
      (item) => item.nodeType === "photo" && item.id === drag.nodeId,
    );
    if (!node || node.nodeType !== "photo") return;
    const x = Math.max(
      4,
      Math.min(
        layout.canvasWidth - node.width - 4,
        drag.startX + event.clientX - drag.startClientX,
      ),
    );
    const y = Math.max(0, drag.startY + event.clientY - drag.startClientY);
    const nodes = layout.nodes.map((item) =>
      item.id === node.id ? { ...item, x, y } : item,
    );
    const bottom = Math.max(
      ...nodes.map((item) => item.y + item.height),
    );
    onLayoutChange({
      ...layout,
      nodes,
      canvasHeight: Math.max(generatedLayout.canvasHeight, Math.ceil(bottom + 16)),
    });
  }

  function endPhotoDrag(event: ReactPointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      ref={ref}
      data-dayframe-export-root
      data-layout-variant={layout.variantId}
      data-export-bg="#111715"
      className="relative w-[390px] shrink-0 isolate overflow-hidden bg-[#111715] pb-8 pt-7 text-[#f6f1e7] shadow-[0_20px_60px_-30px_rgba(0,0,0,0.65)]"
      style={{
        backgroundImage:
          "radial-gradient(ellipse at 14% 8%, rgba(255,255,255,0.07), transparent 28%), radial-gradient(ellipse at 88% 42%, rgba(255,255,255,0.035), transparent 32%), linear-gradient(118deg, rgba(255,255,255,0.018), transparent 46%, rgba(255,255,255,0.026))",
        backgroundSize: "100% 100%",
        fontFamily: CHALK_FONT,
      }}
    >
      <ChalkboardTexture />
      <ChalkDoodle
        kind="heart"
        x={17}
        y={48}
        size={25}
        rotate={-12}
        color="#e8b4bb"
      />
      <ChalkDoodle
        kind="star"
        x={343}
        y={52}
        size={27}
        rotate={10}
        color="#e8d388"
      />
      <ChalkDoodle
        kind="swirl"
        x={20}
        y={92}
        size={38}
        rotate={8}
        opacity={0.45}
      />

      <header className="relative z-[2] px-9 text-center">
        <p className="text-[9px] uppercase tracking-[0.32em] text-white/42">
          DAYFRAME · {dayLabel(copy.photoAnalyses)}
        </p>
        <h1
          className="mt-2 overflow-hidden break-words font-semibold leading-[1.12] text-[#f8f3e8]"
          title={titleFit.truncated ? copy.title : undefined}
          style={{
            fontFamily: TITLE_FONT,
            fontSize: titleFit.fontSize,
            letterSpacing: titleFit.letterSpacing,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            textShadow:
              "0.6px 0 rgba(255,255,255,0.35), -0.4px 0.5px rgba(255,255,255,0.22)",
          }}
        >
          {titleFit.text}
        </h1>
        <ChalkTitleUnderline />
      </header>

      <section
        className="relative mt-7"
        style={{ height: layout.canvasHeight }}
      >
        {photoNodes.map((node) => {
          const src = photos[node.photoIndex];
          if (!src) return null;
          const analysis = analysesByIndex.get(node.photoIndex);
          const cutout = cutoutsByIndex.get(node.photoIndex);
          const cutoutUrl =
            node.renderMode === "cutout" && cutout?.status === "ready"
              ? cutout.url
              : undefined;
          const imageHeight = Math.max(70, node.height - 38);
          const captionColor =
            CAPTION_COLORS[node.photoIndex % CAPTION_COLORS.length];
          const captionFit = fitCaption(
            copy.captions[node.photoIndex] || `照片 ${node.photoIndex + 1}`,
            node.width,
          );
          const tapeTone =
            node.photoIndex % 3 === 0
              ? "kraft"
              : node.photoIndex % 3 === 1
                ? "cream"
                : "rose";
          return (
            <figure
              key={node.id}
              className="absolute"
              onPointerDown={(event) => onPhotoPointerDown(event, node)}
              onPointerMove={onPhotoPointerMove}
              onPointerUp={endPhotoDrag}
              onPointerCancel={endPhotoDrag}
              style={{
                left: node.x,
                top: node.y,
                width: node.width,
                height: node.height,
                transform: `rotate(${node.rotation}deg)`,
                zIndex: node.zIndex,
                cursor: editable ? "grab" : undefined,
                touchAction: editable ? "none" : undefined,
              }}
            >
              {!cutoutUrl ? (
                <PaperTape
                  side={node.photoIndex % 2 === 0 ? "left" : "right"}
                  tone={tapeTone}
                />
              ) : null}
              <div
                className={
                  cutoutUrl
                    ? "flex w-full items-center justify-center"
                    : "w-full bg-[#f6f0e4] p-[4px] shadow-[0_7px_18px_rgba(0,0,0,0.48)] ring-1 ring-white/55"
                }
                style={{
                  height: imageHeight,
                  clipPath: cutoutUrl
                    ? undefined
                    : FRAME_CLIPS[node.photoIndex % FRAME_CLIPS.length],
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cutoutUrl ?? src}
                  alt={`照片 ${node.photoIndex + 1}`}
                  className={
                    cutoutUrl
                      ? "block h-full w-full object-contain"
                      : "block h-full w-full bg-black/20 object-cover"
                  }
                  style={
                    cutoutUrl
                      ? undefined
                      : {
                          objectPosition: `${(analysis?.focalX ?? 0.5) * 100}% ${
                            (analysis?.focalY ?? 0.5) * 100
                          }%`,
                        }
                  }
                  draggable={false}
                />
              </div>
              <figcaption
                className="relative mt-1 overflow-hidden px-2 text-center text-[11px] leading-[1.38]"
                title={
                  captionFit.truncated
                    ? copy.captions[node.photoIndex]
                    : undefined
                }
                style={{
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 2,
                  color: captionColor,
                  fontFamily: CHALK_FONT,
                  textShadow: "0.4px 0.4px rgba(255,255,255,0.16)",
                }}
              >
                <span className="mr-1 text-[9px] opacity-55">
                  {String(node.photoIndex + 1).padStart(2, "0")}
                </span>
                {captionFit.text}
              </figcaption>
              {editable && selectedPhotoIndex === node.photoIndex ? (
                <span
                  data-dayframe-editor-ui="true"
                  className="pointer-events-none absolute -inset-1 border border-dashed border-sky-300 shadow-[0_0_0_2px_rgba(14,165,233,0.2)]"
                  aria-hidden
                >
                  <span className="absolute -top-5 left-0 rounded bg-sky-500 px-1.5 py-0.5 font-sans text-[8px] leading-none text-white shadow">
                    拖动调整
                  </span>
                </span>
              ) : null}
            </figure>
          );
        })}
        {decoratedNodes.map((node, index) => {
          const analysis = analysesByIndex.get(node.photoIndex);
          const position = doodlePosition(node, analysis);
          return (
            <ChalkDoodle
              key={`doodle-${node.id}`}
              kind={doodleForSubject(analysis?.subjectType ?? "other")}
              x={position.x}
              y={position.y}
              size={position.size}
              rotate={position.rotate}
              color={CAPTION_COLORS[index % CAPTION_COLORS.length]}
              opacity={node.renderMode === "cutout" ? 0.9 : 0.7}
              zIndex={65 + index}
            />
          );
        })}
      </section>

      <footer className="relative z-[2] mx-6 mt-5 border-t border-dashed border-white/35 px-2 pt-5">
        <p className="mb-2 text-[9px] uppercase tracking-[0.28em] text-[#e8d388]/65">
          TODAY&apos;S LITTLE STORY
        </p>
        {copy.diary ? (
          <p
            className="border-l border-white/25 pl-3 whitespace-pre-wrap text-[13px] leading-[1.85] text-white/82"
            style={{
              fontFamily: CHALK_FONT,
              fontSize: diaryType.fontSize,
              lineHeight: diaryType.lineHeight,
              textShadow: "0.4px 0.4px rgba(255,255,255,0.12)",
            }}
          >
            {copy.diary}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {copy.hashtags.map((tag, index) => (
            <span
              key={tag}
              style={{
                color: CAPTION_COLORS[index % CAPTION_COLORS.length],
              }}
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="relative mt-3 h-[68px]">
          <ChalkDoodle
            kind="bicycle"
            x={246}
            y={0}
            size={68}
            rotate={-2}
            color="#f2eadc"
            opacity={0.72}
            zIndex={2}
          />
          <ChalkDoodle
            kind="sparkle"
            x={318}
            y={2}
            size={20}
            color="#e8d388"
            opacity={0.8}
            zIndex={2}
          />
          <p className="absolute bottom-3 left-0 text-[10px] tracking-[0.18em] text-white/38">
            FRAME YOUR DAY
          </p>
          <span
            className="absolute bottom-1 right-0 h-[13px] w-[74px] rotate-[-4deg] bg-[#d7bd91]/45"
            style={{
              clipPath: "polygon(2% 12%, 100% 0, 96% 92%, 0 100%)",
            }}
            aria-hidden
          />
        </div>
      </footer>
    </div>
  );
});

ChalkboardCollageTemplate.displayName = "ChalkboardCollageTemplate";

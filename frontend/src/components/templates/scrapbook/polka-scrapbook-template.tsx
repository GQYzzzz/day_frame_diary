"use client";

import {
  forwardRef,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ComicBurst,
  PolkaDoodle,
  PolkaPaperTexture,
  WashiTape,
  type PolkaDoodleKind,
} from "@/components/templates/scrapbook/polka-visuals";
import {
  diaryTypography,
  fitCaption,
  fitTitle,
} from "@/lib/templates/chalkboard/text-fit";
import { computePolkaLayout } from "@/lib/templates/polka/compute-polka-layout";
import type { TemplateRenderProps } from "@/lib/templates/registry";
import type {
  PhotoAnalysis,
  PhotoLayoutNode,
  PhotoSubjectType,
} from "@/lib/types";

const HAND_FONT =
  '"ZCOOL KuaiLe", "HanziPen SC", "Kaiti SC", "STKaiti", cursive';
const PAPER_CLIPS = [
  "polygon(1% 0, 99% 1%, 100% 98%, 2% 100%, 0 48%)",
  "polygon(0 2%, 98% 0, 100% 99%, 1% 98%)",
  "polygon(2% 0, 100% 2%, 98% 100%, 0 98%)",
  "polygon(0 1%, 99% 2%, 100% 97%, 2% 100%)",
];
const ACCENTS = ["#ec8fa2", "#f1d367", "#8bb4aa", "#f7f0df"];
const FALLBACK_CAPTIONS = [
  "这一幕先贴进今天",
  "刚好是很喜欢的瞬间",
  "今天的小快乐被拍到了",
  "这张也值得认真收藏",
];

function doodleForSubject(subject: PhotoSubjectType): PolkaDoodleKind {
  switch (subject) {
    case "portrait":
    case "group":
      return "heart";
    case "food":
      return "sparkle";
    case "landscape":
      return "swirl";
    case "object":
      return "arrow";
    default:
      return "star";
  }
}

function dayLabel(analyses: PhotoAnalysis[] | undefined): string {
  const captured = analyses?.find((item) => item.capturedAt)?.capturedAt;
  if (!captured) return "MY LITTLE DAY";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(captured);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : "TODAY'S MOMENTS";
}

function doodlePosition(
  node: PhotoLayoutNode,
  analysis: PhotoAnalysis | undefined,
) {
  const size = node.renderMode === "cutout" ? 38 : 28;
  const onRight = node.x + node.width / 2 < 195;
  const y =
    analysis?.subjectType === "food"
      ? node.y - 5
      : node.y + Math.max(12, node.height * 0.16);
  return {
    x: Math.max(
      5,
      Math.min(390 - size - 5, onRight ? node.x + node.width - 5 : node.x - size + 7),
    ),
    y: Math.max(0, y),
    size,
    rotate: onRight ? 9 : -9,
  };
}

export const PolkaScrapbookTemplate = forwardRef<
  HTMLDivElement,
  TemplateRenderProps
>(function PolkaScrapbookTemplate(
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
    summaryPlacement = "end",
    onSummaryPlacementChange,
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
  const summaryDragRef = useRef<{
    pointerId: number;
    startClientY: number;
    offsetY: number;
  } | null>(null);
  const [summaryDragOffset, setSummaryDragOffset] = useState(0);
  const cutoutsByIndex = new Map(
    cutoutAssets?.map((asset) => [asset.photoIndex, asset]),
  );
  const analysesByIndex = new Map(
    copy.photoAnalyses?.map((analysis) => [analysis.index, analysis]),
  );
  const generatedLayout = useMemo(
    () =>
      computePolkaLayout({
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
    layoutOverride?.templateId === "polka-scrapbook-v1" &&
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
    if (!editable || !onLayoutChange || !drag || drag.pointerId !== event.pointerId) {
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
    const bottom = Math.max(...nodes.map((item) => item.y + item.height));
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

  function onSummaryPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!editable || !onSummaryPlacementChange) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    summaryDragRef.current = {
      pointerId: event.pointerId,
      startClientY: event.clientY,
      offsetY: 0,
    };
    setSummaryDragOffset(0);
  }

  function onSummaryPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = summaryDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    drag.offsetY = event.clientY - drag.startClientY;
    setSummaryDragOffset(drag.offsetY);
  }

  function endSummaryDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = summaryDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.offsetY <= -48) onSummaryPlacementChange?.("start");
    if (drag.offsetY >= 48) onSummaryPlacementChange?.("end");
    summaryDragRef.current = null;
    setSummaryDragOffset(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const summaryBlock = (
    <section
      className={`relative z-[70] mx-5 rounded-[24px] border-2 border-[#2b2926] bg-[#fffdf7]/95 px-5 py-5 shadow-[5px_6px_0_rgba(74,70,65,.13)] ${
        summaryPlacement === "start" ? "mt-5 mb-2" : "mt-5"
      }`}
      onPointerDown={onSummaryPointerDown}
      onPointerMove={onSummaryPointerMove}
      onPointerUp={endSummaryDrag}
      onPointerCancel={endSummaryDrag}
      style={{
        transform: `translateY(${summaryDragOffset}px) rotate(-0.5deg)`,
        cursor: editable ? "grab" : undefined,
        touchAction: editable ? "none" : undefined,
        transition:
          summaryDragOffset === 0 ? "transform 160ms ease-out" : undefined,
      }}
    >
      <span
        className="absolute -top-[9px] left-9 h-4 w-14 rotate-[-5deg] bg-[#f1d56f]/80"
        aria-hidden
      />
      {editable ? (
        <span
          data-dayframe-editor-ui="true"
          className="absolute -top-2 right-2 rounded bg-sky-500 px-2 py-1 font-sans text-[8px] leading-none text-white shadow"
        >
          上下拖动总结
        </span>
      ) : null}
      <p className="text-[9px] tracking-[0.24em] text-[#8e8982]">
        TODAY&apos;S NOTE
      </p>
      {copy.diary ? (
        <p
          className="mt-2 whitespace-pre-wrap text-[#34312e]"
          style={{
            fontFamily: HAND_FONT,
            fontSize: diaryType.fontSize,
            lineHeight: Math.max(1.7, diaryType.lineHeight),
          }}
        >
          {copy.diary}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {copy.hashtags.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            style={{ color: index % 2 === 0 ? "#d96f87" : "#718e87" }}
          >
            {tag}
          </span>
        ))}
      </div>
      <PolkaDoodle
        kind="sparkle"
        x={305}
        y={8}
        size={28}
        color="#e49aaa"
        opacity={0.8}
      />
    </section>
  );

  return (
    <div
      ref={ref}
      data-dayframe-export-root
      data-layout-variant={layout.variantId}
      data-export-bg="#c8c6c2"
      className="relative w-[390px] shrink-0 isolate overflow-hidden bg-[#c8c6c2] pb-8 pt-7 text-[#292724] shadow-[0_20px_60px_-30px_rgba(0,0,0,.4)]"
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,.94) 2.15px, transparent 2.35px)",
        backgroundSize: "15px 15px",
        fontFamily: HAND_FONT,
      }}
    >
      <PolkaPaperTexture />
      <PolkaDoodle kind="face" x={18} y={24} size={43} rotate={-9} opacity={0.72} />
      <PolkaDoodle
        kind="heart"
        x={342}
        y={34}
        size={27}
        rotate={12}
        color="#d7657f"
        fill="#f5b5c1"
      />

      <header className="relative z-[3] mx-7 text-center">
        <p className="text-[9px] tracking-[0.3em] text-[#68645f]/75">
          DAYFRAME · {dayLabel(copy.photoAnalyses)}
        </p>
        <div className="relative mt-3 inline-block max-w-full rotate-[-1deg] rounded-[22px] border-2 border-[#2d2a27] bg-[#fffdf7] px-6 py-3 shadow-[4px_5px_0_rgba(70,67,63,.14)]">
          <h1
            className="overflow-hidden break-words font-normal leading-[1.18]"
            title={titleFit.truncated ? copy.title : undefined}
            style={{
              fontSize: titleFit.fontSize,
              letterSpacing: titleFit.letterSpacing,
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
            }}
          >
            {titleFit.text}
          </h1>
          <span
            className="absolute -bottom-3 left-[24%] h-5 w-5 rotate-45 border-b-2 border-r-2 border-[#2d2a27] bg-[#fffdf7]"
            aria-hidden
          />
        </div>
      </header>

      {summaryPlacement === "start" ? summaryBlock : null}

      <section
        className={`relative ${summaryPlacement === "start" ? "mt-5" : "mt-8"}`}
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
          const captionFit = fitCaption(
            copy.captions[node.photoIndex] ||
              FALLBACK_CAPTIONS[node.photoIndex % FALLBACK_CAPTIONS.length],
            node.width,
          );
          const tone =
            node.photoIndex % 3 === 0
              ? "yellow"
              : node.photoIndex % 3 === 1
                ? "pink"
                : "cream";
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
                <WashiTape
                  side={node.photoIndex % 2 === 0 ? "left" : "right"}
                  tone={tone}
                />
              ) : null}
              <div
                className={
                  cutoutUrl
                    ? "flex w-full items-center justify-center drop-shadow-[0_8px_7px_rgba(55,50,45,.25)]"
                    : "w-full bg-[#fffdf7] p-[5px] shadow-[0_8px_18px_rgba(73,68,61,.3)] ring-1 ring-white/80"
                }
                style={{
                  height: imageHeight,
                  clipPath: cutoutUrl
                    ? undefined
                    : PAPER_CLIPS[node.photoIndex % PAPER_CLIPS.length],
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cutoutUrl ?? src}
                  alt={`照片 ${node.photoIndex + 1}`}
                  className="block h-full w-full object-contain"
                  style={
                    cutoutUrl
                      ? undefined
                      : {
                          backgroundColor: "#eeeae2",
                          objectPosition: `${(analysis?.focalX ?? 0.5) * 100}% ${
                            (analysis?.focalY ?? 0.5) * 100
                          }%`,
                        }
                  }
                  draggable={false}
                />
              </div>
              <figcaption
                className="relative mx-auto mt-[-2px] w-[92%] overflow-hidden rounded-[16px] border-2 border-[#2b2926] bg-[#fffdf7] px-2.5 py-2 text-center text-[11px] leading-[1.35] shadow-[2px_3px_0_rgba(69,65,60,.12)]"
                title={captionFit.truncated ? copy.captions[node.photoIndex] : undefined}
                style={{
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 2,
                }}
              >
                {captionFit.text}
              </figcaption>
              {node.photoIndex % 3 === 1 ? <ComicBurst color="#fffdf7" /> : null}
              {editable && selectedPhotoIndex === node.photoIndex ? (
                <span
                  data-dayframe-editor-ui="true"
                  className="pointer-events-none absolute -inset-1 border border-dashed border-sky-500 shadow-[0_0_0_2px_rgba(14,165,233,.2)]"
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
            <PolkaDoodle
              key={`doodle-${node.id}`}
              kind={doodleForSubject(analysis?.subjectType ?? "other")}
              x={position.x}
              y={position.y}
              size={position.size}
              rotate={position.rotate}
              color={ACCENTS[index % ACCENTS.length]}
              fill={
                analysis?.subjectType === "portrait" ||
                analysis?.subjectType === "group"
                  ? "#f8ccd4"
                  : "none"
              }
              opacity={0.92}
              zIndex={65 + index}
            />
          );
        })}
      </section>

      {summaryPlacement === "end" ? summaryBlock : null}

      <footer className="relative z-[3] mx-5 mt-5 h-[86px]">
        <PolkaDoodle
          kind="bear"
          x={12}
          y={8}
          size={64}
          color="#fffdf7"
          opacity={0.9}
        />
        <div className="absolute bottom-2 right-0 rotate-[1deg] rounded-xl border-2 border-[#2b2926] bg-[#fffdf7] px-4 py-2 text-[11px] shadow-[3px_4px_0_rgba(71,67,62,.13)]">
          KEEP THIS LITTLE MOMENT
        </div>
        <PolkaDoodle
          kind="star"
          x={311}
          y={2}
          size={22}
          color="#e2bd3f"
          fill="#f4d96f"
        />
      </footer>
    </div>
  );
});

PolkaScrapbookTemplate.displayName = "PolkaScrapbookTemplate";

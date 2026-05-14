import type { DayFrameCopy, StyleId } from "@/lib/types";

function alignCaptions(photos: number, captions: string[]): string[] {
  return Array.from({ length: photos }, (_, i) => captions[i] ?? `第 ${i + 1} 张的光影瞬间`);
}

export function buildMockCopy(styleId: StyleId, photoCount: number): DayFrameCopy {
  const n = Math.max(1, photoCount);
  const baseCaptions = [
    "把今天的阳光折进镜头里。",
    "风很轻，心情也是。",
    "记录这一秒的真实与温柔。",
    "不赶时间，只赶一场好心情。",
    "生活的小角落，也值得被放大。",
    "像电影一样，把日常过成片段。",
    "颜色刚刚好，故事也刚刚好。",
    "把碎片拼起来，就是今天的形状。",
    "留一点空白，给未来回忆。",
  ];

  const byStyle: Record<StyleId, Omit<DayFrameCopy, "captions">> = {
    xiaohongshu: {
      title: "今日份小确幸｜把生活拍成温柔画报",
      diary:
        "今天的快乐来源很简单：一杯刚好温度的饮品、一段不用着急的路、还有镜头里那些不期而遇的细节。\n\n想把这份「刚刚好」分享给你——生活不必时刻高光，但每个小瞬间都值得被认真记录。",
      hashtags: ["#DayFrame", "#生活记录", "#日常碎片", "#氛围感", "#拍照灵感"],
    },
    travel: {
      title: "在路上｜把风景折进行囊",
      diary:
        "地图上的下一个坐标，不一定很远，但一定新鲜。\n\n我喜欢用照片把「当时的风、当时的颜色、当时的呼吸」一起打包带走。等某天翻开，就像再一次抵达。",
      hashtags: ["#旅行日记", "#在路上", "#风景收集", "#DayFrame"],
    },
    literary: {
      title: "把日子写成一行慢诗",
      diary:
        "时间从指缝里流走时，会留下光。\n\n我把光收进照片里，也把心事轻轻摊开：不喧哗，不证明，只是与自己相处的一小段证据。",
      hashtags: ["#文艺记录", "#慢生活", "#DayFrame"],
    },
    minimal: {
      title: "今天。",
      diary: "少即是多。\n\n留下必要的线条与情绪，其余交给空白。",
      hashtags: ["#简洁", "#记录", "#DayFrame"],
    },
    moments: {
      title: "今天也认真生活了",
      diary:
        "没有特别的剧情，但很踏实。\n\n吃饭、走路、发呆、笑一下——把普通的一天过得像自己喜欢的样子，就已经很值得。",
      hashtags: ["#朋友圈", "#日常", "#DayFrame"],
    },
  };

  const core = byStyle[styleId];
  return {
    ...core,
    captions: alignCaptions(n, baseCaptions),
  };
}

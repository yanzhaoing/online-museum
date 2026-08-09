import { sunHaibinExhibition } from "./exhibition-sunhaibin.js";

// 「琴韵流芳 · 文脉传承」孙海滨古琴展专属游线：
// 8 个单元 = 8 个展区，展品为策展方案中有影像的条目（PDF 条目进展览文本抽屉）。
// 文案统一取自 exhibition-sunhaibin.js，保持单一内容源。
export const guqinTourDefinition = {
  id: "guqin-exhibition",
  title: "琴韵流芳 · 文脉传承",
  shortTitle: "孙海滨古琴展",
  eyebrow: "Cloud Exhibition",
  summary: sunHaibinExhibition.summary,
  groups: sunHaibinExhibition.halls.flatMap((hall) =>
    hall.units.map((unit) => ({
      id: unit.id,
      title: unit.title,
      description: unit.subtitle,
      background: unit.intro,
      hall: `${hall.indexLabel} · ${hall.title}`,
      stops: unit.items.map((item) => ({
        code: item.code,
        title: item.title,
        description: item.text,
      })),
    })),
  ),
};

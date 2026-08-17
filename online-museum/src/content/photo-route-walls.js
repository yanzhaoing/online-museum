const normalizeCode = (value) => String(value || "").replace(/\s+/g, "").toUpperCase();

// 中景图已经把展品、展柜和说明牌合成到场景里；这里的 code 只负责把透明热区
// 对齐到对应展品，并让“移步”在同一单元内切换墙面，而不是跳到下一件。
export const PHOTO_ROUTE_WALLS = {
  "unit-qinxue": [
    {
      id: "qinxue-wall-1",
      label: "琴谱墙一",
      background: "textures/hall/gpt-soft-labels-v4/unit-qinxue-wall-1.png",
      codes: ["MJCP-SHB-WX.01-0034"],
      hotspots: [[670, 98, 330, 620]],
    },
    {
      id: "qinxue-wall-2",
      label: "琴谱墙二",
      background: "textures/hall/gpt-soft-labels-v4/unit-qinxue-wall-2.png",
      codes: ["MJCP-SHB-WX.01-0039"],
      hotspots: [[560, 185, 370, 545]],
    },
  ],
  "unit-manuscripts": [
    {
      id: "manuscripts-wall-1",
      label: "墨迹墙一",
      background: "textures/hall/gpt-soft-labels-v4/unit-manuscripts-wall-1.png",
      codes: ["MJCP-SHB-WX.01-0021"],
      hotspots: [[530, 180, 405, 570]],
    },
    {
      id: "manuscripts-wall-2",
      label: "墨迹墙二",
      background: "textures/hall/gpt-soft-labels-v4/unit-manuscripts-wall-2.png",
      codes: ["MJCP-SHB-WX.01-0022"],
      hotspots: [[590, 66, 490, 720]],
    },
  ],
  "unit-seals": [
    {
      id: "seals-wall-1",
      label: "印谱墙一",
      background: "textures/hall/gpt-soft-labels-v4/unit-seals-wall-1.png",
      codes: ["MJCP-SHB-WX.01-0029"],
      hotspots: [[620, 120, 430, 620]],
    },
    {
      id: "seals-wall-2",
      label: "印谱墙二",
      background: "textures/hall/gpt-soft-labels-v4/unit-seals-wall-2.png",
      codes: ["MJCP-SHB-WX.01-0016"],
      hotspots: [[700, 64, 330, 625]],
    },
  ],
  "unit-recordings": [
    {
      id: "recordings-wall-1",
      label: "唱片墙一",
      background: "textures/hall/gpt-soft-labels-v4/unit-recordings-wall-1.png",
      codes: ["MJCP-SHB-QW.02-0057", "MJCP-SHB-QW.02-0058"],
      hotspots: [[420, 170, 335, 680], [885, 170, 335, 680]],
    },
    {
      id: "recordings-wall-2",
      label: "唱片墙二",
      background: "textures/hall/gpt-soft-labels-v4/unit-recordings-wall-2.png",
      codes: ["MJCP-SHB-QW.02-0059"],
      hotspots: [[615, 70, 455, 735]],
    },
  ],
  "unit-qin-heart": [
    {
      id: "qin-heart-wall-1",
      label: "琴心墙一",
      background: "textures/hall/gpt-soft-labels-v4/unit-qin-heart-wall-1.png",
      codes: ["MJCP-SHB-ZH.02-0055", "MJCP-SHB-ZH.02-0056"],
      hotspots: [[235, 135, 470, 655], [695, 90, 420, 680]],
    },
    {
      id: "qin-heart-wall-2",
      label: "琴心墙二",
      background: "textures/hall/gpt-soft-labels-v4/unit-qin-heart-wall-2.png",
      codes: ["MJCP-SHB-ZH.02-0057", "MJCP-SHB-ZH.02-0059"],
      hotspots: [[240, 275, 450, 410], [745, 225, 405, 500]],
    },
    {
      id: "qin-heart-wall-3",
      label: "琴心墙三",
      background: "textures/hall/gpt-soft-labels-v4/unit-qin-heart-wall-3.png",
      codes: ["MJCP-SHB-ZH.02-0058"],
      hotspots: [[535, 165, 405, 490]],
    },
  ],
  "unit-masters": [
    {
      id: "masters-wall-1",
      label: "名家墙一",
      background: "textures/hall/gpt-soft-labels-v4/unit-masters-wall-1.png",
      codes: ["MJCP-SHB-ZH.02-0009"],
      hotspots: [[540, 210, 590, 455]],
    },
    {
      id: "masters-wall-2",
      label: "名家墙二",
      background: "textures/hall/gpt-soft-labels-v4/unit-masters-wall-2.png",
      codes: ["MJCP-SHB-ZH.02-0014"],
      hotspots: [[960, 45, 420, 775]],
    },
    {
      id: "masters-wall-3",
      label: "名家墙三",
      background: "textures/hall/gpt-soft-labels-v4/unit-masters-wall-3.png",
      codes: ["MJCP-SHB-ZH.02-0053"],
      hotspots: [[160, 125, 590, 520]],
    },
  ],
  "unit-paintings": [
    {
      id: "paintings-wall-1",
      label: "丹青墙一",
      background: "textures/hall/gpt-soft-labels-v4/unit-paintings-wall-1.png",
      codes: ["MJCP-SHB-ZH.02-0017"],
      hotspots: [[520, 225, 610, 470]],
    },
    {
      id: "paintings-wall-2",
      label: "丹青墙二",
      background: "textures/hall/gpt-soft-labels-v4/unit-paintings-wall-2.png",
      codes: ["MJCP-SHB-ZH.02-0069"],
      hotspots: [[225, 35, 470, 760]],
    },
    {
      id: "paintings-wall-3",
      label: "丹青墙三",
      background: "textures/hall/gpt-soft-labels-v4/unit-paintings-wall-3.png",
      codes: ["MJCP-SHB-ZH.02-0097"],
      hotspots: [[665, 115, 330, 730]],
    },
  ],
  "unit-qin-craft": [
    {
      id: "qin-craft-wall-1",
      label: "器物墙一",
      background: "textures/hall/gpt-soft-labels-v4/unit-qin-craft-wall-1.png",
      codes: ["MJCP-SHB-QW.01-0001", "MJCP-SHB-QW.01-0021", "MJCP-SHB-QW.01-0004"],
      hotspots: [[421, 360, 225, 228], [746, 358, 258, 228], [1100, 360, 231, 228]],
    },
    {
      id: "qin-craft-wall-2",
      label: "器物墙二",
      background: "textures/hall/gpt-soft-labels-v4/unit-qin-craft-wall-2.png",
      codes: ["MJCP-SHB-QW.01-0005", "MJCP-SHB-QW.01-0006"],
      hotspots: [[415, 303, 305, 304], [1087, 354, 254, 252]],
    },
    {
      id: "qin-craft-wall-3",
      label: "器物墙三",
      background: "textures/hall/gpt-soft-labels-v4/unit-qin-craft-wall-3.png",
      codes: ["MJCP-SHB-QW.01-0008", "MJCP-SHB-QW.01-0013"],
      hotspots: [[487, 354, 248, 223], [985, 355, 222, 222]],
    },
  ],
};

export function wallsForUnit(unitId, fallbackBackground) {
  const configured = PHOTO_ROUTE_WALLS[unitId];
  if (configured?.length) return configured;
  return [{
    id: `${unitId}-wall-1`,
    label: "展墙一",
    background: fallbackBackground,
    codes: null,
    hotspots: null,
  }];
}

export function wallContainsCode(wall, code) {
  return !wall.codes || wall.codes.map(normalizeCode).includes(normalizeCode(code));
}

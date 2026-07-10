export const museumTourDefinitions = [
  {
    id: "collection-highlights",
    title: "馆藏主题导览",
    shortTitle: "虚拟展馆",
    eyebrow: "Virtual Tour",
    summary: "从馆藏中的代表性条目出发，沿五组主题理解民间收藏所保存的社会生活、地方记忆与物质文化。",
    groups: [
      {
        id: "circulation-records",
        title: "票据与日常流通",
        description: "民国时期各类收据、证照与票据，记录社会经济活动与民众生活。",
        background: "从金额、抬头、印记和编号进入，观察地方商业秩序与日常往来。",
        selection: { category: "票据类", limit: 6 },
      },
      {
        id: "printed-memory",
        title: "文献与印刷记忆",
        description: "契约、信札、谱牒与登记材料，保留地方社会运行的文字线索。",
        background: "将署名、时间、用语与版式放回具体语境，追索文献的形成和流转。",
        selection: { category: "文献类", limit: 5 },
      },
      {
        id: "identity-marks",
        title: "徽章与印章",
        description: "徽章、奖章、印章与标识物，浓缩身份、组织和制度记忆。",
        background: "图案、铭文、编号和制作工艺，是理解个人经历与组织关系的入口。",
        selection: { category: "徽章印章类", limit: 5 },
      },
      {
        id: "writing-and-inscriptions",
        title: "碑刻与书法",
        description: "拓片、题字与书写材料，在笔触、章法和石刻痕迹中呈现时间层次。",
        background: "通过题款、印章、装裱和纸面状态，观察审美趣味与人际交往。",
        selection: { category: "字画类", limit: 4 },
      },
      {
        id: "objects-in-use",
        title: "器物与日常器用",
        description: "生活器物、纪念物与使用痕迹，让抽象记忆落到具体物件。",
        background: "尺寸、材质、结构与磨损共同说明器物曾经如何被使用、携带和陈设。",
        selection: { category: "器物类", limit: 4 },
      },
    ],
  },
];

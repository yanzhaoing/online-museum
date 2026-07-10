# Tour content model

Tours are content, not presentation components. A tour has ordered groups, and each group has ordered stops that point to catalog items:

```text
tour → groups → stops → catalog items
```

Edit `tours.js` to add another curated tour. A group can currently obtain items in three ways:

1. `selection: { category, limit }` selects representative previewable items from a catalog category.
2. `itemIds: [...]` lists an explicit ordered group of related catalog items.
3. `stops: [{ itemId, title, description, background }]` lists explicit items and supplies tour-specific copy.

The third form is useful when the same catalog item needs a different explanation in different tours:

```js
{
  id: "local-commerce",
  title: "一张票据的城市生活",
  description: "从相关票据理解一段地方商业史。",
  background: "本组共享的历史背景。",
  stops: [
    {
      itemId: "item-123",
      title: "第一站",
      description: "这件藏品在本条导览中的详细说明。",
      background: "与这一站直接相关的背景故事。",
    },
  ],
}
```

Catalog items may also define reusable `tourTitle`, `description`, and `backgroundStory` fields. Tour-specific stop copy takes precedence over those reusable fields.

Presentation choices stay outside this directory. The current WebGL presentation is adapted in `../lib/immersive-gallery/presentation.js`; a future timeline, story page, map, audio guide, or non-3D slideshow can consume the same tour object without changing its content.

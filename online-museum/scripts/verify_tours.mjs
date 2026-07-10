import assert from "node:assert/strict";

globalThis.window = { MUSEUM_CATALOG: { items: [], stats: {} } };

const { buildMuseumTour } = await import("../src/lib/tours.js");

const source = [
  fixture("item-a", "票据类", "0001", { description: "Reusable description" }),
  fixture("item-b", "票据类", "0002"),
  fixture("item-c", "文献类", "0003", { backgroundStory: "Reusable background" }),
];

const selectedTour = buildMuseumTour(source.filter((item) => item.id !== "item-b"), {
  id: "selection-tour",
  title: "Selection tour",
  groups: [{ id: "receipts", title: "Receipts", selection: { category: "票据类", limit: 1 } }],
});

assert.equal(selectedTour.groups.length, 1);
assert.equal(selectedTour.stops.length, 1);
assert.equal(selectedTour.groups[0].sourceCategory, "票据类");
assert.equal(selectedTour.stops[0].description, "Reusable description");
assert.equal("galleryLayout" in selectedTour.stops[0], false, "content model must not contain presentation layout");

const curatedTour = buildMuseumTour(source, {
  id: "curated-tour",
  title: "Curated tour",
  groups: [{
    id: "related-items",
    title: "Related items",
    background: "Group background",
    stops: [
      { itemId: "item-c", title: "First", description: "Tour-specific description" },
      { itemId: "item-a", title: "Second", background: "Tour-specific background" },
    ],
  }],
});

assert.deepEqual(curatedTour.stops.map((stop) => stop.itemId), ["item-c", "item-a"]);
assert.equal(curatedTour.stops[0].title, "First");
assert.equal(curatedTour.stops[0].description, "Tour-specific description");
assert.equal(curatedTour.stops[0].background, "Reusable background");
assert.equal(curatedTour.stops[1].background, "Tour-specific background");

console.log("Tour content model checks passed.");

function fixture(id, category, code, extra = {}) {
  return {
    id,
    category,
    code,
    title: `${category} ${code}`,
    collector: "测试馆藏",
    kind: "image",
    kindLabel: "影像",
    thumbPath: `thumbs/${id}.jpg`,
    fileName: `${id}.jpg`,
    size: 1024,
    ...extra,
  };
}

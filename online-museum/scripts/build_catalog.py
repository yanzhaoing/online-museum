from __future__ import annotations

import json
import re
import hashlib
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "online-museum" / "data" / "catalog.js"
THUMB_DIR = ROOT / "online-museum" / "thumbs"
MEDIA_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
CATEGORY_WORDS = ["文献类", "票据类", "字画类", "器物类", "徽章印章类", "碑拓", "地契"]
SKIP_DIRS = {"online-museum"}


def clean_collector(name: str) -> str:
    name = re.sub(r"[（(].*?[）)]", "", name)
    name = name.replace("馆内 ", "").strip()
    return name or "馆内"


def category_from_parts(parts: tuple[str, ...]) -> str:
    joined = "/".join(parts)
    for word in CATEGORY_WORDS:
        if word in joined:
            return word
    match = re.search(r"-([A-Z]{2})\.", joined, re.IGNORECASE)
    if match:
        code = match.group(1).upper()
        return {
            "WX": "文献类",
            "PJ": "票据类",
            "ZH": "字画类",
            "QW": "器物类",
            "HZ": "徽章印章类",
        }.get(code, "综合类")
    return "综合类"


def code_from_name(path: Path) -> str:
    stem = path.stem
    match = re.match(r"(MJCP-[A-Z0-9.-]+-\d{4})", stem, re.IGNORECASE)
    if match:
        return match.group(1).upper()
    return stem


def title_from_path(path: Path, code: str, category: str) -> str:
    stem = path.stem
    if code and stem.upper().startswith(code.upper()):
        suffix = stem[len(code):].strip("-_ ")
        if suffix:
            return suffix
    return f"{category} · {stem}"


def thumb_path_for(rel: Path) -> Path:
    digest = hashlib.sha1(rel.as_posix().encode("utf-8")).hexdigest()[:16]
    return THUMB_DIR / f"{digest}.jpg"


def ensure_thumbnail(path: Path, rel: Path) -> str | None:
    thumb = thumb_path_for(rel)
    if thumb.exists() and thumb.stat().st_mtime >= path.stat().st_mtime:
        return "../" + thumb.relative_to(ROOT).as_posix()
    try:
        thumb.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(path) as image:
            image = ImageOps.exif_transpose(image)
            image.thumbnail((720, 720))
            if image.mode not in ("RGB", "L"):
                image = image.convert("RGB")
            image.save(thumb, "JPEG", quality=78, optimize=True)
        return "../" + thumb.relative_to(ROOT).as_posix()
    except Exception as error:
        print(f"thumbnail skipped: {rel} ({error})")
        return None


def should_skip(path: Path) -> bool:
    return any(part in SKIP_DIRS for part in path.parts) or any(part.startswith("._") for part in path.parts)


def main() -> None:
    items = []
    for path in ROOT.rglob("*"):
      if should_skip(path.relative_to(ROOT)):
          continue
      if not path.is_file() or path.suffix.lower() not in MEDIA_EXTS:
          continue
      rel = path.relative_to(ROOT)
      parts = rel.parts
      collector = clean_collector(parts[0]) if len(parts) > 1 else "馆藏"
      category = category_from_parts(parts)
      code = code_from_name(path)
      kind = "image" if path.suffix.lower() in IMAGE_EXTS else "pdf"
      title = title_from_path(path, code, category)
      stat = path.stat()
      item = {
          "id": f"item-{len(items) + 1}",
          "code": code,
          "title": title,
          "collector": collector,
          "category": category,
          "kind": kind,
          "kindLabel": "影像" if kind == "image" else "PDF",
          "fileName": path.name,
          "folder": str(Path(*parts[:-1])) if len(parts) > 1 else "",
          "path": "../" + rel.as_posix(),
          "size": stat.st_size,
      }
      if kind == "image":
          thumb_path = ensure_thumbnail(path, rel)
          if thumb_path:
              item["thumbPath"] = thumb_path
      item["search"] = " ".join(
          [item["code"], item["title"], item["collector"], item["category"], item["kindLabel"], item["fileName"], item["folder"]]
      ).lower()
      items.append(item)

    items.sort(key=lambda item: (item["collector"], item["category"], item["code"], item["fileName"]))
    for index, item in enumerate(items, start=1):
        item["id"] = f"item-{index}"

    payload = {
        "generatedFrom": str(ROOT),
        "stats": {
            "items": len(items),
            "images": sum(1 for item in items if item["kind"] == "image"),
            "pdfs": sum(1 for item in items if item["kind"] == "pdf"),
        },
        "items": items,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("window.MUSEUM_CATALOG = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"wrote {OUT} with {len(items)} items")


if __name__ == "__main__":
    main()

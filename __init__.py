"""
Favorite Gallery — ComfyUIのサイドバーにお気に入り管理タブを追加するカスタムノード。

インストール方法:
    このフォルダを ComfyUI/custom_nodes/favorite_gallery として配置し、
    ComfyUIを再起動する。左サイドバーの★アイコンから開ける。

お気に入り・タグ・メモは output フォルダ直下の favorites.json に保存される
(元の生成ファイルは一切移動・変更しない)。
「コピー」ボタンでお気に入り全部を output/_favorites/ にコピーできる。
"""

import os
import json
import shutil
import tempfile
import time

from aiohttp import web
from server import PromptServer
import folder_paths

try:
    from PIL import Image
except Exception:
    Image = None

FAVORITES_FILENAME = "favorites.json"

EXT_KIND = {
    ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image",
    ".gif": "image", ".bmp": "image",
    ".mp4": "video", ".webm": "video", ".mov": "video", ".m4v": "video",
    ".mp3": "audio", ".wav": "audio", ".flac": "audio", ".m4a": "audio", ".ogg": "audio",
}
MEDIA_EXTS = set(EXT_KIND.keys())


def _output_dir() -> str:
    return folder_paths.get_output_directory()


def _favorites_path() -> str:
    return os.path.join(_output_dir(), FAVORITES_FILENAME)


def _safe_rel_path(rel):
    """クライアントから受け取った相対パスを検証し、outputフォルダ内の
    絶対パスを返す。不正(絶対パス・..・フォルダ外・対象外拡張子)なら None。

    文字列の startswith 比較だと "output2" のような兄弟フォルダを通して
    しまうため、realpath + commonpath で「本当にoutputの配下か」を判定する。
    シンボリックリンク経由の脱出も realpath で解決してから比較する。
    """
    if not isinstance(rel, str) or not rel or "\x00" in rel:
        return None
    if os.path.isabs(rel) or os.path.splitdrive(rel)[0]:
        return None
    parts = rel.replace("\\", "/").split("/")
    if any(p == ".." for p in parts):
        return None
    if os.path.splitext(rel)[1].lower() not in MEDIA_EXTS:
        return None

    base = os.path.realpath(_output_dir())
    full = os.path.realpath(os.path.join(base, rel))
    try:
        if os.path.commonpath([base, full]) != base:
            return None
    except ValueError:  # Windowsで別ドライブになった場合など
        return None
    return full


def _load_items() -> dict:
    """path -> {favorite: bool, tags: [str], note: str}

    favorites.json が壊れていた場合は、空扱いで続行する前に
    favorites.json.corrupt-<日時> へ退避する。退避せずに空で動かすと、次の
    保存で壊れたファイルが空データで上書きされ、復旧不能になるため。
    """
    path = _favorites_path()
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        if not isinstance(raw, dict):
            raise ValueError("favorites.json のトップレベルがオブジェクトではありません")
    except Exception as e:
        # 同じ秒に複数回壊れても、先に退避した分を上書きしないよう連番で避ける
        stamp = time.strftime("%Y%m%d-%H%M%S")
        backup = f"{path}.corrupt-{stamp}"
        n = 1
        while os.path.exists(backup):
            n += 1
            backup = f"{path}.corrupt-{stamp}-{n}"
        try:
            os.replace(path, backup)
            print(f"[FavoriteGallery] favorites.json を読めなかったため退避しました: {backup} ({e})")
        except OSError as move_err:
            print(f"[FavoriteGallery] favorites.json の退避にも失敗: {move_err}")
        return {}
    # 旧形式 {"favorites": [...]} からの移行
    if "items" not in raw and isinstance(raw.get("favorites"), list):
        return {p: {"favorite": True, "tags": [], "note": ""} for p in raw["favorites"]}
    items = raw.get("items", {})
    if not isinstance(items, dict):
        return {}
    for v in items.values():
        v.setdefault("favorite", False)
        v.setdefault("tags", [])
        v.setdefault("note", "")
    return items


def _save_items(items: dict) -> None:
    """同じフォルダの一時ファイルに書いてから os.replace で差し替える。

    直接 open(path, "w") で書くと、書き込み中にクラッシュ/電源断が起きた時に
    ファイルが途中で切れた状態で残る。os.replace は同一ボリューム内で
    アトミックなので、読み手には「旧版」か「新版」のどちらかしか見えない。
    """
    path = _favorites_path()
    fd, tmp_path = tempfile.mkstemp(
        dir=os.path.dirname(path), prefix=".favorites-", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump({"items": items}, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _scan_media():
    out_dir = _output_dir()
    items_data = _load_items()
    items = []
    for root, dirs, files in os.walk(out_dir):
        rel_root = os.path.relpath(root, out_dir)
        if rel_root != "." and "_favorites" in rel_root.split(os.sep):
            continue
        for fname in files:
            ext = os.path.splitext(fname)[1].lower()
            if ext not in MEDIA_EXTS:
                continue
            full = os.path.join(root, fname)
            rel = os.path.relpath(full, out_dir).replace("\\", "/")
            subfolder = "" if rel_root == "." else rel_root.replace("\\", "/")
            meta = items_data.get(rel, {})
            st = os.stat(full)
            # Windowsではst_ctimeが作成日時、Linux/Macでは変更系のため、
            # 「より古い方」を作成日時の近似として使う(コピー等で更新日時だけ
            # 新しくなるケースに強くするため)
            created = getattr(st, "st_birthtime", None)
            if created is None:
                created = min(st.st_ctime, st.st_mtime)
            items.append(
                {
                    "filename": fname,
                    "subfolder": subfolder,
                    "path": rel,
                    "kind": EXT_KIND[ext],
                    "ext": ext.lstrip("."),
                    "mtime": st.st_mtime,
                    "ctime": created,
                    "favorite": bool(meta.get("favorite", False)),
                    "tags": meta.get("tags", []),
                    "note": meta.get("note", ""),
                }
            )
    items.sort(key=lambda x: x["ctime"], reverse=True)
    return items


SAMPLER_CLASS_HINTS = ("KSampler", "SamplerCustom")
CHECKPOINT_CLASS_HINTS = ("CheckpointLoader",)
LORA_CLASS_HINTS = ("LoraLoader", "LoRALoader", "LoraLoaderModelOnly")


def _node_title(node: dict, node_id: str) -> str:
    meta = node.get("_meta") or {}
    return meta.get("title") or node.get("class_type") or node_id


def _parse_prompt_graph(prompt: dict) -> dict:
    """ComfyUIが画像に埋め込むAPI形式のプロンプトグラフ(node_id -> {class_type, inputs})
    から、人間が読みやすいプロンプト・モデル・LoRA・サンプラー設定を抜き出す。"""
    positive_text = None
    negative_text = None
    other_texts = []
    model_name = None
    loras = []
    sampler_info = None

    # まずサンプラーノードを探し、positive/negativeの接続先ノードIDを特定する
    positive_link_id = None
    negative_link_id = None
    for node_id, node in prompt.items():
        class_type = node.get("class_type", "")
        inputs = node.get("inputs", {}) or {}
        if any(h in class_type for h in SAMPLER_CLASS_HINTS) and sampler_info is None:
            sampler_info = {
                "sampler_name": inputs.get("sampler_name"),
                "scheduler": inputs.get("scheduler"),
                "steps": inputs.get("steps"),
                "cfg": inputs.get("cfg"),
                "seed": inputs.get("seed") if "seed" in inputs else inputs.get("noise_seed"),
                "denoise": inputs.get("denoise"),
            }
            pos = inputs.get("positive")
            neg = inputs.get("negative")
            if isinstance(pos, list) and len(pos) >= 1:
                positive_link_id = str(pos[0])
            if isinstance(neg, list) and len(neg) >= 1:
                negative_link_id = str(neg[0])
        if any(h in class_type for h in CHECKPOINT_CLASS_HINTS) and model_name is None:
            model_name = inputs.get("ckpt_name")
        if any(h in class_type for h in LORA_CLASS_HINTS):
            lora_name = inputs.get("lora_name")
            strength = inputs.get("strength_model", inputs.get("strength"))
            if lora_name:
                loras.append({"name": lora_name, "strength": strength})

    # テキスト(プロンプト本文)を持っていそうなノードを総当りで集める
    text_nodes = {}
    for node_id, node in prompt.items():
        inputs = node.get("inputs", {}) or {}
        text_val = inputs.get("text")
        if isinstance(text_val, str) and text_val.strip():
            text_nodes[node_id] = text_val

    if positive_link_id and positive_link_id in text_nodes:
        positive_text = text_nodes.pop(positive_link_id)
    if negative_link_id and negative_link_id in text_nodes:
        negative_text = text_nodes.pop(negative_link_id)

    # 残ったテキストノードは「その他」として、ノードのタイトル付きで返す
    for node_id, text_val in text_nodes.items():
        other_texts.append({"label": _node_title(prompt.get(node_id, {}), node_id), "text": text_val})

    return {
        "positive": positive_text,
        "negative": negative_text,
        "other_texts": other_texts,
        "model": model_name,
        "loras": loras,
        "sampler": sampler_info,
    }


def _read_png_metadata(full_path: str):
    if Image is None:
        return {"ok": False, "error": "Pillow未導入のため読み取れません"}
    try:
        img = Image.open(full_path)
        img.load()
    except Exception as e:
        return {"ok": False, "error": f"画像を開けませんでした: {e}"}

    prompt_str = img.info.get("prompt")
    if not prompt_str:
        return {"ok": False, "error": "この画像にはComfyUIのメタデータが埋め込まれていません"}

    try:
        prompt_graph = json.loads(prompt_str)
    except Exception as e:
        return {"ok": False, "error": f"メタデータの解析に失敗しました: {e}"}

    parsed = _parse_prompt_graph(prompt_graph)
    parsed["ok"] = True
    return parsed


routes = PromptServer.instance.routes


@routes.get("/favorite_gallery/info")
async def fg_info(request):
    rel = request.rel_url.query.get("path")
    full = _safe_rel_path(rel)
    if full is None:
        return web.json_response({"ok": False, "error": "invalid path"}, status=400)
    if not os.path.isfile(full):
        return web.json_response({"ok": False, "error": "file not found"}, status=404)

    ext = os.path.splitext(full)[1].lower()
    if ext not in (".png",):
        return web.json_response(
            {"ok": False, "error": "この形式(PNG以外)はメタデータ読み取りに対応していません"}
        )
    return web.json_response(_read_png_metadata(full))


@routes.get("/favorite_gallery/files")
async def fg_files(request):
    try:
        return web.json_response(_scan_media())
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@routes.post("/favorite_gallery/toggle")
async def fg_toggle(request):
    data = await request.json()
    rel = data.get("path")
    fav = bool(data.get("favorite"))
    if _safe_rel_path(rel) is None:
        return web.json_response({"ok": False, "error": "invalid path"}, status=400)
    rel = rel.replace("\\", "/")
    items = _load_items()
    entry = items.get(rel, {"favorite": False, "tags": [], "note": ""})
    entry["favorite"] = fav
    if not fav and not entry.get("tags") and not entry.get("note"):
        items.pop(rel, None)
    else:
        items[rel] = entry
    _save_items(items)
    return web.json_response({"ok": True})


@routes.post("/favorite_gallery/meta")
async def fg_meta(request):
    data = await request.json()
    rel = data.get("path")
    if _safe_rel_path(rel) is None:
        return web.json_response({"ok": False, "error": "invalid path"}, status=400)
    rel = rel.replace("\\", "/")
    tags = data.get("tags", [])
    note = data.get("note", "")
    items = _load_items()
    entry = items.get(rel, {"favorite": False, "tags": [], "note": ""})
    entry["tags"] = [t.strip() for t in tags if t.strip()]
    entry["note"] = note
    if not entry["favorite"] and not entry["tags"] and not entry["note"]:
        items.pop(rel, None)
    else:
        items[rel] = entry
    _save_items(items)
    return web.json_response({"ok": True})


@routes.post("/favorite_gallery/export")
async def fg_export(request):
    out_dir = _output_dir()
    items = _load_items()
    favorites = [p for p, v in items.items() if v.get("favorite")]
    dest_dir = os.path.join(out_dir, "_favorites")
    os.makedirs(dest_dir, exist_ok=True)
    copied = 0
    for rel in favorites:
        # favorites.json は手で編集されうるので、読み出したパスも毎回検証する
        src = _safe_rel_path(rel)
        if src is None or not os.path.isfile(src):
            continue
        flat_name = rel.replace("\\", "/").replace("/", "__")
        shutil.copy2(src, os.path.join(dest_dir, flat_name))
        copied += 1
    return web.json_response({"ok": True, "copied": copied, "dest": dest_dir})


WEB_DIRECTORY = "./web"
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

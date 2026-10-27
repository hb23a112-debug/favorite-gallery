import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function fmtDay(ts) {
  const d = new Date(ts * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtDayLabel(ts) {
  const d = new Date(ts * 1000);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const wd = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${y}年${m}月${day}日(${wd})`;
}
function fmtTime(ts) {
  const d = new Date(ts * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

app.registerExtension({
  name: "FavoriteGallery",
  async setup() {
    try {
      app.extensionManager.registerSidebarTab({
        id: "favoriteGallery",
        icon: "pi pi-star",
        title: "お気に入り",
        tooltip: "お気に入りギャラリー",
        type: "custom",
        render: (el) => {
          try {
            renderGallery(el);
          } catch (err) {
            console.error("[FavoriteGallery] render failed:", err);
            el.innerHTML = `<div style="padding:12px; color:#f66; font-size:12px;">お気に入りギャラリーの表示に失敗しました。<br>コンソール(F12)のエラーを確認してください。<br><br>${err}</div>`;
          }
        },
      });
      console.log("[FavoriteGallery] sidebar tab registered");
    } catch (err) {
      console.error("[FavoriteGallery] registerSidebarTab failed:", err);
    }
  },
});

function renderGallery(el) {
  el.innerHTML = `
    <div style="display:flex; flex-direction:column; height:100%; padding:8px; box-sizing:border-box; font-size:12px;">
      <div style="display:flex; gap:6px; margin-bottom:6px; flex-wrap:wrap;">
        <button id="fg-filter" style="flex:1; padding:6px; border-radius:4px; border:1px solid #444; background:#2a2a35; color:#eee; cursor:pointer;">お気に入りのみ</button>
        <button id="fg-refresh" style="padding:6px 10px; border-radius:4px; border:1px solid #444; background:#2a2a35; color:#eee; cursor:pointer;">更新</button>
        <button id="fg-export" style="padding:6px 10px; border-radius:4px; border:1px solid #444; background:#2a2a35; color:#eee; cursor:pointer;">コピー</button>
      </div>
      <div style="display:flex; gap:6px; margin-bottom:6px;">
        <button id="fg-restart" title="新しく入れたカスタムノード/モデルを反映するためにComfyUIサーバーを再起動します" style="flex:1; padding:6px; border-radius:4px; border:1px solid #7a3a2a; background:#3a2420; color:#ffb199; cursor:pointer;">⟳ ComfyUIを再起動</button>
      </div>
      <div style="display:flex; gap:6px; margin-bottom:6px; align-items:center;">
        <select id="fg-type" style="flex:1; padding:5px; border-radius:4px; border:1px solid #444; background:#2a2a35; color:#eee;">
          <option value="">種類: すべて</option>
        </select>
      </div>
      <div style="display:flex; gap:4px; margin-bottom:6px; align-items:center;">
        <input id="fg-date-from" type="date" style="flex:1; padding:4px; border-radius:4px; border:1px solid #444; background:#2a2a35; color:#eee; min-width:0;">
        <span style="color:#888;">〜</span>
        <input id="fg-date-to" type="date" style="flex:1; padding:4px; border-radius:4px; border:1px solid #444; background:#2a2a35; color:#eee; min-width:0;">
        <button id="fg-date-clear" title="日付クリア" style="padding:4px 8px; border-radius:4px; border:1px solid #444; background:#2a2a35; color:#eee; cursor:pointer;">×</button>
      </div>
      <div id="fg-status" style="font-size:11px; color:#888; margin-bottom:6px;"></div>
      <div id="fg-list" style="flex:1; overflow-y:auto;"></div>
    </div>
    <div id="fg-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:9999; align-items:center; justify-content:center;">
      <div style="background:#1e1e26; border:1px solid #444; border-radius:8px; padding:16px; width:380px; max-width:90vw; max-height:90vh; overflow-y:auto; box-sizing:border-box;">
        <div style="font-weight:600; margin-bottom:8px;">お気に入り編集</div>
        <div style="margin-bottom:6px; color:#aaa; font-size:11px;" id="fg-modal-filename"></div>
        <div id="fg-modal-info" style="margin-bottom:10px; font-size:11px;"></div>
        <label style="display:block; font-size:11px; color:#aaa; margin-bottom:2px;">タグ (カンマ区切り)</label>
        <input id="fg-modal-tags" type="text" placeholder="例: 候補, 良い表情" style="width:100%; box-sizing:border-box; padding:6px; margin-bottom:8px; border-radius:4px; border:1px solid #444; background:#111; color:#eee;">
        <label style="display:block; font-size:11px; color:#aaa; margin-bottom:2px;">メモ</label>
        <textarea id="fg-modal-note" rows="3" style="width:100%; box-sizing:border-box; padding:6px; margin-bottom:10px; border-radius:4px; border:1px solid #444; background:#111; color:#eee; resize:vertical;"></textarea>
        <div style="display:flex; gap:6px; justify-content:flex-end;">
          <button id="fg-modal-cancel" style="padding:6px 12px; border-radius:4px; border:1px solid #444; background:#2a2a35; color:#eee; cursor:pointer;">キャンセル</button>
          <button id="fg-modal-save" style="padding:6px 12px; border-radius:4px; border:1px solid #e8b400; background:#e8b400; color:#111; cursor:pointer;">保存</button>
        </div>
      </div>
    </div>
  `;

  let showFavOnly = false;
  let items = [];
  let typeFilter = "";
  let modalTarget = null;

  const list = el.querySelector("#fg-list");
  const status = el.querySelector("#fg-status");
  const filterBtn = el.querySelector("#fg-filter");
  const refreshBtn = el.querySelector("#fg-refresh");
  const exportBtn = el.querySelector("#fg-export");
  const restartBtn = el.querySelector("#fg-restart");
  const typeSelect = el.querySelector("#fg-type");
  const dateFrom = el.querySelector("#fg-date-from");
  const dateTo = el.querySelector("#fg-date-to");
  const dateClear = el.querySelector("#fg-date-clear");

  const modal = el.querySelector("#fg-modal");
  const modalFilename = el.querySelector("#fg-modal-filename");
  const modalInfo = el.querySelector("#fg-modal-info");
  const modalTags = el.querySelector("#fg-modal-tags");
  const modalNote = el.querySelector("#fg-modal-note");
  const modalCancel = el.querySelector("#fg-modal-cancel");
  const modalSave = el.querySelector("#fg-modal-save");

  function createdTs(item) {
    // ctimeが取れていればそれを「作成日時」として使う(コピー等でmtimeだけ
    // ずれるケースに強いため)。無ければmtimeにフォールバック。
    return item.ctime || item.mtime;
  }

  function currentFiltered() {
    return items.filter((i) => {
      if (showFavOnly && !i.favorite) return false;
      if (typeFilter && i.ext !== typeFilter) return false;
      const day = fmtDay(createdTs(i));
      if (dateFrom.value && day < dateFrom.value) return false;
      if (dateTo.value && day > dateTo.value) return false;
      return true;
    });
  }

  function updateTypeOptions() {
    const counts = {};
    for (const i of items) counts[i.ext] = (counts[i.ext] || 0) + 1;
    const prev = typeSelect.value;
    typeSelect.innerHTML = `<option value="">種類: すべて (${items.length})</option>`;
    for (const ext of Object.keys(counts).sort()) {
      const opt = document.createElement("option");
      opt.value = ext;
      opt.textContent = `.${ext} (${counts[ext]})`;
      typeSelect.appendChild(opt);
    }
    typeSelect.value = counts[prev] ? prev : "";
    typeFilter = typeSelect.value;
  }

  function updateStatus(shownCount) {
    const favCount = items.filter((i) => i.favorite).length;
    status.textContent = `${shownCount}件表示 / 全${items.length}件 / お気に入り${favCount}件`;
  }

  async function load() {
    status.textContent = "読み込み中...";
    try {
      const res = await api.fetchApi("/favorite_gallery/files");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      items = await res.json();
      if (items && items.error) throw new Error(items.error);
    } catch (err) {
      console.error("[FavoriteGallery] failed to load files:", err);
      list.innerHTML = `<div style="padding:12px; color:#f66;">一覧の取得に失敗しました: ${err}</div>`;
      status.textContent = "";
      return;
    }
    updateTypeOptions();
    render();
  }

  function render() {
    list.innerHTML = "";
    const filtered = currentFiltered();
    updateStatus(filtered.length);

    if (filtered.length === 0) {
      list.innerHTML = `<div style="padding:16px; color:#777; text-align:center;">該当する画像・動画がありません</div>`;
      return;
    }

    // 日付ごとにグループ化して、見出しをはさんで表示する
    let currentDay = null;
    let grid = null;
    for (const item of filtered) {
      const day = fmtDay(createdTs(item));
      if (day !== currentDay) {
        currentDay = day;
        const dayItems = filtered.filter((i) => fmtDay(createdTs(i)) === day);
        const header = document.createElement("div");
        header.style.cssText =
          "position:sticky; top:0; background:#15151a; padding:6px 2px 4px; font-size:12px; font-weight:600; color:#ddd; border-bottom:1px solid #333; margin-top:8px; z-index:1;";
        header.textContent = `${fmtDayLabel(createdTs(item))}（${dayItems.length}件）`;
        list.appendChild(header);

        grid = document.createElement("div");
        grid.style.cssText =
          "display:grid; grid-template-columns: repeat(auto-fill, minmax(96px,1fr)); gap:8px; align-content:start; padding:6px 0;";
        list.appendChild(grid);
      }
      grid.appendChild(makeCard(item));
    }
  }

  // 画像に埋め込まれたプロンプト情報の1ブロック(見出し+本文+コピー)を作る。
  // 本文は外部由来の文字列なので、必ず textContent で入れる(HTMLとして解釈させない)。
  function infoBlock(label, text, copyable) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "margin-bottom:8px;";
    const head = document.createElement("div");
    head.style.cssText = "display:flex; justify-content:space-between; align-items:center; color:#aaa; margin-bottom:2px;";
    const lab = document.createElement("span");
    lab.textContent = label;
    head.appendChild(lab);
    if (copyable) {
      const btn = document.createElement("button");
      btn.textContent = "コピー";
      btn.style.cssText = "padding:1px 8px; border-radius:3px; border:1px solid #444; background:#2a2a35; color:#ddd; cursor:pointer; font-size:10px;";
      btn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(text);
          btn.textContent = "コピーしました";
        } catch (e) {
          btn.textContent = "失敗";
        }
        setTimeout(() => { btn.textContent = "コピー"; }, 1200);
      };
      head.appendChild(btn);
    }
    const body = document.createElement("div");
    body.textContent = text;
    body.style.cssText = "background:#111; border:1px solid #333; border-radius:4px; padding:6px; max-height:96px; overflow-y:auto; white-space:pre-wrap; word-break:break-word; color:#ddd; user-select:text;";
    wrap.appendChild(head);
    wrap.appendChild(body);
    return wrap;
  }

  function renderInfo(data) {
    modalInfo.innerHTML = "";
    if (!data || !data.ok) {
      const msg = document.createElement("div");
      msg.style.cssText = "color:#777;";
      msg.textContent = (data && data.error) || "生成情報を取得できませんでした";
      modalInfo.appendChild(msg);
      return;
    }
    if (data.positive) modalInfo.appendChild(infoBlock("ポジティブプロンプト", data.positive, true));
    if (data.negative) modalInfo.appendChild(infoBlock("ネガティブプロンプト", data.negative, true));
    for (const t of data.other_texts || []) {
      modalInfo.appendChild(infoBlock(`その他: ${t.label}`, t.text, true));
    }
    const lines = [];
    if (data.model) lines.push(`モデル: ${data.model}`);
    for (const l of data.loras || []) {
      lines.push(`LoRA: ${l.name}${l.strength != null ? ` (強度 ${l.strength})` : ""}`);
    }
    const s = data.sampler;
    if (s) {
      const parts = [];
      if (s.sampler_name) parts.push(s.sampler_name);
      if (s.scheduler) parts.push(s.scheduler);
      if (s.steps != null) parts.push(`steps ${s.steps}`);
      if (s.cfg != null) parts.push(`cfg ${s.cfg}`);
      if (s.denoise != null && s.denoise !== 1) parts.push(`denoise ${s.denoise}`);
      if (parts.length) lines.push(`サンプラー: ${parts.join(" / ")}`);
      if (s.seed != null) lines.push(`シード: ${s.seed}`);
    }
    if (lines.length) modalInfo.appendChild(infoBlock("生成設定", lines.join("\n"), true));
    if (!modalInfo.children.length) {
      const msg = document.createElement("div");
      msg.style.cssText = "color:#777;";
      msg.textContent = "プロンプト情報が見つかりませんでした";
      modalInfo.appendChild(msg);
    }
  }

  async function loadInfo(item) {
    modalInfo.innerHTML = "";
    if (item.kind !== "image" || item.ext !== "png") {
      const msg = document.createElement("div");
      msg.style.cssText = "color:#777;";
      msg.textContent = "生成情報の表示はPNG画像のみ対応しています";
      modalInfo.appendChild(msg);
      return;
    }
    const loading = document.createElement("div");
    loading.style.cssText = "color:#777;";
    loading.textContent = "生成情報を読み込み中…";
    modalInfo.appendChild(loading);
    try {
      const res = await api.fetchApi(`/favorite_gallery/info?path=${encodeURIComponent(item.path)}`);
      const data = await res.json();
      // 読み込み中に別の画像のパネルへ切り替わっていたら、古い結果は捨てる
      if (modalTarget !== item) return;
      renderInfo(data);
    } catch (err) {
      if (modalTarget !== item) return;
      renderInfo({ ok: false, error: `取得に失敗しました: ${err}` });
    }
  }

  function openModal(item) {
    modalTarget = item;
    modalFilename.textContent = item.filename;
    modalTags.value = (item.tags || []).join(", ");
    modalNote.value = item.note || "";
    modal.style.display = "flex";
    loadInfo(item);
  }
  function closeModal() {
    modal.style.display = "none";
    modalTarget = null;
  }
  modalCancel.onclick = closeModal;
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };
  modalSave.onclick = async () => {
    if (!modalTarget) return;
    const tags = modalTags.value.split(",").map((t) => t.trim()).filter(Boolean);
    const note = modalNote.value;
    modalTarget.tags = tags;
    modalTarget.note = note;
    await api.fetchApi("/favorite_gallery/meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: modalTarget.path, tags, note }),
    });
    closeModal();
    render();
  };

  function makeCard(item) {
    const card = document.createElement("div");
    card.style.cssText =
      "position:relative; border-radius:4px; overflow:hidden; background:#111; border:1px solid #333; display:flex; flex-direction:column;";

    const viewUrl = api.apiURL(
      `/view?filename=${encodeURIComponent(item.filename)}&subfolder=${encodeURIComponent(
        item.subfolder
      )}&type=output`
    );

    const thumbWrap = document.createElement("div");
    thumbWrap.style.cssText = "position:relative; width:100%; aspect-ratio:1/1; background:#000;";

    let mediaEl;
    if (item.kind === "video") {
      mediaEl = document.createElement("video");
      mediaEl.src = viewUrl + "#t=0.1";
      mediaEl.muted = true;
      mediaEl.preload = "metadata";
    } else if (item.kind === "audio") {
      mediaEl = document.createElement("div");
      mediaEl.textContent = "🎵";
      mediaEl.style.cssText = "width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:28px; background:#181820;";
    } else {
      mediaEl = document.createElement("img");
      mediaEl.src = viewUrl;
      mediaEl.loading = "lazy";
    }
    mediaEl.title = item.filename;
    mediaEl.style.width = "100%";
    mediaEl.style.height = "100%";
    if (item.kind !== "audio") mediaEl.style.objectFit = "cover";
    mediaEl.style.cursor = "pointer";
    mediaEl.style.display = "block";
    mediaEl.onclick = () => window.open(viewUrl, "_blank");
    thumbWrap.appendChild(mediaEl);

    const star = document.createElement("div");
    star.textContent = item.favorite ? "★" : "☆";
    star.style.cssText = `
      position:absolute; top:2px; right:2px; font-size:15px; cursor:pointer;
      background:rgba(0,0,0,0.55); border-radius:50%; width:22px; height:22px;
      display:flex; align-items:center; justify-content:center; line-height:1;
      color:${item.favorite ? "#ffd23f" : "#ccc"};`;
    star.onclick = async (e) => {
      e.stopPropagation();
      item.favorite = !item.favorite;
      star.textContent = item.favorite ? "★" : "☆";
      star.style.color = item.favorite ? "#ffd23f" : "#ccc";
      await api.fetchApi("/favorite_gallery/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: item.path, favorite: item.favorite }),
      });
      updateStatus(currentFiltered().length);
      if (showFavOnly && !item.favorite) render();
    };
    thumbWrap.appendChild(star);

    const editBtn = document.createElement("div");
    editBtn.textContent = "✎";
    editBtn.title = "生成プロンプトの確認・タグ・メモの編集";
    editBtn.style.cssText = `
      position:absolute; top:2px; left:2px; font-size:12px; cursor:pointer;
      background:rgba(0,0,0,0.55); border-radius:50%; width:20px; height:20px;
      display:flex; align-items:center; justify-content:center; line-height:1; color:#ccc;`;
    editBtn.onclick = (e) => { e.stopPropagation(); openModal(item); };
    thumbWrap.appendChild(editBtn);

    card.appendChild(thumbWrap);

    const info = document.createElement("div");
    info.style.cssText = "padding:3px 4px; font-size:10px; color:#999; line-height:1.4;";
    const timeLine = document.createElement("div");
    timeLine.textContent = fmtTime(createdTs(item));
    timeLine.title = `作成: ${fmtDayLabel(createdTs(item))} ${fmtTime(createdTs(item))}`;
    info.appendChild(timeLine);
    if (item.tags && item.tags.length) {
      const tagsLine = document.createElement("div");
      tagsLine.style.cssText = "color:#7fc8ff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
      tagsLine.textContent = item.tags.map((t) => `#${t}`).join(" ");
      tagsLine.title = item.tags.join(", ");
      info.appendChild(tagsLine);
    }
    card.appendChild(info);

    return card;
  }

  filterBtn.onclick = () => {
    showFavOnly = !showFavOnly;
    filterBtn.style.background = showFavOnly ? "#e8b400" : "#2a2a35";
    filterBtn.style.color = showFavOnly ? "#111" : "#eee";
    render();
  };
  refreshBtn.onclick = load;
  typeSelect.onchange = () => { typeFilter = typeSelect.value; render(); };
  dateFrom.onchange = render;
  dateTo.onchange = render;
  dateClear.onclick = () => { dateFrom.value = ""; dateTo.value = ""; render(); };
  exportBtn.onclick = async () => {
    const res = await api.fetchApi("/favorite_gallery/export", { method: "POST" });
    const data = await res.json();
    alert(`${data.copied}件を ${data.dest} にコピーしました`);
  };

  restartBtn.onclick = async () => {
    const ok = confirm(
      "ComfyUIサーバーを再起動します。\n実行中の生成は中断され、キューの内容は失われます。\n続けますか？"
    );
    if (!ok) return;

    restartBtn.disabled = true;
    const originalText = restartBtn.textContent;
    restartBtn.textContent = "再起動中…";

    try {
      // ComfyUI-Manager が提供するエンドポイント。再起動が始まると
      // レスポンスが返らないままコネクションが切れるのが正常な挙動。
      await api.fetchApi("/manager/reboot", { method: "GET" }).catch(() => {});
    } catch (err) {
      console.warn("[FavoriteGallery] restart request finished with error (expected if server is restarting):", err);
    }

    // サーバーが落ちて立ち上がってくるまで、数秒おきに生存確認する
    restartBtn.textContent = "起動待機中…";
    let attempts = 0;
    const maxAttempts = 60; // 約3分
    const poll = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(location.origin + "/", { cache: "no-store" });
        if (res.ok) {
          clearInterval(poll);
          location.reload();
          return;
        }
      } catch (e) {
        // まだ落ちている/起動中。続行。
      }
      if (attempts >= maxAttempts) {
        clearInterval(poll);
        restartBtn.disabled = false;
        restartBtn.textContent = originalText;
        alert(
          "一定時間たっても再接続できませんでした。ComfyUIが起動しているか確認し、必要であればページを手動で再読み込みしてください。"
        );
      }
    }, 3000);
  };

  load();
}

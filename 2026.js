const YEAR = new Date().getFullYear();
const SEASONS = ["WINTER", "SPRING", "SUMMER", "AUTUMN"];
const PAGE_PARAMS = new URLSearchParams(location.search);

document.body.classList.toggle("theme-plain-dark", PAGE_PARAMS.get("theme") !== "plain-light");

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const uid = () => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch (error) {
    console.warn("Secure UUID generation is unavailable.", error);
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};
const today = () => new Date().toISOString();
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const formatDate = value => new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
const formatMonth = value => new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric" }).format(new Date(value));
const formatHistoryDate = value => new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" }).format(new Date(value)).toUpperCase();

function demoState() {
  const year = YEAR;
  const at = (month, day) => new Date(year, month - 1, day, 12).toISOString();
  return {
    version: 3,
    wants: [
      { id: "mongolia", title: "モンゴルの草原で、満天の星を見る", memo: "ゲルに泊まって、朝の空気を吸いたい。", parentId: null, createdAt: at(1, 5), places: [], people: [], afterword: "" },
      { id: "bookstore", title: "小さな本屋をめぐる旅をする", memo: "その土地で長く続いている本屋を訪ねたい。", parentId: null, createdAt: at(1, 8), places: ["京都"], people: [], afterword: "" },
      { id: "pottery", title: "自分の手で、毎日使う器をつくる", memo: "少し歪んでいても、日々使いたくなるもの。", parentId: null, createdAt: at(2, 2), places: ["益子"], people: ["陶芸教室の先生"], afterword: "不揃いな形も、使うほど好きになった。" },
      { id: "camera", title: "祖父の古いカメラを直して使う", memo: "", parentId: null, createdAt: at(1, 18), places: [], people: [], afterword: "" },
      { id: "winter-mongolia", title: "冬のモンゴルにも行ってみたい", memo: "", parentId: "mongolia", createdAt: at(6, 10), places: [], people: [], afterword: "" },
      { id: "letterpress", title: "活版印刷で小さな本をつくる", memo: "", parentId: "bookstore", createdAt: at(5, 12), places: [], people: [], afterword: "" },
      { id: "nighttrain", title: "夜行列車で知らない町へ行く", memo: "", parentId: null, createdAt: at(7, 1), places: [], people: [], afterword: "" }
    ],
    selections: [
      { id: "sel-mongolia", wantId: "mongolia", year, selectedAt: at(1, 7) },
      { id: "sel-bookstore", wantId: "bookstore", year, selectedAt: at(1, 9) },
      { id: "sel-pottery", wantId: "pottery", year, selectedAt: at(2, 3) },
      { id: "sel-camera", wantId: "camera", year, selectedAt: at(1, 20) }
    ],
    events: [
      { id: "event-mongolia-selected", selectionId: "sel-mongolia", type: "selected", at: at(1, 7), note: "" },
      { id: "event-bookstore-selected", selectionId: "sel-bookstore", type: "selected", at: at(1, 9), note: "" },
      { id: "event-pottery-selected", selectionId: "sel-pottery", type: "selected", at: at(2, 3), note: "" },
      { id: "event-pottery-achieved", selectionId: "sel-pottery", type: "achieved", at: at(6, 22), note: "" },
      { id: "event-camera-selected", selectionId: "sel-camera", type: "selected", at: at(1, 20), note: "" },
      { id: "event-camera-let-go", selectionId: "sel-camera", type: "let_go", at: at(7, 4), note: "いまは直すことより、祖父との写真を整理したいと思った。" }
    ]
  };
}

function emptyState() {
  return { version: 3, wants: [], selections: [], events: [] };
}

function migrateV2(saved) {
  const migrated = { version: 3, wants: saved.wants || [], selections: [], events: [] };
  (saved.selections || []).forEach(item => {
    const selectedAt = item.selectedAt || today();
    const selection = { id: item.id, wantId: item.wantId, year: item.year, selectedAt };
    migrated.selections.push(selection);
    migrated.events.push({ id: uid(), selectionId: item.id, type: "selected", at: selectedAt, note: "" });
    if (item.achievedAt || item.status === "achieved") {
      migrated.events.push({ id: uid(), selectionId: item.id, type: "achieved", at: item.achievedAt || today(), note: "" });
    }
    if (item.letGoAt || item.status === "let_go") {
      migrated.events.push({ id: uid(), selectionId: item.id, type: "let_go", at: item.letGoAt || today(), note: item.letGoReason || "" });
    }
  });
  return migrated;
}

function loadState() {
  const saved = window.HundredStorage.load();
  if (saved?.version === 3 && Array.isArray(saved.wants) && Array.isArray(saved.selections) && Array.isArray(saved.events)) {
    return saved;
  }
  if (saved?.version === 2 && Array.isArray(saved.wants) && Array.isArray(saved.selections)) {
    const migrated = migrateV2(saved);
    window.HundredStorage.save(migrated);
    return migrated;
  }
  return emptyState();
}

let state = loadState();
let activeView = "home";
let toastTimer;

function saveState() {
  window.HundredStorage.save(state);
  window.HundredCloud?.saveState(state).catch(error => {
    console.warn("Cloud save failed; the local copy is still available.", error);
  });
}

function getWant(id) { return state.wants.find(want => want.id === id); }
function currentSelection(wantId) { return state.selections.find(item => item.wantId === wantId && item.year === YEAR); }
function yearSelections() { return state.selections.filter(item => item.year === YEAR); }
function selectionEvents(selectionId) { return state.events.filter(event => event.selectionId === selectionId).sort((a, b) => new Date(a.at) - new Date(b.at)); }
function selectionStatus(selection) {
  const last = selectionEvents(selection.id).at(-1);
  return ({ selected: "active", reselected: "active", still_want: "active", achieved: "achieved", let_go: "let_go" })[last?.type] || "active";
}
function selectionHasEvent(selection, type) { return selectionEvents(selection.id).some(event => event.type === type); }
function addSelectionEvent(selectionId, type, note = "") {
  state.events.push({ id: uid(), selectionId, type, at: today(), note });
}
function selectedWants() {
  return yearSelections().map(selection => ({ want: getWant(selection.wantId), selection, status: selectionStatus(selection) })).filter(item => item.want && ["active", "achieved"].includes(item.status));
}
function candidates() {
  return state.wants.filter(want => {
    const selection = currentSelection(want.id);
    return !selection || selectionStatus(selection) === "let_go";
  });
}
function branchesOf(parentId) { return state.wants.filter(want => want.parentId === parentId); }
function seasonIndex() { return Math.min(3, Math.floor(new Date().getMonth() / 3)); }

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
}

function addHistory(want, selection) {
  const rows = [{ date: want.createdAt, text: "「やりたいかも」に追加" }];
  if (selection) {
    const eventText = { selected: `${selection.year}年のWishに選んだ`, reselected: "もう一度選んだ", still_want: "次の季節にも選んだ", achieved: "叶った！", let_go: "いったん手放した" };
    selectionEvents(selection.id).forEach(event => rows.push({ date: event.at, text: event.note ? `${eventText[event.type]} — ${event.note}` : eventText[event.type] }));
  }
  return rows.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function statusLabel(status) {
  return ({ active: "選んでいる", achieved: "叶った", let_go: "いったん手放した" })[status] || "やりたいかも";
}

function renderHome() {
  const selected = selectedWants();
  const pool = candidates();
  const allYear = yearSelections();
  $("#selection-count").textContent = allYear.length;
  $("#current-year-label").textContent = YEAR;
  $("#selected-year-label").textContent = YEAR;

  $("#selected-list").innerHTML = selected.map(({ want, status }, index) => {
    const branches = branchesOf(want.id).length;
    const facts = [...(want.places || []), ...(want.people || [])].length;
    return `<article class="wish-card ${status === "achieved" ? "is-achieved" : ""}" tabindex="0" role="button" data-wish-id="${want.id}">
      <div class="card-top"><span class="card-number">${String(index + 1).padStart(2, "0")}</span><span class="status-chip ${status}">${statusLabel(status)}</span></div>
      <h3>${escapeHtml(want.title)}</h3>
      <div class="card-meta">${branches ? `<span>↗ ${branches}件の派生</span>` : ""}${facts ? `<span>· ${facts}件の足跡</span>` : ""}</div>
      <span class="card-arrow">↗</span>
    </article>`;
  }).join("");

  $("#candidate-list").innerHTML = pool.map((want, index) => {
    const parent = want.parentId ? getWant(want.parentId) : null;
    return `<article class="candidate-row" tabindex="0" role="button" data-wish-id="${want.id}">
      <span class="candidate-index">${String(index + 1).padStart(2, "0")}</span>
      <div><h3>${escapeHtml(want.title)}</h3>${parent ? `<p class="candidate-origin">↳ ${escapeHtml(parent.title)} から</p>` : ""}</div>
    </article>`;
  }).join("");
  $("#selected-empty").hidden = selected.length > 0;
  $("#candidate-empty").hidden = pool.length > 0;
  $("#load-demo").hidden = state.wants.length > 0;
}

function renderSeason() {
  const currentSeason = seasonIndex();
  $("#season-page-label").textContent = SEASONS[currentSeason];
  $("#season-year-label").textContent = YEAR;
  $("#season-aside-label").textContent = SEASONS[currentSeason];
  $("#season-number").textContent = String(currentSeason + 1).padStart(2, "0");
  $$("#season-line i").forEach((item, index) => item.classList.toggle("active", index === currentSeason));
  const active = yearSelections().filter(item => selectionStatus(item) === "active").map(item => ({ selection: item, want: getWant(item.wantId) })).filter(item => item.want);
  const pool = candidates();
  $("#season-active-list").innerHTML = active.length ? active.map(({ want }) => choiceRow(want, true, "次の季節へ", "carry")).join("") : `<div class="review-empty">—</div>`;
  $("#season-candidate-list").innerHTML = pool.length ? pool.map(want => choiceRow(want, true, "今年のWishに選ぶ", "adopt")).join("") : `<div class="review-empty">—</div>`;
  updateSeasonCount();
}

function choiceRow(want, checked, label, group) {
  return `<label class="choice-row"><input type="checkbox" data-season-choice="${group}" value="${want.id}" ${checked ? "checked" : ""}><h3>${escapeHtml(want.title)}</h3><span class="choice-label">${label}</span></label>`;
}

function updateSeasonCount() {
  const carries = $$('[data-season-choice="carry"]:checked').length;
  const adopts = $$('[data-season-choice="adopt"]:checked').length;
  const achieved = yearSelections().filter(item => selectionStatus(item) === "achieved").length;
  $("#season-selected-count").textContent = carries + adopts + achieved;
}

function renderReview() {
  const selections = yearSelections();
  const achieved = selections.filter(item => selectionHasEvent(item, "achieved")).map(item => ({ selection: item, want: getWant(item.wantId), event: selectionEvents(item.id).find(event => event.type === "achieved") })).filter(item => item.want);
  const places = [...new Set(achieved.flatMap(item => item.want.places || []))];
  const people = [...new Set(achieved.flatMap(item => item.want.people || []))];
  const branches = state.wants.filter(want => want.parentId && getWant(want.parentId));
  const newWants = state.wants.filter(want => new Date(want.createdAt).getFullYear() === YEAR).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const yearHistory = state.wants.flatMap(want => {
    const selection = currentSelection(want.id);
    return addHistory(want, selection).map(item => ({ ...item, want }));
  }).filter(item => new Date(item.date).getFullYear() === YEAR).sort((a, b) => new Date(b.date) - new Date(a.date));
  $("#review-year-label").textContent = YEAR;
  $("#review-stats").innerHTML = [
    [selections.length, "WISHES"], [achieved.length, "FOOTPRINTS"], [places.length, "PLACES"], [people.length, "PEOPLE"]
  ].map(([value, label]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join("");

  $("#achieved-timeline").innerHTML = achieved.length ? achieved.sort((a, b) => new Date(a.event.at) - new Date(b.event.at)).map(({ want, event }) => `
    <article class="timeline-item" data-wish-id="${want.id}" tabindex="0" role="button"><span class="timeline-date">${formatHistoryDate(event.at)}</span><i class="timeline-dot"></i><div class="timeline-copy"><h3>${escapeHtml(want.title)}</h3>${want.afterword ? `<p>${escapeHtml(want.afterword)}</p>` : ""}</div><span class="review-row-arrow" aria-hidden="true">→</span></article>`).join("") : `<div class="review-empty">—</div>`;

  $("#review-places").innerHTML = places.length ? places.map(place => `<span>${escapeHtml(place)}</span>`).join("") : `<span class="review-empty-inline">—</span>`;
  $("#review-people").innerHTML = people.length ? people.map(person => `<span>${escapeHtml(person)}</span>`).join("") : `<span class="review-empty-inline">—</span>`;

  $("#branch-map").innerHTML = branches.length ? branches.map(branch => {
    const parent = getWant(branch.parentId);
    return `<article class="branch-card" data-wish-id="${branch.id}" tabindex="0" role="button"><span class="from">${escapeHtml(parent.title)}</span><span class="branch-arrow">→</span><p class="to">${escapeHtml(branch.title)}</p></article>`;
  }).join("") : `<div class="review-empty">—</div>`;

  $("#new-wants-list").innerHTML = newWants.length ? newWants.map(want => `<article class="review-row" data-wish-id="${want.id}" tabindex="0" role="button"><time>${formatHistoryDate(want.createdAt)}</time><h3>${escapeHtml(want.title)}</h3><span aria-hidden="true">→</span></article>`).join("") : `<div class="review-empty">—</div>`;

  $("#year-history-list").innerHTML = yearHistory.length ? yearHistory.map(item => `<li><time>${formatHistoryDate(item.date)}</time><div><span>${escapeHtml(item.want.title)}</span><p>${escapeHtml(item.text)}</p></div></li>`).join("") : `<li class="review-empty">—</li>`;
}

function renderAll() {
  renderHome();
  renderSeason();
  renderReview();
}

function setView(name) {
  if (!["home", "season", "review"].includes(name)) return;
  activeView = name;
  $$(".view").forEach(view => view.classList.toggle("is-active", view.dataset.view === name));
  $$(".nav-link").forEach(link => link.classList.toggle("is-active", link.dataset.viewLink === name));
  $("#mobile-nav").classList.remove("is-open");
  $("#menu-button").setAttribute("aria-expanded", "false");
  if (name === "season") renderSeason();
  if (name === "review") renderReview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function addCandidate(title, parentId = null) {
  const want = { id: uid(), title, memo: "", parentId, createdAt: today(), places: [], people: [], afterword: "" };
  state.wants.push(want);
  saveState();
  renderAll();
  showToast("「やりたいかも」に残しました");
  return want;
}

function openDetail(wantId) {
  const want = getWant(wantId);
  if (!want) return;
  const selection = currentSelection(wantId);
  const status = selection ? selectionStatus(selection) : null;
  const parent = want.parentId ? getWant(want.parentId) : null;
  const branches = branchesOf(wantId);
  const history = addHistory(want, selection);
  const detail = $("#detail-content");
  detail.innerHTML = `
    <header class="detail-hero">
      <span class="detail-status ${status || "candidate"}">${statusLabel(status)}</span>
      <h2 class="detail-title">${escapeHtml(want.title)}</h2>
      <p class="detail-date">${selection ? `${selection.year} · ${formatDate(selection.selectedAt)}に選択` : `${formatDate(want.createdAt)}に追加`}</p>
      ${parent ? `<button class="detail-origin" data-open-wish="${parent.id}">FROM · ${escapeHtml(parent.title)} <span>→</span></button>` : ""}
      ${status === "active" ? `<div class="detail-actions"><button class="primary-button" data-complete-wish="${want.id}">叶った！</button></div>` : ""}
    </header>

    <section class="detail-section detail-memo" aria-labelledby="detail-memo-heading">
      <p class="detail-kicker">MEMO</p>
      <div class="detail-section-heading">
        <h3 id="detail-memo-heading">メモ</h3>
        <button class="detail-edit-link" data-edit-memo="${want.id}">EDIT</button>
      </div>
      ${want.memo ? `<p class="detail-prose" data-memo-copy>${escapeHtml(want.memo)}</p>` : ""}
      <form class="detail-edit-form" data-memo-form="${want.id}" data-memo-editor hidden>
        <textarea maxlength="240" aria-label="メモ">${escapeHtml(want.memo || "")}</textarea>
        <button type="submit">保存</button>
      </form>
    </section>

    <section class="detail-section detail-footprints" aria-labelledby="detail-footprints-heading">
      <p class="detail-kicker">FOOTPRINTS</p>
      <h3 id="detail-footprints-heading">そのWishに残ったもの</h3>
      ${want.afterword ? `<p class="detail-afterword">${escapeHtml(want.afterword)}</p>` : ""}
      <div class="detail-footprint-grid">
        <div class="detail-subsection">
          <h4>Places</h4>
          ${(want.places || []).length ? `<div class="detail-fact-list">${want.places.map(item => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
          <button class="detail-add-link" data-reveal-form="place">＋ 場所を追加</button>
          <form class="inline-form" data-fact-form="places" data-want-id="${want.id}" data-inline-editor="place" hidden>
            <input maxlength="60" aria-label="場所" placeholder="場所を入力"><button aria-label="場所を保存">＋</button>
          </form>
        </div>
        <div class="detail-subsection">
          <h4>People</h4>
          ${(want.people || []).length ? `<div class="detail-fact-list">${want.people.map(item => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
          <button class="detail-add-link" data-reveal-form="person">＋ 人を追加</button>
          <form class="inline-form" data-fact-form="people" data-want-id="${want.id}" data-inline-editor="person" hidden>
            <input maxlength="60" aria-label="人" placeholder="名前や関係を入力"><button aria-label="人を保存">＋</button>
          </form>
        </div>
      </div>
    </section>

    <section class="detail-section detail-branches" aria-labelledby="detail-branches-heading">
      <p class="detail-kicker">FROM THIS WISH</p>
      <h3 id="detail-branches-heading">ここから生まれた</h3>
      ${branches.length ? `<div class="detail-branch-list">${branches.map(item => `<article class="detail-branch-row" tabindex="0" role="button" data-wish-id="${item.id}"><span>${escapeHtml(item.title)}</span><b aria-hidden="true">→</b></article>`).join("")}</div>` : ""}
      <button class="detail-add-link" data-reveal-form="branch">＋ やりたいかもを追加</button>
      <form class="inline-form" data-branch-form="${want.id}" data-inline-editor="branch" hidden>
        <input maxlength="80" aria-label="やりたいかも" placeholder="やりたいことを入力"><button aria-label="やりたいかもを保存">＋</button>
      </form>
    </section>

    <section class="detail-section detail-history" aria-labelledby="detail-history-heading">
      <p class="detail-kicker">HISTORY</p>
      <h3 id="detail-history-heading">履歴</h3>
      <ul class="history-list">${history.map(item => `<li><time>${formatHistoryDate(item.date)}</time><span>${escapeHtml(item.text)}</span></li>`).join("")}</ul>
    </section>
    ${!selection ? `<div class="detail-danger"><button class="danger-link" data-delete-wish="${want.id}">この「やりたいかも」を削除</button></div>` : ""}
  `;
  const dialog = $("#detail-dialog");
  if (!dialog.open) dialog.showModal();
}

function openComplete(wantId) {
  const want = getWant(wantId);
  const selection = currentSelection(wantId);
  if (!want || !selection) return;
  if ($("#detail-dialog").open) $("#detail-dialog").close();
  $("#complete-title").textContent = want.title;
  $("#complete-wish-id").value = want.id;
  ["#complete-place", "#complete-person", "#complete-note", "#complete-branch"].forEach(id => $(id).value = "");
  $("#complete-dialog").showModal();
}

function completeWish(wantId, extras = {}) {
  const want = getWant(wantId);
  const selection = currentSelection(wantId);
  if (!want || !selection) return;
  addSelectionEvent(selection.id, "achieved");
  if (extras.place) want.places = [...new Set([...(want.places || []), extras.place])];
  if (extras.person) want.people = [...new Set([...(want.people || []), extras.person])];
  if (extras.note) want.afterword = extras.note;
  if (extras.branch) addCandidate(extras.branch, wantId);
  saveState();
  renderAll();
  showToast("叶った日を足跡に残しました");
}

function saveSeasonUpdate() {
  const kept = new Set($$('[data-season-choice="carry"]:checked').map(input => input.value));
  const adopted = $$('[data-season-choice="adopt"]:checked').map(input => input.value);
  const newAdoptions = adopted.filter(wantId => !currentSelection(wantId)).length;
  if (yearSelections().length + newAdoptions > 100) {
    showToast("今年選べる Wish は100件までです");
    return;
  }
  yearSelections().filter(item => selectionStatus(item) === "active").forEach(selection => {
    if (!kept.has(selection.wantId)) {
      addSelectionEvent(selection.id, "let_go", "季節の見直しで、いったん選ばないことにした。");
    } else {
      addSelectionEvent(selection.id, "still_want");
    }
  });
  adopted.forEach(wantId => {
    const existing = currentSelection(wantId);
    if (existing && selectionStatus(existing) === "let_go") {
      addSelectionEvent(existing.id, "reselected");
      return;
    }
    const selection = { id: uid(), wantId, year: YEAR, selectedAt: today() };
    state.selections.push(selection);
    addSelectionEvent(selection.id, "selected");
  });
  saveState();
  renderAll();
  setView("home");
  showToast("次の季節に持っていく Wish を更新しました");
}

$("#quick-add-form").addEventListener("submit", event => {
  event.preventDefault();
  const input = $("#quick-add-input");
  const title = input.value.trim();
  if (!title) return;
  addCandidate(title);
  input.value = "";
});

document.addEventListener("click", event => {
  const viewLink = event.target.closest("[data-view-link]");
  if (viewLink) {
    event.preventDefault();
    setView(viewLink.dataset.viewLink);
    return;
  }
  const openWish = event.target.closest("[data-open-wish]");
  if (openWish) {
    openDetail(openWish.dataset.openWish);
    return;
  }
  const card = event.target.closest("[data-wish-id]");
  if (card && !event.target.closest("button, input")) {
    openDetail(card.dataset.wishId);
    return;
  }
  const close = event.target.closest("[data-close-dialog]");
  if (close) $("#detail-dialog").close();
  const complete = event.target.closest("[data-complete-wish]");
  if (complete) openComplete(complete.dataset.completeWish);
  const editMemo = event.target.closest("[data-edit-memo]");
  if (editMemo) {
    const editor = $("[data-memo-editor]", $("#detail-content"));
    if (editor) {
      editor.hidden = false;
      const memoCopy = $("[data-memo-copy]", $("#detail-content"));
      if (memoCopy) memoCopy.hidden = true;
      editMemo.hidden = true;
      $("textarea", editor)?.focus();
    }
  }
  const revealForm = event.target.closest("[data-reveal-form]");
  if (revealForm) {
    const scope = revealForm.closest(".detail-subsection, .detail-section");
    const editor = scope?.querySelector(`[data-inline-editor="${revealForm.dataset.revealForm}"]`);
    if (editor) {
      editor.hidden = false;
      revealForm.hidden = true;
      $("input", editor)?.focus();
    }
  }
  const remove = event.target.closest("[data-delete-wish]");
  if (remove && confirm("この「やりたいかも」を削除しますか？")) {
    state.wants.forEach(want => { if (want.parentId === remove.dataset.deleteWish) want.parentId = null; });
    state.wants = state.wants.filter(want => want.id !== remove.dataset.deleteWish);
    saveState(); $("#detail-dialog").close(); renderAll(); showToast("削除しました");
  }
});

document.addEventListener("keydown", event => {
  const card = event.target.closest("[data-wish-id]");
  if (card && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openDetail(card.dataset.wishId); }
});

$("#detail-content").addEventListener("submit", event => {
  const memoForm = event.target.closest("[data-memo-form]");
  if (memoForm) {
    event.preventDefault();
    const want = getWant(memoForm.dataset.memoForm);
    if (!want) return;
    want.memo = $("textarea", memoForm).value.trim();
    saveState();
    renderAll();
    openDetail(want.id);
    showToast("メモを保存しました");
    return;
  }
  const factForm = event.target.closest("[data-fact-form]");
  if (factForm) {
    event.preventDefault();
    const want = getWant(factForm.dataset.wantId);
    const value = $("input", factForm).value.trim();
    const field = factForm.dataset.factForm;
    if (!want || !value || !["places", "people"].includes(field)) return;
    want[field] = [...new Set([...(want[field] || []), value])];
    saveState();
    renderAll();
    openDetail(want.id);
    showToast(field === "places" ? "場所を追加しました" : "人を追加しました");
    return;
  }
  const form = event.target.closest("[data-branch-form]");
  if (!form) return;
  event.preventDefault();
  const input = $("input", form);
  const title = input.value.trim();
  if (!title) return;
  const parentId = form.dataset.branchForm;
  addCandidate(title, parentId);
  openDetail(parentId);
});

$("#complete-form").addEventListener("submit", event => {
  event.preventDefault();
  const skip = event.submitter?.hasAttribute("data-skip-complete");
  const extras = skip ? {} : {
    place: $("#complete-place").value.trim(), person: $("#complete-person").value.trim(),
    note: $("#complete-note").value.trim(), branch: $("#complete-branch").value.trim()
  };
  completeWish($("#complete-wish-id").value, extras);
  $("#complete-dialog").close();
});

document.addEventListener("change", event => {
  if (event.target.matches("[data-season-choice]")) updateSeasonCount();
});

$("#save-season").addEventListener("click", saveSeasonUpdate);
$("#menu-button").addEventListener("click", event => {
  const open = event.currentTarget.getAttribute("aria-expanded") === "true";
  event.currentTarget.setAttribute("aria-expanded", String(!open));
  $("#mobile-nav").classList.toggle("is-open", !open);
});

$("#reset-demo").addEventListener("click", () => {
  const cloudEnabled = window.HundredCloud?.getStatus().enabled;
  const scope = cloudEnabled ? "クラウドと同期端末" : "この端末";
  if (!confirm(`${scope}に保存したThe Hundredのデータをすべて消しますか？`)) return;
  window.HundredStorage.clear();
  state = emptyState();
  saveState();
  renderAll();
  setView("home");
  showToast("データを消去しました");
});

$("#load-demo").addEventListener("click", () => {
  state = demoState();
  saveState();
  renderAll();
  showToast("デモを読み込みました");
});

$("#detail-dialog").addEventListener("click", event => {
  if (event.target === $("#detail-dialog")) $("#detail-dialog").close();
});

function setAccountNotice(message, isError = false) {
  const notice = $("#account-notice");
  notice.textContent = message || "";
  notice.classList.toggle("is-error", isError);
}

function updateCloudStatus(detail = window.HundredCloud?.getStatus() || { status: "local" }) {
  const labels = { local: "LOCAL", connecting: "SYNC…", syncing: "SYNC…", guest: "GUEST", account: "SYNCED", error: "OFFLINE" };
  const copy = {
    local: "この端末に保存しています。",
    connecting: "クラウドへ接続しています。",
    syncing: "変更をクラウドへ保存しています。",
    guest: "Guestとしてクラウド同期中です。",
    account: "アカウントでクラウド同期中です。",
    error: "クラウドへ接続できません。端末内のデータはそのまま利用できます。"
  };
  $("#sync-label").textContent = labels[detail.status] || "LOCAL";
  document.body.dataset.cloudStatus = detail.status || "local";
  $("#cloud-status-copy").textContent = copy[detail.status] || copy.local;
  $("#cloud-unavailable").hidden = detail.status !== "local" && detail.status !== "error";
  $("#cloud-account-content").hidden = detail.status === "local" || detail.status === "error" || detail.status === "connecting";
  if (detail.error) setAccountNotice(detail.error, true);
}

async function refreshAccountPanel() {
  const cloud = window.HundredCloud;
  if (!cloud?.getStatus().enabled) return;
  try {
    const summary = await cloud.accountSummary();
    if (!summary.enabled) return;
    const { user, profile, privacy } = summary;
    $("#account-kind").textContent = user.is_anonymous ? "GUEST" : "ACCOUNT";
    $("#account-email").textContent = user.email || "ログインなしで利用中";
    $("#link-email-form").hidden = !user.is_anonymous;
    $(".account-signin").hidden = !user.is_anonymous;
    $("#display-name").value = profile.display_name || "";
    $("#share-code").textContent = profile.share_code || "—";
    $("#friends-can-view").checked = privacy.friends_can_view;
    $("#show-achieved-date").checked = privacy.show_achieved_date;
    await renderConnections();
  } catch (error) {
    setAccountNotice(error.message, true);
  }
}

async function renderConnections() {
  const list = $("#connection-list");
  const connections = await window.HundredCloud.listConnections();
  if (!connections.length) {
    list.innerHTML = `<p class="connection-empty">まだ接続はありません。</p>`;
    return;
  }
  list.innerHTML = connections.map(item => {
    const name = escapeHtml(item.display_name || "Guest");
    if (item.status === "approved") {
      return `<article class="connection-row"><div><strong>${name}</strong><span>APPROVED</span></div><button data-view-friend="${item.other_user_id}" data-friend-name="${name}">見る →</button></article>`;
    }
    if (item.status === "pending" && item.direction === "received") {
      return `<article class="connection-row"><div><strong>${name}</strong><span>REQUEST</span></div><div class="request-actions"><button data-respond-request="${item.friendship_id}" data-approve="true">承認</button><button data-respond-request="${item.friendship_id}" data-approve="false">拒否</button></div></article>`;
    }
    const stateLabel = item.status === "pending" ? "申請中" : "見送り";
    return `<article class="connection-row"><div><strong>${name}</strong><span>${stateLabel}</span></div></article>`;
  }).join("");
}

async function openFriendWishes(friendId, friendName) {
  try {
    setAccountNotice("");
    const wishes = await window.HundredCloud.friendWishes(friendId);
    $("#friend-wishes-name").textContent = friendName;
    $("#friend-wishes-list").innerHTML = wishes.length ? wishes.map(wish => `
      <article class="friend-wish-row"><h4>${escapeHtml(wish.title)}</h4><span>${wish.achieved ? `叶った${wish.achieved_at ? ` · ${formatDate(wish.achieved_at)}` : ""}` : "選んでいる"}</span></article>
    `).join("") : `<p class="connection-empty">表示できるWishはありません。</p>`;
    $("#friend-wishes-section").hidden = false;
    $("#connection-list").closest(".account-section").hidden = true;
  } catch (error) {
    setAccountNotice(error.message, true);
  }
}

async function runAccountAction(action, successMessage) {
  setAccountNotice("");
  try {
    await action();
    setAccountNotice(successMessage);
    await refreshAccountPanel();
  } catch (error) {
    setAccountNotice(error.message, true);
  }
}

document.addEventListener("click", event => {
  if (event.target.closest("[data-open-account]")) {
    $("#mobile-nav").classList.remove("is-open");
    $("#menu-button").setAttribute("aria-expanded", "false");
    $("#account-dialog").showModal();
    setAccountNotice("");
    refreshAccountPanel();
    return;
  }
  if (event.target.closest("[data-close-account]")) $("#account-dialog").close();
  const response = event.target.closest("[data-respond-request]");
  if (response) {
    runAccountAction(
      () => window.HundredCloud.respondToRequest(response.dataset.respondRequest, response.dataset.approve === "true"),
      response.dataset.approve === "true" ? "閲覧申請を承認しました。" : "閲覧申請を見送りました。"
    );
  }
  const friend = event.target.closest("[data-view-friend]");
  if (friend) openFriendWishes(friend.dataset.viewFriend, friend.dataset.friendName);
});

$("#account-dialog").addEventListener("click", event => {
  if (event.target === $("#account-dialog")) $("#account-dialog").close();
});

$("#link-email-form").addEventListener("submit", event => {
  event.preventDefault();
  runAccountAction(() => window.HundredCloud.linkEmail($("#link-email").value.trim()), "確認メールを送信しました。リンクを開いてください。");
});

$("#password-form").addEventListener("submit", event => {
  event.preventDefault();
  runAccountAction(() => window.HundredCloud.setPassword($("#account-password").value), "パスワードを設定しました。");
});

$("#signin-form").addEventListener("submit", event => {
  event.preventDefault();
  runAccountAction(
    () => window.HundredCloud.signIn($("#signin-email").value.trim(), $("#signin-password").value),
    "ログインしました。"
  );
});

$("#profile-form").addEventListener("submit", event => {
  event.preventDefault();
  runAccountAction(() => window.HundredCloud.updateProfile($("#display-name").value.trim()), "表示名を保存しました。");
});

$("#friend-request-form").addEventListener("submit", event => {
  event.preventDefault();
  const input = $("#friend-code");
  runAccountAction(() => window.HundredCloud.requestFriend(input.value.trim()), "閲覧申請を送りました。");
  input.value = "";
});

$("#friends-can-view").addEventListener("change", event => {
  runAccountAction(() => window.HundredCloud.updatePrivacy({ friends_can_view: event.target.checked }), "公開範囲を更新しました。");
});

$("#show-achieved-date").addEventListener("change", event => {
  runAccountAction(() => window.HundredCloud.updatePrivacy({ show_achieved_date: event.target.checked }), "公開範囲を更新しました。");
});

$("#copy-share-code").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("#share-code").textContent);
    setAccountNotice("Share Codeをコピーしました。");
  } catch (error) {
    setAccountNotice("コピーできませんでした。コードを選択してコピーしてください。", true);
  }
});

$("#friend-wishes-back").addEventListener("click", () => {
  $("#friend-wishes-section").hidden = true;
  $("#connection-list").closest(".account-section").hidden = false;
});

window.addEventListener("hundred:cloud-status", event => {
  const detail = event.detail || {};
  updateCloudStatus(detail);
  if (detail.state?.version === 3) {
    state = detail.state;
    renderAll();
    if (detail.source === "cloud") showToast("クラウドのデータを読み込みました");
    if (detail.source === "cloud-refresh") showToast("別の端末の変更を同期しました");
    if (detail.source === "migration") showToast("この端末のデータをクラウドへ移行しました");
  }
  if ($("#account-dialog").open && detail.ready) refreshAccountPanel();
});

renderAll();
const requestedView = PAGE_PARAMS.get("view");
if (requestedView) setView(requestedView);
updateCloudStatus();
window.HundredCloud?.bootstrap();

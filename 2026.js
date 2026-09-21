const YEAR = new Date().getFullYear();
const SEASONS = ["WINTER", "SPRING", "SUMMER", "AUTUMN"];

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
function candidates() { return state.wants.filter(want => !currentSelection(want.id)); }
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
      <button class="candidate-select" data-quick-select="${want.id}" aria-label="${escapeHtml(want.title)}を今年のWishに選ぶ">＋</button>
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
  $("#season-active-list").innerHTML = active.length ? active.map(({ want }) => choiceRow(want, true, "次の季節へ", "carry")).join("") : `<div class="review-empty">いま継続中の Wish はありません。</div>`;
  $("#season-candidate-list").innerHTML = pool.length ? pool.map(want => choiceRow(want, false, "今年の Wish に選ぶ", "adopt")).join("") : `<div class="review-empty">「やりたいかも」はまだありません。</div>`;
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
  const letGo = selections.filter(item => selectionHasEvent(item, "let_go")).map(item => ({ selection: item, want: getWant(item.wantId), event: [...selectionEvents(item.id)].reverse().find(event => event.type === "let_go") })).filter(item => item.want);
  const places = [...new Set(achieved.flatMap(item => item.want.places || []))];
  const people = [...new Set(achieved.flatMap(item => item.want.people || []))];
  const branches = state.wants.filter(want => want.parentId && getWant(want.parentId));
  $("#review-year-label").textContent = YEAR;
  $("#review-stats").innerHTML = [
    [selections.length, "WISHES CHOSEN"], [achieved.length, "ACHIEVED"], [places.length, "PLACES"], [branches.length, "NEW POSSIBILITIES"]
  ].map(([value, label]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join("");

  $("#achieved-timeline").innerHTML = achieved.length ? achieved.sort((a, b) => new Date(a.event.at) - new Date(b.event.at)).map(({ want, event }) => `
    <article class="timeline-item"><span class="timeline-date">${formatMonth(event.at)}</span><i class="timeline-dot"></i><div class="timeline-copy"><h3>${escapeHtml(want.title)}</h3><p>${escapeHtml(want.afterword || "この日のことを、足跡として残しました。")}</p></div></article>`).join("") : `<div class="review-empty">叶った Wish は、ここに少しずつ並びます。</div>`;

  $("#place-cloud").innerHTML = `<h3>${places.length ? "歩いた場所" : "これから残る場所"}</h3><div class="place-tags">${places.length ? places.map(place => `<span>${escapeHtml(place)}</span>`).join("") : "<span>Wish が動いた場所だけを残します</span>"}${people.map(person => `<span>人 · ${escapeHtml(person)}</span>`).join("")}</div>`;

  $("#branch-map").innerHTML = branches.length ? branches.map(branch => {
    const parent = getWant(branch.parentId);
    return `<article class="branch-card" data-wish-id="${branch.id}" tabindex="0" role="button"><span class="from">FROM THIS WISH</span><h3>${escapeHtml(parent.title)}</h3><div class="branch-arrow">↓</div><p class="to">${escapeHtml(branch.title)}</p></article>`;
  }).join("") : `<div class="review-empty">Wish から新しい「やりたい」が生まれると、ここにつながります。</div>`;

  $("#letgo-list").innerHTML = letGo.length ? letGo.map(({ want, selection, event }) => `<article class="letgo-item" data-wish-id="${want.id}" tabindex="0" role="button"><h3>${escapeHtml(want.title)}</h3><p>${escapeHtml(event.note || "今はいったん選ばない")}${selectionStatus(selection) === "active" ? " · 再び選択中" : ""}</p></article>`).join("") : `<div class="review-empty">手放した Wish も、失敗ではなく選択の記録です。</div>`;
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

function selectWant(wantId) {
  if (currentSelection(wantId)) return;
  if (yearSelections().length >= 100) {
    showToast("今年選べる Wish は100件までです");
    return;
  }
  const selection = { id: uid(), wantId, year: YEAR, selectedAt: today() };
  state.selections.push(selection);
  addSelectionEvent(selection.id, "selected");
  saveState();
  renderAll();
  showToast("今年の Wish に選びました");
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
    <span class="detail-status">${statusLabel(status)}</span>
    <h2 class="detail-title">${escapeHtml(want.title)}</h2>
    <p class="detail-date">${selection ? `${selection.year}年 · ${formatDate(selection.selectedAt)}に選択` : `${formatDate(want.createdAt)}に思いついた`}</p>
    <div class="detail-actions">
      ${!selection ? `<button class="primary-button" data-select-wish="${want.id}">今年の Wish に選ぶ</button>` : ""}
      ${status === "active" ? `<button class="primary-button" data-complete-wish="${want.id}">叶った！</button><button class="secondary-button" data-letgo-wish="${want.id}">いったん手放す</button>` : ""}
      ${status === "let_go" ? `<button class="primary-button" data-reselect-wish="${want.id}">もう一度選ぶ</button>` : ""}
    </div>
    ${parent ? `<section class="detail-section"><h3>きっかけ</h3><p>${escapeHtml(parent.title)} から</p></section>` : ""}
    <section class="detail-section"><h3>メモ</h3><p>${escapeHtml(want.memo || "まだありません。")}</p></section>
    <section class="detail-section"><h3>場所・人</h3><div class="detail-facts">${[...(want.places || []).map(item => `場所 · ${item}`), ...(want.people || []).map(item => `人 · ${item}`)].map(item => `<span>${escapeHtml(item)}</span>`).join("") || "<p>まだありません。</p>"}</div></section>
    <section class="detail-section"><h3>ここから生まれた</h3>
      <div class="detail-facts">${branches.map(item => `<span>${escapeHtml(item.title)}</span>`).join("") || "<p>まだありません。</p>"}</div>
      <form class="inline-form" data-branch-form="${want.id}"><input maxlength="80" placeholder="ここから生まれた、やりたいかも"><button aria-label="Branchを追加">＋</button></form>
    </section>
    <section class="detail-section"><h3>履歴</h3><ul class="history-list">${history.map(item => `<li><time>${formatDate(item.date)}</time><span>${escapeHtml(item.text)}</span></li>`).join("")}</ul></section>
    ${!selection ? `<section class="detail-section"><button class="danger-link" data-delete-wish="${want.id}">この「やりたいかも」を削除</button></section>` : ""}
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

function letGoWish(wantId) {
  const selection = currentSelection(wantId);
  if (!selection || selectionStatus(selection) !== "active") return;
  const reason = prompt("今はいったん選ばない理由（任意）") || "";
  addSelectionEvent(selection.id, "let_go", reason.trim());
  saveState();
  $("#detail-dialog").close();
  renderAll();
  showToast("選んだ歴史を残したまま、手放しました");
}

function reselectWish(wantId) {
  const selection = currentSelection(wantId);
  if (!selection || selectionStatus(selection) !== "let_go") return;
  addSelectionEvent(selection.id, "reselected");
  saveState();
  $("#detail-dialog").close();
  renderAll();
  showToast("今年の Wish に戻しました");
}

function saveSeasonUpdate() {
  const kept = new Set($$('[data-season-choice="carry"]:checked').map(input => input.value));
  const adopted = $$('[data-season-choice="adopt"]:checked').map(input => input.value);
  if (yearSelections().length + adopted.length > 100) {
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
  const quickSelect = event.target.closest("[data-quick-select]");
  if (quickSelect) {
    selectWant(quickSelect.dataset.quickSelect);
    return;
  }
  const card = event.target.closest("[data-wish-id]");
  if (card && !event.target.closest("button, input")) {
    openDetail(card.dataset.wishId);
    return;
  }
  const close = event.target.closest("[data-close-dialog]");
  if (close) $("#detail-dialog").close();
  const select = event.target.closest("[data-select-wish]");
  if (select) { selectWant(select.dataset.selectWish); $("#detail-dialog").close(); }
  const complete = event.target.closest("[data-complete-wish]");
  if (complete) openComplete(complete.dataset.completeWish);
  const letGo = event.target.closest("[data-letgo-wish]");
  if (letGo) letGoWish(letGo.dataset.letgoWish);
  const reselect = event.target.closest("[data-reselect-wish]");
  if (reselect) reselectWish(reselect.dataset.reselectWish);
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
  if (!confirm("この端末に保存したThe Hundredのデータをすべて消しますか？")) return;
  window.HundredStorage.clear();
  state = emptyState();
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

renderAll();
const requestedView = new URLSearchParams(location.search).get("view");
if (requestedView) setView(requestedView);

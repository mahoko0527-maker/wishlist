// ========== Supabase 設定 ==========
const SUPABASE_URL = 'https://owoevjklzwaqqqjcgfhj.supabase.co';  // ← ここに Project URL を貼る
const SUPABASE_ANON_KEY = 'sb_publishable_nwQq6MkYG54IMh9wZbortg_SVYtxxHl'; // ← ここに anon キーを貼る

// Supabaseのグローバル名と衝突しないようにローカル名を sb にする
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========== グローバル状態 ==========
const MAX_ITEMS = 100;
let boardId = '';
let authorId = '';
let state = { todo: [], done: [] };
let channel = null;
let filterName = 'all';
let mapMode = 'self'; // self or all
let visitedSelf = new Set();
let visitedAny = new Set();

const nameFilter = document.getElementById('name-filter');
const whoInput = document.getElementById('who');
const currentNameLabel = document.getElementById('current-name');
const maxCountLabel = document.getElementById('max-count');

const form = document.getElementById('wish-form');
const titleInput = document.getElementById('title');
const noteInput = document.getElementById('note');
const todoListEl = document.getElementById('todo-list');
const doneListEl = document.getElementById('done-list');
const todoEmpty = document.getElementById('todo-empty');
const doneEmpty = document.getElementById('done-empty');
const todoCount = document.getElementById('todo-count');
const myIdDisplay = document.getElementById('myid-display');
const myIdInput = document.getElementById('myid-input');
const copyMyIdBtn = document.getElementById('copy-myid');
const mainPage = document.getElementById('main-page');
const mapPage = document.getElementById('map-page');
const menuToggle = document.getElementById('menu-toggle');
const menu = document.getElementById('menu');
const mapSvgContainer = document.getElementById('map-svg-container');
const mapModeLabel = document.getElementById('map-mode-label');
const mapModeSelfBtn = document.getElementById('map-mode-self');
const mapModeAllBtn = document.getElementById('map-mode-all');

let mapSvgRoot = null; // cached SVG root for the Japan map

// ========== ユーティリティ ==========
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

function generateId(len = 8) {
  const fallback = () => (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)).slice(0, len);
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID().replace(/-/g, '').slice(0, len);
    } catch (e) {
      // file:// など非セキュア環境で失敗する場合に備える
      return fallback();
    }
  }
  return fallback();
}

function getBoardId() {
  const params = new URLSearchParams(location.search);
  let id = params.get('board');
  if (!id) {
    id = generateId(10);
    history.replaceState(null, '', `?board=${id}`);
  }
  return id;
}

function getAuthorId() {
  return localStorage.getItem('author-2026') || '';
}

function setAuthorId(id) {
  authorId = id;
  localStorage.setItem('author-2026', id);
  updateMyIdUI();
  render();
}

function updateMyIdUI() {
  const currentDiv = document.getElementById('myid-current');
  const formDiv = document.getElementById('myid-form');
  
  if (authorId) {
    if (myIdDisplay) myIdDisplay.value = authorId;
    if (currentDiv) currentDiv.style.display = 'block';
    if (formDiv) formDiv.style.display = 'none';
  } else {
    if (currentDiv) currentDiv.style.display = 'none';
    if (formDiv) formDiv.style.display = 'block';
  }
  
  if (myIdInput) myIdInput.value = '';
}

// ========== データベース操作 ==========
async function loadWishes() {
  const { data, error } = await sb
    .from('wishes')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Load error:', error);
    return;
  }

  state.todo = data.filter(w => !w.done);
  state.done = data.filter(w => w.done);
  render();
}

async function addWish(title, note, who) {
  // その人の全投稿（達成済み含む）をカウント
  const { count, error: countError } = await sb
    .from('wishes')
    .select('*', { count: 'exact', head: true })
    .eq('board_id', boardId)
    .eq('author', who);

  if (countError) {
    console.error('Count error:', countError);
    return;
  }

  if (count >= MAX_ITEMS) {
    alert(`「${who}」さんは100件に達しました。達成済みから削除してください。`);
    return;
  }

  const { error } = await sb.from('wishes').insert({
    board_id: boardId,
    title,
    note,
    author: who,
    done: false
  });

  if (error) {
    console.error('Add error:', error);
  } else {
    await loadWishes(); // 追加直後に再読込して表示を確実に更新
  }
}

async function completeWish(id, feedback) {
  const { error } = await sb
    .from('wishes')
    .update({ done: true, feedback })
    .eq('id', id);

  if (error) {
    console.error('Complete error:', error);
  } else {
    await loadWishes(); // 達成後に再読込
  }
}

async function deleteWish(id) {
  const { error } = await sb.from('wishes').delete().eq('id', id);
  if (error) {
    console.error('Delete error:', error);
  } else {
    await loadWishes(); // 削除後に再読込
  }
}

async function undoWish(id) {
  const { error } = await sb
    .from('wishes')
    .update({ done: false, feedback: null })
    .eq('id', id);

  if (error) {
    console.error('Undo error:', error);
  } else {
    await loadWishes(); // 戻したら再読込
  }
}

// ========== 参加・いいね機能 ==========
async function addParticipant(wishId, userName) {
  const wish = [...state.todo, ...state.done].find(w => w.id === wishId);
  if (!wish) return;

  const participants = JSON.parse(wish.participants || '[]');
  if (!participants.includes(userName)) {
    participants.push(userName);
  }

  const { error } = await sb
    .from('wishes')
    .update({ participants: JSON.stringify(participants) })
    .eq('id', wishId);

  if (error) {
    console.error('Participant error:', error);
  } else {
    await loadWishes();
  }
}

async function toggleLike(wishId) {
  const wish = [...state.todo, ...state.done].find(w => w.id === wishId);
  if (!wish) return;

  const likesUsers = JSON.parse(wish.likes_users || '[]');
  const hasLiked = likesUsers.includes(authorId);
  let likesCount = wish.likes || 0;

  if (hasLiked) {
    // 取り消し
    const updated = likesUsers.filter(id => id !== authorId);
    likesCount = Math.max(0, likesCount - 1);
    const { error } = await sb
      .from('wishes')
      .update({ likes_users: JSON.stringify(updated), likes: likesCount })
      .eq('id', wishId);
    if (error) {
      console.error('Like error:', error);
    } else {
      await loadWishes();
    }
  } else {
    // 新規いいね
    likesUsers.push(authorId);
    const { error } = await sb
      .from('wishes')
      .update({ likes_users: JSON.stringify(likesUsers), likes: likesCount + 1 })
      .eq('id', wishId);
    if (error) {
      console.error('Like error:', error);
    } else {
      await loadWishes();
    }
  }
}

async function addComment(wishId, commentText, userName) {
  const wish = [...state.todo, ...state.done].find(w => w.id === wishId);
  if (!wish) return;

  const comments = JSON.parse(wish.comments || '[]');
  comments.push({
    text: commentText,
    author: userName,
    created_at: new Date().toISOString()
  });

  const { error } = await sb
    .from('wishes')
    .update({ comments: JSON.stringify(comments) })
    .eq('id', wishId);

  if (error) {
    console.error('Comment error:', error);
  } else {
    await loadWishes();
  }
}

// ========== マップ用（実SVG連携） ==========
// SVGの都道府県ID（英名大文字）→ JISコード（"01"～"47"）のマッピング
const CODE_BY_ID = {
  HOKKAIDO:'01', AOMORI:'02', IWATE:'03', MIYAGI:'04', AKITA:'05', YAMAGATA:'06', FUKUSHIMA:'07',
  IBARAKI:'08', TOCHIGI:'09', GUNMA:'10', SAITAMA:'11', CHIBA:'12', TOKYO:'13', KANAGAWA:'14',
  NIIGATA:'15', TOYAMA:'16', ISHIKAWA:'17', FUKUI:'18', YAMANASHI:'19', NAGANO:'20', GIFU:'21',
  SHIZUOKA:'22', AICHI:'23', MIE:'24', SHIGA:'25', KYOTO:'26', OSAKA:'27', HYOGO:'28', NARA:'29',
  WAKAYAMA:'30', TOTTORI:'31', SHIMANE:'32', OKAYAMA:'33', HIROSHIMA:'34', YAMAGUCHI:'35',
  TOKUSHIMA:'36', KAGAWA:'37', EHIME:'38', KOCHI:'39', FUKUOKA:'40', SAGA:'41', NAGASAKI:'42',
  KUMAMOTO:'43', OITA:'44', MIYAZAKI:'45', KAGOSHIMA:'46', OKINAWA:'47'
};
const ID_BY_CODE = Object.fromEntries(Object.entries(CODE_BY_ID).map(([k,v]) => [v,k]));
// 日本語名（JISコード→都道府県名）
const JP_NAME_BY_CODE = {
  '01':'北海道','02':'青森','03':'岩手','04':'宮城','05':'秋田','06':'山形','07':'福島',
  '08':'茨城','09':'栃木','10':'群馬','11':'埼玉','12':'千葉','13':'東京','14':'神奈川',
  '15':'新潟','16':'富山','17':'石川','18':'福井','19':'山梨','20':'長野','21':'岐阜',
  '22':'静岡','23':'愛知','24':'三重','25':'滋賀','26':'京都','27':'大阪','28':'兵庫','29':'奈良',
  '30':'和歌山','31':'鳥取','32':'島根','33':'岡山','34':'広島','35':'山口',
  '36':'徳島','37':'香川','38':'愛媛','39':'高知','40':'福岡','41':'佐賀','42':'長崎',
  '43':'熊本','44':'大分','45':'宮崎','46':'鹿児島','47':'沖縄'
};
function labelForId(id) {
  const code = CODE_BY_ID[id];
  if (!code) return id;
  return JP_NAME_BY_CODE[code] || id;
}

async function loadVisitedPrefectures() {
  if (!boardId) return;
  const { data, error } = await sb
    .from('visited_prefectures')
    .select('*')
    .eq('board_id', boardId);

  if (error) {
    console.error('Visited load error:', error);
    return;
  }

  const selfSet = new Set();
  const anySet = new Set();
  data.forEach(row => {
    if (row.visited) {
      anySet.add(row.prefecture);
      if (row.user_id === authorId) selfSet.add(row.prefecture);
    }
  });
  visitedSelf = selfSet;
  visitedAny = anySet;
  renderMap();
}

async function toggleVisited(prefCode) {
  const isVisited = visitedSelf.has(prefCode);
  const { error } = await sb
    .from('visited_prefectures')
    .upsert({
      board_id: boardId,
      user_id: authorId,
      prefecture: prefCode,
      visited: !isVisited
    }, { onConflict: 'board_id,user_id,prefecture' });

  if (error) {
    console.error('Visited toggle error:', error);
  } else {
    await loadVisitedPrefectures();
  }
}

async function ensureMapSvgLoaded() {
  if (!mapSvgContainer) return null;
  if (mapSvgRoot) return mapSvgRoot;
  try {
    const resp = await fetch('japan.svg');
    if (!resp.ok) throw new Error(`SVG fetch failed: ${resp.status}`);
    const svgText = await resp.text();
    mapSvgContainer.innerHTML = svgText + '<div class="tooltip" id="map-tooltip"></div>';
    const svg = mapSvgContainer.querySelector('svg');
    if (!svg) throw new Error('SVG not found');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    mapSvgRoot = svg;

    const tooltip = document.getElementById('map-tooltip');
    const paths = svg.querySelectorAll('path[id]');
    paths.forEach(p => {
      const id = p.id.trim().toUpperCase();
      const code = CODE_BY_ID[id];
      if (!code) return; // skip non-prefecture shapes
      p.tabIndex = 0;
      p.setAttribute('role', 'button');
      p.setAttribute('aria-label', labelForId(id));
      p.addEventListener('click', () => {
        if (mapMode !== 'self') return;
        toggleVisited(code);
      });
      p.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (mapMode === 'self') toggleVisited(code); }
      });
      p.addEventListener('mouseenter', (ev) => showMapTooltip(tooltip, labelForId(id), ev));
      p.addEventListener('mousemove', (ev) => showMapTooltip(tooltip, labelForId(id), ev));
      p.addEventListener('mouseleave', () => hideMapTooltip(tooltip));
    });
  } catch (e) {
    mapSvgContainer.innerHTML = `<div class="empty">地図の読み込みに失敗しました: ${e.message}</div>`;
  }
  return mapSvgRoot;
}

function showMapTooltip(tooltip, text, ev) {
  if (!tooltip) return;
  const rect = mapSvgContainer.getBoundingClientRect();
  tooltip.textContent = text;
  tooltip.style.left = (ev.clientX - rect.left) + 'px';
  tooltip.style.top = (ev.clientY - rect.top) + 'px';
  tooltip.classList.add('show');
}
function hideMapTooltip(tooltip) { if (tooltip) tooltip.classList.remove('show'); }

async function renderMap() {
  if (mapModeLabel) mapModeLabel.textContent = mapMode === 'self' ? '自分' : '全体';
  const svg = await ensureMapSvgLoaded();
  if (!svg) return;
  const paths = svg.querySelectorAll('path[id]');
  paths.forEach(p => {
    const id = p.id.trim().toUpperCase();
    const code = CODE_BY_ID[id];
    if (!code) return;
    const selfHit = visitedSelf.has(code);
    const anyHit = visitedAny.has(code);
    p.classList.toggle('self', selfHit && mapMode === 'self');
    p.classList.toggle('any', !selfHit && anyHit);
    if (mapMode === 'all' && selfHit) {
      // 自分が訪問していても全体表示では「any」に統一
      p.classList.remove('self');
      p.classList.add('any');
    }
    if (mapMode === 'self' && anyHit && !selfHit) {
      // 自分表示時は自分優先で着色、それ以外はany
      p.classList.add('any');
    }
    if (mapMode === 'self' && !anyHit) {
      p.classList.remove('any');
    }
  });
}

// ========== リアルタイム購読 ==========
function subscribeToChanges() {
  if (channel) {
    sb.removeChannel(channel);
  }
  channel = sb
    .channel(`board:${boardId}`)
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'wishes', filter: `board_id=eq.${boardId}` },
      () => { loadWishes(); }
    )
    .subscribe();
}

// ========== レンダリング ==========
function render() {
  todoListEl.innerHTML = '';
  doneListEl.innerHTML = '';

  // フィルタ有無にかかわらず、後続で再設定する
  todoEmpty.style.display = state.todo.length ? 'none' : 'block';
  doneEmpty.style.display = state.done.length ? 'none' : 'block';
  const visibleNames = Array.from(new Set([...state.todo, ...state.done].map(i => i.author).filter(Boolean)));
  if (nameFilter) {
    const current = nameFilter.value || 'all';
    nameFilter.innerHTML = '<option value="all">すべて</option>' + visibleNames.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    nameFilter.value = current;
    filterName = nameFilter.value || 'all';
  }

  const todoVisible = state.todo.filter(item => filterName === 'all' || item.author === filterName);
  const doneVisible = state.done.filter(item => filterName === 'all' || item.author === filterName);

  // バッジを更新：現在のユーザー名と件数
  if (currentNameLabel) {
    currentNameLabel.textContent = filterName === 'all' ? '全員' : filterName;
  }
  
  // 「すべて」の場合は全員の合計上限、特定名の場合は100
  let maxCount = MAX_ITEMS;
  if (filterName === 'all') {
    const uniqueNames = Array.from(new Set([...state.todo, ...state.done].map(i => i.author).filter(Boolean)));
    maxCount = uniqueNames.length * MAX_ITEMS;
  }
  todoCount.textContent = todoVisible.length;
  if (maxCountLabel) {
    maxCountLabel.textContent = maxCount;
  }
  todoEmpty.style.display = todoVisible.length ? 'none' : 'block';
  doneEmpty.style.display = doneVisible.length ? 'none' : 'block';

  todoVisible.forEach(item => {
    const el = document.createElement('div');
    el.className = 'item';
    const participants = JSON.parse(item.participants || '[]');
    const likes = item.likes || 0;
    const likesUsers = JSON.parse(item.likes_users || '[]');
    const alreadyLiked = likesUsers.includes(authorId);
    const comments = JSON.parse(item.comments || '[]');
    el.innerHTML = `
      <button class="item-close" data-del="${item.id}">×</button>
      <div>
        ${item.author ? `<div class="muted">${escapeHtml(item.author)}</div>` : ''}
        <div class="title">${escapeHtml(item.title)}</div>
        ${item.note ? `<div class="muted">${escapeHtml(item.note)}</div>` : ''}
        <div class="muted">参加: ${participants.length}人 / いいね: ${likes}</div>
        ${comments.length > 0 ? `<div class="comments">${comments.map(c => `<div class="comment"><span class="comment-author">${escapeHtml(c.author)}:</span> ${escapeHtml(c.text)}</div>`).join('')}</div>` : ''}
      </div>
      <div class="actions">
        <button class="pill small" data-join="${item.id}">やりたい！</button>
        <button class="pill like small${alreadyLiked ? ' liked' : ''}" data-like="${item.id}" aria-label="いいね">&hearts;</button>
        <button class="pill complete full" data-complete="${item.id}">達成！</button>
        <button class="pill" data-comment="${item.id}">コメント</button>
      </div>`;
    todoListEl.appendChild(el);
  });

  doneVisible.forEach(item => {
    const el = document.createElement('div');
    el.className = 'item';
    const participants = JSON.parse(item.participants || '[]');
    const likes = item.likes || 0;
    el.innerHTML = `
      <button class="item-close" data-del-done="${item.id}">×</button>
      <div>
        ${item.author ? `<div class="muted">${escapeHtml(item.author)}</div>` : ''}
        <div class="title">${escapeHtml(item.title)}</div>
        ${item.note ? `<div class="muted">${escapeHtml(item.note)}</div>` : ''}
        ${item.feedback ? `<div class="muted">感想: ${escapeHtml(item.feedback)}</div>` : ''}
        <div class="muted">参加: ${participants.length}人 / いいね: ${likes}</div>
      </div>
      <div class="actions">
        <button class="pill" data-undo="${item.id}">戻す</button>
      </div>`;
    doneListEl.appendChild(el);
  });
}

// ========== イベントハンドラ ==========
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const who = whoInput ? whoInput.value.trim() : '';
  const title = titleInput.value.trim();
  const note = noteInput.value.trim();
  if (!title || !who) {
    alert('名前とやりたいことを入れてください');
    return;
  }

  await addWish(title, note, who);
  titleInput.value = '';
  noteInput.value = '';
  if (whoInput) whoInput.value = who; // keep the name in the box
});

todoListEl.addEventListener('click', async (e) => {
  const joinId = e.target.dataset.join;
  const likeId = e.target.dataset.like;
  const completeId = e.target.dataset.complete;
  const delId = e.target.dataset.del;
  const commentId = e.target.dataset.comment;

  if (joinId) {
    const name = (whoInput ? whoInput.value.trim() : '') || (prompt('あなたの名前を入れてください') || '').trim();
    if (!name) {
      alert('名前を入れてください');
      return;
    }
    await addParticipant(joinId, name);
  } else if (likeId) {
    await toggleLike(likeId);
  } else if (commentId) {
    const name = (whoInput ? whoInput.value.trim() : '') || (prompt('あなたの名前を入れてください') || '').trim();
    if (!name) {
      alert('名前を入れてください');
      return;
    }
    const comment = (prompt('コメント（100字まで）') || '').trim();
    if (!comment) return;
    if (comment.length > 100) {
      alert('コメントは100字までです');
      return;
    }
    await addComment(commentId, comment, name);
  } else if (completeId) {
    const feedback = prompt('達成おめでとう！ 感想を入れますか？（任意）') || '';
    await completeWish(completeId, feedback.trim());
  } else if (delId) {
    if (confirm('削除してよいですか？')) {
      await deleteWish(delId);
    }
  }
});

doneListEl.addEventListener('click', async (e) => {
  const undoId = e.target.dataset.undo;
  const delId = e.target.dataset.delDone;

  if (undoId) {
    await undoWish(undoId);
  } else if (delId) {
    if (confirm('達成済みからも削除しますか？')) {
      await deleteWish(delId);
    }
  }
});

// ========== 初期化 ==========
boardId = getBoardId();
authorId = getAuthorId();
updateMyIdUI();
if (nameFilter) {
  nameFilter.addEventListener('change', () => {
    filterName = nameFilter.value || 'all';
    render();
  });
}
if (copyMyIdBtn) {
  copyMyIdBtn.addEventListener('click', async () => {
    if (!authorId) return;
    try {
      await navigator.clipboard.writeText(authorId);
      alert('MyIDをコピーしました');
    } catch (e) {
      alert('コピーに失敗しました。手動でコピーしてください。');
    }
  });
}

const changeMyIdBtn = document.getElementById('change-myid');
if (changeMyIdBtn) {
  changeMyIdBtn.addEventListener('click', () => {
    const currentDiv = document.getElementById('myid-current');
    const formDiv = document.getElementById('myid-form');
    if (currentDiv) currentDiv.style.display = 'none';
    if (formDiv) formDiv.style.display = 'block';
    if (myIdInput) myIdInput.value = authorId;
  });
}

const saveMyIdBtn = document.getElementById('save-myid');
if (saveMyIdBtn) {
  saveMyIdBtn.addEventListener('click', () => {
    const newId = (myIdInput ? myIdInput.value.trim() : '') || '';
    if (!newId) {
      alert('MyIDを入力してください');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(newId)) {
      alert('MyIDは英数字とハイフン、アンダースコアのみ使えます');
      return;
    }
    setAuthorId(newId);
    loadWishes();
    alert('MyIDを保存しました');
  });
} else {
  console.error('save-myid button not found');
}
loadWishes();
subscribeToChanges();
loadVisitedPrefectures();

// メニュー切替
if (menuToggle && menu && mainPage && mapPage) {
  menuToggle.addEventListener('click', () => {
    menu.classList.toggle('hidden');
  });
  menu.addEventListener('click', (e) => {
    const target = e.target.closest('[data-page]');
    if (!target) return;
    const page = target.dataset.page;
    menu.classList.add('hidden');
    if (page === 'map-page') {
      mainPage.classList.add('hidden');
      mapPage.classList.remove('hidden');
    } else {
      mapPage.classList.add('hidden');
      mainPage.classList.remove('hidden');
    }
  });
}

// マップモード切替
if (mapModeSelfBtn && mapModeAllBtn) {
  mapModeSelfBtn.addEventListener('click', () => {
    mapMode = 'self';
    renderMap();
  });
  mapModeAllBtn.addEventListener('click', () => {
    mapMode = 'all';
    renderMap();
  });
}

// ========== スプラッシュアニメーション ==========
const splash = document.getElementById('splash');
if (splash) {
  setTimeout(() => {
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
    }, 1000);
  }, 1800); // 1.8秒表示してからフェードアウト
}
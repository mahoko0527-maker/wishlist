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
    el.innerHTML = `
      <button class="item-close" data-del="${item.id}">×</button>
      <div>
        ${item.author ? `<div class="muted">${escapeHtml(item.author)}</div>` : ''}
        <div class="title">${escapeHtml(item.title)}</div>
        ${item.note ? `<div class="muted">${escapeHtml(item.note)}</div>` : ''}
        <div class="muted">参加: ${participants.length}人 / いいね: ${likes}</div>
      </div>
      <div class="actions">
        <button class="pill small" data-join="${item.id}">参加したい</button>
        <button class="pill like small${alreadyLiked ? ' liked' : ''}" data-like="${item.id}" aria-label="いいね">&hearts;</button>
        <button class="pill complete full" data-complete="${item.id}">達成</button>
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

  if (joinId) {
    const name = (whoInput ? whoInput.value.trim() : '') || (prompt('あなたの名前を入れてください') || '').trim();
    if (!name) {
      alert('名前を入れてください');
      return;
    }
    await addParticipant(joinId, name);
  } else if (likeId) {
    await toggleLike(likeId);
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
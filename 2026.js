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

const form = document.getElementById('wish-form');
const titleInput = document.getElementById('title');
const noteInput = document.getElementById('note');
const todoListEl = document.getElementById('todo-list');
const doneListEl = document.getElementById('done-list');
const todoEmpty = document.getElementById('todo-empty');
const doneEmpty = document.getElementById('done-empty');
const todoCount = document.getElementById('todo-count');

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
  let id = localStorage.getItem('author-2026');
  if (!id) {
    id = generateId(6);
    localStorage.setItem('author-2026', id);
  }
  return id;
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

async function addWish(title, note) {
  if (state.todo.length >= MAX_ITEMS) {
    alert('100個までです');
    return;
  }

  const { error } = await sb.from('wishes').insert({
    board_id: boardId,
    title,
    note,
    author: authorId,
    done: false
  });

  if (error) console.error('Add error:', error);
}

async function completeWish(id, feedback) {
  const { error } = await sb
    .from('wishes')
    .update({ done: true, feedback })
    .eq('id', id);

  if (error) console.error('Complete error:', error);
}

async function deleteWish(id) {
  const { error } = await sb.from('wishes').delete().eq('id', id);
  if (error) console.error('Delete error:', error);
}

async function undoWish(id) {
  const { error } = await sb
    .from('wishes')
    .update({ done: false, feedback: null })
    .eq('id', id);

  if (error) console.error('Undo error:', error);
}

// ========== リアルタイム購読 ==========
function subscribeToChanges() {
  sb
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

  todoEmpty.style.display = state.todo.length ? 'none' : 'block';
  doneEmpty.style.display = state.done.length ? 'none' : 'block';
  todoCount.textContent = state.todo.length;

  state.todo.forEach(item => {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `
      <div>
        <div class="title">${escapeHtml(item.title)}</div>
        ${item.note ? `<div class="muted">${escapeHtml(item.note)}</div>` : ''}
      </div>
      <div class="actions">
        <button class="pill complete" data-complete="${item.id}">達成</button>
        <button class="pill danger" data-del="${item.id}">削除</button>
      </div>`;
    todoListEl.appendChild(el);
  });

  state.done.forEach(item => {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `
      <div>
        <div class="title">${escapeHtml(item.title)}</div>
        ${item.note ? `<div class="muted">${escapeHtml(item.note)}</div>` : ''}
        ${item.feedback ? `<div class="muted">感想: ${escapeHtml(item.feedback)}</div>` : ''}
      </div>
      <div class="actions">
        <button class="pill" data-undo="${item.id}">戻す</button>
        <button class="pill danger" data-del-done="${item.id}">削除</button>
      </div>`;
    doneListEl.appendChild(el);
  });
}

// ========== イベントハンドラ ==========
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = titleInput.value.trim();
  const note = noteInput.value.trim();
  if (!title) return;

  await addWish(title, note);
  titleInput.value = '';
  noteInput.value = '';
});

todoListEl.addEventListener('click', async (e) => {
  const completeId = e.target.dataset.complete;
  const delId = e.target.dataset.del;

  if (completeId) {
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
loadWishes();
subscribeToChanges();
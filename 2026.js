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

async function addWish(title, note, who) {
  if (state.todo.length >= MAX_ITEMS) {
    alert('100個までです');
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

  todoCount.textContent = todoVisible.length;
  todoEmpty.style.display = todoVisible.length ? 'none' : 'block';
  doneEmpty.style.display = doneVisible.length ? 'none' : 'block';

  todoVisible.forEach(item => {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `
      <div>
        ${item.author ? `<div class="muted">${escapeHtml(item.author)}</div>` : ''}
        <div class="title">${escapeHtml(item.title)}</div>
        ${item.note ? `<div class="muted">${escapeHtml(item.note)}</div>` : ''}
      </div>
      <div class="actions">
        <button class="pill complete" data-complete="${item.id}">達成</button>
        <button class="pill danger" data-del="${item.id}">削除</button>
      </div>`;
    todoListEl.appendChild(el);
  });

  doneVisible.forEach(item => {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = `
      <div>
        ${item.author ? `<div class="muted">${escapeHtml(item.author)}</div>` : ''}
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
if (nameFilter) {
  nameFilter.addEventListener('change', () => {
    filterName = nameFilter.value || 'all';
    render();
  });
}
loadWishes();
subscribeToChanges();
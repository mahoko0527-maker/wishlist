(function createHundredCloud(global) {
  const CONFIG = global.HUNDRED_SUPABASE_CONFIG || {};
  const SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
  const EVENT_NAME = "hundred:cloud-status";
  const validConfig = Boolean(CONFIG.url && CONFIG.publishableKey);
  let client = null;
  let user = null;
  let status = validConfig ? "connecting" : "local";
  let saveChain = Promise.resolve();
  let suppressNextAuthRefresh = false;

  function emit(detail = {}) {
    global.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { status, user, ...detail } }));
  }

  function loadSdk() {
    if (global.supabase?.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${SDK_URL}"]`);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = SDK_URL;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error("Supabase SDK could not be loaded.")), { once: true });
      document.head.appendChild(script);
    });
  }

  async function ensureSession() {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData.session?.user) return sessionData.session.user;
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    return data.user;
  }

  async function fetchState() {
    const { data, error } = await client.from("user_states").select("payload, updated_at").maybeSingle();
    if (error) throw error;
    return data;
  }

  async function saveStateNow(nextState) {
    if (!client || !user) return { skipped: true };
    status = "syncing";
    emit();
    const { error } = await client.rpc("replace_my_state", { p_state: nextState });
    if (error) {
      status = "error";
      emit({ error: error.message });
      throw error;
    }
    status = user.is_anonymous ? "guest" : "account";
    emit({ syncedAt: new Date().toISOString() });
    return { saved: true };
  }

  function saveState(nextState) {
    if (!client || !user) return Promise.resolve({ skipped: true });
    const snapshot = JSON.parse(JSON.stringify(nextState));
    saveChain = saveChain.catch(() => undefined).then(() => saveStateNow(snapshot));
    return saveChain;
  }

  async function reconcile(localState) {
    const remote = await fetchState();
    const previousOwner = global.HundredStorage.cloudOwner();
    if (remote?.payload) {
      if (localState && previousOwner && previousOwner !== user.id) global.HundredStorage.backup(localState);
      global.HundredStorage.save(remote.payload);
      global.HundredStorage.setCloudOwner(user.id);
      return { state: remote.payload, source: "cloud" };
    }
    if (localState) {
      global.HundredStorage.backup(localState);
      await saveStateNow(localState);
    }
    global.HundredStorage.setCloudOwner(user.id);
    return { state: localState, source: localState ? "migration" : "empty" };
  }

  async function refreshState() {
    if (!client || !user || document.visibilityState === "hidden") return { skipped: true };
    await saveChain.catch(() => undefined);
    const remote = await fetchState();
    const recovered = status === "error";
    status = user.is_anonymous ? "guest" : "account";
    if (!remote?.payload) {
      if (recovered) emit({ ready: true });
      return { state: null };
    }
    const local = global.HundredStorage.load();
    if (JSON.stringify(remote.payload) === JSON.stringify(local)) {
      if (recovered) emit({ ready: true });
      return { state: local, unchanged: true };
    }
    global.HundredStorage.backup(local);
    global.HundredStorage.save(remote.payload);
    emit({ state: remote.payload, source: "cloud-refresh", ready: true });
    return { state: remote.payload };
  }

  async function bootstrap() {
    if (!validConfig) {
      status = "local";
      emit();
      return { enabled: false, state: null };
    }
    try {
      await loadSdk();
      client = global.supabase.createClient(CONFIG.url, CONFIG.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      user = await ensureSession();
      const result = await reconcile(global.HundredStorage.load());
      status = user.is_anonymous ? "guest" : "account";
      emit({ ...result, ready: true });

      client.auth.onAuthStateChange(async (event, session) => {
        if (suppressNextAuthRefresh) {
          suppressNextAuthRefresh = false;
          return;
        }
        if (!["SIGNED_IN", "USER_UPDATED"].includes(event) || !session?.user) return;
        global.setTimeout(async () => {
          user = session.user;
          try {
            const refreshed = await reconcile(global.HundredStorage.load());
            status = user.is_anonymous ? "guest" : "account";
            emit({ ...refreshed, ready: true });
          } catch (error) {
            status = "error";
            emit({ error: error.message });
          }
        }, 0);
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") refreshState().catch(error => emit({ error: error.message }));
      });
      global.addEventListener("online", () => refreshState().catch(error => emit({ error: error.message })));
      return { enabled: true, user, ...result };
    } catch (error) {
      console.warn("Cloud sync is unavailable; local data remains active.", error);
      status = "error";
      emit({ error: error.message, ready: true });
      return { enabled: false, state: null, error };
    }
  }

  async function accountSummary() {
    if (!client || !user) return { enabled: false, status };
    const [{ data: profile, error: profileError }, { data: privacy, error: privacyError }] = await Promise.all([
      client.from("profiles").select("display_name, share_code").single(),
      client.from("privacy_settings").select("friends_can_view, show_achieved_date").single()
    ]);
    if (profileError) throw profileError;
    if (privacyError) throw privacyError;
    return { enabled: true, status, user, profile, privacy };
  }

  async function linkEmail(email) {
    if (!client || !user?.is_anonymous) throw new Error("匿名ゲストでのみアカウント連携を開始できます。");
    suppressNextAuthRefresh = true;
    const redirectTo = `${location.origin}${location.pathname}`;
    const { data, error } = await client.auth.updateUser({ email }, { emailRedirectTo: redirectTo });
    if (error) throw error;
    user = data.user || user;
    emit({ notice: "確認メールを送信しました。リンクを開いた後、パスワードを設定してください。" });
    return data;
  }

  async function setPassword(password) {
    if (!client) throw new Error("クラウド同期が設定されていません。");
    suppressNextAuthRefresh = true;
    const { data, error } = await client.auth.updateUser({ password });
    if (error) throw error;
    user = data.user || user;
    status = user.is_anonymous ? "guest" : "account";
    emit({ notice: "アカウントを有効にしました。" });
    return data;
  }

  async function signIn(email, password) {
    if (!client) throw new Error("クラウド同期が設定されていません。");
    const localState = global.HundredStorage.load();
    global.HundredStorage.backup(localState);
    suppressNextAuthRefresh = true;
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    user = data.user;
    const refreshed = await reconcile(localState);
    status = "account";
    emit({ ...refreshed, ready: true, notice: "このアカウントのデータを読み込みました。" });
    return refreshed;
  }

  async function updateProfile(displayName) {
    const { data, error } = await client.from("profiles").update({ display_name: displayName }).eq("id", user.id).select("display_name, share_code").single();
    if (error) throw error;
    return data;
  }

  async function updatePrivacy(values) {
    const { data, error } = await client.from("privacy_settings").update(values).eq("owner_id", user.id).select().single();
    if (error) throw error;
    return data;
  }

  async function requestFriend(shareCode) {
    const { data, error } = await client.rpc("request_friend_by_code", { p_share_code: shareCode });
    if (error) throw error;
    return data;
  }

  async function listConnections() {
    const { data, error } = await client.rpc("list_my_connections");
    if (error) throw error;
    return data || [];
  }

  async function respondToRequest(friendshipId, approve) {
    const { data, error } = await client.rpc("respond_friend_request", { p_friendship_id: friendshipId, p_approve: approve });
    if (error) throw error;
    return data;
  }

  async function friendWishes(friendId) {
    const { data, error } = await client.rpc("get_friend_wishes", { p_friend_id: friendId });
    if (error) throw error;
    return data || [];
  }

  global.HundredCloud = Object.freeze({
    bootstrap,
    saveState,
    accountSummary,
    linkEmail,
    setPassword,
    signIn,
    updateProfile,
    updatePrivacy,
    requestFriend,
    listConnections,
    respondToRequest,
    friendWishes,
    refreshState,
    getStatus: () => ({ enabled: validConfig, status, user })
  });
})(window);

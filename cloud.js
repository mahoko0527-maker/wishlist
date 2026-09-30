(function createHundredCloud(global) {
  const CONFIG = global.HUNDRED_SUPABASE_CONFIG || {};
  const SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.min.js";
  const EVENT_NAME = "hundred:cloud-status";
  const PENDING_SIGNUP_KEY = "hundred:pending-signup-email";
  const validConfig = Boolean(CONFIG.url && CONFIG.publishableKey);
  const redirectTo = `${location.origin}${location.pathname}`;
  const recoveryFromUrl = /(?:[?#&])type=recovery(?:&|$)/.test(`${location.search}${location.hash}`);
  let client = null;
  let user = null;
  let status = validConfig ? "connecting" : "local";
  let authFlow = recoveryFromUrl ? "recovery" : "guest";
  let saveChain = Promise.resolve();
  let bootstrapped = false;
  let authActionInProgress = false;
  let recoveryEventSeen = recoveryFromUrl;

  function pendingEmail() {
    try { return localStorage.getItem(PENDING_SIGNUP_KEY) || ""; } catch (_) { return ""; }
  }

  function setPendingEmail(email) {
    try {
      if (email) localStorage.setItem(PENDING_SIGNUP_KEY, email);
      else localStorage.removeItem(PENDING_SIGNUP_KEY);
    } catch (_) {}
  }

  function emit(detail = {}) {
    global.dispatchEvent(new CustomEvent(EVENT_NAME, {
      detail: { status, user, authFlow, pendingEmail: pendingEmail(), ...detail }
    }));
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

  function errorCode(error) {
    return error?.code || error?.error_code || error?.name || "unknown_error";
  }

  function describeError(error) {
    const code = errorCode(error);
    const source = `${code} ${error?.message || ""}`.toLowerCase();
    let message = "処理を完了できませんでした。少し時間を置いて、もう一度お試しください。";
    if (source.includes("invalid_credentials") || source.includes("invalid login credentials")) {
      message = "メールアドレスまたはパスワードが正しくありません。";
    } else if (source.includes("email_not_confirmed") || source.includes("email not confirmed")) {
      message = "メールアドレスの確認がまだ完了していません。確認メール内のリンクを開いてください。";
    } else if (source.includes("user_already_exists") || source.includes("already registered")) {
      message = "このメールアドレスは登録済みです。ログインをお試しください。";
    } else if (source.includes("weak_password") || source.includes("password should be") || source.includes("password must be")) {
      message = "パスワードは8文字以上で設定してください。";
    } else if (source.includes("over_email_send_rate_limit") || source.includes("rate limit")) {
      message = "メールの送信回数が上限に達しました。しばらく待ってからお試しください。";
    } else if (source.includes("signup_disabled")) {
      message = "現在、新しいアカウントを作成できません。Supabase AuthのSign up設定を確認してください。";
    } else if (source.includes("anonymous_provider_disabled")) {
      message = "Guest接続が無効です。Supabase AuthのAnonymous sign-insを有効にしてください。";
    } else if (source.includes("database error creating anonymous user")) {
      message = "Guest用データの準備に失敗しました。Supabaseの匿名ユーザー設定とDBトリガーを確認してください。";
    } else if (source.includes("failed to fetch") || source.includes("network") || source.includes("load failed")) {
      message = "ネットワークに接続できません。通信状態を確認してください。";
    } else if (error?.message) {
      message = error.message;
    }
    return code && code !== "unknown_error" ? `${message}（${code}）` : message;
  }

  async function ensureSession() {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData.session?.user) {
      const { data, error } = await client.auth.getUser();
      if (error) throw error;
      if (data.user) return data.user;
    }
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
      emit({ error: describeError(error), errorCode: errorCode(error) });
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

  async function handleAuthenticatedSession(nextUser, event) {
    if (!nextUser) return;
    user = nextUser;
    if (!user.is_anonymous) setPendingEmail("");
    if (event === "PASSWORD_RECOVERY") authFlow = "recovery";
    else authFlow = user.is_anonymous ? (pendingEmail() ? "signup-pending" : "guest") : "account";
    const refreshed = await reconcile(global.HundredStorage.load());
    status = user.is_anonymous ? "guest" : "account";
    emit({ ...refreshed, ready: true });
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

      client.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          recoveryEventSeen = true;
          authFlow = "recovery";
        }
        if (!bootstrapped || authActionInProgress) return;
        if (event === "SIGNED_OUT") {
          authActionInProgress = true;
          global.setTimeout(async () => {
            try {
              user = await ensureSession();
              authFlow = "guest";
              const refreshed = await reconcile(global.HundredStorage.load());
              status = "guest";
              emit({ ...refreshed, ready: true, notice: "Guestとして接続しました。" });
            } catch (error) {
              status = "error";
              emit({ error: describeError(error), errorCode: errorCode(error) });
            } finally {
              authActionInProgress = false;
            }
          }, 0);
          return;
        }
        if (!session?.user) return;
        if (!["SIGNED_IN", "USER_UPDATED", "PASSWORD_RECOVERY"].includes(event)) return;
        global.setTimeout(() => {
          handleAuthenticatedSession(session.user, event).catch(error => {
            status = "error";
            emit({ error: describeError(error), errorCode: errorCode(error) });
          });
        }, 0);
      });

      user = await ensureSession();
      const result = await reconcile(global.HundredStorage.load());
      status = user.is_anonymous ? "guest" : "account";
      if (recoveryEventSeen) authFlow = "recovery";
      else authFlow = user.is_anonymous ? (pendingEmail() ? "signup-pending" : "guest") : "account";
      bootstrapped = true;
      emit({ ...result, ready: true });

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") refreshState().catch(error => emit({ error: describeError(error) }));
      });
      global.addEventListener("online", () => refreshState().catch(error => emit({ error: describeError(error) })));
      return { enabled: true, user, ...result };
    } catch (error) {
      console.warn("Cloud sync is unavailable; local data remains active.", error);
      status = "error";
      bootstrapped = true;
      emit({ error: describeError(error), errorCode: errorCode(error), ready: true });
      return { enabled: false, state: null, error };
    }
  }

  async function accountSummary() {
    if (!client || !user || user.is_anonymous) return { enabled: false, status, user };
    const [{ data: profile, error: profileError }, { data: privacy, error: privacyError }] = await Promise.all([
      client.from("profiles").select("display_name, share_code").single(),
      client.from("privacy_settings").select("friends_can_view, show_achieved_date").single()
    ]);
    if (profileError) throw profileError;
    if (privacyError) throw privacyError;
    return { enabled: true, status, user, profile, privacy };
  }

  async function signUp(email, password) {
    if (!client) throw new Error("クラウド同期が設定されていません。");
    const localState = global.HundredStorage.load();
    authActionInProgress = true;
    try {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo }
      });
      if (error) throw error;
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        const duplicate = new Error("このメールアドレスは登録済みです。ログインをお試しください。");
        duplicate.code = "user_already_exists";
        throw duplicate;
      }
      if (data.session?.user) {
        user = data.session.user;
        setPendingEmail("");
        authFlow = "account";
        const refreshed = await reconcile(localState);
        status = "account";
        emit({ ...refreshed, ready: true, notice: "アカウントを作成しました。" });
      } else {
        setPendingEmail(email);
        authFlow = "signup-pending";
        emit({ notice: "確認メールを送信しました。メール内のリンクを開いてください。" });
      }
      return data;
    } finally {
      authActionInProgress = false;
    }
  }

  async function signIn(email, password) {
    if (!client) throw new Error("クラウド同期が設定されていません。");
    const localState = global.HundredStorage.load();
    global.HundredStorage.backup(localState);
    authActionInProgress = true;
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      user = data.user;
      setPendingEmail("");
      authFlow = "account";
      const refreshed = await reconcile(localState);
      status = "account";
      emit({ ...refreshed, ready: true, notice: "ログインしました。" });
      return refreshed;
    } finally {
      authActionInProgress = false;
    }
  }

  async function resetPassword(email) {
    if (!client) throw new Error("クラウド同期が設定されていません。");
    const { data, error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    return data;
  }

  async function completePasswordRecovery(password) {
    if (!client || !user || user.is_anonymous) throw new Error("パスワード再設定リンクをもう一度開いてください。");
    authActionInProgress = true;
    try {
      const { data, error } = await client.auth.updateUser({ password });
      if (error) throw error;
      user = data.user || user;
      recoveryEventSeen = false;
      authFlow = "account";
      status = "account";
      history.replaceState({}, "", redirectTo);
      emit({ ready: true, notice: "パスワードを更新しました。" });
      return data;
    } finally {
      authActionInProgress = false;
    }
  }

  async function signOut() {
    if (!client) return;
    authActionInProgress = true;
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
      user = null;
      setPendingEmail("");
      authFlow = "guest";
      status = "connecting";
      user = await ensureSession();
      const refreshed = await reconcile(global.HundredStorage.load());
      status = "guest";
      emit({ ...refreshed, ready: true, notice: "ログアウトしました。" });
      return refreshed;
    } finally {
      authActionInProgress = false;
    }
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
    signUp,
    signIn,
    signOut,
    resetPassword,
    completePasswordRecovery,
    updateProfile,
    updatePrivacy,
    requestFriend,
    listConnections,
    respondToRequest,
    friendWishes,
    refreshState,
    describeError,
    getStatus: () => ({ enabled: validConfig, status, user, authFlow, pendingEmail: pendingEmail() })
  });
})(window);

(function createHundredStorage(global) {
  const STORAGE_KEY = "the-hundred-v2-prototype";
  const BACKUP_KEY = `${STORAGE_KEY}:pre-cloud-backup`;
  const CLOUD_OWNER_KEY = `${STORAGE_KEY}:cloud-owner`;

  function load() {
    try {
      const value = global.localStorage.getItem(STORAGE_KEY);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.warn("Saved data could not be read.", error);
      return null;
    }
  }

  function save(state) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("Saved data could not be written.", error);
    }
  }

  function clear() {
    global.localStorage.removeItem(STORAGE_KEY);
    global.localStorage.removeItem(BACKUP_KEY);
    global.localStorage.removeItem(CLOUD_OWNER_KEY);
  }

  function backup(state = load()) {
    if (!state) return;
    try {
      if (global.localStorage.getItem(BACKUP_KEY)) return;
      global.localStorage.setItem(BACKUP_KEY, JSON.stringify({ state, createdAt: new Date().toISOString() }));
    } catch (error) {
      console.warn("A local migration backup could not be written.", error);
    }
  }

  function cloudOwner() {
    return global.localStorage.getItem(CLOUD_OWNER_KEY);
  }

  function setCloudOwner(userId) {
    if (userId) global.localStorage.setItem(CLOUD_OWNER_KEY, userId);
    else global.localStorage.removeItem(CLOUD_OWNER_KEY);
  }

  global.HundredStorage = Object.freeze({
    load,
    save,
    clear,
    backup,
    cloudOwner,
    setCloudOwner,
    key: STORAGE_KEY,
    backupKey: BACKUP_KEY
  });
})(window);

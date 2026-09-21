(function createHundredStorage(global) {
  const STORAGE_KEY = "the-hundred-v2-prototype";

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
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function clear() {
    global.localStorage.removeItem(STORAGE_KEY);
  }

  global.HundredStorage = Object.freeze({ load, save, clear, key: STORAGE_KEY });
})(window);

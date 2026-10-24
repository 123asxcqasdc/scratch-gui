const STORAGE_KEY = 'tw:saved-extensions';

const getSavedExtensions = () => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(item => item && item.url);
    } catch (e) {
        return [];
    }
};

const saveExtension = (extension) => {
    try {
        const saved = getSavedExtensions();
        const exists = saved.find(item => item.url === extension.url);
        if (exists) {
            const updated = saved.map(item => item.url === extension.url ? { ...item, ...extension } : item);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            return updated;
        }
        const updated = [...saved, extension];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
    } catch (e) {
        // ignore
    }
};

const removeSavedExtension = (url) => {
    try {
        const saved = getSavedExtensions().filter(item => item.url !== url);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        return saved;
    } catch (e) {
        // ignore
    }
};

export {
    getSavedExtensions,
    saveExtension,
    removeSavedExtension
};

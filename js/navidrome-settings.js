export const navidromeSettings = {
    URL_KEY: 'navidrome-url',
    USERNAME_KEY: 'navidrome-username',
    PASSWORD_KEY: 'navidrome-password',

    getUrl() {
        return localStorage.getItem(this.URL_KEY) || '/navidrome';
    },

    getUsername() {
        return localStorage.getItem(this.USERNAME_KEY) || '';
    },

    getPassword() {
        return localStorage.getItem(this.PASSWORD_KEY) || '';
    },

    setCredentials({ url, username, password }) {
        localStorage.setItem(this.URL_KEY, String(url || '').trim().replace(/\/+$/, ''));
        localStorage.setItem(this.USERNAME_KEY, String(username || '').trim());
        if (password !== undefined) localStorage.setItem(this.PASSWORD_KEY, String(password));
    },

    clear() {
        localStorage.removeItem(this.URL_KEY);
        localStorage.removeItem(this.USERNAME_KEY);
        localStorage.removeItem(this.PASSWORD_KEY);
    },

    isConfigured() {
        return Boolean(this.getUrl() && this.getUsername() && this.getPassword());
    },
};

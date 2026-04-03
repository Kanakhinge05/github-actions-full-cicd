// simple client-side user storage abstraction
// stores data in localStorage but provides a consistent API

const UserStorage = (function() {
    const USERS_KEY = 'users';
    const LOGGED_IN_KEY = 'loggedIn';

    function _read(key) {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    }
    function _write(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function getUsers() {
        return _read(USERS_KEY) || [];
    }
    function saveUsers(users) {
        _write(USERS_KEY, users);
    }

    function addUser(user) {
        const users = getUsers();
        users.push(user);
        saveUsers(users);
    }

    function findUser(identifier) {
        return getUsers().find(u => u.username === identifier || u.email === identifier);
    }

    function setLoggedIn(user) {
        _write(LOGGED_IN_KEY, user);
    }
    function getLoggedIn() {
        return _read(LOGGED_IN_KEY);
    }
    function logout() {
        localStorage.removeItem(LOGGED_IN_KEY);
    }

    return {
        getUsers,
        saveUsers,
        addUser,
        findUser,
        setLoggedIn,
        getLoggedIn,
        logout
    };
})();

// export for use in browser environments; if modules supported you could export default
window.UserStorage = UserStorage;

// backend for login credentials
type UserRecord = { username: string; passwordHash: string };
const USERS_KEY = "demo_users";
const TOKEN_KEY = "demo_token";

// super simple hash stand-in
function hash(pw: string) {
    // for testing purposes only; change before hosting
    return btoa(`salt:${pw}`);
}

function loadUsers(): Record<string, UserRecord> {
    try {
        return JSON.parse(localStorage.getItem(USERS_KEY) || "{}");
    } catch {
        return {};
    }
}

function saveUsers(users: Record<string, UserRecord>) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export async function signup(username: string, password: string) {
    const users = loadUsers();
    if (users[username]) {
        throw new Error("An account with that username already exists.");
    }
    users[username] = { username, passwordHash: hash(password) };
    saveUsers(users);

    const token = btoa(`${username}:${Date.now()}`);
    localStorage.setItem(TOKEN_KEY, token);
    return { user: { username }, token };
}

export async function login(username: string, password: string) {
    const users = loadUsers();

    // quick backdoor for testing without signing up:
    // username: test  password: test123
    if (username === "test" && password === "test123") {
        const token = btoa(`test:${Date.now()}`);
        localStorage.setItem(TOKEN_KEY, token);
        return { user: { username: "test" }, token };
    }

    const rec = users[username];
    if (!rec || rec.passwordHash !== hash(password)) {
        throw new Error("Invalid username or password.");
    }

    const token = btoa(`${username}:${Date.now()}`);
    localStorage.setItem(TOKEN_KEY, token);
    return { user: { username }, token };
}

export function logout() {
    localStorage.removeItem(TOKEN_KEY);
}

export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

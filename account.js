// Account page: shows user info + "my recipes" list.
(function () {
  'use strict';

  const RECIPES_KEY = 'recipes';

  const elProfile = document.getElementById('profile');
  const elStats = document.getElementById('account-stats');
  const elMine = document.getElementById('my-recipes');

  function readJSON(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getRecipes() {
    const list = readJSON(RECIPES_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function saveRecipes(recipes) {
    writeJSON(RECIPES_KEY, recipes);
  }

  function currentUser() {
    try {
      const raw = localStorage.getItem('loggedIn');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function currentUserId() {
    const u = currentUser();
    return u && (u.username || u.email) ? String(u.username || u.email) : 'anonymous';
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  }

  function statCard(num, label) {
    const wrap = document.createElement('div');
    wrap.className = 'stat';
    const n = document.createElement('div');
    n.className = 'stat-num';
    n.textContent = String(num);
    const l = document.createElement('div');
    l.className = 'stat-label';
    l.textContent = label;
    wrap.appendChild(n);
    wrap.appendChild(l);
    return wrap;
  }

  function safeHttpUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      const u = new URL(raw);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      return u.toString();
    } catch {
      return '';
    }
  }

  function migrateRecipesIfNeeded() {
    const recipes = getRecipes();
    let changed = false;
    for (const r of recipes) {
      if (!r || typeof r !== 'object') continue;
      if (!('videoUrl' in r)) {
        r.videoUrl = '';
        changed = true;
      }
      if (!('ownerId' in r)) {
        r.ownerId = '';
        changed = true;
      }
    }
    if (changed) saveRecipes(recipes);
  }

  function renderProfile() {
    const u = currentUser();
    if (!u) {
      elProfile.innerHTML = '<p class="muted">Not logged in.</p>';
      return;
    }
    const rows = [];
    if (u.username) rows.push(`<div><strong>Username:</strong> ${u.username}</div>`);
    if (u.email) rows.push(`<div><strong>Email:</strong> ${u.email}</div>`);
    rows.push(`<div><strong>Member since:</strong> <span class="muted">Local account</span></div>`);
    elProfile.innerHTML = rows.join('');
  }

  function renderStats(mine) {
    elStats.innerHTML = '';
    elStats.appendChild(statCard(mine.length, 'Recipes you created'));
    const withVideo = mine.filter((r) => safeHttpUrl(r.videoUrl)).length;
    elStats.appendChild(statCard(withVideo, 'With video links'));
    const updated = mine
      .slice()
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())[0];
    elStats.appendChild(statCard(updated ? fmtDate(updated.updatedAt || updated.createdAt) : '—', 'Last update'));
  }

  function renderMyRecipes(mine) {
    elMine.innerHTML = '';
    if (!mine.length) {
      elMine.innerHTML = '<p class="muted">No recipes yet. Add your first one.</p>';
      return;
    }
    for (const r of mine) {
      const row = document.createElement('div');
      row.className = 'mini';

      const title = document.createElement('div');
      title.className = 'mini-title';
      title.textContent = `${r.emoji ? r.emoji + ' ' : ''}${r.title || ''}`;

      const sub = document.createElement('div');
      sub.className = 'mini-sub';
      const bits = [];
      if (r.cookTimeMinutes) bits.push(`${r.cookTimeMinutes} min`);
      if (r.servings) bits.push(`${r.servings} servings`);
      if (r.updatedAt || r.createdAt) bits.push(`Updated ${fmtDate(r.updatedAt || r.createdAt)}`);
      if (safeHttpUrl(r.videoUrl)) bits.push('Video');
      sub.textContent = bits.join(' • ');

      const actions = document.createElement('div');
      actions.className = 'tool-actions';
      const edit = document.createElement('a');
      edit.className = 'btn btn-ghost';
      edit.href = `add-recipe.html?edit=${encodeURIComponent(r.id)}`;
      edit.textContent = 'Edit';
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn-secondary';
      del.textContent = 'Delete';
      del.addEventListener('click', () => {
        if (!confirm('Delete this recipe?')) return;
        const all = getRecipes();
        saveRecipes(all.filter((x) => x.id !== r.id));
        boot();
      });
      actions.appendChild(edit);
      actions.appendChild(del);

      row.appendChild(title);
      row.appendChild(sub);
      row.appendChild(actions);
      elMine.appendChild(row);
    }
  }

  function boot() {
    migrateRecipesIfNeeded();
    renderProfile();
    const uid = currentUserId();
    const mine = getRecipes().filter((r) => r && r.ownerId && String(r.ownerId) === uid);
    renderStats(mine);
    renderMyRecipes(mine);
  }

  boot();
})();


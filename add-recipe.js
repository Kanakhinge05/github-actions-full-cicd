// Add/Edit recipe page logic (stores recipes in localStorage).
(function () {
  'use strict';

  const RECIPES_KEY = 'recipes';

  const elForm = document.getElementById('recipe-form');
  const elIngredientsContainer = document.getElementById('ingredients-container');
  const elAddIngredient = document.getElementById('add-ingredient');
  const elCookTime = document.getElementById('cook-time');
  const elServings = document.getElementById('servings');
  const elVideoUrl = document.getElementById('video-url');
  const elPreviewBtn = document.getElementById('preview-video');
  const elVideoPreview = document.getElementById('video-preview');
  const elTags = Array.from(document.querySelectorAll('input[name="tags"]'));

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

  function ensureId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `r_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function currentUserId() {
    try {
      const raw = localStorage.getItem('loggedIn');
      const user = raw ? JSON.parse(raw) : null;
      return user && (user.username || user.email) ? String(user.username || user.email) : 'anonymous';
    } catch {
      return 'anonymous';
    }
  }

  function normalizeText(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[\u2019']/g, '')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tagValues() {
    return elTags.filter((x) => x.checked).map((x) => x.value);
  }

  function setTagValues(values) {
    const set = new Set((values || []).map((x) => String(x)));
    elTags.forEach((cb) => (cb.checked = set.has(cb.value)));
  }

  function ingredientRow(qty, name) {
    const row = document.createElement('div');
    row.className = 'ingredient-row';

    const inQty = document.createElement('input');
    inQty.type = 'text';
    inQty.className = 'ing-qty';
    inQty.placeholder = 'qty';
    inQty.value = qty || '';

    const inName = document.createElement('input');
    inName.type = 'text';
    inName.className = 'ing-name';
    inName.placeholder = 'ingredient';
    inName.value = name || '';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-ingredient';
    remove.textContent = '✖';
    remove.addEventListener('click', () => row.remove());

    row.appendChild(inQty);
    row.appendChild(inName);
    row.appendChild(remove);
    return row;
  }

  function resetIngredientRows() {
    elIngredientsContainer.innerHTML = '';
    elIngredientsContainer.appendChild(ingredientRow('', ''));
  }

  function collectIngredientsFromForm() {
    const rows = Array.from(elIngredientsContainer.querySelectorAll('.ingredient-row'));
    const ingredients = [];
    for (const row of rows) {
      const qty = row.querySelector('.ing-qty')?.value?.trim() || '';
      const name = row.querySelector('.ing-name')?.value?.trim() || '';
      if (!name && !qty) continue;
      if (!name) continue;
      ingredients.push({ qty, name });
    }
    return ingredients;
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

  function youtubeEmbed(url) {
    // Accepts youtu.be/<id>, youtube.com/watch?v=<id>, youtube.com/shorts/<id>
    const safe = safeHttpUrl(url);
    if (!safe) return '';
    try {
      const u = new URL(safe);
      const host = u.hostname.replace(/^www\./, '');
      let id = '';
      if (host === 'youtu.be') id = u.pathname.split('/').filter(Boolean)[0] || '';
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
        else if (u.pathname.startsWith('/shorts/')) id = u.pathname.split('/')[2] || '';
        else if (u.pathname.startsWith('/embed/')) id = u.pathname.split('/')[2] || '';
      }
      id = id ? id.replace(/[^a-zA-Z0-9_-]/g, '') : '';
      return id ? `https://www.youtube.com/embed/${id}` : '';
    } catch {
      return '';
    }
  }

  function setVideoPreview(url) {
    const safe = safeHttpUrl(url);
    const embed = youtubeEmbed(safe);
    if (!safe) {
      elVideoPreview.classList.add('hidden');
      elVideoPreview.setAttribute('aria-hidden', 'true');
      elVideoPreview.innerHTML = '';
      return;
    }
    elVideoPreview.classList.remove('hidden');
    elVideoPreview.setAttribute('aria-hidden', 'false');
    if (embed) {
      elVideoPreview.innerHTML = `
        <div class="video-frame">
          <iframe src="${embed}" title="Recipe video" loading="lazy"
            referrerpolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen></iframe>
        </div>
      `;
    } else {
      elVideoPreview.innerHTML = `<a href="${safe}" target="_blank" rel="noopener noreferrer">Open video link</a>`;
    }
  }

  function getEditId() {
    try {
      const url = new URL(window.location.href);
      const id = url.searchParams.get('edit');
      return id ? String(id) : '';
    } catch {
      return '';
    }
  }

  function applyEditMode(recipe) {
    document.getElementById('page-title').textContent = 'Edit Recipe';
    document.getElementById('form-title').textContent = 'Edit Recipe';
    elForm.querySelector('button[type="submit"]').textContent = 'Update Recipe';

    elForm.title.value = recipe.title || '';
    elForm.instructions.value = recipe.instructions || '';
    elCookTime.value = recipe.cookTimeMinutes || '';
    elServings.value = recipe.servings || '';
    elVideoUrl.value = recipe.videoUrl || '';
    setTagValues(recipe.tags || []);

    elIngredientsContainer.innerHTML = '';
    (recipe.ingredients || []).forEach((i) => elIngredientsContainer.appendChild(ingredientRow(i.qty || '', i.name || i)));
    if (!(recipe.ingredients || []).length) elIngredientsContainer.appendChild(ingredientRow('', ''));

    elForm.dataset.editId = recipe.id;
    setVideoPreview(recipe.videoUrl || '');
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

  // Events
  elAddIngredient.addEventListener('click', () => elIngredientsContainer.appendChild(ingredientRow('', '')));
  elIngredientsContainer.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('.remove-ingredient') : null;
    if (btn) btn.closest('.ingredient-row')?.remove();
  });

  elPreviewBtn.addEventListener('click', () => setVideoPreview(elVideoUrl.value));
  elVideoUrl.addEventListener('input', () => {
    // Light debounce without timers: only auto-hide on empty, otherwise manual preview.
    if (!String(elVideoUrl.value || '').trim()) setVideoPreview('');
  });

  elForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const title = (elForm.title.value || '').trim();
    const instructions = (elForm.instructions.value || '').trim();
    const ingredients = collectIngredientsFromForm();
    const cookTimeMinutes = Number(elCookTime.value || 0) || 0;
    const servings = Number(elServings.value || 0) || 0;
    const tags = tagValues();
    const videoUrl = safeHttpUrl(elVideoUrl.value);
    const ownerId = currentUserId();

    if (!title || !instructions) return;
    if (!ingredients.length) {
      alert('Please add at least 1 ingredient.');
      return;
    }

    const emojiMatch = title.match(/^([\u{1F300}-\u{1FAFF}])/u);
    const emoji = emojiMatch ? emojiMatch[0] : '';
    const now = new Date().toISOString();

    const recipes = getRecipes();
    const editId = elForm.dataset.editId;

    if (editId) {
      const idx = recipes.findIndex((r) => r.id === editId);
      if (idx >= 0) {
        recipes[idx] = {
          ...recipes[idx],
          title,
          ingredients,
          instructions,
          emoji,
          cookTimeMinutes,
          servings,
          tags,
          videoUrl,
          ownerId: recipes[idx].ownerId || ownerId,
          updatedAt: now,
        };
      }
    } else {
      recipes.push({
        id: ensureId(),
        title,
        ingredients,
        instructions,
        emoji,
        cookTimeMinutes,
        servings,
        tags,
        videoUrl,
        ownerId,
        createdAt: now,
        updatedAt: now,
      });
    }

    saveRecipes(recipes);
    window.location.href = 'recipes.html';
  });

  // Boot
  migrateRecipesIfNeeded();
  resetIngredientRows();

  const editId = getEditId();
  if (editId) {
    const r = getRecipes().find((x) => x && x.id === editId);
    if (r) applyEditMode(r);
  }

  // If a `?q=` param is present (rare), pre-fill the title with it.
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('q');
    if (q && !normalizeText(elForm.title.value)) elForm.title.value = String(q);
  } catch {
    // ignore
  }
})();


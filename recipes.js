// Recipes page logic: render, add/edit/delete, and smart tools (pantry match, allergen filters, shopping list).
(function () {
  'use strict';

  const RECIPES_KEY = 'recipes';

  const elList = document.getElementById('recipe-list');
  const elForm = document.getElementById('recipe-form');

  const elAddIngredient = document.getElementById('add-ingredient');
  const elIngredientsContainer = document.getElementById('ingredients-container');

  const elSearch = document.getElementById('search');
  const elPantry = document.getElementById('pantry-input');
  const elSavePantry = document.getElementById('save-pantry');
  const elClearFilters = document.getElementById('clear-filters');
  const elOnlyMakeable = document.getElementById('only-makeable');

  const elShoppingOpen = document.getElementById('open-shopping');
  const elShoppingClose = document.getElementById('close-shopping');
  const elShoppingCopy = document.getElementById('copy-shopping');
  const elShoppingOverlay = document.getElementById('shopping-overlay');
  const elShoppingDrawer = document.getElementById('shopping-drawer');
  const elShoppingText = document.getElementById('shopping-text');
  const elShoppingScope = document.getElementById('shopping-scope');
  const elShoppingExcludePantry = document.getElementById('shopping-exclude-pantry');

  const elCookTime = document.getElementById('cook-time');
  const elServings = document.getElementById('servings');
  const elTags = Array.from(document.querySelectorAll('input[name="tags"]'));

  const state = {
    selectedIds: new Set(),
    prefs: loadPrefs(),
  };

  function currentUserKey() {
    // Use a stable per-user key; fall back to a shared key if the user object is missing.
    try {
      const raw = localStorage.getItem('loggedIn');
      const user = raw ? JSON.parse(raw) : null;
      const id = user && (user.username || user.email) ? String(user.username || user.email) : 'anonymous';
      return `prefs:${id}`;
    } catch {
      return 'prefs:anonymous';
    }
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

  function loadPrefs() {
    const defaults = {
      pantry: '',
      excludedAllergens: [],
      onlyMakeable: false,
      search: '',
    };
    const prefs = readJSON(currentUserKey(), defaults) || defaults;
    return { ...defaults, ...prefs };
  }

  function savePrefs(next) {
    state.prefs = { ...state.prefs, ...next };
    writeJSON(currentUserKey(), state.prefs);
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

  function normalizeText(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[\u2019']/g, '')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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

  function parseList(input) {
    return String(input || '')
      .split(/[\n,]/g)
      .map((x) => normalizeText(x))
      .filter(Boolean);
  }

  function ingredientName(ing) {
    if (!ing) return '';
    if (typeof ing === 'string') return ing;
    return ing.name || '';
  }

  function analyzeAllergens(ingredients) {
    const text = normalizeText(ingredients.map(ingredientName).join(' '));
    const found = new Set();

    // Heuristic-only; it’s better to over-warn than under-warn.
    if (/\b(milk|cheese|butter|ghee|yogurt|cream|paneer|whey)\b/.test(text)) found.add('dairy');
    if (/\b(egg|eggs|mayonnaise)\b/.test(text)) found.add('eggs');
    if (/\b(wheat|flour|bread|pasta|noodles|semolina|barley|rye)\b/.test(text)) found.add('gluten');
    if (/\b(peanut|almond|cashew|pistachio|walnut|hazelnut|pecan|nut)\b/.test(text)) found.add('nuts');
    if (/\b(soy|soya|tofu|edamame|soy sauce)\b/.test(text)) found.add('soy');
    if (/\b(shrimp|prawn|crab|lobster|fish|salmon|tuna)\b/.test(text)) found.add('seafood');

    return Array.from(found);
  }

  function pantryMatch(pantryItems, ingredient) {
    const ing = normalizeText(ingredient);
    if (!ing) return false;
    for (const item of pantryItems) {
      if (!item) continue;
      if (ing.includes(item) || item.includes(ing)) return true;
      const ingWords = new Set(ing.split(' '));
      const itemWords = item.split(' ');
      let overlap = 0;
      for (const w of itemWords) if (ingWords.has(w)) overlap++;
      if (overlap >= Math.min(2, itemWords.length)) return true;
    }
    return false;
  }

  function computePantryStats(recipe, pantryItems) {
    const ingredientList = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    const total = ingredientList.filter((i) => normalizeText(ingredientName(i))).length;
    if (!pantryItems.length) return { total, have: 0, missing: [] };

    const missing = [];
    let have = 0;
    for (const ing of ingredientList) {
      const name = ingredientName(ing);
      if (!normalizeText(name)) continue;
      if (pantryMatch(pantryItems, name)) have++;
      else missing.push(name);
    }
    return { total, have, missing };
  }

  function initExamplesIfEmpty() {
    const recipes = getRecipes();
    if (recipes.length) return;
    saveRecipes([
      {
        id: ensureId(),
        title: 'Pasta',
        ingredients: [
          { qty: '200g', name: 'Pasta' },
          { qty: '1 cup', name: 'Tomato Sauce' },
          { qty: '2 cloves', name: 'Garlic' },
          { qty: 'to taste', name: 'Salt' },
        ],
        instructions: 'Boil pasta. Cook sauce with garlic. Mix together and serve.',
        emoji: '🍝',
        cookTimeMinutes: 20,
        servings: 2,
        tags: [],
      },
      {
        id: ensureId(),
        title: 'Pancakes',
        ingredients: [
          { qty: '1 cup', name: 'Flour' },
          { qty: '1 cup', name: 'Milk' },
          { qty: '2', name: 'Eggs' },
          { qty: '2 tbsp', name: 'Sugar' },
        ],
        instructions: 'Mix ingredients. Pour batter on pan. Cook until golden brown.',
        emoji: '🥞',
        cookTimeMinutes: 15,
        servings: 2,
        tags: [],
      },
    ]);
  }

  function migrateRecipesIfNeeded() {
    const recipes = getRecipes();
    let changed = false;
    const migrated = recipes.map((r) => {
      const next = { ...r };
      if (!next.id) {
        next.id = ensureId();
        changed = true;
      }
      if (!Array.isArray(next.ingredients)) {
        next.ingredients = [];
        changed = true;
      }
      if (!Array.isArray(next.tags)) {
        next.tags = [];
        changed = true;
      }
      if (typeof next.cookTimeMinutes !== 'number') {
        next.cookTimeMinutes = Number(next.cookTimeMinutes || 0) || 0;
        changed = true;
      }
      if (typeof next.servings !== 'number') {
        next.servings = Number(next.servings || 0) || 0;
        changed = true;
      }
      if (!('videoUrl' in next)) {
        next.videoUrl = '';
        changed = true;
      }
      if (!('ownerId' in next)) {
        next.ownerId = '';
        changed = true;
      }
      return next;
    });
    if (changed) saveRecipes(migrated);
  }

  function resetIngredientRows() {
    if (!elIngredientsContainer) return;
    elIngredientsContainer.innerHTML = '';
    addIngredientRow('', '');
  }

  function addIngredientRow(qty, name) {
    const row = document.createElement('div');
    row.className = 'ingredient-row';

    const qtyInput = document.createElement('input');
    qtyInput.type = 'text';
    qtyInput.className = 'ing-qty';
    qtyInput.placeholder = 'qty';
    qtyInput.value = qty || '';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'ing-name';
    nameInput.placeholder = 'ingredient';
    nameInput.value = name || '';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-ingredient';
    removeBtn.textContent = '✖';
    removeBtn.addEventListener('click', () => row.remove());

    row.appendChild(qtyInput);
    row.appendChild(nameInput);
    row.appendChild(removeBtn);
    elIngredientsContainer.appendChild(row);
  }

  function tagValues() {
    return elTags.filter((x) => x.checked).map((x) => x.value);
  }

  function setTagValues(values) {
    const set = new Set(Array.isArray(values) ? values : []);
    for (const cb of elTags) cb.checked = set.has(cb.value);
  }

  function excludedAllergensFromUI() {
    return Array.from(document.querySelectorAll('input[name="exclude-allergen"]:checked')).map((x) => x.value);
  }

  function setExcludedAllergensUI(values) {
    const set = new Set(Array.isArray(values) ? values : []);
    document.querySelectorAll('input[name="exclude-allergen"]').forEach((cb) => {
      cb.checked = set.has(cb.value);
    });
  }

  function applyPrefsToUI() {
    elPantry.value = state.prefs.pantry || '';
    elSearch.value = state.prefs.search || '';
    elOnlyMakeable.checked = Boolean(state.prefs.onlyMakeable);
    setExcludedAllergensUI(state.prefs.excludedAllergens || []);
  }

  function recipeMatchesSearch(recipe, q) {
    if (!q) return true;
    const hay = normalizeText(
      [
        recipe.title || '',
        (recipe.ingredients || []).map(ingredientName).join(' '),
        recipe.instructions || '',
        (recipe.tags || []).join(' '),
      ].join(' ')
    );
    return hay.includes(q);
  }

  function recipeExcludedByAllergens(recipe, excluded) {
    if (!excluded.length) return false;
    const allergens = analyzeAllergens(recipe.ingredients || []);
    const set = new Set(allergens);
    return excluded.some((a) => set.has(a));
  }

  function render() {
    const q = normalizeText(elSearch.value);
    const pantryItems = parseList(elPantry.value);
    const excluded = excludedAllergensFromUI();
    const onlyMakeable = elOnlyMakeable.checked;

    savePrefs({
      pantry: elPantry.value,
      excludedAllergens: excluded,
      onlyMakeable,
      search: elSearch.value,
    });

    const recipes = getRecipes();
    const rows = [];

    for (const r of recipes) {
      if (!recipeMatchesSearch(r, q)) continue;
      if (recipeExcludedByAllergens(r, excluded)) continue;

      const stats = computePantryStats(r, pantryItems);
      const makeable = pantryItems.length ? stats.missing.length === 0 && stats.total > 0 : false;
      if (onlyMakeable && pantryItems.length && !makeable) continue;

      const score = pantryItems.length && stats.total ? stats.have / stats.total : 0;
      rows.push({ recipe: r, stats, score, makeable });
    }

    // Prefer recipes you can make (or almost make) when pantry is provided.
    rows.sort((a, b) => {
      if (a.makeable !== b.makeable) return a.makeable ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return normalizeText(a.recipe.title).localeCompare(normalizeText(b.recipe.title));
    });

    elList.innerHTML = '';
    if (!rows.length) {
      const p = document.createElement('p');
      p.textContent = 'No matching recipes. Try clearing filters or adding more recipes.';
      elList.appendChild(p);
      return;
    }

    for (const row of rows) {
      elList.appendChild(renderRecipeCard(row.recipe, row.stats, pantryItems));
    }
  }

  function renderRecipeCard(recipe, stats, pantryItems) {
    const card = document.createElement('div');
    card.className = 'recipe';
    card.dataset.recipeId = recipe.id;

    const header = document.createElement('div');
    header.className = 'recipe-header';

    const title = document.createElement('h2');
    title.textContent = `${recipe.emoji ? recipe.emoji + ' ' : ''}${recipe.title || ''}`;

    const selectWrap = document.createElement('label');
    selectWrap.className = 'select-recipe';
    const select = document.createElement('input');
    select.type = 'checkbox';
    select.checked = state.selectedIds.has(recipe.id);
    select.addEventListener('change', () => {
      if (select.checked) state.selectedIds.add(recipe.id);
      else state.selectedIds.delete(recipe.id);
    });
    const selectText = document.createElement('span');
    selectText.textContent = 'List';
    selectWrap.appendChild(select);
    selectWrap.appendChild(selectText);

    const toggle = document.createElement('button');
    toggle.className = 'toggle-details';
    toggle.type = 'button';
    toggle.textContent = '▶';

    const edit = document.createElement('button');
    edit.className = 'edit-recipe';
    edit.type = 'button';
    edit.textContent = '✎';

    const del = document.createElement('button');
    del.className = 'delete-recipe';
    del.type = 'button';
    del.textContent = '🗑️';

    header.appendChild(title);
    header.appendChild(selectWrap);
    header.appendChild(toggle);
    header.appendChild(edit);
    header.appendChild(del);

    const meta = document.createElement('div');
    meta.className = 'recipe-meta';

    const chips = document.createElement('div');
    chips.className = 'chips';

    if (typeof recipe.cookTimeMinutes === 'number' && recipe.cookTimeMinutes > 0) {
      chips.appendChild(chip(`⏱ ${recipe.cookTimeMinutes} min`, 'chip-neutral'));
    }
    if (typeof recipe.servings === 'number' && recipe.servings > 0) {
      chips.appendChild(chip(`🍽 ${recipe.servings} servings`, 'chip-neutral'));
    }
    if (Array.isArray(recipe.tags) && recipe.tags.length) {
      for (const t of recipe.tags) chips.appendChild(chip(t, 'chip-tag'));
    }

    const allergens = analyzeAllergens(recipe.ingredients || []);
    if (allergens.length) {
      chips.appendChild(chip(`⚠ ${allergens.join(', ')}`, 'chip-warn'));
    } else {
      chips.appendChild(chip('✓ no common allergens detected', 'chip-ok'));
    }

    if (pantryItems.length && stats.total) {
      chips.appendChild(
        chip(`Pantry: ${stats.have}/${stats.total}`, stats.missing.length ? 'chip-neutral' : 'chip-ok')
      );
    }

    meta.appendChild(chips);

    const details = document.createElement('div');
    details.className = 'recipe-details';

    const hIng = document.createElement('h3');
    hIng.textContent = 'Ingredients';
    details.appendChild(hIng);

    const ul = document.createElement('ul');
    for (const ing of recipe.ingredients || []) {
      const li = document.createElement('li');
      const qty = ing && ing.qty ? String(ing.qty).trim() : '';
      const name = String(ingredientName(ing)).trim();
      li.textContent = `${qty ? qty + ' ' : ''}${name}`;
      ul.appendChild(li);
    }
    details.appendChild(ul);

    if (pantryItems.length && stats.missing.length) {
      const hMiss = document.createElement('h3');
      hMiss.textContent = 'Missing (from your pantry)';
      details.appendChild(hMiss);
      const miss = document.createElement('p');
      miss.className = 'missing';
      miss.textContent = stats.missing.join(', ');
      details.appendChild(miss);
    }

    const hIns = document.createElement('h3');
    hIns.textContent = 'Instructions';
    details.appendChild(hIns);

    const p = document.createElement('p');
    p.textContent = recipe.instructions || '';
    details.appendChild(p);

    const safeVideo = safeHttpUrl(recipe.videoUrl);
    if (safeVideo) {
      const hVid = document.createElement('h3');
      hVid.textContent = 'Video';
      details.appendChild(hVid);

      const embed = youtubeEmbed(safeVideo);
      if (embed) {
        const frame = document.createElement('div');
        frame.className = 'video-frame';
        frame.innerHTML = `
          <iframe src="${embed}" title="Recipe video" loading="lazy"
            referrerpolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen></iframe>
        `;
        details.appendChild(frame);
      } else {
        const a = document.createElement('a');
        a.href = safeVideo;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'Open video link';
        details.appendChild(a);
      }
    }

    toggle.addEventListener('click', () => {
      const open = details.style.display === 'block';
      details.style.display = open ? 'none' : 'block';
      toggle.textContent = open ? '▶' : '▼';
    });

    title.addEventListener('click', () => toggle.click());

    del.addEventListener('click', () => {
      const recipes = getRecipes();
      const next = recipes.filter((x) => x.id !== recipe.id);
      saveRecipes(next);
      state.selectedIds.delete(recipe.id);
      render();
    });

    edit.addEventListener('click', () => {
      if (!elForm) {
        window.location.href = `add-recipe.html?edit=${encodeURIComponent(recipe.id)}`;
        return;
      }
      elForm.title.value = recipe.title || '';
      elForm.instructions.value = recipe.instructions || '';
      elCookTime.value = recipe.cookTimeMinutes || '';
      elServings.value = recipe.servings || '';
      setTagValues(recipe.tags || []);

      elForm.dataset.editId = recipe.id;
      elForm.querySelector('button[type="submit"]').textContent = 'Update Recipe';

      elIngredientsContainer.innerHTML = '';
      (recipe.ingredients || []).forEach((i) => addIngredientRow(i.qty, ingredientName(i)));
      if (!(recipe.ingredients || []).length) addIngredientRow('', '');
      elForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    card.appendChild(header);
    card.appendChild(meta);
    card.appendChild(details);
    return card;
  }

  function chip(text, cls) {
    const s = document.createElement('span');
    s.className = `chip ${cls || ''}`.trim();
    s.textContent = text;
    return s;
  }

  function collectIngredientsFromForm() {
    const rows = Array.from(elIngredientsContainer.querySelectorAll('.ingredient-row'));
    const ingredients = [];
    for (const row of rows) {
      const qty = row.querySelector('.ing-qty')?.value?.trim() || '';
      const name = row.querySelector('.ing-name')?.value?.trim() || '';
      if (!name && !qty) continue;
      if (!name) continue; // ignore qty-only rows
      ingredients.push({ qty, name });
    }
    return ingredients;
  }

  function openShoppingDrawer() {
    elShoppingOverlay.classList.remove('hidden');
    elShoppingDrawer.classList.remove('hidden');
    elShoppingDrawer.setAttribute('aria-hidden', 'false');
  }

  function closeShoppingDrawer() {
    elShoppingOverlay.classList.add('hidden');
    elShoppingDrawer.classList.add('hidden');
    elShoppingDrawer.setAttribute('aria-hidden', 'true');
  }

  function buildShoppingListText() {
    const scope = elShoppingScope.value;
    const excludePantry = elShoppingExcludePantry.checked;
    const pantryItems = parseList(elPantry.value);

    const recipes = getRecipes();
    const picked = scope === 'selected' ? recipes.filter((r) => state.selectedIds.has(r.id)) : recipes;

    const lines = [];
    const counts = new Map();

    for (const r of picked) {
      for (const ing of r.ingredients || []) {
        const name = String(ingredientName(ing)).trim();
        if (!name) continue;
        if (excludePantry && pantryItems.length && pantryMatch(pantryItems, name)) continue;
        const qty = ing && ing.qty ? String(ing.qty).trim() : '';
        const key = normalizeText(name);
        const label = qty ? `${qty} ${name}` : name;
        const prev = counts.get(key);
        if (!prev) counts.set(key, { name, label, n: 1 });
        else prev.n += 1;
      }
    }

    if (!picked.length) {
      lines.push('No recipes in this scope.');
    } else if (counts.size === 0) {
      lines.push(excludePantry ? 'Everything is already in your pantry.' : 'No ingredients found.');
    } else {
      lines.push(`Shopping list (${scope}${excludePantry ? ', excluding pantry' : ''})`);
      lines.push('');
      for (const v of Array.from(counts.values()).sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name)))) {
        lines.push(`- ${v.label}${v.n > 1 ? ` (x${v.n})` : ''}`);
      }
    }

    return lines.join('\n');
  }

  function refreshShoppingList() {
    elShoppingText.textContent = buildShoppingListText();
  }

  function prefillFromURL() {
    // Allows deep-links from the home page, e.g. `recipes.html?q=pasta`.
    // Keep it lightweight: only overwrite values if a param exists.
    try {
      const url = new URL(window.location.href);
      const q = url.searchParams.get('q');
      const pantry = url.searchParams.get('pantry');
      const onlyMakeable = url.searchParams.get('onlyMakeable');

      const next = {};
      if (q !== null) next.search = String(q);
      if (pantry !== null) next.pantry = String(pantry);
      if (onlyMakeable !== null) next.onlyMakeable = onlyMakeable === '1' || onlyMakeable === 'true';

      if (Object.keys(next).length) savePrefs(next);
    } catch {
      // Ignore malformed URLs (shouldn't happen).
    }
  }

  function openShoppingFromURL() {
    try {
      const url = new URL(window.location.href);
      const open = url.searchParams.get('openShopping');
      if (open === '1' || open === 'true') {
        refreshShoppingList();
        openShoppingDrawer();
      }
    } catch {
      // Ignore.
    }
  }

  // Events
  if (elAddIngredient && elIngredientsContainer) {
    elAddIngredient.addEventListener('click', () => addIngredientRow('', ''));
  }

  elSearch.addEventListener('input', render);
  document.querySelectorAll('input[name="exclude-allergen"]').forEach((cb) => cb.addEventListener('change', render));
  elOnlyMakeable.addEventListener('change', render);
  elSavePantry.addEventListener('click', render);

  elClearFilters.addEventListener('click', () => {
    elSearch.value = '';
    elOnlyMakeable.checked = false;
    setExcludedAllergensUI([]);
    savePrefs({ search: '', onlyMakeable: false, excludedAllergens: [] });
    render();
  });

  elShoppingOpen.addEventListener('click', () => {
    refreshShoppingList();
    openShoppingDrawer();
  });
  elShoppingClose.addEventListener('click', closeShoppingDrawer);
  elShoppingOverlay.addEventListener('click', closeShoppingDrawer);
  elShoppingScope.addEventListener('change', refreshShoppingList);
  elShoppingExcludePantry.addEventListener('change', refreshShoppingList);

  elShoppingCopy.addEventListener('click', async () => {
    const text = elShoppingText.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      elShoppingCopy.textContent = 'Copied';
      setTimeout(() => (elShoppingCopy.textContent = 'Copy'), 1200);
    } catch {
      // Clipboard may be blocked in some contexts; do nothing.
    }
  });

  if (elForm && elIngredientsContainer) elForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const title = (elForm.title.value || '').trim();
    const instructions = (elForm.instructions.value || '').trim();
    const ingredients = collectIngredientsFromForm();

    if (!title || !instructions) return;
    if (!ingredients.length) {
      alert('Please add at least 1 ingredient.');
      return;
    }

    const emojiMatch = title.match(/^([\u{1F300}-\u{1FAFF}])/u);
    const emoji = emojiMatch ? emojiMatch[0] : '';
    const cookTimeMinutes = Number(elCookTime.value || 0) || 0;
    const servings = Number(elServings.value || 0) || 0;
    const tags = tagValues();

    const recipes = getRecipes();
    const editId = elForm.dataset.editId;
    const now = new Date().toISOString();

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
          updatedAt: now,
        };
      }
      delete elForm.dataset.editId;
      elForm.querySelector('button[type="submit"]').textContent = 'Add Recipe';
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
        ownerId: currentUserId(),
        createdAt: now,
        updatedAt: now,
      });
    }

    saveRecipes(recipes);
    elForm.reset();
    setTagValues([]);
    resetIngredientRows();
    render();
  });

  // Boot
  initExamplesIfEmpty();
  migrateRecipesIfNeeded();
  prefillFromURL();
  applyPrefsToUI();
  resetIngredientRows();
  render();
  openShoppingFromURL();
})();

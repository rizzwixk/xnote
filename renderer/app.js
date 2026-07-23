(function () {
  'use strict';

  const NEW_NOTE_TITLE = 'Untitled';

  let notes = [];
  let activeNoteId = null;
  let currentSaveTimer = null;
  let saveQueued = false;
  let refreshAnimTimer = null;

  const titleInput = document.getElementById('titleInput');
  const contentInput = document.getElementById('contentInput');
  const noteList = document.getElementById('noteList');
  const newNoteBtn = document.getElementById('newNoteBtn');
  const editorStatus = document.getElementById('editorStatus');
  const themeToggle = document.getElementById('themeToggle');
  const lottieContainer = document.getElementById('lottieContainer');

  let anim = null;
  let animReady = false;
  let pendingTheme = null;
  let themeMode = 'dark';

  function applyTheme(animate) {
    const app = document.getElementById('app');

    function doSwitch() {
      const isDark = themeMode === 'dark';
      document.body.classList.toggle('dark', isDark);
      document.body.classList.toggle('light', !isDark);
      if (animate && animReady) {
        if (isDark) {
          anim.setDirection(-1);
          anim.goToAndPlay(30, true);
        } else {
          anim.setDirection(1);
          anim.goToAndPlay(0, true);
        }
      } else if (animReady) {
        anim.goToAndStop(isDark ? 0 : 30, true);
      }
      app.style.opacity = '1';
    }

    if (animate) {
      app.style.opacity = '0';
      setTimeout(doSwitch, 150);
    } else {
      doSwitch();
    }
  }

  function toggleTheme() {
    themeMode = themeMode === 'dark' ? 'light' : 'dark';
    applyTheme(true);
    window.api.theme.save(themeMode);
  }

  function setStatus(text) {
    editorStatus.textContent = text;
  }

  function renderNoteList() {
    const frag = document.createDocumentFragment();
    for (const note of notes) {
      const li = document.createElement('li');
      li.className = 'note-item' + (note.id === activeNoteId ? ' active' : '');
      li.dataset.id = note.id;

      const titleDiv = document.createElement('div');
      titleDiv.className = 'note-item-title';
      titleDiv.textContent = note.title || NEW_NOTE_TITLE;

      const previewDiv = document.createElement('div');
      previewDiv.className = 'note-item-preview';
      const body = (note.content || '').replace(/\n/g, ' ').trim();
      previewDiv.textContent = body ? body.slice(0, 60) + (body.length > 60 ? '...' : '') : 'Empty note';

      const hint = document.createElement('span');
      hint.className = 'note-delete-hint';
      hint.textContent = 'Double-click to delete';
      li.appendChild(titleDiv);
      li.appendChild(previewDiv);
      li.appendChild(hint);
      frag.appendChild(li);
    }
    noteList.innerHTML = '';
    noteList.appendChild(frag);
    refreshNoteAnimations();
  }

  function updateActiveNoteItem() {
    const item = noteList.querySelector('.note-item.active');
    if (!item) return;
    const note = notes.find(n => n.id === activeNoteId);
    if (!note) return;
    item.querySelector('.note-item-title').textContent = note.title || NEW_NOTE_TITLE;
    const body = (note.content || '').replace(/\n/g, ' ').trim();
    item.querySelector('.note-item-preview').textContent = body ? body.slice(0, 60) + (body.length > 60 ? '...' : '') : 'Empty note';
  }

  function refreshNoteAnimations() {
    if (refreshAnimTimer !== null) {
      clearTimeout(refreshAnimTimer);
      refreshAnimTimer = null;
    }
    refreshAnimTimer = setTimeout(() => {
      refreshAnimTimer = null;
      const items = noteList.querySelectorAll('.note-item');
      for (let i = 0; i < items.length; i++) {
        items[i].style.animation = 'none';
        items[i].offsetHeight;
        items[i].style.animation = '';
        items[i].style.animationDelay = ((i % 10) * 0.02 + 0.02).toFixed(2) + 's';
      }
    }, 20);
  }

  function selectNote(id) {
    if (id === activeNoteId) return;
    saveCurrentNoteImmediate();
    activeNoteId = id;
    const note = notes.find(n => n.id === id);
    if (note) {
      titleInput.value = note.title || '';
      contentInput.value = note.content || '';
    } else {
      titleInput.value = '';
      contentInput.value = '';
    }
    reanimateEditor();
    renderNoteList();
    setStatus('');
  }

  function reanimateEditor() {
    const editor = document.getElementById('editor');
    editor.style.animation = 'none';
    editor.offsetHeight;
    editor.style.animation = '';
  }

  function saveCurrentNoteImmediate() {
    if (!activeNoteId) return;
    const note = notes.find(n => n.id === activeNoteId);
    if (!note) return;
    const newTitle = titleInput.value.trim();
    const newContent = contentInput.value;
    if (note.title !== newTitle || note.content !== newContent) {
      note.title = newTitle;
      note.content = newContent;
      note.updatedAt = Date.now();
      queueFileSave();
      updateActiveNoteItem();
    }
  }

  function queueFileSave() {
    if (saveQueued) return;
    saveQueued = true;
    if (currentSaveTimer !== null) {
      clearTimeout(currentSaveTimer);
      currentSaveTimer = null;
    }
    currentSaveTimer = setTimeout(() => {
      currentSaveTimer = null;
      persistNotes();
    }, 400);
  }

  function persistNotes() {
    if (!saveQueued) return;
    saveQueued = false;
    window.api.notes.save(notes).then(() => {
      setStatus('Saved at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }).catch(() => {
      setStatus('Save failed');
    });
  }

  function createNewNote() {
    saveCurrentNoteImmediate();
    const note = {
      id: generateId(),
      title: '',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    notes.push(note);
    activeNoteId = note.id;
    titleInput.value = '';
    contentInput.value = '';
    reanimateEditor();
    renderNoteList();
    titleInput.focus();
    queueFileSave();
    setStatus('New note');
  }

  function deleteNote(id) {
    const idx = notes.findIndex(n => n.id === id);
    if (idx === -1) return;
    notes.splice(idx, 1);
    if (id === activeNoteId) {
      activeNoteId = null;
      titleInput.value = '';
      contentInput.value = '';
      if (notes.length > 0) {
        const nextIdx = Math.min(idx, notes.length - 1);
        selectNote(notes[nextIdx].id);
      } else {
        renderNoteList();
        setStatus('');
      }
    } else {
      renderNoteList();
    }
    queueFileSave();
  }

  function setupEventListeners() {
    newNoteBtn.addEventListener('click', createNewNote);
    themeToggle.addEventListener('click', toggleTheme);

    titleInput.addEventListener('input', () => {
      queueFileSave();
      updateActiveNoteItem();
    });

    contentInput.addEventListener('input', () => {
      queueFileSave();
      updateActiveNoteItem();
    });

    noteList.addEventListener('click', (e) => {
      const item = e.target.closest('.note-item');
      if (!item) return;
      selectNote(item.dataset.id);
    });

    noteList.addEventListener('dblclick', (e) => {
      const item = e.target.closest('.note-item');
      if (!item) return;
      deleteNote(item.dataset.id);
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        createNewNote();
      }
      if (activeNoteId && (e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        if (confirm('Delete this note?')) {
          deleteNote(activeNoteId);
        }
      }
    });

    window.addEventListener('beforeunload', () => {
      saveCurrentNoteImmediate();
      if (currentSaveTimer !== null) {
        clearTimeout(currentSaveTimer);
        currentSaveTimer = null;
      }
      if (refreshAnimTimer !== null) {
        clearTimeout(refreshAnimTimer);
        refreshAnimTimer = null;
      }
      if (saveQueued) {
        persistNotes();
      }
    });
  }

  function init() {
    fetch('assets/moon-to-sun.json')
      .then(r => r.json())
      .then(data => {
        anim = lottie.loadAnimation({
          container: lottieContainer,
          renderer: 'svg',
          loop: false,
          autoplay: false,
          animationData: data
        });
        anim.addEventListener('DOMLoaded', () => {
          animReady = true;
          if (pendingTheme) {
            themeMode = pendingTheme;
            pendingTheme = null;
            applyTheme(false);
          }
        });
      });

    Promise.all([
      window.api.notes.load(),
      window.api.theme.load()
    ]).then(([loadedNotes, theme]) => {
      themeMode = theme.mode || 'dark';
      if (animReady) {
        applyTheme(false);
      } else {
        pendingTheme = themeMode;
      }
      notes = loadedNotes || [];
      if (notes.length === 0) {
        createNewNote();
      } else {
        activeNoteId = notes[0].id;
        selectNote(activeNoteId);
      }
      setupEventListeners();
    });
  }

  init();
})();

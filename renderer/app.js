// Immediately-invoked function expression to avoid polluting global scope
(function () {
  'use strict'; // Enforce modern JavaScript strict mode

  // Default title shown when a note has no title set
  const NEW_NOTE_TITLE = 'Untitled';

  // In-memory array of all note objects loaded from disk
  let notes = [];
  // ID of the currently selected/active note
  let activeNoteId = null;
  // Timer reference for debounced file save
  let currentSaveTimer = null;
  // Flag indicating a save has been queued (prevents duplicate saves)
  let saveQueued = false;
  // Timer reference for note list refresh animations
  let refreshAnimTimer = null;

  // DOM reference: note title input field in the editor
  const titleInput = document.getElementById('titleInput');
  // DOM reference: note content textarea in the editor
  const contentInput = document.getElementById('contentInput');
  // DOM reference: sidebar note list element
  const noteList = document.getElementById('noteList');
  // DOM reference: "New Note" button in the sidebar
  const newNoteBtn = document.getElementById('newNoteBtn');
  // DOM reference: status bar text at bottom of editor
  const editorStatus = document.getElementById('editorStatus');
  // DOM reference: "Fix" button for AI text correction
  const fixBtn = document.getElementById('fixBtn');
  // DOM reference: theme toggle button in sidebar
  const themeToggle = document.getElementById('themeToggle');
  // DOM reference: Lottie animation container for theme transition
  const lottieContainer = document.getElementById('lottieContainer');

  // Reference to the Lottie animation instance
  let anim = null;
  // Flag indicating Lottie animation has finished loading
  let animReady = false;
  // Theme stored while waiting for animation to load (applied after)
  let pendingTheme = null;
  // Current theme mode: 'dark' or 'light'
  let themeMode = 'dark';

  // Applies the current theme to the document body
  function applyTheme(animate) {
    // Determine if we're switching to dark mode
    const isDark = themeMode === 'dark';

    // Toggles the 'dark'/'light' CSS classes on the body element
    function doSwitch() {
      document.body.classList.toggle('dark', isDark);
      document.body.classList.toggle('light', !isDark);
    }

    // If animation is requested and Lottie is ready, play transition
    if (animate && animReady) {
      // Prevents double-switch during animation
      let switched = false;
      // Listen for animation frames to time the theme switch mid-animation
      function onEnterFrame(e) {
        // Get the current animation frame number
        const frame = Math.round(e.currentTime);
        // Switch theme at the start (dark) or near end (light) of animation
        const trigger = isDark ? frame <= 1 : frame >= 54;
        if (trigger && !switched) {
          switched = true;
          // Remove listener after first trigger
          anim.removeEventListener('enterFrame', onEnterFrame);
          doSwitch();
        }
      }
      anim.addEventListener('enterFrame', onEnterFrame);
      if (isDark) {
        // Play animation in reverse for dark transition
        anim.setDirection(-1);
        anim.goToAndPlay(60, true);
      } else {
        // Play animation forward for light transition
        anim.setDirection(1);
        anim.goToAndPlay(0, true);
      }
    } else {
      // Apply theme immediately without animation
      doSwitch();
    }
  }

  // Toggles between dark and light themes with animation
  function toggleTheme() {
    // Flip the theme mode
    themeMode = themeMode === 'dark' ? 'light' : 'dark';
    // Apply with Lottie animation
    applyTheme(true);
    // Persist the new theme preference to disk
    window.api.theme.save(themeMode);
  }

  // Updates the status bar text in the editor footer
  function setStatus(text) {
    editorStatus.textContent = text;
  }

  // Renders all notes as list items in the sidebar
  function renderNoteList(animate) {
    // Use document fragment for better performance (single DOM insert)
    const frag = document.createDocumentFragment();
    // Loop through all notes and create list items
    for (const note of notes) {
      // Create list item with active class for selected note
      const li = document.createElement('li');
      li.className = 'note-item' + (note.id === activeNoteId ? ' active' : '');
      // Store note ID as data attribute for event handling
      li.dataset.id = note.id;

      // Title display element
      const titleDiv = document.createElement('div');
      titleDiv.className = 'note-item-title';
      titleDiv.textContent = note.title || NEW_NOTE_TITLE;

      // Content preview element (first 60 chars)
      const previewDiv = document.createElement('div');
      previewDiv.className = 'note-item-preview';
      // Replace newlines with spaces for single-line preview
      const body = (note.content || '').replace(/\n/g, ' ').trim();
      previewDiv.textContent = body ? body.slice(0, 60) + (body.length > 60 ? '...' : '') : 'Empty note';

      // Tooltip hint showing how to delete
      const hint = document.createElement('span');
      hint.className = 'note-delete-hint';
      hint.textContent = 'Double-click to delete';
      // Assemble the list item
      li.appendChild(titleDiv);
      li.appendChild(previewDiv);
      li.appendChild(hint);
      frag.appendChild(li);
    }
    // Replace the entire list content at once
    noteList.innerHTML = '';
    noteList.appendChild(frag);
    // Trigger slide-in animations if requested
    if (animate !== false) {
      refreshNoteAnimations();
    }
  }

  // Updates just the active note's sidebar entry (no full re-render)
  function updateActiveNoteItem() {
    // Find the currently active list item
    const item = noteList.querySelector('.note-item.active');
    if (!item) return;
    // Find the corresponding note data
    const note = notes.find(n => n.id === activeNoteId);
    if (!note) return;
    // Update the title text in the sidebar
    item.querySelector('.note-item-title').textContent = note.title || NEW_NOTE_TITLE;
    // Update the preview text in the sidebar
    const body = (note.content || '').replace(/\n/g, ' ').trim();
    item.querySelector('.note-item-preview').textContent = body ? body.slice(0, 60) + (body.length > 60 ? '...' : '') : 'Empty note';
  }

  // Triggers a CSS animation on all note items for a sliding effect
  function refreshNoteAnimations() {
    // Clear any pending animation timer
    if (refreshAnimTimer !== null) {
      clearTimeout(refreshAnimTimer);
      refreshAnimTimer = null;
    }
    // Use short timeout to batch multiple rapid calls
    refreshAnimTimer = setTimeout(() => {
      refreshAnimTimer = null;
      // Get all note items
      const items = noteList.querySelectorAll('.note-item');
      for (let i = 0; i < items.length; i++) {
        // Add animate class and force reflow to restart CSS animation
        items[i].classList.add('animate');
        items[i].style.animation = 'none';
        items[i].offsetHeight; // Force reflow
        items[i].style.animation = '';
        // Stagger animation delay for cascading effect
        items[i].style.animationDelay = ((i % 10) * 0.02 + 0.02).toFixed(2) + 's';
      }
    }, 20);
  }

  // Selects a note by ID and loads it into the editor
  function selectNote(id, animate) {
    // Skip if already viewing this note
    if (id === activeNoteId) return;
    // Save any unsaved changes in the current note first
    saveCurrentNoteImmediate();
    // Update active note tracker
    activeNoteId = id;
    // Find the note in our data array
    const note = notes.find(n => n.id === id);
    if (note) {
      // Load note data into the editor inputs
      titleInput.value = note.title || '';
      contentInput.value = note.content || '';
    } else {
      // Clear editor if note not found
      titleInput.value = '';
      contentInput.value = '';
    }
    // Restart the fade-in animation on the editor panel
    reanimateEditor();
    // Update the sidebar to reflect selection
    renderNoteList(animate);
    // Clear any previous status message
    setStatus('');
    // Trigger auto-title generation if the note has content but no title
    maybeGenerateTitle();
  }

  // Restarts the fade-in animation on the editor panel
  function reanimateEditor() {
    const editor = document.getElementById('editor');
    // Remove and re-add animation by forcing reflow
    editor.style.animation = 'none';
    editor.offsetHeight; // Force reflow
    editor.style.animation = '';
  }

  // Immediately saves the currently active note's data to the in-memory object
  function saveCurrentNoteImmediate() {
    // Exit if no note is selected
    if (!activeNoteId) return;
    const note = notes.find(n => n.id === activeNoteId);
    if (!note) return;
    // Get current values from editor inputs
    const newTitle = titleInput.value.trim();
    const newContent = contentInput.value;
    // Only save if something actually changed
    if (note.title !== newTitle || note.content !== newContent) {
      note.title = newTitle;
      note.content = newContent;
      note.updatedAt = Date.now();
      queueFileSave();     // Schedule a write to disk
      updateActiveNoteItem(); // Update sidebar preview
    }
  }

  // Tracks whether an AI operation (fix/spellcheck) is in progress
  let aiBusy = false;
  // Tracks whether the local AI model has finished setting up
  let aiReady = false;

  // Updates the Fix button disabled state based on AI and note readiness
  function updateFixBtn() {
    fixBtn.disabled = !aiReady || aiBusy || !activeNoteId;
  }

  // Handles clicking the Fix button to run AI spelling/formatting correction
  function handleFixClick() {
    // Prevent action if AI isn't ready, already busy, or no note selected
    if (!aiReady || aiBusy || !activeNoteId) return;
    const note = notes.find(n => n.id === activeNoteId);
    if (!note || !note.content.trim()) return;
    // Mark AI as busy and update button state
    aiBusy = true;
    updateFixBtn();
    fixBtn.textContent = '...'; // Show progress indicator
    setStatus('Fixing...');
    // Call the main process to fix text via local llama.cpp model
    window.api.ai.fixText(note.content).then((fixed) => {
      // Only apply changes if AI returned something different
      if (fixed && fixed !== note.content) {
        note.content = fixed;
        contentInput.value = fixed;
        note.updatedAt = Date.now();
        queueFileSave();
        updateActiveNoteItem();
        setStatus('Fixed');
      } else {
        setStatus('No changes needed');
      }
    }).catch(() => {
      setStatus('Fix failed');
    }).finally(() => {
      // Always reset busy state and restore button
      aiBusy = false;
      fixBtn.textContent = 'Fix';
      updateFixBtn();
    });
  }

  // Handles AI status updates from the main process setup pipeline
  function handleAIStatus(status) {
    if (status.stage === 'ready') {
      // AI setup complete - enable features
      aiReady = true;
      updateFixBtn();
      // Clear status bar if it shows AI progress text
      if (editorStatus.textContent === '' || editorStatus.textContent.startsWith('AI:')) {
        setStatus('');
      }
    } else if (status.stage === 'error') {
      // AI setup failed - keep features disabled
      aiReady = false;
      updateFixBtn();
      setStatus('AI setup failed: ' + status.detail);
    } else if (status.stage === 'checking') {
      setStatus('AI: checking...');
    } else if (status.stage === 'installing') {
      // Show download/install progress details
      setStatus('AI: ' + status.detail);
    } else if (status.stage === 'starting') {
      setStatus('AI: ' + status.detail);
    } else if (status.stage === 'pulling') {
      // Show model download progress
      const d = status.detail;
      setStatus('AI: ' + (d || 'Downloading model...'));
    }
  }

  // Timer reference for auto-title generation (debounced)
  let titleGenTimer = null;

  // Automatically generates a title if the note has content but no title
  function maybeGenerateTitle() {
    // Only proceed if AI is ready and a note is selected
    if (!activeNoteId || !aiReady) return;
    const note = notes.find(n => n.id === activeNoteId);
    // Skip if title already exists or note has no content
    if (!note || note.title || !note.content.trim()) return;
    // Clear any existing pending title generation
    if (titleGenTimer !== null) {
      clearTimeout(titleGenTimer);
    }
    // Wait 2 seconds after the user stops typing to generate title
    titleGenTimer = setTimeout(() => {
      titleGenTimer = null;
      // Ask the AI model to generate a title from the content
      window.api.ai.generateTitle(note.content).then((title) => {
        // Only apply if title is still empty (user didn't type one)
        if (title && note.title === '') {
          note.title = title;
          titleInput.value = title;
          note.updatedAt = Date.now();
          queueFileSave();
          updateActiveNoteItem();
        }
      }).catch(() => {}); // Silently ignore AI failures
    }, 2000);
  }

  // Schedules a debounced save to disk (avoids rapid writes)
  function queueFileSave() {
    // Skip if a save is already pending
    if (saveQueued) return;
    saveQueued = true;
    // Clear any existing timer
    if (currentSaveTimer !== null) {
      clearTimeout(currentSaveTimer);
      currentSaveTimer = null;
    }
    // Schedule the actual save after 400ms of inactivity
    currentSaveTimer = setTimeout(() => {
      currentSaveTimer = null;
      persistNotes();
    }, 400);
  }

  // Writes the entire notes array to disk via IPC
  function persistNotes() {
    // Skip if save was cancelled
    if (!saveQueued) return;
    saveQueued = false;
    // Call main process to write notes JSON file
    window.api.notes.save(notes).then(() => {
      setStatus('Saved at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }).catch(() => {
      setStatus('Save failed');
    });
  }

  // Generates a unique ID for new notes
  function generateId() {
    // Combine base-36 timestamp with random string for uniqueness
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  // Creates a new blank note and selects it
  function createNewNote() {
    // Save current note before switching
    saveCurrentNoteImmediate();
    // Create new note object with default values
    const note = {
      id: generateId(),         // Unique identifier
      title: '',                // Empty title
      content: '',              // Empty content
      createdAt: Date.now(),    // Creation timestamp
      updatedAt: Date.now()     // Last modified timestamp
    };
    // Add to in-memory array
    notes.push(note);
    // Set as active note
    activeNoteId = note.id;
    // Clear the editor inputs
    titleInput.value = '';
    contentInput.value = '';
    // Animate the editor transition
    reanimateEditor();
    // Update sidebar (skip animation for new note creation)
    renderNoteList(false);
    // Focus the title input for immediate typing
    titleInput.focus();
    // Schedule an initial save
    queueFileSave();
    setStatus('New note');
  }

  // Deletes a note by ID and selects the next available note
  function deleteNote(id) {
    // Find the note's index in the array
    const idx = notes.findIndex(n => n.id === id);
    if (idx === -1) return;
    // Remove the note from the array
    notes.splice(idx, 1);
    // If we deleted the currently active note
    if (id === activeNoteId) {
      activeNoteId = null;
      titleInput.value = '';
      contentInput.value = '';
      if (notes.length > 0) {
        // Select the note at the same index (or the last one)
        const nextIdx = Math.min(idx, notes.length - 1);
        selectNote(notes[nextIdx].id, false);
      } else {
        // No notes left - render empty list
        renderNoteList(false);
        setStatus('');
      }
    } else {
      // A non-active note was deleted - just refresh the list
      renderNoteList(false);
    }
    // Save the updated notes array to disk
    queueFileSave();
  }

  // Registers all DOM event listeners for the application
  function setupEventListeners() {
    // New note button in sidebar
    newNoteBtn.addEventListener('click', createNewNote);
    // Theme toggle button
    themeToggle.addEventListener('click', toggleTheme);
    // AI fix button for spelling/formatting
    fixBtn.addEventListener('click', handleFixClick);

    // Custom titlebar window control buttons
    document.getElementById('minBtn').addEventListener('click', () => window.api.window.minimize());
    document.getElementById('maxBtn').addEventListener('click', () => window.api.window.maximize());
    document.getElementById('closeBtn').addEventListener('click', () => window.api.window.close());

    // Listen for maximize/restore events to update titlebar icons
    window.api.window.onMaximizedChanged((maximized) => {
      document.getElementById('maxIcon').style.display = maximized ? 'none' : '';
      document.getElementById('restoreIcon').style.display = maximized ? '' : 'none';
    });

    // Title input - immediately update note title on each keystroke
    titleInput.addEventListener('input', () => {
      const note = notes.find(n => n.id === activeNoteId);
      if (note) { note.title = titleInput.value; note.updatedAt = Date.now(); }
      queueFileSave();
      updateActiveNoteItem();
    });

    // Content input - save on each keystroke and trigger auto-title generation
    contentInput.addEventListener('input', () => {
      const note = notes.find(n => n.id === activeNoteId);
      if (note) { note.content = contentInput.value; note.updatedAt = Date.now(); }
      queueFileSave();
      updateActiveNoteItem();
      maybeGenerateTitle();
    });

    // Click on a note item in the sidebar selects it
    noteList.addEventListener('click', (e) => {
      const item = e.target.closest('.note-item');
      if (!item) return;
      selectNote(item.dataset.id, false);
    });

    // Double-click on a note item deletes it
    noteList.addEventListener('dblclick', (e) => {
      const item = e.target.closest('.note-item');
      if (!item) return;
      deleteNote(item.dataset.id);
    });

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl+N / Cmd+N: Create new note
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        createNewNote();
      }
      // Ctrl+D / Cmd+D: Delete current note (with confirmation)
      if (activeNoteId && (e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        if (confirm('Delete this note?')) {
          deleteNote(activeNoteId);
        }
      }
    });

    // Save pending changes before the window unloads
    window.addEventListener('beforeunload', () => {
      saveCurrentNoteImmediate();
      // Clear any pending save timer
      if (currentSaveTimer !== null) {
        clearTimeout(currentSaveTimer);
        currentSaveTimer = null;
      }
      // Clear animation timer
      if (refreshAnimTimer !== null) {
        clearTimeout(refreshAnimTimer);
        refreshAnimTimer = null;
      }
      // Clear title generation timer
      if (titleGenTimer !== null) {
        clearTimeout(titleGenTimer);
        titleGenTimer = null;
      }
      // Perform final save if one is queued
      if (saveQueued) {
        persistNotes();
      }
    });
  }

  // Main initialization: loads data, sets up theme, renders UI, configures AI
  function init() {
    // Load the Lottie moon-to-sun animation data from JSON
    fetch('assets/moon-to-sun.json')
      .then(r => r.json())
      .then(data => {
        // Initialize Lottie animation player
        anim = lottie.loadAnimation({
          container: lottieContainer,
          renderer: 'svg',
          loop: false,
          autoplay: false,
          animationData: data
        });
        // Wait for animation SVG to be fully rendered
        anim.addEventListener('DOMLoaded', () => {
          animReady = true;
          // Apply any theme that was set before animation was ready
          if (pendingTheme) {
            themeMode = pendingTheme;
            pendingTheme = null;
            applyTheme(false);
          }
        });
      });

    // Load persisted data (notes and theme) in parallel
    Promise.all([
      window.api.notes.load(),
      window.api.theme.load()
    ]).then(([loadedNotes, theme]) => {
      // Apply saved theme mode
      themeMode = theme.mode || 'dark';
      if (animReady) {
        applyTheme(false);
      } else {
        pendingTheme = themeMode;
      }
      // Load notes into memory
      notes = loadedNotes || [];
      if (notes.length === 0) {
        // Create first note if none exist
        createNewNote();
      } else {
        // Select the first note
        selectNote(notes[0].id);
      }
      // Set up all event listeners
      setupEventListeners();
      // Disable Fix button until AI setup completes
      fixBtn.disabled = true;
      // Get initial AI setup status
      window.api.ai.getStatus().then(handleAIStatus);
      // Subscribe to ongoing AI status updates
      window.api.ai.onStatusChanged(handleAIStatus);
    });
  }

  // Start the application
  init();
})();

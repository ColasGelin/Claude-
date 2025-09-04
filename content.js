// content.js - Auto-insert prompts with custom prompt management
console.log('Coding Assistant loaded!');

function initLucideIcons() {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// Wait for element helper
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver((mutations) => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}
let promptShortcuts = {}; // Store prompt shortcuts (shortcut -> promptKey)

// Storage helper functions
const storage = {
  async get(key) {
    return new Promise((resolve) => {
      chrome.storage.sync.get([key], (result) => {
        resolve(result[key]);
      });
    });
  },
  
  async set(key, value) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [key]: value }, resolve);
    });
  }
};

// Global state
let customPrompts = {};
let activePrompts = new Set();
let currentSite = 'unknown'; // Add this line

// Predefined color options
const COLOR_PRESETS = [
  { name: 'Blue', value: '#8b7355' },
  { name: 'Green', value: '#7a8471' },
  { name: 'Purple', value: '#8b7a94' },
  { name: 'Orange', value: '#c4956c' },
  { name: 'Red', value: '#c4756c' }
];

// Load custom prompts from storage
async function loadCustomPrompts() {
  const stored = await storage.get('customPrompts');
  customPrompts = stored || {};
  
  // Load shortcuts
  const storedShortcuts = await storage.get('promptShortcuts');
  promptShortcuts = storedShortcuts || {};
  
  console.log('Loaded custom prompts:', customPrompts);
  console.log('Loaded shortcuts:', promptShortcuts);
}

// Save custom prompts to storage
async function saveCustomPrompts() {
  await storage.set('customPrompts', customPrompts);
  console.log('Saved custom prompts:', customPrompts);
}

// Generate unique ID for new prompts
function generateId() {
  return 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Save shortcuts to storage
async function saveShortcuts() {
  await storage.set('promptShortcuts', promptShortcuts);
  console.log('Saved shortcuts:', promptShortcuts);
}

// Get shortcut for a prompt
function getShortcutForPrompt(promptKey) {
  for (const [shortcut, key] of Object.entries(promptShortcuts)) {
    if (key === promptKey) return shortcut;
  }
  return null;
}

// Remove shortcut for a prompt
async function removeShortcutForPrompt(promptKey) {
  for (const [shortcut, key] of Object.entries(promptShortcuts)) {
    if (key === promptKey) {
      delete promptShortcuts[shortcut];
      await saveShortcuts();
      break;
    }
  }
}

// Detect which site we're on
function detectSite() {
  const url = window.location.href;
  
  if (url.includes('claude.ai')) {
    currentSite = 'claude';
  } else if (url.includes('chat.openai.com') || url.includes('chatgpt.com')) {
    currentSite = 'chatgpt';
  } else {
    currentSite = 'unknown';
  }
  
  console.log('Detected site:', currentSite);
  return currentSite;
}

// Make element draggable
function makeDraggable(element, dragHandle) {
  let isDragging = false;
  let startX, startY, initialX, initialY;

  // Get the drag handle (header) or use the element itself
  const handle = dragHandle || element;

  handle.addEventListener('mousedown', initDrag, false);

  function initDrag(e) {
    // Only start drag on left click and not on buttons
    if (e.button !== 0 || e.target.tagName === 'BUTTON' || e.target.closest('button')) {
      return;
    }

    isDragging = true;
    
    // Get current position
    const rect = element.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;
    
    // Get mouse position
    startX = e.clientX;
    startY = e.clientY;

    // Add global event listeners
    document.addEventListener('mousemove', doDrag, false);
    document.addEventListener('mouseup', stopDrag, false);

    // Prevent text selection during drag
    e.preventDefault();
    handle.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  }

  function doDrag(e) {
    if (!isDragging) return;

    e.preventDefault();

    // Calculate new position
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    let newX = initialX + deltaX;
    let newY = initialY + deltaY;

    // Keep panel within viewport bounds
    const elementRect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Constrain to viewport
    newX = Math.max(0, Math.min(newX, viewportWidth - elementRect.width));
    newY = Math.max(0, Math.min(newY, viewportHeight - elementRect.height));

    // Apply new position
    element.style.left = newX + 'px';
    element.style.top = newY + 'px';
    element.style.right = 'auto'; // Override any existing right positioning
    element.style.bottom = 'auto'; // Override any existing bottom positioning
  }

  function stopDrag() {
    isDragging = false;
    
    // Remove global event listeners
    document.removeEventListener('mousemove', doDrag, false);
    document.removeEventListener('mouseup', stopDrag, false);

    // Restore cursor and text selection
    handle.style.cursor = 'grab';
    document.body.style.userSelect = '';
  }

  // Set initial cursor style
  handle.style.cursor = 'grab';
  
  // Make sure the element is positioned absolutely for dragging to work
  if (window.getComputedStyle(element).position !== 'fixed' && 
      window.getComputedStyle(element).position !== 'absolute') {
    element.style.position = 'fixed';
  }
}

// Create color selector HTML
function createColorSelector(selectedColor = COLOR_PRESETS[0].value, idPrefix = 'prompt-color') {
  return `
    <div class="color-selector">
      ${COLOR_PRESETS.map(color => `
        <button type="button" class="color-option ${selectedColor === color.value ? 'selected' : ''}" 
                data-color="${color.value}" 
                style="background-color: ${color.value};" 
                title="${color.name}"
                data-target="${idPrefix}">
        </button>
      `).join('')}
      <input type="hidden" id="${idPrefix}" value="${selectedColor}">
    </div>
  `;
}

// Create the floating button panel
function createButtonPanel() {
  const panel = document.createElement('div');
  panel.id = 'claude-coding-panel';
  panel.innerHTML = `
    <div class="panel-header">
        <span>Speed Prompts</span>
        <div class="header-controls">
        <button class="control-btn" id="toggle-panel" title="Toggle panel">⚡</button>
        </div>
    </div>
    <div class="panel-content" id="panel-content">
        <div class="status-bar" id="status-bar">
            <span class="status-text">Select prompts to auto-insert. <br>Use Alt+Enter to send with prompts.</span>
            </div>
            <div class="toolbar-section">
            <button class="toolbar-btn" id="deselect-all" title="Deselect all active prompts">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
                Deselect All
            </button>
            <button class="toolbar-btn" id="remove-all-shortcuts" title="Remove all keyboard shortcuts">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
                Clear Shortcuts
            </button>
            </div>
            <button class="add-prompt-btn" id="add-prompt" title="Add new custom prompt">
            + Add New Prompt
            </button>
        <div id="prompts-container"></div>
        <div class="add-prompt-form" id="add-prompt-form" style="display: none;">
        <h4>Create Custom Prompt</h4>
        <textarea id="prompt-text" placeholder="Enter your prompt text..." rows="4"></textarea>
        <div class="form-row">
            <input type="text" id="prompt-name" placeholder="Prompt name" maxlength="20" style="flex: 1;">
            <div class="color-input-wrapper" style="margin-left: 10px;">
              <label style="font-size: 12px; color: #6b6354; margin-bottom: 4px; display: block;">Color:</label>
              ${createColorSelector()}
            </div>
        </div>
        <div class="form-buttons">
            <button class="form-btn cancel" id="cancel-add">Cancel</button>
            <button class="form-btn save" id="save-prompt">Save</button>
        </div>
        </div>
    </div>
    `;
  
  document.body.appendChild(panel);
  
  // Make panel draggable by its header
  const panelHeader = panel.querySelector('.panel-header');
  makeDraggable(panel, panelHeader);
  
  // Add drag cursor styles
  const dragStyles = `
    #claude-coding-panel .panel-header {
      user-select: none;
    }
    #claude-coding-panel .panel-header:hover {
      cursor: grab !important;
    }
    #claude-coding-panel .panel-header:active {
      cursor: grabbing !important;
    }
    .color-selector {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .color-option {
      width: 24px;
      height: 24px;
      border: 2px solid transparent;
      border-radius: 50%;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .color-option:hover {
      transform: scale(1.1);
      border-color: #8b7355;
    }
    .color-option.selected {
      border-color: #8b7355;
      transform: scale(1.15);
      box-shadow: 0 0 0 2px rgba(139, 115, 85, 0.3);
    }
    .color-input-wrapper {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }
  `;
  const dragStyleSheet = document.createElement('style');
  dragStyleSheet.textContent = dragStyles;
  document.head.appendChild(dragStyleSheet);
  
  // State management
  let isPanelExpanded = true;
  
  // Get DOM elements
  const addPromptBtn = document.getElementById('add-prompt');
  const togglePanelBtn = document.getElementById('toggle-panel');
  const content = document.getElementById('panel-content');
  const statusBar = document.getElementById('status-bar');
  const addPromptForm = document.getElementById('add-prompt-form');
  const promptsContainer = document.getElementById('prompts-container');
  
  // Form elements
  const promptTextInput = document.getElementById('prompt-text');
  const promptNameInput = document.getElementById('prompt-name');
  const promptColorInput = document.getElementById('prompt-color');
  const cancelAddBtn = document.getElementById('cancel-add');
  const savePromptBtn = document.getElementById('save-prompt');
  
  // Setup color selector functionality
  function setupColorSelectors() {
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('color-option')) {
        const color = e.target.dataset.color;
        const targetId = e.target.dataset.target;
        const hiddenInput = document.getElementById(targetId);
        
        // Update hidden input
        if (hiddenInput) {
          hiddenInput.value = color;
        }
        
        // Update visual selection
        const container = e.target.closest('.color-selector');
        if (container) {
          container.querySelectorAll('.color-option').forEach(option => {
            option.classList.remove('selected');
          });
          e.target.classList.add('selected');
        }
      }
    });
  }
  
  setupColorSelectors();
  
    addPromptBtn.addEventListener('click', () => {
    // Move the form right after the add button
    addPromptBtn.after(addPromptForm);
    addPromptForm.style.display = 'block';
    promptTextInput.focus();
    });
  
  // Cancel add prompt
  cancelAddBtn.addEventListener('click', () => {
    addPromptForm.style.display = 'none';
    clearForm();
    savePromptBtn.textContent = 'Save';
    delete savePromptBtn.dataset.editing;
  });
  
  // Save new prompt
  savePromptBtn.addEventListener('click', async () => {
    const text = promptTextInput.value.trim();
    const name = promptNameInput.value.trim();
    const color = promptColorInput.value || COLOR_PRESETS[0].value;
    
    if (!text) {
      alert('Please enter prompt text');
      return;
    }
    
    if (!name) {
      alert('Please enter a prompt name');
      return;
    }
    
    const editingKey = savePromptBtn.dataset.editing;
    
    if (editingKey) {
      // Update existing prompt
      customPrompts[editingKey] = {
        text,
        name,
        color,
        isDefault: false
      };
    } else {
      // Create new prompt
      const id = generateId();
      customPrompts[id] = {
        text,
        name,
        color,
        isDefault: false
      };
    }
    
    await saveCustomPrompts();
    addPromptForm.style.display = 'none';
    
    // Reset form and button
    clearForm();
    savePromptBtn.textContent = 'Save';
    delete savePromptBtn.dataset.editing;
    
    renderPrompts();
    
    updateStatusBar();
  });
  
  // Clear form
  function clearForm() {
    promptTextInput.value = '';
    promptNameInput.value = '';
    promptColorInput.value = COLOR_PRESETS[0].value;
    
    // Reset color selector visual state
    const colorOptions = addPromptForm.querySelectorAll('.color-option');
    colorOptions.forEach((option, index) => {
      if (index === 0) {
        option.classList.add('selected');
      } else {
        option.classList.remove('selected');
      }
    });
  }
  
  // Toggle panel minimize/expand
  togglePanelBtn.addEventListener('click', () => {
    isPanelExpanded = !isPanelExpanded;
    
    if (isPanelExpanded) {
      panel.classList.remove('collapsed');
      togglePanelBtn.textContent = '⚡';
      togglePanelBtn.title = 'Collapse to square';
    } else {
      panel.classList.add('collapsed');
      togglePanelBtn.textContent = '⚡';
      togglePanelBtn.title = 'Expand panel';
    }
  });

  // Toolbar button handlers
    const deselectAllBtn = document.getElementById('deselect-all');
    const removeAllShortcutsBtn = document.getElementById('remove-all-shortcuts');

    deselectAllBtn.addEventListener('click', () => {
    activePrompts.clear();
    updateButtonStates();
    updateStatusBar();
    console.log('All prompts deselected');
    });

    removeAllShortcutsBtn.addEventListener('click', async () => {
    
    promptShortcuts = {};
    await saveShortcuts();
    renderPrompts();
    updateButtonStates();
    console.log('All shortcuts removed');
    });
  
  // Render all prompts
  function renderPrompts() {
    promptsContainer.innerHTML = '';
    
    Object.entries(customPrompts).forEach(([key, prompt]) => {
      const button = document.createElement('div');
      button.className = 'prompt-btn-container';
     button.innerHTML = `
  <div class="prompt-item">
    <button class="prompt-btn" data-prompt="${key}" title="Toggle: ${prompt.text}" style="border-color: '${prompt.color || COLOR_PRESETS[0].value}';">
      <span class="prompt-content">
        ${prompt.name}
        ${getShortcutForPrompt(key) ? `<span class="shortcut-indicator">Alt+${getShortcutForPrompt(key)}</span>` : ''}
      </span>
    </button>
    <div class="button-actions">
      <button class="shortcut-btn" data-shortcut="${key}" title="Assign shortcut (Alt+1-3)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
        </button>
      <button class="edit-btn" data-edit="${key}" title="Edit prompt">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="m18.5 2.5 3 3L12 15l-4 1 1-4Z"></path>
        </svg>
      </button>
      <button class="delete-btn" data-delete="${key}" title="Delete prompt">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18"></path>
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
        </svg>
      </button>
    </div>
  </div>
`;
      
      promptsContainer.appendChild(button);
    });
    
    // Show empty state if no custom prompts
    if (Object.keys(customPrompts).length === 0) {
      promptsContainer.innerHTML = '<div class="empty-state">No custom prompts yet. Click + to add your first one!</div>';
    }
  }
  
  // Update button visual states
  function updateButtonStates() {
    const buttons = panel.querySelectorAll('.prompt-btn');
    
    buttons.forEach(btn => {
      const promptKey = btn.dataset.prompt;
      const prompt = customPrompts[promptKey];
      const color = prompt?.color || COLOR_PRESETS[0].value;
      
      if (activePrompts.has(promptKey)) {
        btn.classList.add('active');
        btn.style.borderColor = color;
        btn.style.backgroundColor = color + '20'; // Add transparency
        btn.style.color = color;
      } else {
        btn.classList.remove('active');
        btn.style.borderColor = color;
        btn.style.backgroundColor = '';
        btn.style.color = '';
      }
    });
  }
  
  // Update status bar
  function updateStatusBar() {
    if (activePrompts.size === 0) {
      statusBar.innerHTML = '<span class="status-text">Select prompts to auto-insert. Use Alt+Enter to sends with prompts.</span>';
      statusBar.className = 'status-bar';
    } else {
      statusBar.innerHTML = `<span class="status-text active">Ready to insert: (${activePrompts.size}) - Press Alt+Enter to send</span>`;
      statusBar.className = 'status-bar active';
    }
  }
  
console.log('Setting up event listener for:', promptsContainer);

  // Handle prompt button clicks and deletions
promptsContainer.addEventListener('click', async (e) => {
  // Handle delete button clicks (check for SVG clicks too)
  console.log('Click detected on:', e.target);
  if (e.target.closest('.delete-btn')) {
    e.stopPropagation();
    const deleteBtn = e.target.closest('.delete-btn');
    const promptKey = deleteBtn.dataset.delete;
    
      delete customPrompts[promptKey];
      activePrompts.delete(promptKey);
      await saveCustomPrompts();
      renderPrompts();
      updateButtonStates();
      updateStatusBar();
    await removeShortcutForPrompt(promptKey);
  }

    // Handle shortcut button clicks
    if (e.target.closest('.shortcut-btn')) {
    e.stopPropagation();
    const shortcutBtn = e.target.closest('.shortcut-btn');
    const promptKey = shortcutBtn.dataset.shortcut;
    
    showShortcutSelector(promptKey, shortcutBtn);
    return;
    }

    // Show shortcut selector modal
function showShortcutSelector(promptKey, buttonElement) {
  const prompt = customPrompts[promptKey];
  const currentShortcut = getShortcutForPrompt(promptKey);
  
  // Remove existing modal if any
  const existingModal = document.querySelector('.shortcut-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Create modal
  const modal = document.createElement('div');
  modal.className = 'shortcut-modal';
  modal.innerHTML = `
    <div class="shortcut-modal-backdrop"></div>
    <div class="shortcut-modal-content">
      <h3>Assign Shortcut</h3>
      <p>Choose a shortcut for "${prompt.name}":</p>
      <div class="shortcut-options">
        <button class="shortcut-option" data-shortcut="1">
            Alt+1 ${promptShortcuts['1'] ? `(used by "${customPrompts[promptShortcuts['1']]?.name || 'unknown'}")` : '(available)'}
        </button>
        <button class="shortcut-option" data-shortcut="2">
            Alt+2 ${promptShortcuts['2'] ? `(used by "${customPrompts[promptShortcuts['2']]?.name || 'unknown'}")` : '(available)'}
        </button>
        <button class="shortcut-option" data-shortcut="3">
            Alt+3 ${promptShortcuts['3'] ? `(used by "${customPrompts[promptShortcuts['3']]?.name || 'unknown'}")` : '(available)'}
        </button>
        </div>
      <div class="shortcut-modal-buttons">
        ${currentShortcut ? `<button class="shortcut-modal-btn remove">Remove Shortcut</button>` : ''}
        <button class="shortcut-modal-btn cancel">Cancel</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Handle shortcut selection
modal.addEventListener('click', async (e) => {
    if (e.target.classList.contains('shortcut-option')) {
    const shortcut = e.target.dataset.shortcut;
    
    // Remove existing shortcut for this prompt
    await removeShortcutForPrompt(promptKey);
    
    // Assign new shortcut (this will automatically override any existing assignment)
    promptShortcuts[shortcut] = promptKey;
    await saveShortcuts();
    
    // Update UI
    const panel = document.getElementById('claude-coding-panel');
    panel.renderPrompts();
    panel.updateButtonStates();
    
    modal.remove();
    }
    
    if (e.target.classList.contains('remove')) {
    await removeShortcutForPrompt(promptKey);
    
    // Update UI
    const panel = document.getElementById('claude-coding-panel');
    panel.renderPrompts();
    panel.updateButtonStates();
    
    modal.remove();
    }
    
    if (e.target.classList.contains('cancel') || e.target.classList.contains('shortcut-modal-backdrop')) {
    modal.remove();
    }
});
}
  
  // Handle edit button clicks (check for SVG clicks too)
    if (e.target.closest('.edit-btn')) {
        e.stopPropagation();
        const editBtn = e.target.closest('.edit-btn');
        const promptKey = editBtn.dataset.edit;
        const prompt = customPrompts[promptKey];
        
        // Remove any existing inline edit forms
        const existingInlineForms = document.querySelectorAll('.inline-edit-form');
        existingInlineForms.forEach(form => form.remove());
        
        // Hide the main add form
        addPromptForm.style.display = 'none';
        
        // Create inline edit form
        const inlineForm = document.createElement('div');
        inlineForm.className = 'inline-edit-form';
        inlineForm.innerHTML = `
            <h4>Edit Prompt</h4>
            <textarea class="inline-prompt-text" placeholder="Enter your prompt text..." rows="4">${prompt.text}</textarea>
            <div class="form-row">
            <input type="text" class="inline-prompt-name" placeholder="Prompt name" maxlength="20" value="${prompt.name}" style="flex: 1;">
            <div class="color-input-wrapper" style="margin-left: 10px;">
              <label style="font-size: 12px; color: #6b6354; margin-bottom: 4px; display: block;">Color:</label>
              ${createColorSelector(prompt.color || COLOR_PRESETS[0].value, 'inline-prompt-color')}
            </div>
            </div>
            <div class="form-buttons">
            <button class="form-btn cancel inline-cancel">Cancel</button>
            <button class="form-btn save inline-save" data-editing="${promptKey}">Update</button>
            </div>
        `;
        
        // Insert form right after the prompt item
        const promptContainer = editBtn.closest('.prompt-btn-container');
        promptContainer.after(inlineForm);
        
        // Focus the textarea
        const inlineTextarea = inlineForm.querySelector('.inline-prompt-text');
        inlineTextarea.focus();
        
        // Handle inline form buttons
        inlineForm.addEventListener('click', async (e) => {
            if (e.target.classList.contains('inline-cancel')) {
            inlineForm.remove();
            }
            
            if (e.target.classList.contains('inline-save')) {
            const text = inlineForm.querySelector('.inline-prompt-text').value.trim();
            const name = inlineForm.querySelector('.inline-prompt-name').value.trim();
            const color = inlineForm.querySelector('#inline-prompt-color').value || COLOR_PRESETS[0].value;
            
            if (!text) {
                alert('Please enter prompt text');
                return;
            }
            
            if (!name) {
                alert('Please enter a prompt name');
                return;
            }
            
            // Update the prompt
            customPrompts[promptKey] = {
                text,
                name,
                color,
                isDefault: false
            };
            
            await saveCustomPrompts();
            inlineForm.remove();
            renderPrompts();
            updateButtonStates();
            updateStatusBar();
            }
        });
        
        return;
        }
  
  // Handle prompt button toggle
  const promptBtn = e.target.closest('.prompt-btn');
  if (promptBtn && promptBtn.dataset.prompt) {
    const promptKey = promptBtn.dataset.prompt;
    
    // Toggle the prompt
    if (activePrompts.has(promptKey)) {
      activePrompts.delete(promptKey);
    } else {
      activePrompts.add(promptKey);
    }
    
    updateButtonStates();
    updateStatusBar();
    
    console.log('Active prompts:', Array.from(activePrompts));
  }
});
  
  // Store functions on panel
  panel.renderPrompts = renderPrompts;
  panel.updateButtonStates = updateButtonStates;
  panel.updateStatusBar = updateStatusBar;
  
  return panel;
}

// Find the input element
function findInputElement() {
  const selectors = [
    'textarea[data-testid="chat-input"]',
    'textarea[placeholder*="Talk with Claude"]',
    'textarea[placeholder*="Message Claude"]',
    'div[contenteditable="true"][data-testid="chat-input"]',
    'div[contenteditable="true"]',
    'textarea',
    '.ProseMirror'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      console.log('Found input element:', selector);
      return element;
    }
  }
  
  console.log('Input element not found');
  return null;
}

// Setup Alt+Enter key handler
// Setup Alt+Enter key handler and shortcut handlers
function setupKeyHandlers() {
  console.log('Setting up key handlers...');
  
  // Track last shortcut execution to prevent duplicates
  let lastShortcutTime = {};
  const SHORTCUT_DEBOUNCE_MS = 300; // Prevent same shortcut for 300ms
  
  const keyHandler = function(event) {
    // Check for Alt+Enter
    if (event.key === 'Enter' && event.altKey) {
      console.log('Alt+Enter detected! Inserting prompts...');
      
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      
      // Insert prompts if any are active
      if (activePrompts.size > 0) {
        insertPromptsBeforeSending();
      }
      
      return false;
    }
    
    // Check for Alt+1, Alt+2, Alt+3 shortcuts - using multiple key properties for better compatibility
    if (event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey && (
      ['1', '2', '3'].includes(event.key) || 
      ['Digit1', 'Digit2', 'Digit3'].includes(event.code) ||
      [49, 50, 51].includes(event.keyCode)
    )) {
      // Determine which number was pressed
      let number = null;
      if (event.key === '1' || event.code === 'Digit1' || event.keyCode === 49) number = '1';
      else if (event.key === '2' || event.code === 'Digit2' || event.keyCode === 50) number = '2';
      else if (event.key === '3' || event.code === 'Digit3' || event.keyCode === 51) number = '3';
      
      if (number) {
        // Check debounce - prevent duplicate executions
        const now = Date.now();
        const lastTime = lastShortcutTime[number] || 0;
        
        if (now - lastTime < SHORTCUT_DEBOUNCE_MS) {
          console.log(`Alt+${number} debounced (too recent)`);
          event.preventDefault();
          return false;
        }
        
        // Update last execution time
        lastShortcutTime[number] = now;
        
        console.log(`Alt+${number} detected!`);
        
        // Prevent ALL default behaviors
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        // Get the prompt assigned to this shortcut
        const promptKey = promptShortcuts[number];
        if (promptKey && customPrompts[promptKey]) {
          insertPromptIntoInput(customPrompts[promptKey].text);
        } else {
          console.log(`No prompt assigned to Alt+${number}`);
        }
        
        return false;
      }
    }
  };
  
  // Only use keydown event (not keyup) to prevent duplicates
  document.addEventListener('keydown', keyHandler, true);  // Capture phase only
  
  console.log('Key handlers active with debounce protection!');
}

// Insert prompts before sending and trigger send
function insertPromptsBeforeSending() {
  if (activePrompts.size === 0) return;
  
  const inputElement = findInputElement();
  if (!inputElement) {
    console.log('No input element found');
    return;
  }
  
  const currentValue = inputElement.value || inputElement.textContent || '';
  
  const prompts = Array.from(activePrompts)
    .map(key => customPrompts[key]?.text || '')
    .filter(text => text)
    .join(' | ');
  
  const promptsText = `| ${prompts}`;
  const newValue = currentValue + promptsText;
  
  console.log('Inserting prompts before send:', promptsText);
  
  // Insert the text
  if (inputElement.tagName === 'TEXTAREA') {
    inputElement.value = newValue;
  } else {
    inputElement.textContent = newValue;
  }
  
  // Trigger input event to update the UI
  inputElement.dispatchEvent(new Event('input', { bubbles: true }));
  inputElement.dispatchEvent(new Event('change', { bubbles: true }));
  
  // Focus the input to ensure it's ready
  inputElement.focus();
  
  // Small delay to ensure the text is properly set
  setTimeout(() => {
    // Try to find and click the send button
    const sendButton = findSendButton();
    if (sendButton) {
      console.log('Clicking send button');
      sendButton.click();
    } else {
      // Fallback: simulate Enter key press
      console.log('Send button not found, simulating Enter key');
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      });
      inputElement.dispatchEvent(enterEvent);
    }
  }, 100);
  
  console.log('Prompts inserted and send triggered!');
}

// Function to find the send button
function findSendButton() {
  const sendButtonSelectors = [
    'button[data-testid="send-button"]',
    'button[aria-label="Send message"]',
    'button[type="submit"]',
    'button:has(svg)',
    '.send-button',
    '[data-testid="chat-input"] + button',
    '[data-testid="chat-input-form"] button[type="submit"]',
    'form button[type="submit"]',
    'button[title*="Send"]',
    'button svg[data-icon="send"]'
  ];
  
  for (const selector of sendButtonSelectors) {
    try {
      const button = document.querySelector(selector);
      if (button && !button.disabled) {
        console.log('Found send button with selector:', selector);
        return button;
      }
    } catch (e) {
      // Some selectors might fail, continue to next
      continue;
    }
  }
  
  // Alternative: look for buttons near the input
  const inputElement = findInputElement();
  if (inputElement) {
    const form = inputElement.closest('form');
    if (form) {
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) return submitBtn;
    }
    
    const parent = inputElement.parentElement;
    if (parent) {
      const nearbyButton = parent.querySelector('button');
      if (nearbyButton && !nearbyButton.disabled) {
        return nearbyButton;
      }
    }
  }
  
  console.log('Send button not found');
  return null;
}

// Initialize the extension
async function init() {
  try {
    await waitForElement('body');

    detectSite();
    if (currentSite === 'unknown') {
        console.log('Unsupported site, extension will not initialize');
        return;
    }
    console.log('Initializing extension for:', currentSite);
    
    // Load custom prompts first
    await loadCustomPrompts();
    
    // Create the button panel
    const panel = createButtonPanel();
    
    // Initial render
    panel.renderPrompts();
    initLucideIcons(); // Add this line
    panel.updateButtonStates();
    panel.updateStatusBar();
    
    // Setup Alt+Enter handler
    setupKeyHandlers();
    
    console.log('Claude Coding Assistant initialized successfully!');
    
  } catch (error) {
    console.error('Failed to initialize Claude Coding Assistant:', error);
  }
}

// Insert a single prompt into the input field
function insertPromptIntoInput(promptText) {
  const inputElement = findInputElement();
  if (!inputElement) {
    console.log('No input element found');
    return;
  }
  
  console.log('Inserting prompt:', promptText);
  
  // Use setTimeout to ensure we run after any browser character processing
  setTimeout(() => {
    const currentValue = inputElement.value || inputElement.textContent || '';
    
    // Remove any special characters that might have been inserted by Alt+number
    const cleanValue = currentValue.replace(/[¡¢£]$/g, '');
    const newValue = cleanValue + (cleanValue ? ' ' : '') + promptText;
    
    // Insert the text
    if (inputElement.tagName === 'TEXTAREA') {
      inputElement.value = newValue;
    } else if (inputElement.contentEditable === 'true') {
      inputElement.textContent = newValue;
    } else {
      inputElement.value = newValue;
    }
    
    // Trigger input events
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Focus and position cursor at the end
    inputElement.focus();
    
    // Set cursor position
    if (inputElement.tagName === 'TEXTAREA') {
      inputElement.setSelectionRange(newValue.length, newValue.length);
    } else if (inputElement.contentEditable === 'true') {
      // For contenteditable elements
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(inputElement);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    
    console.log('Prompt inserted successfully');
  }, 50); // Small delay to avoid conflicts with browser processing
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
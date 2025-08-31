// content.js - Auto-insert prompts with custom prompt management
console.log('Claude Coding Assistant loaded!');

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

// Load custom prompts from storage
async function loadCustomPrompts() {
  const stored = await storage.get('customPrompts');
  customPrompts = stored || {};
  console.log('Loaded custom prompts:', customPrompts);
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

// Create the floating button panel
function createButtonPanel() {
  const panel = document.createElement('div');
  panel.id = 'claude-coding-panel';
  panel.innerHTML = `
    <div class="panel-header">
        <span>Auto Prompts</span>
        <div class="header-controls">
        <button class="control-btn" id="toggle-panel" title="Minimize/expand panel">−</button>
        </div>
    </div>
    <div class="panel-content" id="panel-content">
        <div class="status-bar" id="status-bar">
        <span class="status-text">Select prompts to auto-insert. <br>Use Alt+Enter to send with prompts.</span>
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
            <input type="color" id="prompt-color" value="#4f46e5" title="Choose prompt color" style="width: 50px; margin-left: 10px;">
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
  
  // Show add prompt form
  addPromptBtn.addEventListener('click', () => {
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
    const color = promptColorInput.value || '#4f46e5'; // Default color
    
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
    promptColorInput.value = '#4f46e5'; // Reset to default color
  }
  
  // Toggle panel minimize/expand
  togglePanelBtn.addEventListener('click', () => {
    isPanelExpanded = !isPanelExpanded;
    
    if (isPanelExpanded) {
      content.style.display = 'block';
      togglePanelBtn.textContent = '−';
      togglePanelBtn.title = 'Minimize panel';
    } else {
      content.style.display = 'none';
      togglePanelBtn.textContent = '+';
      togglePanelBtn.title = 'Expand panel';
    }
  });
  
  // Render all prompts
  function renderPrompts() {
    promptsContainer.innerHTML = '';
    
    Object.entries(customPrompts).forEach(([key, prompt]) => {
      const button = document.createElement('div');
      button.className = 'prompt-btn-container';
     button.innerHTML = `
  <div class="prompt-item">
    <button class="prompt-btn" data-prompt="${key}" title="Toggle: ${prompt.text}" style="border-color: ${prompt.color || '#4f46e5'};">
      <span class="prompt-content">
        ${prompt.name}
      </span>
    </button>
    <div class="button-actions">
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
      const color = prompt?.color || '#4f46e5';
      
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
      return;
  }
  
  // Handle edit button clicks (check for SVG clicks too)
  if (e.target.closest('.edit-btn')) {
    e.stopPropagation();
    const editBtn = e.target.closest('.edit-btn');
    const promptKey = editBtn.dataset.edit;
    const prompt = customPrompts[promptKey];
    
    // Pre-fill the form with existing data
    promptTextInput.value = prompt.text;
    promptNameInput.value = prompt.name;
    promptColorInput.value = prompt.color || '#4f46e5';
    addPromptForm.style.display = 'block';
    
    // Change save button to update mode
    savePromptBtn.textContent = 'Update';
    savePromptBtn.dataset.editing = promptKey;
    
    promptTextInput.focus();
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
function setupAltEnterHandler() {
  console.log('Setting up Alt+Enter handler...');
  
  document.addEventListener('keydown', function(event) {
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
  }, true);
  
  console.log('Alt+Enter handler active!');
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
    .join('. ');
  
  const promptsText = `\n\n\n|\n${prompts}`;
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
    setupAltEnterHandler();
    
    console.log('Claude Coding Assistant initialized successfully!');
    
  } catch (error) {
    console.error('Failed to initialize Claude Coding Assistant:', error);
  }
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
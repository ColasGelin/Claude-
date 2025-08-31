// popup.js - Popup functionality
document.addEventListener('DOMContentLoaded', function() {
  const statusDiv = document.getElementById('status');
  const statusText = document.getElementById('status-text');
  const statusDetail = document.getElementById('status-detail');
  const openClaudeBtn = document.getElementById('open-claude');
  const togglePanelBtn = document.getElementById('toggle-panel');
  
  // Check if we're on Claude.ai
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];
    
    if (currentTab.url && currentTab.url.includes('claude.ai')) {
      statusDiv.className = 'status active';
      statusText.textContent = '✅ Active on Claude.ai';
      statusDetail.textContent = 'Panel should be visible on the page';
      togglePanelBtn.style.display = 'block';
    } else {
      statusDiv.className = 'status inactive';
      statusText.textContent = '❌ Not on Claude.ai';
      statusDetail.textContent = 'Navigate to claude.ai to use this extension';
      togglePanelBtn.style.display = 'none';
    }
  });
  
  // Open Claude.ai button
  openClaudeBtn.addEventListener('click', function() {
    chrome.tabs.create({
      url: 'https://claude.ai'
    });
    window.close();
  });
  
  // Toggle panel button
  togglePanelBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.scripting.executeScript({
        target: {tabId: tabs[0].id},
        function: togglePanelVisibility
      });
    });
    window.close();
  });
});

// Function to toggle panel visibility (injected into page)
function togglePanelVisibility() {
  const panel = document.getElementById('claude-coding-panel');
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }
}
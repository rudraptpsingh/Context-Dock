import { getActiveProjectId, getActiveProject, addSnippetToProject, getProjects, addProject } from '../utils/storage';

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Set up side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

async function createContextMenus() {
  await chrome.contextMenus.removeAll();

  // --- SAVE SELECTION ---
  await chrome.contextMenus.create({
    id: 'save-selection-root',
    title: 'Save selection to Context Stash',
    contexts: ['selection'],
  });

  const projects = await getProjects();
  
  // Projects List
  for (const project of projects) {
    await chrome.contextMenus.create({
      id: `save-selection-project-${project.id}`,
      parentId: 'save-selection-root',
      title: project.name,
      contexts: ['selection'],
    });
  }

  // Separator
  await chrome.contextMenus.create({
    id: 'save-selection-separator',
    parentId: 'save-selection-root',
    type: 'separator',
    contexts: ['selection'],
  });

  // Active Project Shortcut
  await chrome.contextMenus.create({
    id: 'save-selection-active',
    parentId: 'save-selection-root',
    title: 'Save to Active Project',
    contexts: ['selection'],
  });

  // Create New Project Option
  await chrome.contextMenus.create({
    id: 'save-selection-new-project',
    parentId: 'save-selection-root',
    title: '+ Create New Project...',
    contexts: ['selection'],
  });


  // --- CLIP PAGE ---
  await chrome.contextMenus.create({
    id: 'clip-page',
    title: 'Clip Page to Context Stash',
    contexts: ['page'],
  });


  // --- PASTE CONTEXT ---
  await chrome.contextMenus.create({
    id: 'paste-context-dock-root',
    title: 'Paste Context from Context Stash',
    contexts: ['editable'],
  });

  // Projects List
  for (const project of projects) {
    await chrome.contextMenus.create({
      id: `paste-context-dock-project-${project.id}`,
      parentId: 'paste-context-dock-root',
      title: project.name,
      contexts: ['editable'],
    });
  }

  // Separator
  await chrome.contextMenus.create({
    id: 'paste-context-dock-separator',
    parentId: 'paste-context-dock-root',
    type: 'separator',
    contexts: ['editable'],
  });

  // Active Project Shortcut
  await chrome.contextMenus.create({
    id: 'paste-context-dock-active',
    parentId: 'paste-context-dock-root',
    title: 'Paste from Active Project',
    contexts: ['editable'],
  });
}

// Create context menus on install and startup
chrome.runtime.onInstalled.addListener(() => {
  createContextMenus().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenus().catch(console.error);
});

// Rebuild menus whenever projects change
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.projects) {
    createContextMenus().catch(console.error);
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // 1. HANDLE NEW PROJECT CREATION
  if (info.menuItemId === 'save-selection-new-project' && info.selectionText) {
    // We can't use prompt() in background script in MV3.
    // Instead, we inject a script to prompt the user on the page.
    if (tab?.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (text) => {
          const name = prompt('Enter name for new project:');
          if (name) {
            chrome.runtime.sendMessage({
              type: 'CREATE_PROJECT_AND_SAVE',
              name,
              content: text,
              url: window.location.href,
              title: document.title
            });
          }
        },
        args: [info.selectionText]
      });
    }
    return;
  }

  // 2. HANDLE SAVE SELECTION
  if (
    (info.menuItemId === 'save-selection-active' ||
      (typeof info.menuItemId === 'string' && info.menuItemId.startsWith('save-selection-project-'))) &&
    info.selectionText
  ) {
    let targetProjectId: string | null = null;

    if (info.menuItemId === 'save-selection-active') {
      targetProjectId = await getActiveProjectId();
    } else if (typeof info.menuItemId === 'string') {
      targetProjectId = info.menuItemId.replace('save-selection-project-', '');
    }
    
    if (!targetProjectId) {
      // Notify user to create a project first
      if (tab?.id) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            alert('Please open Context Stash and create a project first.');
          },
        });
      }
      return;
    }

    // Prompt user for a label
    if (tab?.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (text, projectId) => {
          const label = prompt('Enter a label for this context:', '');
          if (label !== null) {  // User didn't cancel
            chrome.runtime.sendMessage({
              type: 'SAVE_SELECTION_WITH_LABEL',
              projectId,
              content: text,
              label: label || undefined,
              url: window.location.href,
              title: document.title
            });
          }
        },
        args: [info.selectionText, targetProjectId]
      });
    }
  }

  // 3. HANDLE CLIP PAGE
  if (info.menuItemId === 'clip-page' && tab?.id) {
    // Send message to the content script (clipper.ts) to extract content
    // This avoids dynamic import issues in executeScript
    chrome.tabs.sendMessage(tab.id, { type: 'CLIP_PAGE' }, async (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending CLIP_PAGE message:', chrome.runtime.lastError);
        // Fallback for pages where content script might not be running yet or failed
        // Simple extraction via executeScript
        chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: () => {
            const content = document.body.innerText.slice(0, 5000);
             chrome.runtime.sendMessage({
              type: 'PAGE_CONTENT',
              content,
              title: document.title,
              url: window.location.href,
            });
          }
        });
        return;
      }
      
      if (response && response.success) {
        const activeProjectId = await getActiveProjectId();
        if (activeProjectId) {
          await addSnippetToProject(activeProjectId, {
            type: 'page_summary',
            content: response.content,
            sourceUrl: response.url,
            sourceTitle: response.title,
          });
          
          chrome.runtime.sendMessage({ type: 'REFRESH_DATA' }).catch(() => {});
          
          // Show success notification
           chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: (title: string) => {
              const toast = document.createElement('div');
              toast.innerHTML = `
                <div style="
                  position: fixed;
                  bottom: 24px;
                  right: 24px;
                  background: #0f172a;
                  color: white;
                  padding: 12px 20px;
                  border-radius: 8px;
                  font-family: Inter, system-ui, sans-serif;
                  font-size: 14px;
                  z-index: 999999;
                  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                  animation: slideIn 0.3s ease-out;
                ">
                  ✓ Clipped "${title.slice(0, 20)}..." to Context Stash
                </div>
                <style>
                  @keyframes slideIn {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                  }
                </style>
              `;
              document.body.appendChild(toast);
              setTimeout(() => toast.remove(), 3000);
            },
            args: [response.title]
          });
        } else {
           // Notify user to create a project first
           chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            func: () => {
              alert('Please open Context Stash and create a project first.');
            },
          });
        }
      }
    });
  }

  // 4. HANDLE PASTE CONTEXT
  if (
    info.menuItemId === 'paste-context-dock-active' ||
    (typeof info.menuItemId === 'string' && info.menuItemId.startsWith('paste-context-dock-project-'))
  ) {
    let targetProjectId: string | null = null;

    if (info.menuItemId === 'paste-context-dock-active') {
      targetProjectId = await getActiveProjectId();
    } else if (typeof info.menuItemId === 'string') {
      targetProjectId = info.menuItemId.replace('paste-context-dock-project-', '');
    }

    if (!tab?.id || !targetProjectId) return;

    // Ask the content script in this tab to inject the given project's context
    chrome.tabs
      .sendMessage(tab.id, { type: 'INJECT_CONTEXT_FROM_MENU', projectId: targetProjectId })
      .catch(() => {
        // Content script might not be loaded on this page; fail silently
      });
  }
});

// Helper to save selection and notify

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_SELECTION_WITH_LABEL') {
    (async () => {
      await addSnippetToProject(message.projectId, {
        type: 'selection',
        content: message.content,
        label: message.label,
        sourceUrl: message.url,
        sourceTitle: message.title
      });

      chrome.runtime.sendMessage({ type: 'REFRESH_DATA' }).catch(() => {});

      // Show success notification
      if (sender.tab?.id) {
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          func: (content: string, label: string | undefined) => {
            const toast = document.createElement('div');
            const labelText = label ? ` [${label}]` : '';
            toast.innerHTML = `
              <div style="
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: #0f172a;
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                font-family: Inter, system-ui, sans-serif;
                font-size: 14px;
                z-index: 999999;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                animation: slideIn 0.3s ease-out;
              ">
                ✓ Saved "${content.slice(0, 25)}${content.length > 25 ? '...' : ''}"${labelText} to Context Stash
              </div>
              <style>
                @keyframes slideIn {
                  from { transform: translateY(20px); opacity: 0; }
                  to { transform: translateY(0); opacity: 1; }
                }
              </style>
            `;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
          },
          args: [message.content, message.label]
        });
      }
    })();
  }

  if (message.type === 'PAGE_CONTENT') {
    (async () => {
      const activeProjectId = await getActiveProjectId();
      if (!activeProjectId) {
        sendResponse({ success: false, error: 'No active project' });
        return;
      }

      await addSnippetToProject(activeProjectId, {
        type: 'page_summary',
        content: message.content.slice(0, 10000), // Limit content size
        sourceUrl: message.url,
        sourceTitle: message.title,
      });

      chrome.runtime.sendMessage({ type: 'REFRESH_DATA' }).catch(() => {});
      sendResponse({ success: true });
    })();
    return true; // Will respond asynchronously
  }

  if (message.type === 'CREATE_PROJECT_AND_SAVE') {
    (async () => {
      const newProject = await addProject(message.name);
      await addSnippetToProject(newProject.id, {
        type: 'selection',
        content: message.content,
        sourceUrl: message.url,
        sourceTitle: message.title
      });
      
      chrome.runtime.sendMessage({ type: 'REFRESH_DATA' }).catch(() => {});
      
      // Show success
      if (sender.tab?.id) {
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          func: (projectName: string) => {
            // Reuse the same toast logic or simple alert
            alert(`Created project "${projectName}" and saved selection.`);
          },
          args: [newProject.name]
        });
      }
    })();
  }

  if (message.type === 'GET_CONTEXT') {
    // ... legacy support for floating widget if ever re-enabled ...
    (async () => {
      const project = await getActiveProject();
      if (!project || project.snippets.length === 0) {
        sendResponse({ context: null });
        return;
      }

      // Format context string in a numbered reference / citations style
      // ... formatting logic ... 
      // (Keeping it brief here as this message type is mainly for the floating widget which is disabled)
       sendResponse({ context: null }); // Just return null for now if this is called
    })();
    return true;
  }
});
// ADD LISTENER TO SHOW OPTIONS TO PASTE SELECTIVE CONTEXT
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === 'paste-active-context') {
    // Falls back to active project in content script
    chrome.tabs.sendMessage(tab.id, { type: 'INJECT_CONTEXT_FROM_MENU' });
  } else if (command === 'paste-selective-context') {
    // Triggers picker
    chrome.tabs.sendMessage(tab.id, { type: 'SHOW_SNIPPET_PICKER' });
  }
});
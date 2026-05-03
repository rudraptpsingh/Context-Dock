import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { MessageSquare, FolderOpen, Server, Upload, AlertTriangle } from 'lucide-react';
import Header from './components/Header';
import SnippetList from './components/SnippetList';
import EmptyState from './components/EmptyState';
import CreateProjectModal from './components/CreateProjectModal';
import EditSnippetModal from './components/EditSnippetModal';
import ConversationList from './components/ConversationList';
import ConversationDetail from './components/ConversationDetail';
import McpSetupWizard from './components/McpSetupWizard';
import { useProjects } from './hooks/useProjects';
import { useConversations } from './hooks/useConversations';
import { Snippet } from '../types';
import { importChatGPTExport } from '../utils/chatgptImporter';
import { wipeAll } from '../utils/storage';

type Tab = 'snippets' | 'conversations';

export default function App() {
  const {
    projects,
    activeProject,
    activeProjectId,
    loading,
    addProject,
    deleteProject,
    setActiveProjectId,
    deleteSnippet,
    addSnippetToActive,
    updateSnippet,
  } = useProjects();
  const conversationsApi = useConversations();

  const [tab, setTab] = useState<Tab>('snippets');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null);
  const [openConversationId, setOpenConversationId] = useState<string | null>(null);
  const [showMcpWizard, setShowMcpWizard] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateProject = async (name: string) => {
    try {
      await addProject(name);
      toast.success(`Project "${name}" created`);
      setShowCreateModal(false);
    } catch {
      toast.error('Failed to create project');
    }
  };

  const handleDeleteProject = async (id: string) => {
    const project = projects.find(p => p.id === id);
    if (confirm(`Are you sure you want to delete "${project?.name}"?`)) {
      try {
        await deleteProject(id);
        toast.success(`Project "${project?.name}" deleted`);
      } catch {
        toast.error('Failed to delete project');
      }
    }
  };

  const handleDeleteSnippet = async (snippetId: string) => {
    if (!activeProjectId) return;
    try {
      await deleteSnippet(activeProjectId, snippetId);
      toast.success('Snippet deleted');
    } catch {
      toast.error('Failed to delete snippet');
    }
  };

  const handleEditSnippet = async (label: string | undefined, content: string) => {
    if (!activeProjectId || !editingSnippet) return;
    try {
      await updateSnippet(activeProjectId, editingSnippet.id, { label, content });
      toast.success('Snippet updated');
      setEditingSnippet(null);
    } catch {
      toast.error('Failed to update snippet');
    }
  };

  const handleClipPage = async () => {
    if (!activeProjectId) {
      toast.error('Please select a project first');
      return;
    }
    try {
      const [tabInfo] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabInfo?.id) return;
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabInfo.id },
        func: () => {
          const article = document.querySelector('article');
          const main = document.querySelector('main');
          const body = document.body;
          let content = '';
          if (article) content = article.innerText;
          else if (main) content = main.innerText;
          else content = body.innerText;
          content = content.replace(/\s+/g, ' ').trim().slice(0, 8000);
          return { content, title: document.title, url: window.location.href };
        },
      });
      const pageData = results[0]?.result;
      if (pageData) {
        await addSnippetToActive({
          type: 'page_summary',
          content: pageData.content,
          sourceUrl: pageData.url,
          sourceTitle: pageData.title,
        });
        toast.success('Page clipped successfully');
      }
    } catch (error) {
      toast.error('Failed to clip page');
      console.error(error);
    }
  };

  const handleAddNote = async (content: string) => {
    if (!activeProjectId) {
      toast.error('Please select a project first');
      return;
    }
    try {
      await addSnippetToActive({ type: 'note', content });
      toast.success('Note added');
    } catch {
      toast.error('Failed to add note');
    }
  };

  const handleImportChatGPT = async (file: File) => {
    try {
      const text = await file.text();
      const result = await importChatGPTExport(text);
      if (result.errors.length) {
        console.error('ChatGPT import errors', result.errors);
      }
      if (result.imported > 0) {
        toast.success(`Imported ${result.imported} ChatGPT conversation${result.imported === 1 ? '' : 's'}`);
        setTab('conversations');
      } else {
        toast.error(result.errors[0] ?? 'No conversations could be imported');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to read import file');
    }
  };

  const handleWipeAll = async () => {
    if (
      confirm(
        'Wipe ALL Context Stash data — projects, snippets, conversations, memory? This cannot be undone.',
      )
    ) {
      await wipeAll();
      toast.success('All data wiped');
    }
  };

  const openConversation = openConversationId
    ? conversationsApi.conversations.find(c => c.id === openConversationId) ?? null
    : null;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="animate-pulse text-slate-400 text-sm font-medium">Loading Context Stash...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white text-slate-900 font-sans antialiased">
      {tab === 'snippets' || !openConversation ? (
        <Header
          activeProject={activeProject}
          projects={projects}
          onProjectSelect={setActiveProjectId}
          onCreateProject={() => setShowCreateModal(true)}
          onDeleteProject={handleDeleteProject}
          onClipPage={handleClipPage}
          onAddNote={handleAddNote}
        />
      ) : null}

      {!openConversation && (
        <nav className="flex border-b border-slate-200 bg-white">
          <button
            onClick={() => setTab('snippets')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
              tab === 'snippets'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" /> Snippets
          </button>
          <button
            onClick={() => setTab('conversations')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
              tab === 'conversations'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" /> Conversations
            {conversationsApi.conversations.length > 0 && (
              <span className="ml-0.5 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                {conversationsApi.conversations.length}
              </span>
            )}
          </button>
        </nav>
      )}

      <main className="flex-1 overflow-y-auto custom-scrollbar">
        {tab === 'snippets' && (
          <>
            {!activeProject ? (
              <EmptyState type="no-project" onCreateProject={() => setShowCreateModal(true)} />
            ) : activeProject.snippets.length === 0 ? (
              <EmptyState type="no-snippets" projectName={activeProject.name} />
            ) : (
              <SnippetList
                snippets={activeProject.snippets}
                onDelete={handleDeleteSnippet}
                onEdit={setEditingSnippet}
              />
            )}
          </>
        )}

        {tab === 'conversations' && (
          <>
            {openConversation ? (
              <ConversationDetail
                conversation={openConversation}
                onBack={() => setOpenConversationId(null)}
                onToggleAutoSync={conversationsApi.setAutoSync}
                onDelete={conversationsApi.remove}
              />
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50/40">
                  <div className="text-[11px] text-slate-500">
                    Open ChatGPT and right-click → "Harvest this conversation".
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs px-2 py-1 rounded-md border border-slate-200 hover:bg-white inline-flex items-center gap-1"
                      title="Import ChatGPT conversations.json"
                    >
                      <Upload className="w-3 h-3" /> Import
                    </button>
                    <button
                      onClick={() => setShowMcpWizard(true)}
                      className="text-xs px-2 py-1 rounded-md border border-slate-200 hover:bg-white inline-flex items-center gap-1"
                      title="Connect to Claude Code / Cursor / Zed"
                    >
                      <Server className="w-3 h-3" /> Agents
                    </button>
                    <button
                      onClick={handleWipeAll}
                      className="text-xs px-2 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
                      title="Wipe all data"
                    >
                      <AlertTriangle className="w-3 h-3" /> Wipe
                    </button>
                  </div>
                </div>
                <ConversationList
                  conversations={conversationsApi.conversations}
                  onOpen={setOpenConversationId}
                  onToggleAutoSync={conversationsApi.setAutoSync}
                  onDelete={conversationsApi.remove}
                />
              </>
            )}
          </>
        )}
      </main>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleImportChatGPT(file);
          e.target.value = '';
        }}
      />

      {showCreateModal && (
        <CreateProjectModal
          onSubmit={handleCreateProject}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {editingSnippet && (
        <EditSnippetModal
          snippet={editingSnippet}
          onSave={handleEditSnippet}
          onClose={() => setEditingSnippet(null)}
        />
      )}

      <McpSetupWizard open={showMcpWizard} onClose={() => setShowMcpWizard(false)} />
    </div>
  );
}

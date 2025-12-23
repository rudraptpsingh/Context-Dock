import { useState } from 'react';
import { toast } from 'sonner';
import Header from './components/Header';
import SnippetList from './components/SnippetList';
import EmptyState from './components/EmptyState';
import CreateProjectModal from './components/CreateProjectModal';
import EditSnippetModal from './components/EditSnippetModal';
import { useProjects } from './hooks/useProjects';
import { Snippet } from '../types';

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

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null);

  const handleCreateProject = async (name: string) => {
    try {
      await addProject(name);
      toast.success(`Project "${name}" created`);
      setShowCreateModal(false);
    } catch (error) {
      toast.error('Failed to create project');
    }
  };

  const handleDeleteProject = async (id: string) => {
    const project = projects.find(p => p.id === id);
    // Confirm delete if needed, or just do it (Sonner toast can undo? maybe later)
    if (confirm(`Are you sure you want to delete "${project?.name}"?`)) {
      try {
        await deleteProject(id);
        toast.success(`Project "${project?.name}" deleted`);
      } catch (error) {
        toast.error('Failed to delete project');
      }
    }
  };

  const handleDeleteSnippet = async (snippetId: string) => {
    if (!activeProjectId) return;
    try {
      await deleteSnippet(activeProjectId, snippetId);
      toast.success('Snippet deleted');
    } catch (error) {
      toast.error('Failed to delete snippet');
    }
  };

  const handleEditSnippet = async (label: string | undefined, content: string) => {
    if (!activeProjectId || !editingSnippet) return;
    try {
      await updateSnippet(activeProjectId, editingSnippet.id, { label, content });
      toast.success('Snippet updated');
      setEditingSnippet(null);
    } catch (error) {
      toast.error('Failed to update snippet');
    }
  };

  const handleClipPage = async () => {
    if (!activeProjectId) {
      toast.error('Please select a project first');
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      // Inject a script to get page content
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Get main content - simplified approach
          const article = document.querySelector('article');
          const main = document.querySelector('main');
          const body = document.body;

          let content = '';
          if (article) {
            content = article.innerText;
          } else if (main) {
            content = main.innerText;
          } else {
            content = body.innerText;
          }

          // Clean up and limit
          content = content
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 8000);

          return {
            content,
            title: document.title,
            url: window.location.href,
          };
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
      await addSnippetToActive({
        type: 'note',
        content,
      });
      toast.success('Note added');
    } catch (error) {
      toast.error('Failed to add note');
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="animate-pulse text-slate-400 text-sm font-medium">Loading Context Stash...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white text-slate-900 font-sans antialiased">
      <Header
        activeProject={activeProject}
        projects={projects}
        onProjectSelect={setActiveProjectId}
        onCreateProject={() => setShowCreateModal(true)}
        onDeleteProject={handleDeleteProject}
        onClipPage={handleClipPage}
        onAddNote={handleAddNote}
      />

      <main className="flex-1 overflow-y-auto custom-scrollbar">
        {!activeProject ? (
          <EmptyState
            type="no-project"
            onCreateProject={() => setShowCreateModal(true)}
          />
        ) : activeProject.snippets.length === 0 ? (
          <EmptyState
            type="no-snippets"
            projectName={activeProject.name}
          />
        ) : (
          <SnippetList
            snippets={activeProject.snippets}
            onDelete={handleDeleteSnippet}
            onEdit={setEditingSnippet}
          />
        )}
      </main>

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
    </div>
  );
}

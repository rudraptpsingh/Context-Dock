import { Snippet } from '../../types';
import SnippetCard from './SnippetCard';

interface SnippetListProps {
  snippets: Snippet[];
  onDelete: (id: string) => void;
  onEdit: (snippet: Snippet) => void;
}

export default function SnippetList({ snippets, onDelete, onEdit }: SnippetListProps) {
  // Sort by timestamp, newest first
  const sortedSnippets = [...snippets].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="flex flex-col pb-4">
      {sortedSnippets.map((snippet) => (
        <SnippetCard
          key={snippet.id}
          snippet={snippet}
          onDelete={() => onDelete(snippet.id)}
          onEdit={() => onEdit(snippet)}
        />
      ))}
    </div>
  );
}

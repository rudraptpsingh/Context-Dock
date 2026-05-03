import { useCallback, useEffect, useState } from 'react';
import { Conversation } from '../../types';
import * as storage from '../../utils/storage';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setConversations(await storage.getConversations());
    } catch (err) {
      console.error('Failed to load conversations', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area === 'local' && changes.conversations) {
        setConversations(changes.conversations.newValue ?? []);
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    const onMsg = (msg: { type: string }) => {
      if (msg.type === 'REFRESH_DATA') load();
    };
    chrome.runtime.onMessage.addListener(onMsg);
    return () => {
      chrome.storage.onChanged.removeListener(onChange);
      chrome.runtime.onMessage.removeListener(onMsg);
    };
  }, [load]);

  const setAutoSync = useCallback(async (id: string, autoSync: boolean) => {
    await storage.setConversationAutoSync(id, autoSync);
  }, []);

  const remove = useCallback(async (id: string) => {
    await storage.deleteConversation(id);
  }, []);

  const update = useCallback(
    async (id: string, updates: Partial<Conversation>) => {
      await storage.updateConversation(id, updates);
    },
    [],
  );

  return {
    conversations,
    loading,
    setAutoSync,
    remove,
    update,
    refresh: load,
  };
}

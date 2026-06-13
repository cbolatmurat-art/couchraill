import sys

with open("context/AppContext.tsx", "r", encoding="utf-8") as f:
    content = f.read()

hide_target = """      // Optimistic remove from global array
      setConversations(prev => {
        const next = prev.filter(c => c.id !== conversationId);
        return next;
      });"""

hide_replace = """      // Optimistic remove from global array
      // DO NOT filter it out from the main conversations array, so it can be easily restored!
      // setConversations(prev => prev.filter(c => c.id !== conversationId));"""

content = content.replace(hide_target, hide_replace)

with open("context/AppContext.tsx", "w", encoding="utf-8") as f:
    f.write(content)

print("context/AppContext.tsx updated")

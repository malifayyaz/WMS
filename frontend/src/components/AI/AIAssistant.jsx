import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Fab,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  TextField,
  IconButton,
  Chip,
  CircularProgress,
  Stack,
  List,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  Tooltip,
  Divider,
} from '@mui/material';
import SmartToy from '@mui/icons-material/SmartToy';
import Close from '@mui/icons-material/Close';
import Send from '@mui/icons-material/Send';
import AddComment from '@mui/icons-material/AddComment';
import History from '@mui/icons-material/History';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import ArrowBack from '@mui/icons-material/ArrowBack';
import { aiAPI } from '../../services/api';

const EXAMPLE_CHIPS = ['Customer balances', 'Stock levels', 'This month profit'];
const STORAGE_KEY = 'wms_ai_chats_v1';

function createChat() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: 'New chat',
    messages: [],
    updatedAt: Date.now(),
  };
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.chats?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStore(chats, activeChatId) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ chats, activeChatId })
  );
}

function titleFromMessages(messages) {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser?.content) return 'New chat';
  const t = firstUser.content.trim();
  return t.length > 42 ? `${t.slice(0, 42)}…` : t;
}

function formatChatTime(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function getInitialState() {
  const stored = loadStore();
  if (stored?.chats?.length) {
    const activeId =
      stored.chats.find((c) => c.id === stored.activeChatId)?.id ||
      stored.chats[0].id;
    return { chats: stored.chats, activeChatId: activeId };
  }
  const chat = createChat();
  return { chats: [chat], activeChatId: chat.id };
}

export default function AIAssistant() {
  const initial = getInitialState();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('chat'); // 'chat' | 'history'
  const [chats, setChats] = useState(initial.chats);
  const [activeChatId, setActiveChatId] = useState(initial.activeChatId);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  const activeChat = chats.find((c) => c.id === activeChatId) || chats[0];
  const messages = activeChat?.messages || [];

  useEffect(() => {
    if (!activeChat && chats.length) {
      setActiveChatId(chats[0].id);
    }
  }, [activeChat, chats]);

  useEffect(() => {
    saveStore(chats, activeChatId);
  }, [chats, activeChatId]);

  useEffect(() => {
    if (view === 'chat' && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, view, activeChatId]);

  const updateActiveMessages = useCallback(
    (updater) => {
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== activeChatId) return chat;
          const nextMessages =
            typeof updater === 'function' ? updater(chat.messages) : updater;
          return {
            ...chat,
            messages: nextMessages,
            title: titleFromMessages(nextMessages),
            updatedAt: Date.now(),
          };
        })
      );
    },
    [activeChatId]
  );

  const startNewChat = () => {
    if (loading) return;
    const chat = createChat();
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(chat.id);
    setInput('');
    setView('chat');
  };

  const openChat = (id) => {
    if (loading) return;
    setActiveChatId(id);
    setInput('');
    setView('chat');
  };

  const deleteChat = (id, e) => {
    e?.stopPropagation?.();
    if (loading) return;

    setChats((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      if (!remaining.length) {
        const fresh = createChat();
        setActiveChatId(fresh.id);
        setView('chat');
        return [fresh];
      }
      if (id === activeChatId) {
        setActiveChatId(remaining[0].id);
        setView('chat');
      }
      return remaining;
    });
  };

  const deleteCurrentChat = () => {
    if (!activeChat) return;
    deleteChat(activeChat.id);
  };

  const sendMessage = async (textOverride) => {
    const text = (typeof textOverride === 'string' ? textOverride : input).trim();
    if (!text || loading || !activeChat) return;

    const conversationHistory = messages.map(({ role, content }) => ({
      role,
      content,
    }));

    updateActiveMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);

    try {
      const response = await aiAPI.chat({
        message: text,
        conversationHistory,
      });
      const answer =
        response.data?.data?.answer ||
        response.data?.answer ||
        'Sorry, I could not generate a response.';
      updateActiveMessages((prev) => [
        ...prev,
        { role: 'assistant', content: answer },
      ]);
    } catch (err) {
      const errMsg =
        err.response?.data?.message ||
        err.message ||
        'Something went wrong. Please try again.';
      updateActiveMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${errMsg}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const totalMessages = chats.reduce((n, c) => n + (c.messages?.length || 0), 0);
  const sortedChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);

  const iconBtnSx = { color: 'text.primary' };

  return (
    <>
      <Fab
        color="primary"
        onClick={() => setOpen(true)}
        sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1300 }}
        aria-label="Open AI Assistant"
      >
        <Badge
          badgeContent={totalMessages || 0}
          color="error"
          invisible={totalMessages === 0}
        >
          <SmartToy />
        </Badge>
      </Fab>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { height: '560px', display: 'flex', flexDirection: 'column' },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            pr: 1,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          {view === 'history' ? (
            <Tooltip title="Back to chat">
              <IconButton
                onClick={() => setView('chat')}
                size="small"
                sx={iconBtnSx}
                aria-label="Back"
              >
                <ArrowBack />
              </IconButton>
            </Tooltip>
          ) : (
            <SmartToy color="primary" />
          )}

          <Typography
            variant="h6"
            component="span"
            sx={{
              flexGrow: 1,
              ml: 0.5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {view === 'history' ? 'Chat history' : 'AI Assistant'}
          </Typography>

          {view === 'chat' && (
            <>
              <Tooltip title="Chat history">
                <IconButton
                  onClick={() => setView('history')}
                  size="small"
                  sx={iconBtnSx}
                  aria-label="Chat history"
                >
                  <Badge
                    color="primary"
                    badgeContent={chats.length}
                    max={99}
                    invisible={chats.length < 2}
                  >
                    <History />
                  </Badge>
                </IconButton>
              </Tooltip>
              <Tooltip title="New chat">
                <span>
                  <IconButton
                    onClick={startNewChat}
                    size="small"
                    sx={iconBtnSx}
                    disabled={loading}
                    aria-label="New chat"
                  >
                    <AddComment />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Delete this chat">
                <span>
                  <IconButton
                    onClick={deleteCurrentChat}
                    size="small"
                    sx={iconBtnSx}
                    disabled={loading || (messages.length === 0 && chats.length <= 1)}
                    aria-label="Delete chat"
                  >
                    <DeleteOutline />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          )}

          <IconButton
            onClick={() => setOpen(false)}
            aria-label="Close"
            size="small"
            sx={iconBtnSx}
          >
            <Close />
          </IconButton>
        </DialogTitle>

        <DialogContent
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            py: 2,
          }}
        >
          {view === 'history' ? (
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              {sortedChats.length === 0 ? (
                <Typography color="text.secondary" textAlign="center" py={4}>
                  No chats yet
                </Typography>
              ) : (
                <List disablePadding>
                  {sortedChats.map((chat, idx) => (
                    <React.Fragment key={chat.id}>
                      {idx > 0 && <Divider component="li" />}
                      <ListItemButton
                        selected={chat.id === activeChatId}
                        onClick={() => openChat(chat.id)}
                        sx={{ pr: 7, borderRadius: 1 }}
                      >
                        <ListItemText
                          primary={chat.title || 'New chat'}
                          secondary={`${chat.messages.length} message${
                            chat.messages.length === 1 ? '' : 's'
                          } · ${formatChatTime(chat.updatedAt)}`}
                          primaryTypographyProps={{
                            noWrap: true,
                            fontWeight: chat.id === activeChatId ? 600 : 500,
                          }}
                          secondaryTypographyProps={{ noWrap: true }}
                        />
                        <ListItemSecondaryAction>
                          <Tooltip title="Delete chat">
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={(e) => deleteChat(chat.id, e)}
                              sx={iconBtnSx}
                              aria-label="Delete chat"
                            >
                              <DeleteOutline fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </ListItemSecondaryAction>
                      </ListItemButton>
                    </React.Fragment>
                  ))}
                </List>
              )}
            </Box>
          ) : (
            <Box
              sx={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                pr: 0.5,
              }}
            >
              {messages.length === 0 && !loading && (
                <Box
                  sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    textAlign: 'center',
                    py: 4,
                  }}
                >
                  <Typography color="text.secondary">
                    Ask me anything about your business
                  </Typography>
                  <Stack
                    direction="row"
                    flexWrap="wrap"
                    gap={1}
                    justifyContent="center"
                  >
                    {EXAMPLE_CHIPS.map((chip) => (
                      <Chip
                        key={chip}
                        label={chip}
                        clickable
                        onClick={() => sendMessage(chip)}
                        variant="outlined"
                        color="primary"
                      />
                    ))}
                  </Stack>
                </Box>
              )}

              {messages.map((msg, idx) => (
                <Box
                  key={`${msg.role}-${idx}`}
                  sx={{
                    display: 'flex',
                    justifyContent:
                      msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <Box
                    sx={{
                      bgcolor: msg.role === 'user' ? 'primary.main' : 'grey.100',
                      color: msg.role === 'user' ? 'white' : 'text.primary',
                      borderRadius:
                        msg.role === 'user'
                          ? '18px 18px 4px 18px'
                          : '18px 18px 18px 4px',
                      px: 2,
                      py: 1,
                      maxWidth: '80%',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    <Typography variant="body2">{msg.content}</Typography>
                  </Box>
                </Box>
              ))}

              {loading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 1 }}>
                  <CircularProgress size={20} />
                  <Typography variant="body2" color="text.secondary">
                    Thinking...
                  </Typography>
                </Box>
              )}

              <div ref={bottomRef} />
            </Box>
          )}
        </DialogContent>

        {view === 'chat' && (
          <DialogActions sx={{ px: 2, pb: 2, gap: 1, alignItems: 'center' }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Ask in English or Urdu..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
              multiline
              maxRows={3}
            />
            <IconButton
              color="primary"
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              aria-label="Send"
              sx={{ color: !input.trim() || loading ? undefined : 'primary.main' }}
            >
              <Send />
            </IconButton>
          </DialogActions>
        )}

        {view === 'history' && (
          <DialogActions sx={{ px: 2, pb: 2 }}>
            <Tooltip title="Start a new chat">
              <Chip
                icon={<AddComment />}
                label="New chat"
                color="primary"
                clickable
                onClick={startNewChat}
                disabled={loading}
              />
            </Tooltip>
          </DialogActions>
        )}
      </Dialog>
    </>
  );
}

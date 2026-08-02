import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Button,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import SmartToy from '@mui/icons-material/SmartToy';
import Close from '@mui/icons-material/Close';
import Send from '@mui/icons-material/Send';
import AddComment from '@mui/icons-material/AddComment';
import History from '@mui/icons-material/History';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import ArrowBack from '@mui/icons-material/ArrowBack';
import OpenInNew from '@mui/icons-material/OpenInNew';
import { aiAPI } from '../../services/api';

const EXAMPLE_CHIPS = [
  'Customer balances',
  'Cash in hand today',
  'This month profit',
  'Ready stock',
  'Low stock alerts',
  'Annealing pending',
  'Processing stock',
];

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ chats, activeChatId }));
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

/** Lightweight markdown: **bold**, bullets, line breaks. */
function MessageBody({ content, isUser }) {
  const lines = String(content || '').split('\n');
  return (
    <Box sx={{ '& p': { m: 0, mb: 0.75 }, '& p:last-child': { mb: 0 } }}>
      {lines.map((line, i) => {
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        const text = bullet ? bullet[1] : line;
        const parts = [];
        const re = /\*\*(.+?)\*\*/g;
        let last = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
          if (m.index > last) parts.push(text.slice(last, m.index));
          parts.push(
            <Box component="strong" key={`b-${i}-${m.index}`} fontWeight={700}>
              {m[1]}
            </Box>
          );
          last = m.index + m[0].length;
        }
        if (last < text.length) parts.push(text.slice(last));
        if (!text && !bullet) {
          return <Box key={i} sx={{ height: 8 }} />;
        }
        return (
          <Typography
            key={i}
            variant="body2"
            component="p"
            sx={{
              color: isUser ? 'inherit' : 'text.primary',
              pl: bullet ? 1.5 : 0,
              position: 'relative',
              ...(bullet
                ? {
                    '&::before': {
                      content: '"•"',
                      position: 'absolute',
                      left: 0,
                    },
                  }
                : {}),
            }}
          >
            {parts.length ? parts : text || '\u00A0'}
          </Typography>
        );
      })}
    </Box>
  );
}

export default function AIAssistant() {
  const navigate = useNavigate();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const initial = getInitialState();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('chat');
  const [chats, setChats] = useState(initial.chats);
  const [activeChatId, setActiveChatId] = useState(initial.activeChatId);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  const activeChat = chats.find((c) => c.id === activeChatId) || chats[0];
  const messages = activeChat?.messages || [];

  useEffect(() => {
    if (!activeChat && chats.length) setActiveChatId(chats[0].id);
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

  const goToLink = (path) => {
    setOpen(false);
    navigate(path);
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
      const payload = response.data?.data || {};
      const answer =
        payload.answer ||
        response.data?.answer ||
        'Sorry, I could not generate a response.';
      updateActiveMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: answer,
          domainsFetched: payload.domainsFetched || [],
          period: payload.period || null,
          deepLinks: payload.deepLinks || [],
        },
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

  const chatCount = chats.filter((c) => (c.messages || []).length > 0).length;
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
          badgeContent={chatCount || 0}
          color="error"
          invisible={chatCount === 0}
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
          sx: { height: { xs: '100%', sm: '600px' }, display: 'flex', flexDirection: 'column' },
        }}
        fullScreen={fullScreen}
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
              <IconButton onClick={() => setView('chat')} size="small" sx={iconBtnSx}>
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
                <IconButton onClick={() => setView('history')} size="small" sx={iconBtnSx}>
                  <Badge color="primary" badgeContent={chats.length} max={99} invisible={chats.length < 2}>
                    <History />
                  </Badge>
                </IconButton>
              </Tooltip>
              <Tooltip title="New chat">
                <span>
                  <IconButton onClick={startNewChat} size="small" sx={iconBtnSx} disabled={loading}>
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
                  >
                    <DeleteOutline />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          )}

          <IconButton onClick={() => setOpen(false)} size="small" sx={iconBtnSx}>
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
                          <IconButton edge="end" size="small" onClick={(e) => deleteChat(chat.id, e)} sx={iconBtnSx}>
                            <DeleteOutline fontSize="small" />
                          </IconButton>
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
                    py: 3,
                  }}
                >
                  <Typography color="text.secondary">
                    Ask me anything about your business
                  </Typography>
                  <Stack direction="row" flexWrap="wrap" gap={1} justifyContent="center">
                    {EXAMPLE_CHIPS.map((chip) => (
                      <Chip
                        key={chip}
                        label={chip}
                        clickable
                        onClick={() => sendMessage(chip)}
                        variant="outlined"
                        color="primary"
                        size="small"
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
                    flexDirection: 'column',
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    gap: 0.5,
                  }}
                >
                  <Box
                    sx={{
                      bgcolor: msg.role === 'user' ? 'primary.main' : 'grey.100',
                      color: msg.role === 'user' ? 'white' : 'text.primary',
                      borderRadius:
                        msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      px: 2,
                      py: 1.25,
                      maxWidth: '88%',
                      wordBreak: 'break-word',
                    }}
                  >
                    <MessageBody content={msg.content} isUser={msg.role === 'user'} />
                  </Box>

                  {msg.role === 'assistant' && (msg.domainsFetched?.length > 0 || msg.period) && (
                    <Stack direction="row" flexWrap="wrap" gap={0.5} px={0.5}>
                      {msg.period?.label && (
                        <Chip size="small" variant="outlined" label={msg.period.label} />
                      )}
                      {(msg.domainsFetched || []).slice(0, 6).map((d) => (
                        <Chip key={d} size="small" label={d} sx={{ bgcolor: 'grey.200' }} />
                      ))}
                    </Stack>
                  )}

                  {msg.role === 'assistant' && msg.deepLinks?.length > 0 && (
                    <Stack direction="row" flexWrap="wrap" gap={0.5} px={0.5}>
                      {msg.deepLinks.map((link) => (
                        <Button
                          key={`${link.path}-${link.label}`}
                          size="small"
                          variant="text"
                          endIcon={<OpenInNew sx={{ fontSize: 14 }} />}
                          onClick={() => goToLink(link.path)}
                          sx={{ textTransform: 'none', color: 'primary.dark' }}
                        >
                          {link.label}
                        </Button>
                      ))}
                    </Stack>
                  )}
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
              sx={{ color: !input.trim() || loading ? undefined : 'primary.main' }}
            >
              <Send />
            </IconButton>
          </DialogActions>
        )}

        {view === 'history' && (
          <DialogActions sx={{ px: 2, pb: 2 }}>
            <Chip
              icon={<AddComment />}
              label="New chat"
              color="primary"
              clickable
              onClick={startNewChat}
              disabled={loading}
            />
          </DialogActions>
        )}
      </Dialog>
    </>
  );
}

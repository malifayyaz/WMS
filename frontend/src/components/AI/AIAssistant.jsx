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
  Alert,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import SmartToy from '@mui/icons-material/SmartToy';
import Close from '@mui/icons-material/Close';
import Send from '@mui/icons-material/Send';
import AddComment from '@mui/icons-material/AddComment';
import History from '@mui/icons-material/History';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import ArrowBack from '@mui/icons-material/ArrowBack';
import OpenInNew from '@mui/icons-material/OpenInNew';
import CheckCircle from '@mui/icons-material/CheckCircle';
import Edit from '@mui/icons-material/Edit';
import Cancel from '@mui/icons-material/Cancel';
import Undo from '@mui/icons-material/Undo';
import SwapHoriz from '@mui/icons-material/SwapHoriz';
import QuestionAnswer from '@mui/icons-material/QuestionAnswer';
import { aiAPI } from '../../services/api';

const EXAMPLE_CHIPS = [
  'Add order for Ali Traders',
  'Record customer payment',
  'Add expense',
  'Customer balances',
  'Cash in hand today',
  'This month profit',
];
const STORAGE_KEY = 'wms_ai_chats_v1';
const DAILY_BOOK_DATE_KEY = 'dailyBook.entryDate';

/** Entries with no date typed by the user land on the Daily Book working date. */
function getDefaultEntryDate() {
  try {
    const stored = sessionStorage.getItem(DAILY_BOOK_DATE_KEY);
    if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  } catch {
    /* sessionStorage unavailable */
  }
  return new Date().toISOString().slice(0, 10);
}

function buildEditPrompt(intent, data = {}) {
  const d = data || {};
  switch (intent) {
    case 'CREATE_ORDER':
      return `Order: ${d.customerName || ''}, ${d.initialWeightKg || ''}kg, wire ${d.wireNumber || ''}, rate ${d.ratePerKg || ''}`;
    case 'RECORD_CUSTOMER_PAYMENT':
      return `Payment: ${d.customerName || ''}, Rs.${d.amount || ''}, ${d.paymentMethod || 'Cash'}`;
    case 'CREATE_RAW_MATERIAL_PURCHASE':
      return `Purchase: ${d.supplierName || ''}, ${d.weightInKg || ''}kg ${d.coilCategory || 'coil'}, rate ${d.ratePerKg || ''}`;
    case 'ADD_EXPENSE':
      return `Expense: Rs.${d.amount || ''}, ${d.expenseCategory || d.expenseGroup || ''}, ${d.paymentMethod || 'Cash'}`;
    case 'ATM_WITHDRAWAL':
      return `ATM withdrawal: Rs.${d.amount || ''}, ${d.expenseCategory || d.selfExpensePerson || 'Fayyaz'}, bank ${d.bankAccount || 'MBL'}`;
    case 'ADD_DAILY_TRANSACTION':
      return `Transaction: ${d.transactionType || ''}, Rs.${d.amount || ''}, ${d.relatedName || d.relatedTo || ''}`;
    case 'SEND_ANNEALING':
      return `Send annealing: ${d.weightKg || ''}kg ${d.coilType || d.coilCategory || ''}, bundles ${d.bundles || 0}`;
    case 'ARRIVE_ANNEALING':
      return `Annealing arrival: ${d.weightKg || ''}kg ${d.coilType || d.coilCategory || ''}, loss ${d.weightLossKg || 0}`;
    case 'ADD_PROCESSING_DELIVERY':
      return `Processing delivery: ${d.customerName || ''}, ${d.weightKg || ''}kg, labour Rs.${d.labourAmount || ''}`;
    case 'ADD_CUSTOMER':
      return `New customer: ${d.name || ''}, ${d.customerType || 'Ledger'}, ${d.contactNumber || ''}`;
    case 'ADD_SUPPLIER':
      return `New supplier: ${d.name || ''}, ${d.companyName || ''}, ${d.contactNumber || ''}`;
    case 'ADD_READY_STOCK':
      return `Ready stock: wire ${d.wireNumber || ''}, ${d.producedWeightKg || d.weightKg || ''}kg`;
    case 'ADD_WORKER_PAYMENT':
      return `Worker payment: ${d.workerName || ''}, ${d.entryType || 'Payment'}, Rs.${d.amount || ''}`;
    default:
      return d.previewMessage || '';
  }
}

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
  const [mode, setMode] = useState('agent'); // "agent" | "read"
  const [pendingAction, setPendingAction] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

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
  }, [messages, loading, view, activeChatId, pendingAction, lastSaved, actionLoading]);

  useEffect(() => {
    if (!lastSaved) return undefined;
    const timer = setTimeout(() => setLastSaved(null), 30000);
    return () => clearTimeout(timer);
  }, [lastSaved]);

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

  const addMessage = useCallback(
    (role, content) => {
      updateActiveMessages((prev) => [...prev, { role, content }]);
    },
    [updateActiveMessages]
  );

  const startNewChat = () => {
    if (loading || actionLoading) return;
    const chat = createChat();
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(chat.id);
    setInput('');
    setPendingAction(null);
    setLastSaved(null);
    setView('chat');
  };

  const openChat = (id) => {
    if (loading || actionLoading) return;
    setActiveChatId(id);
    setInput('');
    setPendingAction(null);
    setLastSaved(null);
    setView('chat');
  };

  const deleteChat = (id, e) => {
    e?.stopPropagation?.();
    if (loading || actionLoading) return;

    setChats((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      if (!remaining.length) {
        const fresh = createChat();
        setActiveChatId(fresh.id);
        setView('chat');
        setPendingAction(null);
        setLastSaved(null);
        return [fresh];
      }
      if (id === activeChatId) {
        setActiveChatId(remaining[0].id);
        setView('chat');
        setPendingAction(null);
        setLastSaved(null);
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
    if (!text || loading || actionLoading || !activeChat) return;

    const conversationHistory = messages.map(({ role, content }) => ({
      role,
      content,
    }));

    updateActiveMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setPendingAction(null);
    setLoading(true);

    try {
      if (mode === 'read') {
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
      } else {
        const response = await aiAPI.agentChat({
          message: text,
          conversationHistory,
          defaultDate: getDefaultEntryDate(),
        });
        const data = response.data || {};

        if (data.type === 'answer') {
          setPendingAction(null);
          const answerPayload = data.data || {};
          updateActiveMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content:
                data.answer ||
                answerPayload.answer ||
                'Sorry, I could not generate a response.',
              domainsFetched: answerPayload.domainsFetched || [],
              period: answerPayload.period || null,
              deepLinks: answerPayload.deepLinks || [],
            },
          ]);
        } else if (data.type === 'clarification') {
          setPendingAction(null);
          updateActiveMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content:
                data.message ||
                'Could you give more details? What would you like to do?',
            },
          ]);
        } else if (data.type === 'preview') {
          updateActiveMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content:
                data.previewMessage ||
                'Please confirm this action.',
            },
          ]);
          setPendingAction({
            intent: data.intent,
            extractedData: data.extractedData || {},
            previewMessage: data.previewMessage || '',
            confidence: data.confidence,
            missingFields: data.missingFields || [],
          });
        } else {
          setPendingAction(null);
          updateActiveMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content:
                data.message ||
                data.answer ||
                'Sorry, I could not understand that.',
            },
          ]);
        }
      }
    } catch (err) {
      setPendingAction(null);
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

  const handleConfirmAction = async () => {
    if (!pendingAction || actionLoading) return;
    if (
      Array.isArray(pendingAction.missingFields) &&
      pendingAction.missingFields.length > 0
    ) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await aiAPI.agentExecute({
        intent: pendingAction.intent,
        extractedData: pendingAction.extractedData,
        defaultDate: getDefaultEntryDate(),
      });
      if (res.data?.success) {
        addMessage('assistant', `Done! ${res.data.message}`);
        // Let open screens (DailyBook etc.) refresh after an AI-side mutation.
        try {
          window.dispatchEvent(new Event('wms-ai-updated'));
        } catch {
          // ignore
        }
        if (res.data.undoInfo?.model && res.data.undoInfo?.id) {
          setLastSaved({
            model: res.data.undoInfo.model,
            id: res.data.undoInfo.id,
            deliveryId: res.data.undoInfo.deliveryId,
            message: res.data.message,
          });
        }
        setPendingAction(null);
      } else {
        addMessage('assistant', `Error: ${res.data?.message || 'Action failed'}`);
        setPendingAction(null);
      }
    } catch (e) {
      const errMsg =
        e.response?.data?.message ||
        e.message ||
        'Something went wrong. Please try again.';
      addMessage('assistant', `Error: ${errMsg}`);
      setPendingAction(null);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUndo = async () => {
    if (!lastSaved || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await aiAPI.agentUndo({
        model: lastSaved.model,
        id: lastSaved.id,
        deliveryId: lastSaved.deliveryId,
      });
      if (res.data?.success) {
        addMessage('assistant', `Undone! ${res.data.message}`);
        try {
          window.dispatchEvent(new Event('wms-ai-updated'));
        } catch {
          // ignore
        }
        setLastSaved(null);
      } else {
        addMessage(
          'assistant',
          `Undo failed: ${res.data?.message || 'Please delete manually.'}`
        );
      }
    } catch (e) {
      const errMsg =
        e.response?.data?.message ||
        e.message ||
        'Undo failed. Please delete manually.';
      addMessage('assistant', `Undo failed: ${errMsg}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditAction = () => {
    if (!pendingAction) return;
    const editText = buildEditPrompt(
      pendingAction.intent,
      pendingAction.extractedData
    );
    setInput(editText);
    setPendingAction(null);
    setTimeout(() => inputRef.current?.focus?.(), 0);
  };

  const handleCancelAction = () => {
    setPendingAction(null);
    addMessage('assistant', 'Cancelled.');
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
  const busy = loading || actionLoading;

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
          sx: {
            height: { xs: '100%', sm: '600px' },
            display: 'flex',
            flexDirection: 'column',
            // Override global sidebar/navbar IconButton + ListItem styles inside dialog
            '& .MuiIconButton-root': { color: 'text.primary' },
            '& .MuiListItemButton-root': {
              color: 'text.primary',
              mx: 0,
              '& .MuiListItemIcon-root': { color: 'text.secondary' },
              '&:hover': { backgroundColor: 'action.hover' },
              '&.Mui-selected': {
                backgroundColor: 'action.selected',
                color: 'text.primary',
                '&:hover': { backgroundColor: 'action.selected' },
              },
            },
            '& .MuiListItemText-primary': { color: 'text.primary' },
            '& .MuiListItemText-secondary': { color: 'text.secondary' },
          },
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
            <ToggleButtonGroup
              value={mode}
              exclusive
              onChange={(e, v) => v && setMode(v)}
              size="small"
              sx={{ mr: 0.5 }}
              aria-label="Assistant mode"
            >
              <ToggleButton value="agent" aria-label="Agent mode">
                <SmartToy sx={{ fontSize: 16, mr: 0.5 }} />
                Agent
              </ToggleButton>
              <ToggleButton value="read" aria-label="Ask mode">
                <QuestionAnswer sx={{ fontSize: 16, mr: 0.5 }} />
                Ask
              </ToggleButton>
            </ToggleButtonGroup>
          )}

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
                  <IconButton
                    onClick={startNewChat}
                    size="small"
                    sx={iconBtnSx}
                    disabled={busy}
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
                    disabled={busy || (messages.length === 0 && chats.length <= 1)}
                    aria-label="Delete chat"
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
                    {mode === 'agent'
                      ? 'Ask questions or tell me an action to perform'
                      : 'Ask me anything about your business'}
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

              {pendingAction && (
                <Box
                  sx={{
                    flexShrink: 0,
                    border: '2px solid #1565C0',
                    borderRadius: 2,
                    background: '#DDEEFF',
                    color: '#1E2A36',
                    mx: 1,
                    my: 1,
                    p: 2,
                  }}
                >
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    gap={1}
                    mb={1}
                  >
                    <Typography fontWeight={700} color="text.primary">
                      {pendingAction.intent === 'DELETE_ENTRY'
                        ? 'Confirm Delete?'
                        : pendingAction.intent === 'SHIFT_ENTRY_DATE'
                          ? 'Confirm Move?'
                          : 'Confirm Action?'}
                    </Typography>
                    <Chip
                      size="small"
                      color={
                        pendingAction.intent === 'DELETE_ENTRY'
                          ? 'error'
                          : pendingAction.intent === 'SHIFT_ENTRY_DATE'
                            ? 'warning'
                            : pendingAction.confidence === 'high'
                              ? 'success'
                              : 'warning'
                      }
                      label={
                        pendingAction.intent === 'DELETE_ENTRY'
                          ? 'Permanent'
                          : pendingAction.intent === 'SHIFT_ENTRY_DATE'
                            ? 'Cannot undo'
                            : pendingAction.confidence === 'high'
                              ? 'High Confidence'
                              : 'Please verify'
                      }
                    />
                  </Stack>

                  <Typography
                    variant="body1"
                    color="text.primary"
                    sx={{ whiteSpace: 'pre-wrap', mb: 1.5 }}
                  >
                    {pendingAction.previewMessage}
                  </Typography>

                  {Array.isArray(pendingAction.missingFields) &&
                    pendingAction.missingFields.length > 0 && (
                      <Alert severity="warning" sx={{ mb: 1.5 }}>
                        Missing: {pendingAction.missingFields.join(', ')} —
                        you can still confirm or type more details
                      </Alert>
                    )}

                    <Stack direction="row" flexWrap="wrap" gap={1}>
                      <Button
                        variant="contained"
                        color={
                          pendingAction.intent === 'DELETE_ENTRY'
                            ? 'error'
                            : pendingAction.intent === 'SHIFT_ENTRY_DATE'
                              ? 'warning'
                              : 'primary'
                        }
                        size="small"
                        startIcon={
                          pendingAction.intent === 'DELETE_ENTRY' ? (
                            <DeleteOutline />
                          ) : pendingAction.intent === 'SHIFT_ENTRY_DATE' ? (
                            <SwapHoriz />
                          ) : (
                            <CheckCircle />
                          )
                        }
                        disabled={
                          actionLoading ||
                          (Array.isArray(pendingAction.missingFields) &&
                            pendingAction.missingFields.length > 0)
                        }
                        onClick={handleConfirmAction}
                      >
                        {pendingAction.intent === 'DELETE_ENTRY'
                          ? 'Yes, Delete'
                          : pendingAction.intent === 'SHIFT_ENTRY_DATE'
                            ? 'Yes, Move Dates'
                            : 'Confirm & Save'}
                      </Button>
                    {pendingAction.intent !== 'DELETE_ENTRY' &&
                      pendingAction.intent !== 'SHIFT_ENTRY_DATE' && (
                      <Button
                        variant="outlined"
                        color="primary"
                        size="small"
                        startIcon={<Edit />}
                        disabled={actionLoading}
                        onClick={handleEditAction}
                        sx={{ bgcolor: 'background.paper' }}
                      >
                        Edit Details
                      </Button>
                    )}
                    <Button
                      variant="text"
                      color="error"
                      size="small"
                      startIcon={<Cancel />}
                      disabled={actionLoading}
                      onClick={handleCancelAction}
                    >
                      Cancel
                    </Button>
                  </Stack>
                </Box>
              )}

              {lastSaved && (
                <Alert
                  severity="success"
                  sx={{ mx: 1, my: 0.5, flexShrink: 0 }}
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      startIcon={<Undo />}
                      disabled={actionLoading}
                      onClick={handleUndo}
                    >
                      UNDO
                    </Button>
                  }
                >
                  {lastSaved.message} — Click UNDO to reverse this.
                </Alert>
              )}

              {(loading || actionLoading) && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 1 }}>
                  <CircularProgress size={20} />
                  <Typography variant="body2" color="text.secondary">
                    {actionLoading ? 'Working...' : 'Thinking...'}
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
              placeholder={
                mode === 'agent'
                  ? 'Ask or give an action in English or Urdu...'
                  : 'Ask in English or Urdu...'
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={busy}
              multiline
              maxRows={3}
              inputRef={inputRef}
            />
            <IconButton
              color="primary"
              onClick={() => sendMessage()}
              disabled={!input.trim() || busy}
              aria-label="Send"
              sx={{ color: !input.trim() || busy ? undefined : 'primary.main' }}
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
                disabled={busy}
              />
            </Tooltip>
          </DialogActions>
        )}
      </Dialog>
    </>
  );
}

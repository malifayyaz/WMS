import { useState, useEffect, useCallback } from 'react';

const KEYS = {
  entryDate: 'dailyBook.entryDate',
  startDate: 'dailyBook.startDate',
  endDate: 'dailyBook.endDate',
  mainTab: 'dailyBook.mainTab',
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function readStored(key, fallback) {
  try {
    const v = sessionStorage.getItem(key);
    return v != null && v !== '' ? v : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    if (value == null || value === '') sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, String(value));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Persist Daily Book working date, range, and tab across navigation remounts.
 */
export default function useDailyBookSession() {
  const [entryDate, setEntryDateState] = useState(() => readStored(KEYS.entryDate, todayStr()));
  const [startDate, setStartDateState] = useState(() => readStored(KEYS.startDate, ''));
  const [endDate, setEndDateState] = useState(() => readStored(KEYS.endDate, ''));
  const [mainTab, setMainTabState] = useState(() => {
    const raw = readStored(KEYS.mainTab, '0');
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 5 ? n : 0;
  });

  const setEntryDate = useCallback((v) => {
    setEntryDateState(v);
    writeStored(KEYS.entryDate, v);
  }, []);

  const setStartDate = useCallback((v) => {
    setStartDateState(v);
    writeStored(KEYS.startDate, v);
  }, []);

  const setEndDate = useCallback((v) => {
    setEndDateState(v);
    writeStored(KEYS.endDate, v);
  }, []);

  const setMainTab = useCallback((v) => {
    setMainTabState(v);
    writeStored(KEYS.mainTab, v);
  }, []);

  // Keep storage in sync if state was set from elsewhere
  useEffect(() => {
    writeStored(KEYS.entryDate, entryDate);
  }, [entryDate]);
  useEffect(() => {
    writeStored(KEYS.startDate, startDate);
  }, [startDate]);
  useEffect(() => {
    writeStored(KEYS.endDate, endDate);
  }, [endDate]);
  useEffect(() => {
    writeStored(KEYS.mainTab, mainTab);
  }, [mainTab]);

  return {
    entryDate,
    setEntryDate,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    mainTab,
    setMainTab,
  };
}

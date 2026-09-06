'use client';

import { useEffect } from 'react';

let activeLocks = 0;
let previousOverflow = '';

/** Nested dialogs release only their own lock, preserving the original body style. */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    if (activeLocks === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    activeLocks += 1;
    return () => {
      activeLocks -= 1;
      if (activeLocks === 0) document.body.style.overflow = previousOverflow;
    };
  }, [locked]);
}

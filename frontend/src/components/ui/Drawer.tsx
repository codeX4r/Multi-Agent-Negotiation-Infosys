'use client';

import { useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '@/stores/ui-store';

export interface DrawerProps {
  id: string;
  children?: React.ReactNode;
  className?: string;
}

export function Drawer({ id, children, className = '' }: DrawerProps) {
  const { drawer, closeDrawer } = useUIStore();

  const isOpen = drawer?.isOpen === true && drawer.id === id;

  // ⚠️ ALL hooks must be called unconditionally before any early return
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, closeDrawer]);

  if (!isOpen) return null;

  const drawerContent = (
    <div className={`drawer show ${className}`} style={{ width: 'min(400px, 94vw)' }}>
      <div className="row between" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Settings</h2>
        <button className="ibtn" onClick={closeDrawer} aria-label="Close">✕</button>
      </div>
      {children}
    </div>
  );

  return createPortal(drawerContent, document.body);
}

export function useDrawer() {
  const { openDrawer, closeDrawer } = useUIStore();
  return { open: openDrawer, close: closeDrawer };
}
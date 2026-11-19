'use client';

import { useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '@/stores/ui-store';

export interface ModalProps {
  children?: ReactNode;
  onClose?: () => void;
  closable?: boolean;
  className?: string;
  level?: 'default' | 'l2';
}

export function Modal({ children, onClose, closable = true, className = '', level = 'default' }: ModalProps) {
  const { modal, closeModal } = useUIStore();

  if (!modal?.isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closable) {
      closeModal();
      onClose?.();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && closable) {
      closeModal();
      onClose?.();
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, []);

  const modalContent = (
    <div className="overlay show" onClick={handleOverlayClick}>
      <div className={`modal ${level === 'l2' ? 'l2' : ''} ${className}`}>
        {children}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export function useModal() {
  const { openModal, closeModal } = useUIStore();

  return {
    open: (content: ReactNode, closable?: boolean) => openModal(content, closable),
    close: closeModal,
  };
}
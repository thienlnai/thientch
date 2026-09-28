/**
 * Backward compatibility alias: SupabaseConfigModal now points to TursoConfigModal
 * Transfers all Supabase references to Turso SQLite Cloud & GitHub Image Storage
 */
import React from 'react';
import { TursoConfigModal } from './TursoConfigModal.tsx';

export interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = (props) => {
  return <TursoConfigModal {...props} />;
};

export default SupabaseConfigModal;

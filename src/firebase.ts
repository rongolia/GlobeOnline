import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export enum OperationType {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
}

export function handleFirestoreError(error: unknown, operation: OperationType, path: string): never {
  const err = error as { code?: string; message?: string };
  const errInfo = {
    error: err?.message || String(error),
    operation,
    path,
  };
  console.error(`[Firestore Error] ${operation.toUpperCase()} at ${path}:`, errInfo);
  throw new Error(`Database error during ${operation} at ${path}: ${err?.message || 'Unknown error'}`);
}

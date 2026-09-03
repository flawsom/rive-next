// Settings storage. Key renamed from "RiveStreamSettings"; legacy data is
// migrated automatically by migrateLegacyStorageKeys() at app boot.
import { migrateLegacyStorageKeys } from "./storageMigration";

const STORAGE_KEY = "OpenStreamSettings";

export const getSettings = () => {
  migrateLegacyStorageKeys();
  const values: any = localStorage.getItem(STORAGE_KEY);
  return JSON.parse(values);
};

export const setSettings = ({ values }: any) => {
  migrateLegacyStorageKeys();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
};

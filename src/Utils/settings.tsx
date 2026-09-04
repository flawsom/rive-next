// Settings storage. Key renamed from "RiveStreamSettings"; legacy data is
// migrated automatically by migrateLegacyStorageKeys() at app boot.
// Settings are scoped per profile: the default profile keeps the legacy key,
// extra profiles get their own settings namespace.
import { migrateLegacyStorageKeys } from "./storageMigration";
import { getScopedKey } from "./profiles";

const storageKey = () => getScopedKey("OpenStreamSettings");

export const getSettings = () => {
  migrateLegacyStorageKeys();
  const values: any = localStorage.getItem(storageKey());
  return JSON.parse(values);
};

export const setSettings = ({ values }: any) => {
  migrateLegacyStorageKeys();
  localStorage.setItem(storageKey(), JSON.stringify(values));
};

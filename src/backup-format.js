// backup-format.js — shared constants for the Newtab JSON backup format.
//
// The writer (bookmark-export.toJsonBackup) stamps format: BACKUP_FORMAT on
// every export. The reader (bookmark-import.parseBackupJson) accepts both the
// current string and any prior brand names so older backups still import.
// Sharing these constants here keeps the writer/reader in sync — previously
// the writer hardcoded its string and the reader listed accepted values in a
// separate array, so a format-string change would drift silently.

// The current format string. The writer always emits this.
export const BACKUP_FORMAT = 'newtab-backup';

// Format strings the reader accepts. Includes prior brand names so backups
// exported before a rename still import.
export const ACCEPTED_BACKUP_FORMATS = ['newtab-backup', 'buckleys-backup'];

// The on-disk schema version. Bump when the backup shape changes in a way old
// readers can't safely interpret. The reader rejects unknown versions rather
// than guessing.
export const BACKUP_VERSION = 1;

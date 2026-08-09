import * as migration_20260809_131241_init from './20260809_131241_init';

export const migrations = [
  {
    up: migration_20260809_131241_init.up,
    down: migration_20260809_131241_init.down,
    name: '20260809_131241_init'
  },
];

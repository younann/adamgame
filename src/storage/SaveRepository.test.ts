import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { SaveRepository } from './SaveRepository';
import { defaultSave, migrate, SAVE_VERSION } from './schema';

describe('SaveRepository', () => {
  it('returns defaults when empty', async () => {
    const repo = new SaveRepository();
    await repo.reset();
    const s = await repo.load();
    expect(s.stars).toBe(0);
    expect(s.profile.name).toBe('Adam');
  });
  it('round-trips progress through IndexedDB', async () => {
    const repo = new SaveRepository();
    const s = defaultSave();
    s.stars = 42;
    s.trophies = 2;
    s.avatar.cape = 'cape.red';
    s.skills['english.colors.blue'] = { skillId: 'english.colors.blue', attempts: 3, correct: 2, recent: [true, false, true], independentSuccesses: 1, hintUses: 1, arabicHelpUses: 0, lastPracticed: 1, firstSeen: 1, contexts: ['heroPortal'], successContexts: ['heroPortal'], state: 'learning' };
    await repo.save(s);
    const loaded = await new SaveRepository().load();
    expect(loaded.stars).toBe(42);
    expect(loaded.avatar.cape).toBe('cape.red');
    expect(loaded.skills['english.colors.blue'].attempts).toBe(3);
  });
  it('migrates partial/corrupt payloads safely', () => {
    const m = migrate({ stars: 'lots', avatar: { cape: 'cape.gold' }, settings: { muted: true } });
    expect(m.stars).toBe(0);
    expect(m.avatar.cape).toBe('cape.gold');
    expect(m.avatar.outfit).toBe('outfit.kit-home');
    expect(m.settings.muted).toBe(true);
    expect(m.settings.sessionLimitMin).toBe(20);
    expect(m.version).toBe(SAVE_VERSION);
    expect(migrate(null).stars).toBe(0);
  });
  it('exports and imports backups', () => {
    const repo = new SaveRepository();
    const s = defaultSave();
    s.stars = 7;
    const text = repo.exportJson(s);
    expect(repo.importJson(text).stars).toBe(7);
    expect(() => repo.importJson('{"foo":1}')).toThrow();
  });
});

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addClip, deleteClip, getClip, listClips, MAX_CLIPS_PER_CATEGORY, VoiceLimitError } from './parentVoice';

const blob = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

describe('parent voice storage', () => {
  beforeEach(async () => {
    for (const c of await listClips()) await deleteClip(c.id);
  });

  it('adds, lists by category, gets and deletes clips', async () => {
    const a = await addClip({ category: 'praise', blob: blob(), mime: 'audio/webm', durationMs: 1200, label: 'برافو' });
    await addClip({ category: 'goodbye', blob: blob(), mime: 'audio/webm', durationMs: 900 });
    expect((await listClips('praise')).map((c) => c.id)).toEqual([a.id]);
    expect(await listClips()).toHaveLength(2);
    const got = await getClip(a.id);
    expect(got?.label).toBe('برافو');
    expect(got?.blob).toBeDefined();
    await deleteClip(a.id);
    expect(await listClips('praise')).toHaveLength(0);
  });

  it('enforces the per-category limit', async () => {
    for (let i = 0; i < MAX_CLIPS_PER_CATEGORY; i++) await addClip({ category: 'name', blob: blob(), mime: 'audio/webm', durationMs: 500 });
    await expect(addClip({ category: 'name', blob: blob(), mime: 'audio/webm', durationMs: 500 })).rejects.toBeInstanceOf(VoiceLimitError);
    // other categories unaffected
    await expect(addClip({ category: 'welcome', blob: blob(), mime: 'audio/webm', durationMs: 500 })).resolves.toBeTruthy();
  });

  it('rejects clips longer than 15 seconds', async () => {
    await expect(addClip({ category: 'praise', blob: blob(), mime: 'audio/webm', durationMs: 20_000 })).rejects.toBeInstanceOf(VoiceLimitError);
  });
});

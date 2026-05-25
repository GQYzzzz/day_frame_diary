/** 较短片段，便于塞进照片旁空隙且不拉高画布 */
const MAX_CHUNK_LEN = 26;

/** 将日记正文切成多个气泡段落 */
export function splitDiaryForBubbles(diary: string, maxChunks: number): string[] {
  const trimmed = diary.trim();
  if (!trimmed || maxChunks < 1) return [];

  const sentences = trimmed
    .split(/(?<=[。！？!?；;\n])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  const raw = sentences.length > 0 ? sentences : [trimmed];
  const chunks: string[] = [];
  let buf = "";

  for (const part of raw) {
    const next = buf ? `${buf}${part}` : part;
    if (next.length <= MAX_CHUNK_LEN) {
      buf = next;
      continue;
    }
    if (buf) chunks.push(buf);
    if (part.length <= MAX_CHUNK_LEN) {
      buf = part;
    } else {
      for (let i = 0; i < part.length; i += MAX_CHUNK_LEN) {
        chunks.push(part.slice(i, i + MAX_CHUNK_LEN));
      }
      buf = "";
    }
    if (chunks.length >= maxChunks) break;
  }

  if (buf && chunks.length < maxChunks) chunks.push(buf);

  if (chunks.length === 0) {
    return [trimmed.slice(0, MAX_CHUNK_LEN * 2)];
  }

  return chunks.slice(0, maxChunks);
}

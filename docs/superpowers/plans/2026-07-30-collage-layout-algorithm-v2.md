# Collage Layout Algorithm v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the `count ≤ 7` hard limit with importance-aware greedy row grouping and compact/long-image switching based on row count.

**Architecture:** Single file change in `row-pack.ts`. The unified greedy grouping replaces two separate grouping branches (compact-distribute vs greedy-greedy). Compact/extend decision moves from `count ≤ 7` to `rows ≤ 3`. All other logic (row-height calc, redistribution, bubble placement) stays unchanged.

**Tech Stack:** TypeScript, Next.js

## Global Constraints

- All changes in `frontend/src/lib/templates/layout/row-pack.ts`
- Existing types (`RowPackResult`, `PackedRow`, `PackedPhoto`, `PackedBubble`, `LayoutHint`) and exports unchanged
- Existing `computeRowPack` function signature unchanged

---

### Task 1: Unify grouping and remove `count ≤ 7` threshold

**Files:**
- Modify: `frontend/src/lib/templates/layout/row-pack.ts:180-216`

- [ ] **Step 1: Replace the two-branch grouping with unified greedy**

Replace the `if (compact) { ... } else { ... }` grouping block (lines 180-216) with a single greedy algorithm that uses importance-aware per-row max:

```typescript
/* 统一贪心分组：按重要度排序，逐行分配 */
const rowGroups: number[][] = [];
let cursor = 0;
while (cursor < count) {
  const group: number[] = [];
  let sumAspect = 0;
  let groupMaxImp = 0;
  for (let j = cursor; j < count; j++) {
    const idx = sortedIndices[j];
    const hint = photoHints[idx];
    const testSum = sumAspect + hint.aspectRatio;
    if (group.length > 0 && testSum * rowHeightMin > canvasWidth * rowFillThreshold) break;
    const newMaxImp = Math.max(groupMaxImp, hint.importance);
    const maxInRow = newMaxImp > 0.7 ? 2 : 3;
    if (group.length >= maxInRow) break;
    group.push(idx);
    sumAspect += hint.aspectRatio;
    groupMaxImp = newMaxImp;
  }
  rowGroups.push(group);
  cursor += group.length;
}
```

- [ ] **Step 2: Change compact/extend condition from `count <= 7` to `rows <= 3`**

Find all references to `compact` variable. It's currently defined as `const compact = count <= 7;`. Change to:

```typescript
const compact = rowGroups.length <= 3;
```

This line must appear AFTER row grouping is complete (move it from line 178 to after the grouping block).

- [ ] **Step 3: Remove unused variables**

Remove `const rows: PackedRow[] = [];` from where it was before (it's now initialized later). Also verify `cursor = 0` is still used (it's used in the while loop for greedy grouping).

Actually, `cursor` is already set to 0 before the grouping block. Keep it. But `rows` should be declared where it's first used (in the placement block). Let me check the current code — `const rows: PackedRow[] = []` is on line 179. After moving `compact` below grouping, `rows` will be unused until the placement block, so keep its existing declaration.

Wait, actually `rows` is already used in the placement block, so it's fine where it is. Just need to move the `compact` line.

- [ ] **Step 4: Verify with `tsc --noEmit`**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: replace count-7 threshold with importance-aware row grouping"
```

### Task 2: Test with various photo counts

**Files:** No new files, just manual verification

- [ ] **Step 1: Run the standalone test to verify the algorithm**

Create and run a test script:

```bash
cat > /tmp/test-v2.ts << 'SCRIPT'
<insert the test script content>
SCRIPT
npx tsx /tmp/test-v2.ts
```

Verify:
- 1-3 photos: compact mode, canvas=390×500
- 4-9 photos (≤3 rows): compact mode
- 10+ photos (or any count that produces >3 rows): extended mode, canvas taller than 500
- Bubbles placed correctly (0 cross-photo overlaps)

- [ ] **Step 2: Clean up**

```bash
rm /tmp/test-v2.ts
```

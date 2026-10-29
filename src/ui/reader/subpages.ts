import type { ReaderBlock, SubpageDividerBlock } from '../../parser/blocks';

export interface SubpageBlocks {
  /** 1-based subpage number. */
  number: number;
  /** The divider that opens subpages 2..n (`planSubpages` adds `1/N` for subpage 1). */
  divider?: SubpageDividerBlock;
  /** The subpage's own blocks, without the divider. */
  blocks: ReaderBlock[];
}

/** Cut `toReaderBlocks` output at its `subpageDivider`s, one entry per subpage. */
export function splitSubpages(blocks: readonly ReaderBlock[]): SubpageBlocks[] {
  const out: SubpageBlocks[] = [{ number: 1, blocks: [] }];
  for (const block of blocks) {
    if (block.kind === 'subpageDivider') {
      out.push({ number: block.number, divider: block, blocks: [] });
    } else {
      out[out.length - 1].blocks.push(block);
    }
  }
  return out;
}

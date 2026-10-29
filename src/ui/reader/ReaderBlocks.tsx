import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { t } from '../../i18n';
import type {
  ContactBlock,
  InlineSegment,
  LinkEntry,
  LinkListBlock,
  ParagraphBlock,
  ReaderBlock,
  SubpageDividerBlock,
  TableBlock,
} from '../../parser/blocks';
import type { ReaderLink } from '../../parser/classify';
import { useTheme } from '../../theme';
import { captionGroups, paragraphLinks, type SubpagePlan } from './plan';
import { tableEdges } from './tableScroll';
import { marksByLine, rowLabel, rowParts } from './tableTrends';

export interface ReaderHandlers {
  /** Called when a link to a teletext page (or the first page of a range) is tapped. */
  onOpenPage: (page: number) => void;
}

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/**
 * Inline links are nested Text, which has no hitSlop. On web, vertical padding
 * on an inline span widens the clickable area to 44 px without changing the
 * line height. On Android/iOS the inline link stays tappable, and every link
 * of the paragraph is also listed as a 44 px row under it (ParagraphLinkRows).
 */
const INLINE_HIT_AREA = Platform.OS === 'web' ? ({ paddingVertical: 11 } as const) : null;

function openTarget(target: ReaderLink, handlers: ReaderHandlers): void {
  if (target.kind === 'page') handlers.onOpenPage(target.page);
  else if (target.kind === 'range') handlers.onOpenPage(target.from);
  else {
    const href = /^[a-z][a-z0-9+.-]*:/i.test(target.href) ? target.href : `https://${target.href}`;
    void Linking.openURL(href);
  }
}

function targetLabel(text: string, target: ReaderLink): string {
  if (target.kind === 'page') return t.reader.openPage(target.page);
  if (target.kind === 'range') return t.reader.openPage(target.from);
  return t.reader.openLink(text);
}

function Segments({ segments, handlers }: { segments: InlineSegment[]; handlers: ReaderHandlers }) {
  const { colors } = useTheme();
  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          <Text key={i}>{seg.text}</Text>
        ) : (
          <Text
            key={i}
            accessibilityRole="link"
            accessibilityLabel={targetLabel(seg.text, seg.target)}
            onPress={() => openTarget(seg.target, handlers)}
            style={[{ color: colors.link, textDecorationLine: 'underline' }, INLINE_HIT_AREA]}
          >
            {seg.text}
          </Text>
        ),
      )}
    </>
  );
}

/** Native only: each link of a paragraph as its own row, at least 44 px tall. */
function ParagraphLinkRows({
  segments,
  handlers,
}: {
  segments: InlineSegment[];
  handlers: ReaderHandlers;
}) {
  const { colors, type, space, size } = useTheme();
  const links = paragraphLinks(segments);
  if (links.length === 0) return null;
  return (
    <View>
      {links.map((link, i) => (
        <Pressable
          key={i}
          accessibilityRole="link"
          accessibilityLabel={targetLabel(link.text, link.target)}
          onPress={() => openTarget(link.target, handlers)}
          style={{
            minHeight: size.touch,
            justifyContent: 'center',
            paddingVertical: space['space-2'],
            borderTopWidth: 1,
            borderTopColor: colors.line,
          }}
        >
          <Text style={[type.styles['body-sm'], { color: colors.link }]}>{link.text}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Paragraph({ block, handlers }: { block: ParagraphBlock; handlers: ReaderHandlers }) {
  const { colors, type, space } = useTheme();
  const text = (
    <Text style={[type.styles.body, { color: colors.ink }]}>
      <Segments segments={block.segments} handlers={handlers} />
    </Text>
  );
  if (Platform.OS === 'web') return text;
  return (
    <View style={{ gap: space['space-2'] }}>
      {text}
      <ParagraphLinkRows segments={block.segments} handlers={handlers} />
    </View>
  );
}

function EntryRow({ entry, handlers }: { entry: LinkEntry; handlers: ReaderHandlers }) {
  const { colors, type, space, size } = useTheme();
  const name = entry.label || entry.linkText;
  const number = [type.styles.meta, { color: colors.link, fontVariant: ['tabular-nums' as const] }];
  const main = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${name}, ${targetLabel(entry.linkText, entry.target)}`}
      onPress={() => openTarget(entry.target, handlers)}
      style={{
        flex: 1,
        minHeight: size.touch,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space['space-3'],
        paddingVertical: space['space-2'],
      }}
    >
      <Text style={[type.styles.headline, { color: colors.ink, flex: 1 }]}>{name}</Text>
      {entry.label ? <Text style={number}>{entry.linkText}</Text> : null}
    </Pressable>
  );
  // `DIGITA tiedottaa 577, 582, 588` (196): each further number is its own 44 px link.
  const more = entry.more ?? [];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: colors.line,
      }}
    >
      {main}
      {more.length > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            maxWidth: '55%',
            // The links' own side padding hangs outside, so the last number
            // ends on the same right edge as a row with one number.
            marginRight: -space['space-1'],
          }}
        >
          {more.map((link, i) => (
            <Pressable
              key={i}
              accessibilityRole="link"
              accessibilityLabel={`${name}, ${targetLabel(link.text, link.target)}`}
              onPress={() => openTarget(link.target, handlers)}
              style={{
                minHeight: size.touch,
                minWidth: size.touch,
                alignItems: 'flex-end',
                justifyContent: 'center',
                paddingHorizontal: space['space-1'],
              }}
            >
              <Text style={number}>{link.text}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function LinkList({ block, handlers }: { block: LinkListBlock; handlers: ReaderHandlers }) {
  const { colors, type, space, size, radius } = useTheme();
  if (block.variant === 'list') {
    return (
      <View>
        {block.entries.map((entry, i) => (
          <EntryRow key={i} entry={entry} handlers={handlers} />
        ))}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space['space-2'] }}>
      {block.entries.map((entry, i) => (
        <Pressable
          key={i}
          accessibilityRole="link"
          accessibilityLabel={
            entry.label
              ? `${entry.label}, ${targetLabel(entry.linkText, entry.target)}`
              : targetLabel(entry.linkText, entry.target)
          }
          onPress={() => openTarget(entry.target, handlers)}
          style={{
            minHeight: size.touch,
            justifyContent: 'center',
            paddingHorizontal: space['space-4'],
            borderRadius: radius['radius-md'],
            backgroundColor: colors.field,
          }}
        >
          <Text style={[type.styles['body-sm'], { color: colors.link }]}>
            {entry.label || entry.linkText}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Yle's contact lines under an "Yhteystiedot" heading, one row per line. */
function Contact({ block, handlers }: { block: ContactBlock; handlers: ReaderHandlers }) {
  const { colors, type, space } = useTheme();
  return (
    <View style={{ gap: space['space-2'] }}>
      <Text
        accessibilityRole="header"
        aria-level={1}
        style={[type.styles.meta, { color: colors['ink-muted'] }]}
      >
        {t.reader.contactHeading}
      </Text>
      <View>
        {block.lines.map((segments, i) => (
          <Text key={i} style={[type.styles['body-sm'], { color: colors.ink }]}>
            <Segments segments={segments} handlers={handlers} />
          </Text>
        ))}
      </View>
      {Platform.OS === 'web' ? null : (
        <ParagraphLinkRows segments={block.lines.flat()} handlers={handlers} />
      )}
    </View>
  );
}

function SubpageDivider({ block }: { block: SubpageDividerBlock }) {
  const { colors, type, space } = useTheme();
  return (
    <View style={{ gap: space['space-1'] }}>
      <View
        accessible
        accessibilityLabel={t.a11y.subpage(block.number, block.count)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space['space-3'] }}
      >
        <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
        <Text style={[type.styles.meta, { color: colors['ink-muted'] }]}>
          {t.article.subpage(block.number, block.count)}
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
      </View>
      {block.titles.map((title, i) => (
        <Text
          key={i}
          style={[type.styles.meta, { color: colors['ink-muted'], textAlign: 'center' }]}
        >
          {title}
        </Text>
      ))}
    </View>
  );
}

/** Opacity steps of the edge fade, from the table side to the screen edge. */
const FADE_STEPS = [0.2, 0.45, 0.7, 0.9];

/**
 * A fade into the page background on one side of a table, with a chevron
 * pointing at the hidden columns. Built from strips of the `bg` token (no
 * gradient library); it does not take touches, so the table still scrolls.
 */
function EdgeCue({ side }: { side: 'left' | 'right' }) {
  const { colors, space } = useTheme();
  const steps = side === 'right' ? FADE_STEPS : [...FADE_STEPS].reverse();
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [side]: 0,
        width: space['space-6'],
        flexDirection: 'row',
      }}
    >
      {steps.map((opacity, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: colors.bg, opacity }} />
      ))}
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name={side === 'right' ? 'chevron-forward' : 'chevron-back'}
          size={space['space-4']}
          color={colors['ink-muted']}
        />
      </View>
    </View>
  );
}

/**
 * A teletext table in monospace, as Yle set it. Rows are 40 cells, which is
 * wider than the text column on a small phone (320 px): the table then
 * scrolls sideways, and a fade with a chevron shows on the side where
 * columns are hidden, so nothing is cut off without a cue.
 */
function Table({ block }: { block: TableBlock }) {
  const { colors, type, space } = useTheme();
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const edges = tableEdges(viewport, content, scrollX);
  const header = block.headerRows ?? 0;
  const marks = marksByLine(block);
  const words = { up: t.reader.priceUp, down: t.reader.priceDown };
  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        scrollEventThrottle={32}
        onLayout={(e) => setViewport(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContent(w)}
        onScroll={(e) => setScrollX(e.nativeEvent.contentOffset.x)}
      >
        <View style={{ paddingBottom: space['space-2'] }}>
          {block.lines.map((line, i) => {
            const lineMarks = marks.get(i);
            // Rising and falling price changes in Yle's colours (page 175's note); the sign stays.
            const parts = lineMarks ? rowParts(line, lineMarks) : undefined;
            return (
              <Text
                key={i}
                accessibilityLabel={parts ? rowLabel(parts, words) : undefined}
                style={{
                  ...type.styles.meta,
                  fontFamily: MONO,
                  // Column labels (`OSUUDEN  MUUTOS`) are set apart from the values,
                  // with a rule under the last one.
                  color: i < header ? colors['ink-muted'] : colors.ink,
                  ...(i === header - 1
                    ? { borderBottomWidth: 1, borderBottomColor: colors.line }
                    : null),
                  // Keep every space; React Native Web would collapse them otherwise.
                  ...(Platform.OS === 'web' ? { whiteSpace: 'pre' as const } : null),
                }}
              >
                {parts
                  ? parts.map((part, j) =>
                      part.trend ? (
                        <Text
                          key={j}
                          style={{
                            color: part.trend === 'up' ? colors['price-up'] : colors['price-down'],
                          }}
                        >
                          {part.text}
                        </Text>
                      ) : (
                        part.text
                      ),
                    )
                  : line === ''
                    ? ' '
                    : line}
              </Text>
            );
          })}
        </View>
      </ScrollView>
      {edges.left ? <EdgeCue side="left" /> : null}
      {edges.right ? <EdgeCue side="right" /> : null}
    </View>
  );
}

export function ReaderBlockView({
  block,
  handlers,
}: {
  block: ReaderBlock;
  handlers: ReaderHandlers;
}) {
  const { colors, type } = useTheme();
  switch (block.kind) {
    case 'title':
      return (
        <Text
          accessibilityRole="header"
          aria-level={1}
          style={[type.styles.title, { color: colors.ink }]}
        >
          {block.text}
        </Text>
      );
    case 'heading':
      return (
        <Text
          accessibilityRole="header"
          aria-level={2}
          style={[type.styles.lead, { color: colors.ink }]}
        >
          {block.text}
        </Text>
      );
    case 'paragraph':
      return <Paragraph block={block} handlers={handlers} />;
    case 'linkList':
      return <LinkList block={block} handlers={handlers} />;
    case 'table':
      return <Table block={block} />;
    case 'subpageDivider':
      return <SubpageDivider block={block} />;
    case 'contact':
      return <Contact block={block} handlers={handlers} />;
  }
}

/** Reader blocks one after another, with the design system's article spacing. */
export function ReaderBlocks({
  blocks,
  handlers,
  caption,
}: {
  blocks: readonly ReaderBlock[];
  handlers: ReaderHandlers;
  /** Caption lines of the subpage divider that belong right above a block (see `captionGroups`). */
  caption?: { titles: string[]; captions: string[]; index: number };
}) {
  const { space, colors, type } = useTheme();
  const at = caption && caption.captions.length > 0 ? caption.index : -1;
  return (
    <View style={{ gap: space['space-4'] }}>
      {blocks.map((block, i) =>
        i === at ? (
          <View key={i} style={{ gap: space['space-1'] }}>
            {caption!.captions.map((text, j) => (
              <Text key={j} style={[type.styles.meta, { color: colors['ink-muted'] }]}>
                {text}
              </Text>
            ))}
            <ReaderBlockView block={block} handlers={handlers} />
          </View>
        ) : (
          <ReaderBlockView key={i} block={block} handlers={handlers} />
        ),
      )}
    </View>
  );
}

function captions(part: SubpagePlan) {
  return captionGroups(part.divider?.titles ?? [], part.blocks);
}

/** Yle's own picture of one subpage. */
export function FallbackImage({ page, uri }: { page: number; uri: string | null }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space['space-2'] }}>
      {uri ? (
        <Image
          accessibilityLabel={t.reader.originalImage(page)}
          source={{ uri }}
          resizeMode="contain"
          style={{ width: '100%', aspectRatio: 40 / 24 }}
        />
      ) : null}
    </View>
  );
}

/**
 * A whole article: per subpage either reader blocks or that subpage's own
 * picture.
 */
export function ReaderArticle({
  page,
  plan,
  handlers,
}: {
  page: number;
  plan: readonly SubpagePlan[];
  handlers: ReaderHandlers;
}) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space['space-4'] }}>
      {plan.map((part) => (
        <View key={part.number} style={{ gap: space['space-4'] }}>
          {part.dividerAt > 0 ? (
            <ReaderBlocks blocks={part.blocks.slice(0, part.dividerAt)} handlers={handlers} />
          ) : null}
          {part.divider ? (
            <ReaderBlocks
              blocks={[{ ...part.divider, titles: captions(part).titles }]}
              handlers={handlers}
            />
          ) : null}
          {part.fallback ? (
            <FallbackImage page={page} uri={part.imageUrl} />
          ) : (
            <ReaderBlocks
              blocks={part.blocks.slice(part.dividerAt)}
              handlers={handlers}
              caption={captions(part)}
            />
          )}
        </View>
      ))}
    </View>
  );
}

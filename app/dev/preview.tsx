/**
 * Dev-only parser preview (/dev/preview): every saved fixture page, or any
 * live page fetched through our proxy, in reader mode next to Yle's original
 * image, with the confidence verdict.
 * Not part of the tab bar and not the final article screen.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getPage, pageImageUrl, type PageResult } from '../../src/api';
import { fixtureEntries } from '../../src/dev/fixtures.generated';
import { errorKey, formatClock, parsePageField } from '../../src/dev/live';
import { t } from '../../src/i18n';
import { analyseNormalised, analysePage, type Analysis } from '../../src/parser/analyse';
import { useTheme } from '../../src/theme';
import { ReaderBlocks } from '../../src/ui/reader/ReaderBlocks';
import { splitSubpages } from '../../src/ui/reader/subpages';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
const WIDE_BREAKPOINT = 900;

/** Every saved Yle page image is 720 x 432 (checked for all fixtures). */
const IMAGE_ASPECT = 720 / 432;

/** Picture of a page's subpage: a bundled asset (fixtures) or a proxy URL (live). */
type ImageFor = (subpage: number) => ImageSourcePropType | undefined;

function PageImage({ page, source }: { page: number; source?: ImageSourcePropType }) {
  const { colors, type } = useTheme();
  const [width, setWidth] = useState(0);
  if (source === undefined) {
    return <Text style={[type.styles.meta, { color: colors['ink-muted'] }]}>{t.dev.noImage}</Text>;
  }
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ width: '100%', height: width / IMAGE_ASPECT }}
    >
      <Image
        accessibilityLabel={t.dev.originalImage(page)}
        source={source}
        resizeMode="contain"
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}

function FallbackImage({ page, source }: { page: number; source?: ImageSourcePropType }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space['space-2'] }}>
      <PageImage page={page} source={source} />
    </View>
  );
}

function Button({
  label,
  onPress,
  children,
  disabled,
}: {
  label: string;
  onPress: () => void;
  children: string;
  disabled?: boolean;
}) {
  const { colors, type, space, size, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minWidth: size.touch,
        minHeight: size.touch,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space['space-4'],
        borderRadius: radius['radius-md'],
        backgroundColor: colors.field,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={[type.styles.headline, { color: colors.ink }]}>{children}</Text>
    </Pressable>
  );
}

function Verdict({ analysis }: { analysis: Analysis }) {
  const { colors, type, space } = useTheme();
  const muted = [type.styles.meta, { color: colors['ink-muted'] }];
  const raw = [type.styles.meta, { color: colors['ink-muted'], fontFamily: MONO }];
  if (!analysis.ok) {
    return (
      <View style={{ gap: space['space-1'] }}>
        <Text style={[type.styles.headline, { color: colors.danger }]}>{t.dev.fallback}</Text>
        <Text style={raw}>{`${t.dev.reasons}: parse-error`}</Text>
        <Text style={raw}>{analysis.message}</Text>
      </View>
    );
  }
  const a = analysis.assessment;
  const flag = a.fallback ? t.dev.fallback : a.lowConfidence ? t.dev.lowConfidence : t.dev.ok;
  return (
    <View style={{ gap: space['space-1'] }}>
      <Text style={[type.styles.headline, { color: a.fallback ? colors.danger : colors.ink }]}>
        {`${t.dev.score(a.score.toFixed(2).replace('.', ','))} · ${flag}`}
      </Text>
      <Text style={raw}>{`${t.dev.reasons}: ${a.reasons.join(', ') || t.dev.noReasons}`}</Text>
      {a.subpages.length > 1 ? (
        <Text style={muted}>
          {a.subpages
            .map(
              (s) =>
                `${t.article.subpage(s.number, a.subpages.length)} ${s.score.toFixed(2).replace('.', ',')}` +
                (s.fallback ? ` ${t.dev.fallback}` : ''),
            )
            .join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}

function ReaderColumn({
  page,
  imageFor,
  analysis,
  onOpenPage,
}: {
  page: number;
  imageFor: ImageFor;
  analysis: Analysis;
  onOpenPage: (page: number) => void;
}) {
  const { space } = useTheme();
  const handlers = useMemo(() => ({ onOpenPage }), [onOpenPage]);
  if (!analysis.ok || analysis.assessment.fallback) {
    return (
      <View style={{ gap: space['space-4'] }}>
        <FallbackImage page={page} source={imageFor(1)} />
      </View>
    );
  }

  const parts = splitSubpages(analysis.blocks);
  return (
    <View style={{ gap: space['space-4'] }}>
      {parts.map((part) => {
        const verdict = analysis.assessment.subpages.find((s) => s.number === part.number);
        return (
          <View key={part.number} style={{ gap: space['space-4'] }}>
            {part.divider ? <ReaderBlocks blocks={[part.divider]} handlers={handlers} /> : null}
            {verdict?.fallback ? (
              <FallbackImage page={page} source={imageFor(part.number)} />
            ) : (
              <ReaderBlocks blocks={part.blocks} handlers={handlers} />
            )}
          </View>
        );
      })}
    </View>
  );
}

function SegButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, type, space, size, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: size.touch,
        minWidth: size.touch,
        justifyContent: 'center',
        paddingHorizontal: space['space-4'],
        borderRadius: radius['radius-md'],
        backgroundColor: selected ? colors.ink : colors.field,
      }}
    >
      <Text style={[type.styles.headline, { color: selected ? colors.bg : colors.ink }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Page number field plus Open button; calls `onSubmit` with the typed text. */
function PageField({ onSubmit }: { onSubmit: (text: string) => void }) {
  const { colors, type, space, size, radius } = useTheme();
  const [field, setField] = useState('');
  const submit = () => {
    onSubmit(field);
    setField('');
  };
  return (
    <>
      <TextInput
        accessibilityLabel={t.dev.pageField}
        accessibilityHint={t.dev.pageFieldHint}
        value={field}
        onChangeText={setField}
        onSubmitEditing={submit}
        placeholder={t.dev.pageField}
        placeholderTextColor={colors['ink-muted']}
        keyboardType="number-pad"
        returnKeyType="go"
        maxLength={3}
        style={[
          type.styles.body,
          {
            minHeight: size.touch,
            minWidth: 120,
            paddingHorizontal: space['space-3'],
            borderRadius: radius['radius-md'],
            backgroundColor: colors.field,
            color: colors.ink,
          },
        ]}
      />
      <Button label={t.dev.open} onPress={submit}>
        {t.dev.open}
      </Button>
    </>
  );
}

function PageNumber({ page }: { page: number }) {
  const { colors, type } = useTheme();
  return (
    <Text
      style={[
        type.styles.title,
        { color: colors.ink, minWidth: 64, textAlign: 'center', fontVariant: ['tabular-nums'] },
      ]}
    >
      {page}
    </Text>
  );
}

function Columns({ reader, original }: { reader: ReactNode; original: ReactNode }) {
  const { colors, type, space, radius } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  return (
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: space['space-6'] }}>
      <View
        style={{
          flex: wide ? 1 : undefined,
          gap: space['space-3'],
          padding: space['space-4'],
          borderRadius: radius['radius-lg'],
          backgroundColor: colors.surface,
        }}
      >
        <Text style={[type.styles.label, { color: colors['ink-muted'] }]}>
          {t.dev.readerColumn.toUpperCase()}
        </Text>
        {reader}
      </View>
      <View style={{ flex: wide ? 1 : undefined, gap: space['space-3'] }}>
        <Text style={[type.styles.label, { color: colors['ink-muted'] }]}>
          {t.dev.originalColumn.toUpperCase()}
        </Text>
        {original}
      </View>
    </View>
  );
}

const rowStyle = { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' } as const;

function FixturesView() {
  const { colors, type, space } = useTheme();
  const [index, setIndex] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const entry = fixtureEntries[index];
  const analysis = useMemo(() => analysePage(entry.raw), [entry]);
  const imageFor: ImageFor = () => entry.image;

  const goToPage = useCallback((page: number) => {
    const found = fixtureEntries.findIndex((e) => e.page === page);
    if (found < 0) {
      setNotice(t.dev.notInFixtures(page));
      return;
    }
    setNotice(null);
    setIndex(found);
  }, []);

  const step = (delta: number) => {
    setNotice(null);
    setIndex((i) => Math.min(fixtureEntries.length - 1, Math.max(0, i + delta)));
  };

  const submit = (text: string) => {
    const page = Number.parseInt(text.trim(), 10);
    if (Number.isFinite(page)) goToPage(page);
  };

  return (
    <>
      <View style={[rowStyle, { gap: space['space-2'] }]}>
        <Button label={t.dev.previousPage} disabled={index === 0} onPress={() => step(-1)}>
          ‹
        </Button>
        <PageNumber page={entry.page} />
        <Button
          label={t.dev.nextPage}
          disabled={index === fixtureEntries.length - 1}
          onPress={() => step(1)}
        >
          ›
        </Button>
        <Text style={[type.styles.meta, { color: colors['ink-muted'] }]}>
          {t.dev.position(index + 1, fixtureEntries.length)}
        </Text>
        <PageField onSubmit={submit} />
      </View>

      {notice ? <Text style={[type.styles.meta, { color: colors.danger }]}>{notice}</Text> : null}
      <Verdict analysis={analysis} />
      <Columns
        reader={
          <ReaderColumn
            page={entry.page}
            imageFor={imageFor}
            analysis={analysis}
            onOpenPage={goToPage}
          />
        }
        original={<PageImage page={entry.page} source={entry.image} />}
      />
    </>
  );
}

function LiveView() {
  const { colors, type, space } = useTheme();
  const [page, setPage] = useState(100);
  const [reloads, setReloads] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  // The stored result belongs to `key`; while the current key differs we are loading.
  const [loaded, setLoaded] = useState<{ key: string; result: PageResult } | null>(null);
  const key = `${page}:${reloads}`;

  useEffect(() => {
    let cancelled = false;
    void getPage(page).then((result) => {
      if (!cancelled) setLoaded({ key: `${page}:${reloads}`, result });
    });
    return () => {
      cancelled = true;
    };
  }, [page, reloads]);

  const result = loaded && loaded.key === key ? loaded.result : null;
  const analysis = useMemo(
    () => (result && result.ok ? analyseNormalised(result.page) : null),
    [result],
  );

  const open = useCallback((n: number) => {
    setNotice(null);
    setPage(n);
  }, []);

  const submit = (text: string) => {
    const n = parsePageField(text);
    if (n === null) setNotice(t.dev.invalidPage);
    else open(n);
  };

  const prev = result && result.ok ? result.page.prevPage : undefined;
  const next = result && result.ok ? result.page.nextPage : undefined;
  const imageFor: ImageFor = (sub) => {
    const uri = pageImageUrl(page, sub);
    return uri ? { uri } : undefined;
  };

  return (
    <>
      <View style={[rowStyle, { gap: space['space-2'] }]}>
        <Button
          label={t.dev.previousPage}
          disabled={prev === undefined}
          onPress={() => prev !== undefined && open(prev)}
        >
          ‹
        </Button>
        <PageNumber page={page} />
        <Button
          label={t.dev.nextPage}
          disabled={next === undefined}
          onPress={() => next !== undefined && open(next)}
        >
          ›
        </Button>
        <Button label={t.dev.refreshLabel} onPress={() => setReloads((r) => r + 1)}>
          {t.dev.refresh}
        </Button>
        <PageField onSubmit={submit} />
      </View>

      {notice ? <Text style={[type.styles.meta, { color: colors.danger }]}>{notice}</Text> : null}

      {result === null ? (
        <View
          accessible
          accessibilityLabel={t.dev.loadingPage(page)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space['space-3'] }}
        >
          <ActivityIndicator color={colors['ink-muted']} />
          <Text style={[type.styles.meta, { color: colors['ink-muted'] }]}>
            {t.dev.loadingPage(page)}
          </Text>
        </View>
      ) : null}

      {result && !result.ok ? (
        <Text accessibilityRole="alert" style={[type.styles.headline, { color: colors.danger }]}>
          {result.reason === 'not-found' ? t.dev.notFound(page) : t.dev[errorKey(result.reason)]}
        </Text>
      ) : null}

      {result && result.ok && analysis ? (
        <>
          <Text
            style={[
              type.styles.meta,
              { color: result.stale ? colors.danger : colors['ink-muted'] },
            ]}
          >
            {[
              result.fetchedAt ? t.dev.updated(formatClock(result.fetchedAt)) : null,
              result.stale ? t.dev.staleCopy : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Verdict analysis={analysis} />
          <Columns
            reader={
              <ReaderColumn page={page} imageFor={imageFor} analysis={analysis} onOpenPage={open} />
            }
            original={<PageImage page={page} source={imageFor(1)} />}
          />
        </>
      ) : null}
    </>
  );
}

type Mode = 'fixtures' | 'live';

export default function PreviewScreen() {
  const { colors, type, space } = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('fixtures');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + space['space-4'],
        paddingBottom: insets.bottom + space['space-8'],
        paddingHorizontal: space['space-5'],
        gap: space['space-4'],
      }}
    >
      <Text accessibilityRole="header" style={[type.styles.title, { color: colors.ink }]}>
        {t.dev.previewTitle}
      </Text>
      <View
        accessibilityLabel={t.dev.modeSwitch}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space['space-2'] }}
      >
        <SegButton
          label={t.dev.modeFixtures}
          selected={mode === 'fixtures'}
          onPress={() => setMode('fixtures')}
        />
        <SegButton
          label={t.dev.modeLive}
          selected={mode === 'live'}
          onPress={() => setMode('live')}
        />
      </View>
      {mode === 'fixtures' ? <FixturesView /> : <LiveView />}
    </ScrollView>
  );
}

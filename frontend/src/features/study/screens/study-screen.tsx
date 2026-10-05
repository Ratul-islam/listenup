import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { Check, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenHeader } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import { documentsApi } from '@/features/library/api/documents.api';
import { useInvalidateDocuments } from '@/features/library/hooks/use-documents';
import { getErrorMessage, hasErrorCode } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { useTokens } from '@/lib/use-tokens';

import { studyApi, type Quiz } from '../api/study.api';

type Tab = 'summary' | 'quiz';

/** Summary and quiz for one document (Plus) */
export default function StudyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('summary');
  const document = useQuery({ queryKey: ['document', id], queryFn: () => documentsApi.get(id) });

  return (
    <CloudBackground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 18 }}>
        <View className="gap-1">
          <ScreenHeader title={tab === 'summary' ? 'Summary' : 'Quiz'} onBack={router.back} />
          {document.data ? <Text variant="caption" numberOfLines={1}>{document.data.title}</Text> : null}
        </View>
        <View className="flex-row rounded-full bg-surface-secondary p-1">
          {(['summary', 'quiz'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setTab(value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === value }}
              className={`flex-1 items-center rounded-full py-2 ${tab === value ? 'bg-surface' : ''}`}
            >
              <Text className={`text-[14px] font-semibold ${tab === value ? 'text-accent' : 'text-muted'}`}>{value === 'summary' ? 'Summary' : 'Quiz'}</Text>
            </Pressable>
          ))}
        </View>
        {tab === 'summary' ? <SummaryView id={id} title={document.data?.title ?? ''} /> : <QuizView id={id} />}
      </ScrollView>
    </CloudBackground>
  );
}

function Problem({ error }: { error: unknown }) {
  const plans = hasErrorCode(error, 'PREMIUM_REQUIRED');
  return (
    <InlineAlert
      message={getErrorMessage(error)}
      action={plans ? <PrimaryButton label="See plans" size="md" variant="secondary" onPress={() => router.push('/plans')} /> : undefined}
    />
  );
}

function Writing({ what }: { what: string }) {
  const t = useTokens();
  return (
    <View className="items-center gap-3 py-10">
      <Spinner color={t.accent} />
      <Text variant="caption">Writing the {what}. Long documents take up to a minute.</Text>
    </View>
  );
}

function SummaryView({ id, title }: { id: string; title: string }) {
  const t = useTokens();
  const { toast } = useToast();
  const invalidate = useInvalidateDocuments();
  const summary = useQuery({ queryKey: ['study', id, 'summary'], queryFn: () => studyApi.summary(id), retry: false, staleTime: Infinity });
  const listen = useMutation({
    mutationFn: () => {
      const s = summary.data!;
      return documentsApi.fromText({ title: `Summary: ${title}`.slice(0, 200), text: [s.summary, ...s.keyPoints].join('\n\n') });
    },
    onSuccess: () => {
      void invalidate();
      toast.show({ variant: 'success', label: 'Added to your Soundshelf', description: 'The summary will be ready to play in a moment.' });
    },
    onError: (e) => toast.show({ variant: 'danger', label: getErrorMessage(e) }),
  });

  if (summary.isLoading) return <Writing what="summary" />;
  if (summary.error) return <Problem error={summary.error} />;
  if (!summary.data) return null;

  return (
    <View className="gap-4">
      <GlassCard className="gap-3 p-5">
        <Text className="text-[16px] leading-[25px]">{summary.data.summary}</Text>
      </GlassCard>
      <View className="gap-2.5">
        <Text variant="label" className="px-1 text-muted">Key points</Text>
        {summary.data.keyPoints.map((point) => (
          <View key={point} className="flex-row gap-2.5 px-1">
            <Check size={16} color={t.accent} strokeWidth={2.4} style={{ marginTop: 4 }} />
            <Text className="flex-1 text-[15px] leading-[23px]">{point}</Text>
          </View>
        ))}
      </View>
      <PrimaryButton label="Listen to the summary" variant="secondary" size="md" isLoading={listen.isPending} onPress={() => listen.mutate()} />
    </View>
  );
}

function QuizView({ id }: { id: string }) {
  const client = useQueryClient();
  const key = ['study', id, 'quiz'];
  const quiz = useQuery({ queryKey: key, queryFn: () => studyApi.quiz(id), retry: false, staleTime: Infinity });
  const fresh = useMutation({
    mutationFn: () => studyApi.newQuiz(id),
    onSuccess: (next) => client.setQueryData(key, next),
  });

  if (quiz.isLoading || fresh.isPending) return <Writing what="quiz" />;
  if (quiz.error || fresh.error) return <Problem error={quiz.error ?? fresh.error} />;
  if (!quiz.data) return null;
  // A new quiz restarts the round
  return <Round key={JSON.stringify(quiz.data.questions[0])} quiz={quiz.data} onNewQuestions={() => fresh.mutate()} />;
}

function Round({ quiz, onNewQuestions }: { quiz: Quiz; onNewQuestions: () => void }) {
  const t = useTokens();
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const done = index >= quiz.questions.length;

  if (done) {
    return (
      <GlassCard className="items-center gap-4 p-6">
        <Text variant="h2" className="text-center">{score} of {quiz.questions.length}</Text>
        <Text variant="caption" className="text-center">
          {score === quiz.questions.length ? 'Perfect. You know this one well.' : score >= quiz.questions.length * 0.7 ? 'Nicely done.' : 'Listen again and try once more.'}
        </Text>
        <PrimaryButton
          label="Try again"
          size="md"
          onPress={() => {
            setIndex(0);
            setPicked(null);
            setScore(0);
          }}
        />
        <PrimaryButton label="New questions" size="md" variant="secondary" onPress={onNewQuestions} />
      </GlassCard>
    );
  }

  const q = quiz.questions[index];
  const answered = picked !== null;

  return (
    <View className="gap-4">
      <Text variant="caption">Question {index + 1} of {quiz.questions.length}</Text>
      <Text className="text-[18px] font-semibold leading-[26px]">{q.question}</Text>
      <View className="gap-2.5">
        {q.options.map((option, i) => {
          const correct = i === q.answer;
          const chosen = i === picked;
          const tone = answered && correct ? 'border-success bg-success/10' : answered && chosen ? 'border-danger bg-danger/10' : 'border-border bg-surface';
          return (
            <Pressable
              key={option}
              disabled={answered}
              onPress={() => {
                setPicked(i);
                if (correct) {
                  setScore((s) => s + 1);
                  haptics.success();
                } else haptics.error();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              className={`flex-row items-center gap-3 rounded-2xl border px-4 py-3.5 ${tone}`}
            >
              <Text className="flex-1 text-[15px] leading-[22px]">{option}</Text>
              {answered && correct ? <Check size={18} color={t.success} /> : answered && chosen ? <X size={18} color={t.danger} /> : null}
            </Pressable>
          );
        })}
      </View>
      {answered ? (
        <View className="gap-4">
          <Text className="text-[15px] leading-[22px] text-muted">{q.explanation}</Text>
          <PrimaryButton
            label={index + 1 < quiz.questions.length ? 'Next question' : 'See my score'}
            size="md"
            onPress={() => {
              setIndex(index + 1);
              setPicked(null);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

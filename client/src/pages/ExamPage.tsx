import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import type { ExamSession, RescueAttempt, StudySet } from "@automated-study-system/shared";
import {
  ArrowLeft,
  Gauge,
  LoaderCircle,
  MessageSquareQuote,
  Mic,
  Radar,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  TriangleAlert
} from "lucide-react";

import { Reveal } from "@/components/Reveal";
import { StatePanel } from "@/components/StatePanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  applyExamTurnResult,
  createRescueAttempt,
  createExamSession,
  evaluateExamTurn,
  fetchExamSessions,
  fetchRescueAttempts,
  fetchStudySet,
  saveExamSession,
  submitRescueRetry,
  transcribeExamAnswer
} from "../lib/api";
import { readCachedStudySet, writeCachedStudySet } from "../lib/studySetCache";

const SPEECH_DETECTION_THRESHOLD = 0.018;

function getExamRescueModeStorageKey(studySetId: string) {
  return `study-sphere.exam-rescue-mode:${studySetId}`;
}

function readSavedExamRescueMode(studySetId: string) {
  if (typeof window === "undefined") {
    return true;
  }

  return window.sessionStorage.getItem(getExamRescueModeStorageKey(studySetId)) !== "off";
}

function writeSavedExamRescueMode(studySetId: string, enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(getExamRescueModeStorageKey(studySetId), enabled ? "on" : "off");
}

function toExamLoadError(message: string | null | undefined) {
  if (!message) {
    return "We couldn't prepare your oral exam right now.";
  }

  if (/failed to fetch|network|networkerror/i.test(message)) {
    return "We couldn't reach the exam service right now. Please try again in a moment.";
  }

  return message;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackMessage: string) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(fallbackMessage));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function LoadingSurface() {
  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(340px,0.88fr)]">
      <Card className="rounded-[2rem] border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <Skeleton className="h-6 w-28 bg-white/8" />
          <Skeleton className="h-14 w-3/4 bg-white/8" />
          <Skeleton className="h-5 w-2/3 bg-white/8" />
          <Skeleton className="h-3 w-full bg-white/8" />
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton className="h-36 rounded-[1.5rem] bg-white/8" key={index} />
            ))}
          </div>
          <Skeleton className="h-52 rounded-[1.7rem] bg-white/8" />
          <Skeleton className="h-72 rounded-[1.7rem] bg-white/8" />
        </CardContent>
      </Card>

      <Card className="rounded-[2rem] border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <CardContent className="space-y-5 p-6">
          <Skeleton className="h-6 w-24 bg-white/8" />
          <Skeleton className="h-10 w-1/2 bg-white/8" />
          <Skeleton className="h-40 rounded-[1.5rem] bg-white/8" />
          <Skeleton className="h-56 rounded-[1.5rem] bg-white/8" />
        </CardContent>
      </Card>
    </section>
  );
}

export function ExamPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const rescueQueryParam = useMemo(() => new URLSearchParams(location.search).get("rescue"), [location.search]);
  const [studySet, setStudySet] = useState<StudySet | null>(null);
  const [session, setSession] = useState<ExamSession | null>(null);
  const [history, setHistory] = useState<ExamSession[]>([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isRetryingLoad, setIsRetryingLoad] = useState(false);
  const [activeRescue, setActiveRescue] = useState<RescueAttempt | null>(null);
  const [rescueAnswer, setRescueAnswer] = useState("");
  const [rescueError, setRescueError] = useState<string | null>(null);
  const [isLoadingRescue, setIsLoadingRescue] = useState(false);
  const [isSubmittingRescue, setIsSubmittingRescue] = useState(false);
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "processing">("idle");
  const [recordingHint, setRecordingHint] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const monitoringFrameRef = useRef<number | null>(null);
  const detectedSpeechLevelRef = useRef(0);
  const answerBeforeRecordingRef = useRef("");
  const [isRescueModeEnabled, setIsRescueModeEnabled] = useState(() =>
    rescueQueryParam === "off" ? false : rescueQueryParam === "on" ? true : readSavedExamRescueMode(id)
  );

  function stopAudioLevelMonitor() {
    if (monitoringFrameRef.current !== null) {
      window.cancelAnimationFrame(monitoringFrameRef.current);
      monitoringFrameRef.current = null;
    }

    analyserRef.current?.disconnect();
    analyserRef.current = null;
    audioSourceRef.current?.disconnect();
    audioSourceRef.current = null;

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    detectedSpeechLevelRef.current = 0;

    if (audioContext) {
      void audioContext.close().catch(() => undefined);
    }
  }

  async function startAudioLevelMonitor(stream: MediaStream) {
    const AudioContextConstructor =
      window.AudioContext ??
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextConstructor) {
      detectedSpeechLevelRef.current = Number.POSITIVE_INFINITY;
      return;
    }

    const audioContext = new AudioContextConstructor();
    const analyser = audioContext.createAnalyser();
    const audioSource = audioContext.createMediaStreamSource(stream);
    const samples = new Float32Array(analyser.fftSize);

    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.15;
    audioSource.connect(analyser);

    if (audioContext.state === "suspended") {
      await audioContext.resume().catch(() => undefined);
    }

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    audioSourceRef.current = audioSource;
    detectedSpeechLevelRef.current = 0;

    const measureLevel = () => {
      analyser.getFloatTimeDomainData(samples);

      let peak = 0;
      for (const sample of samples) {
        const amplitude = Math.abs(sample);
        if (amplitude > peak) {
          peak = amplitude;
        }
      }

      detectedSpeechLevelRef.current = Math.max(detectedSpeechLevelRef.current, peak);
      monitoringFrameRef.current = window.requestAnimationFrame(measureLevel);
    };

    monitoringFrameRef.current = window.requestAnimationFrame(measureLevel);
  }

  function selectActiveRescueAttempt(attempts: RescueAttempt[]) {
    return attempts.find((attempt) => attempt.status === "open") ?? attempts.find((attempt) => attempt.status === "needs_more_help") ?? null;
  }

  function shouldTriggerRescue(classification: "strong" | "partial" | "weak", score: number) {
    return classification === "weak" || (classification === "partial" && score < 60);
  }

  useEffect(() => {
    const nextMode = rescueQueryParam === "off" ? false : rescueQueryParam === "on" ? true : readSavedExamRescueMode(id);
    setIsRescueModeEnabled(nextMode);
    writeSavedExamRescueMode(id, nextMode);
  }, [id, rescueQueryParam]);

  async function loadExamPage() {
    const loadedStudySet = await fetchStudySet(id);
    let sessions: ExamSession[] = [];
    const noticeParts: string[] = [];

    writeCachedStudySet(loadedStudySet);
    setStudySet(loadedStudySet);

    try {
      sessions = await withTimeout(fetchExamSessions(id), 4000, "Exam history took too long to respond.");
    } catch {
      noticeParts.push("Exam history is temporarily unavailable. A fresh session has been prepared.");
    }

    const existingSession = sessions.find((item) => !item.completed) ?? null;
    const nextSession = existingSession ?? (await saveExamSession(loadedStudySet.id, createExamSession(loadedStudySet)));
    const nextHistory = existingSession ? sessions : [nextSession, ...sessions];

    setSession(nextSession);
    setHistory(nextHistory);
    setActiveRescue(null);
    setRescueAnswer("");
    setRescueError(null);
    setIsLoadingHistory(false);
    setError(null);

    let rescueAttempts: RescueAttempt[] = [];

    if (isRescueModeEnabled) {
      try {
        rescueAttempts = await withTimeout(
          fetchRescueAttempts(loadedStudySet.id, nextSession.id),
          4000,
          "Rescue history took too long to respond."
        );
      } catch {
        noticeParts.push("Rescue history could not be refreshed, but you can still continue the exam.");
      }
    }

    setActiveRescue(selectActiveRescueAttempt(rescueAttempts));
    setLoadNotice(noticeParts.length > 0 ? noticeParts.join(" ") : null);
  }

  async function handleRetryLoad() {
    setIsRetryingLoad(true);
    setStudySet(null);
    setSession(null);
    setHistory([]);
    setActiveRescue(null);
    setRescueAnswer("");
    setRescueError(null);
    setIsLoadingHistory(true);
    setLoadNotice(null);

    try {
      await loadExamPage();
    } catch (requestError) {
      setError(toExamLoadError(requestError instanceof Error ? requestError.message : "Could not load exam."));
      setLoadNotice(null);
      setIsLoadingHistory(false);
    } finally {
      setIsRetryingLoad(false);
    }
  }

  async function handleRestartExam() {
    if (!studySet) {
      return;
    }

    const restarted = createExamSession(studySet);
    setIsRestarting(true);
    setError(null);
    setActiveRescue(null);
    setRescueAnswer("");
    setRescueError(null);
    setAnswer("");
    setRecordingHint("Use the microphone to record your oral answer, then submit it for scoring.");

    try {
      const savedSession = await saveExamSession(studySet.id, restarted);
      setSession(savedSession);
      setHistory((current) => [savedSession, ...current.filter((item) => item.id !== savedSession.id)]);
    } catch (restartError) {
      setError(restartError instanceof Error ? restartError.message : "Could not restart the oral exam.");
    } finally {
      setIsRestarting(false);
    }
  }

  useEffect(() => {
    let ignore = false;
    const cachedStudySet = readCachedStudySet(id);

    setSession(null);
    setHistory([]);
    setActiveRescue(null);
    setRescueAnswer("");
    setRescueError(null);
    setIsLoadingHistory(true);
    setLoadNotice(null);

    if (cachedStudySet) {
      setStudySet(cachedStudySet);
      setError(null);
    }

    loadExamPage()
      .then(() => {
        if (ignore) {
          return;
        }
      })
      .catch((requestError) => {
        if (!ignore) {
          setError(toExamLoadError(requestError instanceof Error ? requestError.message : "Could not load exam."));
          setLoadNotice(null);
          setIsLoadingHistory(false);
        }
      });

    return () => {
      ignore = true;
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      stopAudioLevelMonitor();
    };
  }, [id, isRescueModeEnabled]);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingHint("Voice recording works in browsers that support microphone capture over HTTPS or localhost.");
      return;
    }

    setRecordingHint("Use the microphone to record your oral answer, then submit it for scoring.");
  }, []);

  const progressLabel = useMemo(() => {
    if (!session) {
      return "Preparing exam...";
    }

    if (activeRescue && activeRescue.status !== "recovered") {
      return "Rescue step before the next exam question";
    }

    return `Question ${Math.min(session.turns.length + 1, session.totalQuestionsTarget)} of ${session.totalQuestionsTarget}`;
  }, [activeRescue, session]);
  const currentQuestionNumber = session ? Math.min(session.turns.length + 1, session.totalQuestionsTarget) : 1;

  async function handleRescueRetry() {
    if (!studySet || !activeRescue || !rescueAnswer.trim()) {
      return;
    }

    setRescueError(null);
    setIsSubmittingRescue(true);

    try {
      const result = await submitRescueRetry(studySet.id, activeRescue.id, rescueAnswer.trim());
      setActiveRescue(result.attempt);
    } catch (submitError) {
      setRescueError(submitError instanceof Error ? submitError.message : "Could not check the rescue answer.");
    } finally {
      setIsSubmittingRescue(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!studySet || !session) {
      return;
    }

    if (!answer.trim()) {
      setError("Enter an answer before submitting.");
      return;
    }

    if (recordingState === "recording") {
      setError("Stop the microphone recording before submitting your answer.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await evaluateExamTurn({
        studySet,
        currentQuestion: session.currentQuestion,
        userAnswer: answer.trim(),
        turns: session.turns,
        weakTopics: session.weakTopics,
        totalQuestionsTarget: session.totalQuestionsTarget
      });

      const shouldEnd =
        response.shouldEnd || session.turns.length + 1 >= session.totalQuestionsTarget || !response.nextQuestion;

      const updatedSession = applyExamTurnResult(
        session,
        response.result,
        response.nextQuestion,
        response.weakTopics,
        shouldEnd
      );

      const savedSession = await saveExamSession(studySet.id, updatedSession);
      setSession(savedSession);
      setHistory((current) => [savedSession, ...current.filter((item) => item.id !== savedSession.id)]);
      setAnswer("");
      setRecordingHint("Use the microphone to record your oral answer, then submit it for scoring.");

      if (isRescueModeEnabled && !shouldEnd && shouldTriggerRescue(response.result.classification, response.result.score)) {
        setIsLoadingRescue(true);
        setActiveRescue(null);
        setRescueAnswer("");
        setRescueError(null);

        try {
          const rescueAttempt = await createRescueAttempt(studySet.id, savedSession.id);
          setActiveRescue(rescueAttempt);
        } catch (rescueCreateError) {
          setRescueError(rescueCreateError instanceof Error ? rescueCreateError.message : "Could not start Rescue Mode.");
        } finally {
          setIsLoadingRescue(false);
        }
      } else {
        setActiveRescue(null);
        setRescueAnswer("");
        setRescueError(null);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not evaluate answer.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording is not supported in this browser.");
      return;
    }

    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      answerBeforeRecordingRef.current = answer.trim();
      chunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      await startAudioLevelMonitor(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const detectedSpeechLevel = detectedSpeechLevelRef.current;
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        chunksRef.current = [];
        stopAudioLevelMonitor();

        if (!blob.size) {
          setRecordingState("idle");
          setError("No audio was captured. Try recording again.");
          return;
        }

        if (detectedSpeechLevel < SPEECH_DETECTION_THRESHOLD) {
          setRecordingState("idle");
          setError(null);
          setRecordingHint("No speech was detected, so your answer was left unchanged.");
          return;
        }

        setRecordingState("processing");
        setRecordingHint("Transcribing your oral answer...");

        try {
          const transcript = await transcribeExamAnswer(blob);
          const cleanedTranscript = transcript.trim();

          if (!cleanedTranscript) {
            setAnswer(answerBeforeRecordingRef.current);
            setRecordingHint("No speech was detected, so your answer was left unchanged.");
            return;
          }

          const mergedAnswer = [answerBeforeRecordingRef.current, cleanedTranscript]
            .filter(Boolean)
            .join(answerBeforeRecordingRef.current && cleanedTranscript ? "\n" : "");

          setAnswer(mergedAnswer);
          setRecordingHint("Transcript added. Review it, then submit your answer.");
        } catch (recordingError) {
          setError(recordingError instanceof Error ? recordingError.message : "Could not transcribe the recorded answer.");
          setRecordingHint("You can still type your answer if recording fails.");
        } finally {
          setRecordingState("idle");
        }
      };

      recorder.start();
      setRecordingState("recording");
      setRecordingHint("Recording your oral answer. Tap the microphone again to stop.");
    } catch (recordingError) {
      const message =
        recordingError instanceof DOMException && recordingError.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow microphone access and try again."
          : recordingError instanceof DOMException && recordingError.name === "NotFoundError"
            ? "No microphone was found for voice answering. Check your laptop input device."
            : "Could not start microphone recording. Check your browser permissions and device settings.";

      setError(message);
      setRecordingHint("You can still type your answer if recording is unavailable.");
      setRecordingState("idle");
      stopAudioLevelMonitor();
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  function handleMicrophoneClick() {
    if (recordingState === "processing") {
      return;
    }

    if (recordingState === "recording") {
      stopRecording();
      return;
    }

    void startRecording();
  }

  if (error && !session) {
    return (
      <StatePanel
        actions={
          <Button
            className="h-11 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] px-5 text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)] hover:opacity-95"
            disabled={isRetryingLoad}
            onClick={() => void handleRetryLoad()}
            type="button"
          >
            {isRetryingLoad ? "Retrying..." : "Try Again"}
          </Button>
        }
        copy={error}
        eyebrow="Exam Error"
        title="We couldn’t prepare your oral exam."
        tone="error"
      />
    );
  }

  if (!studySet || !session) {
    return <LoadingSurface />;
  }

  const latestTurn = session.turns.at(-1);
  const completedWeakTopics = session.summary?.weakTopics ?? session.weakTopics;
  const reviewConcept = completedWeakTopics[0];
  const completionPercent = Math.round((session.turns.length / session.totalQuestionsTarget) * 100);
  const examAnswerHelpId = "exam-answer-help";
  const examAnswerErrorId = "exam-answer-error";
  const mobileExamAnswerId = "exam-answer-mobile";
  const mobileExamAnswerHelpId = "exam-answer-help-mobile";
  const mobileExamAnswerErrorId = "exam-answer-error-mobile";
  const mobileRescueAnswerId = "rescue-answer-mobile";
  const examStats = [
    {
      copy: "Share of this session completed so far.",
      icon: Gauge,
      label: "Progress",
      value: `${completionPercent}%`
    },
    {
      copy: latestTurn ? `Last answer classified as ${latestTurn.classification}.` : "No answer scored yet.",
      icon: MessageSquareQuote,
      label: "Latest score",
      value: latestTurn ? `${latestTurn.score}%` : "Pending"
    },
    {
      copy:
        activeRescue && activeRescue.status !== "recovered"
          ? "A recovery step is blocking the next question."
          : "Adaptive support is ready when needed.",
      icon: isRescueModeEnabled ? ShieldCheck : ShieldAlert,
      label: "Rescue mode",
      value: activeRescue && activeRescue.status !== "recovered" ? "Active" : isRescueModeEnabled ? "On" : "Off"
    }
  ] as const;

  return (
    <>
      <section className="space-y-4 pb-6 lg:hidden">
        <Reveal>
          <Card
            className={cn(
              "relative overflow-hidden rounded-[1.8rem] border-white/10 bg-[linear-gradient(135deg,rgba(14,18,28,0.96),rgba(9,11,19,0.98))] shadow-[0_24px_70px_rgba(0,0,0,0.28)]",
              activeRescue && activeRescue.status !== "recovered" && "border-amber-300/18"
            )}
          >
            <div aria-hidden="true" className="absolute inset-0">
              <div className="absolute right-[-18%] top-[-12%] h-44 w-44 rounded-full bg-[#4f7cff]/16 blur-3xl" />
              <div className="absolute bottom-[-20%] left-[-12%] h-40 w-40 rounded-full bg-[#ffb56f]/16 blur-3xl" />
            </div>

            <CardContent className="relative space-y-5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                  Adaptive Oral Exam
                </Badge>
                <Button
                  asChild
                  className="h-10 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-zinc-100 hover:bg-white/[0.08]"
                  variant="ghost"
                >
                  <Link to={`/study-sets/${studySet.id}`}>
                    <ArrowLeft className="size-4" />
                    Back
                  </Link>
                </Button>
              </div>

              <div className="space-y-3">
                <h1 className="font-[family-name:var(--font-display)] text-[2.45rem] leading-[0.94] text-white">
                  {studySet.title}
                </h1>
                <p className="text-sm leading-7 text-zinc-300">
                  {session.completed ? "This session is complete and ready for review." : progressLabel}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 text-sm text-zinc-400">
                  <span>{session.completed ? "Session complete" : progressLabel}</span>
                  <span>{session.completed ? "100%" : `${completionPercent}%`}</span>
                </div>
                <Progress
                  className="h-2 rounded-full bg-white/8 [&_[data-slot=progress-indicator]]:bg-[linear-gradient(90deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)]"
                  value={Math.max(session.completed ? 100 : 8, completionPercent)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {examStats.map((stat) => (
                  <Badge className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[0.72rem] text-zinc-100" key={stat.label}>
                    {stat.label}: {stat.value}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </Reveal>

        {session.completed ? (
          <Reveal delay={0.05}>
            <Card className="rounded-[1.7rem] border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
              <CardContent className="space-y-4 p-5">
                <div className="space-y-2">
                  <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                    Session Complete
                  </Badge>
                  <p className="text-sm leading-7 text-zinc-300">
                    Average score: {session.summary?.averageScore ?? 0}% across {session.summary?.totalQuestions ?? 0} questions.
                  </p>
                </div>

                {completedWeakTopics.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {completedWeakTopics.map((topic) => (
                      <Badge className="rounded-full border border-amber-300/16 bg-amber-300/10 px-3 py-1 text-[0.72rem] text-amber-50" key={topic}>
                        {topic}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm leading-7 text-zinc-400">No weak topics were detected in this session.</p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    className="h-12 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] px-5 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)] hover:opacity-95"
                    onClick={() => void handleRestartExam()}
                    type="button"
                  >
                    {isRestarting ? "Restarting..." : "Retake Test"}
                    <RefreshCcw className="size-4" />
                  </Button>
                  <Button
                    className="h-12 rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-zinc-100 hover:bg-white/[0.08]"
                    disabled={!reviewConcept}
                    onClick={() =>
                      navigate(`/study-sets/${studySet.id}`, {
                        state: reviewConcept ? { focusConcept: reviewConcept } : undefined
                      })
                    }
                    type="button"
                    variant="ghost"
                  >
                    Review Weak Topics
                  </Button>
                </div>
              </CardContent>
            </Card>
          </Reveal>
        ) : (
          <>
            {isLoadingRescue ? (
              <Reveal delay={0.05}>
                <Card aria-live="polite" className="rounded-[1.6rem] border-amber-300/14 bg-amber-300/8 shadow-[0_18px_50px_rgba(0,0,0,0.18)]" role="status">
                  <CardContent className="space-y-2 p-4">
                    <Badge className="rounded-full border border-amber-300/16 bg-amber-300/10 px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-amber-50">
                      Rescue Mode
                    </Badge>
                    <p className="text-sm leading-7 text-amber-50/90">
                      We’re preparing a focused recovery step before the next question.
                    </p>
                  </CardContent>
                </Card>
              </Reveal>
            ) : null}

            {activeRescue ? (
              <Reveal delay={0.06}>
                <Card
                  className={cn(
                    "rounded-[1.7rem] shadow-[0_20px_60px_rgba(0,0,0,0.2)]",
                    activeRescue.status === "recovered"
                      ? "border-emerald-400/18 bg-emerald-400/8"
                      : "border-amber-300/14 bg-amber-300/8"
                  )}
                >
                  <CardContent className="space-y-4 p-5">
                    <div className="space-y-2">
                      <Badge
                        className={cn(
                          "rounded-full border px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em]",
                          activeRescue.status === "recovered"
                            ? "border-emerald-400/18 bg-emerald-400/10 text-emerald-100"
                            : "border-amber-300/16 bg-amber-300/10 text-amber-50"
                        )}
                      >
                        {activeRescue.status === "recovered" ? "Concept Recovered" : "Rescue Mode Active"}
                      </Badge>
                      <h2 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-white">
                        {activeRescue.status === "recovered" ? "You’re back on track." : `Fix ${activeRescue.concept}.`}
                      </h2>
                    </div>

                    <Card className="rounded-[1.3rem] border-white/8 bg-black/16 shadow-none">
                      <CardContent className="space-y-2 p-4">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">What went wrong</p>
                        <p className="text-sm leading-7 text-zinc-200">{activeRescue.diagnosis}</p>
                      </CardContent>
                    </Card>

                    <Card className="rounded-[1.3rem] border-white/8 bg-black/16 shadow-none">
                      <CardContent className="space-y-2 p-4">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Quick fix</p>
                        <p className="text-sm leading-7 text-zinc-200">{activeRescue.microLesson}</p>
                      </CardContent>
                    </Card>

                    {activeRescue.retryFeedback ? (
                      <Card className="rounded-[1.3rem] border-white/8 bg-black/16 shadow-none">
                        <CardContent className="space-y-2 p-4">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                            {activeRescue.status === "recovered" ? "Recovered" : "Still needs work"}
                          </p>
                          <p className="text-sm leading-7 text-zinc-200">{activeRescue.retryFeedback}</p>
                        </CardContent>
                      </Card>
                    ) : null}

                    {activeRescue.status !== "recovered" ? (
                      <div className="space-y-4">
                        <label className="text-sm font-semibold text-white" htmlFor={mobileRescueAnswerId}>
                          {activeRescue.retryQuestion.prompt}
                        </label>
                        <Textarea
                          className="min-h-32 rounded-[1.4rem] border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-7 text-zinc-100 placeholder:text-zinc-500 focus-visible:border-amber-300/24 focus-visible:ring-amber-300/14"
                          id={mobileRescueAnswerId}
                          onChange={(event) => setRescueAnswer(event.target.value)}
                          placeholder="Try the concept again in your own words."
                          rows={4}
                          value={rescueAnswer}
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Button
                            className="h-11 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] px-5 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)] hover:opacity-95"
                            disabled={isSubmittingRescue || !rescueAnswer.trim()}
                            onClick={() => void handleRescueRetry()}
                            type="button"
                          >
                            {isSubmittingRescue ? "Checking..." : "Try Again"}
                          </Button>
                          <Button
                            className="h-11 rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-zinc-100 hover:bg-white/[0.08]"
                            onClick={() => {
                              setActiveRescue(null);
                              setRescueAnswer("");
                              setRescueError(null);
                            }}
                            type="button"
                            variant="ghost"
                          >
                            Continue Exam
                          </Button>
                        </div>
                        {rescueError ? (
                          <div className="rounded-[1.2rem] border border-rose-400/18 bg-rose-400/10 px-4 py-3 text-sm leading-7 text-rose-100" role="alert">
                            {rescueError}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <Button
                        className="h-11 w-full rounded-full border border-white/10 bg-white/[0.08] px-5 text-sm font-semibold text-white hover:bg-white/[0.12]"
                        onClick={() => {
                          setActiveRescue(null);
                          setRescueAnswer("");
                          setRescueError(null);
                        }}
                        type="button"
                        variant="ghost"
                      >
                        Continue Exam
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </Reveal>
            ) : null}

            <Reveal delay={0.07}>
              <Card className="rounded-[1.7rem] border-white/10 bg-[linear-gradient(180deg,rgba(13,18,28,0.96),rgba(9,11,18,0.98))] shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
                <CardContent className="space-y-4 p-5">
                  <div className="space-y-2">
                    <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                      Current Question
                    </Badge>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[0.72rem] text-zinc-300">
                        Question {currentQuestionNumber} of {session.totalQuestionsTarget}
                      </Badge>
                      {session.currentQuestion.focusTopic ? (
                        <Badge className="rounded-full border border-amber-300/16 bg-amber-300/10 px-3 py-1 text-[0.72rem] text-amber-50">
                          Focus: {session.currentQuestion.focusTopic}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <h2 className="font-[family-name:var(--font-display)] text-3xl leading-tight text-white">
                    {session.currentQuestion.prompt}
                  </h2>
                </CardContent>
              </Card>
            </Reveal>

            <Reveal delay={0.08}>
              <Card
                className={cn(
                  "rounded-[1.7rem] border-white/10 bg-[linear-gradient(180deg,rgba(13,18,28,0.96),rgba(9,11,18,0.98))] shadow-[0_20px_60px_rgba(0,0,0,0.2)]",
                  activeRescue && activeRescue.status !== "recovered" && "opacity-75"
                )}
              >
                <CardContent className="space-y-4 p-5">
                  <div className="space-y-2">
                    <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                      Your Answer
                    </Badge>
                    <Label className="text-sm font-medium text-zinc-200" htmlFor={mobileExamAnswerId}>
                      Response draft
                    </Label>
                    <p aria-live="polite" className="text-sm leading-7 text-zinc-400" id={mobileExamAnswerHelpId} role="status">
                      {recordingHint ?? "Use the microphone to record an oral answer, then submit it for scoring."}
                    </p>
                  </div>

                  <form aria-busy={isSubmitting || isLoadingRescue || recordingState === "processing"} className="space-y-4" onSubmit={handleSubmit}>
                    <div className="relative">
                      <Textarea
                        aria-describedby={error ? `${mobileExamAnswerHelpId} ${mobileExamAnswerErrorId}` : mobileExamAnswerHelpId}
                        className="min-h-44 rounded-[1.4rem] border-white/10 bg-white/[0.04] px-4 py-4 pr-16 text-sm leading-7 text-zinc-100 placeholder:text-zinc-500 focus-visible:border-amber-300/24 focus-visible:ring-amber-300/14"
                        disabled={isSubmitting || recordingState === "processing" || isLoadingRescue || (activeRescue !== null && activeRescue.status !== "recovered")}
                        id={mobileExamAnswerId}
                        onChange={(event) => setAnswer(event.target.value)}
                        placeholder="Explain in your own words, or use the microphone to record an oral response."
                        rows={6}
                        value={answer}
                      />
                      <button
                        aria-label={
                          recordingState === "recording"
                            ? "Stop recording oral answer"
                            : recordingState === "processing"
                              ? "Transcribing oral answer"
                              : "Record oral answer"
                        }
                        className={cn(
                          "absolute bottom-4 right-4 inline-flex size-11 items-center justify-center rounded-full border transition",
                          recordingState === "recording"
                            ? "border-rose-400/24 bg-rose-400/18 text-rose-100"
                            : recordingState === "processing"
                              ? "border-white/10 bg-white/[0.04] text-zinc-400"
                              : "border-white/10 bg-white/[0.06] text-zinc-100 hover:bg-white/[0.1]"
                        )}
                        disabled={
                          recordingState === "processing" ||
                          isSubmitting ||
                          isLoadingRescue ||
                          (activeRescue !== null && activeRescue.status !== "recovered")
                        }
                        onClick={handleMicrophoneClick}
                        type="button"
                      >
                        {recordingState === "processing" ? (
                          <LoaderCircle className="size-5 animate-spin" />
                        ) : recordingState === "recording" ? (
                          <Square className="size-[18px]" />
                        ) : (
                          <Mic className="size-5" />
                        )}
                      </button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Button
                        className="h-12 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] px-5 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)] hover:opacity-95"
                        disabled={isSubmitting || isLoadingRescue || (activeRescue !== null && activeRescue.status !== "recovered")}
                        type="submit"
                      >
                        {isSubmitting ? "Scoring..." : "Submit Answer"}
                        <Sparkles className="size-4" />
                      </Button>
                      <Button
                        className="h-12 rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-zinc-100 hover:bg-white/[0.08]"
                        onClick={() => void handleRestartExam()}
                        type="button"
                        variant="ghost"
                      >
                        {isRestarting ? "Restarting..." : "Restart Session"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </Reveal>
          </>
        )}

        {loadNotice ? (
          <Reveal delay={0.09}>
            <Card className="rounded-[1.4rem] border-amber-300/16 bg-amber-300/10 shadow-[0_18px_50px_rgba(0,0,0,0.18)]" role="status">
              <CardContent className="p-4 text-sm leading-7 text-amber-50">{loadNotice}</CardContent>
            </Card>
          </Reveal>
        ) : null}

        {error ? (
          <Reveal delay={0.1}>
            <Card className="rounded-[1.4rem] border-rose-400/18 bg-rose-400/10 shadow-[0_18px_50px_rgba(0,0,0,0.18)]" role="alert">
              <CardContent className="space-y-3 p-4">
                <h3 className="font-medium text-white">Something interrupted this exam flow.</h3>
                <p className="text-sm leading-7 text-rose-100/90" id={mobileExamAnswerErrorId}>
                  {error}
                </p>
                {!session.completed && answer.trim() ? (
                  <Button
                    className="h-10 rounded-full border border-white/10 bg-white/[0.08] px-4 text-sm font-semibold text-white hover:bg-white/[0.12]"
                    disabled={isSubmitting}
                    onClick={() => setError(null)}
                    type="button"
                    variant="ghost"
                  >
                    Keep Editing
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          </Reveal>
        ) : null}

        <Tabs className="min-w-0" defaultValue={latestTurn ? "feedback" : "history"}>
          <Card className="overflow-hidden rounded-[1.8rem] border-white/10 bg-[linear-gradient(180deg,rgba(14,18,28,0.98),rgba(9,11,18,0.98))] shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
            <CardContent className="space-y-5 p-5">
              <div className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <TabsList className="grid h-11 w-full min-w-0 grid-cols-2 items-stretch gap-1 rounded-[1.05rem] bg-transparent p-0">
                  <TabsTrigger className="h-full min-w-0 rounded-[0.95rem] px-2 py-0 text-sm leading-none text-zinc-400 data-[state=active]:bg-white/[0.08] data-[state=active]:text-white" value="feedback">
                    Feedback
                  </TabsTrigger>
                  <TabsTrigger className="h-full min-w-0 rounded-[0.95rem] px-2 py-0 text-sm leading-none text-zinc-400 data-[state=active]:bg-white/[0.08] data-[state=active]:text-white" value="history">
                    History
                  </TabsTrigger>
                </TabsList>
              </div>

          <TabsContent className="space-y-4" value="feedback">
            <Reveal delay={0.06}>
              <Card className="rounded-[1.7rem] border-white/10 bg-[linear-gradient(180deg,rgba(14,18,28,0.98),rgba(9,11,18,0.98))] shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
                <CardContent className="space-y-4 p-5">
                  <div className="space-y-2">
                    <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                      Live Readout
                    </Badge>
                    <p className="text-sm leading-7 text-zinc-400">
                      Keep an eye on the latest evaluation and the concepts that still need recovery.
                    </p>
                  </div>

                  {latestTurn ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[0.72rem] text-zinc-100">
                          Score {latestTurn.score}%
                        </Badge>
                        <Badge className="rounded-full border border-white/8 bg-transparent px-3 py-1 text-[0.72rem] text-zinc-400">
                          {latestTurn.classification}
                        </Badge>
                      </div>
                      {[
                        { copy: latestTurn.feedback, label: "What you should know" },
                        { copy: latestTurn.idealAnswer, label: "Ideal answer" }
                      ].map((item) => (
                        <Card className="rounded-[1.3rem] border-white/8 bg-white/[0.03] shadow-none" key={item.label}>
                          <CardContent className="space-y-2 p-4">
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">{item.label}</p>
                            <p className="text-sm leading-7 text-zinc-200">{item.copy}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm leading-7 text-zinc-400">
                      Submit your first answer to see score guidance, ideal phrasing, and recovery signals.
                    </p>
                  )}

                  <Card className="rounded-[1.3rem] border-white/8 bg-white/[0.03] shadow-none">
                    <CardContent className="space-y-3 p-4">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Current weak topics</p>
                      {completedWeakTopics.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {completedWeakTopics.map((topic) => (
                            <Badge className="rounded-full border border-amber-300/16 bg-amber-300/10 px-3 py-1 text-[0.72rem] text-amber-50" key={topic}>
                              {topic}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm leading-7 text-zinc-400">No weak topics detected yet.</p>
                      )}
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
            </Reveal>
          </TabsContent>

          <TabsContent className="space-y-4" value="history">
            <Reveal delay={0.06}>
              <Card className="rounded-[1.7rem] border-white/10 bg-[linear-gradient(180deg,rgba(14,18,28,0.98),rgba(9,11,18,0.98))] shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
                <CardContent className="space-y-4 p-5">
                  <div className="space-y-2">
                    <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                      Session Memory
                    </Badge>
                    <p className="text-sm leading-7 text-zinc-400">
                      Saved attempts stay attached to the study set so progress feels cumulative.
                    </p>
                  </div>

                  {isLoadingHistory ? (
                    <div className="space-y-3">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton className="h-24 rounded-[1.3rem] bg-white/8" key={index} />
                      ))}
                    </div>
                  ) : history.length === 0 ? (
                    <p className="text-sm leading-7 text-zinc-400">Your saved exam sessions for this study set will appear here.</p>
                  ) : (
                    <div className="space-y-3">
                      {history.map((item) => (
                        <Card className="rounded-[1.3rem] border-white/8 bg-white/[0.03] shadow-none" key={item.id}>
                          <CardContent className="space-y-3 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Badge
                                className={cn(
                                  "rounded-full border px-3 py-1 text-[0.72rem]",
                                  item.completed
                                    ? "border-emerald-400/18 bg-emerald-400/10 text-emerald-100"
                                    : "border-amber-300/16 bg-amber-300/10 text-amber-50"
                                )}
                              >
                                {item.completed ? "Completed" : "In progress"}
                              </Badge>
                              <span className="text-sm text-zinc-500">{item.turns.length} turns</span>
                            </div>
                            <div className="grid gap-1 text-sm text-zinc-300">
                              <span>{item.completed ? `${item.summary?.averageScore ?? 0}% average score` : "Resume available"}</span>
                              <span>{item.completed ? `${item.summary?.totalQuestions ?? item.turns.length} questions answered` : `${item.totalQuestionsTarget} questions planned`}</span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Reveal>
          </TabsContent>
            </CardContent>
          </Card>
        </Tabs>
      </section>

      <section className="hidden gap-6 pb-6 lg:grid xl:grid-cols-[minmax(0,1.12fr)_minmax(340px,0.88fr)]">
      <div className="space-y-6">
        <Reveal>
          <Card
            className={cn(
              "relative overflow-hidden rounded-[2rem] border-white/10 bg-[linear-gradient(135deg,rgba(14,18,28,0.96),rgba(9,11,19,0.98))] shadow-[0_30px_90px_rgba(0,0,0,0.34)]",
              activeRescue && activeRescue.status !== "recovered" && "border-amber-300/18"
            )}
          >
            <div aria-hidden="true" className="absolute inset-0">
              <div className="absolute right-[-8%] top-[-10%] h-56 w-56 rounded-full bg-[#4f7cff]/16 blur-3xl" />
              <div className="absolute bottom-[-14%] left-[-6%] h-52 w-52 rounded-full bg-[#ffb56f]/16 blur-3xl" />
            </div>

            <CardContent className="relative space-y-7 p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-3">
                  <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                    Adaptive Oral Exam
                  </Badge>
                  <div className="space-y-2">
                    <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[0.96] text-white sm:text-5xl">
                      {studySet.title}
                    </h1>
                    <p className="text-base leading-8 text-zinc-300">
                      {session.completed ? "This session is complete and ready for review." : progressLabel}
                    </p>
                  </div>
                </div>

                <Button
                  asChild
                  className="h-11 rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-zinc-100 hover:bg-white/[0.08]"
                  variant="ghost"
                >
                  <Link to={`/study-sets/${studySet.id}`}>
                    <ArrowLeft className="size-4" />
                    Back to Set
                  </Link>
                </Button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 text-sm text-zinc-400">
                  <span>{progressLabel}</span>
                  <span>{session.completed ? "Complete" : `${completionPercent}% complete`}</span>
                </div>
                <Progress
                  className="h-2 rounded-full bg-white/8 [&_[data-slot=progress-indicator]]:bg-[linear-gradient(90deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)]"
                  value={Math.max(session.completed ? 100 : 8, completionPercent)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {examStats.map((stat, index) => (
                  <Reveal delay={0.04 * index} key={stat.label}>
                    <Card className="rounded-[1.5rem] border-white/10 bg-white/[0.05] shadow-none">
                      <CardContent className="space-y-3 p-5">
                        <span className="inline-flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-zinc-100">
                          <stat.icon className="size-5" />
                        </span>
                        <div className="space-y-1.5">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                            {stat.label}
                          </p>
                          <strong className="block font-[family-name:var(--font-display)] text-3xl leading-none text-white">
                            {stat.value}
                          </strong>
                        </div>
                        <p className="text-sm leading-7 text-zinc-400">{stat.copy}</p>
                      </CardContent>
                    </Card>
                  </Reveal>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge
                  className={cn(
                    "rounded-full border px-3 py-1 text-[0.72rem]",
                    isRescueModeEnabled
                      ? "border-amber-300/16 bg-amber-300/10 text-amber-50"
                      : "border-white/10 bg-white/[0.04] text-zinc-300"
                  )}
                >
                  {isRescueModeEnabled ? "Rescue Mode Active" : "Rescue Mode Off"}
                </Badge>
                {activeRescue && activeRescue.status !== "recovered" ? (
                  <Badge className="rounded-full border border-rose-400/18 bg-rose-400/10 px-3 py-1 text-[0.72rem] text-rose-100">
                    Rescue step blocking next question
                  </Badge>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </Reveal>

        {session.completed ? (
          <Reveal delay={0.06}>
            <Card className="rounded-[1.9rem] border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
              <CardContent className="space-y-6 p-6 sm:p-7">
                <div className="space-y-3">
                  <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                    Session Complete
                  </Badge>
                  <h2 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-white">
                    Review the outcome, then go again sharper.
                  </h2>
                  <p className="text-base leading-8 text-zinc-300">
                    Average score: {session.summary?.averageScore ?? 0}% across {session.summary?.totalQuestions ?? 0} questions.
                    {isRescueModeEnabled ? " Rescue Mode was enabled for this session." : " Rescue Mode was turned off for this session."}
                  </p>
                </div>

                <Card className="rounded-[1.5rem] border-white/8 bg-white/[0.03] shadow-none">
                  <CardContent className="space-y-4 p-5">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Current weak topics</p>
                    {completedWeakTopics.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {completedWeakTopics.map((topic) => (
                          <Badge className="rounded-full border border-amber-300/16 bg-amber-300/10 px-3 py-1 text-[0.72rem] text-amber-50" key={topic}>
                            {topic}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm leading-7 text-zinc-400">No weak topics were detected in this session.</p>
                    )}
                  </CardContent>
                </Card>

                <div className="flex flex-wrap gap-3">
                  <Button
                    className="h-12 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] px-5 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)] hover:opacity-95"
                    onClick={() => void handleRestartExam()}
                    type="button"
                  >
                    {isRestarting ? "Restarting..." : "Retake Test"}
                    <RefreshCcw className="size-4" />
                  </Button>
                  <Button
                    className="h-12 rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-zinc-100 hover:bg-white/[0.08]"
                    disabled={!reviewConcept}
                    onClick={() =>
                      navigate(`/study-sets/${studySet.id}`, {
                        state: reviewConcept ? { focusConcept: reviewConcept } : undefined
                      })
                    }
                    type="button"
                    variant="ghost"
                  >
                    Review Weak Topics
                  </Button>
                </div>
              </CardContent>
            </Card>
          </Reveal>
        ) : (
          <>
            {isLoadingRescue ? (
              <Reveal delay={0.07}>
                <Card
                  aria-live="polite"
                  className="rounded-[1.8rem] border-amber-300/14 bg-amber-300/8 shadow-[0_24px_70px_rgba(0,0,0,0.22)]"
                  role="status"
                >
                  <CardContent className="space-y-3 p-6">
                    <Badge className="rounded-full border border-amber-300/16 bg-amber-300/10 px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-amber-50">
                      Rescue Mode
                    </Badge>
                    <h2 className="font-[family-name:var(--font-display)] text-3xl text-white">Preparing your recovery step.</h2>
                    <p className="text-sm leading-7 text-amber-50/85">
                      We’re building a focused explanation before you move to the next exam question.
                    </p>
                  </CardContent>
                </Card>
              </Reveal>
            ) : null}

            {activeRescue ? (
              <Reveal delay={0.08}>
                <Card
                  className={cn(
                    "rounded-[1.9rem] shadow-[0_24px_70px_rgba(0,0,0,0.22)]",
                    activeRescue.status === "recovered"
                      ? "border-emerald-400/18 bg-emerald-400/8"
                      : "border-amber-300/14 bg-amber-300/8"
                  )}
                >
                  <CardContent className="space-y-6 p-6 sm:p-7">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                      <div className="space-y-3">
                        <Badge
                          className={cn(
                            "rounded-full border px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em]",
                            activeRescue.status === "recovered"
                              ? "border-emerald-400/18 bg-emerald-400/10 text-emerald-100"
                              : "border-amber-300/16 bg-amber-300/10 text-amber-50"
                          )}
                        >
                          {activeRescue.status === "recovered" ? "Concept Recovered" : "Rescue Mode Active"}
                        </Badge>
                        <h2 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-white">
                          {activeRescue.status === "recovered" ? "You’re back on track." : `Let’s fix ${activeRescue.concept}.`}
                        </h2>
                        <p className="text-base leading-8 text-zinc-200">
                          {activeRescue.status === "recovered"
                            ? "The concept has been recovered. Continue when you’re ready."
                            : "Repair the weak spot before the exam moves to the next question."}
                        </p>
                      </div>

                      {activeRescue.status === "recovered" ? (
                        <Button
                          className="h-11 rounded-full border border-white/10 bg-white/[0.08] px-5 text-sm font-semibold text-white hover:bg-white/[0.12]"
                          onClick={() => {
                            setActiveRescue(null);
                            setRescueAnswer("");
                            setRescueError(null);
                          }}
                          type="button"
                          variant="ghost"
                        >
                          Continue Exam
                        </Button>
                      ) : null}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Card className="rounded-[1.4rem] border-white/8 bg-black/16 shadow-none">
                        <CardContent className="space-y-3 p-5">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">What went wrong</p>
                          <p className="text-sm leading-7 text-zinc-200">{activeRescue.diagnosis}</p>
                        </CardContent>
                      </Card>
                      <Card className="rounded-[1.4rem] border-white/8 bg-black/16 shadow-none">
                        <CardContent className="space-y-3 p-5">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">Quick fix</p>
                          <p className="text-sm leading-7 text-zinc-200">{activeRescue.microLesson}</p>
                        </CardContent>
                      </Card>
                    </div>

                    {activeRescue.sourceSupport ? (
                      <Card className="rounded-[1.4rem] border-white/8 bg-black/16 shadow-none">
                        <CardContent className="space-y-3 p-5">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">From your notes</p>
                          <p className="text-sm leading-7 text-zinc-200">{activeRescue.sourceSupport}</p>
                        </CardContent>
                      </Card>
                    ) : null}

                    {activeRescue.retryFeedback ? (
                      <Card className="rounded-[1.4rem] border-white/8 bg-black/16 shadow-none">
                        <CardContent className="space-y-3 p-5">
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                            {activeRescue.status === "recovered" ? "Recovered" : "Still needs work"}
                          </p>
                          <p className="text-sm leading-7 text-zinc-200">{activeRescue.retryFeedback}</p>
                          {typeof activeRescue.retryScore === "number" ? (
                            <p className="text-sm text-zinc-400">Retry score: {activeRescue.retryScore}%</p>
                          ) : null}
                        </CardContent>
                      </Card>
                    ) : null}

                    {activeRescue.status !== "recovered" ? (
                      <Card className="rounded-[1.5rem] border-white/10 bg-black/18 shadow-none">
                        <CardContent className="space-y-5 p-5">
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-white" htmlFor="rescue-answer">
                              {activeRescue.retryQuestion.prompt}
                            </label>
                            <p className="text-sm leading-7 text-zinc-300">
                              Try again now to lock it in before moving on.
                            </p>
                          </div>
                          <Textarea
                            className="min-h-36 rounded-[1.4rem] border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-7 text-zinc-100 placeholder:text-zinc-500 focus-visible:border-amber-300/24 focus-visible:ring-amber-300/14"
                            id="rescue-answer"
                            onChange={(event) => setRescueAnswer(event.target.value)}
                            placeholder="Try the concept again in your own words."
                            rows={5}
                            value={rescueAnswer}
                          />
                          <div className="flex flex-wrap gap-3">
                            <Button
                              className="h-11 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] px-5 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)] hover:opacity-95"
                              disabled={isSubmittingRescue || !rescueAnswer.trim()}
                              onClick={() => void handleRescueRetry()}
                              type="button"
                            >
                              {isSubmittingRescue ? "Checking..." : "Try Again"}
                            </Button>
                            <Button
                              className="h-11 rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-zinc-100 hover:bg-white/[0.08]"
                              onClick={() => {
                                setActiveRescue(null);
                                setRescueAnswer("");
                                setRescueError(null);
                              }}
                              type="button"
                              variant="ghost"
                            >
                              Continue Exam
                            </Button>
                          </div>
                          {rescueError ? (
                            <div className="rounded-[1.2rem] border border-rose-400/18 bg-rose-400/10 px-4 py-3 text-sm leading-7 text-rose-100" role="alert">
                              {rescueError}
                            </div>
                          ) : null}
                        </CardContent>
                      </Card>
                    ) : null}
                  </CardContent>
                </Card>
              </Reveal>
            ) : null}

            <Reveal delay={0.1}>
              <Card className="rounded-[1.9rem] border-white/10 bg-[linear-gradient(180deg,rgba(13,18,28,0.96),rgba(9,11,18,0.98))] shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
                <CardContent className="space-y-6 p-6 sm:p-7">
                  <div className="space-y-3">
                    <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                      Current Question
                    </Badge>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[0.72rem] text-zinc-300">
                        Question {currentQuestionNumber} of {session.totalQuestionsTarget}
                      </Badge>
                      {session.currentQuestion.focusTopic ? (
                        <Badge className="rounded-full border border-amber-300/16 bg-amber-300/10 px-3 py-1 text-[0.72rem] text-amber-50">
                          Focus: {session.currentQuestion.focusTopic}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <h2 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-white">
                    {session.currentQuestion.prompt}
                  </h2>
                  <p className="text-sm leading-7 text-zinc-400">
                    Answer as if you’re speaking to an examiner. Aim for clarity, structure, and accurate terminology.
                  </p>
                </CardContent>
              </Card>
            </Reveal>

            <Reveal delay={0.12}>
              <Card
                className={cn(
                  "rounded-[1.9rem] border-white/10 bg-[linear-gradient(180deg,rgba(13,18,28,0.96),rgba(9,11,18,0.98))] shadow-[0_24px_70px_rgba(0,0,0,0.24)]",
                  activeRescue && activeRescue.status !== "recovered" && "opacity-75"
                )}
              >
                <CardContent className="space-y-5 p-6 sm:p-7">
                  <div className="space-y-2">
                    <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                      Your Answer
                    </Badge>
                    <Label className="text-sm font-medium text-zinc-200" htmlFor="exam-answer">
                      Response draft
                    </Label>
                    <p aria-live="polite" className="text-sm leading-7 text-zinc-400" id={examAnswerHelpId} role="status">
                      {recordingHint ?? "Use the microphone to record an oral answer, then submit it for scoring."}
                    </p>
                  </div>

                  <form aria-busy={isSubmitting || isLoadingRescue || recordingState === "processing"} className="space-y-4" onSubmit={handleSubmit}>
                    <div className="relative">
                      <Textarea
                        aria-describedby={error ? `${examAnswerHelpId} ${examAnswerErrorId}` : examAnswerHelpId}
                        className="min-h-56 rounded-[1.5rem] border-white/10 bg-white/[0.04] px-4 py-4 pr-16 text-sm leading-7 text-zinc-100 placeholder:text-zinc-500 focus-visible:border-amber-300/24 focus-visible:ring-amber-300/14"
                        disabled={isSubmitting || recordingState === "processing" || isLoadingRescue || (activeRescue !== null && activeRescue.status !== "recovered")}
                        id="exam-answer"
                        onChange={(event) => setAnswer(event.target.value)}
                        placeholder="Explain in your own words, or use the microphone to record an oral response."
                        rows={8}
                        value={answer}
                      />
                      <button
                        aria-label={
                          recordingState === "recording"
                            ? "Stop recording oral answer"
                            : recordingState === "processing"
                              ? "Transcribing oral answer"
                              : "Record oral answer"
                        }
                        className={cn(
                          "absolute bottom-4 right-4 inline-flex size-11 items-center justify-center rounded-full border transition",
                          recordingState === "recording"
                            ? "border-rose-400/24 bg-rose-400/18 text-rose-100"
                            : recordingState === "processing"
                              ? "border-white/10 bg-white/[0.04] text-zinc-400"
                              : "border-white/10 bg-white/[0.06] text-zinc-100 hover:bg-white/[0.1]"
                        )}
                        disabled={
                          recordingState === "processing" ||
                          isSubmitting ||
                          isLoadingRescue ||
                          (activeRescue !== null && activeRescue.status !== "recovered")
                        }
                        onClick={handleMicrophoneClick}
                        type="button"
                      >
                        {recordingState === "processing" ? (
                          <LoaderCircle className="size-5 animate-spin" />
                        ) : recordingState === "recording" ? (
                          <Square className="size-[18px]" />
                        ) : (
                          <Mic className="size-5" />
                        )}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        className="h-12 rounded-full bg-[linear-gradient(135deg,#ffb56f_0%,#f08d63_34%,#bc7cff_100%)] px-5 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(240,141,99,0.22)] hover:opacity-95"
                        disabled={isSubmitting || isLoadingRescue || (activeRescue !== null && activeRescue.status !== "recovered")}
                        type="submit"
                      >
                        {isSubmitting ? "Scoring..." : "Submit Answer"}
                        <Sparkles className="size-4" />
                      </Button>
                      <Button
                        className="h-12 rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-zinc-100 hover:bg-white/[0.08]"
                        onClick={() => void handleRestartExam()}
                        type="button"
                        variant="ghost"
                      >
                        {isRestarting ? "Restarting..." : "Restart Session"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </Reveal>
          </>
        )}

        {loadNotice ? (
          <Reveal delay={0.12}>
            <Card className="rounded-[1.6rem] border-amber-300/16 bg-amber-300/10 shadow-[0_24px_70px_rgba(0,0,0,0.18)]" role="status">
              <CardContent className="flex gap-3 p-5">
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-amber-300/18 bg-amber-300/14 text-amber-50">
                  <TriangleAlert className="size-5" />
                </span>
                <div className="space-y-2">
                  <h3 className="font-medium text-white">Some session history is still catching up.</h3>
                  <p className="text-sm leading-7 text-amber-50/90">{loadNotice}</p>
                </div>
              </CardContent>
            </Card>
          </Reveal>
        ) : null}

        {error ? (
          <Reveal delay={0.14}>
            <Card className="rounded-[1.6rem] border-rose-400/18 bg-rose-400/10 shadow-[0_24px_70px_rgba(0,0,0,0.18)]" role="alert">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3">
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-rose-400/18 bg-rose-400/14 text-rose-100">
                    <TriangleAlert className="size-5" />
                  </span>
                  <div className="space-y-2">
                    <h3 className="font-medium text-white">Something interrupted this exam flow.</h3>
                    <p className="text-sm leading-7 text-rose-100/90" id={examAnswerErrorId}>
                      {error}
                    </p>
                  </div>
                </div>
                {!session.completed && answer.trim() ? (
                  <Button
                    className="h-11 rounded-full border border-white/10 bg-white/[0.08] px-5 text-sm font-semibold text-white hover:bg-white/[0.12]"
                    disabled={isSubmitting}
                    onClick={() => setError(null)}
                    type="button"
                    variant="ghost"
                  >
                    Keep Editing
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          </Reveal>
        ) : null}
      </div>

      <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
        <Reveal delay={0.06}>
          <Card className="rounded-[1.9rem] border-white/10 bg-[linear-gradient(180deg,rgba(14,18,28,0.98),rgba(9,11,18,0.98))] shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
            <CardContent className="space-y-5 p-6">
              <div className="space-y-3">
                <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                  Session Memory
                </Badge>
                <div className="space-y-2">
                  <h2 className="font-[family-name:var(--font-display)] text-3xl text-white">Past exam sessions</h2>
                  <p className="text-sm leading-7 text-zinc-400">
                    Saved attempts stay beside the active session so progress feels cumulative, not disposable.
                  </p>
                </div>
              </div>

              {isLoadingHistory ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton className="h-28 rounded-[1.4rem] bg-white/8" key={index} />
                  ))}
                </div>
              ) : history.length === 0 ? (
                <Card className="rounded-[1.4rem] border-white/8 bg-white/[0.03] shadow-none">
                  <CardContent className="space-y-3 p-5">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">No history yet</p>
                    <p className="text-sm leading-7 text-zinc-400">Your saved exam sessions for this study set will appear here.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {history.map((item) => (
                    <Card className="rounded-[1.4rem] border-white/8 bg-white/[0.03] shadow-none" key={item.id}>
                      <CardContent className="space-y-3 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge
                            className={cn(
                              "rounded-full border px-3 py-1 text-[0.72rem]",
                              item.completed
                                ? "border-emerald-400/18 bg-emerald-400/10 text-emerald-100"
                                : "border-amber-300/16 bg-amber-300/10 text-amber-50"
                            )}
                          >
                            {item.completed ? "Completed session" : "In progress session"}
                          </Badge>
                          <span className="text-sm text-zinc-500">{item.turns.length} turns</span>
                        </div>
                        <div className="grid gap-2 text-sm text-zinc-300">
                          <span>{item.completed ? `${item.summary?.averageScore ?? 0}% average score` : "Resume available"}</span>
                          <span>{item.completed ? `${item.summary?.totalQuestions ?? item.turns.length} questions answered` : `${item.totalQuestionsTarget} questions planned`}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <Button
                className="h-11 w-full rounded-full border border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-white/[0.08]"
                onClick={() => navigate(`/study-sets/${studySet.id}`)}
                type="button"
                variant="ghost"
              >
                Return to Study Set
              </Button>
            </CardContent>
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
          <Card className="rounded-[1.9rem] border-white/10 bg-[linear-gradient(180deg,rgba(14,18,28,0.98),rgba(9,11,18,0.98))] shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
            <CardContent className="space-y-5 p-6">
              <div className="space-y-3">
                <Badge className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-100">
                  Live Readout
                </Badge>
                <div className="space-y-2">
                  <h2 className="font-[family-name:var(--font-display)] text-3xl text-white">
                    {latestTurn ? "Latest feedback" : "Session guidance"}
                  </h2>
                  <p className="text-sm leading-7 text-zinc-400">
                    Keep an eye on the latest evaluation and the concepts that still need recovery.
                  </p>
                </div>
              </div>

              {latestTurn ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[0.72rem] text-zinc-100">
                      Score {latestTurn.score}%
                    </Badge>
                    <Badge className="rounded-full border border-white/8 bg-transparent px-3 py-1 text-[0.72rem] text-zinc-400">
                      {latestTurn.classification}
                    </Badge>
                  </div>
                  {[
                    { copy: latestTurn.userAnswer, label: "Your answer" },
                    { copy: latestTurn.feedback, label: "What you should know" },
                    { copy: latestTurn.idealAnswer, label: "Ideal answer" }
                  ].map((item) => (
                    <Card className="rounded-[1.4rem] border-white/8 bg-white/[0.03] shadow-none" key={item.label}>
                      <CardContent className="space-y-3 p-5">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">{item.label}</p>
                        <p className="text-sm leading-7 text-zinc-200">{item.copy}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="rounded-[1.4rem] border-white/8 bg-white/[0.03] shadow-none">
                  <CardContent className="space-y-3 p-5">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-zinc-500">No feedback yet</p>
                    <p className="text-sm leading-7 text-zinc-400">
                      Submit your first answer to see score guidance, ideal phrasing, and recovery signals.
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card className="rounded-[1.4rem] border-white/8 bg-white/[0.03] shadow-none">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-zinc-100">
                      <Radar className="size-[18px]" />
                    </span>
                    <div>
                      <h3 className="font-medium text-white">Current weak topics</h3>
                      <p className="text-sm text-zinc-500">What still needs attention from this session.</p>
                    </div>
                  </div>
                  {completedWeakTopics.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {completedWeakTopics.map((topic) => (
                        <Badge className="rounded-full border border-amber-300/16 bg-amber-300/10 px-3 py-1 text-[0.72rem] text-amber-50" key={topic}>
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm leading-7 text-zinc-400">No weak topics detected yet.</p>
                  )}
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </Reveal>
      </div>
      </section>
    </>
  );
}

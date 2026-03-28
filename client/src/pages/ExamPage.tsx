import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import type { ExamSession, RescueAttempt, StudySet } from "@automated-study-system/shared";

import { StatePanel } from "../components/StatePanel";
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

function MicrophoneIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path
        d="M12 3.5a3 3 0 0 0-3 3V12a3 3 0 1 0 6 0V6.5a3 3 0 0 0-3-3ZM7 10.5a.75.75 0 0 1 .75.75V12a4.25 4.25 0 0 0 8.5 0v-.75a.75.75 0 0 1 1.5 0V12a5.76 5.76 0 0 1-5 5.7V20h2a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h2v-2.3a5.76 5.76 0 0 1-5-5.7v-.75A.75.75 0 0 1 7 10.5Z"
        fill="currentColor"
      />
    </svg>
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
  const answerBeforeRecordingRef = useRef("");
  const [isRescueModeEnabled, setIsRescueModeEnabled] = useState(() =>
    rescueQueryParam === "off" ? false : rescueQueryParam === "on" ? true : readSavedExamRescueMode(id)
  );

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
    const [loadedStudySet, sessions] = await Promise.all([fetchStudySet(id), fetchExamSessions(id)]);
    writeCachedStudySet(loadedStudySet);
    setStudySet(loadedStudySet);
    const existingSession = sessions.find((item) => !item.completed) ?? null;
    const nextSession = existingSession ?? (await saveExamSession(loadedStudySet.id, createExamSession(loadedStudySet)));
    const rescueAttempts = isRescueModeEnabled ? await fetchRescueAttempts(loadedStudySet.id, nextSession.id) : [];
    const nextHistory = existingSession ? sessions : [nextSession, ...sessions];

    setSession(nextSession);
    setHistory(nextHistory);
    setActiveRescue(selectActiveRescueAttempt(rescueAttempts));
    setRescueAnswer("");
    setRescueError(null);
    setIsLoadingHistory(false);
    setError(null);
  }

  async function handleRetryLoad() {
    setIsRetryingLoad(true);
    setStudySet(null);
    setSession(null);
    setActiveRescue(null);
    setRescueAnswer("");
    setRescueError(null);
    setIsLoadingHistory(true);

    try {
      await loadExamPage();
    } catch (requestError) {
      setError(toExamLoadError(requestError instanceof Error ? requestError.message : "Could not load exam."));
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
          setIsLoadingHistory(false);
        }
      });

    return () => {
      ignore = true;
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
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

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        chunksRef.current = [];

        if (!blob.size) {
          setRecordingState("idle");
          setError("No audio was captured. Try recording again.");
          return;
        }

        setRecordingState("processing");
        setRecordingHint("Transcribing your oral answer...");

        try {
          const transcript = await transcribeExamAnswer(blob);
          const mergedAnswer = [answerBeforeRecordingRef.current, transcript.trim()]
            .filter(Boolean)
            .join(answerBeforeRecordingRef.current && transcript.trim() ? "\n" : "");

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

  if (error && !studySet) {
    return (
      <StatePanel
        actions={
          <button
            className="primary-button"
            disabled={isRetryingLoad}
            onClick={() => void handleRetryLoad()}
            type="button"
          >
            {isRetryingLoad ? "Retrying..." : "Try Again"}
          </button>
        }
        copy={error}
        eyebrow="Exam Error"
        title="We couldn’t prepare your oral exam."
        tone="error"
      />
    );
  }

  if (!studySet || !session) {
    return (
      <section className="page-grid loading-page-grid exam-page">
        <article className="panel loading-panel exam-panel">
          <div className="loading-stack">
            <div className="skeleton-line skeleton-short" />
            <div className="skeleton-line loading-heading-line" />
            <div className="skeleton-line loading-subtle-line" />
            <div className="loading-card-block">
              <div className="skeleton-line loading-card-title-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line loading-subtle-line" />
            </div>
            <div className="loading-card-block">
              <div className="skeleton-line loading-card-title-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line loading-subtle-line" />
            </div>
          </div>
        </article>

        <article className="panel loading-panel">
          <div className="loading-stack">
            <div className="skeleton-line loading-heading-line" />
            <div className="loading-card-block">
              <div className="skeleton-line loading-card-title-line" />
              <div className="skeleton-line loading-subtle-line" />
              <div className="skeleton-line loading-subtle-line" />
            </div>
            <div className="loading-card-block">
              <div className="skeleton-line loading-card-title-line" />
              <div className="skeleton-line loading-subtle-line" />
              <div className="skeleton-line loading-subtle-line" />
            </div>
          </div>
        </article>
      </section>
    );
  }

  const latestTurn = session.turns.at(-1);
  const completedWeakTopics = session.summary?.weakTopics ?? session.weakTopics;
  const reviewConcept = completedWeakTopics[0];

  return (
    <section className="page-grid exam-page">
      <article className={activeRescue && activeRescue.status !== "recovered" ? "panel exam-panel is-rescue-active" : "panel exam-panel"}>
        <div className="section-header">
          <div>
            <p className="eyebrow">Adaptive Oral Exam</p>
            <h1>{studySet.title}</h1>
          </div>
          <Link className="secondary-button" to={`/study-sets/${studySet.id}`}>
            Back to Set
          </Link>
        </div>

        {session.completed ? (
          <section className="result-block">
            <h2>Session Complete</h2>
            <p className="muted">{isRescueModeEnabled ? "Rescue Mode was enabled for this session." : "Rescue Mode was turned off for this session."}</p>
            <p className="muted">
              Average score: {session.summary?.averageScore ?? 0}% across {session.summary?.totalQuestions ?? 0} questions.
            </p>
            <section className="result-block exam-summary-block">
              <h3>Current Weak Topics</h3>
              {completedWeakTopics.length > 0 ? (
                <div className="chip-row">
                  {completedWeakTopics.map((topic) => (
                    <span className="chip" key={topic}>
                      {topic}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="muted">No weak topics were detected in this session.</p>
              )}
            </section>
            <div className="chip-row exam-summary-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => void handleRestartExam()}
              >
                {isRestarting ? "Restarting..." : "Retake Test"}
              </button>
              <button
                className="secondary-button"
                disabled={!reviewConcept}
                type="button"
                onClick={() =>
                  navigate(`/study-sets/${studySet.id}`, {
                    state: reviewConcept ? { focusConcept: reviewConcept } : undefined
                  })
                }
              >
                Review Current Weak Topics
              </button>
            </div>
          </section>
        ) : (
          <>
            <p className="muted">{progressLabel}</p>
            <div className="chip-row exam-mode-row">
              <span className={isRescueModeEnabled ? "exam-mode-chip is-active" : "exam-mode-chip"}>
                {isRescueModeEnabled ? "Rescue Mode Active" : "Rescue Mode Off"}
              </span>
            </div>
            {isLoadingRescue ? (
              <section className="rescue-panel rescue-panel-loading">
                <p className="eyebrow">Rescue Mode</p>
                <h3>Preparing your recovery step.</h3>
                <p className="muted">We’re building a focused explanation before you move to the next exam question.</p>
              </section>
            ) : null}

            {activeRescue ? (
              <section className="rescue-panel">
                <div className="section-header rescue-panel-header">
                  <div>
                    <p className="eyebrow rescue-mode-kicker">Rescue Mode Active</p>
                    <h3>{activeRescue.status === "recovered" ? "Concept recovered." : `Let’s fix ${activeRescue.concept}.`}</h3>
                    <p className="rescue-mode-copy">
                      {activeRescue.status === "recovered"
                        ? "You’re back on track. Continue when you’re ready."
                        : "Let’s fix this before continuing with the next exam question."}
                    </p>
                  </div>
                  {activeRescue.status === "recovered" ? (
                    <button
                      className="secondary-button compact-button"
                      onClick={() => {
                        setActiveRescue(null);
                        setRescueAnswer("");
                        setRescueError(null);
                      }}
                      type="button"
                    >
                      Continue Exam
                    </button>
                  ) : null}
                </div>

                <article className="rescue-flow-card">
                  <div className="rescue-flow-section">
                    <p className="flashcard-label">What went wrong</p>
                    <p>{activeRescue.diagnosis}</p>
                  </div>
                  <div className="rescue-flow-section">
                    <p className="flashcard-label">Quick fix</p>
                    <p>{activeRescue.microLesson}</p>
                  </div>
                  {activeRescue.sourceSupport ? (
                    <div className="rescue-flow-section rescue-flow-support">
                      <p className="flashcard-label">From your notes</p>
                      <p>{activeRescue.sourceSupport}</p>
                    </div>
                  ) : null}
                </article>

                {activeRescue.retryFeedback ? (
                  <article className="rescue-block rescue-feedback-block">
                    <p className="flashcard-label">
                      {activeRescue.status === "recovered" ? "Recovered" : "Still Needs Work"}
                    </p>
                    <p>{activeRescue.retryFeedback}</p>
                    {typeof activeRescue.retryScore === "number" ? (
                      <p className="muted small-copy">Retry score: {activeRescue.retryScore}%</p>
                    ) : null}
                  </article>
                ) : null}

                {activeRescue.status !== "recovered" ? (
                  <div className="field rescue-form">
                    <label htmlFor="rescue-answer">{activeRescue.retryQuestion.prompt}</label>
                    <p className="muted small-copy rescue-retry-cue">Try again now to lock it in before moving on.</p>
                    <textarea
                      id="rescue-answer"
                      rows={5}
                      value={rescueAnswer}
                      placeholder="Try the concept again in your own words."
                      onChange={(event) => setRescueAnswer(event.target.value)}
                    />
                    <div className="state-panel-actions">
                      <button
                        className="primary-button"
                        disabled={isSubmittingRescue || !rescueAnswer.trim()}
                        onClick={() => void handleRescueRetry()}
                        type="button"
                      >
                        {isSubmittingRescue ? "Checking..." : "Try Again"}
                      </button>
                      <button
                        className="secondary-button compact-button"
                        onClick={() => {
                          setActiveRescue(null);
                          setRescueAnswer("");
                          setRescueError(null);
                        }}
                        type="button"
                      >
                        Continue Exam
                      </button>
                    </div>
                    {rescueError ? <p className="error-text">{rescueError}</p> : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            <article className="exam-question-card">
              <div className="exam-question-topline">
                <p className="flashcard-label">Current Question</p>
                <span className="exam-question-progress-chip">Question {currentQuestionNumber} of {session.totalQuestionsTarget}</span>
              </div>
              <h2>{session.currentQuestion.prompt}</h2>
              {session.currentQuestion.focusTopic ? (
                <p className="muted exam-question-focus">Focus topic: {session.currentQuestion.focusTopic}</p>
              ) : null}
            </article>

            <form className={activeRescue && activeRescue.status !== "recovered" ? "field exam-answer-form is-muted" : "field exam-answer-form"} onSubmit={handleSubmit}>
              <label htmlFor="exam-answer">Your Answer</label>
              {recordingHint ? <p className="muted small-copy exam-audio-hint">{recordingHint}</p> : null}
              <div className="exam-answer-wrap">
                <textarea
                  disabled={isSubmitting || recordingState === "processing" || isLoadingRescue || (activeRescue !== null && activeRescue.status !== "recovered")}
                  id="exam-answer"
                  rows={8}
                  value={answer}
                  placeholder="Explain in your own words, or use the microphone to record an oral response."
                  onChange={(event) => setAnswer(event.target.value)}
                />
                <button
                  aria-label={
                    recordingState === "recording"
                      ? "Stop recording oral answer"
                      : recordingState === "processing"
                        ? "Transcribing oral answer"
                        : "Record oral answer"
                  }
                  className={
                    recordingState === "recording"
                      ? "exam-mic-button is-recording"
                      : recordingState === "processing"
                        ? "exam-mic-button is-processing"
                        : "exam-mic-button"
                  }
                  disabled={
                    recordingState === "processing" ||
                    isSubmitting ||
                    isLoadingRescue ||
                    (activeRescue !== null && activeRescue.status !== "recovered")
                  }
                  onClick={handleMicrophoneClick}
                  type="button"
                >
                  <MicrophoneIcon />
                </button>
              </div>
              <button
                className="primary-button"
                type="submit"
                disabled={isSubmitting || isLoadingRescue || (activeRescue !== null && activeRescue.status !== "recovered")}
              >
                {isSubmitting ? "Scoring..." : "Submit Answer"}
              </button>
            </form>
          </>
        )}

        {error ? (
          <div className="inline-feedback-block">
            <p className="error-text">{error}</p>
            {!session.completed && answer.trim() ? (
              <div className="state-panel-actions">
                <button className="secondary-button compact-button" disabled={isSubmitting} onClick={() => setError(null)} type="button">
                  Keep Editing
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {latestTurn ? (
          <section className="feedback-panel">
            <h3>Latest Feedback</h3>
            <p className="muted">Score: {latestTurn.score}% • {latestTurn.classification}</p>
            <div className="feedback-flow">
              <article className="feedback-block">
                <p className="flashcard-label">Your answer</p>
                <p>{latestTurn.userAnswer}</p>
              </article>
              <article className="feedback-block">
                <p className="flashcard-label">What you should know</p>
                <p>{latestTurn.feedback}</p>
              </article>
              <article className="feedback-block feedback-block-ideal">
                <p className="flashcard-label">Ideal answer</p>
                <p>{latestTurn.idealAnswer}</p>
              </article>
            </div>
          </section>
        ) : null}
      </article>

      <article className="panel exam-history-panel">
        <h2>Past Exam Sessions</h2>
        {isLoadingHistory ? (
          <p className="muted">Loading exam history...</p>
        ) : history.length === 0 ? (
          <p className="muted">Your saved exam sessions for this study set will appear here.</p>
        ) : (
          <div className="recent-list">
            {history.map((item) => (
              <article className="recent-item exam-history-card" key={item.id}>
                <strong>{item.completed ? "Completed Session" : "In Progress Session"}</strong>
                <span>{item.turns.length} turns</span>
                <span>{item.completed ? `${item.summary?.averageScore ?? 0}% avg` : "Resume available"}</span>
              </article>
            ))}
          </div>
        )}

        <button className="secondary-button" onClick={() => navigate(`/study-sets/${studySet.id}`)} type="button">
          Return to Study Set
        </button>
      </article>
    </section>
  );
}

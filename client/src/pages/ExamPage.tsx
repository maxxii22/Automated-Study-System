import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { ExamSession, StudySet } from "@automated-study-system/shared";

import {
  applyExamTurnResult,
  createExamSession,
  evaluateExamTurn,
  fetchStudySet,
  getExamSession,
  listExamSessions,
  saveExamSession,
  transcribeExamAnswer
} from "../lib/api";

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
  const navigate = useNavigate();
  const [studySet, setStudySet] = useState<StudySet | null>(null);
  const [session, setSession] = useState<ExamSession | null>(null);
  const [history, setHistory] = useState<ExamSession[]>([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "processing">("idle");
  const [recordingHint, setRecordingHint] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const answerBeforeRecordingRef = useRef("");

  useEffect(() => {
    let ignore = false;

    fetchStudySet(id)
      .then((loadedStudySet) => {
        if (ignore) {
          return;
        }

        setStudySet(loadedStudySet);
        const existingSession = getExamSession(loadedStudySet.id);
        const nextSession = existingSession ?? createExamSession(loadedStudySet);
        saveExamSession(nextSession);
        setSession(nextSession);
        setHistory(listExamSessions(loadedStudySet.id));
      })
      .catch((requestError) => {
        if (!ignore) {
          setError(requestError instanceof Error ? requestError.message : "Could not load exam.");
        }
      });

    return () => {
      ignore = true;
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [id]);

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

    return `Question ${Math.min(session.turns.length + 1, session.totalQuestionsTarget)} of ${session.totalQuestionsTarget}`;
  }, [session]);

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

      saveExamSession(updatedSession);
      setSession(updatedSession);
      setHistory(listExamSessions(studySet.id));
      setAnswer("");
      setRecordingHint("Use the microphone to record your oral answer, then submit it for scoring.");
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
    return <section className="panel">{error}</section>;
  }

  if (!studySet || !session) {
    return <section className="panel">Preparing adaptive oral exam...</section>;
  }

  const latestTurn = session.turns.at(-1);
  const completedWeakTopics = session.summary?.weakTopics ?? session.weakTopics;
  const reviewConcept = completedWeakTopics[0];

  return (
    <section className="page-grid exam-page">
      <article className="panel exam-panel">
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
                onClick={() => {
                  const restarted = createExamSession(studySet);
                  saveExamSession(restarted);
                  setSession(restarted);
                  setHistory(listExamSessions(studySet.id));
                  setAnswer("");
                  setError(null);
                  setRecordingHint("Use the microphone to record your oral answer, then submit it for scoring.");
                }}
              >
                Retake Test
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
            <article className="exam-question-card">
              <p className="flashcard-label">Current Question</p>
              <h2>{session.currentQuestion.prompt}</h2>
              {session.currentQuestion.focusTopic ? (
                <p className="muted">Focus topic: {session.currentQuestion.focusTopic}</p>
              ) : null}
            </article>

            <form className="field" onSubmit={handleSubmit}>
              <label htmlFor="exam-answer">Your Answer</label>
              {recordingHint ? <p className="muted small-copy exam-audio-hint">{recordingHint}</p> : null}
              <div className="exam-answer-wrap">
                <textarea
                  id="exam-answer"
                  rows={8}
                  value={answer}
                  placeholder="Type your answer, or use the microphone to record an oral response."
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
                  disabled={recordingState === "processing"}
                  onClick={handleMicrophoneClick}
                  type="button"
                >
                  <MicrophoneIcon />
                </button>
              </div>
              <button className="primary-button" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Scoring..." : "Submit Answer"}
              </button>
            </form>
          </>
        )}

        {error ? <p className="error-text">{error}</p> : null}

        {latestTurn ? (
          <section className="feedback-panel">
            <h3>Latest Feedback</h3>
            <p className="muted">Score: {latestTurn.score}% • {latestTurn.classification}</p>
            <p>{latestTurn.feedback}</p>
            <p className="flashcard-label">Ideal Answer</p>
            <p>{latestTurn.idealAnswer}</p>
          </section>
        ) : null}
      </article>

      <article className="panel">
        <h2>Past Exam Sessions</h2>
        {history.length === 0 ? (
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

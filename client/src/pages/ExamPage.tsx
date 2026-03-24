import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { ExamSession, StudySet } from "@automated-study-system/shared";

import {
  applyExamTurnResult,
  createExamSession,
  evaluateExamTurn,
  fetchStudySet,
  getExamSession,
  listExamSessions,
  saveExamSession
} from "../lib/api";

export function ExamPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [studySet, setStudySet] = useState<StudySet | null>(null);
  const [session, setSession] = useState<ExamSession | null>(null);
  const [history, setHistory] = useState<ExamSession[]>([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    };
  }, [id]);

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
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not evaluate answer.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (error && !studySet) {
    return <section className="panel">{error}</section>;
  }

  if (!studySet || !session) {
    return <section className="panel">Preparing adaptive oral exam...</section>;
  }

  const latestTurn = session.turns.at(-1);

  return (
    <section className="page-grid exam-page">
      <article className="panel exam-panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">Adaptive Oral Exam</p>
            <h1>{studySet.title}</h1>
          </div>
          <Link className="nav-link" to={`/study-sets/${studySet.id}`}>
            Back to Set
          </Link>
        </div>

        {session.completed ? (
          <section className="result-block">
            <h2>Session Complete</h2>
            <p className="muted">
              Average score: {session.summary?.averageScore ?? 0}% across {session.summary?.totalQuestions ?? 0} questions.
            </p>
            <div className="chip-row">
              {(session.summary?.weakTopics ?? []).map((topic) => (
                <span className="chip" key={topic}>
                  {topic}
                </span>
              ))}
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                const restarted = createExamSession(studySet);
                saveExamSession(restarted);
                setSession(restarted);
                setHistory(listExamSessions(studySet.id));
                setAnswer("");
              }}
            >
              Start New Session
            </button>
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
              <textarea
                id="exam-answer"
                rows={8}
                value={answer}
                placeholder="Type your answer as if you were responding in an oral exam."
                onChange={(event) => setAnswer(event.target.value)}
              />
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

        <section className="result-block">
          <h3>Current Weak Topics</h3>
          <div className="chip-row">
            {(session.weakTopics.length > 0 ? session.weakTopics : studySet.keyConcepts.slice(0, 3)).map((topic) => (
              <span className="chip" key={topic}>
                {topic}
              </span>
            ))}
          </div>
        </section>

        <button className="nav-link" onClick={() => navigate(`/study-sets/${studySet.id}`)} type="button">
          Return to Study Set
        </button>
      </article>
    </section>
  );
}

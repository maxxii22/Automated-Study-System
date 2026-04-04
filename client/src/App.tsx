import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { ErrorBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { RouteLoadingState } from "./components/RouteLoadingState";
import {
  loadAuthPage,
  loadCreateStudySetPage,
  loadExamPage,
  loadHomePage,
  loadSavedStudySetsPage,
  loadStudySetPage
} from "./lib/routePreload";

const HomePage = lazy(async () => ({
  default: (await loadHomePage()).HomePage
}));

const AuthPage = lazy(async () => ({
  default: (await loadAuthPage()).AuthPage
}));

const CreateStudySetPage = lazy(async () => ({
  default: (await loadCreateStudySetPage()).CreateStudySetPage
}));

const SavedStudySetsPage = lazy(async () => ({
  default: (await loadSavedStudySetsPage()).SavedStudySetsPage
}));

const StudySetPage = lazy(async () => ({
  default: (await loadStudySetPage()).StudySetPage
}));

const ExamPage = lazy(async () => ({
  default: (await loadExamPage()).ExamPage
}));

export function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <Suspense fallback={<RouteLoadingState />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/create" element={<CreateStudySetPage />} />
              <Route path="/saved" element={<SavedStudySetsPage />} />
              <Route path="/study-sets/:id" element={<StudySetPage />} />
              <Route path="/study-sets/:id/exam" element={<ExamPage />} />
            </Route>
            <Route path="*" element={<Navigate replace to="/" />} />
          </Routes>
        </Suspense>
      </Layout>
    </ErrorBoundary>
  );
}

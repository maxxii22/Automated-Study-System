import { Route, Routes } from "react-router-dom";

import { ErrorBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { AuthPage } from "./pages/AuthPage";
import { ExamPage } from "./pages/ExamPage";
import { CreateStudySetPage } from "./pages/CreateStudySetPage";
import { HomePage } from "./pages/HomePage";
import { SavedStudySetsPage } from "./pages/SavedStudySetsPage";
import { StudySetPage } from "./pages/StudySetPage";

export function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/create" element={<CreateStudySetPage />} />
            <Route path="/saved" element={<SavedStudySetsPage />} />
            <Route path="/study-sets/:id" element={<StudySetPage />} />
            <Route path="/study-sets/:id/exam" element={<ExamPage />} />
          </Route>
        </Routes>
      </Layout>
    </ErrorBoundary>
  );
}

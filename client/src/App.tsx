import { Route, Routes } from "react-router-dom";

import { ErrorBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
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
          <Route path="/create" element={<CreateStudySetPage />} />
          <Route path="/saved" element={<SavedStudySetsPage />} />
          <Route path="/study-sets/:id" element={<StudySetPage />} />
          <Route path="/study-sets/:id/exam" element={<ExamPage />} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  );
}

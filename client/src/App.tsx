import { Route, Routes } from "react-router-dom";

import { ErrorBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import { CreateStudySetPage } from "./pages/CreateStudySetPage";
import { HomePage } from "./pages/HomePage";
import { StudySetPage } from "./pages/StudySetPage";

export function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/create" element={<CreateStudySetPage />} />
          <Route path="/study-sets/:id" element={<StudySetPage />} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  );
}

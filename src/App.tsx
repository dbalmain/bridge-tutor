import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { MistakesPage } from "./pages/MistakesPage";
import { PlayLesson } from "./pages/PlayLesson";
import { ProgressPage } from "./pages/ProgressPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="play/:lessonId" element={<PlayLesson />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="mistakes" element={<MistakesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

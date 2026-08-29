import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { BidCourse } from "./pages/BidCourse";
import { BidLesson } from "./pages/BidLesson";
import { DrillPage } from "./pages/DrillPage";
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
          <Route path="bid" element={<BidCourse />} />
          <Route path="bid/:lessonId" element={<BidLesson />} />
          <Route path="drill" element={<DrillPage />} />
          <Route path="play/:lessonId" element={<PlayLesson />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="mistakes" element={<MistakesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

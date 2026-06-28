import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Watch from "./pages/Watch";
import MovieHome from "./pages/MovieHome";
import MovieWatch from "./pages/MovieWatch";
import NotFound from "./pages/NotFound";
import ToastContainer from "./components/Toast";
import { rehydrateReminders } from "./hooks/useMatchReminder";

// Re-schedule any stored reminders on every app boot
rehydrateReminders();

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/watch/:matchId" element={<Watch />} />
        <Route path="/movies" element={<MovieHome />} />
        <Route path="/movies/watch/:type/:tmdbId" element={<MovieWatch />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <ToastContainer />
    </>
  );
}

import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Watch from "./pages/Watch";
import MovieHome from "./pages/MovieHome";
import MovieWatch from "./pages/MovieWatch";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/watch/:matchId" element={<Watch />} />
      <Route path="/movies" element={<MovieHome />} />
      <Route path="/movies/watch/:type/:tmdbId" element={<MovieWatch />} />
    </Routes>
  );
}

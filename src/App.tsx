import { Routes, Route, useLocation } from "react-router-dom";

import Header from "./components/headerfooter/Header";
import Footer from "./components/headerfooter/Footer";

import LandingPage from "./pages/LandingPage";
import SingleFilePage from "./pages/SingleFilePage";
import ComparePage from "./pages/ComparePage";
import ProjectView from "./pages/ProjectPage";
import ViewerHost from "./components/projectPage/ViewerHost";

const App = () => {
  const location = useLocation();
  const isViewerRoute = location.pathname === "/viewer";

  return (
    <div className="flex min-h-screen flex-col">
      {/* Global header (with hamburger) on every page EXCEPT /viewer */}
      {!isViewerRoute && <Header />}

      {/* Main content wrapper */}
      <div
        className={
          !isViewerRoute
            ? "flex flex-1 flex-col items-stretch px-0 pt-[110px]"
            : ""
        }
      >
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/visualizer" element={<SingleFilePage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/projects" element={<ProjectView />} />

          {/* This route is only used inside the modal iframe */}
          <Route path="/viewer" element={<ViewerHost />} />
        </Routes>
      </div>

      {/* Global footer on every page EXCEPT /viewer */}
      {!isViewerRoute && <Footer />}
    </div>
  );
};

export default App;

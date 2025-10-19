/*import components*/
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import SingleFilePage from "./pages/SingleFilePage";
import ComparePage from "./pages/ComparePage";
import ProjectView from "./pages/ProjectPage";
import ViewerHost from "./components/projectPage/ViewerHost";

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/visualizer" element={<SingleFilePage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/projects" element={<ProjectView />} />
        <Route path="/viewer" element={<ViewerHost />} />
      </Routes>
    </Router>
  );
};

export default App;

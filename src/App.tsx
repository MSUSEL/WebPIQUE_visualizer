/*import components*/
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import SingleFilePage from './pages/SingleFilePage';
import ComparePage from './pages/ComparePage';

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/visualizer" element={<SingleFilePage />} />
        <Route path="/compare" element={<ComparePage />} />
      </Routes>
    </Router>
  );
};

export default App;


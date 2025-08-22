/*import components*/
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import SingleFileVisualizer from './pages/SingleFileVisualizer';
import Compare from './pages/Compare';

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/visualizer" element={<SingleFileVisualizer />} />
        <Route path="/compare" element={<Compare />} />
      </Routes>
    </Router>
  );
};

export default App;

